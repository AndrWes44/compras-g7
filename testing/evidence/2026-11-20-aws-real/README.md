# Cierre de pruebas AWS reales del 20 de noviembre de 2026

Esta evidencia pertenece al frontend publicado en S3 y a la API `https://6pkbutuqre.execute-api.us-east-2.amazonaws.com`. No corresponde a `testing/local-crud` ni a DynamoDB Local.

## Resultados

- Cinco accesos de interfaz verificados: Administrador, Solicitante, Gerente, Director y Compras. La bitacora registra el panel observado por cada perfil.
- Proveedor propio creado, consultado y editado; borrador propio creado, reabierto y editado de USD 25 a USD 30.
- Eliminacion del borrador **BLOQUEADA**: despues de la confirmacion manual se observo una solicitud enviada. La API confirmo el borrador como SUBMITTED; no se intento borrar fisicamente una solicitud formal.
- Una sola ejecucion de Newman: **10 peticiones, 17 aserciones; 14 aprobadas y 3 fallidas** en dos consultas.
- Diagnostico puntual: se habia capturado el UUID del borrador en lugar del requestId REQ de la solicitud. Solo se consultaron nuevamente esas dos rutas con el ID correcto: ambas devolvieron HTTP 200 y se confirmo PERSISTED. Los fallos originales se conservan y no se presenta la corrida Newman como totalmente aprobada.

La coleccion final captura el requestId correcto desde la respuesta del borrador mediante una variable efimera. Este ajuste se hizo despues de la corrida y **no se volvio a ejecutar Newman**. La coleccion y el entorno exportados tienen baseUrl y authToken en blanco. No se persisten credenciales en sus scripts.

## Archivos

- `ui/bitacora-ui.json`: resultados observados de interfaz, roles, IDs de prueba y pendientes. El requestId capturado inicialmente corresponde al UUID del borrador; el requestId correcto esta documentado en el diagnostico.
- `ui/entorno-y-huellas.json`: URL, SHA256 de los archivos publicos y SHAs de ramas consultadas. No certifica el SHA desplegado en Lambda.
- `newman/newman-resultados-redactados.json`: resumen redactado obtenido de la unica ejecucion real de Newman; no es una exportacion nativa completa del reporter JSON.
- `newman/newman-stats.json`: estadisticas originales de Newman.
- `newman/diagnostico-dos-consultas.json`: respuestas de las dos verificaciones puntuales posteriores, fuera de Newman.
- `newman/sesion-*.json`: metadatos de preparacion de sesion, sin contrasenas ni tokens.
- `documentacion/`: resumen por rol, CRUD, endpoint, HTTP y estado en CSV/JSON/HTML, e informe Word/PDF.
- Coleccion y entorno: `postman/G7-AWS-REAL.postman_collection.json` y `postman/G7-AWS-REAL.postman_environment.json`, desde la raiz del repositorio.

Las capturas se conservan en la entrega local y se excluyen de GitHub por instruccion del responsable. No se publica el anexo privado de acceso.

## Limites y pendientes

No se ejecutaron las decisiones de Gerente/Director por monto, la baja del proveedor ni operaciones administrativas de cuentas. El proveedor QA permanece ACTIVE y la solicitud formal propia estaba PENDING en la ultima lectura. Los IDs estan en el resumen para seguimiento; no eliminar registros ajenos.

AWS CLI no estaba instalado y no habia un perfil local configurado: inventario y version desplegada de Lambda quedan pendientes de consulta autorizada. No se ejecuto k6 ni se modifico el despliegue. Las referencias a ausencia de push en los informes describen el momento de las pruebas; posteriormente se autorizo publicar esta evidencia en feature/testing.
