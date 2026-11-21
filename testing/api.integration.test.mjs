import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBackend } from './harness.mjs';
const payload = (monto = 999.99) => ({ descripcion: 'Compra de prueba', solicitante: 'Usuario de prueba', departamento: 'Computo', monto });
async function scenario(callback) { const backend = await startBackend(); try { await callback(backend); } finally { await backend.close(); } }
async function request(backend, method, path, body) {
  const response = await fetch(backend.baseUrl + path, { method, headers: { 'Content-Type':'application/json' }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  return { status:response.status, body:await response.json() };
}
test('GET /health confirma el backend del grupo 7',()=>scenario(async b=>{
  const result=await request(b,'GET','/health');assert.equal(result.status,200);assert.equal(result.body.estado,'OK');assert.match(result.body.mensaje,/Grupo 7/);
}));
for(const monto of [0.01,999.99,1000,1000.01,1800]) test(`crear y consultar solicitud de $${monto}`,()=>scenario(async b=>{
  const input=payload(monto);const created=await request(b,'POST','/api/solicitudes',input);assert.equal(created.status,201);
  const doc=created.body.solicitud;assert.match(doc.requestId,/^[0-9a-f]{8}-[0-9a-f-]{27}$/);assert.equal(doc.monto,monto);assert.equal(doc.estado,'PENDING');assert.ok(Number.isFinite(Date.parse(doc.fechaCreacion)));
  const listed=await request(b,'GET','/api/solicitudes');assert.equal(listed.status,200);assert.equal(listed.body.total,1);assert.deepEqual(listed.body.solicitudes,[doc]);
  assert.equal(b.state.commands[0].input.ConditionExpression,'attribute_not_exists(requestId)');assert.equal(b.state.commands[0].input.TableName,'g7-dev-solicitudes');
}));
test('elimina espacios externos de campos de texto',()=>scenario(async b=>{
  const result=await request(b,'POST','/api/solicitudes',{...payload(),descripcion:'  Compra  ',solicitante:'  Diego  ',departamento:'  Computo  '});assert.equal(result.status,201);assert.equal(result.body.solicitud.descripcion,'Compra');assert.equal(result.body.solicitud.solicitante,'Diego');assert.equal(result.body.solicitud.departamento,'Computo');
}));
for(const field of ['descripcion','solicitante','departamento']) for(const value of [undefined,null,'','   ',123,{},[]]) test(`rechaza ${field}=${JSON.stringify(value)}`,()=>scenario(async b=>{
  const result=await request(b,'POST','/api/solicitudes',{...payload(),[field]:value});assert.equal(result.status,400);assert.match(result.body.mensaje,/inválidos/);assert.equal(b.state.items.size,0);assert.equal(b.state.commands.length,0);
}));
for(const monto of [undefined,null,0,-1,'100',true,{},[]]) test(`rechaza monto=${JSON.stringify(monto)}`,()=>scenario(async b=>{
  const result=await request(b,'POST','/api/solicitudes',{...payload(),monto});assert.equal(result.status,400);assert.equal(b.state.items.size,0);
}));
test('listado vacio: total cero y arreglo vacio',()=>scenario(async b=>{
  const result=await request(b,'GET','/api/solicitudes');assert.equal(result.status,200);assert.deepEqual(result.body,{total:0,solicitudes:[]});
}));
test('GET recorre todas las paginas de DynamoDB simulado',()=>scenario(async b=>{
  b.state.pages=[{Items:[{requestId:'primero'}],LastEvaluatedKey:{requestId:'primero'}},{Items:[{requestId:'segundo'}]}];
  const result=await request(b,'GET','/api/solicitudes');assert.equal(result.body.total,2);assert.deepEqual(result.body.solicitudes.map(s=>s.requestId),['primero','segundo']);assert.deepEqual(b.state.commands[1].input.ExclusiveStartKey,{requestId:'primero'});
}));
test('fallo de escritura devuelve 500 sin detalle interno',()=>scenario(async b=>{
  b.state.failPut=true;const result=await request(b,'POST','/api/solicitudes',payload());assert.equal(result.status,500);assert.equal(result.body.mensaje,'No se pudo guardar la solicitud');assert.doesNotMatch(JSON.stringify(result.body),/SIMULATED_STORAGE_ERROR/);
}));
test('fallo de lectura devuelve 500 sin detalle interno',()=>scenario(async b=>{
  b.state.failScan=true;const result=await request(b,'GET','/api/solicitudes');assert.equal(result.status,500);assert.equal(result.body.mensaje,'No se pudieron consultar las solicitudes');
}));
test('20 creaciones concurrentes conservan IDs unicos y todos los registros',()=>scenario(async b=>{
  const results=await Promise.all(Array.from({length:20},()=>request(b,'POST','/api/solicitudes',payload())));assert.ok(results.every(r=>r.status===201));assert.equal(new Set(results.map(r=>r.body.solicitud.requestId)).size,20);assert.equal((await request(b,'GET','/api/solicitudes')).body.total,20);
}));
test('JSON malformado devuelve 400',()=>scenario(async b=>{
  const response=await fetch(b.baseUrl+'/api/solicitudes',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(response.status,400);assert.equal(b.state.items.size,0);
}));
test('cuerpo ausente devuelve 400',()=>scenario(async b=>{
  assert.equal((await request(b,'POST','/api/solicitudes')).status,400);
}));
test('configuracion declarada apunta a DynamoDB Local, no AWS remoto',()=>scenario(async b=>{
  assert.equal(b.state.configuration.endpoint,'http://127.0.0.1:8000');assert.equal(b.state.configuration.region,'us-east-2');
}));
