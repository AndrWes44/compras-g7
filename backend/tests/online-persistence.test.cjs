// Comprueba las condiciones de escritura y la conservación del historial.
"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createStore,contracts:C}=require('../src/server').internals;
test('anulacion condiciona estado y dueño; fallo concurrente no anuncia exito',async()=>{
 const calls=[];const conflict=Object.assign(new Error('race'),{name:'ConditionalCheckFailedException'});
 const store=createStore({requestsTable:'Requests',region:'us-east-2'},{client:{send:async command=>{calls.push(command.input);throw conflict;}}});
 const user={sub:'owner',email:'owner@example.invalid',roles:['Solicitante']};
 const doc={requestId:'REQ1',status:'PENDING',applicant:user.email,applicantSub:user.sub};
 await assert.rejects(store.cancelRequest(doc,user,'Ya no se requiere'),{name:'ConditionalCheckFailedException'});
 assert.match(calls[0].ConditionExpression,/#s = :pending/);
 assert.match(calls[0].ConditionExpression,/applicantSub = :owner/);
 assert.match(calls[0].ConditionExpression,/applicant = :email/);
 assert.match(calls[0].UpdateExpression,/list_append/);
 assert.equal(calls[0].ExpressionAttributeValues[':cancelled'],'CANCELLED');
});
test('dictamen no cruza asignacion individual y la fija atomicamente',async()=>{
 const user={sub:'manager',email:'manager@example.invalid',roles:['Gerente']};
 const doc={requestId:'REQ1',status:'PENDING',amount:1,requiereAprobacionDe:'Gerente',applicant:'owner@example.invalid',assignedApproverSub:'someone-else'};
 assert.equal(Boolean(C.canDecide(doc,user)),false);
 doc.assignedApproverSub=user.sub;assert.equal(Boolean(C.canDecide(doc,user)),true);
 let input;
 const store=createStore({requestsTable:'Requests',region:'us-east-2'},{client:{send:async command=>{input=command.input;return{Attributes:{...doc,status:'APPROVED'}};}}});
 await store.decide(doc,{decision:'APPROVED',comentarios:'Revisado'},user);
 assert.match(input.ConditionExpression,/assignedApproverSub = :assigned/);
 assert.equal(input.ExpressionAttributeValues[':assigned'],user.sub);
});
