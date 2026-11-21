'use strict';
const express = require('express');
const { randomUUID } = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// This executable is the isolated LOCAL QA variant, never the deployed AURA API.
const PREFIX = 'G7-TEST-CRUD';
function configuration(env = process.env) {
  const endpoint = env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:18000';
  const u = new URL(endpoint);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
    throw new Error('QA solo permite DynamoDB Local en loopback por HTTP.');
  const table = env.DYNAMODB_TABLE || PREFIX + '-solicitudes';
  if (!/^G7-TEST-CRUD-[A-Za-z0-9_.-]+$/.test(table)) throw new Error('QA requiere una tabla G7-TEST-CRUD exclusiva.');
  const port = Number(env.PORT || 13000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto invalido.');
  return { endpoint, table, port };
}
function validFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (Object.keys(body).some(k => !['descripcion', 'solicitante', 'departamento', 'monto'].includes(k))) return false;
  return ['descripcion', 'solicitante', 'departamento'].every(k => typeof body[k] === 'string' && body[k].trim().length > 0 && body[k].trim().length <= 2000)
    && typeof body.monto === 'number' && Number.isFinite(body.monto) && body.monto > 0;
}
function fields(b) { return { descripcion: b.descripcion.trim(), solicitante: b.solicitante.trim(), departamento: b.departamento.trim(), monto: b.monto }; }
function createApp({ db, table }) {
  const app = express();
  app.use(express.json({ limit: '32kb', strict: true }));
  const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, mensaje) => res.status(status).json({ mensaje });
  const validate = (req, res, next) => validFields(req.body) ? next() : fail(res, 400, 'Datos invalidos: descripcion, solicitante y departamento no vacios; monto numerico positivo; sin campos adicionales.');
  const id = (req, res, next) => /^G7-TEST-CRUD-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.requestId) ? next() : fail(res, 400, 'requestId de prueba invalido.');
  const get = requestId => db.send(new GetCommand({ TableName: table, Key: { requestId }, ConsistentRead: true }));
  // Mutation precondition protects date/id/status and test ownership, including races.
  const condition = 'attribute_exists(requestId) AND begins_with(descripcion, :prefix) AND begins_with(solicitante, :prefix) AND #status = :pending';
  app.get('/health', (req, res) => res.json({ mensaje: 'Backend del Grupo 7 funcionando', estado: 'OK', modo: 'QA_LOCAL', tabla: table }));
  app.post('/api/solicitudes', validate, asyncRoute(async (req, res) => {
    const data = fields(req.body);
    if (!data.descripcion.startsWith(PREFIX) || !data.solicitante.startsWith(PREFIX)) return fail(res, 403, 'Solo se crean registros temporales G7-TEST-CRUD en este entorno.');
    const solicitud = { requestId: PREFIX + '-' + randomUUID(), ...data, estado: 'PENDING', fechaCreacion: new Date().toISOString() };
    await db.send(new PutCommand({ TableName: table, Item: solicitud, ConditionExpression: 'attribute_not_exists(requestId)' }));
    res.status(201).json({ mensaje: 'Solicitud creada correctamente', solicitud });
  }));
  app.get('/api/solicitudes', asyncRoute(async (req, res) => {
    const solicitudes = []; let last;
    do {
      const result = await db.send(new ScanCommand({ TableName: table, ExclusiveStartKey: last, ConsistentRead: true }));
      solicitudes.push(...(result.Items || [])); last = result.LastEvaluatedKey;
    } while (last);
    res.json({ total: solicitudes.length, solicitudes });
  }));
  app.get('/api/solicitudes/:requestId', id, asyncRoute(async (req, res) => {
    const { Item } = await get(req.params.requestId);
    if (!Item) return fail(res, 404, 'Solicitud no encontrada.');
    res.json({ solicitud: Item });
  }));
  app.put('/api/solicitudes/:requestId', id, validate, asyncRoute(async (req, res) => {
    const data = fields(req.body);
    if (!data.descripcion.startsWith(PREFIX) || !data.solicitante.startsWith(PREFIX)) return fail(res, 403, 'El registro debe conservar el prefijo G7-TEST-CRUD.');
    try {
      const { Attributes } = await db.send(new UpdateCommand({ TableName: table, Key: { requestId: req.params.requestId },
        UpdateExpression: 'SET descripcion = :descripcion, solicitante = :solicitante, departamento = :departamento, monto = :monto',
        ConditionExpression: condition, ExpressionAttributeNames: { '#status': 'estado' },
        ExpressionAttributeValues: { ':descripcion': data.descripcion, ':solicitante': data.solicitante, ':departamento': data.departamento, ':monto': data.monto, ':prefix': PREFIX, ':pending': 'PENDING' }, ReturnValues: 'ALL_NEW' }));
      res.json({ mensaje: 'Solicitud actualizada correctamente', solicitud: Attributes });
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      const { Item } = await get(req.params.requestId);
      return fail(res, Item ? 409 : 404, Item ? 'Solo se modifica una solicitud QA propia en PENDING.' : 'Solicitud no encontrada.');
    }
  }));
  app.delete('/api/solicitudes/:requestId', id, asyncRoute(async (req, res) => {
    try {
      await db.send(new DeleteCommand({ TableName: table, Key: { requestId: req.params.requestId }, ConditionExpression: condition,
        ExpressionAttributeNames: { '#status': 'estado' }, ExpressionAttributeValues: { ':prefix': PREFIX, ':pending': 'PENDING' } }));
      res.status(204).end();
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      const { Item } = await get(req.params.requestId);
      return fail(res, Item ? 409 : 404, Item ? 'Solo se elimina una solicitud QA propia en PENDING.' : 'Solicitud no encontrada.');
    }
  }));
  app.use((req, res) => fail(res, 404, 'Ruta no encontrada.'));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return fail(res, 413, 'Cuerpo demasiado grande.');
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'JSON mal formado.');
    console.error('Error QA:', err.name);
    fail(res, 500, 'No se pudo completar la operacion en DynamoDB Local.');
  });
  return app;
}
if (require.main === module) {
  const config = configuration();
  const client = new DynamoDBClient({ region: 'us-east-2', endpoint: config.endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' }, maxAttempts: 1 });
  const db = DynamoDBDocumentClient.from(client);
  const server = createApp({ db, table: config.table }).listen(config.port, '127.0.0.1', () => console.log(JSON.stringify({ modo: 'QA_LOCAL', puerto: config.port, dynamodb: config.endpoint, tabla: config.table })));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { client.destroy(); process.exit(0); }));
}
module.exports = { createApp, configuration, validFields };
