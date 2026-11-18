/**
 * AURA Compras - Cliente de Servicios API REST
 * Gestiona llamadas HTTP hacia la API Express en AWS API Gateway (Backend c4d9ee1).
 * Soporta timeouts, inyección de Access Token, interceptores 401/403, borradores,
 * proveedores, anulación, aprobaciones, seguimiento de registro y administración de usuarios.
 */

(function () {
  class ApiService {
    constructor() {
      this.timeoutMs = 15000;
      this._isHandling401 = false;
    }

    get baseUrl() {
      return (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';
    }

    /**
     * Obtiene exclusivamente el Access Token oficial
     */
    getAuthToken() {
      if (window.authService && typeof window.authService.getAccessToken === 'function') {
        return window.authService.getAccessToken();
      }
      return sessionStorage.getItem('AURA_ACCESS_TOKEN') || localStorage.getItem('AURA_ACCESS_TOKEN') || null;
    }

    buildUrl(endpoint) {
      const base = this.baseUrl.replace(/\/+$/, '');
      let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
        cleanEndpoint = cleanEndpoint.substring(4);
      }
      return `${base}${cleanEndpoint}`;
    }

    /**
     * Petición unificada
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
          data = text ? { message: text } : null;
        }

        if (!response.ok) {
          const errorMsg = (data && (data.error || data.mensaje || data.message)) || `Error HTTP ${response.status}`;
          const error = new Error(errorMsg);
          error.status = response.status;
          error.data = data;

          // Manejo seguro de 401 Unauthorized (limpiar sesión y redirigir UNA sola vez)
          if (response.status === 401) {
            if (window.authService && typeof window.authService.logout === 'function') {
              window.authService.logout();
            }
            if (typeof window !== 'undefined' && typeof window.mostrarErrorModal === 'function') {
              window.mostrarErrorModal({
                title: 'Sesión Expirada o Inválida',
                message: 'Tu sesión no es válida ante el backend de AWS o ha expirado. Por favor ingresa nuevamente.',
                code: 401,
                actionText: 'Ir al Login',
                onAction: "handleLogout()"
              });
            }
            if (!this._isHandling401) {
              this._isHandling401 = true;
              if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
                window.navigateTo('login');
              }
              setTimeout(() => { this._isHandling401 = false; }, 2000);
            }
          } else if (response.status === 403) {
            if (typeof window !== 'undefined' && typeof window.mostrarErrorModal === 'function') {
              window.mostrarErrorModal({
                title: 'Acceso No Autorizado',
                message: 'No posees los privilegios requeridos en AWS para ejecutar esta operación.',
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
          const timeoutErr = new Error('Tiempo de espera agotado al conectar con el servidor AWS.');
          timeoutErr.status = 408;
          timeoutErr.isNetworkError = true;
          throw timeoutErr;
        }

        if (!err.status) {
          err.isNetworkError = true;
          err.message = 'No fue posible conectar con el servidor API en AWS (' + this.baseUrl + ').';
        }

        throw err;
      }
    }

    // ==========================================
    // 1. SALUD
    // ==========================================
    async checkHealth() {
      try {
        const res = await this.request('/health', { method: 'GET' });
        return { online: true, status: res.status };
      } catch (err) {
        return { online: false, error: err.message };
      }
    }

    // ==========================================
    // 2. SOLICITUDES Y DETALLE
    // ==========================================
    async getSolicitudes(limit = 20, cursor = null) {
      let query = `?limit=${encodeURIComponent(limit)}`;
      if (cursor) query += `&cursor=${encodeURIComponent(cursor)}`;
      const res = await this.request(`/api/solicitudes${query}`, { method: 'GET' });
      return res.data;
    }

    async getSolicitudById(id) {
      if (!id) throw new Error('Identificador de solicitud requerido.');
      const res = await this.request(`/api/solicitudes/${encodeURIComponent(id)}`, { method: 'GET' });
      return res.data;
    }

    /**
     * Consulta el estado de persistencia asíncrona en DynamoDB iniciado por Step Functions
     * GET /api/solicitudes/:id/registro
     * Retorna: { estado: 'REGISTERING' | 'PERSISTED' | 'FAILED', requestId, documento?: {...} }
     */
    async getSolicitudRegistro(id) {
      if (!id) throw new Error('Identificador de solicitud requerido.');
      const res = await this.request(`/api/solicitudes/${encodeURIComponent(id)}/registro`, { method: 'GET' });
      return res.data;
    }

    async createSolicitud({ descripcion, description, department, departamento, monto, amount, articulos, items, proveedorId, proveedor }) {
      const descFinal = (description || descripcion || '').trim();
      if (!descFinal) throw new Error('La descripción es obligatoria.');
      const montoFinal = Number(amount !== undefined ? amount : monto);
      if (!montoFinal || montoFinal <= 0) throw new Error('El monto debe ser mayor que cero.');

      const articulosOficiales = Array.isArray(articulos) && articulos.length > 0
        ? articulos.map(it => ({
            nombre: it.nombre || 'Partida',
            cantidad: Number(it.cantidad || 1),
            precioUnitario: Number(it.precioUnitario !== undefined ? it.precioUnitario : (it.precio || 0))
          }))
        : (Array.isArray(items) && items.length > 0
          ? items.map(it => ({
              nombre: it.nombre || 'Partida',
              cantidad: Number(it.cantidad || 1),
              precioUnitario: Number(it.precioUnitario !== undefined ? it.precioUnitario : (it.precio || 0))
            }))
          : [{ nombre: descFinal, cantidad: 1, precioUnitario: montoFinal }]);

      const payload = {
        description: descFinal,
        department: department || departamento || 'DEP-TI',
        amount: montoFinal,
        articulos: articulosOficiales,
        proveedorId: proveedorId || 'PRV-001'
      };

      const res = await this.request('/api/solicitudes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res.data;
    }

    async getAprobaciones() {
      const res = await this.request('/api/aprobaciones', { method: 'GET' });
      return res.data;
    }

    async dictaminarSolicitud(id, { decision, comments, comentarios }) {
      if (!id) throw new Error('ID de solicitud requerido.');
      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        throw new Error('La decisión debe ser APPROVED o REJECTED.');
      }
      const comentario = (comments || comentarios || '').trim();
      if (!comentario) {
        throw new Error('El comentario o justificación es obligatorio tanto al aprobar como al rechazar.');
      }

      const res = await this.request(`/api/solicitudes/${encodeURIComponent(id)}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          comentarios: comentario
        })
      });
      return res.data;
    }

    async anularSolicitud(id, comentarios) {
      if (!id) throw new Error('ID de solicitud requerido.');
      const comentario = (comentarios || '').trim();
      if (!comentario) {
        throw new Error('El motivo de anulación es obligatorio.');
      }

      const res = await this.request(`/api/solicitudes/${encodeURIComponent(id)}/anular`, {
        method: 'POST',
        body: JSON.stringify({ comentarios: comentario })
      });
      return res.data;
    }

    // ==========================================
    // 3. BORRADORES (DYNAMODB)
    // ==========================================
    async getBorradores() {
      const res = await this.request('/api/borradores', { method: 'GET' });
      return res.data;
    }

    async createBorrador(draftData = {}) {
      const res = await this.request('/api/borradores', {
        method: 'POST',
        body: JSON.stringify(draftData)
      });
      return res.data;
    }

    async getBorradorById(id) {
      const res = await this.request(`/api/borradores/${encodeURIComponent(id)}`, { method: 'GET' });
      return res.data;
    }

    async updateBorrador(id, patchData, version) {
      const res = await this.request(`/api/borradores/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...patchData, version: Number(version) || 1 })
      });
      return res.data;
    }

    async deleteBorrador(id, version) {
      const res = await this.request(`/api/borradores/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: Number(version) || 1 })
      });
      return res.data;
    }

    async enviarBorrador(id, version) {
      const res = await this.request(`/api/borradores/${encodeURIComponent(id)}/enviar`, {
        method: 'POST',
        body: JSON.stringify({ version: Number(version) || 1 })
      });
      return res.data;
    }

    // ==========================================
    // 4. PROVEEDORES (CATÁLOGO / CRUD)
    // ==========================================
    async getProveedores() {
      const res = await this.request('/api/proveedores', { method: 'GET' });
      return res.data;
    }

    async getProveedorById(id) {
      const res = await this.request(`/api/proveedores/${encodeURIComponent(id)}`, { method: 'GET' });
      return res.data;
    }

    async createProveedor(provData) {
      const res = await this.request('/api/proveedores', {
        method: 'POST',
        body: JSON.stringify(provData)
      });
      return res.data;
    }

    async updateProveedor(id, patchData, version) {
      const res = await this.request(`/api/proveedores/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...patchData, version: Number(version) || 1 })
      });
      return res.data;
    }

    async deleteProveedor(id, version) {
      const res = await this.request(`/api/proveedores/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: Number(version) || 1 })
      });
      return res.data;
    }

    // ==========================================
    // 5. ADMINISTRACIÓN DE CUENTAS (ADMIN_GROUP)
    // ==========================================
    async getAdminUsuarios(estado = '', cursor = null, limit = 50) {
      const params = new URLSearchParams();
      if (estado) {
        params.append('estado', estado);
        params.append('status', estado);
      }
      if (cursor) {
        params.append('cursor', cursor);
      }
      if (limit) {
        params.append('limit', String(limit));
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await this.request(`/api/admin/usuarios${query}`, { method: 'GET' });
      return res.data;
    }

    async decidirAdminUsuario(sub, { decision, role, version, comments }) {
      if (!sub) throw new Error('sub de usuario requerido.');
      const body = {
        decision,
        version: Number(version) || 1,
        comments: (comments || '').trim() || 'Dictamen administrativo'
      };
      if (role && decision === 'APPROVED') {
        body.role = role;
      }

      const res = await this.request(`/api/admin/usuarios/${encodeURIComponent(sub)}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      return res.data;
    }
  }

  window.apiService = new ApiService();
})();
