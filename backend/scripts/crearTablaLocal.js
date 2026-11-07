const {
    DynamoDBClient,
    CreateTableCommand,
    ListTablesCommand
} = require('@aws-sdk/client-dynamodb');

// Conexión exclusiva con DynamoDB Local
const client = new DynamoDBClient({
    region: 'us-east-2',
    endpoint: 'http://127.0.0.1:8000',
    credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local'
    }
});

async function crearTabla() {
    try {
        const nombreTabla = 'g7-dev-solicitudes';

        const tablas = await client.send(
            new ListTablesCommand({})
        );

        if (tablas.TableNames?.includes(nombreTabla)) {
            console.log('La tabla ya existe:', nombreTabla);
            return;
        }

        await client.send(new CreateTableCommand({
            TableName: nombreTabla,
            KeySchema: [
                {
                    AttributeName: 'requestId',
                    KeyType: 'HASH'
                }
            ],
            AttributeDefinitions: [
                {
                    AttributeName: 'requestId',
                    AttributeType: 'S'
                }
            ],
            BillingMode: 'PAY_PER_REQUEST'
        }));

        console.log('Tabla creada:', nombreTabla);

    } catch (error) {
        console.error('Error:', error.message);
        process.exitCode = 1;
    } finally {
        client.destroy();
    }
}

crearTabla();
