import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBackend } from './harness.mjs';

const payload = (amount = 25) => ({
  description: 'Compra de prueba', department: 'TI', proveedorId: 'PRV-test', amount,
  articulos: [{ nombre: 'Artículo de prueba', cantidad: 1, precioUnitario: amount }]
});
async function scenario(callback) {
  const backend = await startBackend();
  try { await callback(backend); } finally { await backend.close(); }
}
async function request(backend, method, path, body, role = 'solicitante', extraHeaders = {}) {
  const response = await fetch(backend.baseUrl + path, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(role ? { Authorization: 'Bearer ' + role } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const document = (backend, id, amount = 25, owner = 'solicitante', status = 'PENDING') => ({
  ...payload(amount), requestId: id, status, applicantSub: backend.users[owner].sub,
  applicant: backend.users[owner].email, requiereAprobacionDe: amount <= 1000 ? 'Gerente' : 'Director'
});

test('health es público y las respuestas no se almacenan en caché', () => scenario(async b => {
  const result = await request(b, 'GET', '/health', undefined, null);
  assert.equal(result.status, 200);
  assert.equal(result.body.estado, 'OK');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
}));

for (const route of ['/api/auth/me', '/api/solicitudes', '/api/borradores', '/api/capacidades']) {
  test('exige sesión para ' + route, () => scenario(async b => {
    assert.equal((await request(b, 'GET', route, undefined, null)).status, 401);
    assert.equal(b.state.calls.starts, 0);
  }));
}
test('rechaza un token desconocido sin iniciar operaciones', () => scenario(async b => {
  assert.equal((await request(b, 'GET', '/api/solicitudes', undefined, 'unknown-test-token')).status, 401);
  assert.equal(b.state.calls.starts, 0);
}));
test('auth/me devuelve la identidad de la sesión inyectada', () => scenario(async b => {
  const result = await request(b, 'GET', '/api/auth/me');
  assert.equal(result.status, 200);
  assert.equal(result.body.usuario.sub, b.users.solicitante.sub);
}));
test('el login conserva el rol simple de la identidad autenticada', () => scenario(async b => {
  const result = await request(b, 'POST', '/api/auth/login',
    { email: b.users.director.email, password: 'fixture-only-password' }, null);
  assert.equal(result.status, 200);
  assert.equal(result.body.user.role, 'director');
  assert.equal(result.body.user.roleTitle, 'Director');
}));

for (const amount of [0.01, 999.99, 1000, 1000.01, 1800]) {
  test(`creación de USD ${amount} inicia registro y asigna el rol correcto`, () => scenario(async b => {
    const result = await request(b, 'POST', '/api/solicitudes', payload(amount));
    assert.equal(result.status, 202);
    assert.equal(result.body.estado, 'REGISTERING');
    assert.match(result.body.requestId, /^REQ-[a-f0-9]{64}$/);
    const stored = b.state.requests.get(result.body.requestId);
    assert.equal(stored.amount, amount);
    assert.equal(stored.requiereAprobacionDe, amount <= 1000 ? 'Gerente' : 'Director');
    assert.equal(stored.applicantSub, b.users.solicitante.sub);
    const persisted = await request(b, 'GET', `/api/solicitudes/${result.body.requestId}/registro`);
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.estado, 'PERSISTED');
    assert.equal(persisted.body.solicitud.status, 'PENDING');
  }));
}
test('202 no se presenta como persistencia hasta que el flujo registra la solicitud', () => scenario(async b => {
  b.state.persistOnStart = false;
  const created = await request(b, 'POST', '/api/solicitudes', payload());
  const id = created.body.requestId;
  assert.equal(created.status, 202);
  assert.equal((await request(b, 'GET', `/api/solicitudes/${id}/registro`)).body.estado, 'REGISTERING');
  assert.equal((await request(b, 'GET', `/api/solicitudes/${id}`)).status, 404);
  b.state.persist(id);
  const persisted = await request(b, 'GET', `/api/solicitudes/${id}/registro`);
  assert.equal(persisted.body.estado, 'PERSISTED');
  assert.equal(persisted.body.solicitud.requestId, id);
}));
for (const role of ['gerente', 'director', 'compras', 'admin']) {
  test(role + ' no crea solicitudes comerciales', () => scenario(async b => {
    assert.equal((await request(b, 'POST', '/api/solicitudes', payload(), role)).status, 403);
    assert.equal(b.state.calls.starts, 0);
  }));
}
for (const [name, change] of [
  ['descripción vacía', { description: ' ' }],
  ['departamento vacío', { department: '' }],
  ['total inconsistente', { amount: 26 }],
  ['sin artículos', { articulos: [] }],
  ['cantidad cero', { articulos: [{ nombre: 'Artículo', cantidad: 0, precioUnitario: 25 }] }],
  ['cantidad fraccionaria', { articulos: [{ nombre: 'Artículo', cantidad: 1.5, precioUnitario: 25 }] }],
  ['cantidad fuera de rango', { articulos: [{ nombre: 'Artículo', cantidad: 10001, precioUnitario: 25 }] }],
  ['precio cero', { articulos: [{ nombre: 'Artículo', cantidad: 1, precioUnitario: 0 }] }]
]) {
  test('rechaza ' + name + ' antes de iniciar el registro', () => scenario(async b => {
    const result = await request(b, 'POST', '/api/solicitudes', { ...payload(), ...change });
    assert.equal(result.status, 400);
    assert.equal(b.state.calls.starts, 0);
    assert.equal(b.state.requests.size, 0);
  }));
}
test('la identidad del solicitante no procede de campos enviados por el cliente', () => scenario(async b => {
  const created = await request(b, 'POST', '/api/solicitudes',
    { ...payload(), applicant: b.users.otro.email, applicantSub: b.users.otro.sub });
  assert.equal(created.status, 202);
  const stored = b.state.requests.get(created.body.requestId);
  assert.equal(stored.applicant, b.users.solicitante.email);
  assert.equal(stored.applicantSub, b.users.solicitante.sub);
}));
for (const status of ['INACTIVE', 'MISSING']) {
  test('no inicia una compra con proveedor ' + status, () => scenario(async b => {
    if (status === 'MISSING') b.state.suppliers.delete('PRV-test');
    else b.state.suppliers.get('PRV-test').status = status;
    assert.equal((await request(b, 'POST', '/api/solicitudes', payload())).status, 400);
    assert.equal(b.state.calls.starts, 0);
  }));
}
test('un reintento con la misma clave y contenido reutiliza el registro', () => scenario(async b => {
  const headers = { 'Idempotency-Key': 'qa-idempotent-key-20261121' };
  const first = await request(b, 'POST', '/api/solicitudes', payload(), 'solicitante', headers);
  const second = await request(b, 'POST', '/api/solicitudes', payload(), 'solicitante', headers);
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(second.body.requestId, first.body.requestId);
  assert.equal(second.body.reused, true);
  assert.equal(b.state.calls.starts, 1);
  assert.equal(b.state.requests.size, 1);
  const changed = await request(b, 'POST', '/api/solicitudes', payload(30), 'solicitante', headers);
  assert.equal(changed.status, 409);
  assert.equal(b.state.calls.starts, 1);
}));
test('sin clave explícita cada envío conserva un identificador propio', () => scenario(async b => {
  const results = await Promise.all([request(b, 'POST', '/api/solicitudes', payload()), request(b, 'POST', '/api/solicitudes', payload())]);
  assert.ok(results.every(result => result.status === 202));
  assert.notEqual(results[0].body.requestId, results[1].body.requestId);
  assert.equal(b.state.calls.starts, 2);
}));
test('la paginación conserva visibilidad por propietario y devuelve cursor de continuación', () => scenario(async b => {
  for (const [id, owner] of [['REQ-one', 'solicitante'], ['REQ-other', 'otro'], ['REQ-two', 'solicitante']]) {
    b.state.requests.set(id, document(b, id, 25, owner));
  }
  const first = await request(b, 'GET', '/api/solicitudes?limit=1');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.solicitudes.map(doc => doc.requestId), ['REQ-one']);
  assert.equal(first.body.total, 1);
  assert.equal(first.body.alcanceTotal, 'pagina');
  assert.equal(first.body.hayMasRegistros, true);
  const second = await request(b, 'GET', '/api/solicitudes?limit=1&cursor=' + first.body.siguienteCursor);
  assert.deepEqual(second.body.solicitudes.map(doc => doc.requestId), ['REQ-two']);
  assert.equal(second.body.hayMasRegistros, false);
  assert.equal((await request(b, 'GET', '/api/solicitudes/REQ-other')).status, 404);
}));
test('el listado vacío es una página vacía autorizada', () => scenario(async b => {
  const result = await request(b, 'GET', '/api/solicitudes');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.solicitudes, []);
  assert.equal(result.body.total, 0);
}));
for (const limit of ['0', '101', '1.5', 'abc']) {
  test('rechaza limit=' + limit, () => scenario(async b => {
    assert.equal((await request(b, 'GET', '/api/solicitudes?limit=' + limit)).status, 400);
  }));
}

for (const [amount, approver, otherApprover] of [[1000, 'gerente', 'director'], [1000.01, 'director', 'gerente']]) {
  test(`el dictamen de USD ${amount} respeta el límite de rol`, () => scenario(async b => {
    b.state.requests.set('REQ-decision', document(b, 'REQ-decision', amount));
    const decision = { decision: 'APPROVED', comentarios: 'Necesidad de prueba verificada' };
    assert.equal((await request(b, 'PATCH', '/api/solicitudes/REQ-decision/decision', decision, otherApprover)).status, 404);
    const approved = await request(b, 'PATCH', '/api/solicitudes/REQ-decision/decision', decision, approver);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.solicitud.status, 'APPROVED');
    assert.equal(approved.body.solicitud.decidedBy, b.users[approver].sub);
    assert.equal((await request(b, 'PATCH', '/api/solicitudes/REQ-decision/decision', decision, approver)).status, 409);
    assert.equal(b.state.calls.decisions, 1);
  }));
}
test('el comentario es obligatorio y no se permite autoaprobación', () => scenario(async b => {
  b.state.requests.set('REQ-other', document(b, 'REQ-other'));
  assert.equal((await request(b, 'PATCH', '/api/solicitudes/REQ-other/decision', { decision: 'APPROVED' }, 'gerente')).status, 400);
  b.state.requests.set('REQ-self', document(b, 'REQ-self', 25, 'gerente'));
  assert.equal((await request(b, 'PATCH', '/api/solicitudes/REQ-self/decision',
    { decision: 'APPROVED', comentarios: 'Intento propio' }, 'gerente')).status, 403);
  assert.equal(b.state.calls.decisions, 0);
}));
test('un estado final o antiguo no vuelve a ser elegible para dictamen', () => scenario(async b => {
  for (const status of ['APPROVED', 'REJECTED', 'CANCELLED', 'REQUIRES_MANAGER']) {
    const original = document(b, 'REQ-final', 1800, 'solicitante', status);
    b.state.requests.set(original.requestId, original);
    const result = await request(b, 'PATCH', '/api/solicitudes/REQ-final/decision',
      { decision: 'REJECTED', comentarios: 'Intento posterior al cierre' }, 'director');
    assert.equal(result.status, 409);
    assert.deepEqual(b.state.requests.get(original.requestId), original);
  }
  assert.equal(b.state.calls.decisions, 0);
}));
test('la bandeja usa elegibilidad del servidor y conserva el reparto por rol', () => scenario(async b => {
  for (const [id, amount, status] of [['REQ-low', 1000, 'PENDING'], ['REQ-high', 1000.01, 'PENDING'], ['REQ-closed', 50, 'APPROVED']]) {
    b.state.requests.set(id, document(b, id, amount, 'solicitante', status));
  }
  assert.deepEqual((await request(b, 'GET', '/api/aprobaciones', undefined, 'gerente')).body.solicitudes.map(doc => doc.requestId), ['REQ-low']);
  assert.deepEqual((await request(b, 'GET', '/api/aprobaciones', undefined, 'director')).body.solicitudes.map(doc => doc.requestId), ['REQ-high']);
  assert.equal((await request(b, 'GET', '/api/aprobaciones', undefined, 'compras')).status, 403);
}));
test('solo el propietario puede anular una solicitud pendiente', () => scenario(async b => {
  b.state.requests.set('REQ-cancel', document(b, 'REQ-cancel'));
  const reason = { comentarios: 'Cambio de necesidad' };
  assert.equal((await request(b, 'POST', '/api/solicitudes/REQ-cancel/anular', reason, 'otro')).status, 404);
  const cancelled = await request(b, 'POST', '/api/solicitudes/REQ-cancel/anular', reason);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.solicitud.status, 'CANCELLED');
  assert.equal((await request(b, 'POST', '/api/solicitudes/REQ-cancel/anular', reason)).status, 409);
  assert.equal(b.state.calls.cancellations, 1);
}));
test('borradores privados: crear, consultar, actualizar con versión y eliminar', () => scenario(async b => {
  const created = await request(b, 'POST', '/api/borradores', payload());
  assert.equal(created.status, 201);
  const id = created.body.borrador.id;
  assert.equal((await request(b, 'GET', '/api/borradores/' + id, undefined, 'otro')).status, 404);
  assert.equal((await request(b, 'PATCH', '/api/borradores/' + id, { description: 'Sin versión' })).status, 400);
  const updated = await request(b, 'PATCH', '/api/borradores/' + id, { description: 'Compra actualizada', version: 1 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.borrador.version, 2);
  assert.equal((await request(b, 'PATCH', '/api/borradores/' + id, { description: 'Versión vieja', version: 1 })).status, 409);
  assert.equal((await request(b, 'GET', '/api/borradores/' + id)).body.borrador.description, 'Compra actualizada');
  assert.equal((await request(b, 'DELETE', '/api/borradores/' + id, { version: 2 })).status, 200);
  assert.equal((await request(b, 'GET', '/api/borradores/' + id)).status, 404);
  assert.equal(b.state.requests.size, 0);
}));

for (const [flag, method, route, body] of [
  ['failRead', 'GET', '/api/solicitudes/REQ-read'],
  ['failList', 'GET', '/api/solicitudes'],
  ['failStart', 'POST', '/api/solicitudes', payload()]
]) {
  test('el fallo ' + flag + ' devuelve 500 sin detalle interno', () => scenario(async b => {
    b.state[flag] = true;
    const result = await request(b, method, route, body);
    assert.equal(result.status, 500);
    assert.equal(result.body.success, false);
    assert.doesNotMatch(JSON.stringify(result.body), /SIMULATED_|stack|fixture-only/);
    assert.equal(b.state.requests.size, 0);
  }));
}
test('JSON malformado devuelve 400 antes de iniciar el flujo', () => scenario(async b => {
  const result = await fetch(b.baseUrl + '/api/solicitudes', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer solicitante' }, body: '{' });
  assert.equal(result.status, 400);
  assert.equal(b.state.calls.starts, 0);
}));
test('el preflight solo admite el origen configurado', () => scenario(async b => {
  const allowed = await fetch(b.baseUrl + '/api/borradores', { method: 'OPTIONS',
    headers: { Origin: 'https://dashboard.example.invalid' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.invalid');
  const rejected = await fetch(b.baseUrl + '/api/borradores', { method: 'OPTIONS',
    headers: { Origin: 'https://other.example.invalid' } });
  assert.equal(rejected.status, 403);
}));
test('no expone actualización o borrado genérico de solicitudes enviadas', () => scenario(async b => {
  b.state.requests.set('REQ-kept', document(b, 'REQ-kept'));
  assert.equal((await request(b, 'PUT', '/api/solicitudes/REQ-kept', payload())).status, 404);
  assert.equal((await request(b, 'DELETE', '/api/solicitudes/REQ-kept')).status, 404);
  assert.equal(b.state.requests.get('REQ-kept').status, 'PENDING');
}));
