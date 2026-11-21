# Integración del backend AURA G7 — 13 de noviembre de 2026

Este cambio corresponde a Dev 2 (backend). Implementa los CRUD y las reglas del documento «Proyecto 7 - CN 2026», páginas 1 y 2. El registro con correo verificado y aprobación administrativa es una ampliación solicitada por Andrés. El código del frontend, el diseño de Step Functions, las tablas y los permisos AWS pertenecen a sus responsables y no se modifican con este cambio.

## Qué contiene el backend

- Autenticación real Cognito con Access Token: firma, emisor, cliente, expiración, usuario y correo verificado; no hay login simulado ni se confía en el rol enviado por el navegador.
- Borradores privados persistidos en DynamoDB: crear, consultar, editar artículos antes de enviar, eliminar y enviar una sola vez con snapshot inmutable y recuperación del mismo intento.
- Solicitudes: creación mediante Step Functions, consulta, seguimiento del registro, dictamen con comentario obligatorio y anulación por su propietario mientras estén pendientes.
- Proveedores: catálogo activo, registro, actualización fiscal/bancaria y baja lógica de inactivos; solo Compras administra. Los otros roles no reciben datos fiscales ni bancarios.
- Bandeja de aprobaciones pendientes filtrada por rol, importe, propiedad y asignación individual si existe.
- Registro, confirmación de correo y reenvío de código. Confirmar el correo no concede un rol ni acceso a compras.
- Administración de altas y cambios de rol para cuentas aprobadas por este flujo. Administrador es una capacidad de cuentas separada de los cuatro roles comerciales.
- Control de versiones y escrituras condicionales; límites de cuerpo, CORS exacto, límites de intentos y errores sin detalles privados.

Todo dato de negocio nuevo se escribe en AWS. Los dobles en las pruebas son únicamente para verificación automatizada y nunca forman un modo de respaldo del servidor.

## Matriz de roles

| Operación | Solicitante | Gerente | Director | Compras | Administrador de cuentas |
|---|---|---|---|---|---|
| Borradores | Solo propios; crear/editar/eliminar/enviar | Sin acceso | Sin acceso | Sin acceso | Sin acceso comercial por defecto |
| Crear solicitud | Sí; propietario tomado del token | No | No | No | No |
| Consultar solicitudes | Solo propias | Importes positivos hasta USD 1,000 | Más de USD 1,000 | Todas las solicitudes enviadas | No por tener solo grupo administrativo |
| Aprobar/rechazar | No | Pendientes de hasta USD 1,000 | Pendientes mayores de USD 1,000 | No | No |
| Anular | Solo propia y PENDING, con comentario | No | No | No | No |
| Catálogo | Proveedores activos, resumen | Resumen | Resumen | Datos completos y CRUD | No |
| Aprobar altas/cambiar rol de cuentas | No | No | No | No | Sí; sin autoaprobación ni concesión de Administrador |

Nadie aprueba su propia compra. USD 1,000 corresponde al Gerente; USD 1,000.01 al Director. El documento describe enrutamiento por monto, no exige que Gerente y Director aprueben sucesivamente. Si existe `assignedApproverSub`, únicamente ese aprobador elegible puede dictaminar; sin ese campo, la bandeja es compartida por los usuarios del rol elegible. No existe jerarquía individual/departamental configurada que permita inventar un gerente específico.

Guardar borrador permite completar información sin iniciar una compra. Enviarlo congela sus artículos y abre el flujo. Compras debe recibir solicitudes enviadas, no borradores privados; su tarea aquí es seguimiento y proveedores, no dictaminar. Órdenes de compra ejecutadas, pagos, recepción y un quinto rol comercial no forman parte de este contrato.

## Contrato HTTP para Carlos (frontend)

Base: `https://6pkbutuqre.execute-api.us-east-2.amazonaws.com`. JSON con `Content-Type: application/json`. Rutas privadas con `Authorization: Bearer <accessToken>`. Nunca enviar un ID Token como sustituto.

Conservar la configuración actual del frontend: no sustituir a ciegas todo `window.AURA_CONFIG`, porque ya tiene funciones y otras propiedades. Desactivar efectivamente todas las simulaciones de login, datos y escritura en producción. Un 400, 401, 403, 409, 429, 5xx o error de red nunca autoriza una sesión ni crea una compra local.

### Autenticación, alta y administración

| Método/ruta | Entrada | Resultado |
|---|---|---|
| POST `/api/auth/login` | `{email,password}` | 200 con `tokens.accessToken`, `tokens.expiresIn`, `user.roles`, `user.role`; 401 credenciales inválidas; 403 cuenta no autorizada |
| GET `/api/auth/me` | Token | Identidad validada, grupos y `isAdmin` |
| POST `/api/auth/logout` | Token | Revoca sesión en Cognito; después borrar estado/token de la UI |
| POST `/api/auth/registro` | `{email,password,name}` | 202 genérico; Cognito envía verificación si procede. No aceptar role/groups/isAdmin |
| POST `/api/auth/confirmar` | `{email,code}` | 200: correo confirmado; sigue pendiente de aprobación |
| POST `/api/auth/reenviar` | `{email}` | 200 genérico, con límites de intentos |
| GET `/api/admin/usuarios` | Administrador | Pendientes verificados y operaciones APPLYING; paginado |
| GET `/api/admin/usuarios?estado=APPROVED` | Administrador | Aprobados por el flujo; también se puede filtrar REJECTED o APPLYING |
| PATCH `/api/admin/usuarios/:sub` | `{decision:"APPROVED",role:"Solicitante",version:1,comments:"Empleado verificado"}` | Asigna exactamente un rol, revoca sesiones previas y registra auditoría |
| PATCH misma ruta | `{decision:"REJECTED",version:1,comments:"Motivo"}` | Rechaza acceso sin asignar grupo |
| PATCH misma ruta para cambiar rol | `decision:"APPROVED"`, otro `role` y versión actual del registro aprobado | Bloquea acceso durante el cambio, sustituye rol comercial y obliga a iniciar sesión otra vez |

Registro de acceso: `AWAITING_EMAIL → PENDING_APPROVAL → APPLYING → APPROVED/REJECTED`. La bandeja constituye la notificación administrativa; el frontend debe consultarla y mostrar el contador. No se implementó un correo de aviso al administrador. Los cuatro usuarios existentes con grupos ya asignados conservan su acceso; esta versión no los importa automáticamente al registro de nuevas altas.

El navegador no selecciona el grupo. Para altas nuevas el acceso exige correo verificado **y** aprobación, incluso si hubo un fallo parcial de Cognito. El grupo administrativo inicial lo crea/asigna el responsable AWS de forma controlada a la cuenta que el equipo designe; un Director no es administrador automáticamente. No cambiamos contraseñas ni implementamos recuperación/cambio de contraseña en esta entrega.

### Borradores y solicitudes

| Método/ruta | Contrato |
|---|---|
| GET/POST `/api/borradores` | Lista propios / crea borrador incompleto y devuelve `borrador.id`, `version`, `status` |
| GET/PATCH/DELETE `/api/borradores/:id` | PATCH envía campos parciales y `version`; DELETE envía `{version}`. Solo DRAFT |
| POST `/api/borradores/:id/enviar` | `{version}` de la versión original que se envía. Devuelve 202, `requestId`, REGISTERING |
| POST `/api/solicitudes` | Creación directa con datos completos; opcional `Idempotency-Key` estable por intento (16–100 letras/números/_/-) |
| GET `/api/solicitudes` | Solicitudes visibles según identidad; `limit` 1–100 y `cursor` opcional |
| GET `/api/solicitudes/:id` | Solicitud autorizada; ajena/no existente devuelve 404 |
| GET `/api/solicitudes/:id/registro` | REGISTERING / PERSISTED con documento / FAILED |
| GET `/api/aprobaciones` | Solo Gerente/Director; pendientes elegibles, no autoaprobaciones |
| PATCH `/api/solicitudes/:id/decision` | `{decision:"APPROVED" o "REJECTED",comentarios:"Texto obligatorio"}` |
| POST `/api/solicitudes/:id/anular` | `{comentarios:"Motivo"}`, solo solicitante propietario y PENDING; devuelve CANCELLED |

Campos completos de una solicitud, sin `applicant`, `applicantSub`, estado o rol enviados por la UI:

```json
{
  "description": "Material para oficina",
  "department": "DEP-TI",
  "proveedorId": "ID_REAL_DEL_CATALOGO_AWS",
  "amount": 25,
  "articulos": [{"nombre":"Cuaderno","cantidad":1,"precioUnitario":25}]
}
```

Se aceptan aliases `descripcion`, `departamento`, `monto`, `items` y `precio`; importes contradictorios se rechazan. Para borradores utilizar números JSON en montos, precios y cantidades. El borrador admite campos incompletos; el envío exige 1–50 artículos completos, cantidades enteras 1–10,000, importes positivos con dos decimales y total exacto hasta USD 10,000,000.

Un 202 **no confirma persistencia**. Consultar registro hasta PERSISTED, FAILED o límite de espera visible; conservar el mismo intento ante una respuesta perdida. Después de bloquear un borrador, `version` avanza; para reintentar el envío usar **`submitVersion`**, no la nueva versión de edición. No generar otro borrador/clave automáticamente. Si el flujo falla, la operación queda bloqueada para investigación y no se ofrece un botón que la duplique silenciosamente.

El listado devuelve `solicitudes` o `borradores`, `total`, `alcanceTotal:"pagina"`, `siguienteCursor` y `hayMasRegistros`. El total corresponde a esa página. Consumir todos los cursores para totales globales; una página vacía puede tener siguiente cursor. No mezclar arrays de demostración con la API ni contar solicitudes pertenecientes al usuario anterior. Los envíos ya iniciados dejan de aparecer como borradores editables.

Mostrar CANCELLED como anulado, separado de aprobado/rechazado. No permitir edición de solicitudes enviadas. Una decisión repetida o una versión antigua devuelve 409; recargar antes de continuar. Los comentarios son obligatorios **también al aprobar** para cumplir el PDF. 400/401/403 esperados en pruebas negativas no son fallos del servidor.

### Proveedores

GET/POST `/api/proveedores`; GET/PATCH/DELETE `/api/proveedores/:id`. POST Compras acepta `name` obligatorio y opcionales `legalName`, `taxId`, `bankName`, `bankAccount`, `category`, `contactEmail`, `phone`, `status:"ACTIVE"|"INACTIVE"`. PATCH es parcial más `version`. DELETE recibe `{version}` y solo admite INACTIVE; se conserva baja lógica DELETED para no romper referencias históricas.

Solicitante consulta activos y solo resumen; Gerente/Director ven resumen de catálogo; Compras administra datos completos. Un borrador/solicitud nueva necesita un proveedor ACTIVE existente. Los proveedores que ahora son demostraciones del navegador deben cargarse en el catálogo AWS por Compras antes de seleccionarlos. No se migran datos desde localStorage a la tabla sin revisión.

## Correcciones obligatorias del frontend que el backend no puede hacer

1. Quitar login simulado, fallback de contraseña/correo arbitrarios y cualquier ruta que fuerce un usuario ficticio. Las credenciales incorrectas deben mantener al usuario en login, sin token ni datos previos.
2. Quitar tarjetas de acceso rápido de producción y cualquier contraseña embebida. Una tarjeta que solo rellena correo no autentica, pero aquí también se solicita retirarla.
3. Abrir la guía visual como página pública sin sidebar, identidad ni acceso a módulos privados. Proteger navegación y renderizado con sesión validada por `/auth/me`.
4. Ante 401 limpiar sesión y redirigir una sola vez. Evitar bucles de modal y que el catch active datos locales. Ante 403 mostrar falta de permiso; mantener el control de permisos del servidor.
5. Usar Access Token, no ID Token; esperar fin del login antes de cargar solicitudes. Separar estados «autenticando», «pendiente de aprobación», «conectado» y «error de red».
6. Añadir registro, verificación, espera administrativa y panel de cuentas con estos endpoints; ocultar operaciones que el rol no puede ejecutar. Compras no aprueba/rechaza ni ve borradores ajenos.
7. Mostrar errores de campo, 409 y 429; no afirmar «guardado» sin confirmación. No exponer datos privados en la guía ni guardar sesiones/datos mock como si fueran reales.
8. Renderizar nombres, descripciones, comentarios y proveedores con `textContent` o escape contextual. No insertar texto de usuario con `innerHTML`; las respuestas JSON del backend no son HTML confiable.

## Instrucciones para responsable AWS / base de datos

No ejecutar una sustitución global de variables: preservar las variables y permisos existentes. Estas instrucciones son para su cambio de infraestructura; el backend no crea tablas, grupos, permisos ni cuentas administrativas automáticamente.

1. Crear una tabla separada, nombre propuesto `g7-dev-aura-business`, en us-east-2, con `pk` string como HASH y `sk` string como RANGE. Mantener intacta `g7-dev-solicitudes` (PK `requestId`). Usar cifrado administrado, recuperación PITR y capacidad apropiada. No guardar passwords, códigos de verificación ni tokens en la nueva tabla.
2. Diseño: borradores `pk=USER#<sub>`, `sk=DRAFT#<uuid>`; proveedores `pk=SUPPLIERS`, `sk=SUPPLIER#<uuid>`; altas `pk=ACCESS_REQUESTS`, `sk=USER#<sub>`. Sin índices nuevos requeridos. No escribir registros CONFIG con secretos; la lectura CONFIG solo verifica disponibilidad.
3. Preparar el rol de ejecución para operaciones del SDK presentes en el backend contra esta tabla y el User Pool indicado. Generar y revisar la política desde el código con IAM Policy Autopilot (comando abajo); restringir tabla, pool y máquina de estados a sus ARNs. No usar AdministratorAccess ni `Resource:*` para solventar errores de autorización. Conservar permisos actuales para solicitudes, StartExecution/DescribeExecution y logs.
4. Cognito debe admitir alta por el app client, envío/verificación de email y `USER_PASSWORD_AUTH` ya utilizado. Usar cliente público sin secreto para este contrato; no añadir autoasignación de grupos ni triggers que concedan acceso al confirmar. Confirmar cuota/entrega del correo con una dirección real controlada por el equipo.
5. Crear grupo `Administrador` y designar cuenta administrativa con email real verificado. No reutilizar contraseñas ni asignar este grupo a todos los cuatro usuarios de pruebas.
6. Agregar en Lambda `BUSINESS_TABLE=g7-dev-aura-business`, `ADMIN_GROUP=Administrador`. Activar `REGISTRATION_ENABLED=true` solamente cuando tabla, IAM, correo y grupo funcionen. Mantener `NODE_ENV=production`, Cognito/pool/client, tabla solicitudes y ARN del flujo actuales. Con funcionalidades sin configurar los endpoints nuevos responden 503: no crean respaldos locales. El API anterior sigue disponible.
7. CORS: conservar origen exacto S3 mientras exista y añadir el dominio HTTPS definitivo. No usar `*`. Permitir GET, POST, PATCH, DELETE, OPTIONS y headers Authorization, Content-Type, Accept, Idempotency-Key en HTTP API. OPTIONS debe responder sin pedir token. Exponer Retry-After y X-Request-Id; alinear la configuración de API Gateway con Express.
8. Publicar el sitio por HTTPS (CloudFront u hosting equivalente) antes de permitir registros/contraseñas reales desde internet. S3 website actual usa HTTP. Ajustar origen al dominio HTTPS y evitar que el frontend siga usando URLs locales.
9. La Lambda del flujo que persiste solicitudes debe conservar `requestId`, `applicantSub`, `applicant`, `amount`, artículos, proveedor, departamento y `requiereAprobacionDe`. No sustituir el dueño con datos del cliente; no insertar dos veces ni sobrescribir un registro decidido/anulado. El backend envía estos campos, pero no modifica la Lambda de Dev 3.
10. El enrutamiento es <=1000 Gerente y >1000 Director. Persistir PENDING una vez. Si añaden aprobadores individuales, calcular `assignedApproverSub` desde una jerarquía fiable y conservarlo en la escritura. No aceptar ese valor arbitrariamente desde el frontend.
11. Desplegar solo el código backend comprobado con Node 22 y adaptador compatible 4.17.1, manteniendo `src/lambda.handler`. Subir a GitHub no implica despliegue; actualizar la Lambda mediante el proceso del equipo. No incluir `.env`, credenciales, tests o archivos del frontend en el ZIP de producción.

Comando propuesto para generar una **base revisable** de política a partir del SDK, desde un equipo con uvx. No aplica ni sube permisos:

```powershell
uvx iam-policy-autopilot@latest generate-policies `
  "C:\Users\andre\OneDrive\Desktop\awsgrupo7\compras-g7\backend\src\server.js" `
  --region us-east-2 --account 021686096746 --pretty
```

Verificar soporte de SDK v3 y flags con `generate-policies --help`. Revisar que detecte el monolito empaquetado; si no, analizar las fuentes internas usadas para generarlo que se adjuntan como material backend, sin duplicar el runtime. Revisar/estrechar cualquier ARN indeterminado antes de aplicar. La salida de un generador no es autorización para modificar IAM.

Referencia funcional para su revisión: la administración usa consulta de usuario/grupos, alta y retiro de grupos comerciales y revocación global de sesiones; el acceso público usa SignUp, ConfirmSignUp y ResendConfirmationCode. Nunca se asigna Administrador desde la API. Las condiciones DynamoDB verifican versiones, estado y propietario. [Condiciones DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html), [alta y verificación Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html), [revocación administrativa](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminUserGlobalSignOut.html).

## Validación antes de dar la integración por terminada

Las pruebas unitarias/HTTP/adapter aisladas verifican contratos y carreras, no acreditan por sí solas IAM, correos ni despliegue real. Mantener una dirección y registros de prueba identificables; no aprobar compras de terceros.

1. AWS: `/health` 200; sin token `/api/solicitudes` 401; origen ajeno 403; preflight exacto con DELETE 204.
2. Login real de los cuatro roles y contraseña incorrecta 401; correo inexistente sin sesión. `/auth/me` debe devolver grupo correcto. Ejecutar desde el hosting HTTPS definitivo.
3. Registro real → llega código → verificar → login todavía denegado → aparece pendiente al Administrador → aprobar Solicitante → nuevo login y acceso. Cliente que envía role/isAdmin al alta: 400.
4. Rechazo de alta no permite acceso. Cambio de rol de una cuenta aprobada invalida sesión anterior y exige nuevo login; doble decisión no duplica ni cambia otro usuario.
5. Compras crea proveedor → Solicitante lo ve sin banco/NIT → otros roles no pueden editar. Desactivar y dar baja sin perder compras históricas.
6. Solicitante guarda borrador incompleto, cierra sesión y lo recupera desde otro navegador; otro Solicitante y Compras no pueden leerlo. Completar, enviar y confirmar PERSISTED; repetir mismo intento sin duplicado.
7. Crear solicitudes de 1000 y 1000.01; bandejas/decisiones del rol correcto. Comentario vacío 400; autoaprobación 403; Compras no dictamina. Consultar historial en DynamoDB.
8. Anular pendiente propia; una carrera con dictamen deja un solo estado final. Anular aprobada/rechazada vuelve 409.
9. Logout/expiración limpian UI; guía pública no crea sesión. Apagar PC y repetir con el sitio publicado: debe depender de AWS solamente.

## Límites conocidos y recuperación

- La asignación de grupos Cognito y el registro DynamoDB no forman una única transacción. Se bloquea la cuenta en APPLYING y se conserva operación/versiones para reintentar; no se declara éxito al fallar un paso. Hay exclusión temporal del trabajador y auditoría. Después de un cierre abrupto puede ser necesario esperar hasta 16 minutos antes de reintentar la misma operación; no editar a mano un grupo para saltar ese bloqueo. El plazo se dimensionó para Lambda, cuyo tiempo máximo de ejecución es inferior a la concesión; no reutilizar este mecanismo en procesos sin tiempo máximo sin revisar esa hipótesis.
- Los límites de Express son por proceso Lambda. Para protección distribuida/cuotas de registro, el equipo AWS debe complementar límites y monitoreo en los servicios. No realizar pruebas de carga en la cuenta por este motivo.
- Los datos antiguos incompletos no reciben un dueño inventado ni permisos nuevos. Un registro con `monto` pero sin `amount`, estado canónico y propietario necesita revisión/migración por el responsable de datos; Compras puede verlo para diagnóstico, pero no queda habilitado para dictaminar.
- No se implementan sesiones simuladas, aprovisionamiento automático de AWS, envío SMTP desde Express, importación masiva ni cambios de contraseña. El problema visual de modal/guía/tarjetas requiere el cambio de Carlos; debilitar 401/403 del backend lo empeoraría.
- No se promete funcionamiento completo del sitio hasta que AWS y frontend integren y pasen la matriz anterior.
