/**
 * Test Suite Riguroso: Fase 7 (Dictamen Humano y Decisiones RBAC)
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
    return {
      className: '',
      innerHTML: '',
      appendChild() {},
      classList: { add() {} },
      remove() {}
    };
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

async function runFase7Tests() {
  console.log('\n===============================================================');
  console.log('🧪 VERIFICACIÓN RIGUROSA: FASE 7 (DICTAMEN Y SEGURIDAD RBAC)');
  console.log('===============================================================\n');

  // Test 1: Solicitante no puede dictaminar (Bloqueo RBAC)
  await itAsync('RBAC: Un solicitante NO debe poder aprobar o rechazar solicitudes', async () => {
    window.state.currentRole = 'solicitante';
    window.state.solicitudes = [
      { id: 'REQ-DICT-1', estado: 'en_revision', comentariosGerente: '' }
    ];

    await window.dictaminarSolicitud('REQ-DICT-1', 'aprobado');

    const item = window.state.solicitudes.find(s => s.id === 'REQ-DICT-1');
    assert.strictEqual(item.estado, 'en_revision', 'El estado no debió cambiar porque el rol es solicitante');
  });

  // Test 2: Gerente puede dictaminar favorablemente y llamar contrato de API
  await itAsync('Gerente puede dictaminar APPROVED y emitir payload correspondiente', async () => {
    window.state.currentRole = 'gerente';
    window.state.solicitudes = [
      { id: 'REQ-DICT-2', estado: 'en_revision', comentariosGerente: '' }
    ];

    let apiLlamada = false;
    let payloadDictamen = null;
    window.apiService.dictaminarSolicitud = async (id, payload) => {
      apiLlamada = true;
      payloadDictamen = payload;
      return { success: true, message: 'Dictamen registrado en AWS' };
    };

    await window.dictaminarSolicitud('REQ-DICT-2', 'aprobado');

    assert.strictEqual(apiLlamada, true);
    assert.strictEqual(payloadDictamen.decision, 'APPROVED');
    assert(payloadDictamen.aprobador.includes('Herberth'));
    
    const item = window.state.solicitudes.find(s => s.id === 'REQ-DICT-2');
    assert.strictEqual(item.estado, 'aprobado');
    assert(item.comentariosGerente.length > 0);
  });

  // Test 3: Gerente puede dictaminar REJECTED
  await itAsync('Gerente puede dictaminar REJECTED correctamente', async () => {
    window.state.currentRole = 'gerente';
    window.state.solicitudes = [
      { id: 'REQ-DICT-3', estado: 'en_revision', comentariosGerente: '' }
    ];

    let payloadDictamen = null;
    window.apiService.dictaminarSolicitud = async (id, payload) => {
      payloadDictamen = payload;
      return { success: true, message: 'Rechazo registrado' };
    };

    await window.dictaminarSolicitud('REQ-DICT-3', 'rechazado');

    assert.strictEqual(payloadDictamen.decision, 'REJECTED');
    const item = window.state.solicitudes.find(s => s.id === 'REQ-DICT-3');
    assert.strictEqual(item.estado, 'rechazado');
  });

  console.log('\n===============================================================');
  console.log(`📊 TOTAL PRUEBAS FASE 7: ${passed}/${total} exitosas.`);
  console.log('===============================================================\n');

  if (passed !== total) process.exit(1);
}

runFase7Tests();
