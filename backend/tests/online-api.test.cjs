"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events');
const {createApp,contracts:C}=require('../src/server').internals;
const users={s:{sub:'owner',email:'owner@example.invalid',roles:['Solicitante']},
  other:{sub:'other',email:'other@example.invalid',roles:['Solicitante']},
  g:{sub:'manager',email:'manager@example.invalid',roles:['Gerente']},
  d:{sub:'director',email:'director@example.invalid',roles:['Director']},
  c:{sub:'buyer',email:'buyer@example.invalid',roles:['Compras']},
  a:{sub:'admin',email:'admin@example.invalid',roles:[],isAdmin:true}};
const problem=(status,message)=>Object.assign(new Error(message),{status});
async function fixture(run,{enabled=true,registration=true}={}){
  const docs=new Map(),drafts=new Map(),executions=new Map(),suppliers=new Map([['PRV1',{id:'PRV1',name:'Proveedor',status:'ACTIVE',version:1,taxId:'private',bankName:'Private Bank',bankAccount:'private'}]]);
  const calls={starts:0,cancel:0,decide:0,admin:0};
  const business={
    getSupplier:async id=>suppliers.get(id),
    listSuppliers:async(user,opts)=>({items:[...suppliers.values()].filter(x=>!opts.activeOnly||x.status==='ACTIVE').map(x=>user.roles.includes('Compras')?x:(({taxId,bankName,bankAccount,...rest})=>rest)(x)),total:suppliers.size}),
    createSupplier:async(user,data)=>{const x={...data,id:'PRV2',version:1};suppliers.set(x.id,x);return x;},
    updateSupplier:async(user,id,data,version)=>{const x=suppliers.get(id);if(!x)throw problem(404,'Missing');if(x.version!==version)throw problem(409,'Version');const n={...x,...data,version:version+1};suppliers.set(id,n);return n;},
    deleteInactiveSupplier:async(user,id,version)=>{const x=suppliers.get(id);if(!x)throw problem(404,'Missing');if(x.status!=='INACTIVE'||x.version!==version)throw problem(409,'Conflict');x.status='DELETED';x.version++;},
    createDraft:async(user,data)=>{const x={...data,id:'D1',version:1,status:'DRAFT',ownerSub:user.sub};drafts.set(user.sub+':D1',x);return x;},
    getDraft:async(user,id)=>drafts.get(user.sub+':'+id),
    listDrafts:async user=>({items:[...drafts.values()].filter(x=>x.ownerSub===user.sub),total:1}),
    updateDraft:async(user,id,data,version)=>{const x=drafts.get(user.sub+':'+id);if(!x)throw problem(404,'Missing');if(x.version!==version||x.status!=='DRAFT')throw problem(409,'Conflict');const n={...x,...data,version:version+1};drafts.set(user.sub+':'+id,n);return n;},
    deleteDraft:async(user,id,version)=>{const x=drafts.get(user.sub+':'+id);if(!x)throw problem(404,'Missing');if(x.version!==version||x.status!=='DRAFT')throw problem(409,'Conflict');drafts.delete(user.sub+':'+id);},
    lockDraftForSubmit:async(user,id,version,payload,requestId)=>{const x=drafts.get(user.sub+':'+id);if(x.requestId){if(x.submitVersion!==version)throw problem(409,'Version');return x;}if(x.version!==version)throw problem(409,'Version');Object.assign(x,{submissionPayload:payload,requestId,status:'REGISTERING',submitVersion:version});return x;},
    markDraftSubmitted:async(user,id,requestId)=>{drafts.get(user.sub+':'+id).status='SUBMITTED';}
  };
  const store={rateLimit:async()=>1,getRequest:async id=>docs.get(id),listRequests:async(user)=>({solicitudes:[...docs.values()].filter(x=>C.canSee(x,user)),alcanceTotal:'pagina',siguienteCursor:null,hayMasRegistros:false}),
    cancelRequest:async(doc,user,comments)=>{calls.cancel++;if(doc.status!=='PENDING')throw problem(409,'Conflict');doc.status='CANCELLED';return doc;},
    decide:async()=>{calls.decide++;throw problem(500,'Unexpected decision write');}};
  const workflow={find:async id=>executions.get(id),start:async payload=>{calls.starts++;executions.set(payload.requestId,{input:JSON.stringify(payload),status:'RUNNING'});docs.set(payload.requestId,{...payload,status:'PENDING'});}};
  const access={register:async()=>({success:true,mensaje:'Correo enviado'}),confirm:async()=>({success:true}),resend:async()=>({success:true}),assertAccountAccess:async()=>{},
    listPending:async user=>{calls.admin++;return {solicitudes:[],total:0};},decide:async()=>{calls.admin++;return {success:true};}};
  const identity={authenticate:async token=>{if(!users[token])throw problem(401,'Invalid');return users[token];},login:async email=>({success:true,tokens:{accessToken:'a'},user:users.a})};
  const app=createApp({identity,store,workflow,business:enabled?business:null,access:enabled?access:null,config:{registrationEnabled:registration}});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const request=async(method,url,role,body,headers={})=>{const response=await fetch('http://127.0.0.1:'+server.address().port+url,{method,headers:{...(role?{Authorization:'Bearer '+role}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};};
  try{await run({request,docs,drafts,suppliers,calls,executions});}finally{await new Promise(resolve=>server.close(resolve));}
}
const payload={description:'Compra',department:'TI',amount:1,proveedorId:'PRV1',articulos:[{nombre:'Articulo',cantidad:1,precioUnitario:1}]};
test('features no configuradas fallan cerrado, health y autenticacion no dependen de tablas nuevas',()=>fixture(async f=>{
  assert.equal((await f.request('GET','/health')).status,200);
  assert.equal((await f.request('GET','/api/borradores','s')).status,503);
  assert.equal((await f.request('POST','/api/auth/registro',null,{email:'x@example.invalid'})).status,503);
  assert.equal((await f.request('GET','/api/capacidades','s')).data.borradoresOnline,false);
},{enabled:false}));
test('borradores solo Solicitante; propietario, edicion, version y borrado',()=>fixture(async f=>{
  for(const role of ['g','d','c','a'])assert.equal((await f.request('POST','/api/borradores',role,payload)).status,403);
  const created=await f.request('POST','/api/borradores','s',payload);assert.equal(created.status,201);
  assert.equal((await f.request('GET','/api/borradores/D1','other')).status,404);
  assert.equal((await f.request('PATCH','/api/borradores/D1','s',{description:'Actualizada',version:1})).status,200);
  assert.equal((await f.request('PATCH','/api/borradores/D1','s',{description:'Vieja',version:1})).status,409);
  assert.equal((await f.request('DELETE','/api/borradores/D1','s',{version:2})).status,200);
}));
test('envio de borrador real valida proveedor y conserva id en reintento, bloquea edicion',()=>fixture(async f=>{
  await f.request('POST','/api/borradores','s',payload);
  const first=await f.request('POST','/api/borradores/D1/enviar','s',{version:1});
  const saved=f.drafts.get('owner:D1');
  saved.submissionPayload=Object.fromEntries(Object.entries(saved.submissionPayload).reverse());
  const repeat=await f.request('POST','/api/borradores/D1/enviar','s',{version:1});
  assert.equal(first.status,202);assert.equal(first.data.estado,'REGISTERING');
  assert.equal(repeat.data.requestId,first.data.requestId);assert.equal(repeat.data.reused,true);assert.equal(f.calls.starts,1);
  assert.equal((await f.request('PATCH','/api/borradores/D1','s',{version:1,description:'Cambio'})).status,409);
}));
test('proveedor inactivo no permite nueva solicitud ni iniciar flujo',()=>fixture(async f=>{
  f.suppliers.get('PRV1').status='INACTIVE';
  assert.equal((await f.request('POST','/api/solicitudes','s',payload)).status,400);
  assert.equal(f.calls.starts,0);
}));

test('reintento idempotente conserva envio aunque luego se desactive proveedor',()=>fixture(async f=>{
  const headers={'Idempotency-Key':'retry-supplier-change-20261113'};
  const first=await f.request('POST','/api/solicitudes','s',payload,headers);
  assert.equal(first.status,202);
  f.suppliers.get('PRV1').status='DELETED';
  const repeat=await f.request('POST','/api/solicitudes','s',payload,headers);
  assert.equal(repeat.status,202);assert.equal(repeat.data.reused,true);
  assert.equal(repeat.data.requestId,first.data.requestId);assert.equal(f.calls.starts,1);
}));

test('aprobar sin comentario falla400 antes de modificar solicitud',()=>fixture(async f=>{
  f.docs.set('REQ1',{requestId:'REQ1',amount:1,status:'PENDING',applicant:'owner@example.invalid',requiereAprobacionDe:'Gerente'});
  const response=await f.request('PATCH','/api/solicitudes/REQ1/decision','g',{decision:'APPROVED'});
  assert.equal(response.status,400);assert.equal(f.docs.get('REQ1').status,'PENDING');
}));
test('anulacion requiere propietario y estado pendiente; no anula aprobadas',()=>fixture(async f=>{
  f.docs.set('REQ1',{requestId:'REQ1',status:'PENDING',amount:1,applicant:'owner@example.invalid',applicantSub:'owner'});
  assert.equal((await f.request('POST','/api/solicitudes/REQ1/anular','other',{comentarios:'Motivo'})).status,404);
  assert.equal((await f.request('POST','/api/solicitudes/REQ1/anular','g',{comentarios:'Motivo'})).status,403);
  assert.equal((await f.request('POST','/api/solicitudes/REQ1/anular','s',{comentarios:'Motivo'})).status,200);
  assert.equal((await f.request('POST','/api/solicitudes/REQ1/anular','s',{comentarios:'Motivo'})).status,409);
  assert.equal(f.calls.cancel,1);
}));
test('regresion anulacion: estados finales se conservan y no llegan a persistencia',()=>fixture(async f=>{
  for(const status of ['APPROVED','REJECTED','CANCELLED']) {
    const id='REQ-final-'+status;
    const original={requestId:id,status,amount:14.2,applicant:'owner@example.invalid',applicantSub:'owner',
      history:[{status,by:'original-author',at:'2026-11-12T12:00:00.000Z'}]};
    const snapshot=structuredClone(original);
    f.docs.set(id,original);
    const response=await f.request('POST','/api/solicitudes/'+id+'/anular','s',{comentarios:'Intento posterior al cierre'});
    assert.equal(response.status,409,status);
    assert.equal(response.data.success,false,status);
    assert.equal(f.calls.cancel,0,status+' no debe invocar cancelRequest');
    assert.deepEqual(f.docs.get(id),snapshot,status+' no debe cambiar documento ni historial');
    const detail=await f.request('GET','/api/solicitudes/'+id,'s');
    assert.equal(detail.status,200,status);
    assert.deepEqual(detail.data.solicitud,snapshot,status+' conserva el estado al volver a consultar');
  }
}));
test('regresion Director: registros legados o sin estado siguen legibles y no admiten dictamen',()=>fixture(async f=>{
  const control={requestId:'REQ-pending-control',amount:1500,status:'PENDING',applicant:'owner@example.invalid',
    applicantSub:'owner',requiereAprobacionDe:'Director'};
  f.docs.set(control.requestId,control);
  const cases=[['REQUIRES_SUPERVISOR',2800],['REQUIRES_MANAGER',7500],[undefined,2800],['UNKNOWN_STATE',7500]];
  for(const [index,[status,amount]] of cases.entries()) {
    const id='REQ-legacy-'+index;
    const original={requestId:id,amount,applicant:'owner@example.invalid',applicantSub:'owner',
      requiereAprobacionDe:'Director',history:[{status:'IMPORTED',at:'2026-11-09T12:00:00.000Z'}],
      ...(status===undefined?{}:{status})};
    const snapshot=structuredClone(original);
    f.docs.set(id,original);
    const before=await f.request('GET','/api/solicitudes/'+id,'d');
    assert.equal(before.status,200,String(status));
    assert.deepEqual(before.data.solicitud,snapshot,String(status)+' no debe convertirse en PENDING');
    const inbox=await f.request('GET','/api/aprobaciones','d');
    assert.equal(inbox.status,200,String(status));
    assert.deepEqual(inbox.data.solicitudes.map(x=>x.requestId),[control.requestId],String(status)+' no es accionable');
    const decision=await f.request('PATCH','/api/solicitudes/'+id+'/decision','d',
      {decision:'APPROVED',comentarios:'Revisión de registro antiguo'});
    assert.equal(decision.status,409,String(status));
    assert.equal(decision.data.success,false,String(status));
    assert.equal(decision.data.mensaje,'El estado de la solicitud no admite dictamen en el flujo actual. Actualiza el listado o solicita la revisión del registro.');
    assert.equal(f.calls.decide,0,String(status)+' no debe invocar decide');
    assert.deepEqual(f.docs.get(id),snapshot,String(status)+' no debe cambiar documento ni historial');
    const after=await f.request('GET','/api/solicitudes/'+id,'d');
    assert.equal(after.status,200,String(status));
    assert.deepEqual(after.data.solicitud,snapshot,String(status)+' se conserva tras rechazar el dictamen');
  }
}));
test('regresion Director: una solicitud final conserva su decision y no vuelve a la bandeja',()=>fixture(async f=>{
  for(const status of ['APPROVED','REJECTED','CANCELLED']) {
    const id='REQ-director-final-'+status;
    const original={requestId:id,status,amount:2800,applicant:'owner@example.invalid',applicantSub:'owner',
      requiereAprobacionDe:'Director',history:[{status,by:'original-author',at:'2026-11-12T12:00:00.000Z'}]};
    const snapshot=structuredClone(original);
    f.docs.set(id,original);
    const inbox=await f.request('GET','/api/aprobaciones','d');
    assert.equal(inbox.status,200,status);
    assert.deepEqual(inbox.data.solicitudes,[],status+' no debe volver a pendientes');
    const decision=await f.request('PATCH','/api/solicitudes/'+id+'/decision','d',
      {decision:'APPROVED',comentarios:'Intento posterior al cierre'});
    assert.equal(decision.status,409,status);
    assert.equal(decision.data.mensaje,'La solicitud ya fue decidida.',status);
    assert.equal(f.calls.decide,0,status+' no debe invocar decide');
    assert.deepEqual(f.docs.get(id),snapshot,status+' no debe cambiar documento ni historial');
  }
}));
test('bandeja pendientes respeta rol, monto, dueño y asignacion explicita',()=>fixture(async f=>{
  for(const [id,amount,status,assigned]of [['A',1000,'PENDING'],['B',1000.01,'PENDING'],['C',1,'APPROVED'],['D',1,'PENDING','another']])f.docs.set(id,{requestId:id,amount,status,applicant:'owner@example.invalid',requiereAprobacionDe:amount<=1000?'Gerente':'Director',...(assigned?{assignedApproverSub:assigned}:{})});
  assert.deepEqual((await f.request('GET','/api/aprobaciones','g')).data.solicitudes.map(x=>x.requestId),['A']);
  assert.deepEqual((await f.request('GET','/api/aprobaciones','d')).data.solicitudes.map(x=>x.requestId),['B']);
  assert.equal((await f.request('GET','/api/aprobaciones','c')).status,403);
}));
test('catalogo permite lectura resumida; fiscal y banco solo Compras; CRUD Compras',()=>fixture(async f=>{
  const summary=await f.request('GET','/api/proveedores/PRV1','s');assert.equal(summary.status,200);assert.equal(summary.data.proveedor.bankAccount,undefined);
  const full=await f.request('GET','/api/proveedores/PRV1','c');assert.equal(full.data.proveedor.bankAccount,'private');
  for(const role of ['s','g','d'])assert.equal((await f.request('POST','/api/proveedores',role,{name:'X'})).status,403);
  assert.equal((await f.request('DELETE','/api/proveedores/PRV1','c',{version:1})).status,409);
  assert.equal((await f.request('PATCH','/api/proveedores/PRV1','c',{version:1,status:'INACTIVE'})).status,200);
  assert.equal((await f.request('DELETE','/api/proveedores/PRV1','c',{version:2})).status,200);
}));
test('administracion separada: un Director no administra y Administrador sin rol negocio inicia sesion',()=>fixture(async f=>{
  for(const role of ['s','g','d','c'])assert.equal((await f.request('GET','/api/admin/usuarios',role)).status,403);
  assert.equal((await f.request('GET','/api/admin/usuarios','a')).status,200);
  assert.equal(f.calls.admin,1);
  const login=await f.request('POST','/api/auth/login',null,{email:'admin@example.invalid',password:'placeholder'});
  assert.equal(login.status,200);assert.equal(login.data.user.role,'administrador');
}));


test('regresion formulario: cantidades fuera de rango no inician Step Functions',()=>fixture(async f=>{
  for(const cantidad of [0,-1,1.5,10001,55555]) {
    const data={...payload,amount:Math.max(1,cantidad),articulos:[{nombre:'Cuaderno',cantidad,precioUnitario:1}]};
    const result=await f.request('POST','/api/solicitudes','s',data);
    assert.equal(result.status,400,'cantidad '+cantidad);
  }
  assert.equal(f.calls.starts,0);
  assert.equal(f.docs.size,0);
  for(const cantidad of [2,10000]) {
    const data={...payload,description:'Compra completa de cuadernos',amount:cantidad,articulos:[{nombre:'Cuaderno',cantidad,precioUnitario:1}]};
    const result=await f.request('POST','/api/solicitudes','s',data);
    assert.equal(result.status,202,'cantidad valida '+cantidad);
    const stored=f.docs.get(result.data.requestId);
    assert.equal(stored.description,data.description);
    assert.equal(stored.amount,cantidad);
  }
  assert.equal(f.calls.starts,2);
}));

test('regresion formulario: envio invalido conserva borrador sin bloquear ni iniciar flujo',()=>fixture(async f=>{
  await f.request('POST','/api/borradores','s',payload);
  const draft=f.drafts.get('owner:D1');
  // Simular documento legado: no depender de la validacion al crearlo.
  draft.articulos=[{nombre:'Cuaderno',cantidad:55555,precioUnitario:1}];
  draft.amount=55555;
  const result=await f.request('POST','/api/borradores/D1/enviar','s',{version:1});
  assert.equal(result.status,400);
  assert.equal(f.calls.starts,0);
  assert.equal(draft.status,'DRAFT');
  assert.equal(draft.requestId,undefined);
  assert.equal(draft.submissionPayload,undefined);
}));
