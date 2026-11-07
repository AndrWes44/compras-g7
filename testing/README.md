# Testing y API Integration - Diego

Esta rama incorpora pruebas compatibles con el backend actual de `AndrWes44/compras-g7`. Se actualizo desde develop por fast-forward y se agregaron solo archivos de testing, Postman y documentacion. No se reemplazo el backend del companero.

## Ejecutar pruebas automatizadas

Desde la raiz, con Node.js 22:

```powershell
npm ci --prefix backend
node --test testing/api.integration.test.mjs testing/verify-dynamodb-local.test.mjs
```

Las peticiones HTTP ejecutan los handlers reales de `backend/src/server.js` y Express en un puerto local libre. El harness sustituye solamente el cliente DynamoDB por un doble en memoria y evita que el servidor abra su puerto fijo 3000. No requiere credenciales ni DynamoDB instalado, no crea recursos AWS y no modifica datos reales.

Comprueba salud, crear/consultar, campos requeridos, montos positivos, espacios externos, IDs unicos, paginacion, errores 500 y creaciones concurrentes. Las pruebas fallan si una dependencia nueva del backend necesita incorporarse explicitamente al harness.

## Postman: API actual del equipo

Importar `postman/compras-g7.postman_collection.json` y `postman/compras-g7-local.postman_environment.json`. Seleccionar el entorno y ejecutar la coleccion en orden.

Para ejecutar realmente esta coleccion, el backend del equipo y DynamoDB Local deben estar encendidos con la tabla `g7-dev-solicitudes`. Ver `backend/scripts/crearTablaLocal.js`. El servidor del equipo usa el puerto 3000: no ejecutar al mismo tiempo en ese puerto la demo independiente con SQLite. El primer health verifica que se trata del backend Grupo 7.

La coleccion crea tres solicitudes nuevas y captura requestId. GET lista todas y comprueba que contienen la solicitud recien creada. El CRUD actual implementa crear y listar, no GET individual por id.

## Diferencias frente a la demo independiente

El backend del equipo recibe `descripcion`, `solicitante`, `departamento` y `monto` en dolares; devuelve `{mensaje, solicitud}` y estado `PENDING`. La demo independiente recibe items en centavos y tiene estados/roles de aprobacion. Por eso no se trasladaron sus 365 pruebas como si fueran compatibles con esta API.

La coleccion original de aprobaciones se conserva como propuesta en `postman/propuesta-motor-aprobaciones.postman_collection.json`. No ejecutarla contra el backend actual del equipo: esas rutas todavia no estan implementadas. Sus 26 peticiones y 56 aserciones se probaron en la demo SQLite independiente, no en este backend.

Pendiente de integracion: motor por monto, envio/decisiones, autorizacion, historial, enteros en centavos y DynamoDB remoto. Las pruebas actuales de 999.99, 1000.00 y 1000.01 comprueban aceptacion/almacenamiento del monto; NO asignacion de aprobador.

## Prueba real por Wi-Fi con DynamoDB Local

Ejecutada el 7 de noviembre de 2026: 17 peticiones y 43 aserciones aprobadas; los tres documentos creados se verificaron directamente en la tabla. Ver [evidencia y procedimiento](evidence/2026-11-07-wifi/README.md). Importar `postman/compras-g7-red.postman_environment.json` y reemplazar IP_DEL_COMPANERO para repetir la coleccion contra otra laptop.

La lectura independiente puede repetirse sin modificar datos con `node testing/verify-dynamodb-local.mjs http://IP_DEL_COMPANERO:8000`.
