/**
 * AURA Compras - Módulo de Autenticación y Gestión de Sesión
 * Diseñado para Amazon Cognito (User Pool) y control de acceso RBAC.
 * Comunicación 100% real con Backend AWS Express (Dev 2 / Andrés - c4d9ee1).
 */

(function () {
  class AuthService {
    constructor() {
      this.STORAGE_KEY_ACCESS = 'AURA_ACCESS_TOKEN';
      this.STORAGE_KEY_USER = 'AURA_AUTH_USER';
    }

    /**
     * Obtiene el Access Token oficial para cabeceras HTTP Authorization: Bearer <accessToken>
     */
    getAccessToken() {
      return sessionStorage.getItem(this.STORAGE_KEY_ACCESS) || localStorage.getItem(this.STORAGE_KEY_ACCESS) || null;
    }

    /**
     * Retorna token para compatibilidad
     */
    getIdToken() {
      return this.getAccessToken();
    }

    getUser() {
      const data = sessionStorage.getItem(this.STORAGE_KEY_USER) || localStorage.getItem(this.STORAGE_KEY_USER);
      if (!data) return null;
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }

    isAuthenticated() {
      return Boolean(this.getAccessToken() && this.getUser());
    }

    /**
     * Guarda Access Token y datos de usuario autenticado
     */
    setSession(tokens, user) {
      if (!tokens || !tokens.accessToken) {
        throw new Error('Respuesta de autenticación inválida: falta accessToken.');
      }
      sessionStorage.setItem(this.STORAGE_KEY_ACCESS, tokens.accessToken);
      if (user) {
        sessionStorage.setItem(this.STORAGE_KEY_USER, JSON.stringify(user));
      }
    }

    /**
     * Cierra la sesión activa y purga el almacenamiento seguro
     */
    logout() {
      sessionStorage.removeItem(this.STORAGE_KEY_ACCESS);
      sessionStorage.removeItem(this.STORAGE_KEY_USER);
      sessionStorage.removeItem('AURA_ID_TOKEN');
      localStorage.removeItem(this.STORAGE_KEY_ACCESS);
      localStorage.removeItem(this.STORAGE_KEY_USER);
      localStorage.removeItem('AURA_ID_TOKEN');
    }

    /**
     * Cierre de sesión remoto ante Cognito y limpieza local
     */
    async logoutRemote() {
      const token = this.getAccessToken();
      if (token && window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) {
        try {
          await fetch(`${window.AURA_CONFIG.apiBaseUrl}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (err) {
          console.warn('[AURA Auth] Aviso al revocar sesión en backend:', err.message);
        }
      }
      this.logout();
    }

    /**
     * Login real contra el backend de AWS (Cognito)
     * POST /api/auth/login -> { email, password }
     * Retorna: { tokens: { accessToken, expiresIn }, user: { sub, email, roles, role, isAdmin, ... } }
     */
    async login(email, password) {
      if (!email || !password) {
        throw new Error('Debe proporcionar correo y contraseña.');
      }

      const apiBaseUrl = (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';
      
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const errorMsg = (data && (data.error || data.message || data.mensaje)) || `Error de autenticación (HTTP ${res.status})`;
        const error = new Error(errorMsg);
        error.status = res.status;
        error.data = data;
        throw error;
      }

      if (!data || !data.tokens || !data.tokens.accessToken) {
        throw new Error('El servidor no retornó un token de acceso válido.');
      }

      const rawUser = data.user || {};
      const primaryRole = (rawUser.role || (Array.isArray(rawUser.roles) && rawUser.roles[0]) || 'solicitante').toLowerCase();

      const user = {
        sub: rawUser.sub || rawUser.id,
        email: rawUser.email || email.trim().toLowerCase(),
        name: rawUser.name || (email.split('@')[0]),
        role: primaryRole,
        roles: rawUser.roles || [primaryRole],
        isAdmin: Boolean(rawUser.isAdmin || (Array.isArray(rawUser.roles) && rawUser.roles.includes('Administrador'))),
        roleTitle: this._getRoleTitle(primaryRole, rawUser.isAdmin)
      };

      this.setSession(data.tokens, user);
      return user;
    }

    /**
     * Valida la identidad y claims actuales con el backend
     * GET /api/auth/me
     */
    async getMe() {
      const token = this.getAccessToken();
      if (!token) throw new Error('No hay sesión activa.');

      const apiBaseUrl = (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';
      const res = await fetch(`${apiBaseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.logout();
        }
        throw new Error(`Sesión inválida o expirada (HTTP ${res.status})`);
      }

      const data = await res.json();
      const rawUser = data.user || data;
      const primaryRole = (rawUser.role || (Array.isArray(rawUser.roles) && rawUser.roles[0]) || 'solicitante').toLowerCase();

      const user = {
        sub: rawUser.sub || rawUser.id,
        email: rawUser.email,
        name: rawUser.name || rawUser.email,
        role: primaryRole,
        roles: rawUser.roles || [primaryRole],
        isAdmin: Boolean(rawUser.isAdmin || (Array.isArray(rawUser.roles) && rawUser.roles.includes('Administrador'))),
        roleTitle: this._getRoleTitle(primaryRole, rawUser.isAdmin)
      };

      sessionStorage.setItem(this.STORAGE_KEY_USER, JSON.stringify(user));
      return user;
    }

    /**
     * Registro de nueva cuenta
     * POST /api/auth/registro -> { email, password, name }
     */
    async registro({ email, password, name }) {
      if (!email || !password || !name) {
        throw new Error('Todos los campos son obligatorios (nombre, correo y contraseña).');
      }

      const apiBaseUrl = (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';
      const res = await fetch(`${apiBaseUrl}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.error || data.message || `Fallo al registrar usuario (HTTP ${res.status})`;
        const err = new Error(errorMsg);
        err.status = res.status;
        throw err;
      }

      return data;
    }

    /**
     * Confirmación de código recibido por correo
     * POST /api/auth/confirmar -> { email, code }
     */
    async confirmarCodigo({ email, code }) {
      if (!email || !code) {
        throw new Error('Correo y código de verificación requeridos.');
      }

      const apiBaseUrl = (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';
      const res = await fetch(`${apiBaseUrl}/api/auth/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.error || data.message || `Código de confirmación inválido (HTTP ${res.status})`;
        const err = new Error(errorMsg);
        err.status = res.status;
        throw err;
      }

      return data;
    }

    /**
     * Reenviar código de confirmación
     * POST /api/auth/reenviar -> { email }
     */
    async reenviarCodigo(email) {
      if (!email) throw new Error('Correo requerido.');

      const apiBaseUrl = (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';
      const res = await fetch(`${apiBaseUrl}/api/auth/reenviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.error || data.message || `No fue posible reenviar código (HTTP ${res.status})`;
        const err = new Error(errorMsg);
        err.status = res.status;
        throw err;
      }

      return data;
    }

    _getRoleTitle(role, isAdmin) {
      if (isAdmin) return 'Administrador de Cuentas';
      switch (role.toLowerCase()) {
        case 'gerente': return 'Gerente Aprobador (hasta $1,000)';
        case 'director': return 'Director General / Financiero (> $1,000)';
        case 'compras': return 'Compras & Adquisiciones';
        default: return 'Solicitante Departamental';
      }
    }
  }

  window.authService = new AuthService();
})();
