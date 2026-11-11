
'use strict';

require('dotenv').config();

const express = require('express');
const { randomUUID } = require('node:crypto');

const {
  DynamoDBClient
} = require('@aws-sdk/client-dynamodb');

const {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand
} = require('@aws-sdk/lib-dynamodb');

const {
  SFNClient,
  StartExecutionCommand
} = require('@aws-sdk/client-sfn');

const {
  autenticar,
  permitirRoles
} = require('./auth-cognito');

const app = express();

app.disable('x-powered-by');

// ==========================================
// CONFIGURACIÓN GENERAL
// ==========================================

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const REGION = process.env.AWS_REGION || 'us-east-2';

const TABLA =
  process.env.DYNAMODB_TABLE ||
  process.env.TABLA_SOLICITUDES ||
  'g7-dev-solicitudes';

const STATE_MACHINE_ARN =
  process.env.STATE_MACHINE_ARN;

if (!STATE_MACHINE_ARN) {
  throw new Error(
    'Falta STATE_MACHINE_ARN en backend/.env'
  );
}

// ==========================================
// CONFIGURACIÓN CORS
// ==========================================

const origenes = new Set(
  (
    process.env.FRONTEND_ORIGINS ||
    'http://localhost:3001,http://127.0.0.1:3001'
  )
    .split(',')
    .map(origen => origen.trim())
    .filter(Boolean)
);

app.use((req, res, next) => {
  const origen = req.get('Origin');

  if (origen && origenes.has(origen)) {
    res.setHeader(
      'Access-Control-Allow-Origin',
      origen
    );

    res.setHeader('Vary', 'Origin');

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PATCH,OPTIONS'
    );

    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,Accept'
    );
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(
      origen && !origenes.has(origen) ? 403 : 204
    );
  }

  next();
});

app.use(express.json({ limit: '100kb' }));

// ==========================================
// CLIENTES AWS
// ==========================================

const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: REGION,
    maxAttempts: 3
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true
    }
  }
);

const sfn = new SFNClient({
  region: REGION,
  maxAttempts: 3
});

// ==========================================
// VALIDACIÓN DE TEXTO
// ==========================================

function texto(valor, maximo) {
  if (typeof valor !== 'string') {
    return null;
  }

  const limpio = valor.trim();

  return limpio.length > 0 &&
    limpio.length <= maximo
    ? limpio
    : null;
}

// ==========================================
// VALIDACIÓN DE DINERO
// ==========================================

function dineroEnCentavos(valor) {
  if (
    typeof valor !== 'string' &&
    typeof valor !== 'number'
  ) {
    return null;
  }

  if (
    typeof valor === 'string' &&
    !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(
      valor.trim()
    )
  ) {
    return null;
  }

  const numero = Number(valor);

  if (
    !Number.isFinite(numero) ||
    numero <= 0 ||
    numero > 10000000
  ) {
    return null;
  }

  const centavos = Math.round(numero * 100);

  if (
    !Number.isSafeInteger(centavos) ||
    Math.abs(numero * 100 - centavos) >= 0.000001
  ) {
    return null;
  }

  return centavos;
}

// ==========================================
// VALIDACIÓN DE ARTÍCULOS
// ==========================================

function validarArticulos(valor) {
  if (
    !Array.isArray(valor) ||
    valor.length < 1 ||
    valor.length > 50
  ) {
    return null;
  }

  const articulos = [];
  let totalCentavos = 0;

  for (const item of valor) {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item)
    ) {
      return null;
    }

    const nombre = texto(item.nombre, 200);

    const cantidad =
      typeof item.cantidad === 'string' &&
      /^[1-9]\d*$/.test(item.cantidad.trim())
        ? Number(item.cantidad.trim())
        : item.cantidad;

    const precioCentavos = dineroEnCentavos(
      item.precioUnitario ?? item.precio
    );

    if (
      !nombre ||
      typeof cantidad !== 'number' ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > 10000 ||
      precioCentavos === null
    ) {
      return null;
    }

    const subtotalCentavos =
      cantidad * precioCentavos;

    if (!Number.isSafeInteger(subtotalCentavos)) {
      return null;
    }

    // Si el frontend envía subtotal,
    // verificamos que coincida.
    if (item.subtotal !== undefined) {
      const subtotalEnviado = dineroEnCentavos(
        item.subtotal
      );

      if (subtotalEnviado !== subtotalCentavos) {
        return null;
      }
    }

    totalCentavos += subtotalCentavos;

    if (
      !Number.isSafeInteger(totalCentavos) ||
      totalCentavos > 1000000000
    ) {
      return null;
    }

    articulos.push({
      nombre,
      cantidad,
      precioUnitario: precioCentavos / 100,
      subtotal: subtotalCentavos / 100
    });
  }

  return {
    articulos,
    totalCentavos
  };
}

// ==========================================
// CURSOR DE PAGINACIÓN
// ==========================================

function codificarCursor(clave) {
  if (!clave) {
    return null;
  }

  return Buffer.from(
    JSON.stringify(clave),
    'utf8'
  ).toString('base64url');
}

function decodificarCursor(cursor) {
  if (
    typeof cursor !== 'string' ||
    cursor.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw new Error('Cursor inválido');
  }

  const raw = Buffer.from(cursor, 'base64url');

  if (raw.toString('base64url') !== cursor) {
    throw new Error('Cursor inválido');
  }

  const clave = JSON.parse(raw.toString('utf8'));

  if (
    !clave ||
    typeof clave !== 'object' ||
    Array.isArray(clave) ||
    Object.keys(clave).length !== 1 ||
    typeof clave.requestId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(clave.requestId)
  ) {
    throw new Error('Cursor inválido');
  }

  return clave;
}

// ==========================================
// PERMISOS PARA CONSULTAR SOLICITUDES
// ==========================================

function puedeVer(solicitud, usuario) {
  // Compras puede consultar todas las solicitudes.
  if (usuario.roles.includes('Compras')) {
    return true;
  }

  const email = String(
    solicitud.applicant || ''
  ).trim().toLowerCase();

  // Solicitante solamente consulta sus compras.
  if (
    usuario.roles.includes('Solicitante') &&
    email &&
    email === usuario.email
  ) {
    return true;
  }

  const monto = Number(solicitud.amount);

  if (
    !Number.isFinite(monto) ||
    monto <= 0
  ) {
    return false;
  }

  // Reglas oficiales del Grupo 7.
  if (
    usuario.roles.includes('Gerente') &&
    monto <= 1000
  ) {
    return true;
  }

  if (
    usuario.roles.includes('Director') &&
    monto > 1000
  ) {
    return true;
  }

  return false;
}

// ==========================================
// FILTRADO POR ROL EN DYNAMODB
// ==========================================


function filtroUsuario(usuario) {
  // El departamento de Compras puede consultar
  // todas las solicitudes.
  if (usuario.roles.includes('Compras')) {
    return {};
  }

  const reglas = [];
  const nombres = {};
  const valores = {};

  // SOLICITANTE: solamente sus solicitudes.
  if (usuario.roles.includes('Solicitante')) {
    reglas.push('#applicant = :email');

    nombres['#applicant'] = 'applicant';
    valores[':email'] = usuario.email;
  }

  // GERENTE: solicitudes hasta $1,000.
  if (usuario.roles.includes('Gerente')) {
    reglas.push(
      '#amount > :cero AND #amount <= :limite'
    );

    nombres['#amount'] = 'amount';
    valores[':cero'] = 0;
    valores[':limite'] = 1000;
  }

  // DIRECTOR: solicitudes mayores a $1,000.
  if (usuario.roles.includes('Director')) {
    reglas.push('#amount > :limite');

    nombres['#amount'] = 'amount';
    valores[':limite'] = 1000;
  }

  // No generar una expresión vacía.
  if (reglas.length === 0) {
    throw new Error(
      'El usuario no tiene permisos de consulta'
    );
  }

  // Evitar paréntesis innecesarios.
  // Solo agrupar condiciones AND cuando
  // existen varias reglas conectadas con OR.
  const expresion =
    reglas.length === 1
      ? reglas[0]
      : reglas
          .map(regla =>
            regla.includes(' AND ')
              ? `(${regla})`
              : regla
          )
          .join(' OR ');

  return {
    FilterExpression: expresion,
    ExpressionAttributeNames: nombres,
    ExpressionAttributeValues: valores
  };
}


// ==========================================
// GET /health
// ==========================================

app.get('/health', (req, res) => {
  return res.status(200).json({
    mensaje: 'Backend del Grupo 7 funcionando',
    estado: 'OK'
  });
});

// ==========================================
// GET /api/auth/me
// ==========================================

app.get(
  '/api/auth/me',
  autenticar,
  (req, res) => {
    return res.status(200).json({
      success: true,
      usuario: req.usuario
    });
  }
);

// ==========================================
// GET /api/aws/verificar
// ==========================================

app.get(
  '/api/aws/verificar',
  autenticar,
  permitirRoles('Gerente', 'Director'),
  async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.sendStatus(404);
    }

    try {
      const resultado = await db.send(
        new ScanCommand({
          TableName: TABLA,
          Limit: 1
        })
      );

      return res.status(200).json({
        mensaje: 'Conexión AWS correcta',
        tabla: TABLA,
        region: REGION,
        registrosRecibidos:
          (resultado.Items || []).length
      });

    } catch (error) {
      console.error(
        'Error verificando AWS:',
        error.name
      );

      return res.status(500).json({
        success: false,
        mensaje: 'No se pudo verificar DynamoDB'
      });
    }
  }
);

// ==========================================
// POST /api/solicitudes
// ==========================================

app.post(
  '/api/solicitudes',
  autenticar,
  permitirRoles('Solicitante'),
  async (req, res) => {
    const body = req.body || {};

    const description = texto(
      body.descripcion ?? body.description,
      1000
    );

    const department = texto(
      body.departamento ?? body.department,
      100
    );

    const amountCentavos = dineroEnCentavos(
      body.monto ?? body.amount
    );

    const proveedorId = texto(
      body.proveedorId,
      100
    );

    const detalle = validarArticulos(
      body.articulos ?? body.items
    );

    if (
      !description ||
      !department ||
      amountCentavos === null ||
      !detalle ||
      !proveedorId ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(proveedorId)
    ) {
      return res.status(400).json({
        success: false,
        mensaje:
          'Se requieren descripcion, departamento, monto, articulos y proveedorId válidos'
      });
    }

    if (detalle.totalCentavos !== amountCentavos) {
      return res.status(400).json({
        success: false,
        mensaje:
          'Monto distinto a la suma de artículos'
      });
    }

    const amount = amountCentavos / 100;
    const requestId = `REQ-${randomUUID()}`;

    const payload = {
      requestId,
      amount,

      // El solicitante viene de Cognito.
      applicant: req.usuario.email,

      department,
      description,
      articulos: detalle.articulos,
      proveedorId,

      requiereAprobacionDe:
        amount <= 1000 ? 'Gerente' : 'Director'
    };

    try {
      // La Lambda de Héctor crea el registro
      // PENDING en DynamoDB.
      const ejecucion = await sfn.send(
        new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          name: `exec-${requestId}`,
          input: JSON.stringify(payload)
        })
      );

      return res.status(202).json({
        success: true,
        mensaje:
          'Solicitud enviada; aprobación humana pendiente',
        requestId,
        executionArn: ejecucion.executionArn,
        startDate: ejecucion.startDate
      });

    } catch (error) {
      console.error(
        'Error iniciando Step Functions:',
        error.name
      );

      return res.status(500).json({
        success: false,
        mensaje: 'No se pudo iniciar el flujo'
      });
    }
  }
);

// ==========================================
// GET /api/solicitudes
// ==========================================

app.get(
  '/api/solicitudes',
  autenticar,
  async (req, res) => {
    const limite = Number(req.query.limit ?? 20);

    if (
      !Number.isInteger(limite) ||
      limite < 1 ||
      limite > 100
    ) {
      return res.status(400).json({
        success: false,
        mensaje:
          'limit debe ser un entero entre 1 y 100'
      });
    }

    let siguiente;

    try {
      siguiente =
        req.query.cursor === undefined
          ? undefined
          : decodificarCursor(req.query.cursor);

    } catch {
      return res.status(400).json({
        success: false,
        mensaje: 'Cursor inválido'
      });
    }

    const solicitudes = [];

    try {
      // Scan temporal hasta disponer de
      // índices DynamoDB para Query.
      //
      // DynamoDB filtra después de evaluar Limit.
      // Se recorren hasta cinco páginas por petición
      // para reducir resultados vacíos.
      for (
        let intento = 0;
        intento < 5 && solicitudes.length < limite;
        intento++
      ) {
        const resultado = await db.send(
          new ScanCommand({
            TableName: TABLA,
            Limit: limite - solicitudes.length,

            ...(siguiente
              ? { ExclusiveStartKey: siguiente }
              : {}),

            ...filtroUsuario(req.usuario)
          })
        );

        solicitudes.push(
          ...(resultado.Items || []).filter(
            item => puedeVer(item, req.usuario)
          )
        );

        siguiente = resultado.LastEvaluatedKey;

        if (!siguiente) {
          break;
        }
      }

      return res.status(200).json({
        total: solicitudes.length,
        solicitudes,
        hayMasRegistros: Boolean(siguiente),
        siguienteCursor: codificarCursor(siguiente)
      });

    } catch (error) {
      console.error(
        'Error listando solicitudes:',
        error.name
      );

      return res.status(500).json({
        success: false,
        mensaje: 'No se pudieron listar solicitudes'
      });
    }
  }
);

// ==========================================
// GET /api/solicitudes/:id
// ==========================================

app.get(
  '/api/solicitudes/:id',
  autenticar,
  async (req, res) => {
    const requestId = req.params.id;

    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)
    ) {
      return res.status(400).json({
        success: false,
        mensaje: 'ID inválido'
      });
    }

    try {
      const resultado = await db.send(
        new GetCommand({
          TableName: TABLA,
          Key: { requestId },
          ConsistentRead: true
        })
      );

      if (
        !resultado.Item ||
        !puedeVer(resultado.Item, req.usuario)
      ) {
        return res.status(404).json({
          success: false,
          mensaje: 'Solicitud no encontrada'
        });
      }

      return res.status(200).json({
        success: true,
        solicitud: resultado.Item
      });

    } catch (error) {
      console.error(
        'Error buscando solicitud:',
        error.name
      );

      return res.status(500).json({
        success: false,
        mensaje:
          'No se pudo consultar la solicitud'
      });
    }
  }
);

// ==========================================
// PATCH /api/solicitudes/:id/decision
// ==========================================

app.patch(
  '/api/solicitudes/:id/decision',
  autenticar,
  permitirRoles('Gerente', 'Director'),
  async (req, res) => {
    const requestId = req.params.id;

    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)
    ) {
      return res.status(400).json({
        success: false,
        mensaje: 'ID inválido'
      });
    }

    const {
      decision,
      comentarios
    } = req.body || {};

    const comments =
      comentarios === undefined ||
      comentarios === null
        ? ''
        : typeof comentarios === 'string'
          ? comentarios.trim()
          : null;

    if (
      !['APPROVED', 'REJECTED'].includes(decision) ||
      comments === null ||
      comments.length > 500 ||
      (decision === 'REJECTED' && !comments)
    ) {
      return res.status(400).json({
        success: false,
        mensaje:
          'decision debe ser APPROVED o REJECTED; comentarios obligatorio para rechazar'
      });
    }

    try {
      const consulta = await db.send(
        new GetCommand({
          TableName: TABLA,
          Key: { requestId },
          ConsistentRead: true
        })
      );

      const solicitud = consulta.Item;

      if (!solicitud) {
        return res.status(404).json({
          success: false,
          mensaje: 'Solicitud no encontrada'
        });
      }

      const amount = Number(solicitud.amount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(409).json({
          success: false,
          mensaje: 'Monto inválido en DynamoDB'
        });
      }

      // Reglas oficiales de Héctor.
      const rolRequerido =
        amount <= 1000
          ? 'Gerente'
          : 'Director';

      if (
        solicitud.requiereAprobacionDe !== rolRequerido
      ) {
        return res.status(409).json({
          success: false,
          mensaje:
            'Regla de aprobación inconsistente'
        });
      }

      if (
        !req.usuario.roles.includes(rolRequerido)
      ) {
        return res.status(403).json({
          success: false,
          mensaje:
            `Esta solicitud necesita dictamen de ${rolRequerido}`
        });
      }

      // Nadie puede dictaminar su propia compra.
      if (
        !solicitud.applicant ||
        String(solicitud.applicant)
          .trim()
          .toLowerCase() === req.usuario.email
      ) {
        return res.status(403).json({
          success: false,
          mensaje:
            'No puedes decidir una solicitud propia o sin solicitante válido'
        });
      }

      if (solicitud.status !== 'PENDING') {
        return res.status(409).json({
          success: false,
          mensaje: 'Solicitud ya no está PENDING'
        });
      }

      const ahora = new Date().toISOString();

      const condicionMonto =
        rolRequerido === 'Gerente'
          ? '#amount > :cero AND #amount <= :mil'
          : '#amount > :mil';

      // Actualización atómica:
      // impide decisiones duplicadas o simultáneas.
      const actualizado = await db.send(
        new UpdateCommand({
          TableName: TABLA,

          Key: {
            requestId
          },

          UpdateExpression:
            'SET #status = :decision, ' +
            '#decidedBy = :autor, ' +
            '#comments = :comentarios, ' +
            '#updatedAt = :ahora',

          ConditionExpression:
            'attribute_exists(#id) AND ' +
            '#status = :pending AND ' +
            '#rol = :rol AND ' +
            'attribute_exists(#applicant) AND ' +
            '#applicant <> :autor AND ' +
            condicionMonto,

          ExpressionAttributeNames: {
            '#id': 'requestId',
            '#status': 'status',
            '#rol': 'requiereAprobacionDe',
            '#applicant': 'applicant',
            '#amount': 'amount',
            '#decidedBy': 'decidedBy',
            '#comments': 'comments',
            '#updatedAt': 'updatedAt'
          },

          ExpressionAttributeValues: {
            ':pending': 'PENDING',
            ':rol': rolRequerido,
            ':autor': req.usuario.email,
            ':decision': decision,
            ':comentarios':
              comments || 'Sin comentarios',
            ':ahora': ahora,
            ':mil': 1000,

            ...(rolRequerido === 'Gerente'
              ? { ':cero': 0 }
              : {})
          },

          ReturnValues: 'ALL_NEW'
        })
      );

      return res.status(200).json({
        success: true,

        mensaje:
          decision === 'APPROVED'
            ? 'Solicitud aprobada'
            : 'Solicitud rechazada',

        solicitud: actualizado.Attributes
      });

    } catch (error) {
      if (
        error.name ===
        'ConditionalCheckFailedException'
      ) {
        return res.status(409).json({
          success: false,
          mensaje:
            'La solicitud fue modificada, ya decidida o no cumple las condiciones'
        });
      }

      console.error(
        'Error aplicando dictamen:',
        error.name
      );

      return res.status(500).json({
        success: false,
        mensaje:
          'No se pudo guardar el dictamen'
      });
    }
  }
);

// ==========================================
// MANEJO DE ERRORES
// ==========================================

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      mensaje: 'JSON demasiado grande'
    });
  }

  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    'body' in error
  ) {
    return res.status(400).json({
      success: false,
      mensaje: 'JSON inválido'
    });
  }

  console.error(
    'Error inesperado:',
    error.name
  );

  return res.status(500).json({
    success: false,
    mensaje: 'Error interno del servidor'
  });
});

// ==========================================
// INICIO LOCAL
// ==========================================

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(
      `Backend G7 escuchando en http://${HOST}:${PORT}`
    );
  });
}

// Permite usar Express en AWS Lambda.
module.exports = app;
