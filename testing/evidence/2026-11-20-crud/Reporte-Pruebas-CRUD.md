# Compras G7 Pruebas CRUD finales

Fecha de ejecución: viernes, 20 de noviembre de 2026, 10:43:28 p. m. GMT-6. Registro UTC: 2026-11-21T04:43:28.001Z.

Resultado final: **61 peticiones, 75 aserciones Newman aprobadas, 0 fallos**. Seis verificaciones directas en DynamoDB Local y cuatro pruebas de protección de configuración aprobadas.

## Proyecto y diagnóstico

- Repositorio AURA: `https://github.com/AndrWes44/compras-g7.git`, rama `feature/testing`, base local `5a4c778`. Copia de trabajo localizada en `work/compras-g7`.
- En el Escritorio se encontró `proyecto-final-computo-nube`, una demo distinta con contratos id/centavos, adaptadores memory/sqlite/DynamoDB y perfiles locales. No se modificó ni se usó su base.
- La colección y el entorno pedidos estaban en Descargas. Su contrato coincide con la versión local de `compras-g7`: Express, clave `requestId`, campos `descripcion`, `solicitante`, `departamento`, `monto`, POST 201 y GET 200.
- El servidor original es monolítico: `backend/src/server.js` contiene rutas, validación y llamadas SDK. No hay controladores ni servicios separados. `backend/scripts/crearTablaLocal.js` declara la clave requestId String. El cliente original apunta a `http://127.0.0.1:8000`, con credenciales ficticias local; no usa AWS remoto.
- En esta versión local original no existen PUT, DELETE ni GET por ID. La colección descargada marcaba PUT/DELETE como propuestas pendientes y esperaba erróneamente `data.requestId` en POST: el contrato real devuelve `data.solicitud.requestId`.

## Implementación y límites

Se implementó una variante local aislada en `testing/local-crud/backend/src/server.js`, derivada del servidor local y conservando Express y DynamoDB DocumentClient. El backend compartido original y el despliegue AWS no se modificaron. Las operaciones PUT y DELETE nuevas pertenecen a esta variante ejecutable QA; no se afirma que estén disponibles en producción.

PUT exige los cuatro campos de negocio y rechaza campos desconocidos. UpdateCommand modifica solo esos campos; requestId, fechaCreacion y estado se preservan. DELETE devuelve 204 sin cuerpo. Ambas operaciones usan condiciones atómicas para rechazar registros inexistentes, registros sin el prefijo de prueba y solicitudes cuyo estado no sea PENDING. Un fallo de condición devuelve 404 si el ID no existe y 409 si hay restricción de estado/registro. No se alteraron umbrales de aprobación.

La API AURA AWS de la rama feature/backend tiene otro contrato: envío 202 mediante Step Functions, autenticación Cognito, borradores con PATCH y solicitudes enviadas inmutables con anulación. Allí la solución correcta es editar/eliminar borradores antes de enviarlos y anular una compra pendiente; no habilitar PUT ni borrado físico de compras enviadas para satisfacer una colección antigua. No se hicieron peticiones de escritura a esa API.

## Entorno ejecutado

- API local: http://127.0.0.1:13000, enlace exclusivo a 127.0.0.1.
- DynamoDB Local 3.3.2: http://127.0.0.1:18000, proceso oficial Java 21 separado, modo inMemory y sharedDb dentro de esa instancia exclusiva.
- Tabla creada: G7-TEST-CRUD-solicitudes, clave requestId String, capacidad PAY_PER_REQUEST.
- Newman 6.2.1; dependencias instaladas localmente, sin instalaciones globales.
- El orquestador rechazó una instancia con tablas preexistentes; no se compartieron los puertos 3000/8000 ni las tablas del equipo.
- Los identificadores y datos creados usan G7-TEST-CRUD. La fixture APPROVED se insertó directamente en la instancia QA para comprobar el bloqueo de escrituras; no representa una aprobación humana ejecutada.
- Archivo oficial DynamoDB Local descargado: https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz. SHA256: `7A94EB65F81AEE270738751A4E5E3E6A7AD02A5D25194F55B83E08EC2BA6342B`.

## Registro de la corrida final

requestId temporal: G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941.
Prefijo único de ejecución: G7-TEST-CRUD-17da11ed-90fb-4a52-bc49-f33dff34237a.

## Resultados HTTP ejecutados

| Caso | Método | Endpoint | Esperado | Obtenido | Estado | Errores |
|---|---|---|---|---|---|---|
| 01 Salud y entorno aislado | GET | /health | HTTP 200 | 200 | APROBADO | Ninguno |
| 02 POST crear temporal | POST | /api/solicitudes | HTTP 201 | 201 | APROBADO | Ninguno |
| 03 GET listado contiene temporal | GET | /api/solicitudes | HTTP 200 | 200 | APROBADO | Ninguno |
| 04 GET por requestId | GET | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 200 | 200 | APROBADO | Ninguno |
| 05 PUT actualizar descripcion y monto | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 200 | 200 | APROBADO | Ninguno |
| 06 GET listado confirma actualizacion | GET | /api/solicitudes | HTTP 200 | 200 | APROBADO | Ninguno |
| 07 GET individual confirma actualizacion | GET | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 200 | 200 | APROBADO | Ninguno |
| 08 GET ID inexistente | GET | /api/solicitudes/G7-TEST-CRUD-00000000-0000-4000-8000-000000000001 | HTTP 404 | 404 | APROBADO | Ninguno |
| 09 PUT ID inexistente no crea registro | PUT | /api/solicitudes/G7-TEST-CRUD-00000000-0000-4000-8000-000000000001 | HTTP 404 | 404 | APROBADO | Ninguno |
| 10 DELETE ID inexistente | DELETE | /api/solicitudes/G7-TEST-CRUD-00000000-0000-4000-8000-000000000001 | HTTP 404 | 404 | APROBADO | Ninguno |
| POST descripcion "" | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST descripcion null | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST descripcion "   " | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST solicitante "" | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST solicitante null | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST solicitante "   " | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST departamento "" | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST departamento null | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST departamento "   " | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST monto invalido 0 | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST monto invalido -1 | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST monto invalido "100" | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST monto invalido null | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST monto ausente | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST JSON mal formado | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST array mal formado para contrato | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST cuerpo ausente | POST | /api/solicitudes | HTTP 400 | 400 | APROBADO | Ninguno |
| POST sin prefijo QA | POST | /api/solicitudes | HTTP 403 | 403 | APROBADO | Ninguno |
| PUT descripcion "" | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT descripcion null | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT descripcion "   " | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT solicitante "" | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT solicitante null | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT solicitante "   " | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT departamento "" | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT departamento null | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT departamento "   " | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT monto invalido 0 | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT monto invalido -1 | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT monto invalido "100" | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT monto invalido null | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT monto ausente | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT JSON mal formado | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT array mal formado para contrato | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT cuerpo ausente | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT sin prefijo QA | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 403 | 403 | APROBADO | Ninguno |
| PUT rechaza campo protegido requestId | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT rechaza campo protegido fechaCreacion | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT rechaza campo protegido estado | PUT | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 400 | 400 | APROBADO | Ninguno |
| PUT ID mal formado | PUT | /api/solicitudes/no-es-id | HTTP 400 | 400 | APROBADO | Ninguno |
| DELETE ID mal formado | DELETE | /api/solicitudes/no-es-id | HTTP 400 | 400 | APROBADO | Ninguno |
| GET ID mal formado | GET | /api/solicitudes/no-es-id | HTTP 400 | 400 | APROBADO | Ninguno |
| POST payload demasiado grande | POST | /api/solicitudes | HTTP 413 | 413 | APROBADO | Ninguno |
| PUT registro aprobado protegido | PUT | /api/solicitudes/G7-TEST-CRUD-f596c383-19a2-492c-89e7-94ed00985833 | HTTP 409 | 409 | APROBADO | Ninguno |
| DELETE registro aprobado protegido | DELETE | /api/solicitudes/G7-TEST-CRUD-f596c383-19a2-492c-89e7-94ed00985833 | HTTP 409 | 409 | APROBADO | Ninguno |
| GET registro aprobado sigue intacto | GET | /api/solicitudes/G7-TEST-CRUD-f596c383-19a2-492c-89e7-94ed00985833 | HTTP 200 | 200 | APROBADO | Ninguno |
| GET temporal intacto tras entradas invalidas | GET | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 200 | 200 | APROBADO | Ninguno |
| DELETE exclusivamente el temporal creado | DELETE | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 204 | 204 | APROBADO | Ninguno |
| GET eliminado devuelve 404 | GET | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 404 | 404 | APROBADO | Ninguno |
| GET listado ya no contiene temporal | GET | /api/solicitudes | HTTP 200 | 200 | APROBADO | Ninguno |
| DELETE repetido devuelve 404 | DELETE | /api/solicitudes/G7-TEST-CRUD-a4da0419-9faa-461d-b009-b3a38c777941 | HTTP 404 | 404 | APROBADO | Ninguno |

## Verificación directa de DynamoDB

Estas verificaciones usan GetCommand con ConsistentRead y ScanCommand; no dependen únicamente de lo que devuelva Express. Newman se ejecuta en tres fases para leer la base tras POST, tras PUT y tras DELETE antes de avanzar.

- POST guardado en DynamoDB Local: **APROBADO**.
- PUT persistido preserva requestId fecha y estado: **APROBADO**.
- PUT inexistente no crea un registro: **APROBADO**.
- Solicitud aprobada no cambio: **APROBADO**.
- DELETE confirmado por lectura consistente DynamoDB: **APROBADO**.
- Limpieza tabla QA sin registros restantes: **APROBADO**.

Se confirmó monto original 999.99, monto actualizado 1000, descripción actualizada e ID/fecha/estado originales. El PUT inexistente no creó registros. La fixture APPROVED permaneció idéntica. DELETE eliminó solo el temporal; la fixture se retiró al terminar mediante su ID y una condición que verificó su descripción exclusiva. La tabla terminó con cero registros. No se eliminaron tablas ni registros del equipo.

## Errores encontrados y corregidos

1. Faltaban PUT, DELETE y lectura individual en el contrato local: implementados y ejecutados en la variante QA.
2. La colección inicial capturaba un requestId en el nivel JSON equivocado: corregida para `solicitud.requestId` y conservación de fechaCreacion.
3. El primer intento pasó 57 peticiones HTTP, pero se detuvo en una comparación de evidencia que esperaba “actualizado” en lugar de “solicitud actualizada”. Era un error del orquestador, no del backend. Se corrigió, se reinició exclusivamente el proceso DynamoDB en memoria creado para esta prueba y se repitió la suite completa. El intento fallido se conserva en evidencia/intento-1 y no se presenta como exitoso.
4. El lanzador Oracle javapath de Windows dejaba una JVM hija abierta tras terminar el script. Se corrigió resolviendo java.home para iniciar y cerrar el ejecutable real; se repitió la suite y se comprobó el cierre de los puertos de QA.

## Repetir y revisar

Requiere Windows, Node.js 22 o posterior, npm, Java 21 y tar. Desde la carpeta `testing/local-crud`, ejecutar:

```powershell
.Repetir-Pruebas.ps1 -OutputDir "C:utaG7-PRUEBAS-CRUD-FINAL"
```

La carpeta de salida debe contener la colección y el entorno importables entregados. El script instala dependencias fijadas, descarga DynamoDB Local si falta, verifica el hash, inicia procesos ocultos en puertos libres y los detiene al terminar. Si los puertos están ocupados o la instancia no está vacía, falla sin detener procesos ajenos. No necesita credenciales AWS reales. También se ejecutó el script de repetición de extremo a extremo durante esta sesión; al finalizar se regeneraron los reportes desde sus resultados reales.

Para Postman GUI, iniciar la variante QA y usar el entorno local. La fixture protectedId y las verificaciones SDK entre fases las prepara `run.cjs`; ejecutar la colección sin esa preparación no reproduce los casos de estado aprobado. No usar el entorno contra el servidor de un compañero ni contra AWS.

## Archivos de evidencia

- `newman-fase-1.json`, `newman-fase-2.json`, `newman-fase-3.json`: reportes JSON originales del reporter Newman.
- `resultados-resumen.json`: consolidado de peticiones y aserciones, incluyendo respuestas reales.
- `evidencia/dynamodb-verification.json`: lecturas directas de la base y limpieza.
- `evidencia/protecciones-configuracion.tap`: cuatro pruebas de bloqueo de destinos remotos y tablas compartidas.
- `evidencia/registro-ejecucion.json`: IDs temporales y fecha.
- `Reporte-CRUD.html`: reporte HTML generado desde los resultados reales, no una captura de Postman.
- `codigo/`: implementación y herramientas reproducibles; sin node_modules, JAR ni base de datos.

Se entregan registros verificables en lugar de capturas nuevas. No se almacenan tokens, contraseñas ni claves AWS reales. Las cadenas local del cliente DynamoDB son valores ficticios necesarios para el protocolo de DynamoDB Local.
