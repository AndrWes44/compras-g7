# API de compras

Backend en JavaScript para Node.js 22 y Express. `src/server.js` reúne los módulos de producción y `src/lambda.js` expone el handler `src/lambda.handler`.

## Configuración

`package-lock.json` fija las dependencias. Las variables de entorno disponibles están en `.env.example`; Lambda utiliza su rol de ejecución para acceder a AWS.

## Rutas principales

| Grupo | Operaciones |
| --- | --- |
| `/health` | Estado del servicio |
| `/api/auth` | Login, sesión, cierre de sesión, registro y confirmación de correo |
| `/api/solicitudes` | Creación, consulta, estado del registro, dictamen y anulación |
| `/api/borradores` | Creación, consulta, edición, eliminación y envío |
| `/api/proveedores` | Consulta, creación, actualización y baja lógica |
| `/api/aprobaciones` | Solicitudes elegibles para dictamen |
| `/api/admin/usuarios` | Solicitudes de acceso y asignación de roles |
| `/api/capacidades` | Funciones habilitadas de la sesión autenticada |

Las rutas protegidas reciben el access token mediante `Authorization: Bearer <token>`. El servidor valida identidad, permisos, propiedad y estado del recurso.

## Reglas de negocio

- Solicitante administra sus borradores y crea solicitudes.
- Compras administra proveedores. La baja requiere estado `INACTIVE` y conserva las referencias históricas.
- Gerente decide solicitudes de hasta USD 1,000; Director decide las superiores a ese monto. El dictamen exige estado `PENDING` y comentario.
- Administrador gestiona cuentas y roles sin obtener permisos comerciales adicionales.
- La edición y eliminación de borradores y proveedores utiliza la versión vigente del registro.
- Los listados usan `limit` y `cursor`; el total devuelto corresponde a la página.

El envío devuelve HTTP 202 con estado `REGISTERING`. `GET /api/solicitudes/:id/registro` informa `PERSISTED` o `FAILED`. Las decisiones posteriores usan `PATCH /api/solicitudes/:id/decision` y la anulación usa `POST /api/solicitudes/:id/anular`.

## Pruebas

```sh
npm test
```

Las pruebas de `tests` inyectan servicios simulados; no crean datos en AWS.
