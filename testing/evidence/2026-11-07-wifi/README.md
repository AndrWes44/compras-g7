# Evidencia de integracion real por Wi-Fi - 7 de noviembre de 2026

Se ejecuto la coleccion del equipo con Newman desde una laptop contra la API y DynamoDB Local de la laptop del companero, conectadas al hotspot de un celular.

- 17 peticiones HTTP; 43 aserciones aprobadas; 0 fallos.
- 3 creaciones: $999.99, $1,000.00 y $1,000.01, todas en PENDING segun el contrato actual.
- 3 lecturas directas con el SDK y ConsistentRead: true sobre `g7-dev-solicitudes`: coincidencia exacta con la respuesta de la API.
- Tabla ACTIVE; clave de particion String `requestId`.
- Los registros de prueba conservan el prefijo G7-RED en la descripcion. No se borraron ni modificaron registros ajenos.

## Archivos

`postman-summary.json` contiene los resultados por peticion y asercion, sin respuestas del listado general de la tabla. `newman-junit.xml` permite visualizar el resultado en herramientas de testing. `dynamodb-verification.json` conserva exclusivamente los tres documentos de prueba y la comparacion API/base. Las direcciones LAN se sustituyen por referencias de topologia: pueden cambiar al reconectar el hotspot.

El reporte completo de Newman y el PDF de la corrida se entregaron fuera del repositorio. No se incorporan el manual personal, bases locales, credenciales, encabezados de autenticacion ni listados de registros ajenos.

## Repetir la lectura de estos registros sin escribir

```powershell
npm ci --prefix backend
node testing/verify-dynamodb-local.mjs http://IP_DEL_COMPANERO:8000
```

El verificador solo describe la tabla y hace GetItem de los tres requestId: no crea ni borra datos. Requiere la misma instancia/tabla y la configuracion local del equipo (region us-east-2 y credenciales ficticias local/local). Si los registros se borran o se cambia de base, fallara correctamente. Rechaza endpoints publicos/AWS; es exclusivo de DynamoDB Local en localhost o LAN privada.

Para otra corrida, ejecutar la coleccion Postman desde el entorno de red y guardar una nueva evidencia. El entorno de ejemplo requiere reemplazar IP_DEL_COMPANERO antes de ejecutar. La coleccion crea tres solicitudes nuevas cada vez.

## Limites

Esta prueba es real contra DynamoDB Local, no contra AWS remoto. No se reinicio el proceso del companero ni se verifico la durabilidad tras un reinicio. No prueba autenticacion real ni el motor de decisiones: el backend actual solo implementa crear y listar solicitudes. No se confunde con las 44 pruebas HTTP del harness, cuyo cliente DynamoDB si esta simulado.
