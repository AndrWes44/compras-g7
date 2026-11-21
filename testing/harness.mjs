import { createRequire } from 'node:module';
import { once } from 'node:events';

const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const { createApp, contracts } = requireBackend('../backend/src/server.js').internals;

const accounts = {
  solicitante: { sub: 'test-owner', email: 'owner@example.invalid', roles: ['Solicitante'] },
  otro: { sub: 'test-other', email: 'other@example.invalid', roles: ['Solicitante'] },
  gerente: { sub: 'test-manager', email: 'manager@example.invalid', roles: ['Gerente'] },
  director: { sub: 'test-director', email: 'director@example.invalid', roles: ['Director'] },
  compras: { sub: 'test-buyer', email: 'buyer@example.invalid', roles: ['Compras'] },
  admin: { sub: 'test-admin', email: 'admin@example.invalid', roles: [], isAdmin: true }
};

const failure = (status, message) => Object.assign(new Error(message), { status });
const conflict = () => Object.assign(new Error('Test write conflict'), { name: 'ConditionalCheckFailedException' });
const copy = value => structuredClone(value);

// Usa Express real y dependencias en memoria; no crea clientes ni recursos AWS.
export async function startBackend() {
  const state = {
    requests: new Map(), executions: new Map(), drafts: new Map(),
    suppliers: new Map([['PRV-test', { id: 'PRV-test', name: 'Proveedor de prueba', status: 'ACTIVE', version: 1 }]]),
    calls: { starts: 0, decisions: 0, cancellations: 0 },
    persistOnStart: true, failRead: false, failList: false, failStart: false,
    draftSequence: 0
  };
  state.persist = requestId => {
    const execution = state.executions.get(requestId);
    if (!execution) throw new Error('Unknown test execution');
    const document = { ...JSON.parse(execution.input), status: 'PENDING', createdAt: '2026-11-20T12:00:00.000Z' };
    state.requests.set(requestId, document);
    return copy(document);
  };
  const store = {
    rateLimit: async () => 1,
    async getRequest(id) {
      if (state.failRead) throw new Error('SIMULATED_STORAGE_ERROR');
      return copy(state.requests.get(id));
    },
    async listRequests(user, { limit, cursor }) {
      if (state.failList) throw new Error('SIMULATED_STORAGE_ERROR');
      const visible = [...state.requests.values()].filter(doc => contracts.canSee(doc, user));
      const offset = cursor ? Number(cursor) : 0;
      const solicitudes = visible.slice(offset, offset + limit).map(copy);
      const hasMore = offset + limit < visible.length;
      return { solicitudes, total: solicitudes.length, alcanceTotal: 'pagina',
        siguienteCursor: hasMore ? String(offset + limit) : null, hayMasRegistros: hasMore };
    },
    async decide(doc, decision, user) {
      const current = state.requests.get(doc.requestId);
      if (!current || current.status !== 'PENDING') throw conflict();
      state.calls.decisions++;
      Object.assign(current, { status: decision.decision, decidedBy: user.sub,
        history: [...(current.history || []), { status: decision.decision, comments: decision.comentarios }] });
      return copy(current);
    },
    async cancelRequest(doc, user, comments) {
      const current = state.requests.get(doc.requestId);
      if (!current || current.status !== 'PENDING') throw conflict();
      state.calls.cancellations++;
      Object.assign(current, { status: 'CANCELLED', cancelledBy: user.sub,
        history: [...(current.history || []), { status: 'CANCELLED', comments }] });
      return copy(current);
    }
  };
  const workflow = {
    find: async requestId => copy(state.executions.get(requestId)),
    async start(payload) {
      if (state.failStart) throw new Error('SIMULATED_WORKFLOW_ERROR');
      if (state.executions.has(payload.requestId)) throw conflict();
      state.calls.starts++;
      state.executions.set(payload.requestId, { input: JSON.stringify(payload), status: 'RUNNING' });
      if (state.persistOnStart) state.persist(payload.requestId);
    }
  };
  const business = {
    getSupplier: async id => copy(state.suppliers.get(id)),
    async createDraft(user, data) {
      const id = 'DRAFT-' + ++state.draftSequence;
      const draft = { ...copy(data), id, ownerSub: user.sub, status: 'DRAFT', version: 1 };
      state.drafts.set(user.sub + ':' + id, draft);
      return copy(draft);
    },
    getDraft: async (user, id) => copy(state.drafts.get(user.sub + ':' + id)),
    listDrafts: async user => ({ items: [...state.drafts.values()].filter(doc => doc.ownerSub === user.sub).map(copy) }),
    async updateDraft(user, id, data, version) {
      const key = user.sub + ':' + id;
      const current = state.drafts.get(key);
      if (!current) throw failure(404, 'Draft not found');
      if (current.version !== version || current.status !== 'DRAFT') throw conflict();
      const draft = { ...current, ...copy(data), version: version + 1 };
      state.drafts.set(key, draft);
      return copy(draft);
    },
    async deleteDraft(user, id, version) {
      const key = user.sub + ':' + id;
      const current = state.drafts.get(key);
      if (!current) throw failure(404, 'Draft not found');
      if (current.version !== version || current.status !== 'DRAFT') throw conflict();
      state.drafts.delete(key);
    }
  };
  const identity = {
    async authenticate(token) {
      const user = accounts[token];
      if (!user) throw failure(401, 'Invalid test session');
      return copy(user);
    },
    async login(email) {
      const user = Object.values(accounts).find(account => account.email === email);
      if (!user) throw failure(401, 'Invalid test account');
      return { success: true, tokens: { accessToken: 'fixture-only-token' }, user: copy(user) };
    },
    logout: async () => {}
  };
  const app = createApp({ store, workflow, identity, business,
    config: { origins: 'https://dashboard.example.invalid' } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { state, users: copy(accounts), baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() { await new Promise(resolve => server.close(resolve)); } };
}
