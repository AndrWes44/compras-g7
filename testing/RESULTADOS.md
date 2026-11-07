# Resultados de Testing y API Integration

## Pruebas automatizadas aisladas

44 pruebas HTTP aprobadas contra los handlers reales del backend del equipo y Express, sustituyendo el cliente DynamoDB por un doble en memoria. Comprueban salud, crear/listar, validaciones, montos, paginacion, errores y concurrencia. No necesitan AWS ni una base encendida.

El verificador de lectura agrega 17 pruebas de validacion de endpoints y evidencia sin hacer conexiones. Suite actual: 61 pruebas automatizadas.

## Integracion real por Wi-Fi

El 7 de noviembre de 2026 se ejecutaron 17 peticiones Postman con Newman contra la API del companero: 43 aserciones aprobadas, sin fallos. Se crearon tres solicitudes (999.99, 1000.00, 1000.01 USD) y se verifico cada documento mediante lectura directa consistente en DynamoDB Local, tabla g7-dev-solicitudes. Las tres comparaciones fueron exactas.

Ver [evidencias de la corrida](evidence/2026-11-07-wifi/README.md). Las creaciones quedaron en PENDING; este backend todavia no implementa asignacion de aprobador ni decisiones. No se verifico reinicio del proceso ni AWS remoto.

Las 365 pruebas de la demo independiente con SQLite corresponden a otro contrato y no se presentan como resultado de este backend.
