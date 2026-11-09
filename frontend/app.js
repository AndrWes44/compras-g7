/**
 * AURA Compras - Aplicación Web Interactiva Full Mockup
 * Fidelidad 100% con los mockups de Figma
 * Roles RBAC: Solicitante (Carlos), Gerente (Ing. Herberth), Compras (Ana Martínez)
 */

// Estado global de la aplicación
const state = {
  currentRole: null, // 'solicitante' | 'gerente' | 'compras'
  currentView: 'login', // 'login' | 'dashboard' | 'solicitudes' | 'nueva_solicitud' | 'aprobaciones' | 'proveedores' | 'proveedor_nuevo' | 'proveedor_editar' | 'detalle_solicitud' | 'recuperar_password' | 'tokens'
  activeFilterCategoria: 'Todos',
  loginCreds: { email: '', password: '' },
  
  // Detalle activo
  selectedSolicitudId: 'SC-0012',
  selectedProveedorId: null,
  
  // Proveedor temporal para el modal de eliminación
  proveedorToDelete: null,

  // Datos de usuarios RBAC
  users: {
    solicitante: {
      name: 'Carlos Mendoza',
      roleTitle: 'Solicitante Departamental',
      initials: 'CM',
      badgeColor: 'bg-blue-600',
      email: 'carlos@empresa.com'
    },
    gerente: {
      name: 'Ing. Herberth',
      roleTitle: 'Gerente Aprobador',
      initials: 'IH',
      badgeColor: 'bg-emerald-600',
      email: 'herberth@empresa.com'
    },
    compras: {
      name: 'Ana Martínez',
      roleTitle: 'Compras & Adquisiciones',
      initials: 'AM',
      badgeColor: 'bg-blue-600',
      email: 'ana@empresa.com'
    }
  },

  // Base de datos de Solicitudes
  solicitudes: [
    {
      id: 'SC-0018',
      descripcion: 'Renovación anual de licencias corporativas',
      solicitante: 'Carlos Mendoza',
      proveedor: 'Tech Solutions Global',
      total: 1800.00,
      estado: 'borrador',
      fecha: '12/10/2026',
      items: [
        { nombre: 'Licencia Anual Cloud Enterprise', cantidad: 1, precio: 1800.00, subtotal: 1800.00 }
      ],
      comentariosGerente: '',
      esAltoMonto: true
    },
    {
      id: 'SC-0012',
      descripcion: 'Material y suministros para oficina del área administrativa',
      solicitante: 'Carlos Mendoza',
      proveedor: 'Papelería y Suministros S.A.',
      total: 14.20,
      estado: 'borrador',
      fecha: '10/10/2026',
      items: [
        { nombre: 'Papelería y tóner', cantidad: 2, precio: 7.10, subtotal: 14.20 }
      ],
      comentariosGerente: '',
      esAltoMonto: false
    },
    {
      id: 'SC-0013',
      descripcion: 'Servicios cloud periodo mensual',
      solicitante: 'Carlos Mendoza',
      proveedor: 'Tech Solutions Global',
      total: 12.00,
      estado: 'borrador',
      fecha: '11/10/2026',
      items: [
        { nombre: 'Almacenamiento Cloud Backup', cantidad: 1, precio: 12.00, subtotal: 12.00 }
      ],
      comentariosGerente: '',
      esAltoMonto: false
    },
    {
      id: 'SC-0014',
      descripcion: 'Equipos de cómputo y periféricos',
      solicitante: 'Carlos Mendoza',
      proveedor: 'Tech Solutions Global',
      total: 78.00,
      estado: 'en_revision',
      fecha: '09/10/2026',
      items: [
        { nombre: 'Kit Teclado + Mouse Inalámbrico', cantidad: 2, precio: 39.00, subtotal: 78.00 }
      ],
      comentariosGerente: '',
      esAltoMonto: false
    },
    {
      id: 'SC-0015',
      descripcion: 'Licencias anuales de diseño y edición',
      solicitante: 'Carlos Mendoza',
      proveedor: 'Tech Solutions Global',
      total: 25.00,
      estado: 'en_revision',
      fecha: '12/10/2026',
      items: [
        { nombre: 'Suscripción Software Suite', cantidad: 1, precio: 25.00, subtotal: 25.00 }
      ],
      comentariosGerente: '',
      esAltoMonto: false
    },
    {
      id: 'SC-0016',
      descripcion: 'Mobiliario y sillas ergonómicas de oficina',
      solicitante: 'Carlos Mendoza',
      proveedor: 'Muebles & Diseños Corp',
      total: 15.20,
      estado: 'aprobado',
      fecha: '05/10/2026',
      fechaDictamen: '05/10/2026',
      aprobador: 'Ing. Herberth Gerente',
      items: [
        { nombre: 'Soporte Ergonómico Ajustable', cantidad: 1, precio: 15.20, subtotal: 15.20 }
      ],
      comentariosGerente: 'Aprobado conforme a presupuesto trimestral y justificación presupuestaria validada.',
      esAltoMonto: false
    },
    {
      id: 'SC-0017',
      descripcion: 'Papelería extra y suministros de imprenta',
      solicitante: 'Carlos Mendoza',
      proveedor: 'Papelería y Suministros S.A.',
      total: 78.20,
      estado: 'rechazado',
      fecha: '01/10/2026',
      fechaDictamen: '01/10/2026',
      aprobador: 'Ing. Herberth Gerente',
      items: [
        { nombre: 'Resmas de papel bond y cartuchos', cantidad: 2, precio: 39.10, subtotal: 78.20 }
      ],
      comentariosGerente: 'Stock suficiente en almacén general. No procede adquisición externa.',
      esAltoMonto: false
    }
  ],

  // Base de datos de Proveedores
  proveedores: [
    {
      id: 'PRV-001',
      nombre: 'Tech Solutions Global',
      categoria: 'Tecnología',
      contacto: 'contacto@techsolutions.com',
      telefono: '+503 2234-5678',
      estado: 'Calificado',
      calificacion: 4.8
    },
    {
      id: 'PRV-002',
      nombre: 'Papelería y Suministros S.A.',
      categoria: 'Suministros',
      contacto: 'ventas@papeleriasuministros.com',
      telefono: '+503 2289-1122',
      estado: 'Calificado',
      calificacion: 4.6
    },
    {
      id: 'PRV-003',
      nombre: 'Muebles & Diseños Corp',
      categoria: 'Mobiliario',
      contacto: 'atencion@mueblesdisenos.com',
      telefono: '+503 2501-4455',
      estado: 'En Revisión',
      calificacion: 4.2
    },
    {
      id: 'PRV-004',
      nombre: 'Servicios Gastronómicos Deluxe',
      categoria: 'Servicios',
      contacto: 'eventos@deluxegastronomia.com',
      telefono: '+503 2345-9988',
      estado: 'Calificado',
      calificacion: 4.9
    },
    {
      id: 'PRV-005',
      nombre: 'Insumos Médicos & Seguridad Integral',
      categoria: 'Servicios',
      contacto: 'seguridad@insumosmedicos.com',
      telefono: '+503 2211-7788',
      estado: 'Inactivo',
      calificacion: 3.5
    }
  ],

  // Formulario temporal de Nueva Solicitud
  nuevaSolicitudForm: {
    descripcion: '',
    proveedor: '',
    items: [
      { nombre: '', cantidad: 1, precio: 0, subtotal: 0 }
    ]
  }
};

// Renderizador principal
function render() {
  const app = document.getElementById('app');
  
  if (state.currentView === 'login') {
    app.innerHTML = renderLogin();
  } else if (state.currentView === 'recuperar_password') {
    app.innerHTML = renderRecuperarPassword();
  } else {
    // Vistas principales con Layout (Sidebar + Header/Content)
    app.innerHTML = `
      <div class="flex h-screen w-screen overflow-hidden bg-aura-canvas text-slate-100">
        ${renderSidebar()}
        <main class="flex-1 flex flex-col h-full overflow-y-auto bg-aura-canvas relative">
          ${renderTopNav()}
          <div class="p-6 md:p-8 flex-1">
            ${renderMainContent()}
          </div>
        </main>
      </div>
      ${renderModal()}
    `;
  }
}

// ----------------- LOGIN & AUTH -----------------
function renderLogin() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4 relative">
      <!-- Glow background decoration -->
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
        <p class="text-xs text-slate-400 mb-6">Ingresa tus credenciales o selecciona un perfil de acceso rápido</p>

        <!-- Formulario de Login -->
        <form onsubmit="handleLoginFormSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">Correo Corporativo</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 text-sm">
                <i class="fa-regular fa-envelope"></i>
              </span>
              <input type="email" id="login-email" value="${state.loginCreds.email}" placeholder="usuario@empresa.com" class="w-full pl-9 pr-3 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
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
              <input type="password" id="login-password" value="${state.loginCreds.password}" placeholder="••••••••" class="w-full pl-9 pr-3 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
            </div>
          </div>

          <button type="submit" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2">
            <span>Ingresar al Sistema</span>
            <i class="fa-solid fa-arrow-right text-xs"></i>
          </button>
        </form>

        <!-- Divisor con perfiles de prueba RBAC -->
        <div class="relative my-6">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-aura-border"></div></div>
          <div class="relative flex justify-center text-xs uppercase"><span class="bg-aura-card px-2 text-slate-400 font-semibold tracking-wider">Perfiles de Acceso Rápido (RBAC)</span></div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <button onclick="loginAs('solicitante')" class="flex flex-col items-center justify-center p-3 rounded-xl border border-aura-border bg-slate-900/50 hover:bg-slate-900 hover:border-blue-500 transition-all group">
            <span class="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold mb-1.5 group-hover:scale-110 transition-transform">CM</span>
            <span class="text-xs font-semibold text-slate-200">Solicitante</span>
            <span class="text-[10px] text-slate-400">Carlos</span>
          </button>

          <button onclick="loginAs('gerente')" class="flex flex-col items-center justify-center p-3 rounded-xl border border-aura-border bg-slate-900/50 hover:bg-slate-900 hover:border-emerald-500 transition-all group">
            <span class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold mb-1.5 group-hover:scale-110 transition-transform">IH</span>
            <span class="text-xs font-semibold text-slate-200">Gerente</span>
            <span class="text-[10px] text-slate-400">Herberth</span>
          </button>

          <button onclick="loginAs('compras')" class="flex flex-col items-center justify-center p-3 rounded-xl border border-aura-border bg-slate-900/50 hover:bg-slate-900 hover:border-sky-500 transition-all group">
            <span class="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold mb-1.5 group-hover:scale-110 transition-transform">AM</span>
            <span class="text-xs font-semibold text-slate-200">Compras</span>
            <span class="text-[10px] text-slate-400">Ana</span>
          </button>
        </div>

        <!-- Botón para ver tokens y guía visual -->
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

function renderRecuperarPassword() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-aura-canvas p-4">
      <div class="w-full max-w-md bg-aura-card border border-aura-border rounded-2xl p-8 shadow-2xl">
        <div class="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl mb-4">
          <i class="fa-solid fa-key"></i>
        </div>
        <h2 class="text-xl font-bold text-white mb-1">Recuperar Contraseña</h2>
        <p class="text-xs text-slate-400 mb-6">Ingresa tu correo institucional registrado para recibir las instrucciones de restablecimiento.</p>
        
        <form onsubmit="handleRecuperarSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">Correo Electrónico</label>
            <input type="email" required placeholder="tu.correo@empresa.com" class="w-full px-3 py-2.5 bg-aura-input border border-aura-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
          <button type="submit" class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm shadow-lg shadow-blue-600/30 transition-all">
            Enviar Instrucciones
          </button>
        </form>

        <div class="mt-6 text-center">
          <button onclick="navigateTo('login')" class="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i>
            <span>Volver al inicio de sesión</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ----------------- SIDEBAR & NAVIGATION -----------------
function renderSidebar() {
  const user = state.users[state.currentRole] || state.users.solicitante;
  const isSolicitante = state.currentRole === 'solicitante';
  const isGerente = state.currentRole === 'gerente';
  const isCompras = state.currentRole === 'compras';

  // Ítems de navegación según el rol RBAC
  let navItems = [];
  if (isSolicitante) {
    // Figma Oficial: El Solicitante (Carlos) SOLO tiene Dashboard y Solicitudes
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Mis Solicitudes', icon: 'fa-table-columns', allowed: true }
    ];
  } else if (isGerente) {
    // Gerente (Herberth): Dashboard, Solicitudes, Aprobaciones (con badge) y Proveedores
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Solicitudes', icon: 'fa-table-columns', allowed: true },
      { 
        id: 'aprobaciones', 
        label: 'Aprobaciones', 
        icon: 'fa-clipboard-check', 
        allowed: true, 
        badge: state.solicitudes.filter(s => s.estado === 'en_revision').length 
      },
      { id: 'proveedores', label: 'Proveedores', icon: 'fa-building', allowed: true }
    ];
  } else {
    // Compras (Ana): Dashboard, Solicitudes, Proveedores y Aprobaciones técnicas
    navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', allowed: true },
      { id: 'solicitudes', label: 'Solicitudes', icon: 'fa-table-columns', allowed: true },
      { id: 'aprobaciones', label: 'Aprobaciones', icon: 'fa-clipboard-check', allowed: true },
      { id: 'proveedores', label: 'Proveedores', icon: 'fa-building', allowed: true }
    ];
  }

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
            if (!item.allowed) {
              // Botón deshabilitado con candado para Solicitante
              return `
                <div class="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-600 cursor-not-allowed text-xs font-medium border border-transparent">
                  <div class="flex items-center gap-3">
                    <i class="fa-solid ${item.icon} text-sm"></i>
                    <span>${item.label}</span>
                  </div>
                  <i class="fa-solid fa-lock text-[10px] text-slate-600"></i>
                </div>
              `;
            }
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
        <!-- Usuario activo Card -->
        <div class="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/80 border border-aura-border">
          <div class="w-9 h-9 rounded-full ${user.badgeColor} flex items-center justify-center font-bold text-xs text-white shadow-md">
            ${user.initials}
          </div>
          <div class="overflow-hidden">
            <h4 class="text-xs font-semibold text-white truncate">${user.name}</h4>
            <p class="text-[10px] text-slate-400 truncate">${user.roleTitle}</p>
          </div>
        </div>

        <!-- Botón Cerrar Sesión (Redirige a 1_login_empty) -->
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
  const isGerente = state.currentRole === 'gerente';
  const isCompras = state.currentRole === 'compras';

  const titles = {
    dashboard: isSolicitante ? 'Dashboard — Solicitante' : (isGerente ? 'Dashboard — Gerencia' : 'Dashboard — Compras & Adquisiciones'),
    solicitudes: isSolicitante ? 'Mis Solicitudes' : 'Tablero Kanban de Solicitudes',
    nueva_solicitud: 'Nueva Solicitud de Compra',
    aprobaciones: 'Bandeja de Dictamen y Aprobaciones',
    proveedores: 'Catálogo Oficial de Proveedores',
    proveedor_nuevo: 'Registrar Nuevo Proveedor',
    proveedor_editar: 'Editar Proveedor',
    detalle_solicitud: 'Ficha Técnica de Requerimiento',
    tokens: 'Tokens de Diseño & Guía Visual'
  };

  return `
    <header class="h-16 px-8 border-b border-aura-border flex items-center justify-between shrink-0 bg-aura-canvas/80 backdrop-blur sticky top-0 z-20">
      <div>
        <h2 class="text-base font-bold text-white tracking-tight">${titles[state.currentView] || 'AURA Compras'}</h2>
        <p class="text-[11px] text-slate-400">Sistema Corporativo v2.0 • Modo Oscuro</p>
      </div>

      <div class="flex items-center gap-3">
        ${isSolicitante && state.currentView === 'solicitudes' ? `
          <button onclick="navigateTo('nueva_solicitud')" class="py-2 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/30 transition-all flex items-center gap-2">
            <i class="fa-solid fa-plus text-[10px]"></i>
            <span>Nueva Solicitud</span>
          </button>
        ` : ''}

        ${state.currentRole === 'gerente' && state.currentView === 'proveedores' ? `
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
  const isCompras = state.currentRole === 'compras';

  // Filtrado de solicitudes según el rol
  const solicitudesRol = isSolicitante 
    ? state.solicitudes.filter(s => s.solicitante === 'Carlos Mendoza')
    : state.solicitudes;

  const countTotal = solicitudesRol.length;
  const countPendientes = solicitudesRol.filter(s => s.estado === 'en_revision' || s.estado === 'borrador').length;
  const countAprobadas = solicitudesRol.filter(s => s.estado === 'aprobado').length;
  const gastoTotal = solicitudesRol.filter(s => s.estado === 'aprobado').reduce((acc, curr) => acc + curr.total, 0);

  return `
    <div class="space-y-6">
      <!-- Banner informativo según rol -->
      <div class="p-4 rounded-xl bg-gradient-to-r ${
        isSolicitante ? 'from-blue-900/30 to-slate-900 border-blue-500/30' :
        isGerente ? 'from-emerald-900/30 to-slate-900 border-emerald-500/30' :
        'from-sky-900/30 to-slate-900 border-sky-500/30'
      } border flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-white mb-0.5">
            Bienvenido, ${state.users[state.currentRole].name}
          </h3>
          <p class="text-xs text-slate-400">
            ${isSolicitante ? 'Aquí puedes monitorear tus órdenes de compra y borradores de requerimientos.' :
              isGerente ? 'Panel de control de presupuesto, auditoría y flujo de aprobaciones gerenciales.' :
              'Panel operativo de compras: supervisión de órdenes, cotizaciones y abastecimiento global.'}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${
            isSolicitante ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
            isGerente ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
            'bg-sky-500/20 text-sky-400 border border-sky-500/30'
          }">
            Rol: ${state.users[state.currentRole].roleTitle}
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
          <h4 class="text-xs font-bold text-white uppercase tracking-wider">Actividad Reciente</h4>
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
              ${solicitudesRol.slice(0, 5).map(s => `
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="py-3 px-4 font-mono font-semibold text-blue-400">${s.id}</td>
                  <td class="py-3 px-4 font-medium max-w-xs truncate">${s.descripcion}</td>
                  <td class="py-3 px-4 text-slate-400">${s.proveedor}</td>
                  <td class="py-3 px-4 font-semibold text-white">$${s.total.toFixed(2)}</td>
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

  // Reglas RBAC para el tablero Kanban:
  // - Solicitante (Carlos): Ve borradores en Pendiente (2)
  // - Gerente (Herberth): NO ve borradores ajenos, ve Pendientes asignados a dictamen
  let items = [...state.solicitudes];
  if (isGerente) {
    items = items.filter(s => s.estado !== 'borrador');
  }

  const columns = [
    {
      id: 'pendiente',
      title: 'Borrador / Pendiente',
      borderColor: 'border-slate-500/40',
      badgeColor: 'bg-slate-700 text-slate-300',
      filter: (s) => isSolicitante ? (s.estado === 'borrador') : (s.estado === 'borrador')
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
      title: 'Rechazadas',
      borderColor: 'border-red-500/40',
      badgeColor: 'bg-red-500/20 text-red-300 border border-red-500/30',
      filter: (s) => s.estado === 'rechazado'
    }
  ];

  return `
    <div class="h-full flex flex-col">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
        ${columns.map(col => {
          const colItems = items.filter(col.filter);
          return `
            <div class="bg-aura-sidebar/70 border ${col.borderColor} rounded-xl flex flex-col h-full overflow-hidden">
              <!-- Header Columna -->
              <div class="p-3.5 border-b border-aura-border bg-slate-900/40 flex items-center justify-between">
                <span class="text-xs font-bold text-slate-200 tracking-wide">${col.title}</span>
                <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${col.badgeColor}">${colItems.length}</span>
              </div>

              <!-- Lista de Tarjetas -->
              <div class="p-3 space-y-3 flex-1 overflow-y-auto">
                ${colItems.length === 0 ? `
                  <div class="h-32 flex flex-col items-center justify-center text-slate-500 text-xs italic">
                    <i class="fa-regular fa-clipboard mb-1.5 text-base"></i>
                    <span>Sin solicitudes</span>
                  </div>
                ` : colItems.map(item => `
                  <div onclick="verDetalleSolicitud('${item.id}')" class="bg-aura-card border border-aura-border hover:border-blue-500/50 p-4 rounded-xl cursor-pointer shadow-md transition-all group">
                    <div class="flex items-center justify-between mb-2">
                      <span class="font-mono text-xs font-bold text-blue-400 group-hover:underline">${item.id}</span>
                      <span class="text-[10px] text-slate-400">${item.fecha}</span>
                    </div>

                    <h5 class="text-xs font-semibold text-slate-200 line-clamp-2 mb-2 group-hover:text-white transition-colors">
                      ${item.descripcion}
                    </h5>

                    <div class="text-[11px] text-slate-400 truncate mb-3">
                      <i class="fa-regular fa-building text-[10px] mr-1 text-slate-500"></i>
                      ${item.proveedor}
                    </div>

                    <div class="flex items-center justify-between pt-2 border-t border-aura-border/60">
                      <div>
                        <span class="text-[10px] text-slate-500 block">Total</span>
                        <span class="text-xs font-bold text-white font-mono">$${item.total.toFixed(2)}</span>
                      </div>
                      ${item.esAltoMonto ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <i class="fa-solid fa-star text-[9px]"></i>
                          <span>Alto Monto</span>
                        </span>
                      ` : `
                        <span class="text-[10px] text-slate-400">Ordinaria</span>
                      `}
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

// 3. NUEVA SOLICITUD (Solo Solicitante)
function renderNuevaSolicitud() {
  const form = state.nuevaSolicitudForm;
  const totalCalculado = form.items.reduce((acc, it) => acc + (it.cantidad * it.precio), 0);
  const esAltoMonto = totalCalculado >= 1000;

  return `
    <div class="max-w-4xl mx-auto bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-6 pb-4 border-b border-aura-border">
        <div>
          <h3 class="text-base font-bold text-white">Nueva Solicitud de Compra (SC)</h3>
          <p class="text-xs text-slate-400">Ingresa los detalles del requerimiento y los ítems cotizados</p>
        </div>
        <button onclick="navigateTo('solicitudes')" class="px-3 py-1.5 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
          ← Volver al Kanban
        </button>
      </div>

      <form onsubmit="handleCrearSolicitud(event)" class="space-y-6">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">Descripción General del Requerimiento</label>
          <input type="text" id="solicitud-desc" required value="${form.descripcion}" placeholder="Ej. Material y suministros para oficina del área administrativa" class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">Proveedor Sugerido / Seleccionado</label>
          <select id="solicitud-prov" required class="w-full px-3.5 py-2.5 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
            <option value="">-- Seleccionar Proveedor --</option>
            ${state.proveedores.map(p => `
              <option value="${p.nombre}" ${form.proveedor === p.nombre ? 'selected' : ''}>${p.nombre} (${p.categoria})</option>
            `).join('')}
          </select>
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
                      $${(item.cantidad * item.precio).toFixed(2)}
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

        <!-- Banner de Política de Dictamen Dinámica -->
        <div class="p-3.5 rounded-xl border flex items-center justify-between ${
          esAltoMonto 
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
        }">
          <div class="flex items-center gap-2.5">
            <i class="fa-solid ${esAltoMonto ? 'fa-triangle-exclamation text-amber-400' : 'fa-circle-check text-emerald-400'} text-base"></i>
            <div>
              <span class="text-xs font-bold block">
                ${esAltoMonto ? 'Solicitud de Alto Monto (≥ $1,000 USD)' : 'Aprobación ordinaria de Gerencia de Área (Monto menor a $1,000 USD)'}
              </span>
              <span class="text-[11px] opacity-80">
                ${esAltoMonto ? 'Requiere doble visto bueno gerencial y dictamen de Compras & Finanzas.' : 'Pasa al flujo regular de aprobación directa por el Ing. Herberth.'}
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
            Guardar como Borrador
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

// 4. BANDEJA DE APROBACIONES (Gerente & Compras)
function renderAprobaciones() {
  const isGerente = state.currentRole === 'gerente';
  const isCompras = state.currentRole === 'compras';

  // Solicitudes en revisión
  const pendientes = state.solicitudes.filter(s => s.estado === 'en_revision');

  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-white">Bandeja de Requerimientos Asignados</h3>
          <p class="text-xs text-slate-400">Emite tu dictamen técnico o gerencial para dar continuidad al proceso de adquisición</p>
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
                    No tienes requerimientos pendientes por dictaminar.
                  </td>
                </tr>
              ` : pendientes.map(s => `
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="py-3.5 px-4 font-mono font-bold text-blue-400">${s.id}</td>
                  <td class="py-3.5 px-4 font-medium">${s.solicitante}</td>
                  <td class="py-3.5 px-4 max-w-sm truncate">${s.descripcion}</td>
                  <td class="py-3.5 px-4 font-mono font-bold text-white">$${s.total.toFixed(2)}</td>
                  <td class="py-3.5 px-4">
                    ${s.esAltoMonto ? `
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Alto Monto</span>
                    ` : `
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">Ordinaria</span>
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

// 5. CATÁLOGO DE PROVEEDORES
function renderProveedores() {
  const isGerente = state.currentRole === 'gerente';
  const categorias = ['Todos', 'Tecnología', 'Suministros', 'Mobiliario', 'Servicios'];

  const filtrados = state.activeFilterCategoria === 'Todos'
    ? state.proveedores
    : state.proveedores.filter(p => p.categoria.toLowerCase() === state.activeFilterCategoria.toLowerCase());

  return `
    <div class="space-y-6">
      <!-- Filtros por categoría de proveedor -->
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

      <!-- Tabla de Proveedores -->
      <div class="bg-aura-card border border-aura-border rounded-xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900/60 text-slate-400 border-b border-aura-border">
              <tr>
                <th class="py-3 px-4">ID</th>
                <th class="py-3 px-4">Razón Social / Nombre</th>
                <th class="py-3 px-4">Categoría</th>
                <th class="py-3 px-4">Contacto Directo</th>
                <th class="py-3 px-4">Calificación</th>
                <th class="py-3 px-4">Estado</th>
                <th class="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-aura-border text-slate-200">
              ${filtrados.map(p => `
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="py-3.5 px-4 font-mono font-semibold text-blue-400">${p.id}</td>
                  <td class="py-3.5 px-4 font-bold text-white">${p.nombre}</td>
                  <td class="py-3.5 px-4">
                    <span class="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                      ${p.categoria}
                    </span>
                  </td>
                  <td class="py-3.5 px-4">
                    <div class="text-slate-300 font-medium">${p.contacto}</div>
                    <div class="text-[10px] text-slate-500">${p.telefono}</div>
                  </td>
                  <td class="py-3.5 px-4">
                    <span class="text-amber-400 font-semibold flex items-center gap-1">
                      <i class="fa-solid fa-star text-[10px]"></i>
                      <span>${p.calificacion}</span>
                    </span>
                  </td>
                  <td class="py-3.5 px-4">${renderBadgeProveedor(p.estado)}</td>
                  <td class="py-3.5 px-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button onclick="editarProveedor('${p.id}')" title="Editar" class="p-1.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors">
                        <i class="fa-solid fa-pen-to-square text-xs"></i>
                      </button>
                      ${isGerente ? `
                        <button onclick="confirmarEliminarProveedor('${p.id}')" title="Depurar / Eliminar" class="p-1.5 rounded bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition-colors">
                          <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      ` : ''}
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

// 6. DETALLE DE SOLICITUD
function renderDetalleSolicitud() {
  const item = state.solicitudes.find(s => s.id === state.selectedSolicitudId) || state.solicitudes[0];
  const isSolicitante = state.currentRole === 'solicitante';
  const isGerente = state.currentRole === 'gerente';

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
              <span>Alto Monto</span>
            </span>
          ` : ''}
        </div>
      </div>

      <!-- Ficha de Información Principal -->
      <div class="bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl space-y-6">
        <div class="flex items-start justify-between border-b border-aura-border pb-4">
          <div>
            <div class="text-xs font-mono text-blue-400 font-bold mb-1">${item.id}</div>
            <h3 class="text-lg font-bold text-white mb-1">${item.descripcion}</h3>
            ${item.estado === 'borrador' 
  ? `<p class="text-xs text-amber-400 font-medium"><i class="fa-solid fa-pencil mr-1 text-[10px]"></i>Borrador guardado localmente el ${item.fecha} por <strong class="text-slate-200">${item.solicitante}</strong> (Aún no enviado a revisión)</p>`
  : `<p class="text-xs text-slate-400">Enviada el ${item.fecha} por <strong class="text-slate-200">${item.solicitante}</strong></p>`}
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-400 block mb-0.5">Monto Total</span>
            <span class="text-2xl font-bold font-mono text-white">$${item.total.toFixed(2)}</span>
          </div>
        </div>

        <!-- Proveedor Adjudicado/Sugerido -->
        <div class="bg-slate-900/60 border border-aura-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Proveedor</span>
            <span class="text-sm font-semibold text-white">${item.proveedor}</span>
          </div>
          <span class="text-xs text-blue-400 font-medium">Cotización verificada ✓</span>
        </div>

        <!-- Ítems -->
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
                ${item.items.map(it => `
                  <tr>
                    <td class="py-2.5 px-3 font-medium">${it.nombre}</td>
                    <td class="py-2.5 px-3 text-center">${it.cantidad}</td>
                    <td class="py-2.5 px-3 text-right font-mono">$${it.precio.toFixed(2)}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-white">$${it.subtotal.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Banner Resolutivo Según Estado Oficial de Figma (8b, 8c, 8 / Borrador) -->
        ${item.estado === 'aprobado' ? `
          <!-- Pantalla Oficial Figma 14: 8b_detalle_solicitud_aprobada -->
          <div class="p-4 rounded-xl border bg-emerald-500/15 border-emerald-500/40 text-emerald-300 flex items-start gap-3">
            <div class="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fa-solid fa-check text-emerald-400 text-xs"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-emerald-200 block">
                Solicitud Aprobada el ${item.fechaDictamen || item.fecha} por ${item.aprobador || 'Ing. Herberth Gerente'}
              </span>
              <span class="text-[11px] text-emerald-300/80 mt-0.5 block">
                Resolución: "${item.comentariosGerente || 'Aprobado conforme al presupuesto asignado y justificación presupuestaria validada.'}"
              </span>
            </div>
          </div>
        ` : item.estado === 'rechazado' ? `
          <!-- Pantalla Oficial Figma 15: 8c_detalle_solicitud_rechazada -->
          <div class="p-4 rounded-xl border bg-red-500/15 border-red-500/40 text-red-300 flex items-start gap-3">
            <div class="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fa-solid fa-xmark text-red-400 text-xs"></i>
            </div>
            <div>
              <span class="text-xs font-bold text-red-200 block">
                Solicitud Rechazada el ${item.fechaDictamen || item.fecha} por ${item.aprobador || 'Ing. Herberth Gerente'}
              </span>
              <span class="text-[11px] text-red-300/80 mt-0.5 block">
                Motivo de auditoría obligatorio: "${item.comentariosGerente || 'Stock suficiente en almacén general. No procede adquisición externa.'}"
              </span>
            </div>
          </div>
        ` : item.estado === 'borrador' ? `
          <div class="p-3.5 rounded-xl border bg-slate-800/80 border-slate-600 flex items-center justify-between text-slate-300">
            <div class="flex items-center gap-3">
              <i class="fa-solid fa-file-pen text-amber-400 text-base"></i>
              <div>
                <span class="text-xs font-bold text-white block">Estado de Borrador (Pendiente de Envío)</span>
                <span class="text-[11px] text-slate-400">Esta solicitud aún no ha sido remitida a Gerencia. Puedes modificar sus partidas o enviarla formalmente.</span>
              </div>
            </div>
            ${isSolicitante ? `
              <button onclick="enviarBorradorAFirma('${item.id}')" class="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5">
                <i class="fa-solid fa-paper-plane text-[10px]"></i>
                <span>Enviar a Revisión</span>
              </button>
            ` : ''}
          </div>
        ` : `
          <!-- En Revisión: aviso preventivo de política -->
          <div class="p-3.5 rounded-xl border flex items-center gap-3 ${
            item.esAltoMonto 
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
              : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
          }">
            <i class="fa-solid ${item.esAltoMonto ? 'fa-triangle-exclamation text-amber-400' : 'fa-circle-check text-emerald-400'} text-base"></i>
            <span class="text-xs font-semibold">
              ${item.esAltoMonto 
                ? 'Este monto pasará a Director (> $1,000 USD)' 
                : 'Este monto pasará a Gerente de Área (≤ $1,000 USD)'}
            </span>
          </div>
        `}

        <!-- Comentario de Gerencia si está en revisión o histórico adicional -->
        ${(item.estado !== 'aprobado' && item.estado !== 'rechazado' && item.comentariosGerente) ? `
          <div class="p-4 rounded-xl bg-slate-900/80 border border-aura-border">
            <span class="text-xs font-bold text-slate-300 block mb-1">Dictamen de Gerencia:</span>
            <p class="text-xs text-slate-400 italic">"${item.comentariosGerente}"</p>
          </div>
        ` : ''}

        <!-- Botones de Acción de Dictamen (si el usuario es Gerente y está en revisión) -->
        ${isGerente && item.estado === 'en_revision' ? `
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

// 7. FORMULARIO DE PROVEEDOR (Crear / Editar)
function renderProveedorForm(isEdit) {
  const p = isEdit 
    ? state.proveedores.find(x => x.id === state.selectedProveedorId) || state.proveedores[0]
    : { id: `PRV-00${state.proveedores.length + 1}`, nombre: '', categoria: 'Tecnología', contacto: '', telefono: '', estado: 'Calificado', calificacion: 4.5 };

  return `
    <div class="max-w-2xl mx-auto bg-aura-card border border-aura-border rounded-2xl p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-6 pb-4 border-b border-aura-border">
        <div>
          <h3 class="text-base font-bold text-white">${isEdit ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}</h3>
          <p class="text-xs text-slate-400">Gestión de ficha comercial en el catálogo oficial</p>
        </div>
        <button onclick="navigateTo('proveedores')" class="px-3 py-1.5 rounded-lg border border-aura-border text-xs text-slate-300 hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
      </div>

      <form onsubmit="handleGuardarProveedor(event, ${isEdit})" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">Razón Social / Nombre Comercial</label>
          <input type="text" id="prov-nombre" required value="${p.nombre}" placeholder="Ej. Soluciones Informáticas del Pacífico" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Categoría de Suministro</label>
            <select id="prov-categoria" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="Tecnología" ${p.categoria === 'Tecnología' ? 'selected' : ''}>Tecnología</option>
              <option value="Suministros" ${p.categoria === 'Suministros' ? 'selected' : ''}>Suministros</option>
              <option value="Mobiliario" ${p.categoria === 'Mobiliario' ? 'selected' : ''}>Mobiliario</option>
              <option value="Servicios" ${p.categoria === 'Servicios' ? 'selected' : ''}>Servicios</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Estado Operativo</label>
            <select id="prov-estado" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="Calificado" ${p.estado === 'Calificado' ? 'selected' : ''}>Calificado</option>
              <option value="En Revisión" ${p.estado === 'En Revisión' ? 'selected' : ''}>En Revisión</option>
              <option value="Inactivo" ${p.estado === 'Inactivo' ? 'selected' : ''}>Inactivo</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Correo de Contacto</label>
            <input type="email" id="prov-contacto" required value="${p.contacto}" placeholder="contacto@proveedor.com" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Teléfono Institucional</label>
            <input type="text" id="prov-telefono" required value="${p.telefono}" placeholder="+503 2222-0000" class="w-full px-3.5 py-2 bg-aura-input border border-aura-border rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500">
          </div>
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

// 8. TOKENS DE DISEÑO & GUÍA VISUAL (Basado fielmente en el Frame 20_Design_System_Tokens_Frame)
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

      <!-- Paleta Primaria, Marca & Superficies -->
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

      <!-- Colores Semánticos, Estados y RBAC -->
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
          ${renderColorSwatch('#8B5CF6', 'Violet Role', 'Supervisión')}
          ${renderColorSwatch('#475569', 'Neutral Dark', 'Borrador')}
          ${renderColorSwatch('#1D4ED8', 'Primary Hover', 'Interaction')}
        </div>
      </div>

      <!-- Jerarquía Tipográfica y Componentes -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-aura-card border border-aura-border rounded-xl p-5 space-y-4">
          <h4 class="text-xs font-bold text-sky-400 uppercase tracking-wider">Jerarquía Tipográfica (Inter)</h4>
          <div class="space-y-3">
            <div>
              <div class="text-xl font-bold text-white">Inter Bold 24px — H1 Titulares</div>
              <span class="text-[11px] text-slate-500">Titulares de página y dashboards ejecutivos</span>
            </div>
            <div>
              <div class="text-base font-semibold text-white">Inter SemiBold 18px — H2 Secciones y Modales</div>
              <span class="text-[11px] text-slate-500">Títulos de tarjetas, pasos de wizard y diálogos</span>
            </div>
            <div>
              <div class="text-xs font-medium text-slate-300">Inter Medium 14px — Body Regular / Botones / Inputs</div>
              <span class="text-[11px] text-slate-500">Cuerpo de texto legible en interfaz oscura</span>
            </div>
            <div>
              <div class="text-[11px] text-slate-400 font-normal">Inter Regular 12px — Metadatos, Badges y Ayudas</div>
              <span class="text-[11px] text-slate-500">Pies de página y etiquetas de formulario</span>
            </div>
          </div>
        </div>

        <div class="bg-aura-card border border-aura-border rounded-xl p-5 space-y-4">
          <h4 class="text-xs font-bold text-sky-400 uppercase tracking-wider">Componentes Clave & Badges RBAC</h4>
          
          <div class="flex flex-wrap gap-2">
            <button class="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold shadow">Botón Primario</button>
            <button class="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow">Aprobar Dictamen</button>
            <button class="px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold shadow">Rechazar</button>
            <button class="px-3.5 py-1.5 rounded-lg bg-slate-800 border border-aura-border text-slate-300 text-xs font-medium">Cancelar / Secundario</button>
          </div>

          <div class="pt-3 border-t border-aura-border flex flex-wrap gap-2">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">Rol: Solicitante</span>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Rol: Gerente Aprobador</span>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">Rol: Compras</span>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Prioridad Alta</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderColorSwatch(hex, name, token) {
  const isDark = hex === '#0F172A' || hex === '#0B1120' || hex === '#1E293B' || hex === '#334155' || hex === '#475569';
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
  switch (estado) {
    case 'aprobado':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Aprobado</span>`;
    case 'rechazado':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">Rechazado</span>`;
    case 'en_revision':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">En Revisión</span>`;
    case 'borrador':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-slate-300 border border-slate-600">Borrador</span>`;
    default:
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">${estado}</span>`;
  }
}

function renderBadgeProveedor(estado) {
  switch (estado) {
    case 'Calificado':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Calificado</span>`;
    case 'En Revisión':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">En Revisión</span>`;
    case 'Inactivo':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">Inactivo</span>`;
    default:
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">${estado}</span>`;
  }
}

// ----------------- MODALES -----------------
function renderModal() {
  if (!state.proveedorToDelete) return '';

  return `
    <div class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-aura-card border border-aura-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
        <div class="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center text-xl">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div>
          <h3 class="text-base font-bold text-white mb-1">¿Depurar este Proveedor?</h3>
          <p class="text-xs text-slate-400">
            Esta acción eliminará a <strong class="text-white">${state.proveedorToDelete.nombre}</strong> del catálogo activo. El historial de compras conservará sus registros.
          </p>
        </div>
        <div class="pt-2 flex items-center justify-end gap-3">
          <button onclick="cerrarModalEliminar()" class="px-4 py-2 rounded-lg border border-aura-border text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors">
            Cancelar
          </button>
          <button onclick="ejecutarEliminarProveedor()" class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white shadow-lg shadow-red-600/30 transition-all">
            Sí, Depurar Proveedor
          </button>
        </div>
      </div>
    </div>
  `;
}

// ----------------- CONTROLADORES Y ACCIONES -----------------
window.navigateTo = function(view) {
  // Guardia estricta de control de acceso RBAC (Figma Oficial)
  if (state.currentRole === 'solicitante' && (view === 'aprobaciones' || view === 'proveedores' || view === 'proveedor_nuevo' || view === 'proveedor_editar')) {
    showToast('Acceso Denegado: El solicitante no tiene permisos para esta sección.', 'warning');
    return;
  }
  state.currentView = view;
  render();
};

window.loginAs = function(role) {
  state.currentRole = role;
  state.currentView = 'dashboard';
  showToast(`Sesión iniciada como ${state.users[role].name} (${state.users[role].roleTitle})`, 'info');
  render();
};

window.handleLoginFormSubmit = function(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  
  if (email.includes('herberth') || email.includes('gerente')) {
    loginAs('gerente');
  } else if (email.includes('ana') || email.includes('compras')) {
    loginAs('compras');
  } else {
    // Por defecto Solicitante
    loginAs('solicitante');
  }
};

window.handleRecuperarSubmit = function(e) {
  e.preventDefault();
  showToast('Se enviaron las instrucciones a tu correo institucional.', 'success');
  navigateTo('login');
};

window.handleLogout = function() {
  state.currentRole = null;
  state.loginCreds = { email: '', password: '' };
  state.currentView = 'login';
  showToast('Sesión cerrada correctamente.', 'info');
  render();
};



window.setFilterCategoria = function(cat) {
  state.activeFilterCategoria = cat;
  render();
};

window.verDetalleSolicitud = function(id) {
  state.selectedSolicitudId = id;
  state.currentView = 'detalle_solicitud';
  render();
};

window.dictaminarSolicitud = function(id, resultado) {
  if (state.currentRole === 'solicitante') {
    showToast('Acceso Denegado: Un solicitante no tiene permisos de dictamen.', 'warning');
    return;
  }
  const s = state.solicitudes.find(x => x.id === id);
  if (s) {
    s.estado = resultado;
    s.fechaDictamen = 'Hoy';
    s.aprobador = state.users[state.currentRole].name;
    s.comentariosGerente = resultado === 'aprobado' 
      ? 'Aprobado conforme al presupuesto trimestral asignado.' 
      : 'Rechazado tras evaluación técnica-financiera: no procede adquisición externa.';
    showToast(`Solicitud ${id} fue ${resultado.toUpperCase()} con éxito.`, resultado === 'aprobado' ? 'success' : 'warning');
    render();
  }
};

// Manipulación de ítems en nueva solicitud
window.agregarFilaItem = function() {
  state.nuevaSolicitudForm.items.push({ nombre: '', cantidad: 1, precio: 0, subtotal: 0 });
  render();
};

window.eliminarFilaItem = function(idx) {
  state.nuevaSolicitudForm.items.splice(idx, 1);
  render();
};

window.actualizarItem = function(idx, campo, valor) {
  const it = state.nuevaSolicitudForm.items[idx];
  if (campo === 'cantidad') it.cantidad = parseInt(valor) || 1;
  else if (campo === 'precio') it.precio = parseFloat(valor) || 0;
  else it[campo] = valor;
  it.subtotal = it.cantidad * it.precio;
  render();
};

window.guardarBorrador = function() {
  const desc = document.getElementById('solicitud-desc').value.trim() || 'Borrador sin título';
  const prov = document.getElementById('solicitud-prov').value || 'Sin asignar';
  const total = state.nuevaSolicitudForm.items.reduce((acc, it) => acc + (it.cantidad * it.precio), 0);
  
  const nuevoId = `SC-00${state.solicitudes.length + 11}`;
  state.solicitudes.push({
    id: nuevoId,
    descripcion: desc,
    solicitante: state.users[state.currentRole].name,
    proveedor: prov,
    total: total,
    estado: 'borrador',
    fecha: 'Hoy',
    items: [...state.nuevaSolicitudForm.items],
    comentariosGerente: '',
    esAltoMonto: total >= 1000
  });

  showToast(`Borrador ${nuevoId} guardado con éxito.`, 'info');
  navigateTo('solicitudes');
};

window.handleCrearSolicitud = function(e) {
  e.preventDefault();
  const desc = document.getElementById('solicitud-desc').value.trim();
  const prov = document.getElementById('solicitud-prov').value;
  const total = state.nuevaSolicitudForm.items.reduce((acc, it) => acc + (it.cantidad * it.precio), 0);

  const nuevoId = `SC-00${state.solicitudes.length + 11}`;
  state.solicitudes.unshift({
    id: nuevoId,
    descripcion: desc,
    solicitante: state.users[state.currentRole].name,
    proveedor: prov,
    total: total,
    estado: 'en_revision',
    fecha: 'Hoy',
    items: [...state.nuevaSolicitudForm.items],
    comentariosGerente: '',
    esAltoMonto: total >= 1000
  });

  showToast(`Solicitud ${nuevoId} enviada a Dictamen.`, 'success');
  navigateTo('solicitudes');
};

// CRUD Proveedor
window.editarProveedor = function(id) {
  state.selectedProveedorId = id;
  state.currentView = 'proveedor_editar';
  render();
};

window.confirmarEliminarProveedor = function(id) {
  state.proveedorToDelete = state.proveedores.find(p => p.id === id);
  render();
};

window.cerrarModalEliminar = function() {
  state.proveedorToDelete = null;
  render();
};

window.ejecutarEliminarProveedor = function() {
  if (state.proveedorToDelete) {
    const id = state.proveedorToDelete.id;
    state.proveedores = state.proveedores.filter(p => p.id !== id);
    showToast(`Proveedor ${id} depurado del catálogo oficial.`, 'warning');
    state.proveedorToDelete = null;
    render();
  }
};

window.handleGuardarProveedor = function(e, isEdit) {
  e.preventDefault();
  const nombre = document.getElementById('prov-nombre').value.trim();
  const categoria = document.getElementById('prov-categoria').value;
  const estado = document.getElementById('prov-estado').value;
  const contacto = document.getElementById('prov-contacto').value.trim();
  const telefono = document.getElementById('prov-telefono').value.trim();

  if (isEdit) {
    const p = state.proveedores.find(x => x.id === state.selectedProveedorId);
    if (p) {
      p.nombre = nombre;
      p.categoria = categoria;
      p.estado = estado;
      p.contacto = contacto;
      p.telefono = telefono;
      showToast('Proveedor actualizado correctamente.', 'success');
    }
  } else {
    const nuevoId = `PRV-00${state.proveedores.length + 1}`;
    state.proveedores.push({
      id: nuevoId,
      nombre: nombre,
      categoria: categoria,
      contacto: contacto,
      telefono: telefono,
      estado: estado,
      calificacion: 4.5
    });
    showToast(`Proveedor ${nuevoId} registrado con éxito.`, 'success');
  }

  navigateTo('proveedores');
};

// Notificaciones Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    info: 'bg-blue-600/90 text-white border-blue-400',
    success: 'bg-emerald-600/90 text-white border-emerald-400',
    warning: 'bg-amber-600/90 text-white border-amber-400'
  };

  toast.className = `px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl border backdrop-blur flex items-center gap-2 transform transition-all duration-300 pointer-events-auto ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i class="fa-solid fa-circle-info"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  render();
});

window.enviarBorradorAFirma = function(id) {
  const s = state.solicitudes.find(x => x.id === id);
  if (s) {
    s.estado = 'en_revision';
    s.fecha = 'Hoy';
    showToast(`Borrador ${id} remitido exitosamente a revisión gerencial.`, 'success');
    render();
  }
};
