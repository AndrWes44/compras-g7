# Revisión de estados y flujo — 19 de noviembre de 2026

## Diagnóstico verificado

Se consultaron con `GetItem` y lectura consistente siete IDs de las capturas en `g7-dev-solicitudes`, región `us-east-2`. La lectura del 19/11/2026 a las 19:37 UTC confirmó:

| Registro | Estado almacenado | Monto USD | Resultado |
|---|---|---:|---|
| REQ-TEST-200 | REQUIRES_SUPERVISOR | 2800.00 | Registro anterior, incompatible con el dictamen actual |
| REQ-TEST-300 | REQUIRES_MANAGER | 7500.00 | Registro anterior, incompatible con el dictamen actual |
| REQ-3f83d7da-9171-4a2a-8f69-7e4b787db5c4 | CANCELLED | 12.00 | Anulación conservada |
| REQ-19ea109a-1a4b-4a9d-99ca-7d8fa17e2598 | CANCELLED | 14.20 | Anulación conservada |
| REQ-6a063aab479157b54c9671e9da2a6bbf629f639c9862ad4b2d7f3c5eb23798a3 | APPROVED | 2.50 | Aprobación de la solicitud asignada a Gerencia |
| REQ-8074df80c857fa36eb56d5ba0c90bd1e44bedc597c5760cac5b380fbeed20285 | APPROVED | 1277000.00 | Decisión persistida, asignación a Dirección |
| REQ-f68f8eb1bc156852806e4dc67b905c96234d69af5b8625eb2968d5fd8e136d7d | REJECTED | 300192.00 | Decisión persistida, asignación a Dirección |

Los dos registros antiguos no tienen `requiereAprobacionDe`. No se deben convertir automáticamente a `PENDING` ni eliminar para resolver un problema de presentación. Cualquier migración de datos sería una tarea separada, con reglas y autorización explícitas.

## Corrección de backend

`PATCH /api/solicitudes/:id/decision` respondía «La solicitud ya fue decidida.» para cualquier estado distinto de `PENDING`, incluso valores antiguos o ausentes. Ahora se distingue:

- `APPROVED`, `REJECTED`, `CANCELLED`: HTTP 409, se mantiene el mensaje de solicitud ya decidida.
- Cualquier otro estado diferente de `PENDING`: HTTP 409, «El estado de la solicitud no admite dictamen en el flujo actual. Actualiza el listado o solicita la revisión del registro.»
- `PENDING`: siguen aplicándose rol, monto, asignación y prohibición de autoaprobación.

No cambia ningún estado, dato o permiso. `GET /api/aprobaciones` continúa devolviendo únicamente solicitudes elegibles. `POST /api/solicitudes/:id/anular` exige propietario y estado `PENDING`; conserva el documento como `CANCELLED`. `DELETE /api/borradores/:id` exige borrador privado `DRAFT` y versión vigente.

## Pruebas

Se agregaron tres pruebas de API con diez escenarios en `tests/online-api.test.cjs`:

1. No anular `APPROVED`, `REJECTED` o `CANCELLED`; comprobar HTTP 409, cero llamadas a persistencia y documento e historial intactos al volver a leer.
2. Los estados `REQUIRES_SUPERVISOR`, `REQUIRES_MANAGER`, ausente y desconocido se conservan al consultar, se excluyen de aprobaciones y rechazan el dictamen sin escribir. Un control `PENDING` elegible sí aparece en la bandeja.
3. Los estados finales de Dirección no reaparecen en aprobaciones ni admiten otra decisión.

La nueva prueba de estados antiguos falló con el mensaje anterior antes de aplicar el cambio. Después, la batería completa pasó **146/146**, con **Node.js 22.23.5**, sin omisiones. Se utilizaron servicios AWS simulados y servidores locales; esas pruebas no certifican por sí solas la interfaz ni un despliegue.

## Trabajo de frontend identificado para Carlos

La lectura directa de S3 confirmó estos defectos del código publicado:

1. `enviarBorradorAFirma` cambia `s.id` al nuevo `requestId` y deja `selectedSolicitudId` apuntando al UUID antiguo. `renderDetalleSolicitud` muestra un 404 a partir de una búsqueda local fallida. Mantener `draftId` separado, cambiar la selección al `requestId` y mostrar `REGISTERING`; al confirmar `PERSISTED`, mostrar el detalle actualizado. No diagnosticar pérdida de datos desde una ausencia en memoria.
2. `normalizarSolicitudDesdeApi` convierte estados desconocidos a `en_revision` y descarta el `status` original. Preservar ese estado y usar un mapa explícito; solo `PENDING` habilita dictamen. Mostrar los estados anteriores como registros de solo lectura. `REGISTERING` es envío en curso; `PENDING_APPROVAL` pertenece al alta de cuentas y `SUBMITTED` al borrador enviado.
3. La bandeja de dictamen filtra toda la lista de solicitudes por estado visual y monto. Usar `GET /api/aprobaciones` y su paginación, también para contadores y permisos de los botones del detalle. Una página sin resultados puede tener cursor siguiente: no detener la paginación solo porque venga vacía.
4. Tras un 409, refrescar detalle y bandeja, conservar la respuesta del servidor y retirar acciones no elegibles. Bloquear por ID Aprobar/Rechazar y el envío mientras están en curso. No crear una nueva solicitud como recuperación de un envío aceptado.
5. Canonicalizar `Administrador`/`administrador`/`admin` para mostrar «Administrador de Cuentas». En cuentas ya aprobadas, permitir el cambio de rol según contrato y ocultar «Rechazar», que el backend no admite sobre altas ya aprobadas.
6. El índice publicado todavía no contiene las referencias con versión del commit `e57a9bc`, aunque las cabeceras HTTP de caché están presentes. Publicar el índice y los JS del mismo commit y mantener una versión por entrega.

Referencias de la copia pública examinada: `app.js` 1070–1083, 1254–1269, 1961–1975, 2055, 2170–2240, 2656–2722; `auth.js` 127–143 y 319–329. Las líneas se refieren a ese artefacto y pueden cambiar en entregas posteriores.

## Despliegue y aceptación

Héctor debe desplegar los commits exactos corregidos, conservar configuración, verificar hashes del contenido servido y las cabeceras HTTP. La corrección del mensaje de backend requiere un nuevo paquete Lambda; no queda aplicada por actualizar S3. Este trabajo no modificó infraestructura ni los registros antiguos.

Repetir el flujo con caché normal y una sesión recién iniciada; usar un segundo navegador como control adicional. Guardar commit publicado, rol, ID de prueba, acción, HTTP y estado posterior. No copiar tokens ni contraseñas al informe.

Comprobar: borrador parcial → editar → enviar → `REGISTERING` → `PENDING` sin falso 404; aprobación/rechazo de Gerente hasta USD 1000 y Dirección por encima de USD 1000; conflictos sin repetir decisiones; anulación solo de pendientes; borrado solo de borradores propios; alta y edición de proveedor, exclusión de inactivos para solicitante y baja según contrato; alta de cuenta, rol efectivo en una nueva sesión y navegación administrativa. Los límites USD 1000/1000.01, rechazo de Gerente y edición/baja de proveedor aún requieren comprobación manual final de la publicación corregida.

La recuperación de contraseña no queda certificada por estas capturas; el frontend observado mostraba un aviso de envío sin llamada real al servicio. Debe resolverse como función completa o mostrarse como no disponible hasta implementarla. La causa de un 401 previo tampoco queda establecida sin hora de expiración y respuesta del servidor; conservar la validación de sesión y reproducir solo si ocurre inmediatamente tras iniciar sesión.
