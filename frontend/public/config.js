/**
 * AURA Compras - Configuración Centralizada de Entorno
 * Permite alternar entre backend local, túnel de pruebas o entorno AWS desplegado.
 */

(function () {
  // Si estamos en el navegador en un puerto/host específico (ej: localhost:3000),
  // usar window.location.origin para evitar bloqueos por discrepancia localhost vs 127.0.0.1
  const browserOrigin = typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')
    ? window.location.origin
    : 'http://127.0.0.1:3000';
  const DEFAULT_API_URL = browserOrigin;

  // URL oficial definitiva de la API Express en AWS API Gateway
  const AWS_PRODUCTION_API_URL = 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';

  const savedUrl = localStorage.getItem('AURA_API_URL');
  const savedMode = localStorage.getItem('AURA_OFFLINE_FALLBACK');

  window.AURA_CONFIG = {
    // URL base de la API Express (prioriza la API pública de AWS por defecto)
    apiBaseUrl: savedUrl !== null ? savedUrl : AWS_PRODUCTION_API_URL,

    // Región AWS oficial del proyecto
    awsRegion: 'us-east-2',

    // Parámetros oficiales de Cognito en AWS (us-east-2)
    cognito: {
      userPoolId: localStorage.getItem('AURA_COGNITO_USER_POOL_ID') || 'us-east-2_mLXBZVjc5',
      clientId: localStorage.getItem('AURA_COGNITO_CLIENT_ID') || '2uu105iq0qdd09knlc7cjk61c7'
    },

    // Modo fallback a simulación si la API no está disponible
    // En producción en AWS es FALSE para garantizar estricta fidelidad: si AWS falla, se reporta el error real y no se crean registros ficticios.
    offlineFallback: savedMode !== null ? savedMode === 'true' : false,

    // Métodos utilitarios para actualizar configuración en caliente
    setApiBaseUrl(newUrl) {
      this.apiBaseUrl = newUrl.trim().replace(/\/+$/, '');
      localStorage.setItem('AURA_API_URL', this.apiBaseUrl);
      console.log(`[AURA Config] API Base URL actualizada a: ${this.apiBaseUrl}`);
    },

    setOfflineFallback(enable) {
      this.offlineFallback = Boolean(enable);
      localStorage.setItem('AURA_OFFLINE_FALLBACK', String(this.offlineFallback));
      console.log(`[AURA Config] Modo offline fallback: ${this.offlineFallback}`);
    },

    setCognitoParams(userPoolId, clientId) {
      this.cognito.userPoolId = userPoolId;
      this.cognito.clientId = clientId;
      localStorage.setItem('AURA_COGNITO_USER_POOL_ID', userPoolId);
      localStorage.setItem('AURA_COGNITO_CLIENT_ID', clientId);
    },

    resetDefaults() {
      localStorage.removeItem('AURA_API_URL');
      localStorage.removeItem('AURA_OFFLINE_FALLBACK');
      localStorage.removeItem('AURA_COGNITO_USER_POOL_ID');
      localStorage.removeItem('AURA_COGNITO_CLIENT_ID');
      this.apiBaseUrl = AWS_PRODUCTION_API_URL;
      this.offlineFallback = false;
      this.cognito.userPoolId = 'us-east-2_mLXBZVjc5';
      this.cognito.clientId = '2uu105iq0qdd09knlc7cjk61c7';
      console.log('[AURA Config] Configuración restablecida a valores predeterminados de producción en AWS.');
    }
  };
})();
