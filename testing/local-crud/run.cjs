'use strict';
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const {randomUUID,createHash} = require('node:crypto');
const newman = require('./tools/node_modules/newman');
const {DynamoDBClient,CreateTableCommand,ListTablesCommand} = require('./backend/node_modules/@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,GetCommand,PutCommand,DeleteCommand,ScanCommand} = require('./backend/node_modules/@aws-sdk/lib-dynamodb');
const out=path.resolve(process.argv[2] || path.join(__dirname,'../../outputs/G7-PRUEBAS-CRUD-FINAL'));fs.mkdirSync(path.join(out,'evidencia'),{recursive:true});
const endpoint='http://127.0.0.1:18000';const table='G7-TEST-CRUD-solicitudes';
const raw=new DynamoDBClient({region:'us-east-2',endpoint,credentials:{accessKeyId:'local',secretAccessKey:'local'},maxAttempts:1});
const db=DynamoDBDocumentClient.from(raw);const prefix='G7-TEST-CRUD-'+randomUUID();
const protectedId='G7-TEST-CRUD-'+randomUUID();const protectedItem={requestId:protectedId,descripcion:prefix+' fixture aprobada no modificar',solicitante:prefix+' QA',departamento:'QA',monto:25,estado:'APPROVED',fechaCreacion:new Date().toISOString()};
let env=JSON.parse(fs.readFileSync(path.join(out,'G7-entorno-ejemplo.postman_environment.json')));
for(const [key,value] of Object.entries({runPrefix:prefix,protectedId}))env.values.find(x=>x.key===key).value=value;
const all=[];const direct=[];const phases=[];const collection=JSON.parse(fs.readFileSync(path.join(out,'G7-Compras-CRUD.postman_collection.json')));
function getEnv(key){return env.values.find(x=>x.key===key)?.value;}
async function read(id){return (await db.send(new GetCommand({TableName:table,Key:{requestId:id},ConsistentRead:true}))).Item;}
async function verify(name,fn){const row={prueba:name,fechaUTC:new Date().toISOString()};try{row.detalle=await fn();row.aprobado=true;}catch(e){row.aprobado=false;row.error=e.message;}direct.push(row);fs.writeFileSync(path.join(out,'evidencia/dynamodb-verification.json'),JSON.stringify({endpoint,table,verificaciones:direct},null,2));assert.equal(row.aprobado,true,name+': '+row.error);}
async function run(folder,number){
  const summary=await new Promise((resolve,reject)=>newman.run({collection,environment:env,folder:[folder],iterationCount:1,delayRequest:25,timeoutRequest:10000,reporters:['json'],reporter:{json:{export:path.join(out,`newman-fase-${number}.json`)}},insecure:false},(err,s)=>err?reject(err):resolve(s)));
  env=summary.environment.toJSON();
  for(const e of summary.run.executions){const assertions=(e.assertions||[]).map(a=>({nombre:a.assertion,aprobado:!a.error,error:a.error?.message}));all.push({fase:folder,nombre:e.item.name,metodo:e.request.method,endpoint:e.request.url.toString(),status:e.response?.code,esperado:assertions.find(a=>a.nombre.startsWith('HTTP'))?.nombre,aprobado:assertions.length>0&&assertions.every(a=>a.aprobado)&&!!e.response,aserciones:assertions,body:e.response?.stream?.toString()});}
  phases.push({fase:folder,stats:summary.run.stats,fallos:summary.run.failures.map(f=>({error:f.error?.message,source:f.source?.name}))});
  console.log(folder,'requests',summary.run.stats.requests.total,'assertions',summary.run.stats.assertions.total,'failed',summary.run.failures.length);
  if(summary.run.failures.length) throw new Error('Fallos en Newman: '+folder);
}
async function main(){
  const tables=await raw.send(new ListTablesCommand({}));
  // A dedicated in-memory process is required: refuse even an existing QA table.
  assert.equal(tables.TableNames.length,0,'La instancia debe estar vacia y ser exclusiva de esta corrida.');
  await raw.send(new CreateTableCommand({TableName:table,KeySchema:[{AttributeName:'requestId',KeyType:'HASH'}],AttributeDefinitions:[{AttributeName:'requestId',AttributeType:'S'}],BillingMode:'PAY_PER_REQUEST'}));
  await db.send(new PutCommand({TableName:table,Item:protectedItem,ConditionExpression:'attribute_not_exists(requestId)'}));
  const health=await fetch('http://127.0.0.1:13000/health').then(r=>r.json());assert.equal(health.modo,'QA_LOCAL');assert.equal(health.tabla,table);
  await run('01 CREATE READ',1);
  const id=getEnv('requestId'); assert.match(id,/^G7-TEST-CRUD-[0-9a-f-]{36}$/);let created;
  await verify('POST guardado en DynamoDB Local',async()=>{created=await read(id);assert.ok(created);assert.ok(created.descripcion.startsWith(prefix));assert.equal(created.monto,999.99);assert.equal(created.estado,'PENDING');return created;});
  await run('02 UPDATE NEGATIVAS',2);
  await verify('PUT persistido preserva requestId fecha y estado',async()=>{const item=await read(id);assert.equal(item.requestId,id);assert.equal(item.fechaCreacion,created.fechaCreacion);assert.equal(item.estado,created.estado);assert.equal(item.monto,1000);assert.equal(item.descripcion,prefix+' solicitud actualizada');return item;});
  await verify('PUT inexistente no crea un registro',async()=>{assert.equal(await read(getEnv('missingId')),undefined);return {requestId:getEnv('missingId'),existe:false};});
  await verify('Solicitud aprobada no cambio',async()=>{assert.deepEqual(await read(protectedId),protectedItem);return {requestId:protectedId,estado:'APPROVED',sinCambios:true};});
  await run('03 DELETE READ',3);
  await verify('DELETE confirmado por lectura consistente DynamoDB',async()=>{assert.equal(await read(id),undefined);return {requestId:id,existe:false};});
  await db.send(new DeleteCommand({TableName:table,Key:{requestId:protectedId},ConditionExpression:'descripcion = :description',ExpressionAttributeValues:{':description':protectedItem.descripcion}}));
  await verify('Limpieza tabla QA sin registros restantes',async()=>{const {Items}=await db.send(new ScanCommand({TableName:table,ConsistentRead:true}));assert.equal(Items.length,0);return {registrosRestantes:Items.length};});
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{
  const data={fechaUTC:new Date().toISOString(),baseUrl:'http://127.0.0.1:13000',dynamodb:{endpoint,tabla:table,version:'3.3.2',modo:'inMemory'},newmanVersion:require('./tools/node_modules/newman/package.json').version,prefijo:prefix,completado:phases.length===3&&!process.exitCode,peticiones:all.length,aserciones:all.reduce((n,e)=>n+e.aserciones.length,0),fallos:all.filter(e=>!e.aprobado).length,verificacionesDirectas:direct,phases,casos:all};
  fs.writeFileSync(path.join(out,'resultados-resumen.json'),JSON.stringify(data,null,2));
  fs.writeFileSync(path.join(out,'evidencia/registro-ejecucion.json'),JSON.stringify({requestId:getEnv('requestId'),protectedId,runPrefix:prefix,fechaUTC:data.fechaUTC},null,2));
  raw.destroy();
});
