// Comprueba el arranque y los fallos de registro de solicitudes.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { once } = require("node:events");
const net = require("node:net");
const C = require("../src/server.js").internals.contracts;
const { createWorkflow, createApp } = require("../src/server.js").internals;
const { createStore } = require("../src/server.js").internals;

test("dictamen rechaza importes persistidos con fracciones de centavo o fuera de rango", () => {
  for (const amount of [0.001, 25.001, 10000000.01]) {
    const role = amount <= 1000 ? "Gerente" : "Director";
    const doc = { status: "PENDING", amount, applicant: "owner@example.invalid", requiereAprobacionDe: role };
    const user = { sub: "reviewer", email: "reviewer@example.invalid", roles: [role] };
    assert.equal(Boolean(C.canDecide(doc, user)), false, String(amount));
  }
  for (const amount of [0.01, 1000, 1000.01, 10000000]) {
    const role = amount <= 1000 ? "Gerente" : "Director";
    assert.equal(Boolean(C.canDecide({ status: "PENDING", amount,
      applicant: "owner@example.invalid", requiereAprobacionDe: role },
      { sub: "reviewer", email: "reviewer@example.invalid", roles: [role] })), true);
  }
});

test("API no escribe decisiones de importes historicos invalidos", async () => {
  let writes = 0;
  const doc = { requestId: "REQ-old", status: "PENDING", amount: 25.001,
    applicant: "owner@example.invalid", requiereAprobacionDe: "Gerente" };
  const app = createApp({
    identity: { authenticate: async () => ({ sub: "reviewer", email: "reviewer@example.invalid", roles: ["Gerente"] }) },
    store: { rateLimit: async () => 1, getRequest: async () => doc,
      decide: async () => { writes++; return doc; } }, workflow: {}
  });
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/solicitudes/REQ-old/decision`, {
      method: "PATCH", headers: { Authorization: "Bearer local-test", "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "APPROVED", comentarios: "Aprobación validada" })
    });
    await response.json();
    assert.equal(response.status, 403);
    assert.equal(writes, 0);
  } finally { await new Promise(resolve => listener.close(resolve)); }
});

test("listado por Scan incluye identidad estable cuando cambia el correo", async () => {
  let input;
  const store = createStore({ region: "us-east-2", requestsTable: "test-requests" }, {
    client: { async send(command) {
      input = command.input;
      return { Items: [
        { requestId: "own", applicant: "old@example.invalid", applicantSub: "owner", amount: 1 },
        { requestId: "foreign", applicant: "new@example.invalid", applicantSub: "other", amount: 1 }
      ] };
    } }
  });
  const result = await store.listRequests({ sub: "owner", email: "new@example.invalid", roles: ["Solicitante"] }, { limit: 20 });
  assert.match(input.FilterExpression, /#owner = :owner/);
  assert.equal(input.ExpressionAttributeNames["#owner"], "applicantSub");
  assert.equal(input.ExpressionAttributeValues[":owner"], "owner");
  assert.deepEqual(result.solicitudes.map(s => s.requestId), ["own"]);
});

test("dictamen de registro antiguo protege ausencia de applicantSub contra cambios concurrentes", async () => {
  let input;
  const store = createStore({ region: "us-east-2", requestsTable: "test-requests" }, {
    client: { send: async command => { input = command.input; return { Attributes: {} }; } }
  });
  await store.decide({ requestId: "old", applicant: "owner@example.invalid", amount: 1 },
    { decision: "APPROVED", comentarios: "prueba local" }, { sub: "manager", email: "manager@example.invalid" });
  assert.match(input.ConditionExpression, /attribute_not_exists\(applicantSub\)/);
});

const validPurchase = () => ({ description: "Prueba local", department: "TI", proveedorId: "PRV-test",
  amount: 1, articulos: [{ nombre: "Articulo", cantidad: 1, precioUnitario: 1 }] });

test("importes duplicados contradictorios o invalidos no se ignoran", () => {
  for (const monto of [2500, null, false, "invalido"])
    assert.throws(() => C.request({ ...validPurchase(), monto }), { status: 400 });
  assert.equal(C.request({ ...validPurchase(), monto: "1.00" }).amount, 1);
  assert.equal(C.request({ ...validPurchase(), amount: undefined, monto: 1 }).amount, 1);
});

test("precios duplicados contradictorios o invalidos no se ignoran", () => {
  for (const precio of [2500, null, false, "invalido"])
    assert.throws(() => C.request({ ...validPurchase(), articulos: [
      { nombre: "Articulo", cantidad: 1, precioUnitario: 1, precio }
    ] }), { status: 400 });
  assert.equal(C.request({ ...validPurchase(), articulos: [
    { nombre: "Articulo", cantidad: 1, precioUnitario: 1, precio: "1.00" }
  ] }).amount, 1);
});

test("importe contradictorio devuelve 400 antes de iniciar Step Functions", async () => {
  let starts = 0;
  const app = createApp({
    identity: { authenticate: async () => ({ sub: "owner", email: "owner@example.invalid", roles: ["Solicitante"] }) },
    store: { rateLimit: async () => 1 },
    workflow: { start: async () => { starts++; } }
  });
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/solicitudes`, {
      method: "POST", headers: { Authorization: "Bearer local-test", "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPurchase(), monto: 2500 })
    });
    await response.json();
    assert.equal(response.status, 400);
    assert.equal(starts, 0);
  } finally { await new Promise(resolve => listener.close(resolve)); }
});

test("SUCCEEDED con salida FAILED bloquea el reintento como fallo de registro", async () => {
  const payload = { requestId: "REQ-test", amount: 1 };
  const flow = createWorkflow({ region: "us-east-2", stateMachineArn: "arn:aws:states:us-east-2:000000000000:stateMachine:test" }, {
    client: { async send(command) {
      if (command.constructor.name === "StartExecutionCommand")
        throw Object.assign(new Error(), { name: "ExecutionAlreadyExists" });
      return { status: "SUCCEEDED", input: JSON.stringify(payload), output: JSON.stringify({ status: "FAILED" }) };
    } }
  });
  const execution = await flow.find(payload.requestId);
  assert.equal(execution.status, "FAILED");
  assert.equal(execution.awsStatus, "SUCCEEDED");
  await assert.rejects(flow.start(payload), { status: 409 });
});

test("confirmacion sin registro devuelve FAILED cuando el flujo captura un error", async () => {
  const user = { sub: "owner", email: "owner@example.invalid", roles: ["Solicitante"] };
  const workflow = createWorkflow({ region: "us-east-2", stateMachineArn: "arn:aws:states:us-east-2:000000000000:stateMachine:test" }, {
    client: { send: async () => ({ status: "SUCCEEDED", input: JSON.stringify({ applicantSub: user.sub }), output: '{"status":"FAILED"}' }) }
  });
  const app = createApp({ workflow, identity: { authenticate: async () => user }, store: {
    rateLimit: async () => 1, getRequest: async () => undefined
  } });
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/solicitudes/REQ-test/registro`, {
      headers: { Authorization: "Bearer local-test" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: false, estado: "FAILED" });
  } finally { await new Promise(resolve => listener.close(resolve)); }
});

test("salida exitosa conserva SUCCEEDED y salida JSON invalida no se acepta", async () => {
  let output = '{"success":true}';
  const flow = createWorkflow({ region: "us-east-2", stateMachineArn: "arn:aws:states:us-east-2:000000000000:stateMachine:test" }, {
    client: { send: async () => ({ status: "SUCCEEDED", output }) }
  });
  assert.equal((await flow.find("REQ-test")).status, "SUCCEEDED");
  output = '{"success":false}';
  assert.equal((await flow.find("REQ-test")).status, "FAILED");
  output = "invalid-json";
  await assert.rejects(flow.find("REQ-test"), { status: 502 });
});

test("registro antiguo sin propietario ni campos canonicos no habilita aprobacion", () => {
  const doc = { requestId: "legacy", monto: 2500, estado: "PENDING" };
  for (const role of C.roles) {
    const user = { sub: "test-sub", email: "test@example.com", roles: [role] };
    assert.equal(Boolean(C.canDecide(doc, user)), false);
    assert.equal(C.canSee(doc, user), role === "Compras");
  }
  assert.equal(doc.amount, undefined);
  assert.equal(doc.applicant, undefined);
});

test("puerto ocupado informa EADDRINUSE y termina sin anunciar inicio", { timeout: 12000 }, async () => {
  const occupied = net.createServer();
  occupied.listen(0, "127.0.0.1");
  await once(occupied, "listening");
  let child;
  const timer = setTimeout(() => child?.kill(), 8000);
  try {
    child = spawn(process.execPath, [path.join(__dirname, "../src/server.js")], {
      cwd: path.join(__dirname, ".."),
      windowsHide: true,
      env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1",
        PORT: String(occupied.address().port), AWS_REGION: "us-east-2",
        AWS_EC2_METADATA_DISABLED: "true",
        STATE_MACHINE_ARN: "arn:aws:states:us-east-2:000000000000:stateMachine:test",
        COGNITO_USER_POOL_ID: "us-east-2_TEST123", COGNITO_APP_CLIENT_ID: "test-client" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "", err = "";
    child.stdout.on("data", data => { out += data; });
    child.stderr.on("data", data => { err += data; });
    const [code] = await once(child, "close");
    assert.equal(code, 1);
    assert.match(err, /EADDRINUSE/);
    assert.doesNotMatch(out, /Backend AURA iniciado/);
  } finally {
    clearTimeout(timer);
    child?.kill();
    await new Promise(resolve => occupied.close(resolve));
  }
});
