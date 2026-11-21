/**
 * Test Suite Riguroso: Fase 6 (Detalle de Solicitud GET /api/solicitudes/:id y Resiliencia 404)
 */

const assert = require('assert');

// Mock browser
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

async function runFase6Tests() {
  console.log('\n===============================================================');
  console.log('🧪 VERIFICACIÓN RIGUROSA: FASE 6 (DETALLE GET /:id Y 404)');
  console.log('===============================================================\n');

  // Test 1: Consulta exitosa de solicitud existente
  await itAsync('Debe consultar y fusionar detalle remoto de DynamoDB correctamente', async () => {
    window.state.currentRole = 'solicitante';
    window.state.solicitudes = [
      { id: 'REQ-100', descripcion: 'Datos previos en caché', total: 50, estado: 'en_revision' }
    ];

    window.apiService.getSolicitudById = async (id) => {
      assert.strictEqual(id, 'REQ-100');
      return {
        success: true,
        solicitud: {
          requestId: 'REQ-100',
          amount: 1250,
          applicant: 'carlos@empresa.com',
          department: 'DEP-TI',
          description: 'Servidores actualizados',
          status: 'APPROVED',
          executionArn: 'arn:aws:states:us-east-2:1111:execution:abc'
        }
      };
    };

    await window.verDetalleSolicitud('REQ-100');

    const item = window.state.solicitudes.find(s => s.id === 'REQ-100');
    assert.strictEqual(item.total, 1250);
    assert.strictEqual(item.descripcion, 'Servidores actualizados');
    assert.strictEqual(item.estado, 'aprobado');
    assert.strictEqual(item.esAltoMonto, true);
    assert.strictEqual(item.executionArn, 'arn:aws:states:us-east-2:1111:execution:abc');
    assert.strictEqual(window.state.currentView, 'detalle_solicitud');
  });

  // Test 2: Manejo de error 404 (No encontrada)
  await itAsync('Debe manejar 404 sin romper el estado ni lanzar excepciones no controladas', async () => {
    window.apiService.getSolicitudById = async (id) => {
      const err = new Error('Solicitud no encontrada en DynamoDB');
      err.status = 404;
      throw err;
    };

    await window.verDetalleSolicitud('REQ-INEXISTENTE-999');
    assert.strictEqual(window.state.currentView, 'detalle_solicitud');
    // Debe marcar como no encontrado si no existe en local
    assert.strictEqual(window.state.selectedSolicitudId, '__NOT_FOUND__');
  });

  console.log('\n===============================================================');
  console.log(`📊 TOTAL PRUEBAS FASE 6: ${passed}/${total} exitosas.`);
  console.log('===============================================================\n');

  if (passed !== total) process.exit(1);
}

runFase6Tests();
