/**
 * AURA Compras - Configuración Centralizada de Entorno
 * Conectado directamente a AWS API Gateway y Amazon Cognito (us-east-2).
 * Estricta fidelidad en producción: sin modos simulados ni fallback a datos locales.
 */

(function () {
  // URL oficial definitiva de la API Express en AWS API Gateway
  const AWS_PRODUCTION_API_URL = 'https://6pkbutuqre.execute-api.us-east-2.amazonaws.com';

  const savedUrl = localStorage.getItem('AURA_API_URL');

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

    // Modo offlineFallback bloqueado estrictamente en false para producción en AWS.
    // Garantiza que los errores 400, 401, 403, 409, 429 o 5xx se reporten transparentemente sin crear registros locales ficticios.
    offlineFallback: false,

    // Métodos utilitarios para actualizar configuración en caliente
    setApiBaseUrl(newUrl) {
      this.apiBaseUrl = newUrl.trim().replace(/\/+$/, '');
      localStorage.setItem('AURA_API_URL', this.apiBaseUrl);
      console.log(`[AURA Config] API Base URL actualizada a: ${this.apiBaseUrl}`);
    },

    setOfflineFallback(enable) {
      // Bloqueado en producción para evitar simulación
      this.offlineFallback = false;
      localStorage.removeItem('AURA_OFFLINE_FALLBACK');
      console.warn('[AURA Config] El modo offlineFallback está deshabilitado en este entorno de producción AWS.');
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
