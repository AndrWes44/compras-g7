
'use strict';

require('dotenv').config();

const express = require('express');
const { randomUUID } = require('node:crypto');

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

const {
    DynamoDBDocumentClient,
    ScanCommand,
    GetCommand
} = require('@aws-sdk/lib-dynamodb');

const {
    SFNClient,
    StartExecutionCommand
} = require('@aws-sdk/client-sfn');

const app = express();
app.disable('x-powered-by');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const REGION = process.env.AWS_REGION || 'us-east-2';
const TABLA = process.env.DYNAMODB_TABLE || 'g7-dev-solicitudes';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

if (!STATE_MACHINE_ARN) {
    throw new Error('Falta STATE_MACHINE_ARN en backend/.env');
}

// Configuración CORS para el frontend
const origenesPermitidos = new Set(
    (process.env.FRONTEND_ORIGINS ||
        'http://localhost:3001,http://127.0.0.1:3001')
        .split(',')
        .map(origen => origen.trim())
        .filter(Boolean)
);

app.use((req, res, next) => {
    const origen = req.headers.origin;

    if (origen && origenesPermitidos.has(origen)) {
        res.setHeader('Access-Control-Allow-Origin', origen);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

app.use(express.json({ limit: '100kb' }));

// Conexión con DynamoDB AWS real
const db = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: REGION,
        maxAttempts: 3
    })
);

// Conexión con AWS Step Functions
const sfnClient = new SFNClient({
    region: REGION,
    maxAttempts: 3
});

// Validar campos de texto
function textoValido(valor, longitudMaxima) {
    if (typeof valor !== 'string') return null;

    const texto = valor.trim();

    return texto.length > 0 && texto.length <= longitudMaxima
        ? texto
        : null;
}

// Validar monto
function obtenerMonto(valor) {
    if (typeof valor === 'string') {
        const texto = valor.trim();

        if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(texto)) {
            return null;
        }

        valor = Number(texto);
    }

    return typeof valor === 'number' &&
        Number.isFinite(valor) &&
        valor > 0
        ? valor
        : null;
}

// Codificar cursor de paginación
function codificarCursor(clave) {
    return clave
        ? Buffer.from(JSON.stringify(clave), 'utf8')
            .toString('base64url')
        : null;
}

// Validar y decodificar cursor
function decodificarCursor(cursor) {
    if (
        typeof cursor !== 'string' ||
        cursor.length > 2048 ||
        !/^[A-Za-z0-9_-]+$/.test(cursor)
    ) {
        throw new Error('Cursor inválido');
    }

    const buffer = Buffer.from(cursor, 'base64url');

    if (buffer.toString('base64url') !== cursor) {
        throw new Error('Cursor inválido');
    }

    const clave = JSON.parse(buffer.toString('utf8'));

    if (
        !clave ||
        typeof clave !== 'object' ||
        Array.isArray(clave) ||
        Object.keys(clave).length !== 1 ||
        typeof clave.requestId !== 'string' ||
        clave.requestId.length === 0 ||
        clave.requestId.length > 100
    ) {
        throw new Error('Cursor inválido');
    }

    return clave;
}

// ==========================================
// GET /health
// Verificar funcionamiento de Express
// ==========================================

app.get('/health', (req, res) => {
    return res.status(200).json({
        mensaje: 'Backend del Grupo 7 funcionando',
        estado: 'OK'
    });
});

// ==========================================
// GET /api/aws/verificar
// Verificar conexión con DynamoDB
// ==========================================

app.get('/api/aws/verificar', async (req, res) => {
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
            mensaje: 'Conexión con DynamoDB AWS exitosa',
            tabla: TABLA,
            region: REGION,
            registrosRecibidos: (resultado.Items || []).length
        });

    } catch (error) {
        console.error(
            'Error de conexión AWS:',
            error.name,
            error.message
        );

        return res.status(500).json({
            mensaje: 'No se pudo consultar DynamoDB AWS',
            tipoError: error.name
        });
    }
});

// ==========================================
// POST /api/solicitudes
// Iniciar flujo de aprobación
// ==========================================

app.post('/api/solicitudes', async (req, res) => {
    const cuerpo = req.body || {};

    // Aceptar nombres en español e inglés
    const descripcion = textoValido(
        cuerpo.descripcion ?? cuerpo.description,
        1000
    );

    const solicitante = textoValido(
        cuerpo.solicitante ?? cuerpo.applicant,
        200
    );

    const departamento = textoValido(
        cuerpo.departamento ?? cuerpo.department,
        100
    );

    const monto = obtenerMonto(
        cuerpo.monto ?? cuerpo.amount
    );

    // Validar información recibida
    if (
        !descripcion ||
        !solicitante ||
        !departamento ||
        monto === null
    ) {
        return res.status(400).json({
            success: false,
            mensaje:
                'Datos inválidos: descripcion, solicitante, departamento y monto son obligatorios.'
        });
    }

    try {
        // Generar identificador único
        const requestId = `REQ-${randomUUID()}`;

        // Payload requerido por las Lambdas
        const payload = {
            requestId,
            amount: monto,
            applicant: solicitante,
            department: departamento,
            description: descripcion
        };

        // Iniciar Step Functions
        // La Lambda guardará la solicitud en DynamoDB
        const resultado = await sfnClient.send(
            new StartExecutionCommand({
                stateMachineArn: STATE_MACHINE_ARN,
                name: `exec-${requestId}`,
                input: JSON.stringify(payload)
            })
        );

        // AWS aceptó iniciar el flujo
        return res.status(202).json({
            success: true,
            mensaje: 'Flujo de aprobación iniciado correctamente',
            requestId,
            executionArn: resultado.executionArn,
            startDate: resultado.startDate
        });

    } catch (error) {
        console.error(
            'Error al iniciar Step Functions:',
            error.name,
            error.message
        );

        return res.status(500).json({
            success: false,
            mensaje: 'No se pudo iniciar el flujo de aprobación'
        });
    }
});

// ==========================================
// GET /api/solicitudes
// Listar solicitudes con paginación
// ==========================================

app.get('/api/solicitudes', async (req, res) => {
    const limite = Number(req.query.limit ?? 20);

    if (
        !Number.isInteger(limite) ||
        limite < 1 ||
        limite > 100
    ) {
        return res.status(400).json({
            mensaje: 'limit debe ser un entero entre 1 y 100'
        });
    }

    let claveInicio;

    if (req.query.cursor !== undefined) {
        try {
            claveInicio = decodificarCursor(req.query.cursor);
        } catch {
            return res.status(400).json({
                mensaje: 'Cursor de paginación inválido'
            });
        }
    }

    try {
        const resultado = await db.send(
            new ScanCommand({
                TableName: TABLA,
                Limit: limite,
                ...(claveInicio
                    ? { ExclusiveStartKey: claveInicio }
                    : {})
            })
        );

        const solicitudes = resultado.Items || [];

        return res.status(200).json({
            total: solicitudes.length,
            solicitudes,
            hayMasRegistros: Boolean(resultado.LastEvaluatedKey),
            siguienteCursor: codificarCursor(
                resultado.LastEvaluatedKey
            )
        });

    } catch (error) {
        console.error(
            'Error listando solicitudes:',
            error.name,
            error.message
        );

        return res.status(500).json({
            mensaje: 'No se pudieron consultar las solicitudes'
        });
    }
});

// ==========================================
// GET /api/solicitudes/:id
// Consultar solicitud por requestId
// ==========================================

app.get('/api/solicitudes/:id', async (req, res) => {
    const requestId = req.params.id;

    if (
        typeof requestId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)
    ) {
        return res.status(400).json({
            success: false,
            mensaje: 'ID de solicitud inválido'
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

        if (!resultado.Item) {
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
            'Error consultando por ID:',
            error.name,
            error.message
        );

        return res.status(500).json({
            success: false,
            mensaje: 'No se pudo consultar la solicitud'
        });
    }
});

// ==========================================
// Manejo de errores en peticiones JSON
// ==========================================

app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') {
        return res.status(413).json({
            mensaje: 'La solicitud excede el tamaño permitido'
        });
    }

    if (
        error instanceof SyntaxError &&
        error.status === 400 &&
        'body' in error
    ) {
        return res.status(400).json({
            mensaje: 'JSON inválido'
        });
    }

    next(error);
});

// ==========================================
// Iniciar servidor
// ==========================================

app.listen(PORT, HOST, () => {
    console.log(
        `Servidor ejecutándose en http://${HOST}:${PORT}`
    );
});
