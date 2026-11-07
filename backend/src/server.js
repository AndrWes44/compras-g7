
const express = require('express');
const { randomUUID } = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    PutCommand,
    ScanCommand
} = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = 3000;
const TABLA = 'g7-dev-solicitudes';

app.use(express.json());

// Conectar exclusivamente con DynamoDB Local
const cliente = new DynamoDBClient({
    region: 'us-east-2',
    endpoint: 'http://127.0.0.1:8000',
    credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local'
    }
});

const db = DynamoDBDocumentClient.from(cliente);

// Verificar que el servidor funciona
app.get('/health', (req, res) => {
    res.status(200).json({
        mensaje: 'Backend del Grupo 7 funcionando',
        estado: 'OK'
    });
});

// POST: crear una solicitud de compra
app.post('/api/solicitudes', async (req, res) => {
    try {
        const { descripcion, solicitante, departamento, monto } = req.body || {};

        // Validar los datos recibidos
        if (
            typeof descripcion !== 'string' || !descripcion.trim() ||
            typeof solicitante !== 'string' || !solicitante.trim() ||
            typeof departamento !== 'string' || !departamento.trim() ||
            typeof monto !== 'number' ||
            !Number.isFinite(monto) || monto <= 0
        ) {
            return res.status(400).json({
                mensaje: 'Datos inválidos. Revisa descripción, solicitante, departamento y monto.'
            });
        }

        const solicitud = {
            requestId: randomUUID(),
            descripcion: descripcion.trim(),
            solicitante: solicitante.trim(),
            departamento: departamento.trim(),
            monto: monto,
            estado: 'PENDING',
            fechaCreacion: new Date().toISOString()
        };

        // Guardar en DynamoDB
        await db.send(new PutCommand({
            TableName: TABLA,
            Item: solicitud,
            ConditionExpression: 'attribute_not_exists(requestId)'
        }));

        res.status(201).json({
            mensaje: 'Solicitud creada correctamente',
            solicitud
        });

    } catch (error) {
        console.error('Error en POST:', error);
        res.status(500).json({
            mensaje: 'No se pudo guardar la solicitud'
        });
    }
});

// GET: consultar todas las solicitudes
app.get('/api/solicitudes', async (req, res) => {
    try {
        const solicitudes = [];
        let siguienteClave;

        do {
            const resultado = await db.send(new ScanCommand({
                TableName: TABLA,
                ExclusiveStartKey: siguienteClave
            }));

            solicitudes.push(...(resultado.Items || []));
            siguienteClave = resultado.LastEvaluatedKey;

        } while (siguienteClave);

        res.status(200).json({
            total: solicitudes.length,
            solicitudes
        });

    } catch (error) {
        console.error('Error en GET:', error);
        res.status(500).json({
            mensaje: 'No se pudieron consultar las solicitudes'
        });
    }
});

// Iniciar servidor Express
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
