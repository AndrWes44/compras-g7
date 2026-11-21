"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAccessService } = require("../src/server").internals;
const admin = { sub: "admin-sub", email: "admin@example.invalid", isAdmin: true, roles: [] };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(options = {}) {
  const rows = new Map(), commands = [], calls = [];
  const state = { unavailable: false, adminAllowed: true, failAssign: false, nowMs: Date.parse("2026-11-13T18:00:00Z"),
    directory: { sub: "new-sub", username: "cognito-user", email: "employee@example.invalid", status: "CONFIRMED", emailVerified: true, enabled: true, roles: [] } };
  const conditional = () => Object.assign(new Error("condition"), { name: "ConditionalCheckFailedException" });
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const client = { async send(command) {
    commands.push(command);
    if (state.unavailable) throw Object.assign(new Error("private-storage-details"), { name: "AccessDeniedException" });
    const input = command.input, key = input.Key?.sk, kind = command.constructor.name;
    if (kind === "GetCommand") return { Item: clone(rows.get(key)) };
    if (kind === "PutCommand") {
      if (rows.has(input.Item.sk)) throw conditional();
      rows.set(input.Item.sk, clone(input.Item)); return {};
    }
    if (kind === "QueryCommand") return state.query || { Items: clone([...rows.values()]) };
    if (kind === "UpdateCommand") {
      const row = rows.get(key), v = input.ExpressionAttributeValues;
      if (!row || row.version !== v[":version"]) throw conditional();
      if (v[":old"] && row.status !== v[":old"]) throw conditional();
      if (v[":rejected"] && row.status !== "PENDING_APPROVAL") throw conditional();
      if (v[":operation"] && typeof v[":operation"] === "object" && row.status !== v[":pending"]) throw conditional();
      const leaseAcquire = input.UpdateExpression.startsWith("SET #op.#worker");
      const leaseRelease = input.UpdateExpression.startsWith("REMOVE #op.#worker");
      if (leaseAcquire || leaseRelease || v[":approved"]) {
        if (row.status !== "APPLYING" || row.operation?.id !== v[":operation"]) throw conditional();
        if (v[":admin"] && row.operation.adminSub !== v[":admin"]) throw conditional();
        if (leaseAcquire && row.operation.worker && !(row.operation.leaseUntil <= v[":clock"])) throw conditional();
        if (!leaseAcquire && row.operation.worker !== v[":worker"]) throw conditional();
      }
      if (leaseRelease && state.beforeRelease) state.beforeRelease(row);
      if (leaseRelease && row.operation.worker !== v[":worker"]) throw conditional();
      if (v[":approved"] && state.failFinal === "before") {
        state.failFinal = undefined; throw new Error("private-write-failure");
      }
      const next = clone(row);
      if (leaseAcquire || leaseRelease) {
        if (leaseAcquire) { next.operation.worker = v[":worker"]; next.operation.leaseUntil = v[":lease"]; next.updatedAt = v[":now"]; }
        else { delete next.operation.worker; delete next.operation.leaseUntil; }
        rows.set(key, next); return { Attributes: clone(next) };
      }
      next.version = v[":next"];
      next.updatedAt = v[":now"];
      next.history = [...(next.history || []), ...(v[":audit"] || [])];
      if (v[":old"]) { next.status = "PENDING_APPROVAL"; next.emailVerified = true; next.username = v[":username"]; next.email = v[":email"]; next.name = v[":name"]; }
      else if (v[":rejected"]) { next.status = "REJECTED"; next.decidedBy = v[":admin"]; next.comments = v[":comments"]; next.decisionVersion = v[":version"]; }
      else if (v[":approved"]) {
        next.status = "APPROVED"; next.role = v[":role"]; next.decidedBy = v[":admin"]; next.comments = v[":comments"];
        next.decisionVersion = v[":requested"]; next.lockVersion = v[":version"]; next.lastOperationId = v[":operation"]; delete next.operation;
      } else { next.status = "APPLYING"; next.operation = clone(v[":operation"]); }
      rows.set(key, next);
      if (v[":approved"] && state.failFinal === "after") {
        state.failFinal = undefined; throw new Error("private-response-lost");
      }
      return { Attributes: clone(next) };
    }
    throw new Error("Unexpected command " + kind);
  } };
  const identity = {
    async signUp(input) { calls.push({ method: "signUp", input }); if (state.signUpError) throw state.signUpError; return { sub: "new-sub" }; },
    async confirmSignUp(input) { calls.push({ method: "confirmSignUp", input }); if (state.confirmError) throw state.confirmError; },
    async resendCode(input) { calls.push({ method: "resendCode", input }); if (state.resendError) throw state.resendError; },
    async getDirectoryUser() { if (state.beforeDirectory) await state.beforeDirectory(); return clone(state.directory); },
    async assertCurrentAdmin(user) { calls.push({ method: "assertCurrentAdmin" }); if (!user?.isAdmin || !state.adminAllowed) throw Object.assign(new Error("revoked admin"), { status: 403 }); },
    async assignBusinessRole(username, role, expectedSub, expectedEmail) {
      calls.push({ method: "assignBusinessRole", username, role, expectedSub, expectedEmail });
      if (state.beforeAssign) await state.beforeAssign();
      if (state.failAssign) throw new Error("private-group-failure");
    }
  };
  const config = { region: "us-east-2", businessTable: "BusinessTable", registrationEnabled: true, ...options };
  const service = createAccessService(config, { client, identity, clock: () => state.nowMs });
  function pending(sub = "new-sub") { rows.set("USER#" + sub, { pk: "ACCESS_REQUESTS", sk: "USER#" + sub, sub,
    username: "cognito-user", email: "employee@example.invalid", emailVerified: true, status: "PENDING_APPROVAL", version: 1, history: [] }); }
  return { service, state, rows, commands, calls, pending };
}
test("registro deshabilitado o sin tabla no llama Cognito", async () => {
  for (const config of [{ businessTable: undefined }, { registrationEnabled: false }]) {
    const f = fixture(config);
    await assert.rejects(f.service.register({ email: "employee@example.invalid", password: "test-secret-placeholder" }), { status: 503 });
    assert.equal(f.calls.length, 0);
  }
});
test("tabla inaccesible se detecta antes de crear cuenta Cognito", async () => {
  const f = fixture(); f.state.unavailable = true;
  await assert.rejects(f.service.register({ email: "employee@example.invalid", password: "test-secret-placeholder" }), { status: 503 });
  assert.equal(f.calls.length, 0);
});
test("registro no acepta role, groups o isAdmin enviados por cliente", async () => {
  const f = fixture();
  for (const extra of [{ role: "Director" }, { groups: ["Administrador"] }, { isAdmin: true }])
    await assert.rejects(f.service.register({ email: "employee@example.invalid", password: "test-secret-placeholder", ...extra }), { status: 400 });
  assert.equal(f.calls.length, 0);
});
test("registro guarda solo solicitud sin password y confirmacion no asigna roles", async () => {
  const f = fixture();
  const result = await f.service.register({ email: "EMPLOYEE@example.invalid", password: "test-secret-placeholder", name: "Empleado" });
  assert.equal(result.success, true);
  assert.equal(result.sub, undefined);
  assert.equal(f.rows.get("USER#new-sub").status, "AWAITING_EMAIL");
  assert.doesNotMatch(JSON.stringify([...f.rows.values()]), /test-secret-placeholder|password/);
  await f.service.confirm({ email: "employee@example.invalid", code: "123456" });
  assert.equal(f.rows.get("USER#new-sub").status, "PENDING_APPROVAL");
  assert.equal(f.rows.get("USER#new-sub").emailVerified, true);
  assert.equal(f.calls.some(call => call.method === "assignBusinessRole"), false);
  assert.doesNotMatch(JSON.stringify([...f.rows.values()]), /123456/);
});
test("cuenta existente recibe respuesta generica sin sobreescribir su registro", async () => {
  const f = fixture(); f.pending();
  f.state.signUpError = Object.assign(new Error("exists"), { name: "UsernameExistsException" });
  const result = await f.service.register({ email: "employee@example.invalid", password: "placeholder" });
  assert.equal(result.success, true);
  assert.equal(f.rows.get("USER#new-sub").version, 1);
});
test("confirmacion no permite avanzar sin email verificado ni modifica cuentas legacy", async () => {
  const f = fixture(); f.pending(); f.state.directory.emailVerified = false;
  await assert.rejects(f.service.confirm({ email: "employee@example.invalid", code: "123456" }), { status: 400 });
  assert.equal(f.rows.get("USER#new-sub").status, "PENDING_APPROVAL");
  const g = fixture(); g.state.directory.roles = ["Solicitante"];
  await g.service.confirm({ email: "employee@example.invalid", code: "123456" });
  assert.equal(g.rows.size, 0);
});

test("confirmacion recupera alta Cognito sin registro DynamoDB y exige aprobacion", async () => {
  const f = fixture();
  await f.service.confirm({ email: "employee@example.invalid", code: "123456" });
  assert.equal(f.rows.get("USER#new-sub").status, "PENDING_APPROVAL");
  await assert.rejects(f.service.assertAccountAccess({ sub: "new-sub", roles: ["Solicitante"] }), { status: 403 });
});
test("reenviar no expone inexistencia de la cuenta", async () => {
  const f = fixture(); f.state.resendError = Object.assign(new Error("private"), { name: "UserNotFoundException" });
  assert.equal((await f.service.resend({ email: "unknown@example.invalid" })).success, true);
});
test("solicitud pendiente o en APPLYING bloquea rol de negocio aun si tiene JWT previo", async () => {
  const f = fixture(); f.pending();
  const user = { sub: "new-sub", roles: ["Director"] };
  await assert.rejects(f.service.assertAccountAccess(user), { status: 403 });
  f.rows.get("USER#new-sub").status = "APPLYING";
  await assert.rejects(f.service.assertAccountAccess(user), { status: 403 });
  f.rows.get("USER#new-sub").status = "APPROVED"; f.rows.get("USER#new-sub").role = "Solicitante";
  await assert.rejects(f.service.assertAccountAccess(user), { status: 403 });
  await f.service.assertAccountAccess({ sub: "new-sub", roles: ["Solicitante"] });
});
test("legacy con grupos existentes funciona sin registro; admin se revalida actualmente", async () => {
  const f = fixture();
  await f.service.assertAccountAccess({ sub: "legacy", roles: ["Solicitante"] });
  await f.service.assertAccountAccess(admin);
  f.state.adminAllowed = false;
  await assert.rejects(f.service.assertAccountAccess(admin), { status: 403 });
});
test("admin lista solo particion de acceso y cursor queda ligado a particion", async () => {
  const f = fixture(); f.pending();
  const result = await f.service.listPending(admin, { limit: 20 });
  assert.equal(result.solicitudes.length, 1);
  const command = f.commands.find(c => c.constructor.name === "QueryCommand");
  assert.equal(command.input.ExpressionAttributeValues[":pk"], "ACCESS_REQUESTS");
  const malicious = Buffer.from(JSON.stringify({ pk: "OTHER_DATA", sk: "USER#new-sub" })).toString("base64url");
  await assert.rejects(f.service.listPending(admin, { cursor: malicious }), { status: 400 });
  f.state.adminAllowed = false;
  await assert.rejects(f.service.listPending(admin), { status: 403 });
});
test("aprobacion asigna negocio antes de registrar APPROVED y permite reintento idempotente", async () => {
  const f = fixture(); f.pending();
  const input = { decision: "APPROVED", role: "Gerente", version: 1, comments: "Empleado validado" };
  const result = await f.service.decide(admin, "new-sub", input);
  assert.equal(result.solicitud.status, "APPROVED");
  assert.equal(result.solicitud.role, "Gerente");
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 1);
  assert.equal(f.calls.find(call => call.method === "assignBusinessRole").expectedSub, "new-sub");
  assert.equal(f.calls.find(call => call.method === "assignBusinessRole").expectedEmail, "employee@example.invalid");
  assert.ok(result.solicitud.lastOperationId);
  assert.equal(result.solicitud.history[0].action, "APPROVAL_STARTED");
  assert.equal(result.solicitud.history[1].action, "ACCESS_APPROVED");
  const again = await f.service.decide(admin, "new-sub", input);
  assert.equal(again.reused, true);
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 1);
});
test("fallo parcial de grupos deja APPLYING bloqueado y misma decision puede reanudarse", async () => {
  const f = fixture(); f.pending(); f.state.failAssign = true;
  const input = { decision: "APPROVED", role: "Solicitante", version: 1, comments: "ok" };
  await assert.rejects(f.service.decide(admin, "new-sub", input), { status: 503 });
  assert.equal(f.rows.get("USER#new-sub").status, "APPLYING");
  assert.equal(f.rows.get("USER#new-sub").operation.worker, undefined);
  assert.equal(f.rows.get("USER#new-sub").operation.leaseUntil, undefined);
  await assert.rejects(f.service.assertAccountAccess({ sub: "new-sub", roles: ["Solicitante"] }), { status: 403 });
  await assert.rejects(f.service.decide({ ...admin, sub: "other-admin" }, "new-sub", input), { status: 409 });
  await assert.rejects(f.service.decide(admin, "new-sub", { ...input, role: "Director" }), { status: 409 });
  f.state.failAssign = false;
  assert.equal((await f.service.decide(admin, "new-sub", input)).solicitud.status, "APPROVED");
});
test("admin no puede autoaprobarse, conceder Administrador ni usar version vieja", async () => {
  const f = fixture(); f.pending();
  await assert.rejects(f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Administrador", version: 1 }), { status: 400 });
  await assert.rejects(f.service.decide({ ...admin, sub: "new-sub" }, "new-sub", { decision: "APPROVED", role: "Director", version: 1 }), { status: 403 });
  await assert.rejects(f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Director", version: 2 }), { status: 409 });
  assert.equal(f.calls.some(call => call.method === "assignBusinessRole"), false);
});
test("rechazo exige motivo y no modifica roles Cognito", async () => {
  const f = fixture(); f.pending();
  await assert.rejects(f.service.decide(admin, "new-sub", { decision: "REJECTED", version: 1 }), { status: 400 });
  const result = await f.service.decide(admin, "new-sub", { decision: "REJECTED", version: 1, comments: "No corresponde al equipo" });
  assert.equal(result.solicitud.status, "REJECTED");
  assert.equal(f.calls.some(call => call.method === "assignBusinessRole"), false);
});

test("sub, correo cambiado o cuenta sin confirmar impiden mutaciones administrativas", async () => {
  for (const changes of [{ sub: "another-sub" }, { email: "changed@example.invalid" }, { emailVerified: false }, { isAdmin: true }, { enabled: false }]) {
    const f = fixture(); f.pending(); Object.assign(f.state.directory, changes);
    await assert.rejects(f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Solicitante", version: 1 }), { status: 409 });
    assert.equal(f.rows.get("USER#new-sub").status, "PENDING_APPROVAL");
    assert.equal(f.commands.some(command => command.constructor.name === "UpdateCommand"), false);
    assert.equal(f.calls.some(call => call.method === "assignBusinessRole"), false);
  }
});

test("correo nuevo verificado actualiza revision pendiente y exige version administrativa nueva", async () => {
  const f = fixture(); f.pending();
  f.state.directory.email = "changed@example.invalid"; f.state.directory.name = "Nombre actualizado";
  f.state.confirmError = Object.assign(new Error("already confirmed"), { name: "NotAuthorizedException" });
  await f.service.confirm({ email: "changed@example.invalid", code: "unused-code" });
  const row = f.rows.get("USER#new-sub");
  assert.equal(row.status, "PENDING_APPROVAL"); assert.equal(row.version, 2);
  assert.equal(row.email, "changed@example.invalid"); assert.equal(row.name, "Nombre actualizado");
  assert.equal(row.history[0].action, "VERIFIED_EMAIL_CHANGED");
  assert.equal(row.history[0].previousEmail, "employee@example.invalid");
  await assert.rejects(f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Solicitante", version: 1 }), { status: 409 });
  await f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Solicitante", version: 2 });
  assert.equal(f.calls.find(call => call.method === "assignBusinessRole").expectedEmail, row.email);
});

test("dos decisiones que leen la misma version pendiente solo permiten una mutacion Cognito", async () => {
  const f = fixture(); f.pending(); const gate = deferred(); let arrivals = 0;
  f.state.beforeDirectory = async () => { if (++arrivals === 2) gate.resolve(); await gate.promise; };
  const results = await Promise.allSettled([
    f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Gerente", version: 1 }),
    f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Director", version: 1 })
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 1);
  assert.equal(f.rows.get("USER#new-sub").status, "APPROVED");
});

test("lease vivo rechaza reintento identico sin volver a mutar grupos", async () => {
  const f = fixture(); f.pending(); const entered = deferred(), release = deferred();
  f.state.beforeAssign = async () => { entered.resolve(); await release.promise; };
  const input = { decision: "APPROVED", role: "Gerente", version: 1, comments: "Validado" };
  const running = f.service.decide(admin, "new-sub", input); await entered.promise;
  const row = f.rows.get("USER#new-sub");
  assert.equal(row.operation.leaseUntil, f.state.nowMs + 960000);
  await assert.rejects(f.service.decide(admin, "new-sub", input), { status: 409 });
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 1);
  release.resolve(); await running;
  assert.equal((await f.service.decide(admin, "new-sub", input)).reused, true);
});

test("respuesta final perdida devuelve el resultado confirmado por el mismo operation id", async () => {
  const f = fixture(); f.pending(); f.state.failFinal = "after";
  const result = await f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Compras", version: 1, comments: "Autorizado" });
  assert.equal(result.reused, true); assert.equal(result.solicitud.status, "APPROVED");
  assert.ok(result.solicitud.lastOperationId);
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 1);
  const final = f.commands.find(command => command.input.ExpressionAttributeValues?.[":approved"]);
  assert.match(final.input.ConditionExpression, /#op\.#worker = :worker/);
});

test("fallo de escritura final conserva lease y acceso bloqueado hasta recuperacion tras 16 minutos", async () => {
  const f = fixture(); f.pending(); f.state.failFinal = "before";
  const input = { decision: "APPROVED", role: "Solicitante", version: 1 };
  await assert.rejects(f.service.decide(admin, "new-sub", input), { status: 503 });
  assert.equal(f.rows.get("USER#new-sub").status, "APPLYING");
  assert.ok(f.rows.get("USER#new-sub").operation.worker);
  await assert.rejects(f.service.assertAccountAccess({ sub: "new-sub", roles: ["Solicitante"] }), { status: 403 });
  await assert.rejects(f.service.decide(admin, "new-sub", input), { status: 409 });
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 1);
  f.state.nowMs += 960001;
  const result = await f.service.decide(admin, "new-sub", input);
  assert.equal(result.solicitud.status, "APPROVED");
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 2);
  assert.equal(result.solicitud.history.filter(event => event.action === "APPROVAL_STARTED").length, 1);
});

test("liberar un fallo de asignacion no borra el lease de otro trabajador", async () => {
  const f = fixture(); f.pending(); f.state.failAssign = true;
  f.state.beforeRelease = row => { row.operation.worker = "replacement-worker"; row.operation.leaseUntil = f.state.nowMs + 960000; };
  await assert.rejects(f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Solicitante", version: 1 }), { status: 503 });
  assert.equal(f.rows.get("USER#new-sub").operation.worker, "replacement-worker");
});

test("cambiar rol aprobado usa version actual, excluye carreras y bloquea sesion antigua", async () => {
  const f = fixture(); f.pending();
  await f.service.decide(admin, "new-sub", { decision: "APPROVED", role: "Solicitante", version: 1 });
  const version = f.rows.get("USER#new-sub").version;
  const gate = deferred(); let arrivals = 0;
  f.state.beforeDirectory = async () => { if (++arrivals === 2) gate.resolve(); await gate.promise; };
  const entered = deferred(), release = deferred();
  f.state.beforeAssign = async () => { entered.resolve(); await release.promise; };
  const input = { decision: "APPROVED", role: "Gerente", version, comments: "Cambio de responsabilidad" };
  const outcomes = Promise.allSettled([f.service.decide(admin, "new-sub", input), f.service.decide(admin, "new-sub", input)]);
  await entered.promise;
  await assert.rejects(f.service.assertAccountAccess({ sub: "new-sub", roles: ["Solicitante"] }), { status: 403 });
  release.resolve(); const results = await outcomes;
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
  assert.equal(f.calls.filter(call => call.method === "assignBusinessRole").length, 2);
  await assert.rejects(f.service.assertAccountAccess({ sub: "new-sub", roles: ["Solicitante"] }), { status: 403 });
  await f.service.assertAccountAccess({ sub: "new-sub", roles: ["Gerente"] });
  assert.equal((await f.service.decide(admin, "new-sub", input)).reused, true);
  const approved = await f.service.listPending(admin, { status: "APPROVED" });
  assert.equal(approved.solicitudes.length, 1);
  assert.equal(approved.solicitudes[0].role, "Gerente");
  assert.equal((await f.service.listPending(admin)).solicitudes.length, 0);
});
