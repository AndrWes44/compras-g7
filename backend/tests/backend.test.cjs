// Prueba contratos, rutas y persistencia con dependencias simuladas.
"use strict";
const nativeRequire=require;
const server=nativeRequire("../src/server.js");
const i=server.internals;
if(!i) throw Error("No se pudieron cargar los módulos internos del backend.");
const dependencies={
  "../backend/src/app":{createApp:i.createApp},
  "../backend/src/contracts.cjs":i.contracts,
  "../backend/src/identity":{createIdentity:i.createIdentity},
  "../backend/src/repository":{createStore:i.createStore,cursorEncode:i.cursorEncode,cursorDecode:i.cursorDecode},
  "../backend/src/workflow":{createWorkflow:i.createWorkflow},
  "../backend/src/rate-limit":{createMemoryLimiter:i.createMemoryLimiter}
};
const testModules={
// Comprueba las rutas y los permisos principales de la API.
'./backend.test.cjs': function(module,exports,require){
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const payload = (amount = 25) => ({
  description: "Compra de prueba",
  department: "TI",
  proveedorId: "PRV-test",
  amount,
  articulos: [{ nombre: "Artículo", cantidad: 1, precioUnitario: amount }],
});
const key = { "Idempotency-Key": "test-key-000000001" };
async function scenario(fn) {
  const h = await harness();
  try {
    await fn(h);
  } finally {
    await h.close();
  }
}
test("health y autenticación obligatoria", () =>
  scenario(async (h) => {
    assert.equal((await h.request("GET", "/health")).status, 200);
    assert.equal((await h.request("GET", "/api/auth/me")).status, 401);
    assert.equal(
      (await h.request("GET", "/api/auth/me", "Solicitante")).data.usuario.sub,
      "test-Solicitante",
    );
  }));
for (const role of ["Gerente", "Director", "Compras"])
  test(`${role} no crea solicitudes`, () =>
    scenario(async (h) =>
      assert.equal(
        (await h.request("POST", "/api/solicitudes", role, payload(), key))
          .status,
        403,
      ),
    ));
test("creación, confirmación y reintento idempotente", () =>
  scenario(async (h) => {
    const a = await h.request(
        "POST",
        "/api/solicitudes",
        "Solicitante",
        payload(),
        key,
      ),
      b = await h.request(
        "POST",
        "/api/solicitudes",
        "Solicitante",
        payload(),
        key,
      );
    assert.equal(a.status, 202);
    assert.equal(b.data.requestId, a.data.requestId);
    assert.equal(h.state.requests.size, 1);
    assert.equal(h.state.executions.size, 1);
    assert.equal(
      (
        await h.request(
          "GET",
          `/api/solicitudes/${a.data.requestId}/registro`,
          "Solicitante",
        )
      ).data.estado,
      "PERSISTED",
    );
    assert.equal(
      (
        await h.request(
          "POST",
          "/api/solicitudes",
          "Solicitante",
          payload(30),
          key,
        )
      ).status,
      409,
    );
  }));
for (const change of [
  { amount: 26 },
  { articulos: [] },
  { description: " " },
  { articulos: [{ nombre: "x", cantidad: 1.5, precioUnitario: 25 }] },
])
  test("rechaza payload inválido " + JSON.stringify(change), () =>
    scenario(async (h) => {
      assert.equal(
        (
          await h.request(
            "POST",
            "/api/solicitudes",
            "Solicitante",
            { ...payload(), ...change },
            key,
          )
        ).status,
        400,
      );
      assert.equal(h.state.executions.size, 0);
    }),
  );
for (const amount of [1000, 1000.01])
  for (const role of ["Solicitante", "Gerente", "Director", "Compras"])
    test(`dictamen ${role} USD ${amount}`, () =>
      scenario(async (h) => {
        h.state.requests.set("REQ-test", {
          ...payload(amount),
          requestId: "REQ-test",
          status: "PENDING",
          applicant: "other@example.invalid",
          applicantSub: "other",
          requiereAprobacionDe: amount <= 1000 ? "Gerente" : "Director",
        });
        const r = await h.request(
          "PATCH",
          "/api/solicitudes/REQ-test/decision",
          role,
          { decision: "APPROVED", comentarios: "Aprobación validada" },
        );
        assert.equal(
          r.status,
          role === (amount <= 1000 ? "Gerente" : "Director")
            ? 200
            : role === "Gerente" || role === "Director"
              ? 404
              : 403,
        );
      }));
test("comentarios obligatorios; fallo no altera estado; doble decisión conflicto", () =>
  scenario(async (h) => {
    h.state.requests.set("REQ-test", {
      ...payload(),
      requestId: "REQ-test",
      status: "PENDING",
      applicant: "other@example.invalid",
      requiereAprobacionDe: "Gerente",
    });
    assert.equal(
      (
        await h.request(
          "PATCH",
          "/api/solicitudes/REQ-test/decision",
          "Gerente",
          { decision: "REJECTED", comments: 25 },
        )
      ).status,
      400,
    );
    h.state.failDecision = true;
    assert.equal(
      (
        await h.request(
          "PATCH",
          "/api/solicitudes/REQ-test/decision",
          "Gerente",
          { decision: "REJECTED", comentarios: "Motivo" },
        )
      ).status,
      500,
    );
    assert.equal(h.state.requests.get("REQ-test").status, "PENDING");
    h.state.failDecision = false;
    const results = await Promise.all(
      [1, 2].map(() =>
        h.request("PATCH", "/api/solicitudes/REQ-test/decision", "Gerente", {
          decision: "REJECTED",
          comentarios: "Motivo",
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  }));
test("no decidir compra propia y no leer ajena", () =>
  scenario(async (h) => {
    const own = {
      ...payload(),
      requestId: "REQ-own",
      status: "PENDING",
      applicant: h.state.users.Gerente.email,
      applicantSub: h.state.users.Gerente.sub,
      requiereAprobacionDe: "Gerente",
    };
    h.state.requests.set(own.requestId, own);
    assert.equal(
      (
        await h.request(
          "PATCH",
          "/api/solicitudes/REQ-own/decision",
          "Gerente",
          { decision: "APPROVED", comentarios: "Aprobación validada" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await h.request("GET", "/api/solicitudes/REQ-own", "Solicitante"))
        .status,
      404,
    );
  }));
test("registro RUNNING/FAILED y propiedad", () =>
  scenario(async (h) => {
    h.state.delayRegistration = true;
    const r = await h.request(
        "POST",
        "/api/solicitudes",
        "Solicitante",
        payload(),
        key,
      ),
      path = "/api/solicitudes/" + r.data.requestId + "/registro";
    assert.equal(
      (await h.request("GET", path, "Solicitante")).data.estado,
      "REGISTERING",
    );
    assert.equal((await h.request("GET", path, "Compras")).status, 404);
    h.state.executions.get(r.data.requestId).status = "FAILED";
    assert.equal(
      (await h.request("GET", path, "Solicitante")).data.estado,
      "FAILED",
    );
    assert.equal(
      (
        await h.request(
          "POST",
          "/api/solicitudes",
          "Solicitante",
          payload(),
          key,
        )
      ).status,
      409,
    );
  }));
test("CORS, cabeceras, JSON y rutas", () =>
  scenario(async (h) => {
    assert.equal(
      (
        await h.request("OPTIONS", "/health", null, undefined, {
          Origin: "https://evil.invalid",
        })
      ).status,
      403,
    );
    const r = await h.request("OPTIONS", "/health", null, undefined, {
      Origin: "http://127.0.0.1:4311",
    });
    assert.equal(r.status, 204);
    assert.match(
      r.headers.get("Access-Control-Allow-Headers"),
      /Idempotency-Key/,
    );
    assert.equal(
      (await h.request("GET", "/health")).headers.get("X-Content-Type-Options"),
      "nosniff",
    );
    assert.equal(
      (await h.request("GET", "/api/missing", "Gerente")).status,
      404,
    );
  }));
test("respuesta 429 con Retry-After en API; contador de prueba explícito", () =>
  scenario(async (h) => {
    for (let i = 0; i < 20; i++)
      await h.request("POST", "/api/auth/login", null, {
        email: "x@example.invalid",
        password: "bad",
      });
    const r = await h.request("POST", "/api/auth/login", null, {
      email: "x@example.invalid",
      password: "bad",
    });
    assert.equal(r.status, 429);
    assert.ok(r.headers.get("Retry-After"));
  }));

},
// Comprueba los formatos de datos aceptados por los clientes.
'./compatibility.test.cjs': function(module,exports,require){
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const { createMemoryLimiter } = require("../backend/src/rate-limit");
const payload = {
  descripcion: "Compra compatible",
  departamento: "TI",
  monto: 25,
  proveedorId: "PRV-001",
  articulos: [{ nombre: "Equipo", cantidad: 1, precioUnitario: 25 }],
};
async function scenario(fn) {
  const h = await harness();
  try {
    await fn(h);
  } finally {
    await h.close();
  }
}
test("frontend actual puede enviar sin Idempotency-Key; no se promete deduplicación", () =>
  scenario(async (h) => {
    const a = await h.request(
      "POST",
      "/api/solicitudes",
      "Solicitante",
      payload,
    );
    const b = await h.request(
      "POST",
      "/api/solicitudes",
      "Solicitante",
      payload,
    );
    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    assert.notEqual(a.data.requestId, b.data.requestId);
  }));
test("key presente inválida no se sustituye silenciosamente", () =>
  scenario(async (h) => {
    const r = await h.request(
      "POST",
      "/api/solicitudes",
      "Solicitante",
      payload,
      { "Idempotency-Key": "short" },
    );
    assert.equal(r.status, 400);
  }));
test("login conserva el role utilizado por el frontend actual", () =>
  scenario(async (h) => {
    for (const role of ["Solicitante", "Gerente", "Director", "Compras"]) {
      const r = await h.request("POST", "/api/auth/login", null, {
        email: role.toLowerCase() + "@example.invalid",
        password: "local-test-value",
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.user.role, role.toLowerCase());
      assert.equal(r.data.user.roles[0], role);
      assert.equal(r.data.user.sub, "test-" + role);
    }
  }));
test("comentario y comments del frontend se traducen a comentarios", () =>
  scenario(async (h) => {
    for (const alias of ["comentario", "comments", "comentarios"]) {
      const id = "REQ-" + alias;
      h.state.requests.set(id, {
        requestId: id,
        amount: 25,
        status: "PENDING",
        applicant: "other@example.invalid",
        requiereAprobacionDe: "Gerente",
      });
      const r = await h.request(
        "PATCH",
        "/api/solicitudes/" + id + "/decision",
        "Gerente",
        { decision: "REJECTED", [alias]: "Motivo válido" },
      );
      assert.equal(r.status, 200);
      assert.equal(r.data.solicitud.comments, "Motivo válido");
    }
  }));
test("comentarios distintos en aliases se rechazan", () =>
  scenario(async (h) => {
    const r = await h.request(
      "PATCH",
      "/api/solicitudes/REQ-test/decision",
      "Gerente",
      { decision: "REJECTED", comentarios: "Uno", comments: "Otro" },
    );
    assert.equal(r.status, 400);
  }));
test("proveedores sin BUSINESS_TABLE falla cerrado y solicitudes existentes siguen compatibles", () =>
  scenario(async (h) => {
    assert.equal(
      (await h.request("GET", "/api/proveedores", "Compras")).status,
      503,
    );
    assert.equal(
      (await h.request("POST", "/api/solicitudes", "Solicitante", payload))
        .status,
      202,
    );
  }));
test("contador local vence y falla cerrado ante exceso de claves", async () => {
  let clock = 0;
  const rate = createMemoryLimiter({ now: () => clock, maxEntries: 2 });
  assert.equal(await rate("a", 60), 1);
  assert.equal(await rate("a", 60), 2);
  assert.equal(await rate("b", 60), 1);
  await assert.rejects(rate("c", 60), { status: 503 });
  clock = 61000;
  assert.equal(await rate("c", 60), 1);
  assert.equal(await rate("a", 60), 1);
});

},
// Comprueba las reglas de validación del contrato.
'./contracts.test.cjs': function(module,exports,require){
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../backend/src/contracts.cjs");
for (const v of [
  0,
  -1,
  NaN,
  Infinity,
  true,
  {},
  "1.001",
  "1e3",
  "00.10",
  10000000.01,
])
  test("dinero inválido " + String(v), () => assert.throws(() => C.cents(v)));
for (const [v, c] of [
  [0.01, 1],
  ["1000", 100000],
  ["1000.01", 100001],
  [0.29, 29],
])
  test("centavos exactos " + v, () => assert.equal(C.cents(v), c));
test("regla exacta de monto y artículos", () => {
  const p = (n) =>
    C.request({
      description: "x",
      department: "TI",
      proveedorId: "PRV-x",
      amount: n,
      articulos: [{ nombre: "i", cantidad: 1, precioUnitario: n }],
    });
  assert.equal(p(1000).requiereAprobacionDe, "Gerente");
  assert.equal(p(1000.01).requiereAprobacionDe, "Director");
  assert.throws(() =>
    C.request({
      description: "x",
      department: "TI",
      proveedorId: "PRV-x",
      amount: 1,
      articulos: Array(51).fill({
        nombre: "i",
        cantidad: 1,
        precioUnitario: 1,
      }),
    }),
  );
});

},
// Prueba la autenticación con un cliente simulado.
'./identity.test.cjs': function(module,exports,require){
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { generateKeyPairSync, sign } = require("node:crypto");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const { createIdentity } = require("../backend/src/identity");
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
function setup() {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: "us-east-2_TEST123",
    clientId: "test-client",
    tokenUse: "access",
  });
  verifier.cacheJwks({ keys: [jwk] });
  const state = { verified: "true", sub: "test-sub", error: null };
  const client = {
    async send(command) {
      if (state.error) throw state.error;
      return {
        UserAttributes: [
          { Name: "email", Value: "user@example.invalid" },
          { Name: "email_verified", Value: state.verified },
          { Name: "sub", Value: state.sub },
        ],
      };
    },
  };
  const identity = createIdentity(
    { region: "us-east-2", clientId: "test-client" },
    { client, verifier },
  );
  const token = (changes) => {
    const payload = {
      iss: "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TEST123",
      sub: "test-sub",
      client_id: "test-client",
      token_use: "access",
      exp: Math.floor(Date.now() / 1000) + 600,
      "cognito:groups": ["Solicitante"],
      ...changes,
    };
    const raw =
      Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString(
        "base64url",
      ) +
      "." +
      Buffer.from(JSON.stringify(payload)).toString("base64url");
    return (
      raw +
      "." +
      sign("RSA-SHA256", Buffer.from(raw), privateKey).toString("base64url")
    );
  };
  return { identity, state, token };
}
test("firma JWT real y atributos verificados", async () => {
  const f = setup();
  assert.equal((await f.identity.authenticate(f.token())).sub, "test-sub");
});
for (const changes of [
  { exp: 1 },
  { token_use: "id" },
  { client_id: "another" },
  { iss: "https://invalid.example" },
])
  test("rechaza claims JWT " + JSON.stringify(changes), async () => {
    const f = setup();
    await assert.rejects(f.identity.authenticate(f.token(changes)), {
      status: 401,
    });
  });
test("firma alterada, sesión simulada y usuario sin grupo", async () => {
  const f = setup();
  const parts = f.token().split(".");
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  parts[2] = signature.toString("base64url");
  await assert.rejects(f.identity.authenticate(parts.join(".")), {
    status: 401,
  });
  await assert.rejects(f.identity.authenticate("cognito-jwt-director-fake"), {
    status: 401,
  });
  await assert.rejects(
    f.identity.authenticate(f.token({ "cognito:groups": ["Admin"] })),
    { status: 403 },
  );
});
test("correo no verificado y sub inconsistente", async () => {
  const f = setup();
  f.state.verified = "false";
  await assert.rejects(f.identity.authenticate(f.token()), { status: 403 });
  f.state.verified = "true";
  f.state.sub = "other";
  await assert.rejects(f.identity.authenticate(f.token()), { status: 403 });
});
test("Cognito revocado no permite autenticar", async () => {
  const f = setup();
  f.state.error = Object.assign(new Error(), {
    name: "NotAuthorizedException",
  });
  await assert.rejects(f.identity.authenticate(f.token()), { status: 401 });
});

},
// Comprueba los controles de acceso y la protección de entradas.
'./security-regressions.test.cjs': function(module,exports,require){
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const C = require("../backend/src/contracts.cjs");
const { cursorDecode, cursorEncode } = require("../backend/src/repository");

test("correo histórico con espacios o mayúsculas nunca permite autoaprobación", async () => {
  const h = await harness();
  try {
    h.state.requests.set("REQ-own-legacy", {
      requestId: "REQ-own-legacy",
      amount: 250,
      status: "PENDING",
      applicant: "  GERENTE@EXAMPLE.INVALID  ",
      requiereAprobacionDe: "Gerente",
    });
    const result = await h.request(
      "PATCH",
      "/api/solicitudes/REQ-own-legacy/decision",
      "Gerente",
      { decision: "APPROVED", comentarios: "Aprobación validada" },
    );
    assert.equal(result.status, 403);
    assert.equal(h.state.requests.get("REQ-own-legacy").status, "PENDING");
  } finally {
    await h.close();
  }
});
test("solicitantes inválidos no habilitan dictamen ni provocan TypeError", () => {
  for (const applicant of [null, 42, {}, [], true, "", "  "]) {
    assert.equal(
      Boolean(
        C.canDecide(
          {
            status: "PENDING",
            amount: 25,
            applicant,
            requiereAprobacionDe: "Gerente",
          },
          {
            sub: "manager",
            email: "manager@example.invalid",
            roles: ["Gerente"],
          },
        ),
      ),
      false,
    );
  }
});
test("cursor sin clave primaria válida devuelve validación 400 antes de DynamoDB", () => {
  for (const key of [
    { applicant: "test@example.invalid" },
    { requestId: "" },
    { requestId: "bad/key" },
    { requestId: 42 },
    { requestId: "x".repeat(101) },
  ]) {
    assert.throws(
      () => cursorDecode(cursorEncode(key), ["requestId", "applicant"]),
      { status: 400 },
    );
  }
});

},
// Prueba consultas y escrituras de solicitudes.
'./storage.test.cjs': function(module,exports,require){
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  createStore,
  cursorEncode,
  cursorDecode,
} = require("../backend/src/repository");
const { createWorkflow } = require("../backend/src/workflow");
const config = {
  region: "us-east-2",
  requestsTable: "requests",
  suppliersTable: "suppliers",
  rateTable: "limits",
  stateMachineArn: "arn:aws:states:us-east-2:000000000000:stateMachine:test",
};
test("actualización de decisión usa condición e historial atómico", async () => {
  let command;
  const store = createStore(config, {
    client: {
      send: async (c) => {
        command = c;
        return { Attributes: { status: "APPROVED" } };
      },
    },
  });
  await store.decide(
    {
      requestId: "REQ-test",
      amount: 25,
      applicant: "other@example.invalid",
      applicantSub: "other",
    },
    { decision: "APPROVED", comentarios: "ok" },
    { email: "manager@example.invalid", sub: "manager" },
  );
  assert.match(command.input.ConditionExpression, /#s = :pending/);
  assert.match(command.input.ConditionExpression, /#a = :amount/);
  assert.match(command.input.ConditionExpression, /applicantSub = :owner/);
  assert.match(command.input.UpdateExpression, /list_append/);
  assert.equal(command.input.ExpressionAttributeValues[":owner"], "other");
});
test("Query con índice y filtro de propiedad defensivo", async () => {
  const commands = [];
  const store = createStore(
    { ...config, applicantIndex: "applicant-createdAt-index" },
    {
      client: {
        send: async (c) => {
          commands.push(c);
          return {
            Items: [
              {
                requestId: "x",
                amount: 25,
                applicant: "wrong@example.invalid",
                applicantSub: "other",
              },
            ],
          };
        },
      },
    },
  );
  const res = await store.listRequests(
    { sub: "owner", email: "owner@example.invalid", roles: ["Solicitante"] },
    { limit: 20 },
  );
  assert.equal(commands[0].constructor.name, "QueryCommand");
  assert.equal(commands[0].input.IndexName, "applicant-createdAt-index");
  assert.equal(res.solicitudes.length, 0);
});
test("paginación vacía conserva cursor y limita costo a cinco páginas", async () => {
  let count = 0;
  const store = createStore(config, {
    client: {
      send: async () => {
        count++;
        return { Items: [], LastEvaluatedKey: { requestId: "REQ-test" } };
      },
    },
  });
  const r = await store.listRequests(
    { sub: "x", email: "x@example.invalid", roles: ["Solicitante"] },
    { limit: 20 },
  );
  assert.equal(count, 5);
  assert.ok(r.hayMasRegistros);
  assert.equal(r.total, 0);
  assert.deepEqual(
    cursorDecode(cursorEncode({ requestId: "REQ-x" }), ["requestId"]),
    { requestId: "REQ-x" },
  );
  assert.throws(() =>
    cursorDecode(cursorEncode({ secret: "x" }), ["requestId"]),
  );
});
test("SFN reintento cerrado conserva input y detecta conflicto", async () => {
  const payload = { requestId: "REQ-test", amount: 25 };
  const client = {
    async send(c) {
      if (c.constructor.name === "StartExecutionCommand")
        throw Object.assign(new Error(), { name: "ExecutionAlreadyExists" });
      return { status: "SUCCEEDED", input: JSON.stringify(payload) };
    },
  };
  const flow = createWorkflow(config, { client });
  assert.equal((await flow.start(payload)).status, "SUCCEEDED");
  await assert.rejects(flow.start({ ...payload, amount: 30 }), { status: 409 });
});

},
// Prepara el servidor y los servicios simulados de las pruebas.
'./harness.cjs': function(module,exports,require){
"use strict";
const { createApp } = require("../backend/src/app");
const C = require("../backend/src/contracts.cjs");
function fixture() {
  const users = Object.fromEntries(
    C.roles.map((r) => [
      r,
      {
        sub: "test-" + r,
        email: r.toLowerCase() + "@example.invalid",
        name: r,
        roles: [r],
      },
    ]),
  );
  const suppliers = new Map([
      [
        "PRV-test",
        {
          proveedorId: "PRV-test",
          nombre: "Proveedor de pruebas",
          categoria: "Tecnología",
          contacto: "proveedor@example.invalid",
          telefono: "+503 2222-2222",
          estado: "Calificado",
          version: 1,
        },
      ],
    ]),
    requests = new Map(),
    executions = new Map(),
    limits = new Map();
  const state = {
    users,
    suppliers,
    requests,
    executions,
    limits,
    failWrite: false,
    failDecision: false,
    failStart: false,
    failLogin: false,
    delayRegistration: false,
  };
  const conflict = () =>
    Object.assign(new Error("Conditional check failed"), {
      name: "ConditionalCheckFailedException",
    });
  const store = {
    async rateLimit(key) {
      const n = (limits.get(key) || 0) + 1;
      limits.set(key, n);
      return n;
    },
    async getSupplier(id) {
      return structuredClone(suppliers.get(id));
    },
    async getRequest(id) {
      return structuredClone(requests.get(id));
    },
    async listSuppliers() {
      return { proveedores: [...suppliers.values()] };
    },
    async createSupplier(doc) {
      if (state.failWrite) throw new Error("storage");
      if (suppliers.has(doc.proveedorId)) throw conflict();
      suppliers.set(doc.proveedorId, structuredClone(doc));
    },
    async updateSupplier(id, data, version) {
      const p = suppliers.get(id);
      if (!p || p.version !== version) throw conflict();
      const next = { ...p, ...data, version: version + 1 };
      suppliers.set(id, next);
      return next;
    },
    async deactivateSupplier(id, v) {
      return this.updateSupplier(id, { estado: "Inactivo" }, v);
    },
    async listRequests(user) {
      return {
        solicitudes: [...requests.values()].filter((d) => C.canSee(d, user)),
        alcanceTotal: "pagina",
      };
    },
    async decide(doc, data, user) {
      if (state.failDecision) throw new Error("storage");
      const current = requests.get(doc.requestId);
      if (current?.status !== "PENDING") throw conflict();
      const next = {
        ...current,
        status: data.decision,
        comments: data.comentarios,
        decidedBy: user.email,
      };
      requests.set(doc.requestId, next);
      return next;
    },
  };
  const workflow = {
    async find(id) {
      return executions.get(id) || null;
    },
    async start(payload) {
      if (state.failStart) throw new Error("sfn");
      const input = JSON.stringify(payload),
        prev = executions.get(payload.requestId);
      if (prev && prev.input !== input)
        throw Object.assign(new Error("Idempotency conflict"), { status: 409 });
      executions.set(payload.requestId, {
        input,
        status: state.delayRegistration
          ? "RUNNING"
          : state.failWrite
            ? "FAILED"
            : "SUCCEEDED",
      });
      if (!state.failWrite && !state.delayRegistration)
        requests.set(payload.requestId, {
          ...payload,
          // Comprueba la compatibilidad por correo con registros antiguos sin applicantSub.
          applicantSub: undefined,
          status: "PENDING",
          createdAt: new Date().toISOString(),
        });
    },
  };
  const token = (role) =>
    "e30." +
    Buffer.from(
      JSON.stringify({
        sub: users[role].sub,
        token_use: "access",
        exp: Math.floor(Date.now() / 1000) + 3600,
        role,
      }),
    ).toString("base64url") +
    ".test-signature";
  const identity = {
    async authenticate(t) {
      let claims;
      try {
        claims = JSON.parse(Buffer.from(t.split(".")[1], "base64url"));
      } catch {}
      const role = claims?.role;
      if (
        !users[role] ||
        claims.sub !== users[role].sub ||
        claims.exp <= Date.now() / 1000 ||
        !t.endsWith(".test-signature")
      )
        throw Object.assign(new Error("Token inválido."), { status: 401 });
      return users[role];
    },
    async login(email, password) {
      const role = C.roles.find((r) => users[r].email === email);
      if (state.failLogin || !role || password !== "local-test-value")
        throw Object.assign(new Error("Correo o contraseña incorrectos."), {
          status: 401,
        });
      return {
        tokens: { accessToken: token(role), expiresIn: 3600 },
        user: users[role],
      };
    },
    async logout() {},
  };
  return { state, store, workflow, identity, token };
}
async function harness() {
  const f = fixture(),
    app = createApp({ ...f, config: { origins: "http://127.0.0.1:4311" } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  return {
    ...f,
    url,
    async request(method, path, role, body, extra = {}) {
      const headers = {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(role ? { Authorization: "Bearer " + f.token(role) } : {}),
        ...extra,
      };
      const response = await fetch(url + path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        headers: response.headers,
        data: await response.json().catch(() => null),
      };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
module.exports = { fixture, harness };

}
};
const cache=new Map();
function load(id){
  if(Object.prototype.hasOwnProperty.call(dependencies,id))return dependencies[id];
  if(!Object.prototype.hasOwnProperty.call(testModules,id))return nativeRequire(id);
  if(cache.has(id))return cache.get(id).exports;
  const module={exports:{}};cache.set(id,module);
  testModules[id](module,module.exports,load);return module.exports;
}
load('./backend.test.cjs');
load('./compatibility.test.cjs');
load('./contracts.test.cjs');
load('./identity.test.cjs');
load('./security-regressions.test.cjs');
load('./storage.test.cjs');

nativeRequire("node:test").test("Lambda existente responde health con el server de un solo archivo",async()=>{
  const assert=nativeRequire("node:assert/strict");
  const values={NODE_ENV:"test",AWS_REGION:"us-east-2",AWS_EC2_METADATA_DISABLED:"true",
    STATE_MACHINE_ARN:"arn:aws:states:us-east-2:000000000000:stateMachine:test",
    COGNITO_USER_POOL_ID:"us-east-2_TEST123",COGNITO_APP_CLIENT_ID:"test-client"};
  const previous={};for(const [key,value] of Object.entries(values)){previous[key]=process.env[key];process.env[key]=value;}
  try {
    const {handler}=nativeRequire("../src/lambda.js");
    const result=await handler({version:"2.0",routeKey:"$default",rawPath:"/health",rawQueryString:"",headers:{host:"localhost"},requestContext:{stage:"$default",requestId:"local-only",http:{method:"GET",path:"/health",sourceIp:"127.0.0.1",protocol:"HTTP/1.1"}},isBase64Encoded:false},{getRemainingTimeInMillis:()=>30000});
    assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).estado,"OK");
  } finally {for(const key of Object.keys(values)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
