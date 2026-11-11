/**
 * AURA Compras - Cliente de Servicios API REST
 * Gestiona llamadas HTTP hacia la API Express (Backend Desarrollador 2).
 * Soporta timeouts, inyección de tokens de autenticación y manejo unificado de errores.
 */

(function () {
  class ApiService {
    constructor() {
      this.timeoutMs = 12000;
    }

    get baseUrl() {
      return (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'http://127.0.0.1:3000';
    }

    /**
     * Obtiene el token de autenticación actual si existe sesión en Cognito
     */
    getAuthToken() {
      if (window.authService && typeof window.authService.getIdToken === 'function') {
        return window.authService.getIdToken();
      }
      return localStorage.getItem('AURA_ID_TOKEN') || null;
    }

    /**
     * Normaliza y concatena endpoint asegurando que no se dupliquen prefijos /api
     * si baseUrl ya viene configurada con /api (ej. https://...execute-api.../api)
     */
    buildUrl(endpoint) {
      const base = this.baseUrl.replace(/\/+$/, '');
      let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      
      if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
        cleanEndpoint = cleanEndpoint.substring(4); // remover el '/api' repetido
      }
      return `${base}${cleanEndpoint}`;
    }

    /**
     * Ejecuta una petición fetch con control de tiempo y encabezados unificados
     */
    async request(endpoint, options = {}) {
      const url = this.buildUrl(endpoint);
      const token = this.getAuthToken();

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        let data = null;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await response.json().catch(() => null);
        } else {
          const text = await response.text().catch(() => '');
          data = { message: text };
        }

        if (!response.ok) {
          const errorMsg = (data && (data.error || data.mensaje || data.message)) || `Error HTTP ${response.status}`;
          const error = new Error(errorMsg);
          error.status = response.status;
          error.data = data;

          // Manejo interceptor global de seguridad y sesión (Fase 9)
          if (response.status === 401) {
            if (typeof window !== 'undefined' && typeof window.mostrarErrorModal === 'function') {
              window.mostrarErrorModal({
                title: 'Sesión Expirada o Inválida',
                message: 'Tu sesión no es válida ante el backend o ha expirado. Por favor ingresa nuevamente.',
                code: 401,
                actionText: 'Ir al Login',
                onAction: "handleLogout()"
              });
            }
          } else if (response.status === 403) {
            if (typeof window !== 'undefined' && typeof window.mostrarErrorModal === 'function') {
              window.mostrarErrorModal({
                title: 'Acceso No Autorizado',
                message: 'No posees los privilegios de rol requeridos en AWS para ejecutar esta operación.',
                code: 403,
                actionText: 'Entendido',
                onAction: 'cerrarErrorModal()'
              });
            }
          }

          throw error;
        }

        return {
          status: response.status,
          ok: true,
          data
        };
      } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          const timeoutErr = new Error('Tiempo de espera agotado al conectar con el servidor.');
          timeoutErr.status = 408;
          timeoutErr.isNetworkError = true;
          throw timeoutErr;
        }

        if (!err.status) {
          err.isNetworkError = true;
          err.message = 'No fue posible conectar con el servidor API (¿está encendido en ' + this.baseUrl + '?).';
        }

        throw err;
      }
    }

    /**
     * 1. Verificar estado de salud de la API
     * GET /health
     */
    async checkHealth() {
      try {
        const res = await this.request('/health', { method: 'GET' });
        return { online: true, status: res.status };
      } catch (err) {
        return { online: false, error: err.message };
      }
    }

    /**
     * 2. Consultar lista paginada de solicitudes
     * GET /api/solicitudes?limit=20&cursor=...
     */
    async getSolicitudes(limit = 20, cursor = null) {
      let query = `?limit=${encodeURIComponent(limit)}`;
      if (cursor) {
        query += `&cursor=${encodeURIComponent(cursor)}`;
      }
      const res = await this.request(`/api/solicitudes${query}`, { method: 'GET' });
      return res.data;
    }

    /**
     * 3. Consultar solicitud por ID único
     * GET /api/solicitudes/:id
     */
    async getSolicitudById(id) {
      if (!id) throw new Error('Se requiere un identificador de solicitud válido.');
      const res = await this.request(`/api/solicitudes/${encodeURIComponent(id)}`, { method: 'GET' });
      return res.data;
    }

    /**
     * 4. Crear nueva solicitud e iniciar Step Functions
     * POST /api/solicitudes
     * Responde HTTP 202 Accepted
     * Contrato oficial DynamoDB (g7-dev-solicitudes):
     * - description, applicant, department, amount
     * - articulos: [{"nombre": "...", "cantidad": 1, "precioUnitario": 10, "subtotal": 10}]
     * - proveedorId: "PRV-001"
     */
    async createSolicitud({ descripcion, solicitante, departamento, monto, items, proveedor, proveedorId }) {
      if (!descripcion || !descripcion.trim()) throw new Error('La descripción es obligatoria.');
      if (!monto || Number(monto) <= 0) throw new Error('El monto debe ser mayor que cero.');

      // Transformar partidas al formato oficial 'articulos' con 'precioUnitario'
      const articulosOficiales = Array.isArray(items) && items.length > 0
        ? items.map(it => ({
            nombre: it.nombre || 'Partida',
            cantidad: Number(it.cantidad || 1),
            precioUnitario: Number(it.precio !== undefined ? it.precio : (it.precioUnitario || 0)),
            subtotal: Number(it.subtotal !== undefined ? it.subtotal : (Number(it.cantidad || 1) * Number(it.precio || 0)))
          }))
        : [];

      const payload = {
        // Campos canónicos del backend Express y DynamoDB
        descripcion: descripcion.trim(),
        description: descripcion.trim(),
        solicitante: solicitante || 'usuario@empresa.com',
        applicant: solicitante || 'usuario@empresa.com',
        departamento: departamento || 'DEP-TI',
        department: departamento || 'DEP-TI',
        monto: Number(monto),
        amount: Number(monto),
        articulos: articulosOficiales,
        items: items, // Compatibilidad retrospectiva
        proveedorId: proveedorId || 'PRV-001',
        proveedor: proveedor || ''
      };

      const res = await this.request('/api/solicitudes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      return res.data;
    }

    /**
     * 5. Dictaminar Solicitud (Aprobar o Rechazar decisión humana)
     * Soporta tanto el nuevo flujo PATCH /api/solicitudes/:id/decision (UpdateItem directo en DynamoDB)
     * como el fallback POST /api/solicitudes/:id/dictamen.
     */
    async dictaminarSolicitud(id, { decision, comentario, comments, aprobador, decidedBy, taskToken }) {
      if (!id) throw new Error('ID de solicitud requerido para dictaminar.');
      if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
        throw new Error('La decisión debe ser APPROVED o REJECTED.');
      }

      const motivo = comments || comentario || '';
      const usuarioAprobador = decidedBy || aprobador || 'Gerencia';

      const payloadDecision = {
        decision,
        status: decision,
        comments: motivo,
        comentario: motivo,
        decidedBy: usuarioAprobador,
        aprobador: usuarioAprobador,
        ...(taskToken ? { taskToken } : {})
      };

      // Intentar primero con el endpoint oficial PATCH /api/solicitudes/:id/decision
      try {
        const res = await this.request(`/api/solicitudes/${encodeURIComponent(id)}/decision`, {
          method: 'PATCH',
          body: JSON.stringify(payloadDecision)
        });
        return res.data;
      } catch (patchErr) {
        // Si el backend aún tiene POST /dictamen, reintentar como fallback
        if (patchErr.status === 404 || patchErr.status === 405) {
          const resFallback = await this.request(`/api/solicitudes/${encodeURIComponent(id)}/dictamen`, {
            method: 'POST',
            body: JSON.stringify(payloadDecision)
          });
          return resFallback.data;
        }
        throw patchErr;
      }
    }
  }

  window.apiService = new ApiService();
})();
