# Resultados de Testing y API Integration

## Cierre AWS real — 20 de noviembre de 2026

Cinco perfiles ingresaron por UI y abrieron sus paneles correspondientes. Se comprobaron creacion, lectura y edicion de proveedor/borrador propios. La eliminacion no se acredita porque el borrador termino SUBMITTED. Newman se ejecuto una sola vez: 10 peticiones, 17 aserciones, 14 aprobadas y 3 fallidas en dos consultas que usaron el UUID del borrador en lugar del requestId REQ. Las dos comprobaciones puntuales posteriores con el ID correcto devolvieron 200 y PERSISTED; no se repitio Newman ni se ocultaron los fallos iniciales.

La coleccion exportada se corrigio para capturar el requestId real, sin una nueva corrida completa. Quedaron pendientes decisiones por monto, baja de proveedor e inventario AWS por CLI. Ver [alcance, resultados e informes](evidence/2026-11-20-aws-real/README.md). Las capturas permanecen locales y no se publican credenciales.

## CRUD local final — 20 de noviembre de 2026

POST 201, GET 200, PUT 200 y DELETE 204 comprobados contra Express y DynamoDB Local 3.3.2, en una tabla nueva exclusiva `G7-TEST-CRUD-solicitudes`. Se verificaron creacion/lectura, cambios de descripcion y monto, preservacion de requestId/fecha/estado, eliminacion real y ausencia posterior. Negativas: IDs inexistentes o invalidos, vacios/null/espacios, montos invalidos, campos protegidos, JSON mal formado, cuerpos ausentes/arrays y restriccion PENDING.

Corrida final: **61 peticiones, 75 aserciones Newman aprobadas, 0 fallos; 6 verificaciones directas de DynamoDB conformes y 4 pruebas de configuracion conformes**. La tabla termino con cero registros. El intento inicial se detuvo por un texto esperado incorrecto del orquestador; esta conservado como fallido y la corrida completa posterior es la evidencia final.

Las rutas PUT/DELETE pertenecen al backend local QA incluido en `testing/local-crud`, no al backend AURA desplegado. La API AWS conserva sus reglas de borradores PATCH y anulacion. No hubo operaciones sobre AWS remoto, configuraciones compartidas ni registros de companeros.

Ver [reporte completo](evidence/2026-11-20-crud/Reporte-Pruebas-CRUD.md), [HTML](evidence/2026-11-20-crud/Reporte-CRUD.html) y [resumen verificable](evidence/2026-11-20-crud/resultados-resumen.json).

## AWS autenticado — 14 de noviembre de 2026

Con las cuentas QA de Solicitante, Gerente, Director y Compras, Collection Runner de Postman completo 36 peticiones y 44 aserciones aprobadas, sin fallos ni errores (57s 314ms). Otra corrida HTTP Python independiente verifico 36 comprobaciones conformes. No sumar ambas como si fueran casos distintos.

Se verificaron login/identidad por rol, contrasena incorrecta, restricciones de acceso, borradores, incremento de versiones, conflicto 409, precios numericos, envio, reintento del mismo requestId, persistencia PERSISTED y anulacion. Cada corrida creo su propia compra QA de USD 25 y la anulo. Quedan los dos proveedores QA y los borradores enviados como evidencia.

Limites: falta una segunda cuenta Solicitante para probar aislamiento entre usuarios del mismo rol. El bloqueo de PATCH se observo con el borrador ya SUBMITTED, no dentro de la ventana transitoria REGISTERING. No se certificaron frontend, aprobaciones por umbrales ni administracion de altas.

Ver [detalle y evidencia redactada](evidence/2026-11-14-aws-auth/README.md), [resumen observado de Postman](evidence/2026-11-14-aws-auth/postman-summary.json) y [coleccion autenticada sin secretos](../postman/aura-aws-autenticadas.postman_collection.json). Las capturas permanecen locales.

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
