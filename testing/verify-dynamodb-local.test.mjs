import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocalEndpoint, verifyStoredDocuments } from './verify-dynamodb-local.mjs';
for (const endpoint of ['http://localhost:8000','http://127.0.0.1:8000','http://172.20.10.2:8000','http://10.0.0.2:8000','http://192.168.1.2:8000','http://[::1]:8000']) test(`verificacion local: acepta ${endpoint}`,()=>assert.equal(validateLocalEndpoint(endpoint),new URL(endpoint).origin));
for (const endpoint of ['https://dynamodb.us-east-2.amazonaws.com','http://8.8.8.8:8000','http://172.32.0.1:8000','http://example.com:8000','http://0.0.0.0:8000','http://usuario:clave@127.0.0.1:8000','http://127.0.0.1:8000/ruta','http://127.0.0.1:8000?token=x','http://127.0.0.1:8000#x','no-es-url']) test(`verificacion local: rechaza ${endpoint}`,()=>assert.throws(()=>validateLocalEndpoint(endpoint)));
test('rechaza evidencia vacia antes de contactar DynamoDB',async()=>assert.rejects(verifyStoredDocuments('http://127.0.0.1:8000',{}),/evidencia/));
