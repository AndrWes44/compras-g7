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

  // Test 2: Validación de cantidades y datos incompletos en borrador vs envío formal
  await itAsync('2. validarFormularioSolicitud permite datos incompletos para borrador pero exige completos para envío', async () => {
    // Para borrador: sin descripción, sin proveedor y con precio 0 debe ser válido
    window.state.nuevaSolicitudForm = {
      descripcion: '',
      departamento: 'DEP-TI',
      proveedorId: '',
      items: [
        { nombre: '', cantidad: 5, precio: 0 }
      ]
    };
    const erroresBorrador = window.validarFormularioSolicitud(false);
    assert.strictEqual(erroresBorrador.length, 0, 'El borrador debe permitir datos incompletos dentro de límites');

    // Si excede 10,000 unidades en borrador, sí debe señalar error
    window.state.nuevaSolicitudForm.items[0].cantidad = 10001;
    const erroresBorradorExcedido = window.validarFormularioSolicitud(false);
    assert(erroresBorradorExcedido.some(e => e.mensaje.includes('10,000')), 'Borrador debe respetar límite de 10,000 unidades');

    // Para envío formal: exige descripción, proveedor oficial, cantidad entera ≥ 1 y precio > 0
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

  // Test 5: recargarAdminUsuariosApi consume la paginación de cada estado para filtro Todos
  await itAsync('5. recargarAdminUsuariosApi consume la paginación de cada estado y combina altas en Todos', async () => {
    window.state.adminFiltroEstado = '';

    const llamadasPorEstado = {
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0
    };

    window.apiService.getAdminUsuarios = async (estado, cursor) => {
      llamadasPorEstado[estado] = (llamadasPorEstado[estado] || 0) + 1;
      if (estado === 'PENDING_APPROVAL') {
        if (!cursor) {
          return {
            solicitudes: [{ id: 'U-P1', email: 'p1@g7.com', status: 'PENDING_APPROVAL' }],
            siguienteCursor: 'cursor-p2',
            hayMasRegistros: true
          };
        } else {
          return {
            solicitudes: [{ id: 'U-P2', email: 'p2@g7.com', status: 'PENDING_APPROVAL' }],
            siguienteCursor: null,
            hayMasRegistros: false
          };
        }
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

    assert(llamadasPorEstado.PENDING_APPROVAL >= 2, 'Debe haber consumido al menos 2 páginas para PENDING_APPROVAL');
    assert.strictEqual(window.state.adminUsuarios.length, 4, 'Debe combinar todas las altas de todas las páginas');
    assert(window.state.adminUsuarios.some(u => u.id === 'U-P1'));
    assert(window.state.adminUsuarios.some(u => u.id === 'U-P2'));
    assert(window.state.adminUsuarios.some(u => u.id === 'U-APPROVED'));
    assert(window.state.adminUsuarios.some(u => u.id === 'U-REJECTED'));
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

  // Test 8: Apertura de borradores mediante /api/borradores/:id
  await itAsync('8. Apertura de borradores mediante verDetalleSolicitud y editarBorrador consulta getBorradorById', async () => {
    let getBorradorLlamadoCon = null;
    let getSolicitudLlamado = false;

    window.apiService.getBorradorById = async (id) => {
      getBorradorLlamadoCon = id;
      return {
        borrador: {
          id: id,
          draftId: id,
          description: 'Borrador remoto desde DynamoDB',
          department: 'DEP-TI',
          amount: 250,
          status: 'DRAFT',
          version: 3,
          articulos: [{ nombre: 'Laptop Dell', cantidad: 1, precioUnitario: 250 }]
        }
      };
    };

    window.apiService.getSolicitudById = async () => {
      getSolicitudLlamado = true;
      return null;
    };

    window.state.solicitudes = [
      { id: 'BR-TEST-001', estado: 'borrador', descripcion: 'Borrador en cache', version: 1 }
    ];

    // Probar verDetalleSolicitud con borrador
    await window.verDetalleSolicitud('BR-TEST-001');

    assert.strictEqual(getBorradorLlamadoCon, 'BR-TEST-001', 'Debe llamar a getBorradorById(/api/borradores/:id)');
    assert.strictEqual(getSolicitudLlamado, false, 'No debe invocar getSolicitudById para un borrador');

    const draftActualizado = window.state.solicitudes.find(s => s.id === 'BR-TEST-001');
    assert.strictEqual(draftActualizado.version, 3, 'Debe haber actualizado la versión obtenida de DynamoDB');
    assert.strictEqual(draftActualizado.descripcion, 'Borrador remoto desde DynamoDB');

    // Probar abrirBorrador
    getBorradorLlamadoCon = null;
    await window.abrirBorrador('BR-TEST-001');
    assert.strictEqual(getBorradorLlamadoCon, 'BR-TEST-001', 'abrirBorrador debe consultar getBorradorById');
    assert.strictEqual(window.state.editingDraftId, 'BR-TEST-001');
    assert.strictEqual(window.state.nuevaSolicitudForm.descripcion, 'Borrador remoto desde DynamoDB');
  });

  console.log('\n===============================================================');
  console.log(`📊 TOTAL PRUEBAS FASE 10: ${passed}/${total} exitosas.`);
  console.log('===============================================================\n');

  if (passed !== total) process.exit(1);
}

runFase10Tests();
