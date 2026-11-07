import fs from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { URL, fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
export function validateLocalEndpoint(value) {
  const url = new URL(value);
  const host = url.hostname;
  const octets = host.split('.').map(Number);
  const local = host === 'localhost' || host === '[::1]' || (octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255) && (octets[0] === 127 || octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)));
  if (url.protocol !== 'http:' || !local || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Usar un endpoint HTTP local o de LAN privada, sin credenciales, ruta ni parametros');
  return url.origin;
}
export async function verifyStoredDocuments(endpoint, evidence) {
  const safeEndpoint = validateLocalEndpoint(endpoint);
  if (!evidence.table || !Array.isArray(evidence.created) || !evidence.created.length) throw new Error('La evidencia debe indicar tabla y documentos creados');
  const { DynamoDBClient, DescribeTableCommand } = requireBackend('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand } = requireBackend('@aws-sdk/lib-dynamodb');
  const raw = new DynamoDBClient({ endpoint: safeEndpoint, region: evidence.region ?? 'us-east-2', credentials: { accessKeyId: 'local', secretAccessKey: 'local' }, maxAttempts: 1 });
  const db = DynamoDBDocumentClient.from(raw);
  try {
    const description = await raw.send(new DescribeTableCommand({ TableName: evidence.table }), { abortSignal: AbortSignal.timeout(8000) });
    const records = [];
    for (const expected of evidence.created) {
      const result = await db.send(new GetCommand({ TableName: evidence.table, Key: { requestId: expected.requestId }, ConsistentRead: true }), { abortSignal: AbortSignal.timeout(8000) });
      records.push({ requestId: expected.requestId, found: !!result.Item, matches: isDeepStrictEqual(result.Item, expected.apiDocument) });
    }
    return { table: description.Table.TableName, status: description.Table.TableStatus, records, passed: records.every(record => record.matches) };
  } finally { raw.destroy(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const endpoint = process.argv[2] ?? 'http://127.0.0.1:8000';
    const evidenceFile = process.argv[3] ?? fileURLToPath(new URL('./evidence/2026-11-07-wifi/dynamodb-verification.json', import.meta.url));
    const result = await verifyStoredDocuments(endpoint, JSON.parse(fs.readFileSync(evidenceFile, 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch (error) { console.error(JSON.stringify({ error: error.name, message: error.message })); process.exitCode = 1; }
}
