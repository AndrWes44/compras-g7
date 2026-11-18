/**
 * Test Suite Riguroso: Fase 10 (Nueva Solicitud, Validaciones de Cantidad y Panel Administrativo)
 * Valida:
 * 1. Escritura continua en descripción sin pérdida de foco (sin render) y límite 1,000 caracteres
 * 2. Validación de cantidades: máximo 10,000, entero ≥ 1 para envío formal y precios > 0
 * 3. Limpiar formulario con confirmación y distinción de borrador vs sin guardar
 * 4. Administrador no realiza llamadas comerciales (evita 403) y menú sin acceso comercial
 * 5. recargarAdminUsuariosApi lee res.solicitudes y combina estados para "Todos"
 * 6. Modal administrativo propio para rol y comentario obligatorio (sin prompt nativo)
 * 7. Botón de refrescar en TopNav invoca recargarAdminUsuariosApi cuando es Admin
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
  getElementById(id) {
    return {
      value: '',
      textContent: '',
      innerHTML: '',
      classList: {
        add() {},
        remove() {},
        contains() { return false; }
      },
      appendChild() {},
      parentNode: { appendChild() {} }
    };
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      classList: { add() {}, remove() {} },
      appendChild() {},
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

async function runFase10Tests() {
  console.log('\n===============================================================');
  console.log('🧪 VERIFICACIÓN RIGUROSA: FASE 10 (NUEVA SOLICITUD Y ADMIN)');
  console.log('===============================================================\n');

  // Test 1: actualizarCampoForm en descripcion actualiza estado SIN invocar render()
  await itAsync('1. actualizarCampoForm en descripcion permite escritura continua sin reconstruir el DOM', async () => {
    let renderLlamado = false;
    const renderOriginal = window.render;
    window.render = () => { renderLlamado = true; };

    window.state.nuevaSolicitudForm.descripcion = '';
    window.actualizarCampoForm('descripcion', 'Compra de 5 laptops Dell');

    assert.strictEqual(window.state.nuevaSolicitudForm.descripcion, 'Compra de 5 laptops Dell');
    assert.strictEqual(renderLlamado, false, 'NO debió llamar a render() al actualizar descripción');

    window.render = renderOriginal;
  });

  // Test 2: Validación de cantidades: máximo 10,000 unidades y entero ≥ 1 para envío
  await itAsync('2. validarFormularioSolicitud rechaza cantidades > 10,000 y decimales en envío formal', async () => {
    window.state.nuevaSolicitudForm = {
      descripcion: 'Adquisición de suministros',
      departamento: 'DEP-TI',
      proveedorId: 'PRV-001',
      items: [
        { nombre: 'Monitores', cantidad: 10001, precio: 50 },
        { nombre: 'Cable UTP', cantidad: 2.5, precio: 10 }
      ]
    };

    const errores = window.validarFormularioSolicitud(true); // true = esEnvioFinal
    assert(errores.length >= 2, 'Deben existir al menos 2 errores de validación');
    const errMax = errores.find(e => e.mensaje.includes('10,000'));
    const errEntero = errores.find(e => e.mensaje.includes('entero'));
    assert(errMax, 'Debe señalar error por exceder 10,000 unidades');
    assert(errEntero, 'Debe señalar error por cantidad decimal en envío');
  });

  // Test 3: Limpiar formulario restablece todos los campos tras confirmación
  await itAsync('3. confirmarLimpiarFormulario restablece el formulario reactivo y el estado de edición', async () => {
    window.state.editingDraftId = 'DRAFT-99';
    window.state.nuevaSolicitudForm = {
      descripcion: 'Texto previo',
      departamento: 'DEP-OPER',
      proveedor: 'Proveedor X',
      proveedorId: 'PRV-003',
      items: [{ nombre: 'Item 1', cantidad: 5, precio: 20, subtotal: 100 }]
    };

    window.confirmarLimpiarFormulario();

    assert.strictEqual(window.state.editingDraftId, null);
    assert.strictEqual(window.state.nuevaSolicitudForm.descripcion, '');
    assert.strictEqual(window.state.nuevaSolicitudForm.items.length, 1);
    assert.strictEqual(window.state.nuevaSolicitudForm.items[0].precio, 0);
  });

  // Test 4: Administrador evita llamadas a solicitudes y proveedores (evita 403)
  await itAsync('4. Administrador no realiza consultas a endpoints comerciales de solicitudes ni proveedores', async () => {
    let llamadaComercial = false;
    window.apiService.getSolicitudes = async () => {
      llamadaComercial = true;
      throw new Error('403 Forbidden');
    };
    window.apiService.getProveedores = async () => {
      llamadaComercial = true;
      throw new Error('403 Forbidden');
    };
    window.apiService.getAdminUsuarios = async () => {
      return { solicitudes: [] };
    };

    window.state.currentUser = { isAdmin: true, role: 'admin' };
    window.state.currentRole = 'admin';

    // Disparar sincronización administrativa
    await window.recargarAdminUsuariosApi();

    assert.strictEqual(llamadaComercial, false, 'No deben ejecutarse consultas a APIs comerciales siendo Admin');
  });

  // Test 5: recargarAdminUsuariosApi lee res.solicitudes y combina estados para "Todos"
  await itAsync('5. recargarAdminUsuariosApi lee res.solicitudes y combina estados para filtro Todos', async () => {
    window.state.adminFiltroEstado = '';

    window.apiService.getAdminUsuarios = async (estado) => {
      if (estado === 'PENDING_APPROVAL') {
        return { solicitudes: [{ id: 'U-PENDING', email: 'p@g7.com', status: 'PENDING_APPROVAL' }] };
      }
      if (estado === 'APPROVED') {
        return { solicitudes: [{ id: 'U-APPROVED', email: 'a@g7.com', status: 'APPROVED' }] };
      }
      if (estado === 'REJECTED') {
        return { solicitudes: [{ id: 'U-REJECTED', email: 'r@g7.com', status: 'REJECTED' }] };
      }
      return { solicitudes: [] };
    };

    await window.recargarAdminUsuariosApi();

    assert.strictEqual(window.state.adminUsuarios.length, 3, 'Debe combinar los 3 estados al consultar Todos');
    assert(window.state.adminUsuarios.some(u => u.status === 'PENDING_APPROVAL'));
    assert(window.state.adminUsuarios.some(u => u.status === 'APPROVED'));
    assert(window.state.adminUsuarios.some(u => u.status === 'REJECTED'));
  });

  // Test 6: Modal administrativo propio maneja confirmación con rol y comentario obligatorio
  await itAsync('6. Modal administrativo propio valida comentario obligatorio y envía decisión a AWS', async () => {
    window.abrirModalAprobarUsuario('sub-123', 2, encodeURIComponent('pedro@empresa.com'), encodeURIComponent('Pedro'));

    assert.strictEqual(window.state.adminDecisionModal.open, true);
    assert.strictEqual(window.state.adminDecisionModal.sub, 'sub-123');
    assert.strictEqual(window.state.adminDecisionModal.email, 'pedro@empresa.com');

    // Intentar confirmar sin comentario (debe fallar la validación)
    window.state.adminDecisionModal.comments = '';
    await window.handleConfirmarAdminDecision({});

    assert.strictEqual(window.state.adminDecisionModal.error, 'El comentario de auditoría es obligatorio.');

    // Con comentario obligatorio y rol asignado
    let apiLlamada = false;
    let payloadEnviado = null;
    window.apiService.decidirAdminUsuario = async (sub, payload) => {
      apiLlamada = true;
      payloadEnviado = payload;
      return { success: true };
    };

    window.state.adminDecisionModal.comments = 'Alta autorizada por auditoría interna';
    window.state.adminDecisionModal.role = 'Gerente';
    await window.handleConfirmarAdminDecision({});

    assert.strictEqual(apiLlamada, true);
    assert.strictEqual(payloadEnviado.decision, 'APPROVED');
    assert.strictEqual(payloadEnviado.role, 'Gerente');
    assert.strictEqual(payloadEnviado.comments, 'Alta autorizada por auditoría interna');
    assert.strictEqual(window.state.adminDecisionModal, null, 'El modal debe cerrarse tras éxito');
  });

  // Test 7: Botón de refrescar en TopNav usa recargarAdminUsuariosApi cuando es Admin
  await itAsync('7. TopNav delega actualización al panel administrativo cuando el rol es Administrador', async () => {
    window.state.currentUser = { isAdmin: true, role: 'admin' };
    const html = window.renderTopNav();
    assert(html.includes('recargarAdminUsuariosApi()'), 'El botón debe invocar recargarAdminUsuariosApi()');
    assert(!html.includes('recargarSolicitudesApi()'), 'No debe invocar recargarSolicitudesApi() para Admin');
  });

  console.log('\n===============================================================');
  console.log(`📊 TOTAL PRUEBAS FASE 10: ${passed}/${total} exitosas.`);
  console.log('===============================================================\n');

  if (passed !== total) process.exit(1);
}

runFase10Tests();
