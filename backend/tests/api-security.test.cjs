"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../src/server.js").internals;
const user = { sub: "test-owner", email: "owner@example.invalid", roles: ["Solicitante"] };

async function localApi(overrides, run) {
  const app = createApp({
    store: { rateLimit: async () => 1, ...overrides.store },
    identity: { authenticate: async () => user, ...overrides.identity },
    workflow: overrides.workflow || {},
    config: { origins: "http://localhost:3001", ...overrides.config }
  });
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const base = `http://127.0.0.1:${listener.address().port}`;
  try { await run(base); }
  finally { await new Promise(resolve => listener.close(resolve)); }
}

test("origen S3 exacto permite preflight y conserva autenticacion obligatoria", async () => {
  const origin = "http://g7-dev-frontend-aura-021686096746.s3-website.us-east-2.amazonaws.com";
  await localApi({ config: { origins: origin } }, async base => {
    const preflight = await fetch(base + "/api/solicitudes", { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
    assert.doesNotMatch(preflight.headers.get("Access-Control-Allow-Methods"), /PUT/);
    assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /DELETE/);
    const protectedResponse = await fetch(base + "/api/solicitudes", { headers: { Origin: origin } });
    assert.equal(protectedResponse.status, 401);
    await protectedResponse.json();
  });
});

test("asterisco literal en configuracion no habilita origen ajeno ni parecido al S3", async () => {
  const origin = "http://g7-dev-frontend-aura-021686096746.s3-website.us-east-2.amazonaws.com";
  await localApi({ config: { origins: origin + ",*" } }, async base => {
    for (const untrusted of ["https://untrusted.example", origin + ".untrusted.example", "null"]) {
      const response = await fetch(base + "/health", { headers: { Origin: untrusted } });
      assert.equal(response.status, 403);
      await response.json();
    }
  });
});

test("exceso por IP se rechaza antes de verificar JWT o consultar Cognito", async () => {
  let authentications = 0;
  await localApi({
    store: { rateLimit: async key => key.startsWith("api-ip:") ? 301 : 1 },
    identity: { authenticate: async () => { authentications++; throw Object.assign(new Error("invalid"), { status: 401 }); } }
  }, async base => {
    const response = await fetch(base + "/api/solicitudes", { headers: { Authorization: "Bearer invalid" } });
    await response.json();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.equal(authentications, 0);
  });
});

test("X-Forwarded-For no cambia el contador de IP en el servidor local", async () => {
  const keys = [];
  await localApi({ store: { rateLimit: async key => { keys.push(key); return 1; } } }, async base => {
    for (const ip of ["192.0.2.1", "192.0.2.2"]) {
      const response = await fetch(base + "/api/auth/me", { headers: { Authorization: "Bearer local", "X-Forwarded-For": ip } });
      assert.equal(response.status, 200);
      await response.json();
    }
    const ips = keys.filter(key => key.startsWith("api-ip:"));
    assert.equal(ips.length, 2);
    assert.equal(ips[0], ips[1]);
  });
});

test("health y preflight permitido no consumen verificacion de identidad", async () => {
  let calls = 0;
  await localApi({
    store: { rateLimit: async () => { calls++; throw new Error("should not run"); } },
    identity: { authenticate: async () => { calls++; throw new Error("should not run"); } }
  }, async base => {
    const health = await fetch(base + "/health");
    assert.equal(health.status, 200); await health.json();
    const preflight = await fetch(base + "/api/solicitudes", { method: "OPTIONS", headers: { Origin: "http://localhost:3001" } });
    assert.equal(preflight.status, 204);
    assert.equal(calls, 0);
  });
});

test("JSON invalido y cuerpos grandes se rechazan sin autenticar ni guardar", async () => {
  let calls = 0;
  await localApi({ identity: { authenticate: async () => { calls++; return user; } } }, async base => {
    for (const [route, body, status] of [
      ["/api/auth/login", '{"password":"sensitive-marker",', 400],
      ["/api/auth/login", JSON.stringify({ email: "x@example.invalid", password: "x".repeat(17000) }), 413],
      ["/api/solicitudes", JSON.stringify({ description: "x".repeat(103000) }), 413]
    ]) {
      const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local" }, body });
      assert.equal(response.status, status);
      const content = await response.text();
      assert.doesNotMatch(content, /sensitive-marker|SyntaxError|stack/);
    }
    assert.equal(calls, 0);
  });
});

test("respuestas de sesion llevan no-store y un identificador de solicitud distinto", async () => {
  await localApi({}, async base => {
    const ids = [];
    for (let n = 0; n < 2; n++) {
      const response = await fetch(base + "/api/auth/me", { headers: { Authorization: "Bearer local" } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.equal(response.headers.get("X-Powered-By"), null);
      ids.push(response.headers.get("X-Request-Id"));
      await response.json();
    }
    assert.ok(ids.every(Boolean)); assert.notEqual(ids[0], ids[1]);
  });
});

test("errores de almacenamiento no exponen mensajes internos ni stack", async () => {
  await localApi({ store: { listRequests: async () => { throw new Error("internal-sensitive-marker"); } } }, async base => {
    const response = await fetch(base + "/api/solicitudes", { headers: { Authorization: "Bearer local" } });
    assert.equal(response.status, 500);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.equal(result.requestId, response.headers.get("X-Request-Id"));
    assert.doesNotMatch(JSON.stringify(result), /internal-sensitive-marker|stack/);
  });
});

test("creacion no acepta propietario, aprobador ni estado enviados por el cliente", async () => {
  let payload;
  await localApi({ workflow: { start: async value => { payload = value; } } }, async base => {
    const response = await fetch(base + "/api/solicitudes", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local" },
      body: JSON.stringify({ description: "Prueba local", department: "TI", proveedorId: "PRV-test", amount: 1, monto: 1,
        articulos: [{ nombre: "Articulo", cantidad: 1, precioUnitario: 1 }],
        applicant: "attacker@example.invalid", applicantSub: "attacker", status: "APPROVED", decidedBy: "director", requiereAprobacionDe: "Compras" })
    });
    assert.equal(response.status, 202); await response.json();
    assert.equal(payload.applicant, user.email);
    assert.equal(payload.applicantSub, user.sub);
    assert.equal(payload.requiereAprobacionDe, "Gerente");
    assert.equal(payload.status, undefined); assert.equal(payload.decidedBy, undefined);
  });
});

test("logout llama revocacion con el token autenticado y propaga indisponibilidad", async () => {
  let revoked, fail = false;
  await localApi({ identity: { logout: async token => { revoked = token; if (fail) throw Object.assign(new Error("private"), { status: 503 }); } } }, async base => {
    const options = { method: "POST", headers: { Authorization: "Bearer local-logout" } };
    const success = await fetch(base + "/api/auth/logout", options);
    assert.equal(success.status, 200); assert.equal((await success.json()).success, true);
    assert.equal(revoked, "local-logout");
    fail = true;
    const failure = await fetch(base + "/api/auth/logout", options);
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /private/);
  });
});

test("adaptador Lambda protege la API y usa contexto API Gateway sin llamadas AWS", async () => {
  const values = { NODE_ENV: "test", AWS_REGION: "us-east-2", AWS_EC2_METADATA_DISABLED: "true",
    AWS_LAMBDA_FUNCTION_NAME: "local-test-only",
    STATE_MACHINE_ARN: "arn:aws:states:us-east-2:000000000000:stateMachine:test",
    COGNITO_USER_POOL_ID: "us-east-2_TEST123", COGNITO_APP_CLIENT_ID: "test-client" };
  const previous = {};
  for (const [key, value] of Object.entries(values)) { previous[key] = process.env[key]; process.env[key] = value; }
  try {
    const { handler } = require("../src/lambda.js");
    const result = await handler({ version: "2.0", routeKey: "$default", rawPath: "/api/solicitudes", rawQueryString: "",
      headers: { host: "localhost", "x-forwarded-for": "192.0.2.99" },
      requestContext: { stage: "$default", requestId: "local-only", http: {
        method: "GET", path: "/api/solicitudes", sourceIp: "192.0.2.1", protocol: "HTTP/1.1" } }, isBase64Encoded: false
    }, { getRemainingTimeInMillis: () => 30000 });
    assert.equal(result.statusCode, 401);
    assert.equal(JSON.parse(result.body).success, false);
    assert.match(JSON.parse(result.body).mensaje, /Access Token/);
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
