import urllib.request,urllib.error,json,datetime,os,time,uuid,pathlib,sys
BASE='https://6pkbutuqre.execute-api.us-east-2.amazonaws.com'
OUT=pathlib.Path('outputs'); RUN='QA-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
OUT.mkdir(exist_ok=True)
results=[]; tokens={}; secret_keys={'password','accessToken','idToken','refreshToken','AccessToken','IdToken','RefreshToken','authorization','Authorization'}
def clean(x):
    if isinstance(x,dict):return {k:('[REDACTADO]' if k in secret_keys else clean(v)) for k,v in x.items()}
    if isinstance(x,list):return [clean(v) for v in x]
    return x
def call(name,method,path,role=None,body=None,expected=200,check=None,headers=None):
    h={'Accept':'application/json',**(headers or {})}
    if role:h['Authorization']='Bearer '+tokens[role]
    if body is not None:h['Content-Type']='application/json'
    row={'caso':name,'metodo':method,'ruta':path,'rol':role,'entrada':clean(body),'esperado':expected}
    try:
        req=urllib.request.Request(BASE+path,headers=h,data=None if body is None else json.dumps(body).encode(),method=method)
        try:r=urllib.request.urlopen(req,timeout=30)
        except urllib.error.HTTPError as e:r=e
        raw=r.read().decode(); data=json.loads(raw) if raw else {}
        ok=r.code in (expected if isinstance(expected,list) else [expected])
        if check:ok=ok and bool(check(data))
        row.update(status=r.code,aprobado=ok,respuesta=clean(data),requestId=r.headers.get('X-Request-Id'))
        if path in ('/api/aprobaciones','/api/proveedores') and method=='GET':
            row['respuesta']={k:v for k,v in row['respuesta'].items() if k not in ('solicitudes','items','proveedores','siguienteCursor')}
            row['respuesta']['nota']='Listado omitido para no publicar datos de negocio ajenos a esta prueba.'
    except Exception as e:
        row.update(aprobado=False,error=type(e).__name__+': '+str(e)); data={}
    results.append(row); print(name,json.dumps({k:row[k] for k in ('status','aprobado','error') if k in row}),flush=True)
    save();return data
def save():
    (OUT/'pruebas-autenticadas-aws.json').write_text(json.dumps({'fechaUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'run':RUN,'baseUrl':BASE,'resultados':results},ensure_ascii=False,indent=2),encoding='utf8')
creds=json.loads(os.environ['AURA_QA_CREDENTIALS'])
for role,cred in creds.items():
    d=call('Login '+role,'POST','/api/auth/login',body={'email':cred['email'],'password':cred['password']},check=lambda d:bool(d.get('tokens',{}).get('accessToken')))
    token=d.get('tokens',{}).get('accessToken')
    if token:tokens[role]=token
for role in tokens:
    call('Identidad '+role,'GET','/api/auth/me',role,check=lambda d,r=role:r in json.dumps(d))
call('Contrasena incorrecta cuenta existente','POST','/api/auth/login',body={'email':creds['Solicitante']['email'],'password':'QA-incorrecta-'+uuid.uuid4().hex},expected=401)
if 'Solicitante' not in tokens:raise SystemExit('No se obtuvo acceso Solicitante; detener pruebas dependientes')
for role in ('Gerente','Director','Compras'):
    if role in tokens:call('Borradores bloqueados para '+role,'GET','/api/borradores',role,expected=403)
call('Administracion bloqueada a Solicitante','GET','/api/admin/usuarios','Solicitante',expected=403)
for role in ('Gerente','Director'):
    if role in tokens:call('Bandeja '+role,'GET','/api/aprobaciones',role)
catalog=call('Catalogo resumen Solicitante','GET','/api/proveedores','Solicitante',check=lambda d:all(not any(k in p for k in ('bankAccount','bankName','taxId')) for p in d.get('proveedores',[])))
suppliers=catalog.get('proveedores',[]); supplier=next((p for p in suppliers if p.get('status')=='ACTIVE'),None)
if not supplier and 'Compras' in tokens:
    supplier=call('Crear proveedor exclusivo QA','POST','/api/proveedores','Compras',{'name':RUN+' proveedor','status':'ACTIVE'},201).get('proveedor')
draft=call('Crear borrador QA incompleto','POST','/api/borradores','Solicitante',{'description':RUN+' borrador','department':'DEP-TI'},201).get('borrador')
if not draft:raise SystemExit('No se creo borrador; detener pruebas dependientes')
did=draft['id']; v=draft['version']; path='/api/borradores/'+did
call('Recuperar borrador propio','GET',path,'Solicitante',check=lambda d:d.get('borrador',{}).get('id')==did)
for role in ('Gerente','Director','Compras'):
    if role in tokens:call('Lectura borrador ajeno por '+role,'GET',path,role,expected=403)
updated=call('PATCH version vigente','PATCH',path,'Solicitante',{'version':v,'description':RUN+' actualizado'},check=lambda d:d.get('borrador',{}).get('version',0)>v).get('borrador')
if not updated:raise SystemExit('PATCH no devolvio borrador')
v2=updated['version']
call('PATCH version anterior conflicto','PATCH',path,'Solicitante',{'version':v,'description':'NO DEBE GUARDARSE'},409)
updated2=call('Segundo PATCH version incrementada','PATCH',path,'Solicitante',{'version':v2,'department':'DEP-QA'},check=lambda d:d.get('borrador',{}).get('version',0)>v2).get('borrador')
if not updated2:raise SystemExit('Segundo PATCH no devolvio borrador')
v3=updated2['version']
call('Persistencia despues de PATCH','GET',path,'Solicitante',check=lambda d:d.get('borrador',{}).get('department')=='DEP-QA' and d.get('borrador',{}).get('description')==RUN+' actualizado')
if supplier:
    full={'version':v3,'description':RUN+' compra de prueba','department':'DEP-QA','proveedorId':supplier['id'],'amount':25,'articulos':[{'nombre':'Articulo QA sin compra real','cantidad':1,'precioUnitario':25}]}
    complete=call('Completar borrador con precios numericos','PATCH',path,'Solicitante',full).get('borrador')
    if complete:
        ver=complete['version']
        call('Recuperar precios del borrador','GET',path,'Solicitante',check=lambda d:d.get('borrador',{}).get('articulos',[{}])[0].get('precioUnitario')==25)
        sent=call('Enviar borrador QA','POST',path+'/enviar','Solicitante',{'version':ver},202,lambda d:d.get('estado')=='REGISTERING')
        rid=sent.get('requestId')
        if rid:
            current=call('Consultar borrador tras envio','GET',path,'Solicitante').get('borrador',{})
            call('Bloqueo PATCH despues del envio','PATCH',path,'Solicitante',{'version':current.get('version',ver),'description':'NO DEBE GUARDARSE'},409)
            call('Reintento envio conserva requestId','POST',path+'/enviar','Solicitante',{'version':ver},202,lambda d:d.get('requestId')==rid and d.get('reused') is True)
            for attempt in range(6):
                state=call('Seguimiento persistencia '+str(attempt+1),'GET','/api/solicitudes/'+rid+'/registro','Solicitante')
                if state.get('estado') in ('PERSISTED','FAILED'):break
                time.sleep(2)
            call('Consultar solicitud QA propia','GET','/api/solicitudes/'+rid,'Solicitante')
            if 'Director' in tokens:call('Director sin alcance al monto 25','GET','/api/solicitudes/'+rid,'Director',expected=404)
            call('Anular solicitud QA propia','POST','/api/solicitudes/'+rid+'/anular','Solicitante',{'comentarios':RUN+' cierre de prueba; sin compra real'})
save()
print('FINAL',sum(r['aprobado'] for r in results),'/',len(results),flush=True)
sys.exit(0 if all(r['aprobado'] for r in results) else 1)
