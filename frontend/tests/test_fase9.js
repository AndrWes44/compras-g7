/**
 * Test Suite Riguroso: Fase 9 (Control Global de Errores HTTP 401/403/Red y Modal de Feedback)
 */

const assert = require('assert');

global.window = {
  render() {}
};
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
  getElementById() {
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

async function runFase9Tests() {
  console.log('\n===============================================================');
  console.log('🧪 VERIFICACIÓN RIGUROSA: FASE 9 (ERRORES 401, 403 Y MODAL)');
  console.log('===============================================================\n');

  // Test 1: Interceptor HTTP 401 dispara modal de expiración de sesión
  await itAsync('Interceptor HTTP 401 activa modal global con acción de logout', async () => {
    const originalMostrar = window.mostrarErrorModal;
    let modalRecibido = null;
    window.mostrarErrorModal = (data) => {
      modalRecibido = data;
    };

    // Simular fetch que retorna 401 Unauthorized
    global.fetch = async () => ({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Token expirado' })
    });

    try {
      await window.apiService.getSolicitudes();
    } catch {
      // Se espera que falle la promesa
    }

    assert(modalRecibido !== null, 'Debe haber disparado el modal');
    assert.strictEqual(modalRecibido.code, 401);
    assert(modalRecibido.title.includes('Sesión'));
    assert.strictEqual(modalRecibido.onAction, 'handleLogout()');

    window.mostrarErrorModal = originalMostrar;
  });

  // Test 2: Interceptor HTTP 403 dispara modal de permisos insuficientes
  await itAsync('Interceptor HTTP 403 activa modal de acceso no autorizado', async () => {
    const originalMostrar = window.mostrarErrorModal;
    let modalRecibido = null;
    window.mostrarErrorModal = (data) => {
      modalRecibido = data;
    };

    global.fetch = async () => ({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Forbidden' })
    });

    try {
      await window.apiService.getSolicitudes();
    } catch {
      // Se espera que falle
    }

    assert(modalRecibido !== null);
    assert.strictEqual(modalRecibido.code, 403);
    assert(modalRecibido.title.includes('No Autorizado'));
    
    // Restaurar función original
    window.mostrarErrorModal = originalMostrar;
  });

  // Test 3: Apertura y cierre del modal global en estado
  await itAsync('mostrarErrorModal y cerrarErrorModal gestionan state.globalErrorModal', async () => {
    window.mostrarErrorModal({
      title: 'Fallo Temporal',
      message: 'AWS Timeout',
      code: 504
    });

    assert(window.state.globalErrorModal !== null);
    assert.strictEqual(window.state.globalErrorModal.code, 504);
    assert.strictEqual(window.state.globalErrorModal.title, 'Fallo Temporal');

    window.cerrarErrorModal();
    assert.strictEqual(window.state.globalErrorModal, null);
  });

  console.log('\n===============================================================');
  console.log(`📊 TOTAL PRUEBAS FASE 9: ${passed}/${total} exitosas.`);
  console.log('===============================================================\n');

  if (passed !== total) process.exit(1);
}

runFase9Tests();
