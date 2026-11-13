"use strict";
// AURA backend: bundled internal modules; no frontend or AWS resources are included.
const nativeRequire = require;
const bundledModules = {
"./contracts.cjs": function(module,exports,require){
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
      !comments.trim() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(comments)
    )
      throw new ValidationError(
        "Para aprobar o rechazar escribe un comentario de hasta 500 caracteres.",
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
      (doc.assignedApproverSub === undefined || doc.assignedApproverSub === user.sub) &&
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
"./business-contracts": function(module,exports,require){
"use strict";

class BusinessError extends Error {
  constructor(status, message, field) {
    super(message);
    this.name = status === 400 ? "ValidationError" : "BusinessError";
    this.status = status;
    if (field) this.field = field;
  }
}
const fail = (status, message, field) => { throw new BusinessError(status, message, field); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
function text(value, max, field, required = false) {
  if (typeof value !== "string" || value.trim().length > max ||
      (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    fail(400, `${field}: texto invalido.`, field);
  return value.trim();
}
function id(value, field = "id") {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail(400, "Identificador invalido.", field);
  return value;
}
function owner(user) {
  if (!user || typeof user.sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(user.sub))
    fail(400, "Identidad invalida.");
  return user.sub;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail(400, "version debe ser un entero positivo.", "version");
  return value;
}
function page(options = {}) {
  const limit = options.limit === undefined ? 20 : options.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, "limit debe estar entre 1 y 100.", "limit");
  return { limit, cursor: options.cursor };
}
function money(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10000000)
    fail(400, `${field}: numero invalido.`, field);
  return value;
}
function aliases(input, canonical, alias) {
  if (input[canonical] !== undefined && input[alias] !== undefined &&
      JSON.stringify(input[canonical]) !== JSON.stringify(input[alias]))
    fail(400, `${canonical}: valores contradictorios.`, canonical);
  return input[canonical] !== undefined ? input[canonical] : input[alias];
}
function draft(input) {
  if (!object(input)) fail(400, "Borrador invalido.");
  const allowed = new Set(["description", "descripcion", "department", "departamento", "proveedorId", "amount", "monto", "articulos", "items"]);
  if (Object.keys(input).some(key => !allowed.has(key))) fail(400, "Campo de borrador no permitido.");
  const output = {};
  const description = aliases(input, "description", "descripcion");
  const department = aliases(input, "department", "departamento");
  const amount = aliases(input, "amount", "monto");
  const items = aliases(input, "articulos", "items");
  if (description !== undefined) output.description = text(description, 1000, "description");
  if (department !== undefined) output.department = text(department, 100, "department");
  if (input.proveedorId !== undefined) {
    output.proveedorId = text(input.proveedorId, 100, "proveedorId");
    if (output.proveedorId && !/^[A-Za-z0-9_-]+$/.test(output.proveedorId)) fail(400, "Proveedor invalido.", "proveedorId");
  }
  if (amount !== undefined) output.amount = money(amount, "amount");
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length > 50) fail(400, "Maximo 50 articulos.", "articulos");
    output.articulos = items.map((item, index) => {
      if (!object(item) || Object.keys(item).some(key => !["nombre", "cantidad", "precioUnitario", "precio", "subtotal"].includes(key)))
        fail(400, "Articulo invalido.", `articulos.${index}`);
      const result = {};
      if (item.nombre !== undefined) result.nombre = text(item.nombre, 200, `articulos.${index}.nombre`);
      if (item.cantidad !== undefined) {
        if (!Number.isInteger(item.cantidad) || item.cantidad < 0 || item.cantidad > 10000)
          fail(400, "Cantidad de borrador invalida.", `articulos.${index}.cantidad`);
        result.cantidad = item.cantidad;
      }
      const price = aliases(item, "precioUnitario", "precio");
      if (price !== undefined) result.precioUnitario = money(price, `articulos.${index}.precioUnitario`);
      if (item.subtotal !== undefined) result.subtotal = money(item.subtotal, `articulos.${index}.subtotal`);
      return result;
    });
  }
  return output;
}
const supplierFields = { name: 200, legalName: 250, taxId: 100, bankName: 200, bankAccount: 100, category: 100, contactEmail: 320, phone: 50 };
function supplier(input, partial = false) {
  if (!object(input) || Object.keys(input).some(key => !Object.hasOwn(supplierFields, key) && key !== "status"))
    fail(400, "Proveedor invalido o campo no permitido.");
  const result = {};
  for (const [key, max] of Object.entries(supplierFields)) {
    if (input[key] !== undefined) result[key] = text(input[key], max, key, key === "name");
  }
  if (!partial && !result.name) fail(400, "Nombre de proveedor requerido.", "name");
  if (result.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contactEmail)) fail(400, "Correo de contacto invalido.", "contactEmail");
  if (input.status !== undefined) {
    if (!["ACTIVE", "INACTIVE"].includes(input.status)) fail(400, "Estado de proveedor invalido.", "status");
    result.status = input.status;
  } else if (!partial) result.status = "ACTIVE";
  return result;
}
module.exports = { BusinessError, fail, object, text, id, owner, version, page, draft, supplier };

},
"./app": function(module,exports,require){
"use strict";
const express = require("express");
const { createHash, randomUUID } = require("node:crypto");
const C = require("./contracts.cjs");
const {installPublicRoutes,installPrivateRoutes} = require("./online-routes");

function createApp({ store, workflow, identity, business, access, config = {} }) {
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
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
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
    if (access) await access.assertAccountAccess(req.usuario);
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
      if (access) await access.assertAccountAccess(result.user);
      const role = result.user.isAdmin ? "Administrador" : C.roles.find((r) => result.user.roles.includes(r));
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
  installPublicRoutes(app,{access},{asyncRoute,rate,ip});
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
      if (business) {
        const supplier = await business.getSupplier(data.proveedorId);
        if (!supplier || supplier.status !== "ACTIVE") return fail(res,400,"Selecciona un proveedor activo.");
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
  installPrivateRoutes(app,{business,access,store,workflow,config},{asyncRoute,allow,validId,fail});
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
"./identity": function(module,exports,require){
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
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const C = require("./contracts.cjs");
const error = (status, message) =>
  Object.assign(new Error(message), { status });
function createIdentity(config, { client, verifier } = {}) {
  const adminGroup = config.adminGroup || "Administrador";
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
    const isAdmin = Array.isArray(claims["cognito:groups"]) && claims["cognito:groups"].includes(adminGroup);
    if (!roles.length && !isAdmin) throw error(403, "Usuario sin rol autorizado.");
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
      isAdmin,
      username: user.Username || claims.username || claims.sub,
    };
  }
  async function getDirectoryUser(identifier) {
    if (typeof identifier !== "string" || !identifier.trim() || identifier.length > 320)
      throw error(400, "Identificador de usuario inválido.");
    const found = await cognito.send(new AdminGetUserCommand({ UserPoolId: config.userPoolId, Username: identifier }));
    const attrs = Object.fromEntries((found.UserAttributes || []).map(v => [v.Name, v.Value]));
    if (!attrs.sub || !attrs.email || !found.Username) throw error(503, "Directorio de usuarios incompleto.");
    const groups = [];
    let next;
    for (let page = 0; page < 5; page++) {
      const result = await cognito.send(new AdminListGroupsForUserCommand({
        UserPoolId: config.userPoolId, Username: found.Username, Limit: 60,
        ...(next ? { NextToken: next } : {})
      }));
      groups.push(...(result.Groups || []).map(v => v.GroupName).filter(v => typeof v === "string"));
      next = result.NextToken;
      if (!next) break;
    }
    if (next) throw error(503, "No se pudieron verificar todos los grupos del usuario.");
    return { username: found.Username, sub: attrs.sub, email: attrs.email.trim().toLowerCase(),
      name: attrs.name || attrs.email, emailVerified: attrs.email_verified === "true",
      status: found.UserStatus, enabled: found.Enabled !== false, groups,
      roles: C.roles.filter(role => groups.includes(role)), isAdmin: groups.includes(adminGroup) };
  }
  return {
    authenticate,
    getDirectoryUser,
    async signUp({ email, password, name }) {
      const result = await cognito.send(new SignUpCommand({
        ClientId: config.clientId, Username: email, Password: password,
        UserAttributes: [{ Name: "email", Value: email }, ...(name ? [{ Name: "name", Value: name }] : [])]
      }));
      return { sub: result.UserSub, confirmed: result.UserConfirmed === true };
    },
    async confirmSignUp({ email, code }) {
      await cognito.send(new ConfirmSignUpCommand({ ClientId: config.clientId, Username: email, ConfirmationCode: code }));
    },
    async resendCode({ email }) {
      await cognito.send(new ResendConfirmationCodeCommand({ ClientId: config.clientId, Username: email }));
    },
    async assertCurrentAdmin(user) {
      if (!user?.isAdmin || !user.sub) throw error(403, "Se requiere administración de acceso.");
      const current = await getDirectoryUser(user.username || user.sub);
      if (current.sub !== user.sub || !current.isAdmin || !current.enabled ||
        !current.emailVerified || current.status !== "CONFIRMED")
        throw error(403, "El permiso de administración ya no está vigente.");
      return current;
    },
    async assignBusinessRole(identifier, role, expectedSub, expectedEmail) {
      if (!C.roles.includes(role)) throw error(400, "Rol de negocio inválido.");
      if (typeof expectedSub !== "string" || !expectedSub) throw error(400, "Identidad de destino requerida.");
      const target = await getDirectoryUser(identifier);
      if (target.sub !== expectedSub) throw error(409, "La identidad de destino cambió. No se modificó ningún grupo.");
      if (typeof expectedEmail !== "string" || target.email !== expectedEmail.trim().toLowerCase())
        throw error(409, "El correo del usuario cambió. Revisa su solicitud antes de asignar un rol.");
      if (!target.enabled || !target.emailVerified || target.status !== "CONFIRMED")
        throw error(409, "La cuenta debe estar confirmada y su correo verificado.");
      if (target.isAdmin) throw error(409, "La cuenta administrativa no se modifica mediante este flujo.");
      let assignmentError;
      try {
        await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: config.userPoolId, Username: target.username, GroupName: role }));
        for (const previous of target.roles.filter(value => value !== role))
          await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: config.userPoolId, Username: target.username, GroupName: previous }));
      } catch (failure) { assignmentError = failure; }
      try {
        await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: config.userPoolId, Username: target.username }));
      } catch (failure) { assignmentError = assignmentError || failure; }
      if (assignmentError) throw assignmentError;
      return { sub: target.sub, username: target.username, role };
    },
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
"./repository": function(module,exports,require){
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
    async cancelRequest(doc, user, comments) {
      const values={":pending":"PENDING",":cancelled":"CANCELLED",":now":new Date().toISOString(),
        ":history":[{status:"CANCELLED",by:user.sub,at:new Date().toISOString(),comentarios:comments}],":empty":[]};
      let condition="attribute_exists(requestId) AND #s = :pending";
      if(doc.applicantSub){condition+=" AND applicantSub = :owner";values[":owner"]=doc.applicantSub;}
      else condition+=" AND attribute_not_exists(applicantSub)";
      if(typeof doc.applicant==="string"){condition+=" AND applicant = :email";values[":email"]=doc.applicant;}
      else condition+=" AND attribute_not_exists(applicant)";
      return (await db.send(new UpdateCommand({TableName:requests,Key:{requestId:doc.requestId},
        UpdateExpression:"SET #s = :cancelled, updatedAt = :now, #h = list_append(if_not_exists(#h, :empty), :history)",
        ConditionExpression:condition,ExpressionAttributeNames:{"#s":"status","#h":"history"},
        ExpressionAttributeValues:values,ReturnValues:"ALL_NEW"}))).Attributes;
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
      if (doc.assignedApproverSub !== undefined) {
        condition += " AND assignedApproverSub = :assigned";
        values[":assigned"] = doc.assignedApproverSub;
      } else condition += " AND attribute_not_exists(assignedApproverSub)";
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
"./workflow": function(module,exports,require){
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
"./rate-limit": function(module,exports,require){
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

},
"./online-routes": function(module,exports,require){
"use strict";
const { createHash } = require("node:crypto");
const C = require("./contracts.cjs");
// DynamoDB maps do not preserve property order. SFN idempotency compares input
// bytes, so freeze one canonical JSON order before starting or comparing a draft.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const unavailable = () => { throw Object.assign(new Error("El servicio online requiere BUSINESS_TABLE y permisos AWS configurados."), { status: 503 }); };
const owns = (doc, user) => doc.applicantSub ? doc.applicantSub === user.sub :
  typeof doc.applicant === "string" && doc.applicant.trim().toLowerCase() === user.email;
const versionOf = body => {
  if (!Number.isSafeInteger(body?.version) || body.version < 1)
    throw new C.ValidationError("version debe ser un entero positivo.", "version");
  return body.version;
};
function paging(req) {
  const raw = req.query.limit ?? "20";
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw) || Number(raw) > 100)
    throw new C.ValidationError("limit debe estar entre 1 y 100.");
  if (req.query.cursor !== undefined && typeof req.query.cursor !== "string")
    throw new C.ValidationError("Cursor invalido.");
  return { limit: Number(raw), cursor: req.query.cursor };
}
function installPublicRoutes(app, { access }, { asyncRoute, rate, ip }) {
  for (const [route, method] of [["registro", "register"], ["confirmar", "confirm"], ["reenviar", "resend"]]) {
    app.post("/api/auth/" + route,
      rate("signup-ip", 20, 300, ip),
      rate("signup-" + route, 8, 300, req => String(req.body?.email || "").trim().toLowerCase()),
      asyncRoute(async (req, res) => {
        if (!access) return unavailable();
        const result = await access[method](req.body);
        res.status(route === "registro" ? 202 : 200).json(result);
      }));
  }
}
function installPrivateRoutes(app, { business, access, store, workflow, config }, { asyncRoute, allow, validId, fail }) {
  const needBusiness = (req, res, next) => business ? next() : unavailable();
  app.get("/api/capacidades", (req, res) => res.json({ success: true,
    borradoresOnline: Boolean(business), proveedoresOnline: Boolean(business),
    registroConAprobacion: Boolean(access && config.registrationEnabled), administracionUsuarios: Boolean(access && req.usuario.isAdmin),
    roles: C.roles, requiereVerificacionCorreo: true, requiereAprobacionAdmin: true,
    persistencia: "AWS", simulacion: false }));

  app.get("/api/borradores", allow("Solicitante"), needBusiness, asyncRoute(async (req, res) => {
    const page = await business.listDrafts(req.usuario, paging(req));
    res.json({ ...page, borradores: page.items });
  }));
  app.post("/api/borradores", allow("Solicitante"), needBusiness, asyncRoute(async (req, res) => {
    const borrador = await business.createDraft(req.usuario, req.body);
    res.status(201).json({ success: true, borrador });
  }));
  app.get("/api/borradores/:id", allow("Solicitante"), validId, needBusiness, asyncRoute(async (req, res) => {
    const borrador = await business.getDraft(req.usuario, req.params.id);
    if (!borrador) return fail(res, 404, "Borrador no encontrado.");
    res.json({ success: true, borrador });
  }));
  app.patch("/api/borradores/:id", allow("Solicitante"), validId, needBusiness, asyncRoute(async (req, res) => {
    const version = versionOf(req.body);
    const { version: ignored, ...data } = req.body;
    const borrador = await business.updateDraft(req.usuario, req.params.id, data, version);
    res.json({ success: true, borrador });
  }));
  app.delete("/api/borradores/:id", allow("Solicitante"), validId, needBusiness, asyncRoute(async (req, res) => {
    await business.deleteDraft(req.usuario, req.params.id, versionOf(req.body));
    res.json({ success: true });
  }));
  app.post("/api/borradores/:id/enviar", allow("Solicitante"), validId, needBusiness, asyncRoute(async (req, res) => {
    const version = versionOf(req.body);
    const draft = await business.getDraft(req.usuario, req.params.id);
    if (!draft) return fail(res, 404, "Borrador no encontrado.");
    let payload = draft.submissionPayload;
    let requestId = draft.requestId;
    if (!payload) {
      const data = C.request(draft);
      const supplier = await business.getSupplier(data.proveedorId);
      if (!supplier || supplier.status !== "ACTIVE") return fail(res, 400, "Selecciona un proveedor activo.");
      requestId = "REQ-" + createHash("sha256").update(req.usuario.sub + "\0draft:" + req.params.id + ":" + version).digest("hex");
      payload = { ...data, requestId, applicant: req.usuario.email, applicantSub: req.usuario.sub };
    }
    const locked = await business.lockDraftForSubmit(req.usuario, req.params.id, version, payload, requestId);
    payload = canonical(locked.submissionPayload);
    requestId = locked.requestId;
    const previous = await workflow.find(requestId);
    if (previous) {
      if (previous.input !== JSON.stringify(payload)) return fail(res, 409, "El flujo existente contiene otros datos.");
      if (["FAILED", "TIMED_OUT", "ABORTED"].includes(previous.status))
        return fail(res, 409, "El envio fallo. Revisa este intento antes de crear otra solicitud.");
    } else await workflow.start(payload);
    await business.markDraftSubmitted(req.usuario, req.params.id, requestId);
    res.status(202).json({ success: true, requestId, estado: "REGISTERING", reused: Boolean(previous),
      mensaje: "Envio iniciado. Consulta /api/solicitudes/:id/registro para confirmar persistencia." });
  }));

  app.get("/api/aprobaciones", allow("Gerente", "Director"), asyncRoute(async (req, res) => {
    const page = await store.listRequests(req.usuario, paging(req));
    const solicitudes = page.solicitudes.filter(doc => C.canDecide(doc, req.usuario) &&
      (!doc.assignedApproverSub || doc.assignedApproverSub === req.usuario.sub));
    res.json({ ...page, solicitudes, total: solicitudes.length, asignacion: "ROL_ELEGIBLE", alcanceTotal: "pagina" });
  }));
  app.post("/api/solicitudes/:id/anular", allow("Solicitante"), validId, asyncRoute(async (req, res) => {
    const comments = C.text(req.body?.comentarios, 500, "comentarios");
    const doc = await store.getRequest(req.params.id);
    if (!doc || !owns(doc, req.usuario)) return fail(res, 404, "Solicitud no encontrada.");
    if (doc.status !== "PENDING") return fail(res, 409, "Solo se puede anular una solicitud pendiente.");
    const solicitud = await store.cancelRequest(doc, req.usuario, comments);
    res.json({ success: true, solicitud });
  }));

  app.get("/api/proveedores", allow(...C.roles), needBusiness, asyncRoute(async (req, res) => {
    const page = await business.listSuppliers(req.usuario, { ...paging(req), activeOnly: req.usuario.roles.includes("Solicitante") });
    res.json({ ...page, proveedores: page.items });
  }));
  app.get("/api/proveedores/:id", allow(...C.roles), validId, needBusiness, asyncRoute(async (req, res) => {
    const proveedor = await business.getSupplier(req.params.id);
    if (!proveedor || proveedor.status === "DELETED" ||
      (req.usuario.roles.includes("Solicitante") && proveedor.status !== "ACTIVE")) return fail(res, 404, "Proveedor no encontrado.");
    if (!req.usuario.roles.includes("Compras")) {
      const { taxId, bankName, bankAccount, ...summary } = proveedor;
      return res.json({ success: true, proveedor: summary });
    }
    res.json({ success: true, proveedor });
  }));
  app.post("/api/proveedores", allow("Compras"), needBusiness, asyncRoute(async (req, res) =>
    res.status(201).json({ success: true, proveedor: await business.createSupplier(req.usuario, req.body) })));
  app.patch("/api/proveedores/:id", allow("Compras"), validId, needBusiness, asyncRoute(async (req, res) => {
    const version = versionOf(req.body);
    const { version: ignored, ...data } = req.body;
    res.json({ success: true, proveedor: await business.updateSupplier(req.usuario, req.params.id, data, version) });
  }));
  app.delete("/api/proveedores/:id", allow("Compras"), validId, needBusiness, asyncRoute(async (req, res) => {
    await business.deleteInactiveSupplier(req.usuario, req.params.id, versionOf(req.body));
    res.json({ success: true });
  }));

  const needAccess = (req, res, next) => access ? next() : unavailable();
  const admin = asyncRoute(async (req, res, next) => {
    if (req.usuario.isAdmin !== true) return fail(res, 403, "Se requiere administrador de cuentas.");
    next();
  });
  app.get("/api/admin/usuarios", admin, needAccess, asyncRoute(async (req, res) => {
    const result = await access.listPending(req.usuario, { ...paging(req), status: req.query.estado ?? "PENDING_APPROVAL" });
    res.json(result);
  }));
  app.patch("/api/admin/usuarios/:id", admin, validId, needAccess, asyncRoute(async (req, res) => {
    const result = await access.decide(req.usuario, req.params.id, req.body);
    res.json(result);
  }));
}
module.exports = { installPublicRoutes, installPrivateRoutes };

},
"./business-store": function(module,exports,require){
"use strict";
const { randomUUID, createHash } = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const C = require("./business-contracts");
const copy = value => JSON.parse(JSON.stringify(value));
const stable = value => Array.isArray(value) ? value.map(stable) : C.object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
function cursorEncode(key) { return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null; }
function cursorDecode(value, pk, prefix) {
  if (value === undefined) return undefined;
  try {
    if (typeof value !== "string" || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw Error();
    const key = JSON.parse(bytes.toString("utf8"));
    if (!C.object(key) || Object.keys(key).length !== 2 || key.pk !== pk ||
        typeof key.sk !== "string" || !key.sk.startsWith(prefix) ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(key.sk.slice(prefix.length))) throw Error();
    return key;
  } catch { C.fail(400, "Cursor invalido para esta coleccion.", "cursor"); }
}
function domain(doc) {
  if (!doc) return undefined;
  const { pk, sk, submissionFingerprint, ...publicDoc } = doc;
  return copy(publicDoc);
}
function summary(doc, user) {
  const result = domain(doc);
  if (!user?.roles?.includes("Compras")) {
    delete result.taxId; delete result.bankName; delete result.bankAccount;
  }
  return result;
}
function createBusinessStore(config = {}, { client, now = () => new Date().toISOString(), uuid = randomUUID } = {}) {
  const db = client || DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region || "us-east-2", maxAttempts: 3 }),
    { marshallOptions: { removeUndefinedValues: true } });
  const table = config.businessTable || config.BUSINESS_TABLE;
  const timestamp = () => { const value = now(); return value instanceof Date ? value.toISOString() : String(value); };
  function requireTable() { if (!table) C.fail(503, "BUSINESS_TABLE no esta configurada."); }
  const draftKey = (user, id) => ({ pk: "USER#" + C.owner(user), sk: "DRAFT#" + C.id(id) });
  const supplierKey = id => ({ pk: "SUPPLIERS", sk: "SUPPLIER#" + C.id(id) });
  async function get(key, type) {
    requireTable();
    const doc = (await db.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;
    if (!doc || doc.entityType !== type || doc.status === "DELETED" ||
        (type === "DRAFT" && doc.ownerSub !== key.pk.slice(5))) C.fail(404, "Registro no encontrado.");
    return doc;
  }
  async function create(doc) {
    requireTable();
    try { await db.send(new PutCommand({ TableName: table, Item: doc,
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)" })); }
    catch (error) { if (error.name === "ConditionalCheckFailedException") C.fail(409, "El registro ya existe."); throw error; }
    return domain(doc);
  }
  function condition(doc) {
    const names = { "#v": "version", "#s": "status", "#t": "entityType" };
    const values = { ":version": doc.version, ":status": doc.status, ":type": doc.entityType };
    let expression = "attribute_exists(pk) AND #v = :version AND #s = :status AND #t = :type";
    if (doc.entityType === "DRAFT") { expression += " AND ownerSub = :owner"; values[":owner"] = doc.ownerSub; }
    if (doc.requestId) { expression += " AND requestId = :requestId"; values[":requestId"] = doc.requestId; }
    if (doc.submissionFingerprint) { expression += " AND submissionFingerprint = :fingerprint"; values[":fingerprint"] = doc.submissionFingerprint; }
    return { ConditionExpression: expression, ExpressionAttributeNames: names, ExpressionAttributeValues: values };
  }
  async function replace(current, next) {
    requireTable();
    try { await db.send(new PutCommand({ TableName: table, Item: next, ...condition(current) })); }
    catch (error) { if (error.name === "ConditionalCheckFailedException") C.fail(409, "El registro cambio; vuelve a consultarlo."); throw error; }
    return domain(next);
  }
  function requireCurrent(doc, expected, states) {
    C.version(expected);
    if (doc.version !== expected || !states.includes(doc.status)) C.fail(409, "Version o estado no permite esta operacion.");
  }
  async function list(pk, prefix, type, user, options = {}, activeOnly = false) {
    requireTable();
    const { limit, cursor } = C.page(options);
    let key = cursorDecode(cursor, pk, prefix);
    const items = [];
    for (let page = 0; page < 5 && items.length < limit; page++) {
      const response = await db.send(new QueryCommand({ TableName: table, ConsistentRead: true,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        FilterExpression: type === "DRAFT" ? "(#s = :draft OR #s = :registering)" : activeOnly ? "#s = :active" : "#s <> :deleted",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix,
          ...(type === "DRAFT" ? { ":draft": "DRAFT", ":registering": "REGISTERING" } : activeOnly ? { ":active": "ACTIVE" } : { ":deleted": "DELETED" }) },
        Limit: limit - items.length, ExclusiveStartKey: key }));
      for (const doc of response.Items || []) {
        const visibleStatus = type === "DRAFT" ? ["DRAFT", "REGISTERING"].includes(doc.status)
          : activeOnly ? doc.status === "ACTIVE" : ["ACTIVE", "INACTIVE"].includes(doc.status);
        if (doc.pk === pk && typeof doc.sk === "string" && doc.sk.startsWith(prefix) && doc.entityType === type && visibleStatus &&
            (type !== "DRAFT" || doc.ownerSub === user.sub)) items.push(type === "SUPPLIER" ? summary(doc, user) : domain(doc));
      }
      key = response.LastEvaluatedKey;
      if (!key) break;
    }
    return { items, total: items.length, alcanceTotal: "pagina", siguienteCursor: cursorEncode(key), hayMasRegistros: Boolean(key) };
  }
  return {
    async createDraft(user, input) {
      const fields = C.draft(input), sub = C.owner(user), id = C.id(uuid()), time = timestamp();
      return create({ ...draftKey(user, id), entityType: "DRAFT", id, ownerSub: sub,
        ownerEmail: user.email || "", version: 1, status: "DRAFT", ...fields, createdAt: time, updatedAt: time });
    },
    async getDraft(user, id) { return domain(await get(draftKey(user, id), "DRAFT")); },
    listDrafts(user, options) { return list("USER#" + C.owner(user), "DRAFT#", "DRAFT", user, options); },
    async updateDraft(user, id, input, version) {
      C.version(version); const fields = C.draft(input), doc = await get(draftKey(user, id), "DRAFT");
      requireCurrent(doc, version, ["DRAFT"]);
      return replace(doc, { ...doc, ...fields, version: version + 1, updatedAt: timestamp() });
    },
    async deleteDraft(user, id, version) {
      C.version(version); const doc = await get(draftKey(user, id), "DRAFT"); requireCurrent(doc, version, ["DRAFT"]);
      try { await db.send(new DeleteCommand({ TableName: table, Key: draftKey(user, id), ...condition(doc) })); }
      catch (error) { if (error.name === "ConditionalCheckFailedException") C.fail(409, "El borrador cambio; no se elimino."); throw error; }
      return { id, status: "DELETED", version: version + 1 };
    },
    async lockDraftForSubmit(user, id, version, payload, requestId) {
      C.version(version); C.id(requestId, "requestId");
      if (!C.object(payload)) C.fail(400, "Payload de envio invalido.");
      const serialized = JSON.stringify(stable(payload));
      if (!serialized || Buffer.byteLength(serialized) > 100000) C.fail(400, "Payload de envio demasiado grande.");
      const snapshot = copy(payload), fingerprint = createHash("sha256").update(serialized).digest("hex");
      if ((snapshot.applicantSub !== undefined && snapshot.applicantSub !== C.owner(user)) ||
          (snapshot.requestId !== undefined && snapshot.requestId !== requestId)) C.fail(400, "Identidad o ID de envio contradictorios.");
      const key = draftKey(user, id);
      const sameSubmission = doc => ["REGISTERING", "SUBMITTED"].includes(doc.status) &&
        doc.submitVersion === version && doc.requestId === requestId && doc.submissionFingerprint === fingerprint;
      const doc = await get(key, "DRAFT");
      if (sameSubmission(doc)) return domain(doc);
      requireCurrent(doc, version, ["DRAFT"]);
      const next = { ...doc, status: "REGISTERING", version: version + 1, submitVersion: version,
        requestId, submissionPayload: snapshot, submissionFingerprint: fingerprint, updatedAt: timestamp() };
      try { return await replace(doc, next); }
      catch (error) {
        if (error.status !== 409) throw error;
        const latest = await get(key, "DRAFT");
        if (sameSubmission(latest)) return domain(latest);
        throw error;
      }
    },
    async markDraftSubmitted(user, id, requestId) {
      C.id(requestId, "requestId"); const doc = await get(draftKey(user, id), "DRAFT");
      if (doc.requestId !== requestId || !["REGISTERING", "SUBMITTED"].includes(doc.status)) C.fail(409, "El envio no coincide con el borrador bloqueado.");
      if (doc.status === "SUBMITTED") return domain(doc);
      try { return await replace(doc, { ...doc, status: "SUBMITTED", version: doc.version + 1, updatedAt: timestamp() }); }
      catch (error) {
        if (error.status !== 409) throw error;
        const latest = await get(draftKey(user, id), "DRAFT");
        if (latest.status === "SUBMITTED" && latest.requestId === requestId) return domain(latest);
        throw error;
      }
    },
    async createSupplier(user, input) {
      const fields = C.supplier(input), sub = C.owner(user), id = C.id(uuid()), time = timestamp();
      return create({ ...supplierKey(id), entityType: "SUPPLIER", id, ...fields, version: 1,
        createdBySub: sub, createdByEmail: user.email || "", updatedBySub: sub, createdAt: time, updatedAt: time });
    },
    async getSupplier(id) { return domain(await get(supplierKey(id), "SUPPLIER")); },
    listSuppliers(user, options = {}) { return list("SUPPLIERS", "SUPPLIER#", "SUPPLIER", user, options, Boolean(options.activeOnly)); },
    async updateSupplier(user, id, input, version) {
      C.version(version); C.owner(user); const fields = C.supplier(input, true), doc = await get(supplierKey(id), "SUPPLIER");
      requireCurrent(doc, version, ["ACTIVE", "INACTIVE"]);
      return replace(doc, { ...doc, ...fields, version: version + 1, updatedBySub: user.sub, updatedAt: timestamp() });
    },
    async deleteInactiveSupplier(user, id, version) {
      C.version(version); C.owner(user); const doc = await get(supplierKey(id), "SUPPLIER");
      requireCurrent(doc, version, ["INACTIVE"]);
      return replace(doc, { ...doc, status: "DELETED", version: version + 1, updatedBySub: user.sub, updatedAt: timestamp() });
    }
  };
}
module.exports = { createBusinessStore, cursorEncode, cursorDecode };

},
"./access-service": function(module,exports,require){
"use strict";
const { randomUUID } = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const C = require("./contracts.cjs");
const failure = (status, message) => Object.assign(new Error(message), { status });
const PK = "ACCESS_REQUESTS";
const generic = () => ({ success: true, mensaje: "Si la solicitud procede, recibirás las instrucciones correspondientes en tu correo." });
function inputObject(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key)))
    throw failure(400, "Solicitud de acceso inválida.");
}
function emailOf(value) {
  const email = C.text(value, 320, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure(400, "Correo inválido.");
  return email;
}
function keyOf(sub) {
  if (typeof sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sub)) throw failure(400, "Identificador inválido.");
  return { pk: PK, sk: "USER#" + sub };
}
function encode(key) { return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null; }
function decode(cursor) {
  if (cursor === undefined || cursor === null) return undefined;
  try {
    if (typeof cursor !== "string" || cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error();
    const raw = Buffer.from(cursor, "base64url");
    if (raw.toString("base64url") !== cursor) throw Error();
    const key = JSON.parse(raw.toString());
    if (key.pk !== PK || typeof key.sk !== "string" || !/^USER#[A-Za-z0-9_-]{1,128}$/.test(key.sk) ||
      Object.keys(key).some(name => !["pk", "sk"].includes(name))) throw Error();
    return key;
  } catch { throw failure(400, "Cursor inválido."); }
}
function createAccessService(config, { identity, client, clock = () => Date.now(), uuid = randomUUID } = {}) {
  // Lambda executions are bounded by 15 minutes. A crashed worker retains the
  // operation for 16 minutes before another invocation can resume it. This is
  // exclusion/recovery, not an atomic transaction across Cognito and DynamoDB.
  const workerLeaseMs = 16 * 60 * 1000;
  const table = config.businessTable || config.BUSINESS_TABLE;
  const enabled = config.registrationEnabled === true || config.registrationEnabled === "true" || config.REGISTRATION_ENABLED === "true";
  const db = client || DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region, maxAttempts: 3 }), {
    marshallOptions: { removeUndefinedValues: true }
  });
  function requireTable() { if (!table) throw failure(503, "El registro de acceso no está habilitado en este entorno."); }
  function requireRegistration() { requireTable(); if (!enabled) throw failure(503, "El registro de acceso no está habilitado en este entorno."); }
  async function send(command) {
    try { return await db.send(command); }
    catch (error) {
      if (error.name === "ConditionalCheckFailedException") throw failure(409, "La solicitud cambió; vuelve a consultarla.");
      throw failure(503, "No se pudo acceder al registro de solicitudes de acceso.");
    }
  }
  async function get(sub) { return (await send(new GetCommand({ TableName: table, Key: keyOf(sub), ConsistentRead: true }))).Item; }
  async function assertAdmin(user) {
    try { return await identity.assertCurrentAdmin(user); }
    catch (error) { if (error.status === 403) throw error; throw failure(503, "No se pudo verificar el permiso administrativo actual."); }
  }
  function confirmed(user) { return user && user.emailVerified && user.status === "CONFIRMED" && user.enabled !== false; }
  return {
    async register(input) {
      requireRegistration(); inputObject(input, ["email", "password", "name"]);
      const email = emailOf(input.email), password = input.password;
      if (typeof password !== "string" || !password || password.length > 256) throw failure(400, "Contraseña inválida.");
      const name = input.name === undefined ? email : C.text(input.name, 150, "name");
      // Confirm that the provisioned business table is accessible before Cognito creates an account.
      await send(new GetCommand({ TableName: table, Key: { pk: PK, sk: "CONFIG" }, ConsistentRead: true }));
      let result;
      try { result = await identity.signUp({ email, password, name }); }
      catch (error) {
        if (error.name === "UsernameExistsException") return generic();
        if (["InvalidPasswordException", "InvalidParameterException"].includes(error.name)) throw failure(400, "No se pudo registrar la cuenta con los datos indicados.");
        throw failure(503, "No se pudo procesar el registro; intenta más tarde.");
      }
      const key = keyOf(result.sub), now = new Date().toISOString();
      await send(new PutCommand({ TableName: table, Item: {
        ...key, sub: result.sub, email, name, status: "AWAITING_EMAIL", version: 1, createdAt: now, updatedAt: now,
        history: [{ action: "REGISTRATION_REQUESTED", at: now }]
      }, ConditionExpression: "attribute_not_exists(pk)" }));
      return generic();
    },
    async confirm(input) {
      requireRegistration(); inputObject(input, ["email", "code"]);
      const email = emailOf(input.email), code = C.text(input.code, 128, "code");
      try { await identity.confirmSignUp({ email, code }); }
      catch (error) {
        if (error.name !== "NotAuthorizedException") throw failure(400, "No se pudo confirmar el correo con ese código.");
      }
      let directory;
      try { directory = await identity.getDirectoryUser(email); }
      catch { throw failure(400, "No se pudo confirmar el correo con ese código."); }
      if (!confirmed(directory) || directory.email !== email) throw failure(400, "El correo todavía no está verificado.");
      const record = await get(directory.sub);
      // Recover a signup whose Cognito creation succeeded but ledger write failed.
      // Existing business or administrative accounts must never be locked by this public endpoint.
      if (!record && !directory.isAdmin && !directory.roles?.length) {
        const now = new Date().toISOString();
        try {
          await send(new PutCommand({ TableName: table, Item: {
            ...keyOf(directory.sub), sub: directory.sub, email: directory.email, name: directory.name || directory.email,
            username: directory.username, emailVerified: true, status: "PENDING_APPROVAL", version: 1,
            createdAt: now, updatedAt: now, history: [{ action: "EMAIL_VERIFIED_RECOVERED", at: now }]
          }, ConditionExpression: "attribute_not_exists(pk)" }));
        } catch (error) { if (error.status !== 409) throw error; }
      } else if (record?.status === "AWAITING_EMAIL" ||
        (record?.status === "PENDING_APPROVAL" && record.email !== directory.email)) {
        const now = new Date().toISOString();
        await send(new UpdateCommand({ TableName: table, Key: keyOf(directory.sub),
          ConditionExpression: "#s = :old AND #v = :version",
          UpdateExpression: "SET #s = :pending, #v = :next, #email = :email, #name = :name, emailVerified = :verified, username = :username, updatedAt = :now, #h = list_append(if_not_exists(#h, :empty), :audit)",
          ExpressionAttributeNames: { "#s": "status", "#v": "version", "#h": "history", "#email": "email", "#name": "name" },
          ExpressionAttributeValues: { ":old": record.status, ":version": record.version, ":next": record.version + 1,
            ":pending": "PENDING_APPROVAL", ":verified": true, ":username": directory.username, ":now": now, ":empty": [],
            ":email": directory.email, ":name": directory.name || directory.email,
            ":audit": [{ action: record.status === "AWAITING_EMAIL" ? "EMAIL_VERIFIED" : "VERIFIED_EMAIL_CHANGED", at: now,
              ...(record.email !== directory.email ? { previousEmail: record.email, email: directory.email } : {}) }] }
        }));
      }
      return { success: true, mensaje: "Confirmación procesada. El acceso requiere aprobación administrativa." };
    },
    async resend(input) {
      requireRegistration(); inputObject(input, ["email"]);
      const email = emailOf(input.email);
      await send(new GetCommand({ TableName: table, Key: { pk: PK, sk: "CONFIG" }, ConsistentRead: true }));
      try { await identity.resendCode({ email }); }
      catch (error) {
        if (!["UserNotFoundException", "InvalidParameterException", "NotAuthorizedException"].includes(error.name))
          throw failure(503, "No se pudo procesar la solicitud; intenta más tarde.");
      }
      return generic();
    },
    async assertAccountAccess(user) {
      if (user?.isAdmin) { await assertAdmin(user); return user; }
      if (!user?.sub || !Array.isArray(user.roles) || !user.roles.some(role => C.roles.includes(role)))
        throw failure(403, "La cuenta no tiene acceso de negocio autorizado.");
      if (!table) return user; // Registration is unavailable; existing Cognito groups retain their legacy access.
      const record = await get(user.sub);
      if (record && (record.status !== "APPROVED" || user.roles.length !== 1 || user.roles[0] !== record.role))
        throw failure(403, "La solicitud de acceso todavía no está aprobada para esta sesión.");
      return user;
    },
    async listPending(user, { limit = 20, cursor, status = "PENDING_APPROVAL" } = {}) {
      requireTable(); await assertAdmin(user);
      limit = Number(limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw failure(400, "limit debe estar entre 1 y 100.");
      const states = status === "PENDING_APPROVAL" ? ["PENDING_APPROVAL", "APPLYING"] : [status];
      if (!states.every(value => ["PENDING_APPROVAL", "APPLYING", "APPROVED", "REJECTED"].includes(value)))
        throw failure(400, "Estado de acceso inválido.");
      let start = decode(cursor); const records = [];
      for (let page = 0; page < 5 && records.length < limit; page++) {
        const response = await send(new QueryCommand({ TableName: table, KeyConditionExpression: "#pk = :pk",
          FilterExpression: "#s IN (" + states.map((_,index) => ":s"+index).join(",") + ")",
          ExpressionAttributeNames: { "#pk": "pk", "#s": "status" },
          ExpressionAttributeValues: { ":pk": PK, ...Object.fromEntries(states.map((value,index) => [":s"+index,value])) },
          Limit: limit - records.length, ExclusiveStartKey: start, ConsistentRead: true
        }));
        records.push(...(response.Items || []).filter(item => item.pk === PK && item.sk?.startsWith("USER#") &&
          states.includes(item.status)));
        start = response.LastEvaluatedKey; if (!start) break;
      }
      return { solicitudes: records, total: records.length, alcanceTotal: "pagina", siguienteCursor: encode(start), hayMasRegistros: Boolean(start) };
    },
    async decide(user, sub, input) {
      requireTable(); await assertAdmin(user); keyOf(sub);
      inputObject(input, ["decision", "role", "version", "comments"]);
      const { decision, role, version } = input;
      if (!["APPROVED", "REJECTED"].includes(decision) || !Number.isSafeInteger(version) || version < 1)
        throw failure(400, "Decisión o versión inválida.");
      if (decision === "APPROVED" && !C.roles.includes(role)) throw failure(400, "Selecciona uno de los cuatro roles de negocio.");
      const comments = input.comments === undefined ? "" : input.comments;
      if (typeof comments !== "string" || comments.trim().length > 500 || (decision === "REJECTED" && !comments.trim()))
        throw failure(400, "Para rechazar se requiere un motivo de hasta 500 caracteres.");
      const note = comments.trim();
      let record = await get(sub);
      if (!record) throw failure(404, "Solicitud de acceso no encontrada.");
      if (user.sub === sub || String(record.email || "").trim().toLowerCase() === user.email)
        throw failure(403, "No puedes decidir tu propia solicitud de acceso.");
      if (["APPROVED", "REJECTED"].includes(record.status)) {
        if (record.status === decision && record.decidedBy === user.sub && record.comments === note &&
          (decision !== "APPROVED" || record.role === role) && [record.decisionVersion, record.lockVersion].includes(version))
          return { success: true, solicitud: record, reused: true };
        if (!(record.status === "APPROVED" && decision === "APPROVED" && record.role !== role && record.version === version))
          throw failure(409, "La solicitud de acceso ya fue decidida o la versión cambió.");
      }
      const now = new Date(clock()).toISOString();
      const names = { "#s": "status", "#v": "version", "#h": "history" };
      if (decision === "REJECTED") {
        if (record.status !== "PENDING_APPROVAL" || record.version !== version) throw failure(409, "La solicitud cambió; vuelve a consultarla.");
        const result = await send(new UpdateCommand({ TableName: table, Key: keyOf(sub),
          ConditionExpression: "#s = :pending AND #v = :version",
          UpdateExpression: "SET #s = :rejected, #v = :next, decidedBy = :admin, comments = :comments, decisionVersion = :version, updatedAt = :now, #h = list_append(if_not_exists(#h, :empty), :audit)",
          ExpressionAttributeNames: names, ExpressionAttributeValues: { ":pending": "PENDING_APPROVAL", ":version": version,
            ":rejected": "REJECTED", ":next": version + 1, ":admin": user.sub, ":comments": note, ":now": now, ":empty": [],
            ":audit": [{ action: "ACCESS_REJECTED", by: user.sub, at: now, comments: note }] }, ReturnValues: "ALL_NEW"
        }));
        return { success: true, solicitud: result.Attributes };
      }
      if (record.status === "APPLYING") {
        const existing = record.operation;
        if (!existing || existing.adminSub !== user.sub || existing.role !== role || existing.comments !== note ||
          ![existing.requestVersion, record.version].includes(version))
          throw failure(409, "Hay una aprobación diferente o una versión nueva en curso.");
        if (existing.worker && existing.leaseUntil > clock())
          throw failure(409, "La aprobación sigue en curso. No se iniciaron cambios adicionales.");
      }
      // Review data must still identify the same confirmed account. A pending
      // email change is refreshed by confirm(), increments version and requires
      // the administrator to review it again before any group mutation.
      let directory;
      try { directory = await identity.getDirectoryUser(record.username || sub); }
      catch { throw failure(503, "No se pudo verificar la cuenta que se va a aprobar."); }
      if (!confirmed(directory) || directory.isAdmin || directory.sub !== sub || directory.email !== record.email)
        throw failure(409, "La identidad o el correo verificado cambió; revisa nuevamente la solicitud.");
      let worker;
      if (["PENDING_APPROVAL", "APPROVED"].includes(record.status) && record.version === version) {
        worker = uuid();
        const op = { id: uuid(), adminSub: user.sub, role, comments: note, requestVersion: version,
          worker, leaseUntil: clock() + workerLeaseMs };
        const result = await send(new UpdateCommand({ TableName: table, Key: keyOf(sub),
          ConditionExpression: "#s = :pending AND #v = :version",
          UpdateExpression: "SET #s = :applying, #v = :next, #op = :operation, updatedAt = :now, #h = list_append(if_not_exists(#h, :empty), :audit)",
          ExpressionAttributeNames: { ...names, "#op": "operation" },
          ExpressionAttributeValues: { ":pending": record.status, ":version": version, ":applying": "APPLYING", ":next": version + 1,
            ":operation": op, ":now": now, ":empty": [], ":audit": [{ action: "APPROVAL_STARTED", by: user.sub, role, at: now }] }, ReturnValues: "ALL_NEW"
        }));
        record = result.Attributes;
      }
      let op = record.operation;
      if (record.status !== "APPLYING" || !op || op.adminSub !== user.sub || op.role !== role || op.comments !== note ||
        ![op.requestVersion, record.version].includes(version)) throw failure(409, "Hay una aprobación diferente o una versión nueva en curso.");
      if (!worker) {
        worker = uuid();
        const acquired = await send(new UpdateCommand({ TableName: table, Key: keyOf(sub),
          ConditionExpression: "#s = :applying AND #v = :version AND #op.id = :operation AND #op.adminSub = :admin AND (attribute_not_exists(#op.#worker) OR #op.#lease <= :clock)",
          UpdateExpression: "SET #op.#worker = :worker, #op.#lease = :lease, updatedAt = :now",
          ExpressionAttributeNames: { "#s": "status", "#v": "version", "#op": "operation", "#worker": "worker", "#lease": "leaseUntil" },
          ExpressionAttributeValues: { ":applying": "APPLYING", ":version": record.version, ":operation": op.id, ":admin": user.sub,
            ":clock": clock(), ":worker": worker, ":lease": clock() + workerLeaseMs, ":now": now }, ReturnValues: "ALL_NEW"
        }));
        record = acquired.Attributes; op = record.operation;
      }
      try { await identity.assignBusinessRole(record.username || sub, role, sub, record.email); }
      catch {
        // An explicit assignment failure has returned to this worker. Release
        // only its lease so the same frozen operation can be retried. A crash
        // or ambiguous final ledger failure instead leaves the lease to expire.
        try {
          await send(new UpdateCommand({ TableName: table, Key: keyOf(sub),
            ConditionExpression: "#s = :applying AND #v = :version AND #op.id = :operation AND #op.#worker = :worker",
            UpdateExpression: "REMOVE #op.#worker, #op.#lease",
            ExpressionAttributeNames: { "#s": "status", "#v": "version", "#op": "operation", "#worker": "worker", "#lease": "leaseUntil" },
            ExpressionAttributeValues: { ":applying": "APPLYING", ":version": record.version, ":operation": op.id, ":worker": worker }
          }));
        } catch { /* Retaining a lease is fail-closed; recovery waits for expiry. */ }
        throw failure(503, "La asignación no terminó. La solicitud sigue bloqueada y puede reintentarse con la misma decisión.");
      }
      try {
        const final = await send(new UpdateCommand({ TableName: table, Key: keyOf(sub),
          ConditionExpression: "#s = :applying AND #v = :version AND #op.id = :operation AND #op.adminSub = :admin AND #op.#worker = :worker",
          UpdateExpression: "SET #s = :approved, #v = :next, #r = :role, decidedBy = :admin, comments = :comments, decisionVersion = :requested, lockVersion = :version, lastOperationId = :operation, updatedAt = :now, #h = list_append(if_not_exists(#h, :empty), :audit) REMOVE #op",
          ExpressionAttributeNames: { ...names, "#op": "operation", "#r": "role", "#worker": "worker" },
          ExpressionAttributeValues: { ":applying": "APPLYING", ":version": record.version, ":operation": op.id, ":admin": user.sub,
            ":worker": worker, ":approved": "APPROVED", ":next": record.version + 1, ":role": role, ":comments": note,
            ":requested": op.requestVersion, ":now": new Date(clock()).toISOString(), ":empty": [],
            ":audit": [{ action: "ACCESS_APPROVED", by: user.sub, role, at: new Date(clock()).toISOString(), comments: note }] }, ReturnValues: "ALL_NEW"
        }));
        return { success: true, solicitud: final.Attributes };
      } catch (error) {
        if (![409, 503].includes(error.status)) throw error;
        let completed;
        try { completed = await get(sub); } catch { throw error; }
        if (completed?.status === "APPROVED" && completed.lastOperationId === op.id && completed.decidedBy === user.sub &&
            completed.role === role && completed.comments === note && completed.decisionVersion === op.requestVersion &&
            completed.lockVersion === record.version)
          return { success: true, solicitud: completed, reused: true };
        throw error;
      }
    }
  };
}
module.exports = { createAccessService };

},
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
  businessTable: process.env.BUSINESS_TABLE,
  registrationEnabled: process.env.REGISTRATION_ENABLED === "true",
  adminGroup: process.env.ADMIN_GROUP || "Administrador",
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
const identity=createIdentity(config);
const business=config.businessTable ? require("./business-store").createBusinessStore(config) : null;
const access=config.businessTable ? require("./access-service").createAccessService(config,{identity}) : null;
const app = createApp({
  store: { ...createStore(config), rateLimit: createMemoryLimiter() },
  workflow: createWorkflow(config), identity,business,access,config,
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
  ...load("./workflow"),...load("./rate-limit"),...load("./access-service"),
  createBusinessStore:load("./business-store").createBusinessStore,
  businessStore:load("./business-store"),contracts:load("./contracts.cjs")
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
