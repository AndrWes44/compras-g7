# AURA G7 — Pruebas autenticadas AWS

Fecha: 14 de noviembre de 2026 (America/El_Salvador).

Primera corrida por cliente HTTP Python: 36 comprobaciones conformes de 36. Esta corrida es independiente de la repeticion posterior en Collection Runner de Postman. No se presentan los resultados de Python como si fueran de Postman.

## Repeticion en Postman Collection Runner

36 peticiones, 44 aserciones aprobadas, cero fallidas y cero errores; una iteracion y 57s 314ms. Run ID: `205dba9d-7d5b-467b-aedb-e620002b64cc`. El resumen JSON procede de la observacion de la interfaz; no es una exportacion nativa.

Se capturo el resumen sin fallos y todos los casos en grupos de la vista Grid. Las seis capturas estan solo en la entrega local. Los valores temporales de contrasena se vaciaron de la coleccion al terminar y no se persistieron los tokens de la corrida. La repeticion creo un segundo proveedor y una segunda compra QA; la solicitud tambien se anulo.

## Casos de la primera corrida

| Caso | HTTP | Resultado |
|---|---|---|
| Login Solicitante | 200 | Conforme |
| Login Gerente | 200 | Conforme |
| Login Director | 200 | Conforme |
| Login Compras | 200 | Conforme |
| Identidad Solicitante | 200 | Conforme |
| Identidad Gerente | 200 | Conforme |
| Identidad Director | 200 | Conforme |
| Identidad Compras | 200 | Conforme |
| Contrasena incorrecta cuenta existente | 401 | Conforme |
| Borradores bloqueados para Gerente | 403 | Conforme |
| Borradores bloqueados para Director | 403 | Conforme |
| Borradores bloqueados para Compras | 403 | Conforme |
| Administracion bloqueada a Solicitante | 403 | Conforme |
| Bandeja Gerente | 200 | Conforme |
| Bandeja Director | 200 | Conforme |
| Catalogo resumen Solicitante | 200 | Conforme |
| Crear proveedor exclusivo QA | 201 | Conforme |
| Crear borrador QA incompleto | 201 | Conforme |
| Recuperar borrador propio | 200 | Conforme |
| Lectura borrador ajeno por Gerente | 403 | Conforme |
| Lectura borrador ajeno por Director | 403 | Conforme |
| Lectura borrador ajeno por Compras | 403 | Conforme |
| PATCH version vigente | 200 | Conforme |
| PATCH version anterior conflicto | 409 | Conforme |
| Segundo PATCH version incrementada | 200 | Conforme |
| Persistencia despues de PATCH | 200 | Conforme |
| Completar borrador con precios numericos | 200 | Conforme |
| Recuperar precios del borrador | 200 | Conforme |
| Enviar borrador QA | 202 | Conforme |
| Consultar borrador tras envio | 200 | Conforme |
| Bloqueo PATCH despues del envio | 409 | Conforme |
| Reintento envio conserva requestId | 202 | Conforme |
| Seguimiento persistencia 1 | 200 | Conforme |
| Consultar solicitud QA propia | 200 | Conforme |
| Director sin alcance al monto 25 | 404 | Conforme |
| Anular solicitud QA propia | 200 | Conforme |

## Alcance y limites

- Los cuatro logins y `/api/auth/me` devolvieron los roles previstos. Credenciales y tokens se redactaron antes de escribir evidencia.
- La primera consulta de seguimiento devolvio `PERSISTED`; la compra QA de USD 25 se anulo y termino en `CANCELLED`. El proveedor QA y el borrador enviado permanecen como evidencia, sin compras reales.
- PATCH con version vigente funciono, la version anterior devolvio 409 y el siguiente PATCH con la nueva version funciono. Los precios numericos se conservaron al consultar nuevamente.
- El bloqueo de edicion se observo despues del envio, cuando el borrador ya estaba en `SUBMITTED`. El envio devolvio `REGISTERING`, pero no se capturo una edicion concurrente en el intervalo transitorio `REGISTERING`.
- Gerente, Director y Compras no pudieron leer borradores de Solicitante (403). Director no pudo consultar la solicitud de USD 25 fuera de su alcance (404). Esto no sustituye la prueba entre dos usuarios distintos con rol Solicitante, pendiente de una segunda cuenta.
- El catalogo inicial estaba vacio: la comprobacion inicial de ausencia de datos fiscales no acredita redaccion sobre un proveedor con datos fiscales.
- No se verificaron aun decisiones de aprobacion, limites 1000/1000.01, alta/verificacion/aprobacion administrativa ni logout/revocacion.
- La API preserva precios; la normalizacion visual y el bloqueo del frontend requieren pruebas del navegador adicionales.
- No se modificaron compras preexistentes ni roles de cuentas. No se publican imagenes, contrasenas ni tokens en GitHub.

## Repetir

Importar `postman/aura-aws-autenticadas.postman_collection.json`. Configurar de forma privada las cuatro variables `qaPasswordSolicitante`, `qaPasswordGerente`, `qaPasswordDirector`, `qaPasswordCompras`; los valores incluidos estan vacios. Usar una sola iteracion, peticiones en orden y demora de 1000 ms. La coleccion crea registros identificados como QA y anula su solicitud al finalizar. No activar persistencia de variables al terminar. No publicar las variables privadas.

La coleccion y las capturas originales de Postman se entregan por separado. Las capturas se conservan localmente.
