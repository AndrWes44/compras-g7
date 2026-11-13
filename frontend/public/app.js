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

        <div class="mt-6 pt-4 border-t border-aura-border/60 text-center">
          <button onclick="navigateTo('tokens')" class="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5">
            <i class="fa-solid fa-palette text-blue-400"></i>
            <span>Ver Guía Visual & Tokens de Diseño (Figma)</span>
          </button>
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
          <p class="text-xs text-slate-400">Supervisión administrativa de cuentas registradas en Amazon Cognito</p>
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
                        ${u.assignedRole || u.role || 'Sin rol'}
                      </span>
                    </td>
                    <td class="py-3.5 px-4 font-mono text-slate-500">v${u.version || 1}</td>
                    <td class="py-3.5 px-4 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <button onclick="abrirModalAprobarUsuario('${sub}', ${u.version || 1})" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow">
                          Aprobar / Asignar Rol
                        </button>
                        ${status !== 'REJECTED' ? `
                          <button onclick="rechazarUsuarioAdmin('${sub}', ${u.version || 1})" class="px-2.5 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white font-semibold text-[11px]">
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

function renderRecuperarPassword() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4">
      <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-8 shadow-2xl text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-xl">
          <i class="fa-solid fa-key"></i>
        </div>
        <h2 class="text-lg font-bold text-white">Recuperar Contraseña</h2>
        <p class="text-xs text-slate-400">Ingresa tu correo institucional registrado para recibir el enlace seguro de restablecimiento de Amazon Cognito.</p>
        <form onsubmit="handleRecuperarSubmit(event)" class="space-y-4 text-left">
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1">Correo Electrónico</label>
            <input type="email" id="recuperar-email" required placeholder="tu-correo@empresa.com" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
          <button type="submit" class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm shadow">
            Enviar Enlace de Recuperación
          </button>
        </form>
        <button onclick="navigateTo('login')" class="text-xs text-slate-400 hover:text-slate-200">
          ← Volver al Login
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
    navItems = [
      { id: 'admin_usuarios', label: 'Gestión de Cuentas', icon: 'fa-users-gear', allowed: true },
      { id: 'solicitudes', label: 'Solicitudes', icon: 'fa-table-columns', allowed: true }
    ];
  } else if (isSolicitante) {
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Mis Solicitudes', icon: 'fa-table-columns', allowed: true }
    ];
  } else if (isGerente) {
    const pendientesGerente = state.solicitudes.filter(s => s.estado === 'en_revision' && !s.esAltoMonto).length;
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Solicitudes', icon: 'fa-table-columns', allowed: true },
      { id: 'aprobaciones', label: 'Bandeja Dictamen (≤ $1k)', icon: 'fa-clipboard-check', allowed: true, badge: pendientesGerente || null },
      { id: 'proveedores', label: 'Catálogo Proveedores', icon: 'fa-building', allowed: true }
    ];
  } else if (isDirector) {
    const pendientesDirector = state.solicitudes.filter(s => s.estado === 'en_revision' && s.esAltoMonto).length;
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
        <button onclick="recargarSolicitudesApi()" title="Sincronizar con API Express" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg text-xs border border-aura-border transition-colors ${state.apiState.isLoading ? 'animate-spin text-blue-400' : ''}">
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
  const countPendientes = solicitudesRol.filter(s => s.estado === 'en_revision' || s.estado === 'borrador').length;
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
          <div class="text-2xl font-bold text-amber-400">${countPendientes}</div>
          <span class="text-[11px] text-slate-500">Requieren seguimiento</span>
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
                  <td class="py-3 px-4 font-mono font-semibold text-blue-400">${s.id}</td>
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
      filter: (s) => s.estado === 'en_revision'
    },
    {
      id: 'aprobado',
      title: 'Aprobadas',
      borderColor: 'border-emerald-500/40',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      filter: (s) => s.estado === 'aprobado'
    },
    {
      id: 'rechazado',
      title: 'Rechazadas / Anuladas',
      borderColor: 'border-red-500/40',
      badgeColor: 'bg-red-500/20 text-red-300 border border-red-500/30',
      filter: (s) => s.estado === 'rechazado' || s.estado === 'anulado'
    }
  ];

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

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
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
                    <div class="flex items-center justify-between">
                      <span class="text-[11px] font-mono font-bold text-blue-400">${item.id}</span>
                      ${item.esAltoMonto ? `
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
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
          <h3 class="text-base font-bold text-white">
            ${isEditing ? 'Editar Borrador de Requerimiento' : 'Nueva Solicitud de Compra (SC)'}
          </h3>
          <p class="text-xs text-slate-400">
            ${isEditing ? 'Modifica los artículos o detalles antes de remitir formalmente a aprobación.' : 'Ingresa los detalles del requerimiento y los ítems cotizados.'}
          </p>
        </div>
        <button onclick="navigateTo('solicitudes')" class="px-3 py-1.5 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
          ← Volver al Kanban
        </button>
      </div>

      <form onsubmit="handleCrearSolicitud(event)" class="space-y-6">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">Descripción General del Requerimiento</label>
          <input type="text" id="solicitud-desc" required value="${form.descripcion}" oninput="actualizarCampoForm('descripcion', this.value)" placeholder="Ej. Renovación anual de licencias y equipamiento para TI" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
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
                  <tr>
                    <td class="p-2">
                      <input type="text" value="${item.nombre}" onchange="actualizarItem(${idx}, 'nombre', this.value)" placeholder="Descripción del producto o servicio" class="w-full px-2 py-1.5 bg-aura-input border border-aura-border rounded text-xs text-slate-100 focus:outline-none focus:border-blue-500">
                    </td>
                    <td class="p-2">
                      <input type="number" min="1" value="${item.cantidad}" onchange="actualizarItem(${idx}, 'cantidad', this.value)" class="w-full px-2 py-1.5 bg-aura-input border border-aura-border rounded text-xs text-center text-slate-100 focus:outline-none focus:border-blue-500">
                    </td>
                    <td class="p-2">
                      <input type="number" step="0.01" min="0" value="${item.precio}" onchange="actualizarItem(${idx}, 'precio', this.value)" class="w-full px-2 py-1.5 bg-aura-input border border-aura-border rounded text-xs text-right text-slate-100 focus:outline-none focus:border-blue-500">
                    </td>
                    <td class="p-2 text-right font-mono font-semibold text-white">
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
        <div class="p-3.5 rounded-xl border flex items-center justify-between ${
          esAltoMonto 
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
        }">
          <div class="flex items-center gap-2.5">
            <i class="fa-solid ${esAltoMonto ? 'fa-triangle-exclamation text-amber-400' : 'fa-circle-check text-emerald-400'} text-base"></i>
            <div>
              <span class="text-xs font-bold block">
                ${esAltoMonto ? 'Solicitud de Alto Monto (> $1,000 USD)' : 'Aprobación ordinaria de Gerencia (Hasta $1,000 USD)'}
              </span>
              <span class="text-[11px] opacity-80">
                ${esAltoMonto ? 'Monto superior a $1,000: requiere dictamen exclusivo de Dirección General.' : 'Monto de hasta $1,000: aprobación directa de Gerencia.'}
              </span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-[10px] uppercase font-semibold opacity-70 block">Total Estimado</span>
            <span class="text-base font-bold font-mono">$${totalCalculado.toFixed(2)}</span>
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

// 4. BANDEJA DE APROBACIONES (Gerente ≤ $1,000, Director > $1,000)
function renderAprobaciones() {
  const isGerente = state.currentRole === 'gerente';
  const isDirector = state.currentRole === 'director';

  // Matriz de aprobaciones:
  // Director: exclusivamente solicitudes de alto monto (> $1,000)
  // Gerente: exclusivamente solicitudes ordinarias (≤ $1,000)
  // Compras: NO dictamina
  let pendientes = [];
  if (isDirector) {
    pendientes = state.solicitudes.filter(s => s.estado === 'en_revision' && s.esAltoMonto);
  } else if (isGerente) {
    pendientes = state.solicitudes.filter(s => s.estado === 'en_revision' && !s.esAltoMonto);
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
              ? 'Dictamen exclusivo de fiscalización directiva para adquisiciones de alto presupuesto.' 
              : 'Revisión y dictamen de solicitudes departamentales ordinarias.'}
          </p>
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
                  <td class="py-3.5 px-4 font-mono font-bold text-blue-400">${s.id}</td>
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
                      <button onclick="dictaminarSolicitud('${s.id}', 'aprobado')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow-sm transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-check text-[10px]"></i>
                        <span>Aprobar</span>
                      </button>
                      <button onclick="dictaminarSolicitud('${s.id}', 'rechazado')" class="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold text-[11px] shadow-sm transition-all flex items-center gap-1.5">
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
  const item = state.solicitudes.find(s => s.id === state.selectedSolicitudId);
  const isSolicitante = state.currentRole === 'solicitante';
  const isGerente = state.currentRole === 'gerente';
  const isDirector = state.currentRole === 'director';
  const canDictaminar = (isGerente && !item?.esAltoMonto) || (isDirector && item?.esAltoMonto);

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
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-blue-400 font-bold">${item.id}</span>
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
        ` : item.estado === 'borrador' ? `
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

        ${isSolicitante && item.estado === 'en_revision' ? `
          <div class="pt-4 border-t border-aura-border flex items-center justify-between">
            <button onclick="anularSolicitud('${item.id}')" class="px-3.5 py-2 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-semibold transition-all flex items-center gap-2">
              <i class="fa-solid fa-ban text-xs"></i>
              <span>Anular mi Solicitud</span>
            </button>
            <span class="text-[11px] text-slate-500">Solo el solicitante puede anular mientras esté pendiente.</span>
          </div>
        ` : ''}

        ${canDictaminar && item.estado === 'en_revision' ? `
          <div class="pt-4 border-t border-aura-border flex items-center justify-end gap-3">
            <button onclick="dictaminarSolicitud('${item.id}', 'rechazado')" class="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-xs font-semibold text-white shadow transition-all">
              Rechazar Solicitud
            </button>
            <button onclick="dictaminarSolicitud('${item.id}', 'aprobado')" class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all">
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
function renderBadgeEstado(estado) {
  switch (estado ? estado.toLowerCase() : '') {
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

window.cerrarErrorModal = function() {
  state.globalErrorModal = null;
  render();
};

window.mostrarErrorModal = function({ title, message, code, actionText, onAction }) {
  state.globalErrorModal = { title, message, code, actionText, onAction };
  render();
};

// ----------------- NAVEGACIÓN Y GUARDIA DE SESIÓN -----------------
window.navigateTo = function(view) {
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
};

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
    if (typeof window.recargarSolicitudesApi === 'function') {
      window.recargarSolicitudesApi();
    }
    if (typeof window.recargarProveedoresApi === 'function') {
      window.recargarProveedoresApi();
    }
    if (typeof window.recargarBorradoresApi === 'function' && authUser.role === 'solicitante') {
      window.recargarBorradoresApi();
    }
    if (typeof window.recargarAdminUsuariosApi === 'function' && authUser.isAdmin) {
      window.recargarAdminUsuariosApi();
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
  e.preventDefault();
  const email = document.getElementById('recuperar-email').value.trim();
  showToast(`Enlace de restablecimiento enviado a ${email} vía Amazon Cognito.`, 'info');
  navigateTo('login');
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
  const statusRaw = String(raw.status || raw.estado || 'en_revision').toLowerCase();

  let estadoNormalizado = 'en_revision';
  if (statusRaw.includes('pending') || statusRaw.includes('revision') || statusRaw.includes('review') || statusRaw.includes('submitted')) {
    estadoNormalizado = 'en_revision';
  } else if (statusRaw.includes('reject') || statusRaw.includes('rechaz')) {
    estadoNormalizado = 'rechazado';
  } else if (statusRaw.includes('cancel') || statusRaw.includes('anul')) {
    estadoNormalizado = 'anulado';
  } else if (statusRaw.includes('draft') || statusRaw.includes('borrador')) {
    estadoNormalizado = 'borrador';
  } else if (statusRaw.includes('approv') || statusRaw.includes('aprob')) {
    estadoNormalizado = 'aprobado';
  } else {
    estadoNormalizado = 'en_revision';
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

  // Regla oficial: hasta $1,000 Gerente; más de $1,000 Director
  const esAltoMonto = raw.requiereAprobacionDe 
    ? raw.requiereAprobacionDe.toLowerCase() === 'director'
    : (raw.esAltoMonto !== undefined ? Boolean(raw.esAltoMonto) : amount > 1000);

  return {
    id: requestId,
    requestId: requestId,
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

window.verDetalleSolicitud = async function(id) {
  state.selectedSolicitudId = id;
  state.currentView = 'detalle_solicitud';
  render();

  if (window.apiService && id) {
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
  if (state.currentRole === 'solicitante') {
    showToast('Acceso Denegado: Un solicitante no tiene permisos de dictamen.', 'warning');
    return;
  }
  if (state.currentRole === 'compras') {
    showToast('Acceso Denegado: Compras no tiene permisos de dictamen según la matriz de roles.', 'warning');
    return;
  }

  const s = state.solicitudes.find(x => x.id === id);
  if (!s) return;

  // Validación de monto: Gerente hasta $1,000; Director más de $1,000
  if (state.currentRole === 'gerente' && s.esAltoMonto) {
    showToast('Acceso Denegado: Solicitudes de alto monto (> $1,000 USD) corresponden a Dirección General.', 'warning');
    return;
  }
  if (state.currentRole === 'director' && !s.esAltoMonto) {
    showToast('Acceso Denegado: Solicitudes ordinarias (≤ $1,000 USD) corresponden a Gerencia.', 'warning');
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
      return;
    }
  }

  const currentUser = (state.currentUser && state.currentUser.name) || (state.users && state.users[state.currentRole] ? state.users[state.currentRole].name : 'Ing. Herberth');

  if (window.apiService && id) {
    try {
      await window.apiService.dictaminarSolicitud(id, {
        decision: decisionAws,
        comentarios: comentarioFinal.trim(),
        comentario: comentarioFinal.trim(),
        aprobador: currentUser,
        decidedBy: currentUser
      });
      showToast(`Solicitud ${id} ${resultado.toUpperCase()} y registrada en AWS DynamoDB.`, resultado === 'aprobado' ? 'success' : 'warning');
    } catch (err) {
      console.warn(`[AURA] Falla al persistir dictamen en backend/AWS:`, err.message);
      showToast(`Error al registrar dictamen en AWS: ${err.message}`, 'error');
      return;
    }
  }

  s.estado = resultado;
  s.status = decisionAws;
  s.fechaDictamen = 'Hoy';
  s.aprobador = currentUser;
  s.comentariosGerente = comentarioFinal.trim();

  render();
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
  render();
};

window.agregarFilaItem = function() {
  state.nuevaSolicitudForm.items.push({
    nombre: '',
    cantidad: 1,
    precio: 0,
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
  if (campo === 'cantidad' || campo === 'precio') {
    it[campo] = Number(valor);
    it.subtotal = it.cantidad * it.precio;
  } else {
    it[campo] = valor;
  }
  render();
};

// ----------------- GESTIÓN DE BORRADORES (DYNAMODB) -----------------
window.guardarBorrador = async function() {
  const desc = (document.getElementById('solicitud-desc')?.value || state.nuevaSolicitudForm.descripcion || '').trim();
  if (!desc) {
    showToast('Por favor ingresa una descripción para el borrador.', 'warning');
    return;
  }

  const dep = document.getElementById('solicitud-dep')?.value || state.nuevaSolicitudForm.departamento || 'DEP-TI';
  const provId = document.getElementById('solicitud-prov')?.value || state.nuevaSolicitudForm.proveedorId || '';
  const total = state.nuevaSolicitudForm.items.reduce((acc, it) => acc + (Number(it.cantidad || 0) * Number(it.precio || 0)), 0);

  if (total <= 0) {
    showToast('El monto total del borrador debe ser mayor que cero.', 'warning');
    return;
  }

  const payloadBorrador = {
    description: desc,
    department: dep,
    proveedorId: provId,
    amount: total,
    articulos: state.nuevaSolicitudForm.items.map(it => ({
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

window.editarBorrador = function(id) {
  const s = state.solicitudes.find(x => x.id === id);
  if (!s) {
    showToast('Borrador no encontrado.', 'warning');
    return;
  }
  state.editingDraftId = id;
  state.nuevaSolicitudForm = {
    descripcion: s.descripcion || '',
    departamento: s.departamento || 'DEP-TI',
    proveedor: s.proveedor || '',
    proveedorId: s.proveedorId || '',
    items: (s.items && s.items.length > 0) ? JSON.parse(JSON.stringify(s.items)) : [{ nombre: '', cantidad: 1, precio: 0, subtotal: 0 }]
  };
  navigateTo('nueva_solicitud');
};

window.eliminarBorrador = async function(id, version) {
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
  const s = state.solicitudes.find(x => x.id === id);
  if (!s) {
    showToast('Borrador no encontrado.', 'warning');
    return;
  }

  const version = s.submitVersion || s.version || 1;

  if (!window.apiService) {
    showToast('Servicio API no disponible.', 'error');
    return;
  }

  try {
    // LLAMAR ÚNICAMENTE A enviarBorrador. NUNCA llamar a createSolicitud como fallback!
    const res = await window.apiService.enviarBorrador(id, version);
    const reqId = (res && (res.requestId || res.id)) || id;

    s.id = reqId;
    s.requestId = reqId;
    s.estado = 'en_revision';
    s.status = 'PENDING_APPROVAL';
    s.fecha = 'Hoy';
    s.executionArn = (res && res.executionArn) || '';

    showToast(`Borrador enviado a AWS Step Functions (${reqId}, HTTP 202). Registrando...`, 'success');
    render();

    // Iniciar consulta de persistencia /api/solicitudes/:id/registro hasta PERSISTED/FAILED
    window.verificarPersistenciaRegistro(reqId);
  } catch (err) {
    console.error('[AURA Enviar Borrador Error]:', err);
    // Conservar borrador y versión para permitir reintento de la misma operación
    showToast('Error al enviar borrador a revisión: ' + err.message, 'warning');
  }
};

// ----------------- POLLING DE PERSISTENCIA HTTP 202 (REGISTERING) -----------------
window.verificarPersistenciaRegistro = async function(requestId, maxAttempts = 8, intervalMs = 1500) {
  if (!window.apiService || !requestId) return { success: false, estado: 'UNKNOWN' };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await window.apiService.getSolicitudRegistro(requestId);
      const estado = res && (res.estado || res.status);
      if (estado === 'PERSISTED') {
        showToast(`Solicitud ${requestId} persistida y registrada exitosamente en DynamoDB.`, 'success');
        if (typeof window.recargarSolicitudesApi === 'function') {
          await window.recargarSolicitudesApi();
        }
        return { success: true, estado: 'PERSISTED' };
      }
      if (estado === 'FAILED') {
        showToast(`Falla en la persistencia de solicitud ${requestId} en DynamoDB.`, 'error');
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
  const desc = document.getElementById('solicitud-desc').value.trim();
  const dep = document.getElementById('solicitud-dep')?.value || 'DEP-TI';
  const provId = document.getElementById('solicitud-prov')?.value || '';
  const total = state.nuevaSolicitudForm.items.reduce((acc, it) => acc + (Number(it.cantidad || 0) * Number(it.precio || 0)), 0);

  if (!desc) {
    showToast('Por favor ingresa una descripción para el requerimiento.', 'warning');
    return;
  }
  if (total <= 0) {
    showToast('El monto total debe ser mayor que cero.', 'warning');
    return;
  }
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
  try {
    const estado = state.adminFiltroEstado || '';
    const res = await window.apiService.getAdminUsuarios(estado);
    state.adminUsuarios = (res && res.usuarios) ? res.usuarios : (Array.isArray(res) ? res : []);
    render();
  } catch (err) {
    console.warn('[AURA Admin Usuarios Error]', err.message);
    showToast('Error al cargar usuarios administrativos: ' + err.message, 'warning');
  }
};

window.setAdminFiltroEstado = function(estado) {
  state.adminFiltroEstado = estado;
  window.recargarAdminUsuariosApi();
};

window.abrirModalAprobarUsuario = function(sub, version) {
  const rol = typeof prompt === 'function' ? prompt('Asignar rol comercial (Solicitante, Gerente, Director, Compras):', 'Solicitante') : 'Solicitante';
  if (!rol) return;
  const comentarios = typeof prompt === 'function' ? prompt('Comentario o motivo de auditoría administrativa:', 'Alta aprobada por administrador') : 'Alta aprobada por administrador';
  if (!comentarios) return;

  window.ejecutarDecidirUsuarioAdmin(sub, {
    decision: 'APPROVED',
    role: rol.trim(),
    version: version || 1,
    comments: comentarios.trim()
  });
};

window.rechazarUsuarioAdmin = function(sub, version) {
  const comentarios = typeof prompt === 'function' ? prompt('Motivo obligatorio de rechazo de acceso:', 'Acceso no autorizado') : 'Acceso no autorizado';
  if (!comentarios) return;

  window.ejecutarDecidirUsuarioAdmin(sub, {
    decision: 'REJECTED',
    version: version || 1,
    comments: comentarios.trim()
  });
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
  const comentarios = typeof prompt === 'function' ? prompt('Ingresa el motivo obligatorio para anular esta solicitud:') : 'Anulada por solicitante';
  if (!comentarios || !comentarios.trim()) {
    showToast('El motivo de anulación es obligatorio.', 'warning');
    return;
  }

  try {
    await window.apiService.anularSolicitud(id, comentarios.trim());
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
      const draftsNormalizados = res.borradores.map(b => {
        const monto = Number(b.amount || b.monto || 0);
        const provObj = state.proveedores.find(p => p.id === (b.proveedorId || b.proveedor));
        return {
          id: b.id || b.draftId,
          descripcion: b.description || b.descripcion || 'Borrador sin título',
          solicitante: b.applicant || (state.currentUser ? state.currentUser.name : 'Carlos Mendoza'),
          applicantSub: b.applicantSub || (state.currentUser ? state.currentUser.sub : null),
          departamento: b.department || b.departamento || 'DEP-TI',
          proveedorId: b.proveedorId || (provObj ? provObj.id : 'PRV-001'),
          proveedor: (provObj ? provObj.nombre : (b.proveedor || b.proveedorId)) || 'Proveedor Asignado',
          total: monto,
          monto: monto,
          estado: 'borrador',
          fecha: 'Borrador',
          items: b.articulos || b.items || [],
          version: Number(b.version || 1),
          submitVersion: Number(b.submitVersion || b.version || 1),
          esAltoMonto: monto > 1000
        };
      });

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
        await Promise.allSettled([
          window.recargarSolicitudesApi(),
          window.recargarProveedoresApi(),
          me.role === 'solicitante' ? window.recargarBorradoresApi() : Promise.resolve(),
          me.isAdmin ? window.recargarAdminUsuariosApi() : Promise.resolve()
        ]);
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
