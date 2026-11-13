# Backend AURA Compras G7

API Express con autenticacion Cognito, persistencia DynamoDB y registro por Step Functions. El codigo de produccion se encuentra en `src/server.js`; `src/lambda.js` conserva el handler `src/lambda.handler`. `auth-cognito.js` y `login-cognito.js` son archivos anteriores que este servidor no importa.

La version del adaptador esta fijada a `@codegenie/serverless-express` 4.17.1 para compatibilidad con Node.js 22. La version 5.0.0 requiere Node.js 24 o superior. Conservar package-lock.json junto con package.json; `npm ci` reconstruye las versiones verificadas.

## Desarrollo local

Desde esta carpeta, configurar las variables indicadas en `.env.example`. No sobrescribir un `.env` existente ni compartirlo. Usar los identificadores reales del entorno; los valores REEMPLAZAR no son funcionales. No guardar claves AWS o contrasenas en el codigo ni en la plantilla.

En PowerShell, seleccionar el perfil existente y arrancar:

```powershell
$env:AWS_PROFILE = "g7-backend"
npm start
```

El servidor escucha por defecto en `http://127.0.0.1:3000`. Un puerto ocupado produce EADDRINUSE y codigo de salida 1. El proceso debe reiniciarse despues de cambiar codigo. En Lambda usar el rol de ejecucion, sin perfil local.

```powershell
node --check src/server.js
npm test
```

Las pruebas usan servicios inyectados y servidores efimeros locales; no escriben en AWS. Una prueba manual contra el servidor real si puede escribir en AWS aunque la URL sea local.

## Contrato y permisos

`POST /api/auth/login` devuelve accessToken y usuario con role compatible con el cliente actual. Las rutas protegidas requieren `Authorization: Bearer <access token>`. Se verifican firma, emisor, cliente, uso y vencimiento del token, grupos autorizados y atributos de GetUser. `POST /api/auth/logout` solicita GlobalSignOut; el frontend debe invocarlo para revocar la sesion remota. No se implementa cambio de contrasenas.

| Rol | Lectura | Creacion | Decision |
| --- | --- | --- | --- |
| Solicitante | Propias | Si | No |
| Gerente | Montos mayores de 0 y hasta 1000 USD | No | PENDING de su rango, sin autoaprobacion |
| Director | Montos mayores de 1000 USD | No | PENDING de su rango, sin autoaprobacion |
| Compras | Todas | No | No |

`POST /api/solicitudes` valida textos, proveedorId, cantidades enteras, precios y total exacto en centavos. Admite nombres alternativos usados por el frontend. Importes duplicados deben ser validos y equivalentes. La identidad procede de Cognito; no del cuerpo enviado por el cliente.

Un 202 significa REGISTERING, no persistencia confirmada. Consultar `GET /api/solicitudes/:id/registro` hasta PERSISTED o FAILED. El backend inicia el flujo; no inserta la solicitud antes de Step Functions. Una salida explicita de fallo se interpreta como FAILED aunque AWS reporte SUCCEEDED.

`Idempotency-Key` es opcional para conservar compatibilidad. Si se envia, debe tener entre 16 y 100 caracteres alfanumericos, guion o guion bajo. Mantener la misma clave y payload para reintentar la misma operacion; datos distintos producen conflicto. Sin clave no se garantiza deduplicacion.

`GET /api/solicitudes` acepta limit entre 1 y 100 y cursor opaco. total corresponde a la pagina, no a toda la tabla. Usar siguienteCursor y hayMasRegistros; cada llamada evalua como maximo cinco paginas de DynamoDB. Se aplica autorizacion defensiva a los registros devueltos. Un indice opcional por correo no garantiza recuperar registros tras cambiar el correo.

`PATCH /api/solicitudes/:id/decision` acepta APPROVED o REJECTED; el rechazo requiere motivo. Admite comentarios/comments/comentario si no se contradicen. Una condicion atomica verifica estado, monto, rol y propietario; las decisiones concurrentes devuelven conflicto. Los registros antiguos incompletos no reciben un propietario o permiso inventado.

## Protecciones y limites

- CORS restringido a FRONTEND_ORIGINS; cabeceras sin cache y errores internos sanitizados.
- Limite previo a autenticacion: 300 peticiones por IP/minuto. Login: 20 por IP/5 minutos y 10 por cuenta/5 minutos. Sesion autenticada: 120 por usuario/minuto. Se responde 429 con Retry-After.
- Los contadores son por proceso y ventana fija. No constituyen proteccion distribuida entre instancias Lambda. La capacidad adicional corresponde a API Gateway/WAF y al responsable de AWS.
- La IP local ignora X-Forwarded-For; en Lambda procede del contexto de API Gateway.
- JSON de login limitado a 16 KB y API a 100 KB. Los tokens y contrasenas no se imprimen en los logs del servidor.
- proveedorId se valida por formato; no se consulta un catalogo ni se implementa CRUD de proveedores.
- La Lambda escritora inspeccionada conserva correo y descarta applicantSub. Corregirla requiere coordinacion con AWS. Hasta entonces los registros sin sub usan compatibilidad por correo.
- Los cambios locales no actualizan automaticamente la Lambda desplegada. No incluir `.env`, pruebas ni credenciales en un paquete de produccion.

El frontend puede conservar sesiones simuladas, borradores y totales diferentes. Esas pantallas no demuestran persistencia; verificar las respuestas de esta API. Este trabajo no cambia el frontend.

## Empaquetado

El proyecto es privado y package.json limita el empaquetado npm a src/server.js y src/lambda.js, ademas de los metadatos y README incluidos por npm. Se comprobo con `npm pack --dry-run --json` que .env, pruebas y modulos antiguos quedan excluidos. No ejecutar npm publish. Esta lista no protege un ZIP armado manualmente: quien prepare el despliegue Lambda debe excluir explicitamente .env y credenciales e incluir las dependencias de produccion. No se genero ni publico un paquete en esta comprobacion.

## Integracion con el frontend S3

El origen publicado es `http://g7-dev-frontend-aura-021686096746.s3-website.us-east-2.amazonaws.com`. Esta incluido en `.env.example` para documentar la configuracion. La plantilla no se carga automaticamente en Lambda: conservar esa lista en las variables de entorno del despliegue o en la plantilla de infraestructura que administre el responsable AWS. No subir .env a Git.

Usar origenes exactos y sin barra final; no agregar `*` como permiso global. El middleware actual responde OPTIONS con 204 para los origenes permitidos y rechaza los demas con 403. Solo anuncia GET, POST, PATCH y OPTIONS, que corresponden al contrato actual. API Gateway tiene su propia configuracion CORS y debe coordinarse con esta lista.

Para integradores del frontend: el login devuelve `tokens.accessToken` y `user`; no devuelve un token plano en `data.token`. Un 401 por credenciales invalidas debe mostrarse como rechazo y nunca habilitar una sesion simulada. La implementacion visual y el almacenamiento de la sesion corresponden al frontend.

Si la API devuelve 503 incluso en health, comprobar Lambda antes de atribuirlo a CORS. `ReservedFunctionConcurrentInvocationLimitExceeded` indica rechazo por el limite de concurrencia reservada; requiere revision de configuracion/capacidad por el responsable AWS. No se debe intentar solucionar permitiendo cualquier origen.
