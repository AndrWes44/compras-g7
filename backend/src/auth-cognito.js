
'use strict';

const { CognitoJwtVerifier } = require('aws-jwt-verify');

const {
  JwtParseError,
  JwtInvalidSignatureError,
  JwtInvalidClaimError,
  FailedAssertionError,
  JwtWithoutValidKidError,
  KidNotFoundInJwksError
} = require('aws-jwt-verify/error');

const {
  CognitoIdentityProviderClient,
  GetUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');

// ==========================================
// CONFIGURACIÓN COGNITO
// ==========================================

const REGION = process.env.AWS_REGION || 'us-east-2';

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;

if (!USER_POOL_ID || !CLIENT_ID) {
  throw new Error(
    'Faltan COGNITO_USER_POOL_ID o COGNITO_APP_CLIENT_ID'
  );
}

const verificador = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  clientId: CLIENT_ID,
  tokenUse: 'access'
});

const cognito = new CognitoIdentityProviderClient({
  region: REGION,
  maxAttempts: 3
});

const ROLES_VALIDOS = new Set([
  'Solicitante',
  'Gerente',
  'Director',
  'Compras'
]);

// ==========================================
// CLASIFICAR ERRORES JWT
// ==========================================

function esTokenInvalido(error) {
  return (
    error instanceof JwtParseError ||
    error instanceof JwtInvalidSignatureError ||
    error instanceof JwtInvalidClaimError ||
    error instanceof FailedAssertionError ||
    error instanceof JwtWithoutValidKidError ||
    error instanceof KidNotFoundInJwksError
  );
}

// ==========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ==========================================

async function autenticar(req, res, next) {
  const encabezado = req.get('Authorization') || '';

  const coincidencia = /^Bearer\s+(\S+)$/i.exec(
    encabezado
  );

  if (!coincidencia) {
    return res.status(401).json({
      success: false,
      mensaje: 'Se requiere Access Token de Cognito'
    });
  }

  const token = coincidencia[1];

  // ========================================
  // 1. VERIFICAR FIRMA Y CLAIMS DEL JWT
  // ========================================

  let claims;

  try {
    claims = await verificador.verify(token);

  } catch (error) {
    if (esTokenInvalido(error)) {
      return res.status(401).json({
        success: false,
        mensaje: 'Token inválido o expirado'
      });
    }

    console.error(
      'Error verificando JWT:',
      error.constructor?.name || 'Error'
    );

    return res.status(503).json({
      success: false,
      mensaje: 'No se pudo verificar el token'
    });
  }

  // ========================================
  // 2. OBTENER ROLES DE COGNITO
  // ========================================

  const grupos = Array.isArray(
    claims['cognito:groups']
  )
    ? claims['cognito:groups']
    : [];

  const roles = grupos.filter(
    rol => ROLES_VALIDOS.has(rol)
  );

  if (roles.length === 0) {
    return res.status(403).json({
      success: false,
      mensaje: 'Usuario sin rol autorizado'
    });
  }

  // ========================================
  // 3. OBTENER CORREO VERIFICADO
  // ========================================

  let respuesta;

  try {
    respuesta = await cognito.send(
      new GetUserCommand({
        AccessToken: token
      })
    );

  } catch (error) {
    if (
      [
        'NotAuthorizedException',
        'UserNotFoundException',
        'InvalidParameterException'
      ].includes(error.name)
    ) {
      return res.status(401).json({
        success: false,
        mensaje: 'Sesión de Cognito no válida'
      });
    }

    console.error(
      'Error consultando Cognito:',
      error.name || 'Error'
    );

    return res.status(503).json({
      success: false,
      mensaje: 'Cognito no disponible'
    });
  }

  const atributos = Object.fromEntries(
    (respuesta.UserAttributes || []).map(
      atributo => [
        atributo.Name,
        atributo.Value
      ]
    )
  );

  const email = String(
    atributos.email || ''
  ).trim().toLowerCase();

  if (
    !email ||
    atributos.email_verified !== 'true'
  ) {
    return res.status(403).json({
      success: false,
      mensaje: 'Correo electrónico no verificado'
    });
  }

  // ========================================
  // 4. GUARDAR IDENTIDAD AUTENTICADA
  // ========================================

  req.usuario = {
    sub: claims.sub,
    email,
    roles
  };

  return next();
}

// ==========================================
// MIDDLEWARE DE AUTORIZACIÓN POR ROL
// ==========================================

function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        mensaje: 'Usuario no autenticado'
      });
    }

    const tienePermiso = req.usuario.roles.some(
      rol => rolesPermitidos.includes(rol)
    );

    if (!tienePermiso) {
      return res.status(403).json({
        success: false,
        mensaje: 'No tienes permiso para esta operación'
      });
    }

    return next();
  };
}

// ==========================================
// EXPORTACIONES
// ==========================================

module.exports = {
  autenticar,
  permitirRoles
};
