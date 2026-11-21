'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {configuration}=require('./backend/src/server');
test('QA rechaza AWS remoto y destinos ajenos a loopback',()=>{for(const endpoint of ['https://dynamodb.us-east-2.amazonaws.com','http://192.168.1.1:8000','https://127.0.0.1:8000','http://local.example:8000'])assert.throws(()=>configuration({DYNAMODB_ENDPOINT:endpoint}));});
test('QA rechaza tablas compartidas',()=>{for(const table of ['g7-dev-solicitudes','solicitudes','G7-TEST-CRUD'])assert.throws(()=>configuration({DYNAMODB_TABLE:table}));});
test('QA rechaza credenciales y parametros en URL',()=>{for(const endpoint of ['http://user:pass@127.0.0.1:8000','http://127.0.0.1:8000/path','http://127.0.0.1:8000?target=aws'])assert.throws(()=>configuration({DYNAMODB_ENDPOINT:endpoint}));});
test('QA acepta configuracion local explicita y valida puerto',()=>{assert.equal(configuration({DYNAMODB_ENDPOINT:'http://127.0.0.1:18000',DYNAMODB_TABLE:'G7-TEST-CRUD-solicitudes',PORT:'13000'}).port,13000);assert.throws(()=>configuration({PORT:'0'}));assert.throws(()=>configuration({PORT:'NaN'}));});
