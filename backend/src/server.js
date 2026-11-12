/*
AURA COMPRAS G7 - BACKEND PARA PEGAR
Reemplaza TODO el contenido de:
C:\Users\andre\OneDrive\Desktop\awsgrupo7\compras-g7\backend\src\server.js

Este archivo TXT contiene JavaScript valido completo. Copia desde este comentario
hasta el final. No cambies .env, lambda.js, contrasenas ni archivos del frontend.
Conserva src/lambda.handler. Usa las dependencias que ya declara backend/package.json.
Las secciones internas evitan que tengas que crear otros archivos de produccion.
*/
"use strict";
const nativeRequire = require;
const bundledModules = {
'./contracts.cjs': function(module, exports, require) {
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AuraContracts = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const roles = ["Solicitante", "Gerente", "Director", "Compras"];
  class ValidationError extends Error {
    constructor(message, field) {
      super(message);
      this.name = "ValidationError";
      this.status = 400;
      this.field = field;
    }
  }
  function text(value, max, field) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.trim().length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    ) {
      throw new ValidationError(
        `${field}: ingresa entre 1 y ${max} caracteres.`,
        field,
      );
    }
    return value.trim();
  }
  function cents(value, field = "monto") {
    if (
      !["number", "string"].includes(typeof value) ||
      (typeof value === "string" &&
        !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value.trim()))
    )
      throw new ValidationError(
        `${field}: usa un importe positivo con hasta dos decimales.`,
        field,
      );
    const n = Number(value),
      c = Math.round(n * 100);
    if (
      !Number.isFinite(n) ||
      n <= 0 ||
      c > 1000000000 ||
      !Number.isSafeInteger(c) ||
      Math.abs(n * 100 - c) >= 0.000001
    )
      throw new ValidationError(
        `${field}: importe fuera del rango permitido.`,
        field,
      );
    return c;
  }
  function moneyAliases(input, primary, alias, field) {
    const hasPrimary = input[primary] !== undefined;
    const hasAlias = input[alias] !== undefined;
    const value = cents(hasPrimary ? input[primary] : input[alias], field);
    if (hasPrimary && hasAlias && cents(input[alias], field) !== value)
      throw new ValidationError("Importes contradictorios.", field);
    return value;
  }
  function request(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ValidationError("Solicitud inválida.");
    const description = text(
      input.description ?? input.descripcion,
      1000,
      "descripcion",
    );
    const department = text(
      input.department ?? input.departamento,
      100,
      "departamento",
    );
    const proveedorId = text(input.proveedorId, 100, "proveedorId");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(proveedorId))
      throw new ValidationError("Proveedor inválido.", "proveedorId");
    const items = input.articulos ?? input.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 50)
      throw new ValidationError("Agrega entre 1 y 50 artículos.", "articulos");
    let sum = 0;
    const articulos = items.map((item, index) => {
      const field = `articulos.${index}`;
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new ValidationError("Artículo inválido.", field);
      const nombre = text(item.nombre, 200, `${field}.nombre`);
      const cantidad =
        typeof item.cantidad === "string" &&
        /^[1-9]\d*$/.test(item.cantidad.trim())
          ? Number(item.cantidad)
          : item.cantidad;
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10000)
        throw new ValidationError(
          "Cantidad: usa un entero entre 1 y 10000.",
          `${field}.cantidad`,
        );
      const unit = moneyAliases(
        item, "precioUnitario", "precio",
        `${field}.precioUnitario`,
      );
      const subtotal = unit * cantidad;
      sum += subtotal;
      if (!Number.isSafeInteger(sum) || sum > 1000000000)
        throw new ValidationError(
          "El total máximo es USD 10,000,000.",
          "monto",
        );
      if (
        item.subtotal !== undefined &&
        cents(item.subtotal, `${field}.subtotal`) !== subtotal
      )
        throw new ValidationError(
          "Subtotal distinto de cantidad por precio.",
          `${field}.subtotal`,
        );
      return {
        nombre,
        cantidad,
        precioUnitario: unit / 100,
        subtotal: subtotal / 100,
      };
    });
    if (moneyAliases(input, "amount", "monto", "monto") !== sum)
      throw new ValidationError(
        "Monto distinto de la suma de artículos.",
        "monto",
      );
    return {
      description,
      department,
      proveedorId,
      amount: sum / 100,
      articulos,
      requiereAprobacionDe: sum <= 100000 ? "Gerente" : "Director",
    };
  }
  function decision(input) {
    if (!["APPROVED", "REJECTED"].includes(input?.decision))
      throw new ValidationError("Decisión inválida.", "decision");
    const comments = input.comentarios ?? "";
    if (
      typeof comments !== "string" ||
      comments.trim().length > 500 ||
      (input.decision === "REJECTED" && !comments.trim())
    )
      throw new ValidationError(
        "Para rechazar escribe un motivo de hasta 500 caracteres.",
        "comentarios",
      );
    return { decision: input.decision, comentarios: comments.trim() };
  }
  function canSee(doc, user) {
    if (user.roles.includes("Compras")) return true;
    const own = doc.applicantSub
      ? doc.applicantSub === user.sub
      : String(doc.applicant || "")
          .trim()
          .toLowerCase() === user.email;
    if (user.roles.includes("Solicitante") && own) return true;
    return (
      Number.isFinite(doc.amount) &&
      doc.amount > 0 &&
      user.roles.includes(doc.amount <= 1000 ? "Gerente" : "Director")
    );
  }
  function canDecide(doc, user) {
    // Old records can bypass the validation performed on new requests.
    try { cents(doc.amount); }
    catch { return false; }
    return (
      doc.status === "PENDING" &&
      Number.isFinite(doc.amount) &&
      doc.amount > 0 &&
      typeof doc.applicant === "string" &&
      doc.applicant.trim() &&
      doc.applicantSub !== user.sub &&
      doc.applicant.trim().toLowerCase() !== user.email &&
      user.roles.includes(doc.amount <= 1000 ? "Gerente" : "Director") &&
      doc.requiereAprobacionDe === (doc.amount <= 1000 ? "Gerente" : "Director")
    );
  }
  return {
    roles,
    ValidationError,
    text,
    cents,
    request,
    decision,
    canSee,
    canDecide,
  };
});

},
'./app': function(module, exports, require) {
"use strict";
const express = require("express");
const { createHash, randomUUID } = require("node:crypto");
const C = require("./contracts.cjs");

function createApp({ store, workflow, identity, config = {} }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  const origins = new Set(
    (config.origins || "http://localhost:3001,http://127.0.0.1:3001")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const fail = (res, status, mensaje) =>
    res.status(status).json({ success: false, mensaje });
  app.use((req, res, next) => {
    req.correlationId = randomUUID();
    res.set({
      "X-Request-Id": req.correlationId,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    });
    if (config.production)
      res.set("Strict-Transport-Security", "max-age=31536000");
    const origin = req.get("Origin");
    res.vary("Origin");
    if (origin && !origins.has(origin))
      return fail(res, 403, "Origen no autorizado.");
    if (origin)
      res.set({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization,Content-Type,Accept,Idempotency-Key",
        "Access-Control-Expose-Headers": "Retry-After,X-Request-Id,ETag",
      });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  const asyncRoute = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  const authenticate = asyncRoute(async (req, res, next) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "");
    if (!bearer) return fail(res, 401, "Se requiere Access Token de Cognito.");
    req.token = bearer[1];
    req.usuario = await identity.authenticate(req.token);
    next();
  });
  const allow =
    (...roles) =>
    (req, res, next) =>
      req.usuario.roles.some((r) => roles.includes(r))
        ? next()
        : fail(res, 403, "No tienes permiso para esta operación.");
  const rate = (kind, max, windowSeconds, key) =>
    asyncRoute(async (req, res, next) => {
      const count = await store.rateLimit(
        `${kind}:${createHash("sha256").update(key(req)).digest("hex")}`,
        windowSeconds,
      );
      if (count > max) {
        res.set("Retry-After", String(windowSeconds));
        return fail(
          res,
          429,
          "Demasiadas solicitudes. Espera antes de intentar nuevamente.",
        );
      }
      next();
    });
  const ip = (req) => config.sourceIp?.(req) || req.ip;
  app.get("/health", (req, res) =>
    res.json({ mensaje: "Backend del Grupo 7 funcionando", estado: "OK" }),
  );
  // Start reading the bounded body before any async middleware. The Lambda
  // adapter marks the incoming stream complete after Express yields.
  app.use("/api/auth/login", express.json({ limit: "16kb" }));
  app.use(express.json({ limit: "100kb" }));
  // Bound authentication work even when a token is missing or invalid.
  app.use("/api", rate("api-ip", 300, 60, ip));
  app.use(
    "/api/auth/login",
    rate("login-ip", 20, 300, ip),
  );
  app.post(
    "/api/auth/login",
    rate("login-account", 10, 300, (req) =>
      String(req.body?.email || "")
        .trim()
        .toLowerCase(),
    ),
    asyncRoute(async (req, res) => {
      const email = C.text(req.body?.email, 320, "email").toLowerCase(),
        password = req.body?.password;
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== "string" ||
        !password ||
        password.length > 256
      )
        return fail(res, 400, "Correo y contraseña válidos requeridos.");
      const result = await identity.login(email, password);
      const role = C.roles.find((r) => result.user.roles.includes(r));
      res.json({
        ...result,
        user: {
          ...result.user,
          role: role.toLowerCase(),
          roleTitle: role,
          cognitoGroup: role,
        },
      });
    }),
  );
  // Recovery is deliberately not wired to password APIs until that flow is authorized.
  app.use(
    "/api",
    authenticate,
    rate("user", 120, 60, (req) => req.usuario.sub),
  );
  app.get("/api/auth/me", (req, res) =>
    res.json({ success: true, usuario: req.usuario }),
  );
  app.post(
    "/api/auth/logout",
    asyncRoute(async (req, res) => {
      await identity.logout(req.token);
      res.json({ success: true });
    }),
  );
  const validId = (req, res, next) =>
    /^[A-Za-z0-9_-]{1,100}$/.test(req.params.id)
      ? next()
      : fail(res, 400, "ID inválido.");
  const page = (req) => {
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new C.ValidationError("limit debe estar entre 1 y 100.");
    return { limit, cursor: req.query.cursor };
  };
  app.post(
    "/api/solicitudes",
    allow("Solicitante"),
    asyncRoute(async (req, res) => {
      const data = C.request(req.body),
        requestedKey = req.get("Idempotency-Key"),
        key = requestedKey ?? randomUUID();
      if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key))
        return fail(
          res,
          400,
          "Idempotency-Key de 16 a 100 caracteres es obligatorio.",
        );
      const requestId = `REQ-${createHash("sha256")
        .update(req.usuario.sub + "\0" + key)
        .digest("hex")}`;
      const payload = {
        ...data,
        requestId,
        applicant: req.usuario.email,
        applicantSub: req.usuario.sub,
      };
      // Legacy clients have no retry key. They keep the existing one-POST/one-flow
      // contract. Only explicitly keyed requests opt into execution lookup/reuse.
      const previous =
        requestedKey === undefined ? null : await workflow.find(requestId);
      if (previous) {
        if (previous.input !== JSON.stringify(payload))
          return fail(
            res,
            409,
            "La clave de envío ya se utilizó con otros datos.",
          );
        if (["FAILED", "TIMED_OUT", "ABORTED"].includes(previous.status))
          return fail(
            res,
            409,
            "El registro falló. Conserva el borrador y verifica el intento antes de reenviar.",
          );
        return res.status(202).json({
          success: true,
          requestId,
          estado: "REGISTERING",
          reused: true,
        });
      }
      await workflow.start(payload);
      res.status(202).json({
        success: true,
        requestId,
        estado: "REGISTERING",
        mensaje: "Registro iniciado; persistencia pendiente de confirmación.",
      });
    }),
  );
  app.get(
    "/api/solicitudes",
    asyncRoute(async (req, res) =>
      res.json(await store.listRequests(req.usuario, page(req))),
    ),
  );
  app.get(
    "/api/solicitudes/:id/registro",
    validId,
    asyncRoute(async (req, res) => {
      const doc = await store.getRequest(req.params.id);
      if (doc && C.canSee(doc, req.usuario))
        return res.json({ success: true, estado: "PERSISTED", solicitud: doc });
      const execution = await workflow.find(req.params.id);
      if (!execution) return fail(res, 404, "Registro no encontrado.");
      const input = JSON.parse(execution.input);
      if (input.applicantSub !== req.usuario.sub)
        return fail(res, 404, "Registro no encontrado.");
      const failed = ["FAILED", "TIMED_OUT", "ABORTED"].includes(
        execution.status,
      );
      // Successful execution without the expected record is an observable failure.
      res.json({
        success: !failed && execution.status !== "SUCCEEDED",
        estado:
          failed || execution.status === "SUCCEEDED" ? "FAILED" : "REGISTERING",
      });
    }),
  );
  app.get(
    "/api/solicitudes/:id",
    validId,
    asyncRoute(async (req, res) => {
      const doc = await store.getRequest(req.params.id);
      if (!doc || !C.canSee(doc, req.usuario))
        return fail(res, 404, "Solicitud no encontrada.");
      res.json({ success: true, solicitud: doc });
    }),
  );
  app.patch(
    "/api/solicitudes/:id/decision",
    validId,
    allow("Gerente", "Director"),
    asyncRoute(async (req, res) => {
      const aliases = ["comentarios", "comments", "comentario"].filter(
        (k) => req.body?.[k] !== undefined,
      );
      if (
        aliases.length > 1 &&
        aliases.some((k) => req.body[k] !== req.body[aliases[0]])
      )
        return fail(res, 400, "Comentarios contradictorios.");
      const decision = C.decision({
          ...req.body,
          comentarios: aliases.length ? req.body[aliases[0]] : "",
        }),
        doc = await store.getRequest(req.params.id);
      if (!doc || !C.canSee(doc, req.usuario))
        return fail(res, 404, "Solicitud no encontrada.");
      if (doc.status !== "PENDING")
        return fail(res, 409, "La solicitud ya fue decidida.");
      if (!C.canDecide(doc, req.usuario))
        return fail(res, 403, "No puedes decidir esta solicitud.");
      const solicitud = await store.decide(doc, decision, req.usuario);
      res.json({ success: true, solicitud });
    }),
  );
  app.use((req, res) => fail(res, 404, "Ruta no encontrada."));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.name === "ConditionalCheckFailedException"
        ? 409
        : error.type === "entity.too.large"
          ? 413
          : error.status || 500;
    const mensaje =
      status >= 500
        ? "No se pudo completar la operación. Intenta nuevamente."
        : error.name === "ConditionalCheckFailedException"
          ? "El registro cambió. Recarga antes de continuar."
          : status === 413
            ? "JSON demasiado grande."
            : error.type === "entity.parse.failed"
              ? "JSON inválido."
              : error.message;
    if (status === 429) res.set("Retry-After", "60");
    if (status >= 500)
      console.error(
        JSON.stringify({ requestId: req.correlationId, error: error.name }),
      );
    res.status(status).json({
      success: false,
      mensaje,
      field: error.field,
      requestId: req.correlationId,
    });
  });
  return app;
}
module.exports = { createApp };

},
'./identity': function(module, exports, require) {
"use strict";
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const {
  JwtParseError,
  JwtInvalidSignatureError,
  JwtInvalidClaimError,
  FailedAssertionError,
  JwtWithoutValidKidError,
  KidNotFoundInJwksError,
  ParameterValidationError,
} = require("aws-jwt-verify/error");
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
  GlobalSignOutCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const C = require("./contracts.cjs");
const error = (status, message) =>
  Object.assign(new Error(message), { status });
function createIdentity(config, { client, verifier } = {}) {
  const cognito =
    client ||
    new CognitoIdentityProviderClient({
      region: config.region,
      maxAttempts: 2,
    });
  const verify =
    verifier ||
    CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      clientId: config.clientId,
      tokenUse: "access",
    });
  async function authenticate(token) {
    let claims;
    try {
      claims = await verify.verify(token);
    } catch (e) {
      if (
        [
          JwtParseError,
          JwtInvalidSignatureError,
          JwtInvalidClaimError,
          FailedAssertionError,
          JwtWithoutValidKidError,
          KidNotFoundInJwksError,
          ParameterValidationError,
        ].some((Type) => e instanceof Type)
      )
        throw error(401, "Token inválido o expirado.");
      throw error(503, "No se pudo verificar la sesión.");
    }
    const roles = (
      Array.isArray(claims["cognito:groups"]) ? claims["cognito:groups"] : []
    ).filter((r) => C.roles.includes(r));
    if (!roles.length) throw error(403, "Usuario sin rol autorizado.");
    let user;
    try {
      user = await cognito.send(new GetUserCommand({ AccessToken: token }));
    } catch (e) {
      if (
        [
          "NotAuthorizedException",
          "UserNotFoundException",
          "InvalidParameterException",
        ].includes(e.name)
      )
        throw error(401, "Sesión inválida.");
      throw error(503, "No se pudo consultar Cognito.");
    }
    const a = Object.fromEntries(
      (user.UserAttributes || []).map((v) => [v.Name, v.Value]),
    );
    if (
      a.email_verified !== "true" ||
      !a.email ||
      !a.sub ||
      a.sub !== claims.sub
    )
      throw error(403, "Identidad o correo no verificado.");
    return {
      sub: claims.sub,
      email: a.email.trim().toLowerCase(),
      name: a.name || a.email,
      roles,
    };
  }
  return {
    authenticate,
    async login(email, password) {
      let response;
      try {
        response = await cognito.send(
          new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: config.clientId,
            AuthParameters: { USERNAME: email, PASSWORD: password },
          }),
        );
      } catch (e) {
        if (
          ["NotAuthorizedException", "UserNotFoundException"].includes(e.name)
        )
          throw error(401, "Correo o contraseña incorrectos.");
        if (e.name === "UserNotConfirmedException")
          throw error(403, "La cuenta no está confirmada.");
        if (
          ["TooManyRequestsException", "LimitExceededException"].includes(
            e.name,
          )
        )
          throw error(429, "Demasiados intentos. Intenta más tarde.");
        throw error(502, "No se pudo completar la autenticación.");
      }
      if (response.ChallengeName || !response.AuthenticationResult)
        throw error(
          409,
          "La cuenta requiere un desafío de Cognito. Completa ese proceso con el administrador.",
        );
      const r = response.AuthenticationResult;
      if (!r.AccessToken || !r.ExpiresIn)
        throw error(502, "Cognito no devolvió una sesión válida.");
      return {
        success: true,
        tokens: {
          accessToken: r.AccessToken,
          expiresIn: r.ExpiresIn,
          tokenType: "Bearer",
        },
        user: await authenticate(r.AccessToken),
      };
    },
    async logout(token) {
      try {
        await cognito.send(new GlobalSignOutCommand({ AccessToken: token }));
      } catch (e) {
        if (e.name !== "NotAuthorizedException")
          throw error(
            503,
            "No se pudo revocar la sesión remota. La sesión local se cerrará.",
          );
      }
    },
  };
}
module.exports = { createIdentity };

},
'./repository': function(module, exports, require) {
"use strict";
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  ScanCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const C = require("./contracts.cjs");
function cursorEncode(key) {
  return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null;
}
function cursorDecode(value, allowed) {
  if (value === undefined) return undefined;
  try {
    if (
      typeof value !== "string" ||
      value.length > 4096 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    )
      throw new Error();
    const raw = Buffer.from(value, "base64url");
    if (raw.toString("base64url") !== value) throw new Error();
    const key = JSON.parse(raw.toString());
    if (
      allowed.includes("requestId") &&
      !(
        typeof key?.requestId === "string" &&
        /^[A-Za-z0-9_-]{1,100}$/.test(key.requestId)
      )
    ) {
      throw new Error();
    }
    if (
      !key ||
      Array.isArray(key) ||
      typeof key !== "object" ||
      !Object.keys(key).length ||
      Object.keys(key).some(
        (k) =>
          !allowed.includes(k) ||
          typeof key[k] !== "string" ||
          key[k].length > 320,
      )
    )
      throw new Error();
    return key;
  } catch {
    throw new C.ValidationError("Cursor inválido.");
  }
}
function createStore(config, { client } = {}) {
  const db =
    client ||
    DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: config.region, maxAttempts: 3 }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  const requests = config.requestsTable;
  async function get(table, key) {
    return (
      await db.send(
        new GetCommand({ TableName: table, Key: key, ConsistentRead: true }),
      )
    ).Item;
  }
  return {
    getRequest: (id) => get(requests, { requestId: id }),
    async listRequests(user, { limit, cursor }) {
      let start = cursorDecode(cursor, [
        "requestId",
        "applicant",
        "createdAt",
        "requiereAprobacionDe",
      ]);
      const result = [];
      const sole = user.roles.length === 1 ? user.roles[0] : null;
      let index, keyName, keyValue;
      if (sole === "Solicitante" && config.applicantIndex) {
        index = config.applicantIndex;
        keyName = "applicant";
        keyValue = user.email;
      }
      if (["Gerente", "Director"].includes(sole) && config.roleIndex) {
        index = config.roleIndex;
        keyName = "requiereAprobacionDe";
        keyValue = sole;
      }
      for (let page = 0; page < 5 && result.length < limit; page++) {
        let input = {
          TableName: requests,
          Limit: limit - result.length,
          ExclusiveStartKey: start,
        };
        if (index)
          input = {
            ...input,
            IndexName: index,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: { "#pk": keyName },
            ExpressionAttributeValues: { ":pk": keyValue },
            ScanIndexForward: false,
          };
        else if (!user.roles.includes("Compras")) {
          const terms = [],
            names = {},
            values = {};
          if (user.roles.includes("Solicitante")) {
            terms.push("(#email = :email OR #owner = :owner)");
            names["#email"] = "applicant";
            names["#owner"] = "applicantSub";
            values[":email"] = user.email;
            values[":owner"] = user.sub;
          }
          if (user.roles.includes("Gerente")) {
            terms.push("(#amount > :zero AND #amount <= :max)");
            names["#amount"] = "amount";
            values[":zero"] = 0;
            values[":max"] = 1000;
          }
          if (user.roles.includes("Director")) {
            terms.push("#amount > :max");
            names["#amount"] = "amount";
            values[":max"] = 1000;
          }
          if (!terms.length)
            throw Object.assign(new Error("Usuario sin rol autorizado."), {
              status: 403,
            });
          input = {
            ...input,
            FilterExpression: terms.join(" OR "),
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
          };
        }
        const r = await db.send(
          index ? new QueryCommand(input) : new ScanCommand(input),
        );
        result.push(...(r.Items || []).filter((d) => C.canSee(d, user)));
        start = r.LastEvaluatedKey;
        if (!start) break;
      }
      return {
        solicitudes: result,
        total: result.length,
        alcanceTotal: "pagina",
        siguienteCursor: cursorEncode(start),
        hayMasRegistros: Boolean(start),
      };
    },
    async decide(doc, data, user) {
      const values = {
        ":pending": "PENDING",
        ":role": doc.amount <= 1000 ? "Gerente" : "Director",
        ":amount": doc.amount,
        ":applicant": doc.applicant,
        ":status": data.decision,
        ":author": user.email,
        ":sub": user.sub,
        ":comments": data.comentarios,
        ":now": new Date().toISOString(),
        ":history": [
          {
            status: data.decision,
            by: user.sub,
            at: new Date().toISOString(),
            comentarios: data.comentarios,
          },
        ],
        ":empty": [],
      };
      const names = {
        "#s": "status",
        "#r": "requiereAprobacionDe",
        "#a": "amount",
        "#e": "applicant",
        "#h": "history",
      };
      let condition =
        "attribute_exists(requestId) AND #s = :pending AND #r = :role AND #a = :amount AND #e = :applicant";
      if (doc.applicantSub) {
        condition += " AND applicantSub = :owner";
        values[":owner"] = doc.applicantSub;
      } else {
        condition += " AND attribute_not_exists(applicantSub)";
      }
      return (
        await db.send(
          new UpdateCommand({
            TableName: requests,
            Key: { requestId: doc.requestId },
            UpdateExpression:
              "SET #s = :status, decidedBy = :author, decidedBySub = :sub, comments = :comments, updatedAt = :now, #h = list_append(if_not_exists(#h, :empty), :history)",
            ConditionExpression: condition,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: "ALL_NEW",
          }),
        )
      ).Attributes;
    },
  };
}
module.exports = { createStore, cursorEncode, cursorDecode };

},
'./workflow': function(module, exports, require) {
"use strict";
const {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
} = require("@aws-sdk/client-sfn");
function createWorkflow(config, { client } = {}) {
  const sfn =
      client || new SFNClient({ region: config.region, maxAttempts: 3 }),
    arn = config.stateMachineArn;
  if (
    !/^arn:aws[a-z-]*:states:[^:]+:\d{12}:stateMachine:[A-Za-z0-9_-]+$/.test(
      arn || "",
    )
  )
    throw new Error(
      "STATE_MACHINE_ARN debe identificar una máquina Standard sin alias.",
    );
  const executionArn = (id) =>
    arn.replace(":stateMachine:", ":execution:") + ":exec-" + id;
  async function find(id) {
    try {
      const execution = await sfn.send(
        new DescribeExecutionCommand({ executionArn: executionArn(id) }),
      );
      // The existing workflow catches errors in a terminal Pass state.
      // AWS can therefore report SUCCEEDED while the application output failed.
      if (execution.status === "SUCCEEDED" && execution.output) {
        let output;
        try { output = JSON.parse(execution.output); }
        catch {
          throw Object.assign(new Error("Respuesta de registro invalida."), { status: 502 });
        }
        if (output && (output.status === "FAILED" || output.success === false))
          return { ...execution, status: "FAILED", awsStatus: execution.status };
      }
      return execution;
    } catch (e) {
      if (e.name === "ExecutionDoesNotExist") return null;
      throw e;
    }
  }
  return {
    find,
    async start(payload) {
      const input = JSON.stringify(payload);
      try {
        return await sfn.send(
          new StartExecutionCommand({
            stateMachineArn: arn,
            name: "exec-" + payload.requestId,
            input,
          }),
        );
      } catch (e) {
        if (e.name !== "ExecutionAlreadyExists") throw e;
        const previous = await find(payload.requestId);
        if (!previous || previous.input !== input)
          throw Object.assign(
            new Error("La clave de envío ya tiene otros datos."),
            { status: 409 },
          );
        if (["FAILED", "TIMED_OUT", "ABORTED"].includes(previous.status))
          throw Object.assign(
            new Error(
              "El intento anterior falló; revisa el registro antes de reenviar.",
            ),
            { status: 409 },
          );
        return previous;
      }
    },
  };
}
module.exports = { createWorkflow };

},
'./rate-limit': function(module, exports, require) {
"use strict";

// Secondary protection per Node/Lambda execution environment. API Gateway remains
// the shared throttle. This module does not claim cross-instance IP limiting.
function createMemoryLimiter({ now = Date.now, maxEntries = 10000 } = {}) {
  const entries = new Map();
  let lastCleanup = 0;
  return async function consume(key, seconds) {
    const current = Math.floor(now() / 1000);
    if (current - lastCleanup >= 60 || entries.size >= maxEntries) {
      for (const [id, item] of entries)
        if (item.expiresAt <= current) entries.delete(id);
      lastCleanup = current;
    }
    const window = Math.floor(current / seconds);
    const id = `${key}:${window}`;
    let item = entries.get(id);
    if (!item) {
      if (entries.size >= maxEntries) {
        throw Object.assign(
          new Error("Protección temporal de solicitudes ocupada."),
          { status: 503 },
        );
      }
      item = { count: 0, expiresAt: (window + 1) * seconds };
      entries.set(id, item);
    }
    item.count++;
    return item.count;
  };
}
module.exports = { createMemoryLimiter };

}
};
const bundledCache = new Map();
function load(id) {
  if (!Object.prototype.hasOwnProperty.call(bundledModules,id)) return nativeRequire(id);
  if (bundledCache.has(id)) return bundledCache.get(id).exports;
  const module = {exports:{}};
  bundledCache.set(id,module);
  bundledModules[id](module,module.exports,load);
  return module.exports;
}
function createRuntimeApp() {
  const require = load;
"use strict";
if (process.env.NODE_ENV !== "test") require("dotenv").config();
const { createApp } = require("./app");
const { createStore } = require("./repository");
const { createWorkflow } = require("./workflow");
const { createIdentity } = require("./identity");
const { createMemoryLimiter } = require("./rate-limit");
const config = {
  region: process.env.AWS_REGION || "us-east-2",
  requestsTable:
    process.env.DYNAMODB_TABLE ||
    process.env.TABLA_SOLICITUDES ||
    "g7-dev-solicitudes",
  stateMachineArn: process.env.STATE_MACHINE_ARN,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_APP_CLIENT_ID,
  origins: process.env.FRONTEND_ORIGINS,
  production: process.env.NODE_ENV === "production",
  applicantIndex: process.env.APPLICANT_INDEX,
  roleIndex: process.env.ROLE_INDEX,
};
for (const name of ["stateMachineArn", "userPoolId", "clientId"])
  if (!config[name])
    throw new Error(
      `Configuracion requerida: ${name}. Consulta backend/.env.example.`,
    );
config.sourceIp = (req) => {
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return req.ip;
  const { getCurrentInvoke } = require("@codegenie/serverless-express");
  const event = getCurrentInvoke().event;
  return (
    event?.requestContext?.http?.sourceIp ||
    event?.requestContext?.identity?.sourceIp ||
    "unknown"
  );
};
const app = createApp({
  store: { ...createStore(config), rateLimit: createMemoryLimiter() },
  workflow: createWorkflow(config),
  identity: createIdentity(config),
  config,
});

  return app;
}
const express = nativeRequire("express");
const app = express();
app.disable("x-powered-by");
let runtimeApp;
app.use((req,res,next)=>{
  try {
    if (!runtimeApp) runtimeApp = createRuntimeApp();
    return runtimeApp(req,res,next);
  } catch (_) {
    res.set({"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
    return res.status(503).json({success:false,mensaje:"El backend no esta configurado correctamente. Revisa las variables requeridas sin compartir secretos."});
  }
});
// Helpers for dependency-injected tests; they are not HTTP endpoints.
Object.defineProperty(app,"internals",{value:Object.freeze({
  ...load("./app"),...load("./identity"),...load("./repository"),
  ...load("./workflow"),...load("./rate-limit"),contracts:load("./contracts.cjs")
})});
module.exports=app;
if (nativeRequire.main === module) {
  runtimeApp=createRuntimeApp();
  const listener=app.listen(Number(process.env.PORT||3000),process.env.HOST||"127.0.0.1");
  listener.once("listening",()=>console.log("Backend AURA iniciado."));
  listener.once("error",error=>{
    console.error("No se pudo iniciar el backend:",error.code||error.name);
    process.exitCode=1;
  });
}
