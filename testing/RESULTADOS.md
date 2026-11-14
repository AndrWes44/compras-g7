# Resultados de Testing y API Integration

## AWS en Postman — 14 de noviembre de 2026

Se enviaron individualmente siete peticiones desde Postman web con Cloud Agent contra `https://6pkbutuqre.execute-api.us-east-2.amazonaws.com`. Verificacion visual: salud 200; solicitudes y borradores sin token 401; Authorization invalida 401; preflight permitido 204 con origen exacto; origen ajeno 403; login ficticio 401. Todos los codigos coincidieron con lo esperado. No se ejecuto Collection Runner ni se presenta un conteo de aserciones de esta sesion.

La importacion de Postman convirtio el literal de Authorization en una variable no resuelta. Ese caso acredita rechazo de una cabecera invalida, no expiracion o revocacion de un token real. Las pruebas autenticadas de borradores, versiones, envio, registros ajenos y roles siguen pendientes de cuentas validas.

Ver [detalle y limitaciones](evidence/2026-11-14-aws/README.md) y [coleccion AWS](../postman/aura-aws-publicas.postman_collection.json). Las capturas se conservan localmente y no se suben al repositorio. Las secciones siguientes documentan pruebas historicas del contrato anterior.

## Pruebas automatizadas aisladas

44 pruebas HTTP aprobadas contra los handlers reales del backend del equipo y Express, sustituyendo el cliente DynamoDB por un doble en memoria. Comprueban salud, crear/listar, validaciones, montos, paginacion, errores y concurrencia. No necesitan AWS ni una base encendida.

El verificador de lectura agrega 17 pruebas de validacion de endpoints y evidencia sin hacer conexiones. Suite actual: 61 pruebas automatizadas.

## Integracion real por Wi-Fi

El 7 de noviembre de 2026 se ejecutaron 17 peticiones Postman con Newman contra la API del companero: 43 aserciones aprobadas, sin fallos. Se crearon tres solicitudes (999.99, 1000.00, 1000.01 USD) y se verifico cada documento mediante lectura directa consistente en DynamoDB Local, tabla g7-dev-solicitudes. Las tres comparaciones fueron exactas.

Ver [evidencias de la corrida](evidence/2026-11-07-wifi/README.md). Las creaciones quedaron en PENDING; este backend todavia no implementa asignacion de aprobador ni decisiones. No se verifico reinicio del proceso ni AWS remoto.

Las 365 pruebas de la demo independiente con SQLite corresponden a otro contrato y no se presentan como resultado de este backend.
