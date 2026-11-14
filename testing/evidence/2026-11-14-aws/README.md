# AURA G7 — Pruebas públicas en Postman

Fecha: 14 de noviembre de 2026, America/El_Salvador.
API: https://6pkbutuqre.execute-api.us-east-2.amazonaws.com

Se importó una colección nueva y se enviaron individualmente siete peticiones desde Postman web con Cloud Agent. Las capturas son de la interfaz real y muestran respuestas de la API. No se ejecutó Collection Runner; los códigos y respuestas se verificaron visualmente.

| Caso | Código observado | Resultado |
|---|---|---|
| GET /health | 200 | Conforme |
| GET /api/solicitudes sin token | 401 | Conforme |
| GET /api/borradores sin token | 401 | Conforme |
| GET /api/auth/me con Authorization inválida | 401 | Conforme |
| OPTIONS /api/borradores con origen frontend permitido | 204 | Conforme; Allow-Origin exacto y PATCH permitido |
| OPTIONS /api/borradores con Origin https://example.com | 403 | Conforme; Origen no autorizado |
| POST /api/auth/login con usuario_falso@g7.com / 123456 | 401 | Conforme; Correo o contraseña incorrectos |

En el caso 04, Postman sustituyó el valor literal de Authorization durante la importación por una referencia de variable no resuelta `{{bearer_token_0g24}}`. La respuesta fue «Token inválido o expirado». Esta captura acredita rechazo de una cabecera Authorization inválida; no acredita revocación o expiración de un token Cognito real. El archivo de colección entregado conserva el literal de prueba para repetirla.

Las sugerencias automáticas de IA visibles en Postman no se aceptaron ni constituyen evidencia del backend. Los rechazos 401/403 son esperados en estos casos negativos.

## Pendiente

- Login correcto y contraseña incorrecta de cuenta existente.
- Acceso a registros ajenos con dos identidades válidas.
- Crear/recuperar/editar borradores; incremento de versión y conflicto 409.
- Enviar borrador, confirmar persistencia y bloquear edición en REGISTERING.
- Pruebas por rol, idempotencia y decisiones.
- Captura de la prueba del frontend reportada por el usuario.

Se necesita una cuenta Solicitante de prueba; otras identidades según el caso. Estas pruebas públicas no certifican el sistema completo ni prueban por sí solas una llamada interna a Cognito: para esto último se requieren logs o trazas del backend.

## Archivos

Las siete capturas se conservan localmente y no se publican en GitHub.

`../../../postman/aura-aws-publicas.postman_collection.json`: colección repetible con aserciones. No contiene credenciales válidas.

`http-script-results.json`: evidencia complementaria de la ejecución anterior por script, distinta de esta ejecución en Postman.
