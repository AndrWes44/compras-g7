# Documentación Técnica de Integración — Frontend AURA Compras (Grupo 7)

> **Documento Oficial de Entrega de Integración**  
> **Módulo:** Frontend Web SPA (`aura-compras-web`)  
> **Responsable:** Carlos Mendoza (Frontend Developer)  
> **Destinatarios:** Matute (QA / Pruebas), Backend Desarrollador 2, Héctor (AWS / Step Functions / Cognito), Brandon (DynamoDB)  
> **Rama de Trabajo:** `feature/frontend` (Local, lista para revisión)

---

## 1. Resumen de la Integración Realizada

Siguiendo el contrato técnico presentado por el Backend Desarrollador 2 y las especificaciones visuales de Figma, se transformó la aplicación desde un prototipo estático con datos simulados a una **Single Page Application (SPA) conectada, reactiva y desacoplada**, con tolerancia a fallos y soporte nativo para el flujo asíncrono de AWS Step Functions y DynamoDB.

### Principios Cumplidos:
1. **Fidelidad al 100% con Figma:** Paleta Dark Slate (`#0F172A`, `#1E293B`, `#2563EB`), tipografía Inter, iconos FontAwesome y microinteracciones intactas.
2. **Cero Credenciales en Navegador:** Ninguna Access Key, Secret Key ni token privado de IAM se encuentra en el código JavaScript del cliente.
3. **Manejo Asíncrono Real:** Soporte para respuestas **HTTP 202 Accepted**, cursores de paginación de DynamoDB y modal de control de errores.
4. **Verificación Rigurosa:** **23/23 pruebas automatizadas aprobadas al 100%**.

---

## 2. Arquitectura de Módulos del Frontend

```
aura-compras-web/
├── server.js                     # Servidor Express estático (puerto 3000/3001)
├── public/
│   ├── index.html                # Estructura SPA, Tailwind config y carga de scripts
│   ├── config.js                 # [NUEVO] Configuración dinámica de entorno y endpoints
│   ├── auth.js                   # [NUEVO] Gestión de sesión, RBAC y tokens de Cognito
│   ├── api.js                    # [NUEVO] Cliente HTTP con interceptores 401/403/timeout
│   └── app.js                    # Normalizador de datos, Kanban, formularios y vistas
└── tests/                        # Batería de pruebas automatizadas
    ├── test_frontend_suite.js    # Fases 1, 2 y 3 (Config, Auth y Validación)
    ├── test_normalizador.js      # Fase 3 (Normalización DynamoDB a Figma)
    ├── test_fase4_fase5.js       # Fase 4 y 5 (Paginación y HTTP 202)
    ├── test_fase6.js             # Fase 6 (Detalle individual y 404)
    ├── test_fase7.js             # Fase 7 (Dictamen y RBAC)
    ├── test_fase8.js             # Fase 8 (Borradores locales y migración)
    └── test_fase9.js             # Fase 9 (Interceptores 401/403 y Modal)
```

---

## 3. Matriz de Contratos de API Integrados

### A. Verificación del Servidor
* **Ruta:** `GET /health`
* **Método en cliente:** `window.apiService.checkHealth()`
* **Respuesta esperada:** HTTP 200 OK (`{ status: "ok" }`).

### B. Creación de Solicitudes (Inicio en Step Functions)
* **Ruta:** `POST /api/solicitudes`
* **Método en cliente:** `window.apiService.createSolicitud(payload)`
* **Payload emitido:**
  ```json
  {
    "descripcion": "Renovación anual de licencias cloud",
    "solicitante": "carlos@empresa.com",
    "departamento": "DEP-TI",
    "monto": 1800.00,
    "items": [
      { "nombre": "Licencia Cloud", "cantidad": 1, "precio": 1800.00, "subtotal": 1800.00 }
    ],
    "proveedor": "Tech Solutions Global"
  }
  ```
* **Respuesta procesada:** **HTTP 202 Accepted**
  ```json
  {
    "success": true,
    "mensaje": "Flujo de aprobación iniciado correctamente",
    "requestId": "REQ-1731284900-ABC",
    "executionArn": "arn:aws:states:us-east-2:123456789012:execution:ApprovalFlow:abc-123"
  }
  ```
* **Comportamiento en UI:** Inyección optimista en la columna **En Revisión** del Kanban, notificación toast y actualización automática.

### C. Consulta Paginada de Solicitudes
* **Ruta:** `GET /api/solicitudes?limit=20` (y con cursor: `&cursor=...`)
* **Método en cliente:** `window.apiService.getSolicitudes(limit, cursor)`
* **Respuesta procesada:**
  ```json
  {
    "total": 20,
    "solicitudes": [ ... ],
    "hayMasRegistros": true,
    "siguienteCursor": "eyJhdHRyaWJ1dGUiOi..."
  }
  ```
* **Comportamiento en UI:** El Kanban renderiza el botón **"Cargar más"** si `hayMasRegistros: true`, evitando duplicados por `requestId`.

### D. Consulta Individual por ID
* **Ruta:** `GET /api/solicitudes/:id`
* **Método en cliente:** `window.apiService.getSolicitudById(id)`
* **Respuesta procesada:** HTTP 200 OK con el objeto `solicitud`.
* **Respuesta HTTP 404:** Pantalla controlada de error *"Solicitud no encontrada (404)"* con botón de retorno seguro al Kanban sin excepciones en consola.

### E. Dictamen Humano (Aprobar / Rechazar)
* **Ruta acordada:** `POST /api/solicitudes/:id/dictamen`
* **Método en cliente:** `window.apiService.dictaminarSolicitud(id, { decision, comentario, aprobador })`
* **Payload:**
  ```json
  {
    "decision": "APPROVED", // o "REJECTED"
    "comentario": "Aprobado conforme al presupuesto trimestral validado.",
    "aprobador": "Ing. Herberth"
  }
  ```
* **Control RBAC:** Bloqueado automáticamente en la UI para el rol `solicitante`.

---

## 4. Normalizador de Datos (Traducción DynamoDB ➔ Figma)

Para evitar incompatibilidades entre los nombres en inglés de DynamoDB y los identificadores en español de la interfaz:

| Atributo DynamoDB / AWS | Atributo en Frontend | Regla de Transformación |
| :--- | :--- | :--- |
| `requestId` | `id`, `requestId` | Identificador único oficial de AWS. |
| `amount` / `monto` | `total` | Numérico con formato moneda `$0.00`. |
| `status` | `estado` | `APPROVED` ➔ `aprobado`<br>`REJECTED` ➔ `rechazado`<br>`DRAFT` ➔ `borrador`<br>`PENDING*` ➔ `en_revision` |
| `amount >= 1000` | `esAltoMonto` | Activa badge dorado y regla de aprobación por Director. |
| `executionArn` | `executionArn` | Renderiza badge morado de auditoría de Step Functions. |

---

## 5. Matriz de Pruebas Automatizadas (Para Matute / QA)

Para ejecutar la verificación completa en cualquier momento:
```powershell
node aura-compras-web\tests\test_frontend_suite.js
node aura-compras-web\tests\test_normalizador.js
node aura-compras-web\tests\test_fase4_fase5.js
node aura-compras-web\tests\test_fase6.js
node aura-compras-web\tests\test_fase7.js
node aura-compras-web\tests\test_fase8.js
node aura-compras-web\tests\test_fase9.js
```

### Resumen de Casos Probados:
- **Fase 1:** URL base por defecto, sanitización de barras finales y persistencia en `localStorage`.
- **Fase 2:** Rechazo de login vacío, mapeo de roles RBAC y purga de tokens en `logout()`.
- **Fase 3:** Validación de campos obligatorios (descripción y monto $> 0$).
- **Fase 3 (Mapeo):** Normalización de registros completos, manejo de precedencia de estados (`PENDING` sobre `APPROVED`), montos altos vs bajos y tolerancia a campos nulos.
- **Fase 4 y 5:** Paginación con cursor de DynamoDB sin duplicar IDs y recepción de respuesta HTTP 202 con `executionArn`.
- **Fase 6:** Consulta individual por ID, fusión de datos remotos y resiliencia ante HTTP 404.
- **Fase 7:** Bloqueo estricto de dictamen para rol `solicitante`, emisión de `APPROVED` y `REJECTED` por `gerente`.
- **Fase 8:** Almacenamiento de borradores en `localStorage` (`AURA_DRAFTS`) y promoción a AWS vía `enviarBorradorAFirma`.
- **Fase 9:** Interceptores automáticos para HTTP 401 (expiración de sesión) y HTTP 403 (permisos insuficientes).

**Total de pruebas ejecutadas con éxito:** **23/23 (100% de efectividad)**.

---

## 6. Estado de Pendientes y Coordinación con el Equipo

1. **Héctor (AWS / Cognito):**  
   - En cuanto entregues el `User Pool ID` y `App Client ID`, se configuran directamente en `window.AURA_CONFIG.setCognitoParams(userPoolId, clientId)`.
   - Confirmar si el dictamen de Step Functions se consumirá vía `POST /api/solicitudes/:id/dictamen` o mediante Task Tokens.
2. **Brandon (DynamoDB):**  
   - El frontend ya soporta el formato de partidas (`items`) y proveedor. En cuanto la Lambda de persistencia almacene estos atributos en `g7-dev-solicitudes`, la ficha técnica los mostrará sin requerir cambios adicionales.
3. **Matute (QA):**  
   - La suite de pruebas de arriba está a tu disposición para contrastar con la colección de Postman.
4. **Git:**  
   - Los cambios permanecen resguardados localmente en `feature/frontend`. Se esperará la confirmación del equipo para iniciar el proceso de Pull Request hacia `develop`.
