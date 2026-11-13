"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const serverless=require('@codegenie/serverless-express');
const {createApp}=require('../src/server').internals;
test('HTTP API Lambda conserva JSON de registro y borrador antes de middleware asincrono',async()=>{
 const received=[];
 const app=createApp({config:{registrationEnabled:true},store:{rateLimit:async()=>1},workflow:{},
  identity:{authenticate:async()=>({sub:'owner',email:'owner@example.invalid',roles:['Solicitante']})},
  access:{register:async body=>{received.push(body);return{success:true};},assertAccountAccess:async()=>{}},
  business:{createDraft:async(user,body)=>{received.push(body);return{id:'D1',version:1,...body};}}});
 const handler=serverless({app});
 for(const [path,body,status] of [['/api/auth/registro',{email:'new@example.invalid',password:'test-placeholder'},202],['/api/borradores',{description:'Borrador online'},201]]){
  const response=await handler({version:'2.0',routeKey:'$default',rawPath:path,rawQueryString:'',
   headers:{host:'api.example.invalid','content-type':'application/json',authorization:'Bearer test'},
   requestContext:{stage:'$default',requestId:'isolated-test',http:{method:'POST',path,sourceIp:'192.0.2.1',protocol:'HTTP/1.1'}},
   body:Buffer.from(JSON.stringify(body)).toString('base64'),isBase64Encoded:true},{getRemainingTimeInMillis:()=>30000});
  assert.equal(response.statusCode,status);assert.deepEqual(received.at(-1),body);
 }
});
