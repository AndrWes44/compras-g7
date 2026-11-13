/**
 * Test Suite Riguroso: Fase 8 (Borradores en AWS DynamoDB y Gestión de Proveedores)
 * Valida la estricta integración contra el contrato de Backend c4d9ee1:
 * - Sin almacenamiento en AURA_DRAFTS ni respaldo local
 * - Sin fallback a createSolicitud al fallar el envío de borrador
 * - Conservación de formulario y versiones en DynamoDB
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
    if (id === 'solicitud-desc') return { value: 'Borrador test en DynamoDB' };
    if (id === 'solicitud-dep') return { value: 'DEP-FIN' };
    if (id === 'solicitud-prov') return { value: 'PRV-001' };
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
  console.log('🧪 VERIFICACIÓN RIGUROSA: FASE 8 (BORRADORES EN DYNAMODB Y PROVEEDORES)');
  console.log('===============================================================\n');

  // Test 1: Guardado de borrador vía API en DynamoDB sin escribir en AURA_DRAFTS
  await itAsync('Debe persistir borrador en DynamoDB vía API y NO escribir en AURA_DRAFTS', async () => {
    window.state.currentRole = 'solicitante';
    window.state.nuevaSolicitudForm = {
      descripcion: 'Borrador test en DynamoDB',
      departamento: 'DEP-FIN',
      proveedor: 'Tech Solutions Global',
      proveedorId: 'PRV-001',
      items: [{ nombre: 'Monitor 4K', cantidad: 2, precio: 300, subtotal: 600 }]
    };

    let apiLlamada = false;
    let payloadRecibido = null;
    window.apiService.createBorrador = async (payload) => {
      apiLlamada = true;
      payloadRecibido = payload;
      return {
        success: true,
        borrador: {
          id: 'DRAFT-DYNAMO-101',
          description: payload.description,
          amount: payload.amount,
          version: 1
        }
      };
    };

    window.apiService.getBorradores = async () => {
      return {
        success: true,
        borradores: [
          {
            id: 'DRAFT-DYNAMO-101',
            description: 'Borrador test en DynamoDB',
            amount: 600,
            department: 'DEP-FIN',
            proveedorId: 'PRV-001',
            version: 1
          }
        ]
      };
    };

    await window.guardarBorrador();

    assert.strictEqual(apiLlamada, true, 'createBorrador debió ser invocado');
    assert.strictEqual(payloadRecibido.amount, 600);
    assert.strictEqual(payloadRecibido.proveedorId, 'PRV-001');
    assert.strictEqual(payloadRecibido.department, 'DEP-FIN');

    // Comprobación fundamental: AURA_DRAFTS NO debe existir en localStorage
    const localDrafts = localStorage.getItem('AURA_DRAFTS');
    assert.strictEqual(localDrafts, null, 'No debe escribir en AURA_DRAFTS de localStorage');
  });

  // Test 2: Si guardar borrador falla en AWS, el formulario NO se borra y reporta error
  await itAsync('Si AWS falla al guardar borrador, el formulario se conserva intacto y no crea registro ficticio', async () => {
    window.state.currentRole = 'solicitante';
    window.state.nuevaSolicitudForm = {
      descripcion: 'Borrador que fallará',
      departamento: 'DEP-TI',
      proveedorId: 'PRV-002',
      items: [{ nombre: 'Servidor', cantidad: 1, precio: 5000, subtotal: 5000 }]
    };

    window.apiService.createBorrador = async () => {
      throw new Error('DynamoDB ConditionalCheckFailedException');
    };

    await window.guardarBorrador();

    // El formulario debe permanecer poblado para no perder datos del usuario
    assert.strictEqual(window.state.nuevaSolicitudForm.descripcion, 'Borrador que fallará');
    assert.strictEqual(window.state.nuevaSolicitudForm.items.length, 1);
    assert.strictEqual(localStorage.getItem('AURA_DRAFTS'), null);
  });

  // Test 3: Enviar borrador a firma NO debe llamar a createSolicitud ante fallos (evitar doble compra)
  await itAsync('Al fallar enviarBorradorAFirma, NUNCA debe invocar createSolicitud como fallback', async () => {
    const borradorId = 'DRAFT-RETRY-001';
    window.state.solicitudes = [
      {
        id: borradorId,
        descripcion: 'Borrador único',
        departamento: 'DEP-TI',
        total: 120,
        estado: 'borrador',
        version: 1,
        submitVersion: 1,
        items: [{ nombre: 'Partida', cantidad: 1, precio: 120, subtotal: 120 }]
      }
    ];

    let createSolicitudInvocada = false;
    window.apiService.createSolicitud = async () => {
      createSolicitudInvocada = true;
      return { success: true, requestId: 'REQ-DUPLICADA-ERRONEA' };
    };

    window.apiService.enviarBorrador = async (id, version) => {
      throw new Error('Network timeout in AWS Step Functions');
    };

    await window.enviarBorradorAFirma(borradorId);

    // Verificación estricta: createSolicitud NO debió ejecutarse
    assert.strictEqual(createSolicitudInvocada, false, 'createSolicitud NUNCA debe ser llamada si enviarBorrador falla');

    // El borrador debe conservar su estado para permitir reintento de la misma operación
    const draft = window.state.solicitudes.find(s => s.id === borradorId);
    assert(draft, 'El borrador debe conservarse en el estado con su ID original');
    assert.strictEqual(draft.estado, 'borrador');
  });

  // Test 4: Envío exitoso de borrador consume POST /api/borradores/:id/enviar y pasa a en_revision
  await itAsync('Envío exitoso de borrador llama a enviarBorrador con id y versión, y actualiza a en_revision', async () => {
    const borradorId = 'DRAFT-SUCCESS-002';
    window.state.solicitudes = [
      {
        id: borradorId,
        descripcion: 'Borrador listo',
        departamento: 'DEP-TI',
        total: 250,
        estado: 'borrador',
        version: 2,
        submitVersion: 2,
        items: [{ nombre: 'Mouse inalámbrico', cantidad: 10, precio: 25, subtotal: 250 }]
      }
    ];

    let apiLlamada = false;
    let versionEnviada = null;
    window.apiService.enviarBorrador = async (id, version) => {
      apiLlamada = true;
      versionEnviada = version;
      return {
        success: true,
        requestId: 'REQ-APPROVED-202',
        executionArn: 'arn:aws:states:us-east-2:1111:execution:draft-promote'
      };
    };

    await window.enviarBorradorAFirma(borradorId);

    assert.strictEqual(apiLlamada, true);
    assert.strictEqual(versionEnviada, 2);

    const actualizado = window.state.solicitudes.find(s => s.id === 'REQ-APPROVED-202');
    assert(actualizado, 'El elemento debe haber actualizado su id al requestId oficial');
    assert.strictEqual(actualizado.estado, 'en_revision');
  });

  console.log('\n===============================================================');
  console.log(`📊 TOTAL PRUEBAS FASE 8: ${passed}/${total} exitosas.`);
  console.log('===============================================================\n');

  if (passed !== total) process.exit(1);
}

runFase8Tests();
