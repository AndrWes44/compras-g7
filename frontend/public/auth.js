/**
 * AURA Compras - Módulo de Autenticación y Gestión de Sesión
 * Diseñado para Amazon Cognito (User Pool) y control de acceso RBAC.
 */

(function () {
  class AuthService {
    constructor() {
      this.STORAGE_KEY_TOKEN = 'AURA_ID_TOKEN';
      this.STORAGE_KEY_ACCESS = 'AURA_ACCESS_TOKEN';
      this.STORAGE_KEY_USER = 'AURA_AUTH_USER';
    }

    /**
     * Obtiene el token de identidad para cabeceras HTTP Authorization: Bearer <token>
     */
    getIdToken() {
      return sessionStorage.getItem(this.STORAGE_KEY_TOKEN) || localStorage.getItem(this.STORAGE_KEY_TOKEN) || null;
    }

    getAccessToken() {
      return sessionStorage.getItem(this.STORAGE_KEY_ACCESS) || localStorage.getItem(this.STORAGE_KEY_ACCESS) || null;
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
      return Boolean(this.getIdToken() || this.getUser());
    }

    /**
     * Guarda tokens y datos de usuario autenticado
     */
    setSession(tokens, user) {
      if (tokens.idToken) sessionStorage.setItem(this.STORAGE_KEY_TOKEN, tokens.idToken);
      if (tokens.accessToken) sessionStorage.setItem(this.STORAGE_KEY_ACCESS, tokens.accessToken);
      if (user) sessionStorage.setItem(this.STORAGE_KEY_USER, JSON.stringify(user));
    }

    /**
     * Cierra la sesión activa y purga el almacenamiento seguro
     */
    logout() {
      sessionStorage.removeItem(this.STORAGE_KEY_TOKEN);
      sessionStorage.removeItem(this.STORAGE_KEY_ACCESS);
      sessionStorage.removeItem(this.STORAGE_KEY_USER);
      localStorage.removeItem(this.STORAGE_KEY_TOKEN);
      localStorage.removeItem(this.STORAGE_KEY_ACCESS);
      localStorage.removeItem(this.STORAGE_KEY_USER);
    }

    /**
     * Login estricto contra Amazon Cognito (vía API backend Express en AWS)
     */
    async login(email, password) {
      if (!email || !password) {
        throw new Error('Debe proporcionar correo y contraseña.');
      }

      const apiUrl = (window.AURA_CONFIG && window.AURA_CONFIG.apiBaseUrl) || 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';

      // 1. Intentar autenticación real contra el endpoint en AWS
      try {
        const res = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password })
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data && data.tokens) {
          this.setSession(data.tokens, data.user);
          return data.user;
        }

        // Si la API respondió con error de credenciales o desafío
        if (res.status === 401 || res.status === 400 || res.status === 403) {
          throw new Error(data?.mensaje || 'Credenciales de Cognito incorrectas.');
        }

        if (res.status === 409) {
          throw new Error('La cuenta requiere completar un desafío de Cognito (cambio inicial de contraseña).');
        }

        // Otros errores del servidor
        throw new Error(data?.mensaje || `Error del servidor AWS (HTTP ${res.status}).`);
      } catch (err) {
        // En modo estricto de producción (offlineFallback: false):
        // NO generar sesión simulada. El login DEBE fallar honestamente informando el error de red o de autenticación.
        if (!window.AURA_CONFIG || !window.AURA_CONFIG.offlineFallback) {
          if (err.name === 'TypeError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            throw new Error('No se pudo conectar con el servidor de autenticación en AWS (posible bloqueo de CORS o red).');
          }
          throw err;
        }

        console.warn('[AURA Auth] Falla en endpoint remoto Cognito, usando fallback local:', err.message);
      }

      // Fallback local SOLO si offlineFallback está explícitamente habilitado en desarrollo
      const normalizedEmail = email.trim().toLowerCase();
      let role = 'solicitante';
      let name = 'Carlos Mendoza';
      let roleTitle = 'Solicitante Departamental';
      let cognitoGroup = 'Solicitante';

      if (normalizedEmail.includes('director')) {
        role = 'director';
        name = 'Director General';
        roleTitle = 'Director Financiero & Aprobador Alto Monto';
        cognitoGroup = 'Director';
      } else if (normalizedEmail.includes('herberth') || normalizedEmail.includes('gerente')) {
        role = 'gerente';
        name = 'Ing. Herberth';
        roleTitle = 'Gerente Aprobador';
        cognitoGroup = 'Gerente';
      } else if (normalizedEmail.includes('ana') || normalizedEmail.includes('compras')) {
        role = 'compras';
        name = 'Ana Martínez';
        roleTitle = 'Compras & Adquisiciones';
        cognitoGroup = 'Compras';
      }

      const user = {
        email: normalizedEmail,
        name,
        role,
        roleTitle,
        cognitoGroup
      };

      const idToken = `cognito-jwt-${cognitoGroup.toLowerCase()}-${Date.now()}`;
      this.setSession({ idToken, accessToken: idToken }, user);

      return user;
    }
  }

  window.authService = new AuthService();
})();
