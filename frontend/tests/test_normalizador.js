/**
 * Batería de Pruebas Unitarias y de Integración: Normalización y Mapeo
 * Valida la traducción fidedigna de datos DynamoDB a Figma UI
 */

const assert = require('assert');

// Simular entorno global de navegador
global.window = {};
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; }
};
global.sessionStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; }
};
global.document = {
  addEventListener() {}
};
global.state = {
  solicitudes: [],
  apiState: { isConnected: null, isLoading: false, cursor: null, hayMasRegistros: false, totalApi: 0 }
};

// Cargar módulos
require('../public/config.js');
require('../public/auth.js');
require('../public/api.js');
require('../public/app.js');

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ [FAIL] ${desc}: ${e.message}`);
  }
}

console.log('\n===============================================================');
console.log('🧪 VERIFICACIÓN RIGUROSA: NORMALIZACIÓN DYNAMODB ➔ FIGMA UI');
console.log('===============================================================\n');

// Caso 1: Registro típico retornado por DynamoDB (Campos en inglés según contrato Backend Dev 2)
it('Debe normalizar registro estándar de DynamoDB (requestId, applicant, amount, status: APPROVED)', () => {
  const dynamoRecord = {
    requestId: 'REQ-1731284900-ABC',
    amount: 2500,
    applicant: 'usuario@empresa.com',
    department: 'DEP-TI',
    description: 'Compra de servidores para infraestructura',
    status: 'APPROVED',
    createdAt: '2026-11-10T14:30:00Z'
  };

  const norm = window.normalizarSolicitudDesdeApi(dynamoRecord);
  assert.strictEqual(norm.id, 'REQ-1731284900-ABC');
  assert.strictEqual(norm.total, 2500);
  assert.strictEqual(norm.solicitante, 'usuario@empresa.com');
  assert.strictEqual(norm.departamento, 'DEP-TI');
  assert.strictEqual(norm.descripcion, 'Compra de servidores para infraestructura');
  assert.strictEqual(norm.estado, 'aprobado');
  assert.strictEqual(norm.esAltoMonto, true, 'Monto >= 1000 debe marcarse como esAltoMonto');
});

// Caso 2: Manejo de estados de Step Functions
it('Debe mapear correctamente variantes de estados (REJECTED, PENDING_APPROVAL, etc.)', () => {
  const rej = window.normalizarSolicitudDesdeApi({ requestId: 'REQ-1', amount: 50, status: 'REJECTED' });
  assert.strictEqual(rej.estado, 'rechazado');

  const pend = window.normalizarSolicitudDesdeApi({ requestId: 'REQ-2', amount: 50, status: 'PENDING_APPROVAL' });
  assert.strictEqual(pend.estado, 'en_revision');

  const draft = window.normalizarSolicitudDesdeApi({ requestId: 'REQ-3', amount: 50, status: 'DRAFT' });
  assert.strictEqual(draft.estado, 'borrador');
});

// Caso 3: Manejo de montos bajos
it('Monto menor a 1000 USD debe marcar esAltoMonto como false', () => {
  const ordinaria = window.normalizarSolicitudDesdeApi({ requestId: 'REQ-4', amount: 78.50, status: 'PENDING' });
  assert.strictEqual(ordinaria.total, 78.50);
  assert.strictEqual(ordinaria.esAltoMonto, false);
});

// Caso 4: Registro con valores nulos o campos faltantes (tolerancia a fallos)
it('Debe tolerar registros incompletos sin romper la aplicación', () => {
  const incompleto = window.normalizarSolicitudDesdeApi({});
  assert(incompleto.id.startsWith('REQ-'));
  assert.strictEqual(incompleto.total, 0);
  assert.strictEqual(incompleto.estado, 'en_revision');
  assert.strictEqual(incompleto.esAltoMonto, false);
  assert(Array.isArray(incompleto.items));
});

// Caso 5: Nuevo contrato oficial de DynamoDB (g7-dev-solicitudes)
it('Debe normalizar el esquema oficial de DynamoDB (articulos, proveedorId, requiereAprobacionDe)', () => {
  const dynamoOficial = {
    requestId: 'REQ-DYNAMO-OFICIAL-01',
    amount: 1250,
    applicant: 'solicitante@g7.com',
    department: 'DEP-TI',
    description: 'Adquisición de licencias y almacenamiento cloud',
    articulos: [
      { nombre: 'Licencia Anual Cloud', cantidad: 1, precioUnitario: 1000, subtotal: 1000 },
      { nombre: 'Almacenamiento Extra', cantidad: 1, precioUnitario: 250, subtotal: 250 }
    ],
    proveedorId: 'PRV-001',
    status: 'PENDING',
    requiereAprobacionDe: 'Director',
    createdAt: '2026-11-10T20:00:00Z',
    updatedAt: '2026-11-10T20:00:00Z'
  };

  const norm = window.normalizarSolicitudDesdeApi(dynamoOficial);
  assert.strictEqual(norm.id, 'REQ-DYNAMO-OFICIAL-01');
  assert.strictEqual(norm.total, 1250);
  assert.strictEqual(norm.solicitante, 'solicitante@g7.com');
  assert.strictEqual(norm.departamento, 'DEP-TI');
  assert.strictEqual(norm.estado, 'en_revision');
  assert.strictEqual(norm.esAltoMonto, true);
  assert.strictEqual(norm.items.length, 2);
  assert.strictEqual(norm.items[0].precio, 1000);
  assert.strictEqual(norm.proveedorId, 'PRV-001');
});

console.log('\n===============================================================');
console.log(`📊 TOTAL VERIFICACIONES DE MAPEO: ${passed}/${total} exitosas.`);
console.log('===============================================================\n');

if (passed !== total) process.exit(1);
