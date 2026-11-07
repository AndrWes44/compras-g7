/**
 * SISTEMA DE COMPRAS - GESTIÓN Y APROBACIONES
 * Lógica de frontend interactivo para demostración de avance.
 * Coincide con las pantallas de Figma:
 * - Login
 * - Tablero Kanban (Pendiente, En Revisión, Aprobado, Rechazado)
 * - Modal Nueva Solicitud (items dinámicos, cálculo y umbral Director > $1,000)
 * - Bandeja y Modal de Dictamen (Aprobar / Rechazar)
 */

// Datos iniciales que replican exactamente los de la Foto 2 de Figma
let solicitudes = [
  {
    id: "SC-0012",
    descripcion: "Nombre de solicitante",
    solicitante: "Carlos Rodrigo",
    proveedor: "Dell Technologies Direct",
    monto: 14.20,
    fecha: "10/10/2026",
    estado: "Pendiente"
  },
  {
    id: "SC-0013",
    descripcion: "Servicios cloud período",
    solicitante: "Carlos Rodrigo",
    proveedor: "Amazon Web Services Inc.",
    monto: 12.00,
    fecha: "11/10/2026",
    estado: "Pendiente"
  },
  {
    id: "SC-0014",
    descripcion: "Equipos de cómputo",
    solicitante: "Matute",
    proveedor: "Dell Technologies Direct",
    monto: 78.00,
    fecha: "09/10/2026",
    estado: "En Revisión"
  },
  {
    id: "SC-0015",
    descripcion: "Licencias anuales",
    solicitante: "Andrés",
    proveedor: "JetBrains Software Inc.",
    monto: 25.00,
    fecha: "12/10/2026",
    estado: "En Revisión"
  },
  {
    id: "SC-0016",
    descripcion: "Mobiliario oficina",
    solicitante: "Héctor",
    proveedor: "Office Depot Corporativo",
    monto: 15.20,
    fecha: "05/10/2026",
    estado: "Aprobado"
  },
  {
    id: "SC-0017",
    descripcion: "Papelería extra",
    solicitante: "Brandon",
    proveedor: "Office Depot Corporativo",
    monto: 78.20,
    fecha: "01/10/2026",
    estado: "Rechazado"
  }
];

let solicitudSeleccionada = null;
let idSecuencia = 18;

// INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", () => {
  renderLucideIcons();
  setupLoginForm();
  renderKanban();
  renderAprobaciones();
});

function renderLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// MANEJO DE LOGIN
function setupLoginForm() {
  const form = document.getElementById("login-form");
  const btnDemo = document.getElementById("btn-login-demo");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    loginExitoso();
  });

  btnDemo.addEventListener("click", () => {
    loginExitoso();
  });
}

function loginExitoso() {
  document.getElementById("view-login").style.display = "none";
  document.getElementById("app-layout").style.display = "flex";
  renderLucideIcons();
}

function logout() {
  document.getElementById("app-layout").style.display = "none";
  document.getElementById("view-login").style.display = "flex";
}

// NAVEGACIÓN ENTRE VISTAS
function navigate(viewName) {
  // Ocultar todas las vistas
  document.getElementById("view-solicitudes").style.display = "none";
  document.getElementById("view-aprobaciones").style.display = "none";
  document.getElementById("view-proveedores").style.display = "none";

  // Desactivar botones nav
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));

  if (viewName === "solicitudes") {
    document.getElementById("view-solicitudes").style.display = "block";
    document.getElementById("nav-solicitudes").classList.add("active");
    renderKanban();
  } else if (viewName === "aprobaciones") {
    document.getElementById("view-aprobaciones").style.display = "block";
    document.getElementById("nav-aprobaciones").classList.add("active");
    renderAprobaciones();
  } else if (viewName === "proveedores") {
    document.getElementById("view-proveedores").style.display = "block";
    document.getElementById("nav-proveedores").classList.add("active");
  }

  renderLucideIcons();
}

// RENDERIZAR TABLERO KANBAN
function renderKanban() {
  const colPendiente = document.getElementById("col-pendiente");
  const colRevision = document.getElementById("col-revision");
  const colAprobado = document.getElementById("col-aprobado");
  const colRechazado = document.getElementById("col-rechazado");

  colPendiente.innerHTML = "";
  colRevision.innerHTML = "";
  colAprobado.innerHTML = "";
  colRechazado.innerHTML = "";

  let cPendiente = 0, cRevision = 0, cAprobado = 0, cRechazado = 0;

  solicitudes.forEach(sol => {
    const card = document.createElement("div");
    card.className = "kanban-card";
    card.onclick = () => abrirDictamen(sol.id);

    let badgeClass = "badge-pendiente";
    let badgeText = sol.estado;

    if (sol.estado === "Pendiente") {
      badgeClass = "badge-pendiente";
      badgeText = "Pendiente";
      cPendiente++;
      colPendiente.appendChild(card);
    } else if (sol.estado === "En Revisión") {
      badgeClass = "badge-revision";
      badgeText = "Revisión";
      cRevision++;
      colRevision.appendChild(card);
    } else if (sol.estado === "Aprobado") {
      badgeClass = "badge-aprobado";
      badgeText = "Aprobado";
      cAprobado++;
      colAprobado.appendChild(card);
    } else if (sol.estado === "Rechazado") {
      badgeClass = "badge-rechazado";
      badgeText = "Rechazado";
      cRechazado++;
      colRechazado.appendChild(card);
    }

    card.innerHTML = `
      <div class="card-top-row">
        <span class="card-code">${sol.id}</span>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="card-description">${sol.descripcion}</div>
      <div class="card-amount">${Number(sol.monto).toFixed(2)} USD</div>
      <div class="card-footer-row">
        <span>${sol.fecha}</span>
        <span>${sol.solicitante.split(' ')[0]}</span>
      </div>
    `;
  });

  document.getElementById("count-pendiente").textContent = cPendiente;
  document.getElementById("count-revision").textContent = cRevision;
  document.getElementById("count-aprobado").textContent = cAprobado;
  document.getElementById("count-rechazado").textContent = cRechazado;
}

// RENDERIZAR TABLA DE BANDEJA DE APROBACIONES
function renderAprobaciones() {
  const tbody = document.getElementById("aprobaciones-tbody");
  tbody.innerHTML = "";

  solicitudes.forEach(sol => {
    let badgeClass = "badge-pendiente";
    if (sol.estado === "En Revisión") badgeClass = "badge-revision";
    if (sol.estado === "Aprobado") badgeClass = "badge-aprobado";
    if (sol.estado === "Rechazado") badgeClass = "badge-rechazado";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sol.id}</strong></td>
      <td>${sol.descripcion}</td>
      <td>${sol.solicitante}</td>
      <td>${sol.proveedor}</td>
      <td><strong>$${Number(sol.monto).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong></td>
      <td><span class="badge ${badgeClass}">${sol.estado}</span></td>
      <td>
        <button class="btn-table-action" onclick="abrirDictamen('${sol.id}')">Dictaminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// MODAL NUEVA SOLICITUD (FOTO 3 FIGMA)
function openNewSolicitudModal() {
  document.getElementById("form-nueva-solicitud").reset();
  // Restablecer items iniciales
  const tbody = document.getElementById("items-tbody");
  tbody.innerHTML = `
    <tr class="item-row">
      <td><input type="text" class="item-name" value="Licencia Anual" required placeholder="Nombre de item"></td>
      <td><input type="number" class="item-qty" value="1" min="1" step="1" oninput="recalcularTotales()" required></td>
      <td><input type="number" class="item-price" value="1800.00" min="0" step="0.01" oninput="recalcularTotales()" required></td>
      <td class="item-subtotal text-right">$1,800.00</td>
    </tr>
  `;
  document.getElementById("solicitud-descripcion").value = "Renovación de Licencias de Desarrollo";
  document.getElementById("solicitud-proveedor").value = "JetBrains Software Inc.";
  recalcularTotales();
  document.getElementById("modal-nueva-solicitud").style.display = "flex";
  renderLucideIcons();
}

function agregarFilaItem() {
  const tbody = document.getElementById("items-tbody");
  const tr = document.createElement("tr");
  tr.className = "item-row";
  tr.innerHTML = `
    <td><input type="text" class="item-name" placeholder="Nombre de ítem" required></td>
    <td><input type="number" class="item-qty" value="1" min="1" step="1" oninput="recalcularTotales()" required></td>
    <td><input type="number" class="item-price" value="0.00" min="0" step="0.01" oninput="recalcularTotales()" required></td>
    <td class="item-subtotal text-right">$0.00</td>
  `;
  tbody.appendChild(tr);
}

function recalcularTotales() {
  const rows = document.querySelectorAll("#items-tbody .item-row");
  let total = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseFloat(row.querySelector(".item-price").value) || 0;
    const subtotal = qty * price;
    row.querySelector(".item-subtotal").textContent = `$${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    total += subtotal;
  });

  const lblTotal = document.getElementById("lbl-total-amount");
  lblTotal.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const alertBox = document.getElementById("alert-monto-director");
  if (total > 1000) {
    alertBox.style.display = "flex";
  } else {
    alertBox.style.display = "none";
  }
}

function handleCrearSolicitud(e) {
  e.preventDefault();
  const desc = document.getElementById("solicitud-descripcion").value;
  const prov = document.getElementById("solicitud-proveedor").value;

  const rows = document.querySelectorAll("#items-tbody .item-row");
  let total = 0;
  rows.forEach(row => {
    const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseFloat(row.querySelector(".item-price").value) || 0;
    total += (qty * price);
  });

  const nuevoId = `SC-00${idSecuencia++}`;
  const hoy = new Date();
  const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;

  const nueva = {
    id: nuevoId,
    descripcion: desc,
    solicitante: "Carlos Rodrigo",
    proveedor: prov,
    monto: total,
    fecha: fechaStr,
    estado: total > 1000 ? "En Revisión" : "Pendiente"
  };

  solicitudes.unshift(nueva);
  closeModal("modal-nueva-solicitud");
  renderKanban();
  renderAprobaciones();
  alert(`Solicitud ${nuevoId} creada exitosamente con estado "${nueva.estado}".`);
}

function guardarBorrador() {
  alert("Borrador guardado localmente.");
  closeModal("modal-nueva-solicitud");
}

// MODAL DICTAMEN (FOTO 4 FIGMA)
function abrirDictamen(id) {
  solicitudSeleccionada = solicitudes.find(s => s.id === id);
  if (!solicitudSeleccionada) return;

  const info = document.getElementById("dictamen-target-info");
  info.innerHTML = `
    <div><strong>Solicitud:</strong> ${solicitudSeleccionada.id} - ${solicitudSeleccionada.descripcion}</div>
    <div style="margin-top: 4px;"><strong>Solicitante:</strong> ${solicitudSeleccionada.solicitante} &bull; <strong>Monto:</strong> $${Number(solicitudSeleccionada.monto).toFixed(2)} USD</div>
    <div style="margin-top: 4px;"><strong>Estado actual:</strong> <span class="badge badge-revision">${solicitudSeleccionada.estado}</span></div>
  `;
  document.getElementById("dictamen-comentario").value = "";
  document.getElementById("modal-dictamen").style.display = "flex";
  renderLucideIcons();
}

function resolverDictamen(nuevoEstado) {
  if (!solicitudSeleccionada) return;
  const comentario = document.getElementById("dictamen-comentario").value;

  solicitudSeleccionada.estado = nuevoEstado;
  closeModal("modal-dictamen");
  renderKanban();
  renderAprobaciones();

  alert(`La solicitud ${solicitudSeleccionada.id} fue marcada como "${nuevoEstado}".\nComentario: ${comentario || "Sin observaciones."}`);
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}
