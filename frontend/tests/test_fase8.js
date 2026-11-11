/**
 * Test Suite Riguroso: Fase 8 (Borradores Locales y Conversión a AWS Step Functions)
 */

const assert = require('assert');

global.window = {
  render() {},
  navigateTo() {}
};
global.navigateTo = function() {};
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
  addEventListener() {},
  getElementById(id) {
    if (id === 'solicitud-desc') return { value: 'Borrador de prueba local' };
    if (id === 'solicitud-dep') return { value: 'DEP-FIN' };
    if (id === 'solicitud-prov') return { value: 'Tech Solutions Global' };
    return { innerHTML: '', appendChild() {}, classList: { add() {} } };
  },
  createElement() {
    return { className: '', innerHTML: '', appendChild() {}, classList: { add() {} }, remove() {} };
  }
};

require('../public/config.js');
require('../public/auth.js');
require('../public/api.js');
require('../public/app.js');

let passed = 0;
let total = 0;

async function itAsync(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ [FAIL] ${desc}: ${e.message}`);
  }
}

async function runFase8Tests() {
  console.log('\n===============================================================');
  console.log('🧪 VERIFICACIÓN RIGUROSA: FASE 8 (BORRADORES Y PROVEEDORES)');
  console.log('===============================================================\n');

  // Test 1: Guardado de borrador con persistencia en localStorage
  await itAsync('Debe guardar borrador y persistirlo en localStorage (AURA_DRAFTS)', async () => {
    window.state.currentRole = 'solicitante';
    window.state.nuevaSolicitudForm = {
      descripcion: 'Borrador test',
      departamento: 'DEP-FIN',
      proveedor: 'Tech Solutions Global',
      items: [{ nombre: 'Monitor 4K', cantidad: 2, precio: 300, subtotal: 600 }]
    };

    window.guardarBorrador();

    const stored = JSON.parse(localStorage.getItem('AURA_DRAFTS'));
    assert(Array.isArray(stored));
    assert(stored.length > 0);
    assert.strictEqual(stored[0].estado, 'borrador');
    assert.strictEqual(stored[0].total, 600);
    assert.strictEqual(stored[0].departamento, 'DEP-FIN');
  });

  // Test 2: Conversión y envío de borrador a AWS Step Functions (HTTP 202)
  await itAsync('Enviar borrador a firma debe despachar POST /api/solicitudes y migrar a en_revision', async () => {
    const borradorId = 'SC-TEST-DRAFT';
    window.state.solicitudes.unshift({
      id: borradorId,
      descripcion: 'Borrador por promover',
      departamento: 'DEP-TI',
      proveedor: 'Papelería y Suministros S.A.',
      total: 120,
      estado: 'borrador',
      items: [{ nombre: 'Resmas', cantidad: 10, precio: 12, subtotal: 120 }]
    });

    let apiLlamada = false;
    let datosEnviados = null;
    window.apiService.createSolicitud = async (payload) => {
      apiLlamada = true;
      datosEnviados = payload;
      return {
        success: true,
        requestId: 'REQ-PROMOTE-99',
        executionArn: 'arn:aws:states:us-east-2:1111:execution:draft-promote'
      };
    };

    await window.enviarBorradorAFirma(borradorId);

    assert.strictEqual(apiLlamada, true);
    assert.strictEqual(datosEnviados.monto, 120);
    assert.strictEqual(datosEnviados.departamento, 'DEP-TI');

    const actualizado = window.state.solicitudes.find(s => s.id === 'REQ-PROMOTE-99');
    assert(actualizado, 'El elemento debe haber actualizado su id al requestId oficial');
    assert.strictEqual(actualizado.estado, 'en_revision');
    assert.strictEqual(actualizado.executionArn, 'arn:aws:states:us-east-2:1111:execution:draft-promote');
  });

  console.log('\n===============================================================');
  console.log(`📊 TOTAL PRUEBAS FASE 8: ${passed}/${total} exitosas.`);
  console.log('===============================================================\n');

  if (passed !== total) process.exit(1);
}

runFase8Tests();
