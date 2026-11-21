# AURA Compras

Aplicación para gestionar solicitudes de compra, proveedores y aprobaciones por rol.

## Acceso

- Sistema: https://d16tvtxpo0gqw1.cloudfront.net
- API: https://6pkbutuqre.execute-api.us-east-2.amazonaws.com
- Estado del servicio: https://6pkbutuqre.execute-api.us-east-2.amazonaws.com/health

## Componentes

| Carpeta | Contenido |
| --- | --- |
| `backend` | API Express, autenticación, validaciones y pruebas |
| `frontend` | Interfaz web y pruebas de presentación |
| `infra` | Plantillas AWS y configuración de despliegue |
| `lambdas` | Funciones del registro de solicitudes |
| `postman` | Colecciones y entornos de prueba sin credenciales |
| `testing` | Pruebas de integración y utilidades de QA |

## Ejecución local

Requiere Node.js 22. Las variables del backend se describen en `backend/.env.example`.

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm start --prefix backend
npm start --prefix frontend
```

El entorno AWS usa API Gateway, Lambda, Cognito, DynamoDB y Step Functions. La interfaz se distribuye mediante S3 y CloudFront.

## Pruebas

```sh
npm test --prefix backend
npm test --prefix frontend
node --test testing/api.integration.test.mjs testing/verify-dynamodb-local.test.mjs
```

Estas suites usan dependencias simuladas y servidores locales. Las pruebas del sistema publicado requieren las cuentas de cada rol.
