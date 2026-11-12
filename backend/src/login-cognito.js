'use strict';

const express = require('express');

const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const router = express.Router();

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2'
});

function leerClaims(token) {
  const partes = token.split('.');

  if (partes.length !== 3) {
    throw new Error('Token Cognito invalido');
  }

  return JSON.parse(
    Buffer.from(partes[1], 'base64url').toString('utf8')
  );
}

router.post('/', express.json({ limit: '16kb' }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const { email, password } = req.body || {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password ||
    email.length > 320
  ) {
    return res.status(400).json({
      mensaje: 'Correo y contraseña requeridos'
    });
  }

  const clientId = process.env.COGNITO_APP_CLIENT_ID;

  if (!clientId) {
    return res.status(503).json({
      mensaje: 'Autenticacion no configurada'
    });
  }

  try {
    const respuesta = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email.trim(),
          PASSWORD: password
        }
      })
    );

    if (
      respuesta.ChallengeName ||
      !respuesta.AuthenticationResult
    ) {
      return res.status(409).json({
        mensaje: 'La cuenta requiere completar un desafio de Cognito',
        challenge: respuesta.ChallengeName || 'UNKNOWN'
      });
    }

    const resultado = respuesta.AuthenticationResult;

    const accessToken = resultado.AccessToken;
    const idToken = resultado.IdToken;

    if (!accessToken || !idToken) {
      throw new Error('Cognito no devolvio los tokens esperados');
    }

    const accessClaims = leerClaims(accessToken);
    const idClaims = leerClaims(idToken);

    const grupos = (
      accessClaims['cognito:groups'] ||
      idClaims['cognito:groups'] ||
      []
    );

    const rolesPermitidos = [
      'Solicitante',
      'Gerente',
      'Director',
      'Compras'
    ];

    const grupo = rolesPermitidos.find(
      rol => grupos.some(
        g => String(g).toLowerCase() === rol.toLowerCase()
      )
    );

    if (!grupo) {
      return res.status(403).json({
        mensaje: 'Usuario sin rol autorizado'
      });
    }

    const usuario = {
      email: idClaims.email || email.trim(),
      name: idClaims.name || idClaims.email || email.trim(),
      role: grupo.toLowerCase(),
      roleTitle: grupo,
      cognitoGroup: grupo
    };

    return res.status(200).json({
      success: true,
      tokens: {
        idToken,
        accessToken,
        expiresIn: resultado.ExpiresIn,
        tokenType: 'Bearer'
      },
      user: usuario
    });

  } catch (error) {
    if (
      error.name === 'NotAuthorizedException' ||
      error.name === 'UserNotFoundException'
    ) {
      return res.status(401).json({
        mensaje: 'Correo o contraseña incorrectos'
      });
    }

    if (error.name === 'UserNotConfirmedException') {
      return res.status(403).json({
        mensaje: 'La cuenta no esta confirmada'
      });
    }

    if (
      error.name === 'TooManyRequestsException' ||
      error.name === 'LimitExceededException'
    ) {
      return res.status(429).json({
        mensaje: 'Demasiados intentos. Intenta mas tarde'
      });
    }

    console.error(
      'Error autenticacion Cognito:',
      error.name || 'Error desconocido'
    );

    return res.status(502).json({
      mensaje: 'No se pudo completar la autenticacion con Cognito'
    });
  }
});

module.exports = router;