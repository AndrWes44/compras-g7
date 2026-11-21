# Pruebas

Desde la raíz, con Node.js 22:

```sh
npm ci --prefix backend --ignore-scripts
npm ci --prefix frontend --ignore-scripts
npm test --prefix backend
npm test --prefix frontend
node --test testing/api.integration.test.mjs testing/verify-dynamodb-local.test.mjs
```

La integración HTTP ejecuta Express y las rutas actuales de `backend/src/server.js` en un puerto libre de `127.0.0.1`. Identidad, almacenamiento y flujo de registro se inyectan como dobles de prueba en memoria. No necesita credenciales, DynamoDB Local ni servicios AWS. Comprueba autenticación, permisos, validaciones, registro `202 → PERSISTED`, paginación, idempotencia, decisiones por rol, borradores y errores.

`verify-dynamodb-local.test.mjs` comprueba restricciones de destinos y evidencia antes de realizar conexiones. Estas pruebas locales no certifican una publicación ni sustituyen el recorrido final desde la web.

## Colecciones Postman

- `postman/aura-aws-autenticadas.postman_collection.json`: casos autenticados del contrato de la API. Requiere cuentas de prueba y puede crear o anular datos; ejecutarla únicamente en el entorno autorizado, sin guardar contraseñas ni tokens en Git.
- `postman/G7-AWS-REAL.postman_collection.json`: lecturas y preflights del despliegue. No demuestra por sí sola todas las operaciones CRUD.
- `postman/G7-Compras-CRUD.postman_collection.json`: corresponde al fixture de `testing/local-crud`, no a la API desplegada. Sus rutas `PUT` y `DELETE /api/solicitudes/:id` son exclusivas de ese entorno local.

Los scripts de `testing/local-crud` requieren una instalación independiente de DynamoDB Local y su tabla de pruebas. No se ejecutan en el flujo de CI de la aplicación. Los reportes de una corrida deben indicar fecha, entorno, commit y alcance real; nunca conservar valores de sesión.
