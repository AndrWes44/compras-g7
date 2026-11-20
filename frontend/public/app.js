/**
 * AURA Compras - Aplicación de Gestión y Aprobaciones Corporativas
 * Integración estricta con Backend Express en AWS API Gateway y DynamoDB (Commit c4d9ee1).
 * Implementa control de acceso RBAC oficial (Cognito), ciclo de vida de borradores privados,
 * anulación de solicitudes, verificación asíncrona de Step Functions (202 / PERSISTED),
 * y gestión de proveedores fiscales/bancarios restringida a Compras.
 */

const state = window.state = {
  currentRole: null, // 'solicitante' | 'gerente' | 'director' | 'compras' | 'admin'
  currentUser: null, // Objeto de sesión oficial autenticado en Amazon Cognito
  currentView: 'login', // 'login' | 'dashboard' | 'solicitudes' | 'nueva_solicitud' | 'aprobaciones' | 'proveedores' | 'proveedor_nuevo' | 'proveedor_editar' | 'detalle_solicitud' | 'recuperar_password' | 'tokens' | 'admin_usuarios'
  activeFilterCategoria: 'Todos',
  loginCreds: { email: '', password: '' },

  // Detalle activo
  selectedSolicitudId: null,
  selectedProveedorId: null,
  editingDraftId: null,

  // Proveedor temporal para el modal de eliminación
  proveedorToDelete: null,

  // Modal global de error o alerta de red
  globalErrorModal: null,

  // Listas oficiales sincronizadas con AWS (DynamoDB)
  // Inicializadas estrictamente vacías: sin datos ficticios ni mocks locales
  solicitudes: [],
  proveedores: [],
  adminUsuarios: [],
  borradoresRemotos: [],
  aprobaciones: [],

  // Operaciones en vuelo para evitar duplicidad o doble clic
  inFlightOperations: new Set(),

  // Estado reactivo de la bandeja de aprobaciones oficiales (GET /api/aprobaciones)
  aprobacionesState: {
    isConnected: null,
    isLoading: false,
    cursor: null,
    hayMasRegistros: false,
    totalApi: 0
  },

  // Formulario reactivo para nueva solicitud o borrador
  nuevaSolicitudForm: {
    descripcion: '',
    departamento: 'DEP-TI',
    proveedor: '',
    proveedorId: '',
    items: [
      { nombre: '', cantidad: 1, precio: 0, subtotal: 0 }
    ]
  },

  // Estado reactivo de paginación e integración con API Express
  apiState: {
    isConnected: null,
    isLoading: false,
    cursor: null,
    hayMasRegistros: false,
    totalApi: 0
  },

  // Filtros administrativos y verificación
  adminFiltroEstado: '',
  pendingEmail: '',
  adminDecisionModal: null, // { open: boolean, decision: 'APPROVED' | 'REJECTED', sub, version, email, name, role, comments, error }
  formErrors: {},

  // Metadatos de roles dinámicos (sin credenciales simuladas ni contraseñas)
  users: {
    get solicitante() {
      return {
        name: (state.currentUser?.role === 'solicitante' && state.currentUser?.name) || 'Carlos Mendoza',
        roleTitle: 'Solicitante Departamental',
        initials: 'CM',
        badgeColor: 'bg-blue-600',
        email: state.currentUser?.email || 'solicitante@g7.com'
      };
    },
    get gerente() {
      return {
        name: (state.currentUser?.role === 'gerente' && state.currentUser?.name) || 'Ing. Herberth',
        roleTitle: 'Gerente Aprobador (hasta $1,000)',
        initials: 'IH',
        badgeColor: 'bg-emerald-600',
        email: state.currentUser?.email || 'gerente@g7.com'
      };
    },
    get director() {
      return {
        name: (state.currentUser?.role === 'director' && state.currentUser?.name) || 'Director General',
        roleTitle: 'Director Financiero & Aprobador Alto Monto (> $1,000)',
        initials: 'DG',
        badgeColor: 'bg-purple-600',
        email: state.currentUser?.email || 'director@g7.com'
      };
    },
    get compras() {
      return {
        name: (state.currentUser?.role === 'compras' && state.currentUser?.name) || 'Compras & Adquisiciones',
        roleTitle: 'Compras & Adquisiciones',
        initials: 'AM',
        badgeColor: 'bg-sky-600',
        email: state.currentUser?.email || 'compras@g7.com'
      };
    },
    get admin() {
      return {
        name: (state.currentUser?.name) || 'Administrador',
        roleTitle: 'Administrador de Cuentas',
        initials: 'AD',
        badgeColor: 'bg-purple-600',
        email: state.currentUser?.email || 'admin@g7.com'
      };
    }
  }
};

// ----------------- RENDER ENGINE -----------------
function render() {
  const root = document.getElementById('app');
  if (!root) return;

  const publicViews = ['login', 'registro', 'confirmar_codigo', 'espera_aprobacion', 'recuperar_password', 'tokens'];
  const hasAuth = (window.authService && typeof window.authService.isAuthenticated === 'function' && window.authService.isAuthenticated()) || state.currentUser || state.currentRole;

  // Si no está autenticado y no está en una vista pública, forzar login
  if (!hasAuth && !publicViews.includes(state.currentView)) {
    state.currentView = 'login';
  }

  // Renderizar vistas públicas o de autenticación sin sidebar
  if (state.currentView === 'login') {
    root.innerHTML = renderLogin() + renderModal();
    return;
  }
  if (state.currentView === 'registro') {
    root.innerHTML = renderRegistro() + renderModal();
    return;
  }
  if (state.currentView === 'confirmar_codigo') {
    root.innerHTML = renderConfirmarCodigo() + renderModal();
    return;
  }
  if (state.currentView === 'espera_aprobacion') {
    root.innerHTML = renderEsperaAprobacion() + renderModal();
    return;
  }
  if (state.currentView === 'recuperar_password') {
    root.innerHTML = renderRecuperarPassword() + renderModal();
    return;
  }
  if (state.currentView === 'tokens') {
    root.innerHTML = `
      <div class="min-h-screen bg-aura-canvas text-slate-100 flex flex-col p-6">
        ${renderTokensVisualGuide()}
        ${renderModal()}
      </div>
    `;
    return;
  }

  // App Layout estándar con Sidebar y TopNav
  root.innerHTML = `
    <div class="flex h-screen w-screen overflow-hidden bg-aura-canvas text-slate-100 font-sans">
      ${renderSidebar()}
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
        ${renderTopNav()}
        <main class="flex-1 overflow-y-auto p-8 relative">
          ${renderMainContent()}
        </main>
      </div>
      ${renderModal()}
    </div>
  `;
}

// ----------------- LOGIN & AUTH -----------------
function renderLogin() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4 relative">
      <div class="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-8 shadow-2xl relative z-10">
        <!-- Logo -->
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl shadow-lg shadow-blue-500/20">
            <i class="fa-solid fa-cube"></i>
          </div>
          <div>
            <h1 class="text-xl font-bold tracking-tight text-white">AURA Compras</h1>
            <p class="text-xs text-slate-400">Gestión & Aprobaciones Corporativas</p>
          </div>
        </div>

        <h2 class="text-lg font-semibold text-slate-200 mb-1">Iniciar Sesión</h2>
        <p class="text-xs text-slate-400 mb-6">Ingresa tus credenciales corporativas verificadas en Amazon Cognito</p>

        <!-- Formulario Oficial de Autenticación -->
        <form onsubmit="handleLoginFormSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">Correo Corporativo</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 text-sm">
                <i class="fa-regular fa-envelope"></i>
              </span>
              <input type="email" id="login-email" required placeholder="usuario@empresa.com" class="w-full pl-9 pr-3 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-xs font-medium text-slate-300">Contraseña</label>
              <button type="button" onclick="navigateTo('recuperar_password')" class="text-xs text-blue-400 hover:text-blue-300 transition-colors">¿Olvidaste tu contraseña?</button>
            </div>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 text-sm">
                <i class="fa-solid fa-lock"></i>
              </span>
              <input type="password" id="login-password" required placeholder="••••••••" class="w-full pl-9 pr-3 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
            </div>
          </div>

          <button type="submit" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2">
            <span>Ingresar al Sistema</span>
            <i class="fa-solid fa-arrow-right text-xs"></i>
          </button>
        </form>

        <div class="mt-4 text-center">
          <p class="text-xs text-slate-400">
            ¿No tienes cuenta institucional? 
            <button onclick="navigateTo('registro')" class="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2 transition-colors ml-1">
              Crear cuenta
            </button>
          </p>
        </div>
      </div>
    </div>
  `;
}

// ----------------- REGISTRO Y GESTIÓN DE ACCESO (AWS COGNITO) -----------------
function renderRegistro() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4 relative">
      <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-8 shadow-2xl relative z-10">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl shadow-lg">
            <i class="fa-solid fa-user-plus"></i>
          </div>
          <div>
            <h1 class="text-xl font-bold tracking-tight text-white">Crear Cuenta Institucional</h1>
            <p class="text-xs text-slate-400">Registro verificado con Amazon Cognito</p>
          </div>
        </div>

        <form onsubmit="handleRegistroSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1">Nombre Completo</label>
            <input type="text" id="reg-name" required placeholder="Ing. Carlos Mendoza" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1">Correo Electrónico Real</label>
            <input type="email" id="reg-email" required placeholder="tu-correo@empresa.com" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
            <p class="text-[10px] text-slate-400 mt-1">Recibirás un código de verificación en este correo.</p>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1">Contraseña</label>
            <input type="password" id="reg-password" required minlength="8" placeholder="Mínimo 8 car., Mayús, Núm, Símbolo" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>

          <button type="submit" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm shadow-lg transition-all flex items-center justify-center gap-2">
            <span>Registrar y Recibir Código</span>
            <i class="fa-solid fa-arrow-right text-xs"></i>
          </button>
        </form>

        <div class="mt-4 text-center">
          <p class="text-xs text-slate-400">
            ¿Ya tienes cuenta? 
            <button onclick="navigateTo('login')" class="text-blue-400 hover:text-blue-300 font-semibold underline ml-1">
              Iniciar Sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  `;
}

function renderConfirmarCodigo() {
  const email = state.pendingEmail || '';
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4 relative">
      <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-8 shadow-2xl relative z-10 text-center">
        <div class="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl">
          <i class="fa-regular fa-envelope-open"></i>
        </div>
        <h2 class="text-lg font-bold text-white mb-1">Verifica tu Correo Electrónico</h2>
        <p class="text-xs text-slate-400 mb-6">Hemos enviado un código numérico a <strong class="text-slate-200">${email}</strong></p>

        <form onsubmit="handleConfirmarCodigoSubmit(event)" class="space-y-4">
          <div>
            <input type="text" id="confirm-code" required maxlength="6" placeholder="000000" class="w-full tracking-widest text-center text-2xl font-mono py-3 bg-aura-input border border-aura-border rounded-lg text-slate-100 focus:outline-none focus:border-blue-500">
          </div>

          <button type="submit" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm shadow-lg transition-all">
            Confirmar y Enviar a Aprobación
          </button>
        </form>

        <div class="mt-4 flex items-center justify-between text-xs text-slate-400">
          <button onclick="handleReenviarCodigo('${email}')" class="text-blue-400 hover:text-blue-300 underline">
            Reenviar código
          </button>
          <button onclick="navigateTo('login')" class="text-slate-400 hover:text-slate-200">
            ← Volver al login
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderEsperaAprobacion() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4 relative">
      <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-8 shadow-2xl relative z-10 text-center space-y-4">
        <div class="w-14 h-14 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl">
          <i class="fa-solid fa-user-clock"></i>
        </div>
        <div>
          <h2 class="text-lg font-bold text-white mb-1">Cuenta en Espera de Aprobación</h2>
          <p class="text-xs text-slate-400">
            Tu correo ha sido verificado exitosamente. Por políticas de seguridad, un Administrador debe autorizar tu cuenta y asignarte tu rol correspondiente antes de poder acceder al sistema.
          </p>
        </div>
        <div class="p-3 bg-slate-900/60 rounded-xl border border-aura-border text-left text-xs text-slate-400 space-y-1">
          <div class="flex items-center gap-2 text-slate-300 font-semibold">
            <i class="fa-solid fa-shield-halved text-blue-400"></i>
            <span>Estado: PENDING_APPROVAL</span>
          </div>
          <p class="text-[11px]">Se te notificará por correo una vez que tu cuenta sea dictaminada.</p>
        </div>
        <button onclick="navigateTo('login')" class="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-xs transition-all">
          Volver a la Pantalla de Ingreso
        </button>
      </div>
    </div>
  `;
}

function renderAdminUsuarios() {
  const usuarios = state.adminUsuarios || [];
  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-bold text-white">Panel de Control: Aprobación y Roles de Usuarios</h3>
          <p class="text-xs text-slate-400">Altas y solicitudes de registro del flujo oficial de incorporación (DynamoDB Business). No incluye cuentas técnicas preexistentes de Cognito.</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="setAdminFiltroEstado('')" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.adminFiltroEstado === '' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}">Todos</button>
          <button onclick="setAdminFiltroEstado('PENDING_APPROVAL')" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.adminFiltroEstado === 'PENDING_APPROVAL' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}">Pendientes</button>
          <button onclick="setAdminFiltroEstado('APPROVED')" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.adminFiltroEstado === 'APPROVED' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}">Aprobados</button>
          <button onclick="setAdminFiltroEstado('REJECTED')" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.adminFiltroEstado === 'REJECTED' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}">Rechazados</button>
          <button onclick="recargarAdminUsuariosApi()" class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-aura-border">
            <i class="fa-solid fa-rotate"></i>
          </button>
        </div>
      </div>

      <div class="bg-aura-card border border-aura-border rounded-xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900/60 text-slate-400 border-b border-aura-border">
              <tr>
                <th class="py-3 px-4">Usuario</th>
                <th class="py-3 px-4">Correo</th>
                <th class="py-3 px-4">Estado</th>
                <th class="py-3 px-4">Rol Asignado</th>
                <th class="py-3 px-4">Versión</th>
                <th class="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-aura-border text-slate-200">
              ${usuarios.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-8 text-center text-slate-500 italic">
                    No se encontraron usuarios bajo este filtro.
                  </td>
                </tr>
              ` : usuarios.map(u => {
                const sub = u.sub || u.userId || u.id;
                const status = u.status || 'PENDING_APPROVAL';
                return `
                  <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="py-3.5 px-4 font-semibold text-white">${u.name || 'Sin nombre'}</td>
                    <td class="py-3.5 px-4 font-mono text-slate-300">${u.email}</td>
                    <td class="py-3.5 px-4">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                        status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        status === 'REJECTED' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                        'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }">
                        ${status}
                      </span>
                    </td>
                    <td class="py-3.5 px-4">
                      <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700">
                        ${canonicalizarRol(u.assignedRole || u.role)}
                      </span>
                    </td>
                    <td class="py-3.5 px-4 font-mono text-slate-500">v${u.version || 1}</td>
                    <td class="py-3.5 px-4 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <button onclick="abrirModalAprobarUsuario('${sub}', ${u.version || 1}, '${encodeURIComponent(u.email || '')}', '${encodeURIComponent(u.name || '')}')" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow">
                          ${status === 'APPROVED' ? 'Cambiar Rol' : 'Aprobar / Asignar Rol'}
                        </button>
                        ${status !== 'APPROVED' && status !== 'REJECTED' ? `
                          <button onclick="rechazarUsuarioAdmin('${sub}', ${u.version || 1}, '${encodeURIComponent(u.email || '')}', '${encodeURIComponent(u.name || '')}')" class="px-2.5 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white font-semibold text-[11px]">
                            Rechazar
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function canonicalizarRol(rol) {
  if (!rol) return 'Sin rol';
  const rLower = String(rol).toLowerCase();
  if (rLower === 'admin' || rLower === 'administrador' || rLower === 'administrador de cuentas') {
    return 'Administrador de Cuentas';
  }
  return rol;
}

function renderRecuperarPassword() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4">
      <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-8 shadow-2xl text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h2 class="text-lg font-bold text-white">Recuperación de Contraseña no Disponible</h2>
        <p class="text-xs text-slate-300">
          El autoservicio de recuperación de contraseña no se encuentra habilitado en el entorno actual de Amazon Cognito.
        </p>
        <div class="p-3.5 bg-slate-900/60 rounded-xl border border-aura-border text-left text-xs text-slate-400 space-y-1">
          <p class="text-[11px] text-slate-300">
            Para restablecer tu acceso o solicitar una nueva clave, por favor contacta directamente al <strong class="text-white">Administrador de Cuentas</strong> o al departamento de soporte técnico.
          </p>
        </div>
        <button onclick="navigateTo('login')" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow transition-all">
          ← Volver a la Pantalla de Ingreso
        </button>
      </div>
    </div>
  `;
}

// ----------------- SIDEBAR Y NAVEGACIÓN RBAC -----------------
function renderSidebar() {
  const isSolicitante = state.currentRole === 'solicitante';
  const isGerente = state.currentRole === 'gerente';
  const isDirector = state.currentRole === 'director';
  const isCompras = state.currentRole === 'compras';
  const isAdmin = Boolean(state.currentUser && state.currentUser.isAdmin);

  let navItems = [];
  if (isAdmin) {
    // Administrador: exclusivamente gestión de cuentas y altas (sin acceso comercial)
    navItems = [
      { id: 'admin_usuarios', label: 'Gestión de Cuentas', icon: 'fa-users-gear', allowed: true }
    ];
  } else if (isSolicitante) {
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Mis Solicitudes', icon: 'fa-table-columns', allowed: true }
    ];
  } else if (isGerente) {
    const pendientesGerente = state.aprobacionesState.totalApi || state.aprobaciones.length || state.solicitudes.filter(s => (s.status === 'PENDING' || s.estado === 'en_revision') && !s.esAltoMonto && !s.isLegacyOrReadOnly).length;
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Solicitudes', icon: 'fa-table-columns', allowed: true },
      { id: 'aprobaciones', label: 'Bandeja Dictamen (≤ $1k)', icon: 'fa-clipboard-check', allowed: true, badge: pendientesGerente || null },
      { id: 'proveedores', label: 'Catálogo Proveedores', icon: 'fa-building', allowed: true }
    ];
  } else if (isDirector) {
    const pendientesDirector = state.aprobacionesState.totalApi || state.aprobaciones.length || state.solicitudes.filter(s => (s.status === 'PENDING' || s.estado === 'en_revision') && s.esAltoMonto && !s.isLegacyOrReadOnly).length;
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Solicitudes', icon: 'fa-table-columns', allowed: true },
      { id: 'aprobaciones', label: 'Dictamen Alto Monto (> $1k)', icon: 'fa-clipboard-check', allowed: true, badge: pendientesDirector || null },
      { id: 'proveedores', label: 'Catálogo Proveedores', icon: 'fa-building', allowed: true }
    ];
  } else if (isCompras) {
    // Compras: supervisa compras y administra proveedores. NO dictamina ni ve borradores privados!
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Tablero Solicitudes', icon: 'fa-table-columns', allowed: true },
      { id: 'proveedores', label: 'Gestión de Proveedores', icon: 'fa-building', allowed: true }
    ];
  }

  const userName = (state.currentUser && state.currentUser.name) || 'Usuario';
  const roleTitle = (state.currentUser && state.currentUser.roleTitle) || state.currentRole || 'Usuario';
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'US';
  const badgeColor = isDirector ? 'bg-purple-600' : (isGerente ? 'bg-emerald-600' : (isCompras ? 'bg-sky-600' : 'bg-blue-600'));

  return `
    <aside class="w-64 bg-aura-sidebar border-r border-aura-border flex flex-col justify-between shrink-0 select-none">
      <div>
        <!-- Logo -->
        <div class="p-6 border-b border-aura-border flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <i class="fa-solid fa-cube text-lg"></i>
          </div>
          <div>
            <h2 class="font-bold text-sm text-white tracking-wide">AURA Compras</h2>
            <p class="text-[11px] text-slate-400">Gestión & Aprobaciones</p>
          </div>
        </div>

        <!-- Navigation Links -->
        <nav class="p-4 space-y-1">
          ${navItems.map(item => {
            const isActive = state.currentView === item.id;
            return `
              <button onclick="navigateTo('${item.id}')" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isActive 
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/40 font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }">
                <div class="flex items-center gap-3">
                  <i class="fa-solid ${item.icon} text-sm"></i>
                  <span>${item.label}</span>
                </div>
                ${item.badge ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">${item.badge}</span>` : ''}
              </button>
            `;
          }).join('')}
        </nav>
      </div>

      <!-- Bottom Profile & Logout -->
      <div class="p-4 border-t border-aura-border space-y-3">
        <div class="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/80 border border-aura-border">
          <div class="w-9 h-9 rounded-full ${badgeColor} flex items-center justify-center font-bold text-xs text-white shadow-md">
            ${initials}
          </div>
          <div class="overflow-hidden">
            <h4 class="text-xs font-semibold text-white truncate">${userName}</h4>
            <p class="text-[10px] text-slate-400 truncate">${roleTitle}</p>
          </div>
        </div>

        <button onclick="handleLogout()" class="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
          <i class="fa-solid fa-arrow-right-from-bracket text-xs"></i>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  `;
}

function renderTopNav() {
  const isSolicitante = state.currentRole === 'solicitante';
  const isCompras = state.currentRole === 'compras';
  const isAdmin = Boolean(state.currentUser && state.currentUser.isAdmin);

  const titles = {
    dashboard: isSolicitante ? 'Dashboard — Solicitante' : (state.currentRole === 'director' ? 'Dashboard — Dirección General' : (state.currentRole === 'gerente' ? 'Dashboard — Gerencia' : 'Dashboard — Compras & Adquisiciones')),
    solicitudes: isSolicitante ? 'Mis Solicitudes' : 'Tablero Kanban de Solicitudes',
    nueva_solicitud: state.editingDraftId ? 'Editar Borrador de Requerimiento' : 'Nueva Solicitud de Compra',
    aprobaciones: state.currentRole === 'director' ? 'Dictamen Alto Monto (> $1,000)' : 'Bandeja de Dictamen y Aprobaciones (≤ $1,000)',
    proveedores: 'Catálogo Oficial de Proveedores',
    proveedor_nuevo: 'Registrar Nuevo Proveedor (Compras)',
    proveedor_editar: 'Editar Proveedor (Compras)',
    detalle_solicitud: 'Ficha Técnica de Requerimiento',
    admin_usuarios: 'Administración de Usuarios y Accesos',
    tokens: 'Tokens de Diseño & Guía Visual'
  };

  const statusIndicator = state.apiState.isConnected === true
    ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" title="API Backend activa"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>API Online</span>`
    : state.apiState.isConnected === false
    ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30" title="API no conectada"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>Sin Conexión</span>`
    : '';

  return `
    <header class="h-16 px-8 border-b border-aura-border flex items-center justify-between shrink-0 bg-aura-canvas/80 backdrop-blur sticky top-0 z-20">
      <div class="flex items-center gap-3">
        <div>
          <h2 class="text-base font-bold text-white tracking-tight">${titles[state.currentView] || 'AURA Compras'}</h2>
          <p class="text-[11px] text-slate-400">Sistema Corporativo v2.0 • Amazon Cognito & DynamoDB</p>
        </div>
        ${statusIndicator}
      </div>

      <div class="flex items-center gap-3">
        <button onclick="${Boolean(state.currentUser && state.currentUser.isAdmin) ? 'recargarAdminUsuariosApi()' : (state.currentView === 'aprobaciones' ? 'recargarAprobacionesApi()' : 'recargarSolicitudesApi()')}" title="Sincronizar con AWS" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg text-xs border border-aura-border transition-colors ${state.apiState.isLoading || (state.aprobacionesState && state.aprobacionesState.isLoading) ? 'animate-spin text-blue-400' : ''}">
          <i class="fa-solid fa-rotate"></i>
        </button>

        ${isSolicitante && state.currentView === 'solicitudes' ? `
          <button onclick="navigateTo('nueva_solicitud')" class="py-2 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/30 transition-all flex items-center gap-2">
            <i class="fa-solid fa-plus text-[10px]"></i>
            <span>Nueva Solicitud</span>
          </button>
        ` : ''}

        ${isCompras && state.currentView === 'proveedores' ? `
          <button onclick="navigateTo('proveedor_nuevo')" class="py-2 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/30 transition-all flex items-center gap-2">
            <i class="fa-solid fa-plus text-[10px]"></i>
            <span>Nuevo Proveedor</span>
          </button>
        ` : ''}
      </div>
    </header>
  `;
}
window.renderTopNav = renderTopNav;

// ----------------- VISTAS PRINCIPALES -----------------
function renderMainContent() {
  switch (state.currentView) {
    case 'admin_usuarios':
      return renderAdminUsuarios();
    case 'dashboard':
      return renderDashboard();
    case 'solicitudes':
      return renderKanban();
    case 'nueva_solicitud':
      return renderNuevaSolicitud();
    case 'aprobaciones':
      return renderAprobaciones();
    case 'proveedores':
      return renderProveedores();
    case 'proveedor_nuevo':
      return renderProveedorForm(false);
    case 'proveedor_editar':
      return renderProveedorForm(true);
    case 'detalle_solicitud':
      return renderDetalleSolicitud();
    case 'tokens':
      return renderTokensVisualGuide();
    default:
      return renderDashboard();
  }
}

// 1. DASHBOARD
function renderDashboard() {
  const isSolicitante = state.currentRole === 'solicitante';
  const isGerente = state.currentRole === 'gerente';
  const isDirector = state.currentRole === 'director';
  const isCompras = state.currentRole === 'compras';

  const userName = (state.currentUser && state.currentUser.name) || 'Usuario';
  const userEmail = (state.currentUser && state.currentUser.email ? state.currentUser.email.toLowerCase() : '');
  const userSub = (state.currentUser && state.currentUser.sub ? state.currentUser.sub : '');
  const roleTitle = (state.currentUser && state.currentUser.roleTitle) || state.currentRole || 'Usuario';

  // Filtrado de solicitudes según el rol:
  // Solicitante: solo ve sus requerimientos (por sub o correo)
  // Compras: supervisa órdenes, NO ve borradores privados
  const solicitudesRol = isSolicitante 
    ? state.solicitudes.filter(s => {
        const sSub = s.applicantSub || s.sub || '';
        const sOwner = (s.solicitante || '').toLowerCase();
        return (userSub && sSub === userSub) || (userEmail && sOwner === userEmail) || sOwner.includes(userName.toLowerCase());
      })
    : (isCompras ? state.solicitudes.filter(s => s.estado !== 'borrador') : state.solicitudes);

  const countTotal = solicitudesRol.length;
  const countBorradores = solicitudesRol.filter(s => s.estado === 'borrador').length;
  const countEnRevision = solicitudesRol.filter(s => s.estado === 'en_revision').length;
  const countPendientes = countBorradores + countEnRevision;
  const countAprobadas = solicitudesRol.filter(s => s.estado === 'aprobado').length;
  const gastoTotal = solicitudesRol.filter(s => s.estado === 'aprobado').reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);

  return `
    <div class="space-y-6">
      <div class="p-4 rounded-xl bg-gradient-to-r ${
        isSolicitante ? 'from-blue-900/30 to-slate-900 border-blue-500/30' :
        isGerente ? 'from-emerald-900/30 to-slate-900 border-emerald-500/30' :
        isDirector ? 'from-purple-900/30 to-slate-900 border-purple-500/30' :
        'from-sky-900/30 to-slate-900 border-sky-500/30'
      } border flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-white mb-0.5">
            Bienvenido, ${userName}
          </h3>
          <p class="text-xs text-slate-400">
            ${isSolicitante ? 'Aquí puedes monitorear tus órdenes de compra y borradores privados.' :
              isGerente ? 'Panel de control de presupuesto, auditoría y aprobaciones ordinarias (≤ $1,000 USD).' :
              isDirector ? 'Dirección General: flujo de dictamen y fiscalización para adquisiciones de alto monto (> $1,000 USD).' :
              'Panel operativo de compras: supervisión de órdenes, cotizaciones y catálogo oficial de proveedores.'}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${
            isSolicitante ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
            isGerente ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
            isDirector ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
            'bg-sky-500/20 text-sky-400 border border-sky-500/30'
          }">
            Rol: ${roleTitle}
          </span>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-aura-card border border-aura-border rounded-xl p-5 shadow-lg">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-xs font-medium">Total Solicitudes</span>
            <i class="fa-solid fa-folder-open text-blue-400"></i>
          </div>
          <div class="text-2xl font-bold text-white">${countTotal}</div>
          <span class="text-[11px] text-slate-500">Registros en el periodo</span>
        </div>

        <div class="bg-aura-card border border-aura-border rounded-xl p-5 shadow-lg">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-xs font-medium">Pendientes de Acción</span>
            <i class="fa-solid fa-clock text-amber-400"></i>
          </div>
          <div class="flex items-baseline gap-2">
            <div class="text-2xl font-bold text-amber-400">${countPendientes}</div>
            ${isSolicitante ? `
              <div class="text-[11px] font-medium text-slate-400">
                (<span class="text-slate-300" title="Borradores privados por enviar">${countBorradores} borradores</span> • <span class="text-amber-400" title="Enviadas esperando dictamen">${countEnRevision} en revisión</span>)
              </div>
            ` : ''}
          </div>
          <span class="text-[11px] text-slate-500 block mt-0.5">Requieren seguimiento</span>
        </div>

        <div class="bg-aura-card border border-aura-border rounded-xl p-5 shadow-lg">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-xs font-medium">Aprobadas</span>
            <i class="fa-solid fa-circle-check text-emerald-400"></i>
          </div>
          <div class="text-2xl font-bold text-emerald-400">${countAprobadas}</div>
          <span class="text-[11px] text-slate-500">Dictaminadas con éxito</span>
        </div>

        <div class="bg-aura-card border border-aura-border rounded-xl p-5 shadow-lg">
          <div class="flex items-center justify-between text-slate-400 mb-2">
            <span class="text-xs font-medium">Monto Total Aprobado</span>
            <i class="fa-solid fa-dollar-sign text-sky-400"></i>
          </div>
          <div class="text-2xl font-bold text-white">$${gastoTotal.toFixed(2)}</div>
          <span class="text-[11px] text-slate-500">Presupuesto ejecutado</span>
        </div>
      </div>

      <!-- Tabla de Solicitudes Recientes -->
      <div class="bg-aura-card border border-aura-border rounded-xl overflow-hidden shadow-lg">
        <div class="p-4 border-b border-aura-border flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider">Actividad Reciente</h4>
            ${state.apiState.isLoading ? '<span class="text-[10px] text-blue-400 animate-pulse"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Actualizando...</span>' : ''}
          </div>
          <button onclick="navigateTo('solicitudes')" class="text-xs text-blue-400 hover:text-blue-300 font-medium">Ver todas en Kanban →</button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900/60 text-slate-400 border-b border-aura-border">
              <tr>
                <th class="py-3 px-4">Código</th>
                <th class="py-3 px-4">Descripción</th>
                <th class="py-3 px-4">Proveedor</th>
                <th class="py-3 px-4">Monto</th>
                <th class="py-3 px-4">Estado</th>
                <th class="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-aura-border text-slate-200">
              ${solicitudesRol.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-8 text-center text-slate-500 italic">No hay actividad reciente registrada en AWS DynamoDB.</td>
                </tr>
              ` : solicitudesRol.slice(0, 5).map(s => `
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="py-3 px-4 font-mono font-semibold text-blue-400">
                    <span class="inline-block max-w-[200px] truncate align-middle" title="${s.id}">${formatearIdVisual(s.id)}</span>
                  </td>
                  <td class="py-3 px-4 font-medium max-w-xs truncate">${s.descripcion}</td>
                  <td class="py-3 px-4 text-slate-400">${s.proveedor}</td>
                  <td class="py-3 px-4 font-semibold text-white">$${Number(s.total || 0).toFixed(2)}</td>
                  <td class="py-3 px-4">${renderBadgeEstado(s.estado)}</td>
                  <td class="py-3 px-4 text-right">
                    <button onclick="verDetalleSolicitud('${s.id}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-aura-border rounded text-[11px] transition-colors">
                      Ver Ficha
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 2. KANBAN DE SOLICITUDES
function renderKanban() {
  const isSolicitante = state.currentRole === 'solicitante';
  const isGerente = state.currentRole === 'gerente';
  const isDirector = state.currentRole === 'director';
  const isCompras = state.currentRole === 'compras';

  // Reglas RBAC para el tablero Kanban:
  // - Solicitante: Ve sus borradores en Borrador / Pendiente
  // - Gerente, Director y Compras: NO ven borradores privados ajenos
  let items = [...state.solicitudes];
  if (isGerente || isDirector || isCompras) {
    items = items.filter(s => s.estado !== 'borrador');
  }

  const hasLegacy = items.some(s => s.estado === 'legado' || s.isLegacyOrReadOnly);
  const columns = [
    {
      id: 'pendiente',
      title: 'Borrador / Pendiente',
      borderColor: 'border-slate-500/40',
      badgeColor: 'bg-slate-700 text-slate-300',
      filter: (s) => isSolicitante ? (s.estado === 'borrador') : false
    },
    {
      id: 'en_revision',
      title: 'En Revisión (Dictamen)',
      borderColor: 'border-amber-500/40',
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      filter: (s) => (s.status === 'PENDING' || s.status === 'REGISTERING' || (!s.status && s.estado === 'en_revision')) && !s.isLegacyOrReadOnly && s.estado !== 'legado'
    },
    {
      id: 'aprobado',
      title: 'Aprobadas',
      borderColor: 'border-emerald-500/40',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      filter: (s) => (s.status === 'APPROVED' || s.estado === 'aprobado') && !s.isLegacyOrReadOnly
    },
    {
      id: 'rechazado',
      title: 'Rechazadas / Anuladas',
      borderColor: 'border-red-500/40',
      badgeColor: 'bg-red-500/20 text-red-300 border border-red-500/30',
      filter: (s) => (s.status === 'REJECTED' || s.status === 'CANCELLED' || s.estado === 'rechazado' || s.estado === 'anulado') && !s.isLegacyOrReadOnly
    }
  ];

  if (hasLegacy) {
    columns.push({
      id: 'legado',
      title: 'Histórico (Solo Lectura)',
      borderColor: 'border-slate-600/60',
      badgeColor: 'bg-slate-800 text-slate-400 border border-slate-700',
      filter: (s) => s.estado === 'legado' || s.isLegacyOrReadOnly
    });
  }

  return `
    <div class="h-full flex flex-col space-y-3">
      <!-- Barra de estado y paginación DynamoDB -->
      <div class="flex items-center justify-between px-1 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-slate-400 font-medium">Mostrando <strong class="text-white">${items.length}</strong> solicitudes</span>
          ${state.apiState.totalApi ? `<span class="text-slate-500">• Total en DynamoDB: ${state.apiState.totalApi}</span>` : ''}
          ${state.apiState.isLoading ? '<span class="text-blue-400 animate-pulse ml-2"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Sincronizando con AWS...</span>' : ''}
        </div>
        <div class="flex items-center gap-2">
          ${state.apiState.hayMasRegistros ? `
            <button onclick="cargarSiguientePagina()" class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1.5">
              <span>Cargar más</span>
              <i class="fa-solid fa-arrow-down text-[10px]"></i>
            </button>
          ` : ''}
        </div>
      </div>

      <div class="grid grid-cols-1 ${hasLegacy ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 flex-1">
        ${columns.map(col => {
          const colItems = items.filter(col.filter);
          return `
            <div class="bg-aura-sidebar/70 border ${col.borderColor} rounded-xl flex flex-col h-full overflow-hidden">
              <div class="p-3.5 border-b border-aura-border bg-slate-900/40 flex items-center justify-between">
                <span class="text-xs font-bold text-slate-200 tracking-wide">${col.title}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badgeColor}">
                  ${colItems.length}
                </span>
              </div>

              <div class="p-3 space-y-3 overflow-y-auto flex-1">
                ${colItems.length === 0 ? `
                  <div class="text-center py-8 text-slate-600 text-[11px] italic">
                    Sin solicitudes en esta etapa
                  </div>
                ` : colItems.map(item => `
                  <div onclick="verDetalleSolicitud('${item.id}')" class="bg-aura-card border border-aura-border hover:border-blue-500/50 rounded-xl p-3.5 cursor-pointer shadow-md hover:shadow-lg transition-all space-y-2.5">
                    <div class="flex items-center justify-between gap-2 min-w-0">
                      <span class="text-[11px] font-mono font-bold text-blue-400 truncate flex-1" title="${item.id}">${formatearIdVisual(item.id)}</span>
                      ${item.esAltoMonto ? `
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
                          > $1k
                        </span>
                      ` : ''}
                    </div>

                    <h4 class="text-xs font-semibold text-white line-clamp-2 leading-relaxed">
                      ${item.descripcion}
                    </h4>

                    <div class="pt-2 border-t border-aura-border flex items-center justify-between text-[11px]">
                      <span class="text-slate-400 truncate max-w-[120px]">${item.proveedor}</span>
                      <span class="font-mono font-bold text-white">$${Number(item.total || 0).toFixed(2)}</span>
                    </div>

                    <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                      <span>${item.solicitante}</span>
                      <span>${item.fecha}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// 3. NUEVA SOLICITUD / EDICIÓN DE BORRADOR
function renderNuevaSolicitud() {
  const form = state.nuevaSolicitudForm;
  const totalCalculado = form.items.reduce((acc, it) => acc + (Number(it.cantidad || 0) * Number(it.precio || 0)), 0);
  // Regla oficial: hasta $1,000 Gerente; más de $1,000 Director
  const esAltoMonto = totalCalculado > 1000;
  const isEditing = Boolean(state.editingDraftId);

  return `
    <div class="max-w-4xl mx-auto bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-6 pb-4 border-b border-aura-border">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h3 class="text-base font-bold text-white">
              ${isEditing ? 'Editar Borrador de Requerimiento' : 'Nueva Solicitud de Compra (SC)'}
            </h3>
            ${isEditing 
              ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1" title="${state.editingDraftId}"><i class="fa-solid fa-cloud text-[9px]"></i>Borrador en DynamoDB (ID: ${formatearIdVisual(state.editingDraftId)})</span>`
              : `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">Formulario Nuevo (Sin Guardar)</span>`}
          </div>
          <p class="text-xs text-slate-400">
            ${isEditing ? 'Modifica los artículos o detalles antes de remitir formalmente a aprobación.' : 'Ingresa los detalles del requerimiento y los ítems cotizados.'}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="confirmarLimpiarFormulario()" class="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-colors flex items-center gap-1.5" title="Restablecer todos los campos del formulario">
            <i class="fa-solid fa-broom text-[10px]"></i>
            <span>Limpiar Formulario</span>
          </button>
          <button type="button" onclick="navigateTo('solicitudes')" class="px-3 py-1.5 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
            ← Volver al Kanban
          </button>
        </div>
      </div>

      <form onsubmit="handleCrearSolicitud(event)" class="space-y-6">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-semibold text-slate-300">Descripción General del Requerimiento</label>
            <span id="solicitud-desc-contador" class="text-[10px] text-slate-500 font-mono">${(form.descripcion || '').length} / 1000</span>
          </div>
          <input type="text" id="solicitud-desc" required maxlength="1000" value="${form.descripcion}" oninput="actualizarCampoForm('descripcion', this.value)" placeholder="Ej. Renovación anual de licencias y equipamiento para TI (hasta 1,000 caracteres)" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors">
          <div id="error-solicitud-desc" class="hidden text-[11px] text-red-400 mt-1"></div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Departamento Solicitante</label>
            <select id="solicitud-dep" required onchange="actualizarCampoForm('departamento', this.value)" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="DEP-TI" ${form.departamento === 'DEP-TI' ? 'selected' : ''}>DEP-TI (Tecnología e Información)</option>
              <option value="DEP-ADM" ${form.departamento === 'DEP-ADM' ? 'selected' : ''}>DEP-ADM (Administración General)</option>
              <option value="DEP-FIN" ${form.departamento === 'DEP-FIN' ? 'selected' : ''}>DEP-FIN (Finanzas y Contabilidad)</option>
              <option value="DEP-OPER" ${form.departamento === 'DEP-OPER' ? 'selected' : ''}>DEP-OPER (Operaciones)</option>
              <option value="DEP-RH" ${form.departamento === 'DEP-RH' ? 'selected' : ''}>DEP-RH (Recursos Humanos)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Proveedor Sugerido / Seleccionado (Catálogo Oficial)</label>
            <select id="solicitud-prov" required onchange="actualizarCampoForm('proveedorId', this.value)" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="">-- Seleccionar Proveedor --</option>
              ${state.proveedores.map(p => `
                <option value="${p.id}" ${form.proveedorId === p.id ? 'selected' : ''}>
                  ${p.nombre || p.name} (${p.categoria || p.category || 'Servicios'})
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Tabla de Ítems Cotizados -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-semibold text-slate-300">Ítems del Requerimiento</label>
            <button type="button" onclick="agregarFilaItem()" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium">
              <i class="fa-solid fa-plus text-[10px]"></i>
              <span>+ Agregar ítem</span>
            </button>
          </div>

          <div class="border border-aura-border rounded-xl overflow-hidden">
            <table class="w-full text-xs">
              <thead class="bg-slate-900/60 text-slate-400 border-b border-aura-border">
                <tr>
                  <th class="py-2.5 px-3 text-left">Nombre / Descripción</th>
                  <th class="py-2.5 px-3 w-24 text-center">Cantidad</th>
                  <th class="py-2.5 px-3 w-32 text-right">Precio unitario</th>
                  <th class="py-2.5 px-3 w-32 text-right">Subtotal</th>
                  <th class="py-2.5 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-aura-border text-slate-200">
                ${form.items.map((item, idx) => `
                  <tr id="item-row-${idx}">
                    <td class="p-2">
                      <input type="text" id="item-nombre-${idx}" value="${item.nombre}" oninput="actualizarItem(${idx}, 'nombre', this.value)" placeholder="Descripción del producto o servicio" class="w-full px-2 py-1.5 bg-aura-input border border-aura-border rounded text-xs text-slate-100 focus:outline-none focus:border-blue-500">
                    </td>
                    <td class="p-2">
                      <input type="number" id="item-cantidad-${idx}" min="1" max="10000" step="1" value="${item.cantidad}" oninput="actualizarItem(${idx}, 'cantidad', this.value)" class="w-full px-2 py-1.5 bg-aura-input border border-aura-border rounded text-xs text-center text-slate-100 focus:outline-none focus:border-blue-500">
                    </td>
                    <td class="p-2">
                      <input type="number" id="item-precio-${idx}" step="0.01" min="0" value="${item.precio}" oninput="actualizarItem(${idx}, 'precio', this.value)" class="w-full px-2 py-1.5 bg-aura-input border border-aura-border rounded text-xs text-right text-slate-100 focus:outline-none focus:border-blue-500">
                    </td>
                    <td class="p-2 text-right font-mono font-semibold text-white" id="item-subtotal-${idx}">
                      $${(Number(item.cantidad || 0) * Number(item.precio || 0)).toFixed(2)}
                    </td>
                    <td class="p-2 text-center">
                      ${form.items.length > 1 ? `
                        <button type="button" onclick="eliminarFilaItem(${idx})" class="text-slate-500 hover:text-red-400 transition-colors">
                          <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Banner de Política de Dictamen Oficial (Gerente vs Director) -->
        <div id="banner-politica-dictamen" class="p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
          esAltoMonto 
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
        }">
          <div class="flex items-center gap-2.5">
            <i class="fa-solid ${esAltoMonto ? 'fa-triangle-exclamation text-amber-400' : 'fa-circle-check text-emerald-400'} text-base" id="banner-icono"></i>
            <div>
              <span class="text-xs font-bold block" id="banner-titulo">
                ${esAltoMonto ? 'Solicitud de Alto Monto (> $1,000 USD)' : 'Aprobación ordinaria de Gerencia (Hasta $1,000 USD)'}
              </span>
              <span class="text-[11px] opacity-80" id="banner-subtitulo">
                ${esAltoMonto ? 'Monto superior a $1,000: requiere dictamen exclusivo de Dirección General.' : 'Monto de hasta $1,000: aprobación directa de Gerencia.'}
              </span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-[10px] uppercase font-semibold opacity-70 block">Total Estimado</span>
            <span class="text-base font-bold font-mono" id="total-estimado-valor">$${totalCalculado.toFixed(2)}</span>
          </div>
        </div>

        <!-- Botones de Acción -->
        <div class="flex items-center justify-end gap-3 pt-4 border-t border-aura-border">
          <button type="button" onclick="guardarBorrador()" class="px-4 py-2 rounded-lg border border-aura-border text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors">
            ${isEditing ? 'Actualizar Borrador' : 'Guardar como Borrador'}
          </button>
          <button type="submit" class="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2">
            <i class="fa-solid fa-paper-plane text-xs"></i>
            <span>Enviar a Aprobación</span>
          </button>
        </div>
      </form>
    </div>
  `;
}

// 4. BANDEJA DE APROBACIONES (Gerente ≤ $1,000, Director > $1,000 — GET /api/aprobaciones)
function renderAprobaciones() {
  const isGerente = state.currentRole === 'gerente';
  const isDirector = state.currentRole === 'director';

  // Matriz de aprobaciones oficial desde GET /api/aprobaciones con paginación
  // Director: exclusivamente solicitudes de alto monto (> $1,000)
  // Gerente: exclusivamente solicitudes ordinarias (≤ $1,000)
  // Compras: NO dictamina
  let pendientes = [];
  if (state.aprobaciones && state.aprobaciones.length > 0) {
    pendientes = state.aprobaciones;
  } else if (isDirector) {
    pendientes = state.solicitudes.filter(s => (s.status === 'PENDING' || s.estado === 'en_revision') && s.esAltoMonto && !s.isLegacyOrReadOnly);
  } else if (isGerente) {
    pendientes = state.solicitudes.filter(s => (s.status === 'PENDING' || s.estado === 'en_revision') && !s.esAltoMonto && !s.isLegacyOrReadOnly);
  }

  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-white">
            ${isDirector ? 'Bandeja de Dictamen — Dirección General (Monto > $1,000 USD)' : 'Bandeja de Aprobaciones — Gerencia (Hasta $1,000 USD)'}
          </h3>
          <p class="text-xs text-slate-400">
            ${isDirector 
              ? 'Dictamen exclusivo de fiscalización directiva para adquisiciones de alto presupuesto (GET /api/aprobaciones).' 
              : 'Revisión y dictamen de solicitudes departamentales ordinarias (GET /api/aprobaciones).'}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400">Mostrando <strong class="text-white">${pendientes.length}</strong> pendientes</span>
          ${state.aprobacionesState.hayMasRegistros ? `
            <button onclick="cargarSiguientePaginaAprobaciones()" class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1.5">
              <span>Cargar más</span>
              <i class="fa-solid fa-arrow-down text-[10px]"></i>
            </button>
          ` : ''}
          <button onclick="recargarAprobacionesApi()" class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-aura-border" title="Actualizar bandeja">
            <i class="fa-solid fa-rotate ${state.aprobacionesState.isLoading ? 'fa-spin' : ''}"></i>
          </button>
        </div>
      </div>

      <div class="bg-aura-card border border-aura-border rounded-xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900/60 text-slate-400 border-b border-aura-border">
              <tr>
                <th class="py-3 px-4">Código</th>
                <th class="py-3 px-4">Solicitante</th>
                <th class="py-3 px-4">Descripción del Bien/Servicio</th>
                <th class="py-3 px-4">Monto Cotizado</th>
                <th class="py-3 px-4">Clasificación</th>
                <th class="py-3 px-4 text-center">Acción de Dictamen</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-aura-border text-slate-200">
              ${pendientes.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-8 text-center text-slate-500 italic">
                    No tienes requerimientos pendientes por dictaminar en tu nivel de autorización.
                  </td>
                </tr>
              ` : pendientes.map(s => `
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="py-3.5 px-4 font-mono font-bold text-blue-400">
                    <span class="inline-block max-w-[200px] truncate align-middle" title="${s.id}">${formatearIdVisual(s.id)}</span>
                  </td>
                  <td class="py-3.5 px-4 font-medium">${s.solicitante}</td>
                  <td class="py-3.5 px-4 max-w-sm truncate">${s.descripcion}</td>
                  <td class="py-3.5 px-4 font-mono font-bold text-white">$${Number(s.total || 0).toFixed(2)}</td>
                  <td class="py-3.5 px-4">
                    ${s.esAltoMonto ? `
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Alto Monto (> $1k)</span>
                    ` : `
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">Ordinaria (≤ $1k)</span>
                    `}
                  </td>
                  <td class="py-3.5 px-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                      <button onclick="dictaminarSolicitud('${s.id}', 'aprobado')" ${state.inFlightOperations?.has(`dictamen_${s.id}`) ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-[11px] shadow-sm transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-check text-[10px]"></i>
                        <span>Aprobar</span>
                      </button>
                      <button onclick="dictaminarSolicitud('${s.id}', 'rechazado')" ${state.inFlightOperations?.has(`dictamen_${s.id}`) ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-[11px] shadow-sm transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-xmark text-[10px]"></i>
                        <span>Rechazar</span>
                      </button>
                      <button onclick="verDetalleSolicitud('${s.id}')" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-aura-border text-[11px]">
                        Detalle
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 5. CATÁLOGO OFICIAL DE PROVEEDORES
function renderProveedores() {
  const isCompras = state.currentRole === 'compras';
  const categorias = ['Todos', 'Tecnología', 'Suministros', 'Mobiliario', 'Servicios'];

  const filtrados = state.activeFilterCategoria === 'Todos'
    ? state.proveedores
    : state.proveedores.filter(p => (p.categoria || p.category || '').toLowerCase() === state.activeFilterCategoria.toLowerCase());

  return `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-1 bg-aura-sidebar border border-aura-border p-1 rounded-xl">
          ${categorias.map(cat => `
            <button onclick="setFilterCategoria('${cat}')" class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              state.activeFilterCategoria === cat
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }">
              ${cat}
            </button>
          `).join('')}
        </div>

        <div class="text-xs text-slate-400">
          Mostrando <strong class="text-white">${filtrados.length}</strong> proveedores
        </div>
      </div>

      <div class="bg-aura-card border border-aura-border rounded-xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900/60 text-slate-400 border-b border-aura-border">
              <tr>
                <th class="py-3 px-4">ID</th>
                <th class="py-3 px-4">Razón Social / Comercial</th>
                <th class="py-3 px-4">Categoría</th>
                <th class="py-3 px-4">Contacto Directo</th>
                ${isCompras ? `<th class="py-3 px-4">Datos Fiscales / Bancarios (Compras)</th>` : ''}
                <th class="py-3 px-4">Estado</th>
                ${isCompras ? `<th class="py-3 px-4 text-right">Acciones</th>` : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-aura-border text-slate-200">
              ${filtrados.length === 0 ? `
                <tr>
                  <td colspan="${isCompras ? 7 : 5}" class="py-8 text-center text-slate-500 italic">
                    No hay proveedores registrados en el catálogo oficial de DynamoDB.
                  </td>
                </tr>
              ` : filtrados.map(p => `
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="py-3.5 px-4 font-mono font-semibold text-blue-400">${p.id}</td>
                  <td class="py-3.5 px-4">
                    <div class="font-bold text-white">${p.nombre}</div>
                    ${p.legalName && p.legalName !== p.nombre ? `<div class="text-[10px] text-slate-400">${p.legalName}</div>` : ''}
                  </td>
                  <td class="py-3.5 px-4">
                    <span class="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                      ${p.categoria}
                    </span>
                  </td>
                  <td class="py-3.5 px-4">
                    <div class="text-slate-300 font-medium">${p.contacto}</div>
                    <div class="text-[10px] text-slate-500">${p.telefono}</div>
                  </td>
                  ${isCompras ? `
                    <td class="py-3.5 px-4">
                      <div class="text-slate-300 font-mono text-[11px]">RFC: ${p.taxId || 'N/A'}</div>
                      <div class="text-[10px] text-slate-400">${p.bankName ? `${p.bankName} - ${p.bankAccount || ''}` : 'Sin datos bancarios'}</div>
                    </td>
                  ` : ''}
                  <td class="py-3.5 px-4">${renderBadgeProveedor(p.estado || p.status)}</td>
                  ${isCompras ? `
                    <td class="py-3.5 px-4 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <button onclick="editarProveedor('${p.id}')" title="Editar" class="p-1.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors">
                          <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="confirmarEliminarProveedor('${p.id}')" title="Eliminar" class="p-1.5 rounded bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition-colors">
                          <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 6. FICHA TÉCNICA DETALLE SOLICITUD
function renderDetalleSolicitud() {
  const item = state.solicitudes.find(s => s.id === state.selectedSolicitudId || s.requestId === state.selectedSolicitudId || (s.draftId && s.draftId === state.selectedSolicitudId));
  const isSolicitante = state.currentRole === 'solicitante';
  const isGerente = state.currentRole === 'gerente';
  const isDirector = state.currentRole === 'director';
  const canDictaminar = ((isGerente && !item?.esAltoMonto) || (isDirector && item?.esAltoMonto)) && (item?.status === 'PENDING' || (!item?.status && item?.estado === 'en_revision')) && !item?.isLegacyOrReadOnly;

  if (!item) {
    return `
      <div class="max-w-xl mx-auto my-12 bg-aura-card border border-aura-border rounded-2xl p-8 text-center space-y-4 shadow-2xl">
        <div class="w-12 h-12 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl">
          <i class="fa-solid fa-magnifying-glass"></i>
        </div>
        <div>
          <h3 class="text-base font-bold text-white mb-1">Solicitud no encontrada (404)</h3>
          <p class="text-xs text-slate-400">El identificador <strong class="text-white">${state.selectedSolicitudId}</strong> no existe en el registro de DynamoDB o fue eliminado.</p>
        </div>
        <button onclick="navigateTo('solicitudes')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition-all inline-flex items-center gap-2">
          <i class="fa-solid fa-arrow-left text-[10px]"></i>
          <span>Regresar al Kanban</span>
        </button>
      </div>
    `;
  }

  const provObj = state.proveedores.find(p => p.id === item.proveedorId);
  const provNombreVisual = provObj ? `${provObj.nombre} (${provObj.id})` : (item.proveedor || item.proveedorId || 'Proveedor Asignado');

  return `
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <button onclick="navigateTo('solicitudes')" class="px-3 py-1.5 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-1.5">
          <i class="fa-solid fa-arrow-left text-[10px]"></i>
          <span>Volver al Tablero Kanban</span>
        </button>

        <div class="flex items-center gap-2">
          ${renderBadgeEstado(item.estado)}
          ${item.esAltoMonto ? `
            <span class="px-2 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
              <i class="fa-solid fa-star text-[10px]"></i>
              <span>Alto Monto (> $1,000)</span>
            </span>
          ` : ''}
          ${item.executionArn ? `
            <span class="px-2 py-1 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1" title="${item.executionArn}">
              <i class="fa-solid fa-bolt text-[9px]"></i>
              <span>Step Functions</span>
            </span>
          ` : ''}
        </div>
      </div>

      <div class="bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl space-y-6">
        <div class="flex items-start justify-between border-b border-aura-border pb-4">
          <div>
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-xs font-mono text-blue-400 font-bold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20" title="${item.id}">${formatearIdVisual(item.id, 24)}</span>
              ${item.id && item.id.length > 18 ? `
                <button type="button" onclick="if(navigator.clipboard){navigator.clipboard.writeText('${item.id}'); showToast('Código copiado: ${item.id}', 'info');}" title="Copiar código completo" class="px-1.5 py-0.5 text-slate-400 hover:text-white rounded text-[10px] bg-slate-800 border border-aura-border transition-colors flex items-center gap-1">
                  <i class="fa-solid fa-copy text-[9px]"></i>
                  <span>Copiar</span>
                </button>
              ` : ''}
              <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-aura-border font-medium">${item.departamento || 'DEP-TI'}</span>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">${item.descripcion}</h3>
            ${item.estado === 'borrador' 
              ? `<p class="text-xs text-amber-400 font-medium"><i class="fa-solid fa-pencil mr-1 text-[10px]"></i>Borrador privado en DynamoDB (v${item.version || 1}) de <strong class="text-slate-200">${item.solicitante}</strong></p>`
              : `<p class="text-xs text-slate-400">Enviada el ${item.fecha} por <strong class="text-slate-200">${item.solicitante}</strong></p>`}
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-400 block mb-0.5">Monto Total</span>
            <span class="text-2xl font-bold font-mono text-white">$${Number(item.total || 0).toFixed(2)}</span>
          </div>
        </div>

        <div class="bg-slate-900/60 border border-aura-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Proveedor Oficial</span>
            <span class="text-sm font-semibold text-white">${provNombreVisual}</span>
          </div>
          <span class="text-xs text-blue-400 font-medium">Cotización Registrada ✓</span>
        </div>

        <div>
          <h4 class="text-xs font-bold uppercase text-slate-400 mb-3 tracking-wider">Desglose de Partidas</h4>
          <div class="border border-aura-border rounded-xl overflow-hidden">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-900/60 text-slate-400 border-b border-aura-border">
                <tr>
                  <th class="py-2.5 px-3">Nombre</th>
                  <th class="py-2.5 px-3 text-center">Cantidad</th>
                  <th class="py-2.5 px-3 text-right">Precio unitario</th>
                  <th class="py-2.5 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-aura-border text-slate-200">
                ${(item.items || []).map(it => `
                  <tr>
                    <td class="py-2.5 px-3 font-medium">${it.nombre || 'Partida'}</td>
                    <td class="py-2.5 px-3 text-center">${it.cantidad || 1}</td>
                    <td class="py-2.5 px-3 text-right font-mono">$${Number(it.precio || 0).toFixed(2)}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-white">$${Number(it.subtotal || ((it.cantidad || 1) * (it.precio || 0))).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Banner Resolutivo según Estado -->
        ${item.estado === 'aprobado' ? `
          <div class="p-4 rounded-xl border bg-emerald-500/15 border-emerald-500/40 text-emerald-300 flex items-start gap-3">
            <div class="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fa-solid fa-check text-emerald-400 text-xs"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-emerald-200 block">
                Solicitud Aprobada el ${item.fechaDictamen || item.fecha} por ${item.aprobador || 'Aprobador Oficial'}
              </span>
              <span class="text-[11px] text-emerald-300/80 mt-0.5 block">
                Dictamen auditado: "${item.comentariosGerente || 'Aprobado conforme al presupuesto asignado y justificación presupuestaria.'}"
              </span>
            </div>
          </div>
        ` : item.estado === 'anulado' || item.status === 'CANCELLED' ? `
          <div class="p-4 rounded-xl border bg-slate-800/80 border-slate-600 text-slate-300 flex items-start gap-3">
            <div class="w-6 h-6 rounded-full bg-slate-700 border border-slate-500 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fa-solid fa-ban text-slate-400 text-xs"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-white block">
                Solicitud Anulada por el Solicitante (CANCELLED)
              </span>
              <span class="text-[11px] text-slate-400 mt-0.5 block">
                Motivo: "${item.comentarios || item.motivoAnulacion || 'Anulada por requerimiento del área.'}"
              </span>
            </div>
          </div>
        ` : item.estado === 'rechazado' ? `
          <div class="p-4 rounded-xl border bg-red-500/15 border-red-500/40 text-red-300 flex items-start gap-3">
            <div class="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fa-solid fa-xmark text-red-400 text-xs"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-red-200 block">
                Solicitud Rechazada el ${item.fechaDictamen || item.fecha} por ${item.aprobador || 'Aprobador Oficial'}
              </span>
              <span class="text-[11px] text-red-300/80 mt-0.5 block">
                Motivo de auditoría obligatorio: "${item.comentariosGerente || 'No procede adquisición externa.'}"
              </span>
            </div>
          </div>
        ` : (item.estado === 'borrador' && item.status !== 'REGISTERING') ? `
          <div class="p-4 rounded-xl border bg-slate-800/80 border-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-slate-300">
            <div class="flex items-center gap-3">
              <i class="fa-solid fa-file-pen text-amber-400 text-xl"></i>
              <div>
                <span class="text-xs font-bold text-white block">Borrador Privado (DynamoDB v${item.version || 1})</span>
                <span class="text-[11px] text-slate-400">Puedes editar las partidas o eliminarlo antes de enviarlo formalmente.</span>
              </div>
            </div>
            ${isSolicitante ? `
              <div class="flex items-center gap-2">
                <button onclick="editarBorrador('${item.id}')" class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs border border-aura-border transition-all flex items-center gap-1.5">
                  <i class="fa-solid fa-pencil text-[10px]"></i>
                  <span>Editar</span>
                </button>
                <button onclick="eliminarBorrador('${item.id}', ${item.version || 1})" class="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-700 text-red-300 hover:text-white font-semibold text-xs border border-red-700/50 transition-all flex items-center gap-1.5">
                  <i class="fa-solid fa-trash-can text-[10px]"></i>
                  <span>Eliminar</span>
                </button>
                <button onclick="enviarBorradorAFirma('${item.id}')" class="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5">
                  <i class="fa-solid fa-paper-plane text-[10px]"></i>
                  <span>Enviar a Revisión</span>
                </button>
              </div>
            ` : ''}
          </div>
        ` : (item.status === 'REGISTERING') ? `
          <div class="p-4 rounded-xl border bg-purple-500/15 border-purple-500/40 text-purple-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
                <i class="fa-solid fa-spinner fa-spin text-purple-400 text-xs"></i>
              </div>
              <div>
                <span class="text-xs font-bold text-white block">Envío en Proceso (REGISTERING)</span>
                <span class="text-[11px] text-purple-300/80">Documento enviado a AWS Step Functions. Sincronizando persistencia oficial (v${item.submitVersion || item.version || 1}).</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="verificarPersistenciaRegistro('${item.requestId || item.id}')" class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow transition-all flex items-center gap-1.5">
                <i class="fa-solid fa-rotate text-[10px]"></i>
                <span>Verificar Estado</span>
              </button>
            </div>
          </div>
        ` : item.isLegacyOrReadOnly ? `
          <div class="p-4 rounded-xl border bg-slate-800/80 border-slate-600 text-slate-300 flex items-start gap-3">
            <div class="w-6 h-6 rounded-full bg-slate-700 border border-slate-500 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fa-solid fa-lock text-slate-400 text-xs"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-white block">
                Registro Histórico / Estado Legado (${item.status || item.rawStatus || 'LEGACY'})
              </span>
              <span class="text-[11px] text-slate-400 mt-0.5 block">
                Este requerimiento corresponde a un flujo anterior incompatible con el dictamen actual. Se conserva en modo de solo lectura según las políticas de auditoría.
              </span>
            </div>
          </div>
        ` : `
          <div class="p-3.5 rounded-xl border flex items-center gap-3 ${
            item.esAltoMonto 
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
              : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
          }">
            <i class="fa-solid ${item.esAltoMonto ? 'fa-triangle-exclamation text-amber-400' : 'fa-circle-check text-emerald-400'} text-base"></i>
            <span class="text-xs font-semibold">
              ${item.esAltoMonto 
                ? 'Solicitud de Alto Monto: asignada a Dirección General (> $1,000 USD)' 
                : 'Solicitud Ordinaria: asignada a Gerencia de Área (≤ $1,000 USD)'}
            </span>
          </div>
        `}

        ${isSolicitante && (item.status === 'PENDING' || (!item.status && item.estado === 'en_revision')) && !item.isLegacyOrReadOnly ? `
          <div class="pt-4 border-t border-aura-border flex items-center justify-between">
            <button onclick="anularSolicitud('${item.id}')" class="px-3.5 py-2 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-semibold transition-all flex items-center gap-2">
              <i class="fa-solid fa-ban text-xs"></i>
              <span>Anular mi Solicitud</span>
            </button>
            <span class="text-[11px] text-slate-500">Solo el solicitante puede anular mientras esté pendiente.</span>
          </div>
        ` : ''}

        ${canDictaminar && (item.status === 'PENDING' || (!item.status && item.estado === 'en_revision')) ? `
          <div class="pt-4 border-t border-aura-border flex items-center justify-end gap-3">
            <button onclick="dictaminarSolicitud('${item.id}', 'rechazado')" ${state.inFlightOperations?.has(`dictamen_${item.id}`) ? 'disabled' : ''} class="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-xs font-semibold text-white shadow transition-all">
              Rechazar Solicitud
            </button>
            <button onclick="dictaminarSolicitud('${item.id}', 'aprobado')" ${state.inFlightOperations?.has(`dictamen_${item.id}`) ? 'disabled' : ''} class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all">
              Aprobar Requerimiento
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// 7. FORMULARIO DE PROVEEDOR (CRUD - EXCLUSIVO COMPRAS)
function renderProveedorForm(isEdit) {
  const p = isEdit 
    ? state.proveedores.find(x => x.id === state.selectedProveedorId) || {}
    : { id: '', nombre: '', legalName: '', taxId: '', bankName: '', bankAccount: '', categoria: 'Tecnología', contacto: '', telefono: '', estado: 'Calificado', status: 'ACTIVE' };

  return `
    <div class="max-w-2xl mx-auto bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-6 pb-4 border-b border-aura-border">
        <div>
          <h3 class="text-base font-bold text-white">${isEdit ? 'Editar Proveedor (Compras)' : 'Registrar Nuevo Proveedor (Compras)'}</h3>
          <p class="text-xs text-slate-400">Gestión de ficha comercial, fiscal y bancaria en DynamoDB</p>
        </div>
        <button onclick="navigateTo('proveedores')" class="px-3 py-1.5 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
      </div>

      <form onsubmit="handleGuardarProveedor(event, ${isEdit})" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">Nombre Comercial</label>
          <input type="text" id="prov-nombre" required value="${p.nombre || p.name || ''}" placeholder="Ej. Soluciones Informáticas del Pacífico" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">Razón Social Oficial (Legal Name)</label>
          <input type="text" id="prov-legalname" value="${p.legalName || p.nombre || ''}" placeholder="Ej. Soluciones Informáticas del Pacífico S.A. de C.V." class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">RFC / Identificación Fiscal (Tax ID)</label>
            <input type="text" id="prov-taxid" value="${p.taxId || ''}" placeholder="SIP120304AB1" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Categoría de Suministro</label>
            <select id="prov-categoria" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="Tecnología" ${p.categoria === 'Tecnología' ? 'selected' : ''}>Tecnología</option>
              <option value="Suministros" ${p.categoria === 'Suministros' ? 'selected' : ''}>Suministros</option>
              <option value="Mobiliario" ${p.categoria === 'Mobiliario' ? 'selected' : ''}>Mobiliario</option>
              <option value="Servicios" ${p.categoria === 'Servicios' ? 'selected' : ''}>Servicios</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Institución Bancaria</label>
            <input type="text" id="prov-bankname" value="${p.bankName || ''}" placeholder="BBVA / Banamex / Banco Agrícola" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Cuenta / CLABE Interbancaria</label>
            <input type="text" id="prov-bankaccount" value="${p.bankAccount || ''}" placeholder="012345678901234567" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Correo de Contacto</label>
            <input type="email" id="prov-contacto" required value="${p.contacto || p.contactEmail || ''}" placeholder="contacto@proveedor.com" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Teléfono Institucional</label>
            <input type="text" id="prov-telefono" required value="${p.telefono || p.phone || ''}" placeholder="+503 2222-0000" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">Estado Operativo</label>
          <select id="prov-estado" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
            <option value="ACTIVE" ${p.status === 'ACTIVE' || p.estado === 'Calificado' ? 'selected' : ''}>Activo (Calificado)</option>
            <option value="INACTIVE" ${p.status === 'INACTIVE' || p.estado === 'Inactivo' ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>

        <div class="pt-4 border-t border-aura-border flex items-center justify-end gap-3">
          <button type="button" onclick="navigateTo('proveedores')" class="px-4 py-2 rounded-lg border border-aura-border text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors">
            Cancelar
          </button>
          <button type="submit" class="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition-all">
            ${isEdit ? 'Guardar Cambios' : 'Registrar Proveedor'}
          </button>
        </div>
      </form>
    </div>
  `;
}

// 8. TOKENS DE DISEÑO & GUÍA VISUAL
function renderTokensVisualGuide() {
  return `
    <div class="max-w-5xl mx-auto space-y-8 pb-12">
      <div class="flex items-center justify-between border-b border-aura-border pb-4">
        <div>
          <h2 class="text-xl font-bold text-white tracking-tight">AURA Compras — Tokens de Diseño & Guía Visual</h2>
          <p class="text-xs text-slate-400">Especificación de colores corporativos, tipografía y componentes (Dark Mode)</p>
        </div>
        <button onclick="navigateTo('login')" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-aura-border rounded-lg transition-colors">
          ← Volver al Login
        </button>
      </div>

      <div>
        <h4 class="text-xs font-bold text-sky-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-sky-400"></span>
          Paleta Primaria, Marca & Superficies (Dark Mode)
        </h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          ${renderColorSwatch('#2563EB', 'Primary Blue', 'Brand')}
          ${renderColorSwatch('#38BDF8', 'Sky Accent', 'Accent')}
          ${renderColorSwatch('#0F172A', 'Canvas Dark', 'Slate 900')}
          ${renderColorSwatch('#0B1120', 'Sidebar BG', 'Slate 950')}
          ${renderColorSwatch('#1E293B', 'Card / Table', 'Slate 800')}
          ${renderColorSwatch('#334155', 'Borders', 'Slate 700')}
          ${renderColorSwatch('#94A3B8', 'Muted Text', 'Slate 400')}
          ${renderColorSwatch('#F8FAFC', 'Light Text', 'Slate 50')}
        </div>
      </div>

      <div>
        <h4 class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
          Colores Semánticos, Estados y RBAC
        </h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          ${renderColorSwatch('#10B981', 'Success Green', 'Aprobado')}
          ${renderColorSwatch('#F59E0B', 'Amber Warning', 'Revisión')}
          ${renderColorSwatch('#EF4444', 'Danger Red', 'Rechazado')}
          ${renderColorSwatch('#3B82F6', 'Info Blue', 'Solicitante')}
          ${renderColorSwatch('#6366F1', 'Indigo Purple', 'Compras')}
          ${renderColorSwatch('#8B5CF6', 'Violet Role', 'Director')}
          ${renderColorSwatch('#475569', 'Neutral Dark', 'Borrador')}
          ${renderColorSwatch('#1D4ED8', 'Primary Hover', 'Interaction')}
        </div>
      </div>
    </div>
  `;
}

function renderColorSwatch(hex, name, token) {
  return `
    <div class="bg-aura-card border border-aura-border rounded-xl p-2.5 space-y-2">
      <div class="w-full h-12 rounded-lg border border-white/10" style="background-color: ${hex}"></div>
      <div class="overflow-hidden">
        <span class="text-[11px] font-bold text-white block truncate">${name}</span>
        <span class="text-[10px] text-slate-400 block truncate">${token}</span>
        <span class="text-[9px] font-mono text-slate-500 block uppercase">${hex}</span>
      </div>
    </div>
  `;
}

// ----------------- HELPERS VISUALES -----------------
function formatearIdVisual(id, maxChars = 18) {
  if (!id) return '';
  const strId = String(id).trim();
  if (strId.length <= maxChars) return strId;

  // Si tiene prefijo REQ- y es largo (UUID o hash SHA-256):
  if (strId.startsWith('REQ-')) {
    const cuerpo = strId.substring(4);
    if (cuerpo.length > 10) {
      return `REQ-${cuerpo.substring(0, 6)}...${cuerpo.slice(-4)}`;
    }
    return strId;
  }

  // Si tiene prefijo DRAFT- o similar
  if (strId.startsWith('DRAFT-')) {
    const cuerpo = strId.substring(6);
    if (cuerpo.length > 10) {
      return `DRAFT-${cuerpo.substring(0, 5)}...${cuerpo.slice(-3)}`;
    }
    return strId;
  }

  // Identificadores tipo UUID o hash sin prefijo (ej. ebc9ddd1-03c3-4564-b467-6ab9733f2d31)
  return `${strId.substring(0, 8)}...${strId.slice(-4)}`;
}
window.formatearIdVisual = formatearIdVisual;

function renderBadgeEstado(estado) {
  switch (estado ? estado.toLowerCase() : '') {
    case 'registrando':
    case 'registering':
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>Registrando (HTTP 202)</span>`;
    case 'legado':
    case 'requires_supervisor':
    case 'requires_manager':
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700/60 text-slate-300 border border-slate-600">
        <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Solo Lectura (Legado)</span>`;
    case 'anulado':
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700/60 text-slate-300 border border-slate-600">
        <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Anulado (CANCELLED)</span>`;
    case 'aprobado':
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Aprobado</span>`;
    case 'rechazado':
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
        <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>Rechazado</span>`;
    case 'borrador':
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700/40 text-slate-300 border border-slate-600">
        <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Borrador Dynamo</span>`;
    case 'en_revision':
    default:
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>En Revisión</span>`;
  }
}

function renderBadgeProveedor(estado) {
  const estLower = (estado || '').toLowerCase();
  if (estLower === 'calificado' || estLower === 'active' || estLower === 'activo') {
    return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Activo</span>`;
  }
  return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-700 text-slate-300 border border-slate-600">Inactivo</span>`;
}

function renderModal() {
  if (state.adminDecisionModal && state.adminDecisionModal.open) {
    const m = state.adminDecisionModal;
    const isApprove = m.decision === 'APPROVED';
    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl space-y-4">
          <div class="flex items-center gap-3 ${isApprove ? 'text-emerald-400' : 'text-red-400'}">
            <div class="w-10 h-10 rounded-full ${isApprove ? 'bg-emerald-500/20' : 'bg-red-500/20'} flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid ${isApprove ? 'fa-user-check' : 'fa-user-xmark'}"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">
                ${isApprove ? 'Aprobar Cuenta y Asignar Rol' : 'Rechazar Acceso de Usuario'}
              </h3>
              <p class="text-[11px] text-slate-400">${m.name ? `${m.name} (${m.email})` : m.email}</p>
            </div>
          </div>

          <form onsubmit="handleConfirmarAdminDecision(event)" class="space-y-4 pt-2">
            ${isApprove ? `
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Rol Comercial a Asignar</label>
                <select id="admin-modal-role" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
                  <option value="Solicitante" ${m.role === 'Solicitante' ? 'selected' : ''}>Solicitante Departamental</option>
                  <option value="Gerente" ${m.role === 'Gerente' ? 'selected' : ''}>Gerente Aprobador (hasta $1,000 USD)</option>
                  <option value="Director" ${m.role === 'Director' ? 'selected' : ''}>Director General (> $1,000 USD)</option>
                  <option value="Compras" ${m.role === 'Compras' ? 'selected' : ''}>Compras & Adquisiciones</option>
                </select>
              </div>
            ` : ''}

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1.5">
                Comentario de Auditoría Obligatorio <span class="text-red-400">*</span>
              </label>
              <textarea id="admin-modal-comments" rows="3" required placeholder="${isApprove ? 'Ej. Alta de usuario autorizada conforme a contratación en área de TI.' : 'Ej. No se autoriza acceso por no pertenecer al personal activo.'}" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"></textarea>
              <div id="admin-modal-error" class="text-[11px] text-red-400 mt-1 ${m.error ? '' : 'hidden'}">${m.error || ''}</div>
            </div>

            <div class="pt-3 border-t border-aura-border flex items-center justify-end gap-2">
              <button type="button" onclick="cerrarModalAdminDecision()" class="px-3.5 py-2 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" class="px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-lg transition-all ${
                isApprove ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30' : 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
              }">
                ${isApprove ? 'Confirmar Aprobación' : 'Confirmar Rechazo'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (state.globalErrorModal) {
    const { title, message, code, actionText, onAction } = state.globalErrorModal;
    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl space-y-4">
          <div class="flex items-center gap-3 text-red-400">
            <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
            <div>
              <h3 class="text-sm font-bold text-white">${title || 'Error de Comunicación con el Servidor'}</h3>
              ${code ? `<span class="text-[11px] font-mono text-slate-400">Código de respuesta HTTP: ${code}</span>` : ''}
            </div>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed">${message || 'Ha ocurrido un error inesperado al conectar con los servicios en AWS.'}</p>
          <div class="pt-3 border-t border-aura-border flex items-center justify-end gap-2">
            <button onclick="cerrarErrorModal()" class="px-3 py-1.5 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
              Cerrar
            </button>
            ${actionText && onAction ? `
              <button onclick="${onAction}" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition-colors">
                ${actionText}
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  if (state.proveedorToDelete) {
    const p = state.proveedores.find(x => x.id === state.proveedorToDelete);
    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div class="w-full max-w-sm bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl space-y-4">
          <div class="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-lg mx-auto">
            <i class="fa-solid fa-trash-can"></i>
          </div>
          <div class="text-center">
            <h3 class="text-sm font-bold text-white mb-1">¿Eliminar Proveedor?</h3>
            <p class="text-xs text-slate-400">
              ¿Confirmas la baja de <strong class="text-white">${p ? p.nombre : state.proveedorToDelete}</strong> del catálogo oficial de DynamoDB?
            </p>
          </div>
          <div class="flex items-center gap-3 pt-2">
            <button onclick="cerrarModalEliminar()" class="flex-1 py-2 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button onclick="ejecutarEliminarProveedor()" class="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white shadow-lg shadow-red-600/30 transition-all">
              Confirmar Baja
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

// ----------------- TOASTS Y MODALES -----------------
function showToast(message, type = 'info') {
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    return window.showToast(message, type);
  }
  const container = document.getElementById('toast-container') || (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(c);
    return c;
  })();

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600' :
             type === 'warning' ? 'bg-amber-600' :
             type === 'error' ? 'bg-red-600' : 'bg-blue-600';

  toast.className = `${bg} text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium flex items-center gap-2 transform transition-all duration-300 pointer-events-auto`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info')} text-xs"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
window.showToast = showToast;

window.cerrarErrorModal = function() {
  state.globalErrorModal = null;
  render();
};

window.mostrarErrorModal = function({ title, message, code, actionText, onAction }) {
  state.globalErrorModal = { title, message, code, actionText, onAction };
  render();
};

// ----------------- NAVEGACIÓN Y GUARDIA DE SESIÓN -----------------
function navigateTo(view) {
  const publicViews = ['login', 'registro', 'confirmar_codigo', 'espera_aprobacion', 'recuperar_password', 'tokens'];
  const isAuthenticated = window.authService && window.authService.isAuthenticated() && state.currentUser;

  if (!isAuthenticated && !publicViews.includes(view)) {
    showToast('Debes iniciar sesión con tu cuenta corporativa para acceder.', 'warning');
    state.currentView = 'login';
    render();
    return;
  }

  // Guardia estricta de control de acceso RBAC
  if (state.currentRole === 'solicitante' && ['aprobaciones', 'proveedores', 'proveedor_nuevo', 'proveedor_editar', 'admin_usuarios'].includes(view)) {
    showToast('Acceso Denegado: El solicitante no tiene permisos para esta sección.', 'warning');
    return;
  }
  if (state.currentRole === 'compras' && ['aprobaciones', 'admin_usuarios', 'nueva_solicitud'].includes(view)) {
    showToast('Acceso Denegado: Compras no tiene permisos para dictaminar ni crear solicitudes.', 'warning');
    return;
  }
  if ((state.currentRole === 'gerente' || state.currentRole === 'director') && ['proveedor_nuevo', 'proveedor_editar', 'admin_usuarios', 'nueva_solicitud'].includes(view)) {
    showToast('Acceso Denegado: Sección reservada para el rol correspondiente.', 'warning');
    return;
  }
  if (view === 'admin_usuarios' && (!state.currentUser || !state.currentUser.isAdmin)) {
    showToast('Acceso Denegado: Solo el Administrador puede gestionar cuentas.', 'warning');
    return;
  }

  state.currentView = view;
  render();

  if (view === 'aprobaciones' && (state.currentRole === 'gerente' || state.currentRole === 'director')) {
    if (typeof window.recargarAprobacionesApi === 'function') {
      window.recargarAprobacionesApi();
    }
  }
}
window.navigateTo = navigateTo;

// ----------------- AUTENTICACIÓN REAL Y LOGOUT -----------------
window.handleLoginFormSubmit = async function(e) {
  e.preventDefault();
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    showToast('Ingresa correo y contraseña para autenticar con Amazon Cognito.', 'warning');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i><span>Validando en AWS...</span>';
  }

  try {
    if (!window.authService) {
      throw new Error('Servicio de autenticación no inicializado.');
    }
    const authUser = await window.authService.login(email, password);
    state.currentRole = authUser.role;
    state.currentUser = authUser;
    state.currentView = authUser.isAdmin ? 'admin_usuarios' : 'dashboard';
    showToast('Sesión validada exitosamente con Amazon Cognito.', 'info');
    render();

    // Sincronización de datos remotos según el rol
    if (authUser.isAdmin) {
      // El Administrador de Cuentas únicamente sincroniza la gestión de usuarios
      if (typeof window.recargarAdminUsuariosApi === 'function') {
        window.recargarAdminUsuariosApi();
      }
    } else {
      if (typeof window.recargarSolicitudesApi === 'function') {
        window.recargarSolicitudesApi();
      }
      if (typeof window.recargarProveedoresApi === 'function') {
        window.recargarProveedoresApi();
      }
      if (typeof window.recargarBorradoresApi === 'function' && authUser.role === 'solicitante') {
        window.recargarBorradoresApi();
      }
      if (typeof window.recargarAprobacionesApi === 'function' && (authUser.role === 'gerente' || authUser.role === 'director')) {
        window.recargarAprobacionesApi();
      }
    }
  } catch (err) {
    console.error('[AURA Auth Error]', err);
    if (err.status === 403 && err.message && (err.message.includes('aprobación') || err.message.includes('autorizada') || err.message.includes('PENDING_APPROVAL'))) {
      state.pendingEmail = email;
      state.currentView = 'espera_aprobacion';
      render();
      return;
    }
    showToast('Error de autenticación: ' + (err.message || 'Credenciales inválidas'), 'warning');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
};

window.handleRecuperarSubmit = function(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  showToast('Operación no disponible: El autoservicio de recuperación no está configurado en Cognito. Contacta al Administrador de Cuentas.', 'warning');
};

window.handleLogout = async function() {
  if (window.authService) {
    try {
      await window.authService.logoutRemote();
    } catch (e) {
      console.warn('[AURA] Logout local:', e.message);
    }
  }
  state.currentRole = null;
  state.currentUser = null;
  state.loginCreds = { email: '', password: '' };
  state.solicitudes = [];
  state.proveedores = [];
  state.adminUsuarios = [];
  state.borradoresRemotos = [];
  state.editingDraftId = null;
  state.currentView = 'login';
  showToast('Sesión cerrada y revocada correctamente.', 'info');
  render();
};

window.setFilterCategoria = function(cat) {
  state.activeFilterCategoria = cat;
  render();
};

// ----------------- NORMALIZACIÓN DYNAMODB A FIGMA UI -----------------
window.normalizarSolicitudDesdeApi = function(raw) {
  if (!raw) return null;
  const requestId = raw.requestId || raw.id || `REQ-${Date.now()}`;
  const amount = Number(raw.amount !== undefined ? raw.amount : (raw.monto !== undefined ? raw.monto : (raw.total || 0)));
  const rawStatus = raw.status !== undefined ? raw.status : (raw.estado !== undefined ? raw.estado : '');
  const statusUpper = String(rawStatus || '').trim().toUpperCase();

  // Mapeo explícito de contratos backend y aislamiento estricto de estados legados
  let estadoNormalizado = 'legado';
  let isLegacyOrReadOnly = false;

  switch (statusUpper) {
    case 'PENDING':
    case 'PENDING_APPROVAL':
      estadoNormalizado = 'en_revision';
      break;
    case 'APPROVED':
      estadoNormalizado = 'aprobado';
      break;
    case 'REJECTED':
      estadoNormalizado = 'rechazado';
      break;
    case 'CANCELLED':
      estadoNormalizado = 'anulado';
      break;
    case 'DRAFT':
      estadoNormalizado = 'borrador';
      break;
    case 'REGISTERING':
    case 'SUBMITTED':
      estadoNormalizado = 'registrando';
      break;
    case 'REQUIRES_SUPERVISOR':
    case 'REQUIRES_MANAGER':
      estadoNormalizado = 'legado';
      isLegacyOrReadOnly = true;
      break;
    default:
      if (!rawStatus) {
        // Fallback default si viene completamente vacío en pruebas iniciales
        estadoNormalizado = 'en_revision';
      } else {
        // Cualquier estado desconocido o no homologado se conserva en modo legado/solo lectura
        estadoNormalizado = 'legado';
        isLegacyOrReadOnly = true;
      }
      break;
  }

  let fechaFormateada = 'Hoy';
  if (raw.createdAt || raw.startDate || raw.fecha) {
    try {
      const d = new Date(raw.createdAt || raw.startDate || raw.fecha);
      if (!isNaN(d.getTime())) {
        fechaFormateada = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } else {
        fechaFormateada = String(raw.fecha || 'Hoy');
      }
    } catch {
      fechaFormateada = 'Hoy';
    }
  }

  const articulosRaw = Array.isArray(raw.articulos) ? raw.articulos : (Array.isArray(raw.items) ? raw.items : null);
  const itemsNormalizados = articulosRaw && articulosRaw.length > 0
    ? articulosRaw.map(it => ({
        nombre: it.nombre || 'Partida',
        cantidad: Number(it.cantidad || 1),
        precio: Number(it.precioUnitario !== undefined ? it.precioUnitario : (it.precio || 0)),
        subtotal: Number(it.subtotal !== undefined ? it.subtotal : (Number(it.cantidad || 1) * Number(it.precioUnitario || it.precio || 0)))
      }))
    : [
        {
          nombre: raw.description || raw.descripcion || 'Partida general',
          cantidad: 1,
          precio: amount,
          subtotal: amount
        }
      ];

  // Resolver nombre de proveedor desde el catálogo si viene proveedorId (PRV-001)
  let proveedorNombre = raw.proveedor || raw.supplier || 'Proveedor Asignado';
  if (raw.proveedorId && state.proveedores && state.proveedores.length > 0) {
    const provEncontrado = state.proveedores.find(p => p.id === raw.proveedorId);
    if (provEncontrado) proveedorNombre = provEncontrado.nombre;
  }

  // Extraer motivo de anulación / comentarios desde historial de eventos de DynamoDB (history) o raíz
  let motivoAnulacionDetectado = raw.cancellationReason || raw.motivoAnulacion || raw.motivo || raw.comentarios || raw.comments || '';
  if (!motivoAnulacionDetectado && Array.isArray(raw.history)) {
    const cancelEvent = [...raw.history].reverse().find(h => h && (h.status === 'CANCELLED' || h.comentarios || h.comments));
    if (cancelEvent) {
      motivoAnulacionDetectado = cancelEvent.comentarios || cancelEvent.comments || '';
    }
  }

  // Regla oficial: hasta $1,000 Gerente; más de $1,000 Director
  const esAltoMonto = raw.requiereAprobacionDe 
    ? raw.requiereAprobacionDe.toLowerCase() === 'director'
    : (raw.esAltoMonto !== undefined ? Boolean(raw.esAltoMonto) : amount > 1000);

  return {
    id: requestId,
    requestId: requestId,
    draftId: raw.draftId || (raw.id && (String(raw.id).startsWith('DRAFT-') || String(raw.id).startsWith('BR-') || String(raw.id).startsWith('d-')) ? raw.id : null),
    status: raw.status || rawStatus || (estadoNormalizado === 'en_revision' ? 'PENDING' : statusUpper),
    rawStatus: statusUpper,
    isLegacyOrReadOnly: isLegacyOrReadOnly,
    descripcion: raw.description || raw.descripcion || 'Sin descripción especificada',
    solicitante: raw.applicant || raw.solicitante || 'usuario@empresa.com',
    applicantSub: raw.applicantSub || raw.sub || null,
    departamento: raw.department || raw.departamento || 'DEP-TI',
    proveedor: proveedorNombre,
    proveedorId: raw.proveedorId || null,
    total: amount,
    estado: estadoNormalizado,
    fecha: fechaFormateada,
    items: itemsNormalizados,
    comentariosGerente: raw.comments || raw.comentariosGerente || raw.dictamen || '',
    comentarios: motivoAnulacionDetectado,
    motivoAnulacion: motivoAnulacionDetectado,
    history: Array.isArray(raw.history) ? raw.history : [],
    esAltoMonto: esAltoMonto,
    aprobador: raw.decidedBy || raw.aprobador || raw.approver || '',
    executionArn: raw.executionArn || '',
    version: Number(raw.version || 1),
    submitVersion: Number(raw.submitVersion || raw.version || 1)
  };
};

// ----------------- INTEGRACIÓN API SOLICITUDES -----------------
window.cargarSiguientePagina = async function() {
  if (!state.apiState.cursor) return;
  await window.recargarSolicitudesApi(state.apiState.cursor);
};

window.recargarSolicitudesApi = async function(cursor = null) {
  if (!window.apiService) return;
  state.apiState.isLoading = true;
  render();

  try {
    const data = await window.apiService.getSolicitudes(10, cursor);
    if (data && Array.isArray(data.solicitudes)) {
      const normalizadas = data.solicitudes.map(s => window.normalizarSolicitudDesdeApi(s)).filter(Boolean);

      if (cursor) {
        const idsExistentes = new Set(state.solicitudes.map(x => x.id));
        const unicas = normalizadas.filter(x => !idsExistentes.has(x.id));
        state.solicitudes = [...state.solicitudes, ...unicas];
      } else {
        // Conservar borradores privados en memoria local del usuario si existen
        const borradoresActuales = state.currentRole === 'compras' 
          ? [] 
          : state.solicitudes.filter(s => s.estado === 'borrador');
        const idsBorradores = new Set(borradoresActuales.map(b => b.id));
        const nuevasSinBorrador = normalizadas.filter(x => !idsBorradores.has(x.id));
        state.solicitudes = [...borradoresActuales, ...nuevasSinBorrador];
      }

      state.apiState.cursor = data.siguienteCursor || null;
      state.apiState.hayMasRegistros = Boolean(data.hayMasRegistros);
      state.apiState.totalApi = data.total || state.solicitudes.length;
      state.apiState.isConnected = true;
    }
  } catch (err) {
    console.warn('[AURA] No se pudo sincronizar con API de solicitudes:', err.message);
    state.apiState.isConnected = false;
  } finally {
    state.apiState.isLoading = false;
    render();
  }
};

// ----------------- INTEGRACIÓN BANDEJA OFICIAL DE APROBACIONES (GET /api/aprobaciones) -----------------
window.cargarSiguientePaginaAprobaciones = async function() {
  if (!state.aprobacionesState.cursor) return;
  await window.recargarAprobacionesApi(state.aprobacionesState.cursor);
};

window.recargarAprobacionesApi = async function(cursor = null) {
  if (!window.apiService) return;
  if (state.currentRole !== 'gerente' && state.currentRole !== 'director') return;
  state.aprobacionesState.isLoading = true;
  render();

  try {
    const data = await window.apiService.getAprobaciones(20, cursor);
    if (data && Array.isArray(data.solicitudes)) {
      const normalizadas = data.solicitudes.map(s => window.normalizarSolicitudDesdeApi(s)).filter(Boolean);

      if (cursor) {
        const idsExistentes = new Set(state.aprobaciones.map(x => x.id));
        const unicas = normalizadas.filter(x => !idsExistentes.has(x.id));
        state.aprobaciones = [...state.aprobaciones, ...unicas];
      } else {
        state.aprobaciones = normalizadas;
      }

      state.aprobacionesState.cursor = data.siguienteCursor || null;
      // Una página sin resultados puede tener cursor siguiente: no detener solo porque venga vacía
      state.aprobacionesState.hayMasRegistros = Boolean(data.hayMasRegistros || data.siguienteCursor);
      state.aprobacionesState.totalApi = data.total || state.aprobaciones.length;
      state.aprobacionesState.isConnected = true;
    }
  } catch (err) {
    console.warn('[AURA] Error al sincronizar bandeja de aprobaciones:', err.message);
    state.aprobacionesState.isConnected = false;
  } finally {
    state.aprobacionesState.isLoading = false;
    render();
  }
};

window.verDetalleSolicitud = async function(id) {
  state.selectedSolicitudId = id;
  state.currentView = 'detalle_solicitud';
  render();

  if (window.apiService && id) {
    let sLocal = state.solicitudes.find(x => x.id === id || x.requestId === id || (x.draftId && x.draftId === id));
    if (sLocal && sLocal.id && sLocal.id !== id && (id.startsWith('DRAFT-') || id.startsWith('BR-') || id.startsWith('d-') || sLocal.draftId === id)) {
      state.selectedSolicitudId = sLocal.id;
      id = sLocal.id;
    }

    const esBorrador = (sLocal && sLocal.estado === 'borrador') ||
                       (state.borradoresRemotos && state.borradoresRemotos.some(b => (b.id || b.draftId) === id)) ||
                       id.startsWith('DRAFT-') || id.startsWith('BR-') || id.startsWith('d-');

    // Apertura de borradores mediante /api/borradores/:id
    if (esBorrador) {
      try {
        const detalle = await window.apiService.getBorradorById(id);
        if (detalle) {
          const rawItem = detalle.borrador || detalle.draft || detalle.data || detalle;
          const normalizado = window.normalizarBorradorDesdeApi ? window.normalizarBorradorDesdeApi(rawItem) : window.normalizarSolicitudDesdeApi(rawItem);
          const idx = state.solicitudes.findIndex(x => x.id === id);
          if (idx !== -1) {
            state.solicitudes[idx] = { ...state.solicitudes[idx], ...normalizado };
          } else {
            state.solicitudes.push(normalizado);
          }
          render();
        }
      } catch (err) {
        if (err.status === 404) {
          console.warn(`[AURA] Borrador ${id} no encontrado en DynamoDB (404).`);
          state.selectedSolicitudId = '__NOT_FOUND__';
          render();
        } else {
          console.warn(`[AURA] Error al consultar detalle de borrador ${id}:`, err.message);
        }
      }
      return;
    }

    try {
      const detalle = await window.apiService.getSolicitudById(id);
      if (detalle) {
        const rawItem = detalle.solicitud || detalle.data || detalle;
        const normalizado = window.normalizarSolicitudDesdeApi(rawItem);
        const idx = state.solicitudes.findIndex(x => x.id === id);
        if (idx !== -1) {
          state.solicitudes[idx] = { ...state.solicitudes[idx], ...normalizado };
        } else {
          state.solicitudes.push(normalizado);
        }
        render();
      }
    } catch (err) {
      if (err.status === 404) {
        // Verificar si la solicitud está en proceso de registro asíncrono en Step Functions
        if (sLocal && (sLocal.status === 'REGISTERING' || sLocal.estado === 'registrando')) {
          try {
            const reg = await window.apiService.getSolicitudRegistro(id);
            if (reg && (reg.estado === 'REGISTERING' || reg.estado === 'PERSISTED')) {
              const doc = reg.solicitud || reg.documento;
              if (doc) {
                const normalizado = window.normalizarSolicitudDesdeApi(doc);
                const idx = state.solicitudes.findIndex(x => x.id === id || x.requestId === id);
                if (idx !== -1) state.solicitudes[idx] = { ...state.solicitudes[idx], ...normalizado };
                else state.solicitudes.push(normalizado);
              }
              render();
              return;
            }
          } catch {}
        }

        // Fallback: Si el id corresponde a un borrador, intentar consultar /api/borradores/:id
        if (id.startsWith('DRAFT-') || id.startsWith('BR-') || id.startsWith('d-')) {
          try {
            const detalleBorrador = await window.apiService.getBorradorById(id);
            if (detalleBorrador) {
              const rawItem = detalleBorrador.borrador || detalleBorrador.draft || detalleBorrador.data || detalleBorrador;
              const normalizado = window.normalizarBorradorDesdeApi ? window.normalizarBorradorDesdeApi(rawItem) : window.normalizarSolicitudDesdeApi(rawItem);
              const idx = state.solicitudes.findIndex(x => x.id === id);
              if (idx !== -1) {
                state.solicitudes[idx] = { ...state.solicitudes[idx], ...normalizado };
              } else {
                state.solicitudes.push(normalizado);
              }
              render();
              return;
            }
          } catch (draftErr) {
            // No se encontró como borrador tampoco
          }
        }
        console.warn(`[AURA] Solicitud ${id} no encontrada en DynamoDB (404).`);
        state.selectedSolicitudId = '__NOT_FOUND__';
        render();
      } else {
        console.warn(`[AURA] Error al consultar detalle de ${id}:`, err.message);
      }
    }
  }
};

window.dictaminarSolicitud = async function(id, resultado, comentarioUsuario = null) {
  const lockKey = `dictamen_${id}`;
  if (state.inFlightOperations && state.inFlightOperations.has(lockKey)) {
    return;
  }
  if (state.inFlightOperations) {
    state.inFlightOperations.add(lockKey);
  }

  if (state.currentRole === 'solicitante') {
    showToast('Acceso Denegado: Un solicitante no tiene permisos de dictamen.', 'warning');
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }
  if (state.currentRole === 'compras') {
    showToast('Acceso Denegado: Compras no tiene permisos de dictamen según la matriz de roles.', 'warning');
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }

  const s = state.solicitudes.find(x => x.id === id);
  if (!s) {
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }

  // Validación estricta de estado: Solo PENDING admite dictamen en el flujo oficial
  const statusMayus = String(s.status || s.rawStatus || '').toUpperCase();
  const esLegado = ['REQUIRES_SUPERVISOR', 'REQUIRES_MANAGER'].includes(statusMayus) || s.isLegacyOrReadOnly || s.estado === 'legado';
  const esFinal = ['APPROVED', 'REJECTED', 'CANCELLED', 'REGISTERING', 'SUBMITTED', 'DRAFT'].includes(statusMayus) || s.estado === 'aprobado' || s.estado === 'rechazado' || s.estado === 'anulado' || s.estado === 'borrador';

  if (esLegado || esFinal || (statusMayus && statusMayus !== 'PENDING' && statusMayus !== 'PENDING_APPROVAL')) {
    showToast('El estado de la solicitud no admite dictamen en el flujo actual. Actualiza el listado o solicita la revisión del registro.', 'warning');
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }

  // Validación de monto: Gerente hasta $1,000; Director más de $1,000
  if (state.currentRole === 'gerente' && s.esAltoMonto) {
    showToast('Acceso Denegado: Solicitudes de alto monto (> $1,000 USD) corresponden a Dirección General.', 'warning');
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }
  if (state.currentRole === 'director' && !s.esAltoMonto) {
    showToast('Acceso Denegado: Solicitudes ordinarias (≤ $1,000 USD) corresponden a Gerencia.', 'warning');
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }

  const decisionAws = resultado === 'aprobado' ? 'APPROVED' : 'REJECTED';

  // Exigir comentario obligatorio tanto al aprobar como al rechazar
  let comentarioFinal = comentarioUsuario;
  if (!comentarioFinal || !comentarioFinal.trim()) {
    if (typeof prompt === 'function') {
      const promptMsg = decisionAws === 'APPROVED' 
        ? 'Ingresa el comentario obligatorio de justificación para APROBAR la solicitud:' 
        : 'Ingresa el motivo obligatorio de rechazo para RECHAZAR la solicitud:';
      comentarioFinal = prompt(promptMsg, decisionAws === 'APPROVED' ? 'Aprobado conforme a presupuesto y necesidad justificada.' : '');
    } else {
      comentarioFinal = decisionAws === 'APPROVED' 
        ? 'Aprobado conforme a presupuesto y necesidad justificada.' 
        : 'Rechazado tras evaluación técnica-financiera.';
    }
    if (!comentarioFinal || !comentarioFinal.trim()) {
      showToast('El comentario es obligatorio tanto al aprobar como al rechazar.', 'warning');
      if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
      return;
    }
  }

  const currentUser = (state.currentUser && state.currentUser.name) || (state.users && state.users[state.currentRole] ? state.users[state.currentRole].name : 'Ing. Herberth');

  try {
    if (window.apiService && id) {
      await window.apiService.dictaminarSolicitud(id, {
        decision: decisionAws,
        comentarios: comentarioFinal.trim(),
        comentario: comentarioFinal.trim(),
        aprobador: currentUser,
        decidedBy: currentUser
      });
      showToast(`Solicitud ${id} ${resultado.toUpperCase()} y registrada en AWS DynamoDB.`, resultado === 'aprobado' ? 'success' : 'warning');
      s.estado = resultado;
      s.status = decisionAws;
      s.fechaDictamen = 'Hoy';
      s.aprobador = currentUser;
      s.comentariosGerente = comentarioFinal.trim();
    }
  } catch (err) {
    console.warn(`[AURA] Falla al persistir dictamen en backend/AWS:`, err.message);
    if (err.status === 409) {
      showToast(`Conflicto (HTTP 409): ${err.message}`, 'warning');
    } else {
      showToast(`Error al registrar dictamen en AWS: ${err.message}`, 'error');
    }
  } finally {
    // Tras éxito o conflicto 409, refrescar registro remoto, bandeja de aprobaciones y retirar acciones
    if (window.apiService && id) {
      try {
        const fresh = await window.apiService.getSolicitudById(id);
        if (fresh && fresh.solicitud) {
          const norm = window.normalizarSolicitudDesdeApi(fresh.solicitud);
          Object.assign(s, norm);
        }
      } catch {}
    }
    if (typeof window.recargarAprobacionesApi === 'function') {
      await window.recargarAprobacionesApi();
    }
    if (typeof window.recargarSolicitudesApi === 'function') {
      await window.recargarSolicitudesApi();
    }
    if (state.inFlightOperations) {
      state.inFlightOperations.delete(lockKey);
    }
    render();
  }
};

window.generarSiguienteIdLocal = function() {
  const anio = new Date().getFullYear();
  const corr = String(state.solicitudes.length + 1).padStart(4, '0');
  return `SC-${anio}-${corr}`;
};

// ----------------- FORMULARIO REACTIVO DE SOLICITUD -----------------
window.actualizarCampoForm = function(campo, valor) {
  state.nuevaSolicitudForm[campo] = valor;
  if (campo === 'proveedorId') {
    const p = state.proveedores.find(x => x.id === valor);
    if (p) state.nuevaSolicitudForm.proveedor = p.nombre;
  }

  // Si es descripción, actualizar el estado y contador SIN reconstruir el input para no perder foco
  if (campo === 'descripcion') {
    const contador = document.getElementById('solicitud-desc-contador');
    if (contador) contador.textContent = `${(valor || '').length} / 1000`;
    const errDesc = document.getElementById('error-solicitud-desc');
    if (errDesc && valor && valor.trim().length <= 1000) {
      errDesc.classList.add('hidden');
      errDesc.textContent = '';
      const inputEl = document.getElementById('solicitud-desc');
      if (inputEl) inputEl.classList.remove('border-red-500');
    }
    return;
  }
};

window.agregarFilaItem = function() {
  state.nuevaSolicitudForm.items.push({
    nombre: '',
    cantidad: 1,
    precio: 0,
    precioUnitario: 0,
    subtotal: 0
  });
  render();
};

window.eliminarFilaItem = function(idx) {
  if (state.nuevaSolicitudForm.items.length > 1) {
    state.nuevaSolicitudForm.items.splice(idx, 1);
    render();
  }
};

window.actualizarItem = function(idx, campo, valor) {
  const it = state.nuevaSolicitudForm.items[idx];
  if (!it) return;

  if (campo === 'precio') {
    // Evitar que el usuario ingrese más de 2 decimales (.00) en tiempo real
    if (typeof valor === 'string' && valor.includes('.')) {
      const partes = valor.split('.');
      if (partes[1] && partes[1].length > 2) {
        valor = partes[0] + '.' + partes[1].slice(0, 2);
        const inputEl = document.getElementById(`item-precio-${idx}`);
        if (inputEl) inputEl.value = valor;
      }
    }
    it.precio = Number(valor);
    it.subtotal = (Number(it.cantidad || 0) * Number(it.precio || 0));
    it.precioUnitario = Number(it.precio || 0);

    const subtotalEl = document.getElementById(`item-subtotal-${idx}`);
    if (subtotalEl) {
      subtotalEl.textContent = `$${it.subtotal.toFixed(2)}`;
    }
    window.actualizarBannerTotal();
  } else if (campo === 'cantidad') {
    it.cantidad = Number(valor);
    it.subtotal = (Number(it.cantidad || 0) * Number(it.precio || 0));
    it.precioUnitario = Number(it.precio || 0);

    const subtotalEl = document.getElementById(`item-subtotal-${idx}`);
    if (subtotalEl) {
      subtotalEl.textContent = `$${it.subtotal.toFixed(2)}`;
    }
    window.actualizarBannerTotal();
  } else {
    it[campo] = valor;
  }
};

window.actualizarBannerTotal = function() {
  const form = state.nuevaSolicitudForm;
  const totalCalculado = form.items.reduce((acc, it) => acc + (Number(it.cantidad || 0) * Number(it.precio || 0)), 0);
  const esAltoMonto = totalCalculado > 1000;

  const totalEl = document.getElementById('total-estimado-valor');
  if (totalEl) totalEl.textContent = `$${totalCalculado.toFixed(2)}`;

  const bannerEl = document.getElementById('banner-politica-dictamen');
  const tituloEl = document.getElementById('banner-titulo');
  const subtituloEl = document.getElementById('banner-subtitulo');
  const iconoEl = document.getElementById('banner-icono');

  if (bannerEl && tituloEl && subtituloEl && iconoEl) {
    if (esAltoMonto) {
      bannerEl.className = 'p-3.5 rounded-xl border flex items-center justify-between transition-colors bg-amber-500/10 border-amber-500/40 text-amber-300';
      iconoEl.className = 'fa-solid fa-triangle-exclamation text-amber-400 text-base';
      tituloEl.textContent = 'Solicitud de Alto Monto (> $1,000 USD)';
      subtituloEl.textContent = 'Monto superior a $1,000: requiere dictamen exclusivo de Dirección General.';
    } else {
      bannerEl.className = 'p-3.5 rounded-xl border flex items-center justify-between transition-colors bg-emerald-500/10 border-emerald-500/40 text-emerald-300';
      iconoEl.className = 'fa-solid fa-circle-check text-emerald-400 text-base';
      tituloEl.textContent = 'Aprobación ordinaria de Gerencia (Hasta $1,000 USD)';
      subtituloEl.textContent = 'Monto de hasta $1,000: aprobación directa de Gerencia.';
    }
  }
};

window.confirmarLimpiarFormulario = function() {
  const confirmar = typeof confirm === 'function' ? confirm('¿Deseas restablecer el formulario? Se perderán los cambios no guardados.') : true;
  if (!confirmar) return;

  state.editingDraftId = null;
  state.nuevaSolicitudForm = {
    descripcion: '',
    departamento: 'DEP-TI',
    proveedor: '',
    proveedorId: '',
    items: [{ nombre: '', cantidad: 1, precio: 0, subtotal: 0 }]
  };
  render();
  showToast('Formulario restablecido.', 'info');
};

window.validarFormularioSolicitud = function(esEnvioFinal = false) {
  const errores = [];
  const descInput = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('solicitud-desc') : null;
  const desc = (descInput?.value || state.nuevaSolicitudForm.descripcion || '').trim();

  // Limpiar errores visuales inline previos si el DOM está disponible
  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    document.querySelectorAll('.form-inline-error').forEach(el => el.remove());
    document.querySelectorAll('.border-red-500').forEach(el => el.classList && el.classList.remove('border-red-500'));
  }
  const errDescGlobal = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('error-solicitud-desc') : null;
  if (errDescGlobal && errDescGlobal.classList) {
    errDescGlobal.classList.add('hidden');
    errDescGlobal.textContent = '';
  }

  // 1. Validar descripción
  if (esEnvioFinal) {
    // Para envío a firma: la descripción es obligatoria (1-1000 caracteres)
    if (!desc) {
      errores.push({ campo: 'descripcion', mensaje: 'La descripción general es obligatoria para enviar la solicitud.' });
      if (descInput && descInput.classList) descInput.classList.add('border-red-500');
      if (errDescGlobal) {
        errDescGlobal.textContent = 'La descripción general es obligatoria para enviar la solicitud.';
        if (errDescGlobal.classList) errDescGlobal.classList.remove('hidden');
      }
    } else if (desc.length > 1000) {
      errores.push({ campo: 'descripcion', mensaje: 'La descripción no debe exceder los 1,000 caracteres.' });
      if (descInput && descInput.classList) descInput.classList.add('border-red-500');
      if (errDescGlobal) {
        errDescGlobal.textContent = 'La descripción no debe exceder los 1,000 caracteres.';
        if (errDescGlobal.classList) errDescGlobal.classList.remove('hidden');
      }
    }
  } else {
    // Para borrador: se permite incompleta (opcional o vacía), pero si se escribe texto no debe superar el límite de 1,000 caracteres
    if (desc && desc.length > 1000) {
      errores.push({ campo: 'descripcion', mensaje: 'La descripción no debe exceder los 1,000 caracteres.' });
      if (descInput && descInput.classList) descInput.classList.add('border-red-500');
      if (errDescGlobal) {
        errDescGlobal.textContent = 'La descripción no debe exceder los 1,000 caracteres.';
        if (errDescGlobal.classList) errDescGlobal.classList.remove('hidden');
      }
    }
  }

  // 2. Validar proveedor (en envío final es obligatorio)
  const provSelect = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('solicitud-prov') : null;
  const provId = (provSelect?.value || state.nuevaSolicitudForm.proveedorId || '').trim();
  if (esEnvioFinal && !provId) {
    errores.push({ campo: 'proveedorId', mensaje: 'Debes seleccionar un proveedor del catálogo oficial para enviar la solicitud.' });
    if (provSelect && provSelect.classList) provSelect.classList.add('border-red-500');
  }

  // 3. Validar artículos
  const items = state.nuevaSolicitudForm.items || [];
  if (esEnvioFinal && items.length === 0) {
    errores.push({ campo: 'items', mensaje: 'Debes cotizar al menos un artículo para enviar la solicitud.' });
  }

  items.forEach((it, idx) => {
    const rowEl = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById(`item-row-${idx}`) : null;
    const nombreInput = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById(`item-nombre-${idx}`) : null;
    const cantidadInput = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById(`item-cantidad-${idx}`) : null;
    const precioInput = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById(`item-precio-${idx}`) : null;

    const nombre = ((nombreInput && nombreInput.value !== undefined && nombreInput.value !== '') ? nombreInput.value : (it.nombre || '')).trim();
    const cantVal = (cantidadInput && cantidadInput.value !== undefined && cantidadInput.value !== '') ? cantidadInput.value : (it.cantidad !== undefined ? it.cantidad : 1);
    const cantidad = Number(cantVal);
    const precVal = (precioInput && precioInput.value !== undefined && precioInput.value !== '') ? precioInput.value : (it.precio !== undefined ? it.precio : (it.precioUnitario !== undefined ? it.precioUnitario : 0));
    const precio = Number(precVal);

    const filaErrores = [];

    if (esEnvioFinal) {
      // Envío formal exige datos completos y consistentes:
      if (!nombre) {
        filaErrores.push('Nombre requerido');
        if (nombreInput && nombreInput.classList) nombreInput.classList.add('border-red-500');
      }

      if (isNaN(cantidad) || cantidad <= 0) {
        filaErrores.push('Cantidad debe ser > 0');
        if (cantidadInput && cantidadInput.classList) cantidadInput.classList.add('border-red-500');
      } else if (cantidad > 10000) {
        filaErrores.push('Máximo 10,000 unidades');
        if (cantidadInput && cantidadInput.classList) cantidadInput.classList.add('border-red-500');
      } else if (!Number.isInteger(cantidad)) {
        filaErrores.push('Para enviar, cantidad debe ser entero ≥ 1');
        if (cantidadInput && cantidadInput.classList) cantidadInput.classList.add('border-red-500');
      }

      if (isNaN(precio) || precio <= 0) {
        filaErrores.push('Precio debe ser > $0');
        if (precioInput && precioInput.classList) precioInput.classList.add('border-red-500');
      }
    } else {
      // Guardado de borrador permite datos incompletos dentro de los límites:
      // Si se ingresa cantidad, no debe ser negativa ni superar 10,000 unidades
      if (!isNaN(cantidad)) {
        if (cantidad < 0) {
          filaErrores.push('Cantidad no puede ser negativa');
          if (cantidadInput && cantidadInput.classList) cantidadInput.classList.add('border-red-500');
        } else if (cantidad > 10000) {
          filaErrores.push('Máximo 10,000 unidades');
          if (cantidadInput && cantidadInput.classList) cantidadInput.classList.add('border-red-500');
        }
      }
      if (!isNaN(precio) && precio < 0) {
        filaErrores.push('Precio no puede ser negativo');
        if (precioInput && precioInput.classList) precioInput.classList.add('border-red-500');
      }
    }

    if (filaErrores.length > 0) {
      errores.push({ campo: `item-${idx}`, mensaje: `Artículo #${idx + 1}: ${filaErrores.join(', ')}.` });
      if (rowEl && typeof document.createElement === 'function' && typeof rowEl.after === 'function') {
        const errorRow = document.createElement('tr');
        errorRow.className = 'form-inline-error bg-red-500/10 text-red-400 text-[11px]';
        errorRow.innerHTML = `<td colspan="5" class="py-1 px-3"><i class="fa-solid fa-circle-exclamation mr-1"></i>Fila #${idx + 1}: ${filaErrores.join(', ')}.</td>`;
        rowEl.after(errorRow);
      }
    }
  });

  return errores;
};

// ----------------- GESTIÓN DE BORRADORES (DYNAMODB) -----------------
window.guardarBorrador = async function() {
  const errores = window.validarFormularioSolicitud ? window.validarFormularioSolicitud(false) : [];
  if (errores.length > 0) {
    showToast('Corrige los campos señalados en el formulario antes de guardar.', 'warning');
    return;
  }

  const desc = (document.getElementById('solicitud-desc')?.value || state.nuevaSolicitudForm.descripcion || '').trim();
  const dep = document.getElementById('solicitud-dep')?.value || state.nuevaSolicitudForm.departamento || 'DEP-TI';
  const provId = document.getElementById('solicitud-prov')?.value || state.nuevaSolicitudForm.proveedorId || '';
  const total = state.nuevaSolicitudForm.items.reduce((acc, it) => acc + (Number(it.cantidad || 0) * Number(it.precio || 0)), 0);

  const payloadBorrador = {
    description: desc || 'Borrador sin título',
    department: dep || 'DEP-TI',
    proveedorId: provId || '',
    amount: total,
    articulos: (state.nuevaSolicitudForm.items || []).map(it => ({
      nombre: (it.nombre || '').trim() || 'Partida',
      cantidad: Number(it.cantidad || 1),
      precioUnitario: Number(it.precio || 0)
    }))
  };

  if (!window.apiService) {
    showToast('Servicio API no inicializado.', 'error');
    return;
  }

  try {
    let res;
    if (state.editingDraftId) {
      const existingDraft = state.solicitudes.find(s => s.id === state.editingDraftId);
      const version = existingDraft ? (existingDraft.version || 1) : 1;
      res = await window.apiService.updateBorrador(state.editingDraftId, payloadBorrador, version);
      showToast(`Borrador ${state.editingDraftId} actualizado exitosamente en DynamoDB.`, 'success');
    } else {
      res = await window.apiService.createBorrador(payloadBorrador);
      const draftId = (res && (res.borrador?.id || res.id || res.draftId)) || 'BR-OK';
      showToast(`Borrador ${draftId} guardado exitosamente en AWS DynamoDB.`, 'success');
    }

    state.editingDraftId = null;
    state.nuevaSolicitudForm = {
      descripcion: '',
      departamento: 'DEP-TI',
      proveedor: '',
      proveedorId: '',
      items: [{ nombre: '', cantidad: 1, precio: 0, subtotal: 0 }]
    };

    await window.recargarBorradoresApi();
    navigateTo('solicitudes');
  } catch (err) {
    console.error('[AURA Guardar Borrador Error]', err);
    // Conservar formulario intacto para no perder datos del usuario
    showToast('Error al guardar borrador en AWS: ' + err.message, 'warning');
  }
};

window.abrirBorrador = async function(id) {
  if (window.apiService && typeof window.apiService.getBorradorById === 'function' && id) {
    try {
      const res = await window.apiService.getBorradorById(id);
      if (res) {
        const rawItem = res.borrador || res.draft || res.data || res;
        const normalizado = window.normalizarBorradorDesdeApi ? window.normalizarBorradorDesdeApi(rawItem) : window.normalizarSolicitudDesdeApi(rawItem);
        const idx = state.solicitudes.findIndex(x => x.id === id);
        if (idx !== -1) {
          state.solicitudes[idx] = { ...state.solicitudes[idx], ...normalizado };
        } else {
          state.solicitudes.push(normalizado);
        }
      }
    } catch (err) {
      console.warn(`[AURA] abrirBorrador ${id} desde API:`, err.message);
    }
  }
  return window.editarBorrador(id);
};

window.editarBorrador = function(id) {
  let s = state.solicitudes.find(x => x.id === id) || (state.borradoresRemotos && state.borradoresRemotos.find(b => (b.id || b.draftId) === id));

  if (!s) {
    showToast('Borrador no encontrado.', 'warning');
    return;
  }
  const statusStr = String(s.status || s.estado || '').toUpperCase();
  if (statusStr === 'REGISTERING') {
    showToast(`El borrador ${id} se encuentra en proceso de registro en AWS (REGISTERING) y no puede ser editado.`, 'warning');
    return;
  }

  // Establecer estado de edición de forma inmediata y síncrona
  state.editingDraftId = id;
  const rawItems = (s.items && s.items.length > 0) ? s.items : [{ nombre: '', cantidad: 1, precio: 0, subtotal: 0 }];
  const itemsNormalizados = rawItems.map(it => {
    const cantidad = Number(it.cantidad || it.quantity || 1);
    const precio = Number(it.precio !== undefined ? it.precio : (it.precioUnitario !== undefined ? it.precioUnitario : (it.unitPrice !== undefined ? it.unitPrice : 0)));
    const subtotal = Number(it.subtotal !== undefined ? it.subtotal : (cantidad * precio));
    return {
      nombre: it.nombre || it.name || it.descripcion || '',
      cantidad,
      precio,
      precioUnitario: precio,
      subtotal
    };
  });

  state.nuevaSolicitudForm = {
    descripcion: s.descripcion || '',
    departamento: s.departamento || 'DEP-TI',
    proveedor: s.proveedor || '',
    proveedorId: s.proveedorId || '',
    items: itemsNormalizados
  };
  navigateTo('nueva_solicitud');

  // Si hay servicio API disponible con token, refrescar la versión remota de DynamoDB en segundo plano
  if (window.apiService && typeof window.apiService.getBorradorById === 'function' && id) {
    const token = window.apiService.token || (window.authService && window.authService.getAccessToken && window.authService.getAccessToken());
    if (token) {
      window.apiService.getBorradorById(id).then(res => {
        if (res) {
          const rawItem = res.borrador || res.draft || res.data || res;
          const normalizado = window.normalizarBorradorDesdeApi ? window.normalizarBorradorDesdeApi(rawItem) : window.normalizarSolicitudDesdeApi(rawItem);
          const idx = state.solicitudes.findIndex(x => x.id === id);
          if (idx !== -1) {
            state.solicitudes[idx] = { ...state.solicitudes[idx], ...normalizado };
          } else {
            state.solicitudes.push(normalizado);
          }
          if (state.editingDraftId === id && normalizado) {
            state.nuevaSolicitudForm.descripcion = normalizado.descripcion || state.nuevaSolicitudForm.descripcion;
            if (normalizado.items && normalizado.items.length > 0) {
              state.nuevaSolicitudForm.items = normalizado.items;
            }
          }
        }
      }).catch(err => {
        console.warn(`[AURA] Refresco en segundo plano de borrador ${id}:`, err.message);
      });
    }
  }
};

window.eliminarBorrador = async function(id, version) {
  const existing = state.solicitudes.find(s => s.id === id);
  const statusStr = String(existing?.status || existing?.estado || '').toUpperCase();
  if (statusStr === 'REGISTERING') {
    showToast(`El documento ${id} está en proceso de registro en AWS (REGISTERING) y no puede ser eliminado.`, 'warning');
    return;
  }
  if (typeof confirm === 'function' && !confirm(`¿Estás seguro de eliminar permanentemente este borrador (${id}) de DynamoDB?`)) {
    return;
  }
  if (!window.apiService) {
    showToast('Servicio API no inicializado.', 'error');
    return;
  }
  try {
    await window.apiService.deleteBorrador(id, version || 1);
    state.solicitudes = state.solicitudes.filter(s => s.id !== id);
    if (state.borradoresRemotos) {
      state.borradoresRemotos = state.borradoresRemotos.filter(b => (b.id || b.draftId) !== id);
    }
    showToast(`Borrador ${id} eliminado exitosamente de DynamoDB.`, 'info');
    navigateTo('solicitudes');
  } catch (err) {
    console.error('[AURA Eliminar Borrador Error]', err);
    showToast('Error al eliminar borrador en AWS: ' + err.message, 'warning');
  }
};

window.enviarBorradorAFirma = async function(id) {
  const lockKey = `enviar_${id}`;
  if (state.inFlightOperations && state.inFlightOperations.has(lockKey)) {
    return;
  }
  if (state.inFlightOperations) {
    state.inFlightOperations.add(lockKey);
  }

  const s = state.solicitudes.find(x => x.id === id || x.draftId === id);
  if (!s) {
    showToast('Borrador no encontrado.', 'warning');
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }

  const version = s.submitVersion || s.version || 1;

  if (!window.apiService) {
    showToast('Servicio API no disponible.', 'error');
    if (state.inFlightOperations) state.inFlightOperations.delete(lockKey);
    return;
  }

  try {
    // LLAMAR ÚNICAMENTE A enviarBorrador. NUNCA llamar a createSolicitud como fallback!
    const res = await window.apiService.enviarBorrador(id, version);
    const reqId = (res && (res.requestId || res.id)) || id;

    // Conservar draftId original separado del nuevo requestId
    s.draftId = id;
    s.id = reqId;
    s.requestId = reqId;
    s.estado = 'registrando';
    s.status = 'REGISTERING';
    s.fecha = 'Hoy';
    s.executionArn = (res && res.executionArn) || '';

    // Sincronizar selección activa para evitar falso 404 en el detalle
    if (state.selectedSolicitudId === id) {
      state.selectedSolicitudId = reqId;
    }

    showToast(`Borrador enviado a AWS Step Functions (${reqId}, HTTP 202). Registrando...`, 'success');
    render();

    // Iniciar consulta de persistencia /api/solicitudes/:id/registro hasta PERSISTED/FAILED
    window.verificarPersistenciaRegistro(reqId, id);
  } catch (err) {
    console.error('[AURA Enviar Borrador Error]:', err);
    // Conservar borrador y versión para permitir reintento de la misma operación
    showToast('Error al enviar borrador a revisión: ' + err.message, 'warning');
  } finally {
    if (state.inFlightOperations) {
      state.inFlightOperations.delete(lockKey);
    }
    render();
  }
};

// ----------------- POLLING DE PERSISTENCIA HTTP 202 (REGISTERING) -----------------
window.verificarPersistenciaRegistro = async function(requestId, originalDraftId = null, maxAttempts = 10, intervalMs = 1500) {
  if (!window.apiService || !requestId) return { success: false, estado: 'UNKNOWN' };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await window.apiService.getSolicitudRegistro(requestId);
      const estado = res && (res.estado || res.status);
      if (estado === 'PERSISTED') {
        showToast(`Solicitud ${requestId} persistida y registrada exitosamente en DynamoDB.`, 'success');

        // Actualizar el objeto localmente sin falso 404 conservando draftId
        const target = state.solicitudes.find(x => x.id === requestId || x.requestId === requestId || (originalDraftId && x.draftId === originalDraftId));
        if (target) {
          const preservedDraftId = target.draftId || originalDraftId;
          target.status = 'PENDING';
          target.estado = 'en_revision';
          if (res.solicitud) {
            const fresh = window.normalizarSolicitudDesdeApi(res.solicitud);
            Object.assign(target, fresh);
            target.id = requestId;
            target.requestId = requestId;
            if (preservedDraftId) {
              target.draftId = preservedDraftId;
            }
          }
        }

        // Mantener selección en el requestId nuevo
        if (state.selectedSolicitudId === originalDraftId || state.selectedSolicitudId === requestId) {
          state.selectedSolicitudId = requestId;
        }

        if (typeof window.recargarSolicitudesApi === 'function') {
          await window.recargarSolicitudesApi();
        }
        if (state.currentView === 'detalle_solicitud') {
          render();
        }
        return { success: true, estado: 'PERSISTED' };
      }
      if (estado === 'FAILED') {
        showToast(`Falla en la persistencia de solicitud ${requestId} en DynamoDB.`, 'error');
        const target = state.solicitudes.find(x => x.id === requestId || x.requestId === requestId || (originalDraftId && x.draftId === originalDraftId));
        if (target) {
          target.status = 'FAILED';
          target.estado = 'rechazado';
        }
        render();
        return { success: false, estado: 'FAILED' };
      }
    } catch (err) {
      console.warn(`[AURA] Verificación de registro ${requestId} (intento ${attempt}):`, err.message);
      if (err.message && (err.message.includes('Token') || err.message.includes('autentic') || err.status === 401 || err.status === 403)) {
        return { success: false, estado: 'AUTH_REQUIRED' };
      }
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { success: true, estado: 'REGISTERING' };
};

// ----------------- CREACIÓN DIRECTA DE SOLICITUD -----------------
window.handleCrearSolicitud = async function(e) {
  e.preventDefault();
  const errores = window.validarFormularioSolicitud ? window.validarFormularioSolicitud(true) : [];
  if (errores.length > 0) {
    showToast('Corrige los campos señalados en el formulario antes de enviar.', 'warning');
    return;
  }

  const desc = (document.getElementById('solicitud-desc')?.value || state.nuevaSolicitudForm.descripcion || '').trim();
  const dep = document.getElementById('solicitud-dep')?.value || state.nuevaSolicitudForm.departamento || 'DEP-TI';
  const provId = document.getElementById('solicitud-prov')?.value || state.nuevaSolicitudForm.proveedorId || '';
  const total = state.nuevaSolicitudForm.items.reduce((acc, it) => acc + (Number(it.cantidad || 0) * Number(it.precio || 0)), 0);

  if (!provId) {
    showToast('Por favor selecciona un proveedor del catálogo oficial.', 'warning');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i><span>Iniciando en AWS...</span>';
  }

  if (window.apiService) {
    try {
      const itemsPayload = state.nuevaSolicitudForm.items.map(it => ({
        nombre: (it.nombre || '').trim() || 'Partida',
        cantidad: Number(it.cantidad || 1),
        precioUnitario: Number(it.precio !== undefined ? it.precio : (it.precioUnitario || 0)),
        precio: Number(it.precio !== undefined ? it.precio : (it.precioUnitario || 0))
      }));

      // Si estamos editando un borrador existente, actualizarlo y enviarlo directamente
      if (state.editingDraftId) {
        const draftId = state.editingDraftId;
        const existingDraft = state.solicitudes.find(s => s.id === draftId);
        const versionActual = existingDraft ? (existingDraft.version || 1) : 1;

        // 1. Guardar cambios con PATCH y obtener la nueva versión incrementada por DynamoDB
        const patchRes = await window.apiService.updateBorrador(draftId, {
          description: desc,
          department: dep,
          proveedorId: provId,
          amount: total,
          articulos: itemsPayload
        }, versionActual);

        const versionIncrementada = Number(
          (patchRes && (patchRes.borrador?.version || patchRes.version)) || (versionActual + 1)
        );

        // Actualizar versión en el objeto en memoria por si el envío posterior necesita reintento
        if (existingDraft) {
          existingDraft.version = versionIncrementada;
          existingDraft.submitVersion = versionIncrementada;
        }

        // 2. Enviar el borrador a aprobación con la versión nueva
        let sendRes;
        try {
          sendRes = await window.apiService.enviarBorrador(draftId, versionIncrementada);
        } catch (sendErr) {
          // Si falla el envío, actualizar metadatos para permitir reintento de la misma operación
          if (existingDraft) {
            existingDraft.version = versionIncrementada;
            existingDraft.submitVersion = versionIncrementada;
          }
          throw sendErr;
        }

        const reqId = (sendRes && (sendRes.requestId || sendRes.id)) || draftId;
        const finalSubmitVersion = Number(sendRes && (sendRes.submitVersion || sendRes.version || versionIncrementada));

        showToast(`Borrador ${draftId} promovido y enviado a revisión (${reqId}, HTTP 202).`, 'success');

        // Limpiar estado de edición y formulario
        state.editingDraftId = null;
        state.nuevaSolicitudForm = {
          descripcion: '',
          departamento: 'DEP-TI',
          proveedor: '',
          proveedorId: '',
          items: [{ nombre: '', cantidad: 1, precio: 0, subtotal: 0 }]
        };

        const provObj = state.proveedores.find(p => p.id === provId);
        const optimista = window.normalizarSolicitudDesdeApi({
          requestId: reqId,
          description: desc,
          applicant: (state.currentUser && (state.currentUser.name || state.currentUser.email)) || 'Carlos Mendoza',
          applicantSub: (state.currentUser && state.currentUser.sub) || null,
          department: dep,
          amount: total,
          status: 'PENDING_APPROVAL',
          items: itemsPayload,
          proveedorId: provId,
          proveedor: provObj ? provObj.nombre : provId,
          executionArn: sendRes.executionArn || '',
          version: versionIncrementada,
          submitVersion: finalSubmitVersion
        });

        // Reemplazar o retirar el borrador original de state.solicitudes para que no quede duplicado
        state.solicitudes = state.solicitudes.filter(s => s.id !== draftId && s.id !== reqId);
        state.solicitudes.unshift(optimista);

        if (state.borradoresRemotos) {
          state.borradoresRemotos = state.borradoresRemotos.filter(b => (b.id || b.draftId) !== draftId);
        }

        navigateTo('solicitudes');
        window.verificarPersistenciaRegistro(reqId);
        return;
      }

      // Si NO es edición de borrador, crear solicitud directa
      const res = await window.apiService.createSolicitud({
        descripcion: desc,
        departamento: dep,
        department: dep,
        monto: total,
        amount: total,
        items: state.nuevaSolicitudForm.items,
        articulos: state.nuevaSolicitudForm.items,
        proveedorId: provId
      });

      const nuevoId = res.requestId || `REQ-${Date.now()}`;
      showToast(`Solicitud ${nuevoId} iniciada en AWS Step Functions (HTTP 202). Registrando...`, 'success');

      // Limpiar formulario reactivo
      state.nuevaSolicitudForm = {
        descripcion: '',
        departamento: 'DEP-TI',
        proveedor: '',
        proveedorId: '',
        items: [{ nombre: '', cantidad: 1, precio: 0, subtotal: 0 }]
      };

      // Agregar optimista a la vista
      const provObj = state.proveedores.find(p => p.id === provId);
      const optimista = window.normalizarSolicitudDesdeApi({
        requestId: nuevoId,
        description: desc,
        applicant: (state.currentUser && state.currentUser.email) || 'usuario@empresa.com',
        department: dep,
        amount: total,
        status: 'PENDING_APPROVAL',
        items: state.nuevaSolicitudForm.items,
        proveedorId: provId,
        proveedor: provObj ? provObj.nombre : provId,
        executionArn: res.executionArn || ''
      });
      state.solicitudes.unshift(optimista);

      navigateTo('solicitudes');

      // Iniciar polling de persistencia
      window.verificarPersistenciaRegistro(nuevoId);
      return;
    } catch (err) {
      console.warn('[AURA] Error al enviar a Step Functions:', err.message);
      showToast(`Error al iniciar en AWS Step Functions: ${err.message}`, 'warning');
      return;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  showToast('Servicio API no disponible.', 'error');
};

// ----------------- CONTROLADORES: PROVEEDORES (CRUD COMPRAS) -----------------
window.editarProveedor = function(id) {
  state.selectedProveedorId = id;
  state.currentView = 'proveedor_editar';
  render();
};

window.confirmarEliminarProveedor = function(id) {
  state.proveedorToDelete = id;
  render();
};

window.cerrarModalEliminar = function() {
  state.proveedorToDelete = null;
  render();
};

window.ejecutarEliminarProveedor = async function() {
  const id = state.proveedorToDelete;
  state.proveedorToDelete = null;
  if (!id) return;

  const p = state.proveedores.find(x => x.id === id);
  const version = p ? (p.version || 1) : 1;

  if (window.apiService) {
    try {
      await window.apiService.deleteProveedor(id, version);
      showToast(`Proveedor ${id} eliminado exitosamente de DynamoDB.`, 'info');
      await window.recargarProveedoresApi();
      render();
      return;
    } catch (err) {
      console.error('[AURA Eliminar Proveedor Error]', err);
      showToast('Error al eliminar proveedor en AWS: ' + err.message, 'warning');
      return;
    }
  }
};

window.handleGuardarProveedor = async function(e, isEdit) {
  e.preventDefault();
  const nombre = document.getElementById('prov-nombre').value.trim();
  const legalName = document.getElementById('prov-legalname')?.value.trim() || nombre;
  const taxId = document.getElementById('prov-taxid')?.value.trim() || '';
  const bankName = document.getElementById('prov-bankname')?.value.trim() || '';
  const bankAccount = document.getElementById('prov-bankaccount')?.value.trim() || '';
  const categoria = document.getElementById('prov-categoria').value;
  const estado = document.getElementById('prov-estado').value;
  const contacto = document.getElementById('prov-contacto').value.trim();
  const telefono = document.getElementById('prov-telefono').value.trim();

  const payload = {
    name: nombre,
    legalName,
    taxId,
    bankName,
    bankAccount,
    category: categoria,
    status: estado === 'ACTIVE' || estado === 'Calificado' ? 'ACTIVE' : 'INACTIVE',
    contactEmail: contacto,
    phone: telefono
  };

  if (window.apiService) {
    try {
      if (isEdit) {
        const p = state.proveedores.find(x => x.id === state.selectedProveedorId);
        const version = p ? (p.version || 1) : 1;
        await window.apiService.updateProveedor(state.selectedProveedorId, payload, version);
        showToast('Proveedor actualizado en AWS DynamoDB.', 'success');
      } else {
        await window.apiService.createProveedor(payload);
        showToast('Proveedor creado exitosamente en AWS DynamoDB.', 'success');
      }
      await window.recargarProveedoresApi();
      navigateTo('proveedores');
      return;
    } catch (err) {
      console.error('[AURA Guardar Proveedor Error]', err);
      showToast('Error al persistir proveedor en AWS: ' + err.message, 'warning');
      return;
    }
  }

  showToast('Servicio API no inicializado.', 'error');
};

// ----------------- CONTROLADORES: REGISTRO Y ADMIN DE USUARIOS -----------------
window.handleRegistroSubmit = async function(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const password = document.getElementById('reg-password').value;

  if (!name || !email || !password) {
    showToast('Por favor completa todos los campos obligatorios.', 'warning');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i><span>Enviando a AWS...</span>';
  }

  try {
    await window.authService.registro({ email, password, name });
    state.pendingEmail = email;
    state.currentView = 'confirmar_codigo';
    showToast('Cuenta registrada. Revisa el código de verificación en tu correo.', 'info');
    render();
  } catch (err) {
    console.error('[AURA Registro Error]', err);
    showToast('Error al registrar usuario: ' + err.message, 'warning');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
};

window.handleConfirmarCodigoSubmit = async function(e) {
  e.preventDefault();
  const code = document.getElementById('confirm-code').value.trim();
  const email = state.pendingEmail;

  if (!code || !email) {
    showToast('Ingresa el código numérico de verificación.', 'warning');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i><span>Verificando...</span>';
  }

  try {
    await window.authService.confirmarCodigo({ email, code });
    showToast('¡Correo verificado con éxito!', 'info');
    state.currentView = 'espera_aprobacion';
    render();
  } catch (err) {
    console.error('[AURA Confirmar Error]', err);
    showToast('Error al confirmar código: ' + err.message, 'warning');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
};

window.handleReenviarCodigo = async function(email) {
  if (!email) {
    showToast('Correo no especificado.', 'warning');
    return;
  }
  try {
    await window.authService.reenviarCodigo(email);
    showToast('Código de verificación reenviado a tu correo.', 'info');
  } catch (err) {
    showToast('Error al reenviar código: ' + err.message, 'warning');
  }
};

window.recargarAdminUsuariosApi = async function() {
  if (!window.apiService) return;
  state.apiState.isLoading = true;
  render();
  try {
    const estadoFiltro = (state.adminFiltroEstado || '').trim();
    let records = [];

    // Función auxiliar para consumir exhaustivamente la paginación de un estado
    const consumirPaginacionEstado = async (status) => {
      let acumulados = [];
      let cursor = null;
      let pageCount = 0;
      const MAX_PAGES = 10; // Límite de seguridad contra bucles

      do {
        pageCount++;
        const res = await window.apiService.getAdminUsuarios(status, cursor);
        if (!res) break;

        const paginaItems = res.solicitudes || res.usuarios || (Array.isArray(res) ? res : []);
        acumulados = acumulados.concat(paginaItems);

        // Detectar si hay más registros y cursor siguiente
        cursor = res.siguienteCursor || res.nextCursor || res.nextToken || res.cursor || null;
        const hayMas = Boolean(res.hayMasRegistros || res.hasMore || (cursor && paginaItems.length > 0));

        if (!hayMas || !cursor || pageCount >= MAX_PAGES) {
          break;
        }
      } while (cursor);

      return acumulados;
    };

    // Si el filtro es "Todos" (vacío o 'TODOS'), consumir la paginación de cada estado (PENDING_APPROVAL, APPROVED, REJECTED)
    // Representa las altas del flujo de incorporación en DynamoDB Business
    if (!estadoFiltro || estadoFiltro.toUpperCase() === 'TODOS') {
      const [pendingList, approvedList, rejectedList] = await Promise.all([
        consumirPaginacionEstado('PENDING_APPROVAL'),
        consumirPaginacionEstado('APPROVED'),
        consumirPaginacionEstado('REJECTED')
      ]);

      const todos = [...pendingList, ...approvedList, ...rejectedList];

      // Deduplicar por identificador único
      const map = new Map();
      todos.forEach(u => {
        const key = u.sub || u.userId || u.id || u.email;
        if (key && !map.has(key)) {
          map.set(key, u);
        }
      });
      records = Array.from(map.values());
    } else {
      // Consumir la paginación del estado específico seleccionado
      records = await consumirPaginacionEstado(estadoFiltro);
    }

    state.adminUsuarios = records;
    state.apiState.isConnected = true;
  } catch (err) {
    console.warn('[AURA Admin Usuarios Error]', err.message);
    state.apiState.isConnected = false;
    showToast('Error al cargar usuarios administrativos: ' + err.message, 'warning');
  } finally {
    state.apiState.isLoading = false;
    render();
  }
};

window.setAdminFiltroEstado = function(estado) {
  state.adminFiltroEstado = estado;
  window.recargarAdminUsuariosApi();
};

window.abrirModalAprobarUsuario = function(sub, version, emailEncoded = '', nameEncoded = '') {
  const email = emailEncoded ? decodeURIComponent(emailEncoded) : '';
  const name = nameEncoded ? decodeURIComponent(nameEncoded) : '';
  state.adminDecisionModal = {
    open: true,
    decision: 'APPROVED',
    sub,
    version: version || 1,
    email,
    name,
    role: 'Solicitante',
    comments: '',
    error: ''
  };
  render();
};

window.rechazarUsuarioAdmin = function(sub, version, emailEncoded = '', nameEncoded = '') {
  const email = emailEncoded ? decodeURIComponent(emailEncoded) : '';
  const name = nameEncoded ? decodeURIComponent(nameEncoded) : '';
  state.adminDecisionModal = {
    open: true,
    decision: 'REJECTED',
    sub,
    version: version || 1,
    email,
    name,
    role: '',
    comments: '',
    error: ''
  };
  render();
};

window.cerrarModalAdminDecision = function() {
  state.adminDecisionModal = null;
  render();
};

window.handleConfirmarAdminDecision = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  const m = state.adminDecisionModal;
  if (!m) return;

  const roleSelect = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('admin-modal-role') : null;
  const commentsInput = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('admin-modal-comments') : null;
  const role = (roleSelect && roleSelect.value) ? roleSelect.value : (m.role || 'Solicitante');
  const comments = (commentsInput && commentsInput.value !== '' && commentsInput.value !== undefined) ? commentsInput.value.trim() : (m.comments || '').trim();

  if (!comments) {
    m.error = 'El comentario de auditoría es obligatorio.';
    const errEl = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('admin-modal-error') : null;
    if (errEl) {
      errEl.textContent = m.error;
      errEl.classList.remove('hidden');
    }
    return;
  }

  const payload = {
    decision: m.decision,
    version: m.version || 1,
    comments
  };
  if (m.decision === 'APPROVED') {
    payload.role = role;
  }

  try {
    await window.apiService.decidirAdminUsuario(m.sub, payload);
    showToast(`Operación administrativa (${m.decision}) ejecutada con éxito.`, 'info');
    state.adminDecisionModal = null;
    await window.recargarAdminUsuariosApi();
  } catch (err) {
    console.error('[AURA Decidir Usuario Error]', err);
    m.error = err.message || 'Error al ejecutar dictamen administrativo';
    const errEl = document.getElementById('admin-modal-error');
    if (errEl) {
      errEl.textContent = m.error;
      errEl.classList.remove('hidden');
    }
    showToast('Error administrativo: ' + err.message, 'warning');
  }
};

window.ejecutarDecidirUsuarioAdmin = async function(sub, payload) {
  try {
    await window.apiService.decidirAdminUsuario(sub, payload);
    showToast('Operación administrativa ejecutada con éxito.', 'info');
    await window.recargarAdminUsuariosApi();
  } catch (err) {
    console.error('[AURA Decidir Usuario Error]', err);
    showToast('Error administrativo: ' + err.message, 'warning');
  }
};

// ----------------- CONTROLADORES: ANULACIÓN DE SOLICITUDES -----------------
window.anularSolicitud = async function(id) {
  if (!id) return;
  const s = state.solicitudes.find(x => x.id === id);
  if (s) {
    const statusMayus = String(s.status || s.rawStatus || '').toUpperCase();
    if (statusMayus && statusMayus !== 'PENDING' && statusMayus !== 'PENDING_APPROVAL') {
      showToast('Solo se puede anular una solicitud pendiente (PENDING).', 'warning');
      return;
    }
  }

  const comentarios = typeof prompt === 'function' ? prompt('Ingresa el motivo obligatorio para anular esta solicitud:') : 'Anulada por solicitante';
  if (!comentarios || !comentarios.trim()) {
    showToast('El motivo de anulación es obligatorio.', 'warning');
    return;
  }

  try {
    await window.apiService.anularSolicitud(id, comentarios.trim());
    if (s) {
      s.status = 'CANCELLED';
      s.estado = 'anulado';
      s.comentarios = comentarios.trim();
      s.motivoAnulacion = comentarios.trim();
    }
    showToast(`Solicitud ${id} anulada exitosamente (CANCELLED).`, 'info');
    await window.recargarSolicitudesApi();
    if (state.currentView === 'detalle_solicitud') {
      await window.verDetalleSolicitud(id);
    }
  } catch (err) {
    console.error('[AURA Anular Solicitud Error]', err);
    showToast('Error al anular solicitud: ' + err.message, 'warning');
  }
};

// ----------------- CONTROLADORES: BORRADORES EN AWS DYNAMODB -----------------
window.normalizarBorradorDesdeApi = function(b) {
  if (!b) return null;
  const monto = Number(b.amount !== undefined ? b.amount : (b.monto !== undefined ? b.monto : (b.total !== undefined ? b.total : 0)));
  const provObj = (state.proveedores || []).find(p => p.id === (b.proveedorId || b.proveedor));
  const rawItems = b.articulos || b.items || [];
  const itemsNormalizados = Array.isArray(rawItems) ? rawItems.map(it => {
    const cantidad = Number(it.cantidad || it.quantity || 1);
    const precio = Number(it.precio !== undefined ? it.precio : (it.precioUnitario !== undefined ? it.precioUnitario : (it.unitPrice !== undefined ? it.unitPrice : 0)));
    const subtotal = Number(it.subtotal !== undefined ? it.subtotal : (cantidad * precio));
    return {
      nombre: it.nombre || it.name || it.descripcion || 'Partida',
      cantidad,
      precio,
      precioUnitario: precio,
      subtotal
    };
  }) : [];

  const statusRaw = String(b.status || b.estado || '').toUpperCase();
  const isRegistering = statusRaw === 'REGISTERING';

  return {
    id: b.id || b.draftId,
    draftId: b.draftId || b.id,
    requestId: b.requestId || null,
    descripcion: b.description || b.descripcion || 'Borrador sin título',
    solicitante: b.applicant || (state.currentUser ? state.currentUser.name : 'Carlos Mendoza'),
    applicantSub: b.applicantSub || (state.currentUser ? state.currentUser.sub : null),
    departamento: b.department || b.departamento || 'DEP-TI',
    proveedorId: b.proveedorId || (provObj ? provObj.id : ''),
    proveedor: (provObj ? provObj.nombre : (b.proveedor || b.proveedorId)) || (b.proveedorId ? b.proveedorId : 'Sin proveedor asignado'),
    total: monto,
    monto: monto,
    estado: isRegistering ? 'en_revision' : 'borrador',
    status: b.status || (isRegistering ? 'REGISTERING' : 'DRAFT'),
    fecha: isRegistering ? 'Registrando...' : 'Borrador',
    items: itemsNormalizados,
    version: Number(b.version || 1),
    submitVersion: Number(b.submitVersion || b.version || 1),
    esAltoMonto: monto > 1000
  };
};

window.recargarBorradoresApi = async function() {
  if (!window.apiService) return;
  // Compras no dictamina ni ve borradores privados
  if (state.currentRole === 'compras') {
    state.borradoresRemotos = [];
    state.solicitudes = state.solicitudes.filter(s => s.estado !== 'borrador');
    return;
  }

  try {
    const res = await window.apiService.getBorradores();
    if (res && Array.isArray(res.borradores)) {
      state.borradoresRemotos = res.borradores;
      const draftsNormalizados = res.borradores.map(b => window.normalizarBorradorDesdeApi(b)).filter(Boolean);

      state.solicitudes = state.solicitudes.filter(s => s.estado !== 'borrador');
      state.solicitudes = [...draftsNormalizados, ...state.solicitudes];
      render();
    }
  } catch (err) {
    console.warn('[AURA Borradores API]', err.message);
  }
};

// ----------------- CONTROLADORES: PROVEEDORES (API AWS / CRUD) -----------------
window.recargarProveedoresApi = async function() {
  if (!window.apiService) return;
  try {
    const res = await window.apiService.getProveedores();
    const lista = (res && res.proveedores) ? res.proveedores : (Array.isArray(res) ? res : []);
    state.proveedores = lista.map(p => ({
      id: p.id || p.proveedorId,
      nombre: p.name || p.nombre || p.legalName,
      legalName: p.legalName || p.name || p.nombre,
      taxId: p.taxId || '',
      bankName: p.bankName || '',
      bankAccount: p.bankAccount || '',
      categoria: p.category || p.categoria || 'Servicios',
      contacto: p.contactEmail || p.contacto || '',
      telefono: p.phone || p.telefono || '',
      estado: p.status === 'ACTIVE' ? 'Calificado' : (p.status || 'Calificado'),
      status: p.status || 'ACTIVE',
      calificacion: p.calificacion || 4.5,
      version: Number(p.version || 1)
    }));
    render();
  } catch (err) {
    console.warn('[AURA Proveedores API]', err.message);
  }
};

// ----------------- INICIALIZACIÓN ASÍNCRONA Y VERIFICACIÓN DE SESIÓN -----------------
document.addEventListener('DOMContentLoaded', async () => {
  if (window.authService && window.authService.isAuthenticated()) {
    try {
      const me = await window.authService.getMe();
      state.currentUser = me;
      state.currentRole = me.role;
      state.currentView = me.isAdmin ? 'admin_usuarios' : 'dashboard';
      render();

      if (window.apiService) {
        if (me.isAdmin) {
          // El Administrador de Cuentas únicamente consulta la administración de usuarios (evita 403 comercial)
          await window.recargarAdminUsuariosApi();
        } else {
          await Promise.allSettled([
            window.recargarSolicitudesApi(),
            window.recargarProveedoresApi(),
            me.role === 'solicitante' ? window.recargarBorradoresApi() : Promise.resolve(),
            (me.role === 'gerente' || me.role === 'director') ? window.recargarAprobacionesApi() : Promise.resolve()
          ]);
        }
      }
    } catch (err) {
      console.warn('[AURA] Sesión inválida o expirada:', err.message);
      if (window.authService) window.authService.logout();
      state.currentUser = null;
      state.currentRole = null;
      state.solicitudes = [];
      state.proveedores = [];
      state.currentView = 'login';
      render();
    }
  } else {
    state.currentUser = null;
    state.currentRole = null;
    state.solicitudes = [];
    state.proveedores = [];
    state.currentView = 'login';
    render();
  }
});
