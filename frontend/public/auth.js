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

      const rawUser = data.user || data.usuario || {};
      
      let primaryRole = '';
      if (rawUser.role) {
        primaryRole = String(rawUser.role).toLowerCase();
      } else if (Array.isArray(rawUser.roles) && rawUser.roles.length > 0) {
        primaryRole = String(rawUser.roles[0]).toLowerCase();
      } else if (Array.isArray(rawUser.groups) && rawUser.groups.length > 0) {
        const commercialGroup = rawUser.groups.find(g => ['Solicitante', 'Gerente', 'Director', 'Compras'].includes(g));
        if (commercialGroup) primaryRole = commercialGroup.toLowerCase();
      }

      const isAdmin = Boolean(rawUser.isAdmin || (Array.isArray(rawUser.roles) && rawUser.roles.includes('Administrador')) || (Array.isArray(rawUser.groups) && rawUser.groups.includes('Administrador')));

      if (!primaryRole) {
        if (isAdmin) {
          primaryRole = 'admin';
        } else {
          primaryRole = 'solicitante';
        }
      }

      const user = {
        sub: rawUser.sub || rawUser.id,
        email: rawUser.email || email.trim().toLowerCase(),
        name: rawUser.name || (email.split('@')[0]),
        role: primaryRole,
        roles: rawUser.roles || rawUser.groups || [primaryRole],
        isAdmin,
        roleTitle: this._getRoleTitle(primaryRole, isAdmin)
      };

      this.setSession(data.tokens, user);
      return user;
    }

    /**
     * Valida la identidad y claims actuales con el backend
     * GET /api/auth/me
     * Envelope backend c4d9ee1: { success: true, usuario: { sub, email, roles, groups, isAdmin, ... } }
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
      // Leer data.usuario del envelope oficial del backend
      const rawUser = data.usuario || data.user || data;

      if (!rawUser || (!rawUser.sub && !rawUser.userId && !rawUser.id && !rawUser.email && !rawUser.roles && !rawUser.role && !rawUser.groups)) {
        throw new Error('Respuesta de identidad inválida desde el backend.');
      }

      let primaryRole = '';
      if (rawUser.role) {
        primaryRole = String(rawUser.role).toLowerCase();
      } else if (Array.isArray(rawUser.roles) && rawUser.roles.length > 0) {
        const commercialRole = rawUser.roles.find(r => ['solicitante', 'gerente', 'director', 'compras'].includes(String(r).toLowerCase()));
        primaryRole = commercialRole ? String(commercialRole).toLowerCase() : String(rawUser.roles[0]).toLowerCase();
      } else if (Array.isArray(rawUser.groups) && rawUser.groups.length > 0) {
        const commercialGroup = rawUser.groups.find(g => ['solicitante', 'gerente', 'director', 'compras'].includes(String(g).toLowerCase()));
        if (commercialGroup) primaryRole = String(commercialGroup).toLowerCase();
      }

      const isAdmin = Boolean(
        rawUser.isAdmin ||
        (Array.isArray(rawUser.roles) && rawUser.roles.some(r => String(r).toLowerCase() === 'administrador')) ||
        (Array.isArray(rawUser.groups) && rawUser.groups.some(g => String(g).toLowerCase() === 'administrador'))
      );

      if (!primaryRole) {
        if (isAdmin) {
          primaryRole = 'admin';
        } else {
          throw new Error('La cuenta no posee un rol comercial asignado ante AWS.');
        }
      }

      const user = {
        sub: rawUser.sub || rawUser.userId || rawUser.id,
        email: rawUser.email,
        name: rawUser.name || (rawUser.email ? rawUser.email.split('@')[0] : 'Usuario'),
        role: primaryRole,
        roles: rawUser.roles || rawUser.groups || [primaryRole],
        isAdmin,
        roleTitle: this._getRoleTitle(primaryRole, isAdmin)
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
      if (isAdmin && (!role || role === 'admin')) return 'Administrador de Cuentas';
      const roleLower = String(role || '').toLowerCase();
      let title = '';
      switch (roleLower) {
        case 'gerente': title = 'Gerente Aprobador (hasta $1,000)'; break;
        case 'director': title = 'Director General / Financiero (> $1,000)'; break;
        case 'compras': title = 'Compras & Adquisiciones'; break;
        default: title = 'Solicitante Departamental'; break;
      }
      if (isAdmin) title += ' (Administrador)';
      return title;
    }
  }

  window.authService = new AuthService();
})();
