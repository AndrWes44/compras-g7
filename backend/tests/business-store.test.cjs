"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createBusinessStore, cursorEncode } = require("../src/server").internals.businessStore;
const owner = { sub: "owner", email: "owner@example.invalid", roles: ["Solicitante"] };
const other = { sub: "other", email: "other@example.invalid", roles: ["Solicitante"] };
const buyer = { sub: "buyer", email: "buyer@example.invalid", roles: ["Compras"] };
const keyOf = value => JSON.stringify([value.pk, value.sk]);
const clone = value => value === undefined ? undefined : structuredClone(value);
function fixture() {
  const items = new Map(), commands = [];
  let sequence = 0, hook, forcedQuery;
  const failure = () => Object.assign(new Error("conflict"), { name: "ConditionalCheckFailedException" });
  const client = { async send(command) {
    commands.push(command);
    if (hook) { const once = hook; hook = undefined; await once(command, items); }
    const input = command.input, type = command.constructor.name;
    if (type === "GetCommand") return { Item: clone(items.get(keyOf(input.Key))) };
    if (type === "PutCommand" || type === "DeleteCommand") {
      const key = keyOf(input.Item || input.Key), current = items.get(key);
      if (input.ConditionExpression.includes("attribute_not_exists(pk)")) {
        if (current) throw failure();
      } else {
        const v = input.ExpressionAttributeValues;
        if (!current || current.version !== v[":version"] || current.status !== v[":status"] || current.entityType !== v[":type"] ||
            (v[":owner"] !== undefined && current.ownerSub !== v[":owner"]) ||
            (v[":requestId"] !== undefined && current.requestId !== v[":requestId"]) ||
            (v[":fingerprint"] !== undefined && current.submissionFingerprint !== v[":fingerprint"])) throw failure();
      }
      if (type === "PutCommand") items.set(key, clone(input.Item)); else items.delete(key);
      return {};
    }
    if (type === "QueryCommand") {
      if (forcedQuery) return clone(forcedQuery);
      const v = input.ExpressionAttributeValues;
      const all = [...items.values()].filter(item => item.pk === v[":pk"] && item.sk.startsWith(v[":prefix"]))
        .sort((a,b) => a.sk.localeCompare(b.sk));
      const start = input.ExclusiveStartKey ? all.findIndex(item => keyOf(item) === keyOf(input.ExclusiveStartKey)) + 1 : 0;
      const evaluated = all.slice(start, start + input.Limit);
      const visible = evaluated.filter(item => v[":active"] ? item.status === "ACTIVE" : v[":draft"]
        ? ["DRAFT", "REGISTERING"].includes(item.status) : item.status !== "DELETED");
      const last = evaluated.at(-1);
      return { Items: clone(visible), ...(start + evaluated.length < all.length && last ? { LastEvaluatedKey: { pk: last.pk, sk: last.sk } } : {}) };
    }
    throw new Error("Unexpected command " + type);
  } };
  return { items, commands, client,
    store: createBusinessStore({ businessTable: "business-test", region: "us-east-2" }, { client,
      uuid: () => "id-" + (++sequence), now: () => "2026-11-13T00:00:00.000Z" }),
    setHook: value => { hook = value; }, setQuery: value => { forcedQuery = value; } };
}
test("borrador incompleto online conserva identidad del servidor y rechaza suplantacion", async () => {
  const f = fixture();
  const doc = await f.store.createDraft(owner, { description: "" });
  assert.equal(doc.status, "DRAFT"); assert.equal(doc.ownerSub, owner.sub); assert.equal(doc.ownerEmail, owner.email);
  assert.equal(doc.version, 1); assert.equal(doc.entityType, "DRAFT"); assert.equal(doc.pk, undefined);
  const creation = f.commands.find(command => command.constructor.name === "PutCommand").input;
  assert.equal(creation.Item.pk, "USER#owner");
  assert.match(creation.ConditionExpression, /attribute_not_exists/);
  await assert.rejects(f.store.createDraft(owner, { ownerSub: "other" }), { status: 400 });
  await assert.rejects(f.store.createDraft(owner, { amount: Infinity }), { status: 400 });
  await assert.rejects(f.store.createDraft(owner, { articulos: Array.from({ length: 51 }, () => ({})) }), { status: 400 });
});
test("lectura y cursor de borradores no cruzan el propietario", async () => {
  const f = fixture(), doc = await f.store.createDraft(owner, {});
  await assert.rejects(f.store.getDraft(other, doc.id), { status: 404 });
  const calls = f.commands.length;
  await assert.rejects(f.store.listDrafts(owner, { limit: 20, cursor: cursorEncode({ pk: "USER#other", sk: "DRAFT#id-1" }) }), { status: 400 });
  assert.equal(f.commands.length, calls);
  f.setQuery({ Items: [{ pk: "USER#other", sk: "DRAFT#foreign", id: "foreign", entityType: "DRAFT", status: "DRAFT", ownerSub: "other" }] });
  assert.deepEqual((await f.store.listDrafts(owner, { limit: 20 })).items, []);
});
test("edicion parcial solo DRAFT requiere version y rechaza una carrera atomica", async () => {
  const f = fixture(), doc = await f.store.createDraft(owner, { description: "original", department: "TI" });
  await assert.rejects(f.store.updateDraft(owner, doc.id, { description: "x" }), { status: 400 });
  const changed = await f.store.updateDraft(owner, doc.id, { amount: 0 }, 1);
  assert.equal(changed.department, "TI"); assert.equal(changed.description, "original"); assert.equal(changed.version, 2);
  f.setHook(async command => {
    if (command.constructor.name === "GetCommand") f.setHook(async next => {
      if (next.constructor.name === "PutCommand") {
        const existing = f.items.get(keyOf(next.input.Item)); existing.version = 3; existing.description = "concurrent";
      }
    });
  });
  await assert.rejects(f.store.updateDraft(owner, doc.id, { description: "lost" }, 2), { status: 409 });
  assert.equal((await f.store.getDraft(owner, doc.id)).description, "concurrent");
});
test("bloqueo congela el snapshot y reintentos iguales no crean nuevo envio", async () => {
  const f = fixture(), draft = await f.store.createDraft(owner, { description: "borrador" });
  const payload = { amount: 25, requestId: "REQ-test", applicantSub: owner.sub };
  const locked = await f.store.lockDraftForSubmit(owner, draft.id, 1, payload, "REQ-test");
  assert.equal(locked.status, "REGISTERING"); assert.equal(locked.version, 2); assert.equal(locked.submitVersion, 1);
  payload.amount = 90; locked.submissionPayload.amount = 80;
  assert.equal((await f.store.getDraft(owner, draft.id)).submissionPayload.amount, 25);
  const writes = f.commands.filter(command => command.constructor.name === "PutCommand").length;
  const replay = await f.store.lockDraftForSubmit(owner, draft.id, 1,
    { applicantSub: owner.sub, requestId: "REQ-test", amount: 25 }, "REQ-test");
  assert.equal(replay.version, 2);
  assert.equal(f.commands.filter(command => command.constructor.name === "PutCommand").length, writes);
  await assert.rejects(f.store.updateDraft(owner, draft.id, { amount: 30 }, 2), { status: 409 });
  await assert.rejects(f.store.deleteDraft(owner, draft.id, 2), { status: 409 });
  await assert.rejects(f.store.lockDraftForSubmit(owner, draft.id, 1, { amount: 30 }, "REQ-test"), { status: 409 });
  await assert.rejects(f.store.markDraftSubmitted(owner, draft.id, "REQ-other"), { status: 409 });
  const submitted = await f.store.markDraftSubmitted(owner, draft.id, "REQ-test");
  assert.equal(submitted.status, "SUBMITTED"); assert.equal(submitted.version, 3);
  assert.equal((await f.store.markDraftSubmitted(owner, draft.id, "REQ-test")).version, 3);
  assert.deepEqual((await f.store.listDrafts(owner, { limit: 20 })).items, []);
});
test("carrera de bloqueo del mismo envio retorna el snapshot ya bloqueado", async () => {
  const f = fixture(), draft = await f.store.createDraft(owner, {});
  const payload = { amount: 1 }, requestId = "REQ-race";
  f.setHook(async command => {
    if (command.constructor.name === "GetCommand") f.setHook(async next => {
      if (next.constructor.name === "PutCommand") f.items.set(keyOf(next.input.Item), clone(next.input.Item));
    });
  });
  const locked = await f.store.lockDraftForSubmit(owner, draft.id, 1, payload, requestId);
  assert.equal(locked.status, "REGISTERING"); assert.equal(locked.requestId, requestId);
});
test("confirmaciones concurrentes del mismo envio son idempotentes y protegen su referencia", async () => {
  const f = fixture(), draft = await f.store.createDraft(owner, {});
  await f.store.lockDraftForSubmit(owner, draft.id, 1, { amount: 1 }, "REQ-race");
  f.setHook(async command => {
    if (command.constructor.name === "GetCommand") f.setHook(async next => {
      if (next.constructor.name === "PutCommand") f.items.set(keyOf(next.input.Item), clone(next.input.Item));
    });
  });
  const marked = await f.store.markDraftSubmitted(owner, draft.id, "REQ-race");
  assert.equal(marked.status, "SUBMITTED"); assert.equal(marked.version, 3);
  const command = f.commands.filter(command => command.constructor.name === "PutCommand").at(-1).input;
  assert.match(command.ConditionExpression, /requestId = :requestId/);
  assert.match(command.ConditionExpression, /submissionFingerprint = :fingerprint/);
});
test("borrar borrador solo elimina el DRAFT propio con la version esperada", async () => {
  const f = fixture(), doc = await f.store.createDraft(owner, {});
  await assert.rejects(f.store.deleteDraft(other, doc.id, 1), { status: 404 });
  assert.equal((await f.store.deleteDraft(owner, doc.id, 1)).status, "DELETED");
  await assert.rejects(f.store.getDraft(owner, doc.id), { status: 404 });
  const command = f.commands.find(command => command.constructor.name === "DeleteCommand").input;
  assert.equal(command.ExpressionAttributeValues[":owner"], owner.sub);
  assert.equal(command.ExpressionAttributeValues[":status"], "DRAFT");
});
test("proveedores filtran activos y no filtran datos fiscales o bancarios a otros roles", async () => {
  const f = fixture();
  await f.store.createSupplier(buyer, { name: "Proveedor A", taxId: "TAX-123", bankName: "Banco", bankAccount: "00123", status: "ACTIVE" });
  await f.store.createSupplier(buyer, { name: "Proveedor B", status: "INACTIVE" });
  const publicList = await f.store.listSuppliers(owner, { limit: 20, activeOnly: true });
  assert.equal(publicList.items.length, 1); assert.equal(publicList.items[0].name, "Proveedor A");
  assert.equal(publicList.items[0].taxId, undefined); assert.equal(publicList.items[0].bankAccount, undefined);
  assert.equal((await f.store.listSuppliers(buyer, { limit: 20 })).items[0].bankAccount, "00123");
  const calls = f.commands.length;
  await assert.rejects(f.store.listSuppliers(buyer, { cursor: cursorEncode({ pk: "USER#owner", sk: "DRAFT#id-1" }) }), { status: 400 });
  assert.equal(f.commands.length, calls);
  await assert.rejects(f.store.listSuppliers(buyer, { cursor: null }), { status: 400 });
  assert.equal(f.commands.length, calls);
});
test("datos fiscales son editables con version; eliminacion solo INACTIVE conserva registro historico", async () => {
  const f = fixture(), doc = await f.store.createSupplier(buyer, { name: "Proveedor", status: "ACTIVE" });
  await assert.rejects(f.store.deleteInactiveSupplier(buyer, doc.id, 1), { status: 409 });
  const changed = await f.store.updateSupplier(buyer, doc.id, { taxId: "TAX", bankAccount: "00001", status: "INACTIVE" }, 1);
  assert.equal(changed.version, 2); assert.equal(changed.bankAccount, "00001");
  await assert.rejects(f.store.updateSupplier(buyer, doc.id, { name: "stale" }, 1), { status: 409 });
  const deleted = await f.store.deleteInactiveSupplier(buyer, doc.id, 2);
  assert.equal(deleted.status, "DELETED"); assert.equal(deleted.version, 3);
  const stored = f.items.get(keyOf({ pk: "SUPPLIERS", sk: "SUPPLIER#" + doc.id }));
  assert.equal(stored.taxId, "TAX"); assert.equal(stored.status, "DELETED");
  await assert.rejects(f.store.getSupplier(doc.id), { status: 404 });
  assert.equal((await f.store.listSuppliers(buyer, { limit: 20 })).items.length, 0);
});
test("falta de tabla, payloads no tipados y versiones invalidas fallan antes de escribir", async () => {
  let sends = 0;
  const missing = createBusinessStore({}, { client: { send: async () => { sends++; } } });
  await assert.rejects(missing.createDraft(owner, {}), { status: 503 });
  assert.equal(sends, 0);
  const f = fixture();
  await assert.rejects(f.store.createSupplier(buyer, { name: "x", password: "not-allowed" }), { status: 400 });
  await assert.rejects(f.store.createSupplier(buyer, { name: "x", bankAccount: 123 }), { status: 400 });
  await assert.rejects(f.store.updateSupplier(buyer, "id-1", { name: "x" }, "1"), { status: 400 });
  assert.equal(f.commands.length, 0);
});
test("paginacion filtrada vacia conserva cursor y limita trabajo a cinco queries", async () => {
  const f = fixture();
  f.setQuery({ Items: [], LastEvaluatedKey: { pk: "SUPPLIERS", sk: "SUPPLIER#next" } });
  const response = await f.store.listSuppliers(owner, { limit: 20, activeOnly: true });
  assert.equal(f.commands.length, 5); assert.equal(response.total, 0); assert.equal(response.hayMasRegistros, true);
  assert.ok(response.siguienteCursor);
  assert.equal(response.alcanceTotal, "pagina");
});
