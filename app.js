// =============================================
// APP PRINCIPAL
// =============================================

let currentUser = null;
let cajas = [];
let movimientos = [];

// ---- LISTAS DE CONCEPTOS ----

const GASTOS_FIJOS = [
  "Alquiler",
  "Emcali",
  "Gas",
  "Internet",
  "Celular",
  "Netflix",
  "Susc. Adobe",
  "Susc. Claude",
  "Seguridad Social",
  "Póliza",
  "RH Juli",
  "Transporte"
];

const GASTOS_VARIABLES = [
  "Mercado",
  "Ahorro",
  "Inversiones",
  "Salud",
  "Educación",
  "Belleza",
  "Deporte",
  "Ocio",
  "Entretenimiento",
  "Vacaciones",
  "Ropa",
  "Compras online",
  "Regalos",
  "Hogar",
  "Reparaciones hogar",
  "Tecnología",
  "Pasaje Mio",
  "Uber-Didi-Taxi",
  "Mascotas",
  "Cursos y certificaciones",
  "Congresos",
  "Donaciones",
  "Otros"
];

const ICONOS = {
  // Ingresos
  "Ingreso": "💰",

  // Gastos fijos
  "Alquiler": "🏠",
  "Mercado": "🛒",
  "Emcali": "💡",
  "Gas": "🔥",
  "Internet": "📡",
  "Celular": "📱",
  "Netflix": "🎬",
  "Susc. Adobe": "🎨",
  "Susc. Claude": "🤖",
  "Seguridad Social": "🏥",
  "Póliza": "🛡️",
  "RH Juli": "🥳",
  "Transporte": "🚌",

  // Gastos variables
  "Mercado": "🛒",
  "Ahorro": "🏦",
  "Inversiones": "📈",
  "Salud": "🩺",
  "Educación": "📚",
  "Belleza": "💅",
  "Deporte": "⚽",
  "Ocio": "🎮",
  "Entretenimiento": "🎉",
  "Vacaciones": "✈️",
  "Ropa": "👕",
  "Compras online": "📦",
  "Regalos": "🎁",
  "Hogar": "🏡",
  "Reparaciones hogar": "🔧",
  "Tecnología": "💻",
  "Pasaje Mio": "🚍",
  "Uber-Didi-Taxi": "🚕",
  "Mascotas": "🐶",
  "Cursos y certificaciones": "🎓",
  "Congresos": "🎤",
  "Donaciones": "🤝",
  "Otros": "📌"
};

// ---- INIT ----

window.onload = () => {
  google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: () => {},
    auto_select: false
  });

  const token = localStorage.getItem("gtoken");
  const user  = localStorage.getItem("guser");
  if (token && user) {
    Sheets.setToken(token);
    currentUser = JSON.parse(user);
    mostrarApp();
  }

  setupEventListeners();
};

// ---- AUTH ----

document.getElementById("btn-login").addEventListener("click", () => {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
    callback: async (response) => {
      if (response.error) { alert("Error de autenticación"); return; }
      Sheets.setToken(response.access_token);
      localStorage.setItem("gtoken", response.access_token);
      const perfil = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${response.access_token}` }
      }).then(r => r.json());
      currentUser = { name: perfil.name, email: perfil.email, picture: perfil.picture };
      localStorage.setItem("guser", JSON.stringify(currentUser));
      mostrarApp();
    }
  });
  client.requestAccessToken();
});

document.getElementById("btn-logout").addEventListener("click", () => {
  // Al cerrar sesión limpiamos solo auth, NO el caché de datos
  localStorage.removeItem("gtoken");
  localStorage.removeItem("guser");
  currentUser = null;
  cajas = [];
  movimientos = [];
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
});

// ---- MOSTRAR APP (sin bloquear en red) ----

async function mostrarApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("user-name").textContent = currentUser.name;
  document.getElementById("user-avatar").src = currentUser.picture;
  document.getElementById("mov-fecha").value = new Date().toISOString().split("T")[0];
  const mesCorriente = new Date().toISOString().slice(0, 7);
  document.getElementById("filtro-mes").value  = mesCorriente;
  // topbar avatar
  const ta = document.getElementById("topbar-avatar");
  if (ta && currentUser?.picture) ta.src = currentUser.picture;
  // saludo
  const sal = document.getElementById("cajas-saludo");
  if (sal && currentUser?.name) sal.textContent = `Hola, ${currentUser.name.split(" ")[0]} 👋`;

  // Cargar caché SIEMPRE antes de tocar la red
  const cacheC    = localStorage.getItem("cache_cajas");
  const cacheM    = localStorage.getItem("cache_movimientos");
  const cacheP    = localStorage.getItem("cache_presupuesto");
  const cacheCron = localStorage.getItem("cache_cronologia");

  if (cacheC) { try { cajas        = JSON.parse(cacheC); } catch {} }
  if (cacheM) { try { movimientos  = JSON.parse(cacheM); } catch {} }
  if (cacheP) { try { presupuesto  = JSON.parse(cacheP); } catch {} }

  // Renderizar INMEDIATAMENTE con lo que haya en caché
  renderCajas();
  renderMovimientos();
  poblarFiltrosCajas();
  if (presupuesto && presupuesto.length > 0) renderProyeccion();
  if (cacheCron) { try { renderCronologia(JSON.parse(cacheCron)); } catch {} }

  // Intentar sincronizar con la red SIN bloquear la UI
  // Si está offline o falla, la app ya funciona con el caché
  cargarTodo().catch(() => {
    // offline o token vencido — la UI ya está lista con la caché
  });
}

// ---- NAVEGACIÓN ----

function setupEventListeners() {
function navegarATab(tab) {
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-section").forEach(s => s.classList.add("hidden"));
    const sec = document.getElementById(`tab-${tab}`);
    if (sec) sec.classList.remove("hidden");
    if (tab === "prestamos") cargarPrestamos();
    if (tab === "resumen") renderResumen();
    if (tab === "metas") cargarMetas();
    if (tab === "compras") { cargarCompras(); renderSugerenciasCompras(); }
    if (typeof actualizarTopbarTitulo === "function") actualizarTopbarTitulo(tab);
    // update topbar avatar
    const ta = document.getElementById("topbar-avatar");
    if (ta && currentUser?.picture) ta.src = currentUser.picture;
  }
  window.navegarATab = navegarATab;

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navegarATab(btn.dataset.tab));
  });

  // Dropdown tab navigation
  document.querySelectorAll("[data-tab-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tabNav;
      document.getElementById("dropdown-menu").classList.add("hidden");
      navegarATab(tab);
    });
  });
document.getElementById("btn-refrescar")?.addEventListener("click", cargarTodo);
  document.getElementById("btn-refrescar-mov")?.addEventListener("click", cargarTodo);

  // Bottom nav "Más" button — opens dropdown menu
  document.getElementById("btn-bottom-menu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById("dropdown-menu");
    const btn = document.getElementById("btn-menu");
    const abierto = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", abierto);
    if (btn) btn.setAttribute("aria-expanded", String(!abierto));
    if (typeof actualizarDropdownUsuario === "function") actualizarDropdownUsuario();
  });

  // Cajas
  document.getElementById("btn-nueva-caja").addEventListener("click", () =>
    document.getElementById("modal-caja").classList.remove("hidden"));
  document.getElementById("btn-cancelar-caja").addEventListener("click", () => {
    document.getElementById("modal-caja").classList.add("hidden");
    limpiarFormCaja();
  });
  document.getElementById("btn-guardar-caja").addEventListener("click", guardarCaja);

  // Movimientos

document.getElementById("btn-nuevo-movimiento").addEventListener("click", () => {
    document.getElementById("modal-movimiento").classList.remove("hidden");
    poblarSelectCajas("mov-caja");
    actualizarConceptosPrestamo();
  });
  
  document.getElementById("btn-cancelar-mov").addEventListener("click", () => {
    document.getElementById("modal-movimiento").classList.add("hidden");
    limpiarFormMov();
  });
  document.getElementById("btn-guardar-mov").addEventListener("click", guardarMovimiento);

  // Live validation: cap monto to caja balance on input
  document.getElementById("mov-monto")?.addEventListener("input", () => {
    const cajaId  = document.getElementById("mov-caja").value;
    const catVal  = document.getElementById("mov-categoria").value;
    if (!cajaId || catVal === "Ingreso" || catVal === "Transferencia") return;
    const monto   = parseFloat(document.getElementById("mov-monto").value);
    const saldo   = Math.max(0, calcularSaldoCaja(cajaId));
    const warn    = document.getElementById("mov-fondos-warn");
    if (warn) {
      if (monto > saldo) {
        warn.textContent = `⚠️ Fondos insuficientes · Disponible: ${formatMonto(saldo)}`;
        warn.classList.remove("hidden");
      } else {
        warn.classList.add("hidden");
      }
    }
  });

  document.getElementById("mov-caja")?.addEventListener("change", () => {
    const cajaId = document.getElementById("mov-caja").value;
    const catVal = document.getElementById("mov-categoria").value;
    const montoEl = document.getElementById("mov-monto");
    const saldoEl = document.getElementById("mov-saldo-disponible");
    const warn    = document.getElementById("mov-fondos-warn");
    if (!cajaId || catVal === "Ingreso" || catVal === "Transferencia") {
      if (saldoEl) saldoEl.classList.add("hidden");
      return;
    }
    const saldo = Math.max(0, calcularSaldoCaja(cajaId));
    if (saldoEl) {
      saldoEl.textContent = `Disponible: ${formatMonto(saldo)}`;
      saldoEl.classList.remove("hidden");
    }
    if (warn) warn.classList.add("hidden");
    // Cap existing value
    if (montoEl && parseFloat(montoEl.value) > saldo) {
      montoEl.value = "";
      if (warn) { warn.textContent = `⚠️ Fondos insuficientes · Disponible: ${formatMonto(saldo)}`; warn.classList.remove("hidden"); }
    }
  });

  document.getElementById("cat-btn-group").addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("mov-categoria").value = btn.dataset.value;
    actualizarCampoConcepto();
  });

  // Mes filter
  document.getElementById("filtro-mes").addEventListener("change", renderMovimientos);

  // Toggle panel
  document.getElementById("btn-filtros-toggle")?.addEventListener("click", () => {
    document.getElementById("filtros-panel").classList.toggle("hidden");
  });

  // Tipo chips (solo uno activo a la vez, o ninguno = todos)
  document.getElementById("filtro-tipo-chips")?.addEventListener("click", e => {
    const chip = e.target.closest(".filtro-chip");
    if (!chip) return;
    const val = chip.dataset.val;
    if (val === "") {
      filtrosActivos.tipos.clear();
      document.querySelectorAll("#filtro-tipo-chips .filtro-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    } else {
      document.querySelector("#filtro-tipo-chips .filtro-chip[data-val='']").classList.remove("active");
      chip.classList.toggle("active");
      if (chip.classList.contains("active")) filtrosActivos.tipos.add(val);
      else filtrosActivos.tipos.delete(val);
      if (filtrosActivos.tipos.size === 0)
        document.querySelector("#filtro-tipo-chips .filtro-chip[data-val='']").classList.add("active");
    }
    actualizarFiltroConcepto();
    renderMovimientos();
  });

  // Caja chips
  document.getElementById("filtro-caja-chips")?.addEventListener("click", e => {
    const chip = e.target.closest(".filtro-chip");
    if (!chip) return;
    const val = chip.dataset.val;
    if (val === "") {
      filtrosActivos.cajas.clear();
      document.querySelectorAll("#filtro-caja-chips .filtro-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    } else {
      document.querySelector("#filtro-caja-chips .filtro-chip[data-val='']")?.classList.remove("active");
      chip.classList.toggle("active");
      if (chip.classList.contains("active")) filtrosActivos.cajas.add(val);
      else filtrosActivos.cajas.delete(val);
      if (filtrosActivos.cajas.size === 0)
        document.querySelector("#filtro-caja-chips .filtro-chip[data-val='']")?.classList.add("active");
    }
    renderMovimientos();
  });

  // Concepto chips
  document.getElementById("filtro-concepto-chips")?.addEventListener("click", e => {
    const chip = e.target.closest(".filtro-chip");
    if (!chip) return;
    const val = chip.dataset.val;
    if (val === "") {
      filtrosActivos.conceptos.clear();
      document.querySelectorAll("#filtro-concepto-chips .filtro-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    } else {
      document.querySelector("#filtro-concepto-chips .filtro-chip[data-val='']")?.classList.remove("active");
      chip.classList.toggle("active");
      if (chip.classList.contains("active")) filtrosActivos.conceptos.add(val);
      else filtrosActivos.conceptos.delete(val);
      if (filtrosActivos.conceptos.size === 0)
        document.querySelector("#filtro-concepto-chips .filtro-chip[data-val='']")?.classList.add("active");
    }
    renderMovimientos();
  });

  
  // Cerrar modal al clic fuera
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });
  setupTopbarMenu();
}

// ---- LÓGICA CONCEPTO DINÁMICO ----
function poblarSelectGastosFijos() {
  const sel = document.getElementById("mov-concepto-fijo");
  const mesActual = new Date().toISOString().slice(0, 7);
  const editId = document.getElementById("modal-movimiento").dataset.editId;

  // Conceptos ya pagados este mes (excluir el movimiento que se está editando)
  const pagadosEsteMes = new Set(
    movimientos
      .filter(m => {
        if (m.categoria !== "Gasto fijo") return false;
        if (!m.fecha.startsWith(mesActual)) return false;
        if (editId && m.id === editId) return false;
        return true;
      })
      .map(m => m.concepto)
  );

  // También incluir préstamos activos como opciones
  const conceptosPrestamos = prestamos
    ? prestamos.filter(p => !p.pagado).map(p => conceptoPrestamo(p.nombre))
    : [];

  const todosLosFijos = [...GASTOS_FIJOS, ...conceptosPrestamos];

  sel.innerHTML = `<option value="">Selecciona un gasto fijo...</option>` +
    todosLosFijos.map(c => {
      const yaPagado = pagadosEsteMes.has(c);
      return `<option value="${c}" ${yaPagado ? "disabled style='color:var(--text-light)'" : ""}>
        ${yaPagado ? "✓ " : ""}${c}${yaPagado ? " (ya registrado)" : ""}
      </option>`;
    }).join("");
}

function actualizarCampoConcepto() {
  const cat = document.getElementById("mov-categoria").value;
  const fijo         = document.getElementById("mov-concepto-fijo");
  const variable     = document.getElementById("wrap-concepto-variable");
  const ingreso      = document.getElementById("mov-concepto-ingreso");
  const placeholder  = document.getElementById("concepto-placeholder");
  const rowNormal    = document.getElementById("row-caja-normal");
  const rowTransfer  = document.getElementById("row-transferencia");
  const grupoConcept = document.getElementById("grupo-concepto");

  fijo.classList.add("hidden");
  variable.classList.add("hidden");
  ingreso.classList.add("hidden");
  placeholder.classList.add("hidden");

if (cat === "Transferencia") {
    rowNormal.classList.add("hidden");
    rowTransfer.classList.remove("hidden");
    grupoConcept.classList.add("hidden");
  poblarSelectCajas("mov-caja-origen");
poblarSelectCajas("mov-caja-destino");
document.getElementById("row-tipo-cambio").style.display = "none";
document.getElementById("mov-tipo-cambio").value = "";
document.getElementById("tc-preview").textContent = "";
setupTipoCambioListeners();
  }
  else {
    rowNormal.classList.remove("hidden");
    rowTransfer.classList.add("hidden");
    grupoConcept.classList.remove("hidden");
  if (cat === "Gasto fijo") {
      fijo.classList.remove("hidden");
      poblarSelectGastosFijos();
      fijo.focus();
    }
    
else if (cat === "Gasto variable") {
  variable.classList.remove("hidden");
  // Poblar datalist con GASTOS_VARIABLES
  const dl = document.getElementById("lista-variables");
  dl.innerHTML = GASTOS_VARIABLES.map(v => `<option value="${v}"/>`).join("");
  document.getElementById("mov-concepto-variable").focus();
}
  
  else if (cat === "Ingreso") {
      ingreso.classList.remove("hidden");
      ingreso.focus();
    } else {
      placeholder.classList.remove("hidden");
    }
  }
}

function getConceptoActivo() {
  const cat = document.getElementById("mov-categoria").value;
  if (cat === "Gasto fijo")     return document.getElementById("mov-concepto-fijo").value;
  if (cat === "Gasto variable") return document.getElementById("mov-concepto-variable").value.trim();
  if (cat === "Ingreso")        return document.getElementById("mov-concepto-ingreso").value.trim();
  return "";
}

function setConceptoActivo(valor) {
  const cat = document.getElementById("mov-categoria").value;
  if (cat === "Gasto fijo")     document.getElementById("mov-concepto-fijo").value = valor;
  if (cat === "Gasto variable") document.getElementById("mov-concepto-variable").value = valor;
  if (cat === "Ingreso")        document.getElementById("mov-concepto-ingreso").value = valor;
}

// ---- FILTRO CONCEPTO DINÁMICO ----

function actualizarFiltroConcepto() {
  const tipo = document.getElementById("filtro-tipo").value;
  const sel  = document.getElementById("filtro-concepto");

  let lista = [];
  if (tipo === "Gasto fijo") {
    lista = GASTOS_FIJOS;
  } else if (tipo === "Gasto variable") {
    lista = GASTOS_VARIABLES;
  } else if (tipo === "Ingreso" || tipo === "Transferencia") {
    lista = [...new Set(
      movimientos.filter(m => m.categoria === tipo).map(m => m.concepto)
    )].sort();
  } else if (tipo === "") {
    lista = [...new Set(movimientos.map(m => m.concepto))].sort();
  }

  sel.innerHTML = `<option value="">Todos los conceptos</option>` +
    lista.map(c => `<option value="${c}">${c}</option>`).join("");
  sel.disabled = lista.length === 0;
}

// ---- CARGA DE DATOS ----

async function cargarTodo() {
  try {
    cajas       = await Sheets.getCajas();
    movimientos = await Sheets.getMovimientos();
    renderCajas();
    renderMovimientos();
    poblarFiltrosCajas();
    await cargarPresupuesto();
    await verificarYGuardarCronologia();
    await cargarYRenderCronologia();
    await cargarPrestamos();
    renderResumen();
  } catch (err) {    
    if (err.message === "TOKEN_EXPIRADO") return;

    if (err.message === "TIMEOUT") {
      SyncManager.mostrarToast("⏱️ Conexión lenta — mostrando datos en caché", "warn");
    } else {
      SyncManager.mostrarToast("📴 Sin conexión — mostrando datos guardados", "warn");
    }

    // Cargar desde caché localStorage (persiste entre sesiones)
    try {
      const cacheC    = localStorage.getItem("cache_cajas");
      const cacheM    = localStorage.getItem("cache_movimientos");
      const cacheP    = localStorage.getItem("cache_presupuesto");
      const cacheCron = localStorage.getItem("cache_cronologia");

      if (cacheC) cajas       = JSON.parse(cacheC);
      if (cacheM) movimientos = JSON.parse(cacheM);
      if (cacheP) presupuesto = JSON.parse(cacheP);

      renderCajas();
      renderMovimientos();
      poblarFiltrosCajas();
      renderProyeccion();
      if (cacheCron) renderCronologia(JSON.parse(cacheCron));
    } catch (cacheErr) {
      console.warn("Error leyendo caché:", cacheErr);
    }
  }
}

// ---- RENDER CAJAS ----

// Clasifica la caja por nombre y retorna la clase de color del badge
function cajaBadgeClass(nombre) {
  const n = nombre.toLowerCase();
  if (/luni|bonita|yei/.test(n))                    return "badge-persona-luni";
  if (/ahorro|meta|objetivo/.test(n))                return "badge-ahorro";
  if (/choco|roy|royer/.test(n))                   return "badge-persona-roy";
  if (/emergencia|imprevisto/.test(n))               return "badge-emergencia";
  return "badge-otro";
}

function renderCajas() {
  const grid = document.getElementById("cajas-grid");
  if (cajas.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🏦</div>
      <div class="empty-state-text">No tienes cajas aún. Crea una para empezar.</div></div>`;
    return;
  }
  grid.innerHTML = cajas.map(c => {
    const saldoReal = calcularSaldoCaja(c.nombre);
    const saldo     = Math.max(0, saldoReal);   // nunca mostrar negativo
    const badgeClass = cajaBadgeClass(c.nombre);
    return `<div class="caja-card">
      <div class="caja-card-top">
        <span class="caja-moneda-badge ${badgeClass}">${c.moneda}</span>
      </div>
      <div class="caja-nombre">${c.nombre}</div>
      <div class="caja-saldo positivo">${formatMonto(saldo, c.moneda)}</div>
    </div>`;
  }).join("");
}

function calcularSaldoCaja(nombreCaja) {
  return movimientos
    .filter(m => m.caja === nombreCaja)
    .reduce((sum, m) => {
      const esEntrada = m.categoria === "Ingreso" ||
        (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"));
      return sum + (esEntrada ? m.monto : -Math.abs(m.monto));
    }, 0);
}

// ---- RENDER MOVIMIENTOS ----

// Estado filtros multi-select
const filtrosActivos = { cajas: new Set(), tipos: new Set(), conceptos: new Set() };

function getFiltroMes() {
  return document.getElementById("filtro-mes")?.value || new Date().toISOString().slice(0,7);
}

function renderMovimientos() {
  const filtroM = getFiltroMes();
  const fCajas  = filtrosActivos.cajas;
  const fTipos  = filtrosActivos.tipos;
  const fConc   = filtrosActivos.conceptos;

  let filtrados = movimientos.filter(m => {
    if (fCajas.size && !fCajas.has(m.caja)) return false;
    if (fTipos.size && !fTipos.has(m.categoria)) return false;
    if (fConc.size && !fConc.has(m.concepto)) return false;
    if (filtroM && !m.fecha.startsWith(filtroM)) return false;
    return true;
  });

  filtrados.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Actualizar título dinámico
  const mesLabel = filtroM
    ? new Date(filtroM + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" })
    : "todos los períodos";
  const titleEl = document.getElementById("mov-section-title");
  const subEl   = document.getElementById("mov-section-sub");
  if (titleEl) titleEl.textContent = `Movimientos ${mesLabel}`;
  if (subEl) {
    const nFiltros = fCajas.size + fTipos.size + fConc.size;
    subEl.textContent = nFiltros > 0
      ? `${filtrados.length} resultados · ${nFiltros} filtro${nFiltros > 1 ? "s" : ""} activo${nFiltros > 1 ? "s" : ""}`
      : `${filtrados.length} movimiento${filtrados.length !== 1 ? "s" : ""}`;
  }
  // Badge de filtros activos
  const cnt = fCajas.size + fTipos.size + fConc.size;
  const cntEl = document.getElementById("filtros-active-count");
  if (cntEl) { cntEl.textContent = cnt; cntEl.classList.toggle("hidden", cnt === 0); }

  let ingresos = 0, gastos = 0;
  filtrados.forEach(m => {
    const cja = cajas.find(c => c.nombre === m.caja);
    if (cja && cja.moneda !== "COP") return;
    if (m.categoria === "Ingreso") ingresos += m.monto;
    else if (m.categoria !== "Transferencia") gastos += Math.abs(m.monto);
  });
  document.getElementById("total-ingresos").textContent = formatMonto(ingresos);
  document.getElementById("total-gastos").textContent   = formatMonto(gastos);
  const balance = ingresos - gastos;
  const balEl = document.getElementById("total-balance");
  balEl.textContent = formatMonto(balance);
  balEl.style.color = balance >= 0 ? "var(--green)" : "var(--red)";

  const list = document.getElementById("movimientos-list");
  if (filtrados.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-text">No hay movimientos para este período.</div></div>`;
    return;
  }

  list.innerHTML = filtrados.map(m => {
    const esIngreso  = m.categoria === "Ingreso";
    const esTransfer = m.categoria === "Transferencia";
    const esEntrada  = esIngreso || (esTransfer && m.concepto.startsWith("Transferencia ←"));
    const cls   = esEntrada ? "ingreso" : "gasto";
    const signo = esEntrada ? "+" : "-";
    const icono = ICONOS[m.concepto] || (esIngreso ? "💰" : "📌");
    const fechaFmt = new Date(m.fecha + "T12:00:00").toLocaleDateString("es-CO",
      { day: "2-digit", month: "short", year: "numeric" });
    const catCls = m.categoria.toLowerCase().replace(/ /g,"");
    const descHTML = m.descripcion
      ? `<span class="mov-desc-inline">· ${m.descripcion}</span>` : "";

    return `<div class="mov-card">
      <div class="mov-card-row1">
        <span class="mov-card-caja">${m.caja}</span>
        <span class="mov-card-fecha">${fechaFmt}</span>
      </div>
      <div class="mov-card-row2">
        <div class="mov-card-left">
          <span class="mov-card-icono mov-cat-${catCls}">${icono}</span>
          <div class="mov-card-texto">
            <span class="mov-card-concepto">${m.concepto || "Sin concepto"}</span>
            ${descHTML}
          </div>
        </div>
        <div class="mov-card-right">
          <span class="mov-card-monto ${cls}">${signo}${formatMonto(Math.abs(m.monto))}</span>
          <div class="mov-card-actions">
            <button class="btn-accion btn-editar" title="Editar" onclick="abrirEditarMovimiento('${m.id}')">✏️</button>
            <button class="btn-accion btn-borrar" title="Borrar" onclick="borrarMovimiento('${m.id}')">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

// ---- GUARDAR CAJA ----

async function guardarCaja() {
  const nombre = document.getElementById("caja-nombre").value.trim();
  const moneda = document.getElementById("caja-moneda").value;
  if (!nombre) { alert("Escribe el nombre de la caja"); return; }
  if (cajas.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
    alert(`Ya existe una caja llamada "${nombre}". Usa un nombre diferente, por ejemplo "${nombre} USD" o "${nombre} EUR".`);
    return;  }
  const btn = document.getElementById("btn-guardar-caja");
  btn.textContent = "Guardando..."; btn.disabled = true;
  try {
    await Sheets.agregarCaja(currentUser.email, nombre, moneda);
    document.getElementById("modal-caja").classList.add("hidden");
    limpiarFormCaja();

    if (!navigator.onLine) {
      const nuevaCaja = { id: "C_local_" + Date.now(), usuario: currentUser.email, nombre, moneda };
      cajas.push(nuevaCaja);
      localStorage.setItem("cache_cajas", JSON.stringify(cajas));
      renderCajas();
      poblarFiltrosCajas();
    } else {
      await cargarTodo();
    }
  } catch (err) {
    alert("Error guardando la caja: " + err.message);
  } finally {
    btn.textContent = "Guardar"; btn.disabled = false;
  }
}

// ---- GUARDAR / ACTUALIZAR MOVIMIENTO ----

function setupTipoCambioListeners() {
  const rowTC   = document.getElementById("row-tipo-cambio");
  const tcOrig  = document.getElementById("tc-moneda-origen");
  const tcDest  = document.getElementById("tc-moneda-destino");
  const tcInput = document.getElementById("mov-tipo-cambio");
  const preview = document.getElementById("tc-preview");
  const monto   = document.getElementById("mov-monto-transferencia");

  // Eliminar listeners duplicados clonando los selects
  const origenViejo  = document.getElementById("mov-caja-origen");
  const destinoViejo = document.getElementById("mov-caja-destino");
  const newOrigen    = origenViejo.cloneNode(true);
  const newDestino   = destinoViejo.cloneNode(true);
  origenViejo.parentNode.replaceChild(newOrigen, origenViejo);
  destinoViejo.parentNode.replaceChild(newDestino, destinoViejo);

  // Repoblar después de clonar
  poblarSelectCajas("mov-caja-origen");
  poblarSelectCajas("mov-caja-destino");

  function verificarMonedas() {
    const origenVal   = document.getElementById("mov-caja-origen").value;
    const destinoVal  = document.getElementById("mov-caja-destino").value;
    const cajaOrigen  = cajas.find(c => c.nombre === origenVal);
    const cajaDestino = cajas.find(c => c.nombre === destinoVal);
    if (!cajaOrigen || !cajaDestino) { rowTC.style.display = "none"; return; }
    if (cajaOrigen.moneda !== cajaDestino.moneda) {
      rowTC.style.display = "";
      tcOrig.textContent  = cajaOrigen.moneda;
      tcDest.textContent  = cajaDestino.moneda;
    } else {
      rowTC.style.display = "none";
    }
    actualizarPreview();
  }

  function actualizarPreview() {
    const origenVal   = document.getElementById("mov-caja-origen").value;
    const destinoVal  = document.getElementById("mov-caja-destino").value;
    const cajaOrigen  = cajas.find(c => c.nombre === origenVal);
    const cajaDestino = cajas.find(c => c.nombre === destinoVal);
    const m  = parseFloat(monto.value);
    const tc = parseFloat(tcInput.value);
    if (!cajaOrigen || !cajaDestino || !m || !tc) { preview.textContent = ""; return; }
    if (cajaOrigen.moneda === cajaDestino.moneda)  { preview.textContent = ""; return; }
    const resultado = m * tc;
    preview.textContent = `→ Se acreditarán ${new Intl.NumberFormat("es-CO", {
      style: "currency", currency: cajaDestino.moneda,
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(resultado)} en ${destinoVal}`;
  }

  document.getElementById("mov-caja-origen").addEventListener("change", verificarMonedas);
  document.getElementById("mov-caja-destino").addEventListener("change", verificarMonedas);
  tcInput.addEventListener("input", actualizarPreview);
  monto.addEventListener("input", actualizarPreview);
}

async function guardarMovimiento() {
  const editId = document.getElementById("modal-movimiento").dataset.editId;

  if (editId) {
    const fecha       = document.getElementById("mov-fecha").value;
    const categoria   = document.getElementById("mov-categoria").value;
    const descripcion = document.getElementById("mov-descripcion").value.trim();
    const concepto    = getConceptoActivo();
    const caja        = document.getElementById("mov-caja").value;
    const monto       = parseFloat(document.getElementById("mov-monto").value);

    if (!fecha || !categoria || !concepto || !caja || !monto) {
      alert("Completa todos los campos obligatorios");
      return;
    }

   
const btn = document.getElementById("btn-guardar-mov");
if (!btn) return;
btn.textContent = "Guardando..."; btn.disabled = true;

    try {
      await Sheets.editarMovimiento(editId, fecha, concepto, categoria, caja, monto, descripcion);
      delete document.getElementById("modal-movimiento").dataset.editId;
      document.getElementById("modal-movimiento").classList.add("hidden");
      limpiarFormMov();

      if (!navigator.onLine) {
        const idx = movimientos.findIndex(m => m.id === editId);
        if (idx !== -1) {
          movimientos[idx] = { ...movimientos[idx], fecha, concepto, categoria, caja, monto, descripcion };
          localStorage.setItem("cache_movimientos", JSON.stringify(movimientos));
          renderMovimientos();
        }
      } else {
        await cargarTodo();
      }
    } catch (err) {
      alert("Error actualizando: " + err.message);

    }
    return;
  }

  const fecha       = document.getElementById("mov-fecha").value;
  const categoria   = document.getElementById("mov-categoria").value;
  const descripcion = document.getElementById("mov-descripcion").value.trim();

  if (!fecha || !categoria) { alert("Completa todos los campos obligatorios"); return; }


const btn = document.getElementById("btn-guardar-mov");
if (!btn) return;
btn.textContent = "Guardando..."; btn.disabled = true;

  try {

    if (categoria === "Transferencia") {
  const origen  = document.getElementById("mov-caja-origen").value;
  const destino = document.getElementById("mov-caja-destino").value;
  const monto   = parseFloat(document.getElementById("mov-monto-transferencia").value);
  const rowTC   = document.getElementById("row-tipo-cambio");
  const tipoCambio = parseFloat(document.getElementById("mov-tipo-cambio").value);
  const cajaOrigen  = cajas.find(c => c.nombre === origen);
  const cajaDestino = cajas.find(c => c.nombre === destino);

  if (!origen || !destino || !monto) {
    alert("Completa origen, destino y monto de la transferencia");
    return;
  }
  if (origen === destino) {
    alert("La caja origen y destino no pueden ser la misma");
    return;
  }

  const monedasDiferentes = cajaOrigen && cajaDestino && cajaOrigen.moneda !== cajaDestino.moneda;
  if (monedasDiferentes && (!tipoCambio || tipoCambio <= 0)) {
    alert("Las cuentas tienen monedas diferentes. Ingresa el tipo de cambio.");
    return;
  }

  const montoDestino = monedasDiferentes ? monto * tipoCambio : monto;
  const descOrigen   = monedasDiferentes
    ? `TC: 1 ${cajaOrigen.moneda} = ${tipoCambio} ${cajaDestino.moneda}${descripcion ? " — " + descripcion : ""}`
    : descripcion;

  await Sheets.agregarMovimiento(
    currentUser.email, fecha,
    `Transferencia → ${destino}`,
    "Transferencia", origen, monto, descOrigen
  );
  await Sheets.agregarMovimientoIngreso(
    currentUser.email, fecha,
    `Transferencia ← ${origen}`,
    "Transferencia", destino, montoDestino, descOrigen
  );
}
    
    else {

let concepto = getConceptoActivo();
const caja   = document.getElementById("mov-caja").value;
const monto  = parseFloat(document.getElementById("mov-monto").value);
if (!concepto || !caja || !monto) {
  alert("Completa todos los campos obligatorios");
  return;
}

// Validar fondos suficientes para gastos y transferencias
if (categoria !== "Ingreso") {
  const saldoCaja = Math.max(0, calcularSaldoCaja(caja));
  if (monto > saldoCaja) {
    alert(`⚠️ Fondos insuficientes en "${caja}"\nSaldo disponible: ${formatMonto(saldoCaja)}\nMonto solicitado: ${formatMonto(monto)}`);
    const btn2 = document.getElementById("btn-guardar-mov");
    if (btn2) { btn2.textContent = "Guardar"; btn2.disabled = false; }
    return;
  }
}

// Si es gasto variable y el concepto no está en la lista, guardar "Otros" y mover a descripción
if (categoria === "Gasto variable" && !GASTOS_VARIABLES.includes(concepto)) {
  const descripcionFinal = descripcion ? concepto + " — " + descripcion : concepto;
  await Sheets.agregarMovimiento(currentUser.email, fecha, "Otros", categoria, caja, monto, descripcionFinal);
} else {
  await Sheets.agregarMovimiento(currentUser.email, fecha, concepto, categoria, caja, monto, descripcion);
}


      
      if (!navigator.onLine) {
        const nuevoMov = {
          id: "M_local_" + Date.now(),
          fecha, autor: currentUser.email, concepto, categoria, caja, monto, descripcion, recibo: ""
        };
        movimientos.push(nuevoMov);
        localStorage.setItem("cache_movimientos", JSON.stringify(movimientos));
      }
    }

    document.getElementById("modal-movimiento").classList.add("hidden");
    limpiarFormMov();

    if (!navigator.onLine) {
      renderMovimientos();
      renderCajas();
    } else {
      await cargarTodo();
    }
  } catch (err) {
    if (err.message && !err.message.includes("Cannot set properties of null")) {
      alert("Error guardando el movimiento: " + err.message);
    }

  } 
}

// ---- EDITAR MOVIMIENTO ----

function abrirEditarMovimiento(id) {
  const m = movimientos.find(x => x.id === id);
  if (!m) return;

  document.getElementById("modal-movimiento").classList.remove("hidden");
  poblarSelectCajas("mov-caja");

  document.getElementById("mov-fecha").value       = m.fecha;
  document.getElementById("mov-categoria").value = m.categoria;
  document.querySelectorAll(".cat-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.value === m.categoria);
  });
  document.getElementById("mov-descripcion").value = m.descripcion;
  actualizarCampoConcepto();
  setConceptoActivo(m.concepto);

  if (m.categoria !== "Transferencia") {
    document.getElementById("mov-caja").value  = m.caja;
    document.getElementById("mov-monto").value = Math.abs(m.monto);
  }

  document.getElementById("modal-movimiento").dataset.editId = id;
  document.getElementById("btn-guardar-mov").textContent = "Actualizar";
}

// ---- BORRAR MOVIMIENTO ----

async function borrarMovimiento(id) {
  if (!confirm("¿Seguro que quieres borrar este movimiento?")) return;
  try {
    await Sheets.borrarMovimiento(id);

    if (!navigator.onLine) {
      movimientos = movimientos.filter(m => m.id !== id);
      localStorage.setItem("cache_movimientos", JSON.stringify(movimientos));
      renderMovimientos();
      renderCajas();
    } else {
      await cargarTodo();
    }
  } catch (err) {
    alert("Error borrando: " + err.message);
  }
}

// ---- HELPERS ----

function poblarSelectCajas(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  if (cajas.length === 0) {
    try {
      const cacheC = localStorage.getItem("cache_cajas");
      if (cacheC) cajas = JSON.parse(cacheC);
    } catch {}
  }

  sel.innerHTML = `<option value="">Selecciona una caja</option>` +
    cajas.map(c => `<option value="${c.nombre}">${c.nombre} (${c.moneda})</option>`).join("");
}

function poblarFiltrosCajas() {
  // Poblar chips de caja
  const wrap = document.getElementById("filtro-caja-chips");
  if (!wrap) return;
  const conceptosUnicos = [...new Set(movimientos.map(m => m.concepto).filter(Boolean))].sort();
  const concWrap = document.getElementById("filtro-concepto-chips");
  if (concWrap) {
    concWrap.innerHTML = `<button class="filtro-chip active" data-filtro="concepto" data-val="">Todos</button>` +
      conceptosUnicos.map(c => `<button class="filtro-chip" data-filtro="concepto" data-val="${c}">${ICONOS[c] || ""} ${c}</button>`).join("");
  }
  wrap.innerHTML = `<button class="filtro-chip active" data-filtro="caja" data-val="">Todas</button>` +
    cajas.map(c => `<button class="filtro-chip" data-filtro="caja" data-val="${c.nombre}">${c.nombre}</button>`).join("");
}

function formatMonto(n, moneda = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: moneda,
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(n);
}

function limpiarFormCaja() {
  document.getElementById("caja-nombre").value = "";
  document.getElementById("caja-moneda").value = "COP";
}

function limpiarFormMov() {
  document.getElementById("mov-fecha").value = new Date().toISOString().split("T")[0];
  document.getElementById("mov-categoria").value = "";
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("mov-concepto-fijo").value = "";
  document.getElementById("mov-concepto-variable").value = "";
  document.getElementById("mov-concepto-ingreso").value = "";
  document.getElementById("mov-monto").value = "";
  document.getElementById("mov-caja").value = "";
  document.getElementById("mov-caja-origen").value = "";
  document.getElementById("mov-caja-destino").value = "";
  document.getElementById("mov-monto-transferencia").value = "";
  document.getElementById("mov-descripcion").value = "";
const reciboStatus = document.getElementById("recibo-status");
if (reciboStatus) reciboStatus.textContent = "";

const reciboFile = document.getElementById("recibo-file");
if (reciboFile) reciboFile.value = "";
  delete document.getElementById("modal-movimiento").dataset.editId;
  document.getElementById("btn-guardar-mov").textContent = "Guardar";
  actualizarCampoConcepto();
}


// =============================================
// MÓDULO PROYECCIÓN
// =============================================

let presupuesto = [];

// ---- CARGA PRESUPUESTO ----

async function cargarPresupuesto() {
  try {
    presupuesto = await Sheets.getPresupuesto();
    renderProyeccion();
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    console.error("Error cargando presupuesto:", err);
  }
}

// ---- INGRESOS POR MES (localStorage) ----
// Estructura: { "2025-06": { SURA: 3000000, MEDFAN: 1500000, ... }, ... }
function getIngresosMes(mes) {
  try {
    const raw = localStorage.getItem("ingresos_por_mes");
    const data = raw ? JSON.parse(raw) : {};
    return data[mes] || {};
  } catch { return {}; }
}

function setIngresosMes(mes, fuentes) {
  try {
    const raw = localStorage.getItem("ingresos_por_mes");
    const data = raw ? JSON.parse(raw) : {};
    data[mes] = fuentes;
    localStorage.setItem("ingresos_por_mes", JSON.stringify(data));
  } catch {}
}

function totalIngresosMes(mes) {
  const fuentes = getIngresosMes(mes);
  return Object.values(fuentes).reduce((s, v) => s + (parseFloat(v) || 0), 0);
}

// ---- OBTENER LOS 4 MESES A MOSTRAR ----
function obtener4Meses() {
  const hoy = new Date();
  const meses = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    meses.push(d.toISOString().slice(0, 7));
  }
  return meses;
}

// mes activo en proyección
let proyMesActivo = new Date().toISOString().slice(0, 7);

// ---- RENDER TABS DE MESES ----
function renderMesesTabs() {
  const container = document.getElementById("proy-meses-tabs");
  if (!container) return;
  const meses = obtener4Meses();
  container.innerHTML = meses.map(m => {
    const label = new Date(m + "-15").toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    const active = m === proyMesActivo ? "active" : "";
    return `<button class="proy-mes-tab ${active}" data-mes="${m}">${label.replace(". ", " '")}</button>`;
  }).join("");
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".proy-mes-tab");
    if (!btn) return;
    proyMesActivo = btn.dataset.mes;
    document.getElementById("proyeccion-mes").value = proyMesActivo;
    container.querySelectorAll(".proy-mes-tab").forEach(b => b.classList.toggle("active", b.dataset.mes === proyMesActivo));
    renderProyeccion();
  });
}

// ---- RENDER PROYECCIÓN ----
function renderProyeccion() {
  renderMesesTabs();
  const mes = proyMesActivo;
  document.getElementById("proyeccion-mes").value = mes;

  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mes));

  const ingresosReales = movsDelMes
    .filter(m => m.categoria === "Ingreso")
    .reduce((s, m) => s + m.monto, 0);

  // Ingresos estimados: usa los configurados para este mes, o el presupuesto global
  const ingMesConfig = totalIngresosMes(mes);
  const ingresosEstimados = ingMesConfig > 0
    ? ingMesConfig
    : presupuesto.filter(p => p.ingresoEstimado > 0).reduce((s, p) => s + p.ingresoEstimado, 0);

  const gastosReales = movsDelMes
    .filter(m => m.categoria !== "Ingreso" && m.categoria !== "Transferencia")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const gastosEstimados = presupuesto
    .filter(p => p.montoEstimado > 0)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const excedente     = ingresosEstimados - gastosEstimados;
  const excedenteReal = ingresosReales - gastosReales;

  document.getElementById("proy-ingreso-estimado").textContent  = formatMonto(ingresosEstimados);
  document.getElementById("proy-ingreso-real").textContent      = formatMonto(ingresosReales);
  document.getElementById("proy-gasto-estimado").textContent    = formatMonto(gastosEstimados);
  document.getElementById("proy-gasto-real").textContent        = formatMonto(gastosReales);
  document.getElementById("proy-excedente-est").textContent     = formatMonto(excedente);
  document.getElementById("proy-excedente-real").textContent    = formatMonto(excedenteReal);

  ["proy-excedente-est", "proy-excedente-real"].forEach((id, i) => {
    const val = i === 0 ? excedente : excedenteReal;
    document.getElementById(id).style.color = val >= 0 ? "var(--green)" : "var(--red)";
  });

  renderIngresosMesPanel(mes);
  renderTablaComparacion(movsDelMes);
  // donuts removed
  render4MesesResumen();
}

// ---- PANEL DE INGRESOS POR MES ----
function renderIngresosMesPanel(mes) {
  let panel = document.getElementById("proy-ingresos-mes-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "proy-ingresos-mes-panel";
    panel.className = "proy-ingresos-panel";
    const ref = document.querySelector(".proy-resumen-grid");
    if (ref) ref.parentNode.insertBefore(panel, ref.nextSibling);
  }

  const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const fuentes = getIngresosMes(mes);
  const FUENTES = ["SURA", "MEDFAN", "TATEQUIETO", "OTRO"];

  panel.innerHTML = `
    <div class="proy-ingresos-header">
      <span class="proy-dashboard-title">💰 Ingresos de ${mesLabel}</span>
      <button class="btn-sm btn-secondary" id="btn-toggle-ingresos-mes">
        ${Object.keys(fuentes).some(k => fuentes[k] > 0) ? "✏️ Editar" : "+ Configurar"}
      </button>
    </div>
    <div id="proy-ingresos-mes-form" class="proy-ingresos-form hidden">
      ${FUENTES.map(f => `
        <div class="pres-fila">
          <span class="pres-concepto">💰 ${f}</span>
          <input class="input pres-input" type="number" placeholder="0"
            data-fuente="${f}" value="${fuentes[f] || ""}"/>
        </div>`).join("")}
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn-primary btn-sm" id="btn-guardar-ingresos-mes">Guardar</button>
        <button class="btn-secondary btn-sm" id="btn-cancelar-ingresos-mes">Cancelar</button>
      </div>
    </div>
    <div id="proy-ingresos-mes-display" class="proy-ingresos-display">
      ${FUENTES.filter(f => fuentes[f] > 0).map(f =>
        `<div class="proy-ingreso-chip">
          <span>${f}</span>
          <strong>${formatMonto(fuentes[f])}</strong>
        </div>`
      ).join("") || `<span class="empty-hint">Sin ingresos configurados para este mes. Se usa el presupuesto global.</span>`}
    </div>`;

  document.getElementById("btn-toggle-ingresos-mes").addEventListener("click", () => {
    document.getElementById("proy-ingresos-mes-form").classList.toggle("hidden");
    document.getElementById("proy-ingresos-mes-display").classList.toggle("hidden");
  });
  document.getElementById("btn-guardar-ingresos-mes")?.addEventListener("click", () => {
    const inputs = panel.querySelectorAll(".pres-input[data-fuente]");
    const nuevasFuentes = {};
    inputs.forEach(inp => {
      const v = parseFloat(inp.value);
      if (v > 0) nuevasFuentes[inp.dataset.fuente] = v;
    });
    setIngresosMes(mes, nuevasFuentes);
    renderProyeccion();
    SyncManager.mostrarToast("✅ Ingresos de " + new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long" }) + " guardados");
  });
  document.getElementById("btn-cancelar-ingresos-mes")?.addEventListener("click", () => {
    document.getElementById("proy-ingresos-mes-form").classList.add("hidden");
    document.getElementById("proy-ingresos-mes-display").classList.remove("hidden");
  });
}

// ---- RESUMEN 4 MESES ----
function render4MesesResumen() {
  const wrap = document.getElementById("proy-4meses-wrap");
  const grid = document.getElementById("proy-4meses-grid");
  if (!wrap || !grid) return;
  wrap.style.display = "";

  const meses = obtener4Meses();
  const gastosEstimados = presupuesto
    .filter(p => p.montoEstimado > 0)
    .reduce((s, p) => s + p.montoEstimado, 0);

  grid.innerHTML = `<div class="proy-4m-grid">` + meses.map(mes => {
    const label = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    const ingEst = totalIngresosMes(mes) || presupuesto.filter(p => p.ingresoEstimado > 0).reduce((s, p) => s + p.ingresoEstimado, 0);
    const movsM = movimientos.filter(m => m.fecha.startsWith(mes));
    const gastReal = movsM.filter(m => m.categoria !== "Ingreso" && m.categoria !== "Transferencia").reduce((s, m) => s + Math.abs(m.monto), 0);
    const ingReal = movsM.filter(m => m.categoria === "Ingreso").reduce((s, m) => s + m.monto, 0);
    const excEst = ingEst - gastosEstimados;
    const excReal = ingReal - gastReal;
    const isActivo = mes === proyMesActivo;

    return `<div class="proy-4m-card ${isActivo ? "proy-4m-active" : ""}" data-mes="${mes}">
      <div class="proy-4m-mes">${label}</div>
      <div class="proy-4m-row"><span>Ingresos est.</span><strong>${formatMonto(ingEst)}</strong></div>
      <div class="proy-4m-row"><span>Gastos est.</span><strong>${formatMonto(gastosEstimados)}</strong></div>
      <div class="proy-4m-row proy-4m-exc" style="color:${excEst>=0?"var(--green)":"var(--red)"}">
        <span>Excedente</span><strong>${formatMonto(excEst)}</strong>
      </div>
      ${ingReal > 0 || gastReal > 0 ? `
      <div class="proy-4m-divider"></div>
      <div class="proy-4m-row" style="font-size:11px;color:var(--text-light)"><span>Real ingresos</span><strong>${formatMonto(ingReal)}</strong></div>
      <div class="proy-4m-row" style="font-size:11px;color:var(--text-light)"><span>Real gastos</span><strong>${formatMonto(gastReal)}</strong></div>
      <div class="proy-4m-row" style="font-size:11px;color:${excReal>=0?"var(--green)":"var(--red)"}"><span>Real excedente</span><strong>${formatMonto(excReal)}</strong></div>
      ` : ""}
    </div>`;
  }).join("") + "</div>";

  // Clic en tarjeta de mes
  grid.querySelectorAll(".proy-4m-card").forEach(card => {
    card.addEventListener("click", () => {
      proyMesActivo = card.dataset.mes;
      document.getElementById("proyeccion-mes").value = proyMesActivo;
      renderProyeccion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

// ---- TABLA COMPARACIÓN ----

function renderTablaComparacion(movsDelMes) {
  const tbody = document.getElementById("proy-tabla-body");
  if (!tbody) return;

  const realesPorConcepto = {};
  movsDelMes
    .filter(m => m.categoria !== "Ingreso" && m.categoria !== "Transferencia")
    .forEach(m => {
      realesPorConcepto[m.concepto] = (realesPorConcepto[m.concepto] || 0) + Math.abs(m.monto);
    });

  const filas = presupuesto
    .filter(p => p.montoEstimado > 0)
    .map(p => ({
      categoria: p.categoria,
      concepto:  p.concepto,
      estimado:  p.montoEstimado,
      real:      realesPorConcepto[p.concepto] || 0,
    }));

  Object.entries(realesPorConcepto).forEach(([concepto, real]) => {
    if (!filas.find(f => f.concepto === concepto)) {
      const mov = movimientos.find(m => m.concepto === concepto);
      filas.push({ categoria: mov ? mov.categoria : "Sin categoría", concepto, estimado: 0, real });
    }
  });

  if (filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-light)">
      No hay datos — agrega un presupuesto para ver la comparación.</td></tr>`;
    return;
  }

  filas.sort((a, b) => {
    if (a.estimado > 0 && b.estimado === 0) return -1;
    if (a.estimado === 0 && b.estimado > 0) return 1;
    return a.categoria.localeCompare(b.categoria);
  });

  tbody.innerHTML = filas.map(f => {
    const desviacion = f.real - f.estimado;
    const pct = f.estimado > 0 ? (f.real / f.estimado) : (f.real > 0 ? 999 : 0);
    const pctNum = f.estimado > 0 ? Math.round(pct * 100) : (f.real > 0 ? null : 0);

    let estadoClass = "estado-ok";
    if (pct > 1)        estadoClass = "estado-mal";
    else if (pct > 0.8) estadoClass = "estado-alerta";
    if (f.estimado === 0 && f.real > 0) estadoClass = "estado-mal";

    const desvClass = desviacion > 0 ? "desv-positivo" : desviacion < 0 ? "desv-negativo" : "";
    const desvSigno = desviacion > 0 ? "+" : "";
    const pctLabel  = pctNum !== null ? pctNum + "%" : "—";
    const barW      = Math.min((pct > 0 ? pct : 0) * 100, 100);

    return `<tr class="proy-tabla-row">
      <td>
        <div class="proy-cell-concepto">
          <span class="cat-badge cat-${f.categoria.toLowerCase().replace(/ /g,'')}">
            ${f.categoria === "Gasto fijo" ? "F" : f.categoria === "Gasto variable" ? "V" : f.categoria.charAt(0)}
          </span>
          <span class="proy-concepto-nombre">${ICONOS[f.concepto] || "📌"} ${f.concepto}</span>
        </div>
      </td>
      <td class="proy-cell-num">${f.estimado > 0 ? formatMonto(f.estimado) : "—"}</td>
      <td class="proy-cell-num">${f.real > 0 ? formatMonto(f.real) : "—"}</td>
      <td class="proy-cell-estado">
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="width:48px;height:5px;background:var(--bg);border-radius:3px;overflow:hidden">
            <div style="width:${barW}%;height:100%;background:var(--${estadoClass === 'estado-ok' ? 'green' : estadoClass === 'estado-alerta' ? 'amber' : 'red'});border-radius:3px"></div>
          </div>
          <span class="pct-label ${estadoClass}" style="font-size:11px">${pctLabel}</span>
          ${desviacion !== 0 ? `<span class="proy-desv ${desvClass}" style="font-size:10px">${desvSigno}${formatMonto(Math.abs(desviacion))}</span>` : ""}
        </div>
      </td>
    </tr>`;
  }).join("");
}

// ---- DASHBOARD DONUTS ----

function renderDashboardDonuts() {
  const container = document.getElementById("proy-donuts");
  if (!container) return;

  const mes = proyMesActivo || new Date().toISOString().slice(0, 7);
  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mes));

  const fijoEst = presupuesto
    .filter(p => p.categoria === "Gasto fijo" && p.montoEstimado > 0)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const variableEst = presupuesto
    .filter(p => p.categoria === "Gasto variable" && p.montoEstimado > 0)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const fijoReal = movsDelMes
    .filter(m => m.categoria === "Gasto fijo")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const variableReal = movsDelMes
    .filter(m => m.categoria === "Gasto variable")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const activos = {};
  document.querySelectorAll(".proy-toggle").forEach(btn => {
    activos[btn.dataset.serie] = btn.classList.contains("active");
  });

  const SERIES = [
    {
      id:    "fijo-est",
      label: "Fijo estimado",
      valor: fijoEst,
      total: fijoEst + variableEst,
      tipo:  "fijo",
      color: "#5b4cf5",
      track: "#c7c2fc"
    },
    {
      id:    "variable-est",
      label: "Variable estimado",
      valor: variableEst,
      total: fijoEst + variableEst,
      tipo:  "variable",
      color: "#f59e0b",
      track: "#fde68a"
    },
    {
      id:    "fijo-real",
      label: "Fijo real",
      valor: fijoReal,
      total: fijoReal + variableReal,
      tipo:  "fijo",
      color: "#16a34a",
      track: "#bbf7d0"
    },
    {
      id:    "variable-real",
      label: "Variable real",
      valor: variableReal,
      total: fijoReal + variableReal,
      tipo:  "variable",
      color: "#dc2626",
      track: "#fecaca"
    }
  ];

  const seriesActivas = SERIES.filter(s => activos[s.id]);

  if (seriesActivas.length === 0) {
    container.innerHTML = `<div class="donut-empty-msg">Activa al menos una serie con los botones de arriba.</div>`;
    return;
  }

  const r = 48, cx = 60, cy = 60, stroke = 11;
  const circ = 2 * Math.PI * r;

  container.innerHTML = seriesActivas.map(s => {
    const pct        = s.total > 0 ? Math.round((s.valor / s.total) * 100) : 0;
    const dash       = s.total > 0 ? (s.valor / s.total) * circ : 0;
    const pctLabel   = s.total > 0 ? `${pct}%` : "—";
    const montoLabel = formatMonto(s.valor);
    const totalLabel = s.total > 0 ? formatMonto(s.total) : "Sin datos";
    const trackColor = s.total === 0 ? "#e4e7ef" : s.track;
    const textColor  = s.total === 0 ? "#9ca3af" : "#111827";

    return `<div class="donut-item">
      <svg class="donut-svg" width="120" height="120" viewBox="0 0 120 120">
        <circle
          cx="${cx}" cy="${cy}" r="${r}"
          fill="none"
          stroke="${trackColor}"
          stroke-width="${stroke}"
          transform="rotate(-90 ${cx} ${cy})"/>
        ${s.total > 0 ? `
        <circle
          cx="${cx}" cy="${cy}" r="${r}"
          fill="none"
          stroke="${s.color}"
          stroke-width="${stroke}"
          stroke-dasharray="${dash} ${circ - dash}"
          stroke-linecap="round"
          transform="rotate(-90 ${cx} ${cy})"
          style="transition:stroke-dasharray 0.5s ease"/>
        ` : ""}
        <text
          x="${cx}" y="${cy - 5}"
          text-anchor="middle"
          style="font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;fill:${textColor}">
          ${pctLabel}
        </text>
        <text
          x="${cx}" y="${cy + 11}"
          text-anchor="middle"
          style="font-size:9px;fill:#6b7280;font-family:'Inter',sans-serif">
          ${s.tipo}
        </text>
      </svg>
      <div class="donut-label">${s.label}</div>
      <div class="donut-sublabel">${montoLabel} / ${totalLabel}</div>
    </div>`;
  }).join("");
}

// ---- MODAL PRESUPUESTO ----

function abrirModalPresupuesto() {
  document.getElementById("modal-presupuesto").classList.remove("hidden");
  renderFormPresupuesto();
}

function cerrarModalPresupuesto() {
  document.getElementById("modal-presupuesto").classList.add("hidden");
}

function renderFormPresupuesto() {
  const container = document.getElementById("pres-form-body");

  const todasCategorias = [
    ...GASTOS_FIJOS.map(c => ({ categoria: "Gasto fijo", concepto: c })),
    ...GASTOS_VARIABLES.map(c => ({ categoria: "Gasto variable", concepto: c })),
  ];

  const filas = todasCategorias.map(base => {
    const guardado = presupuesto.find(p => p.concepto === base.concepto);
    return { ...base, montoEstimado: guardado ? guardado.montoEstimado : 0 };
  });

  container.innerHTML = `
    <p style="font-size:12px;color:var(--text-light);margin-bottom:12px">
      💡 Los ingresos se configuran por mes en la vista de Proyección.
    </p>
    <div class="pres-seccion-title" style="margin-top:4px">📌 Gastos fijos</div>
    ${filas.filter(f => f.categoria === "Gasto fijo").map(f => `
      <div class="pres-fila">
        <span class="pres-concepto">${ICONOS[f.concepto] || "📌"} ${f.concepto}</span>
        <input class="input pres-input" type="number" placeholder="0"
          data-tipo="gasto" data-concepto="${f.concepto}" data-categoria="Gasto fijo"
          value="${f.montoEstimado || ""}"/>
      </div>`).join("")}

    <div class="pres-seccion-title" style="margin-top:20px">🔀 Gastos variables</div>
    ${filas.filter(f => f.categoria === "Gasto variable").map(f => `
      <div class="pres-fila">
        <span class="pres-concepto">${ICONOS[f.concepto] || "📌"} ${f.concepto}</span>
        <input class="input pres-input" type="number" placeholder="0"
          data-tipo="gasto" data-concepto="${f.concepto}" data-categoria="Gasto variable"
          value="${f.montoEstimado || ""}"/>
      </div>`).join("")}
  `;
}

async function guardarPresupuesto() {
  const inputs = document.querySelectorAll(".pres-input");
  const filas = [];

  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    if (!val || val <= 0) return;
    filas.push({
      categoria:       inp.dataset.categoria,
      concepto:        inp.dataset.concepto,
      montoEstimado:   inp.dataset.tipo === "gasto"   ? val : 0,
      ingresoEstimado: inp.dataset.tipo === "ingreso" ? val : 0,
    });
  });

  const btn = document.getElementById("btn-guardar-presupuesto");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    await Sheets.guardarPresupuesto(filas);
    presupuesto = filas;
    cerrarModalPresupuesto();
    renderProyeccion();
  } catch (err) {
    alert("Error guardando presupuesto: " + err.message);

  } finally {
    const btnFinal = document.getElementById("btn-guardar-presupuesto");
    if (btnFinal) { btnFinal.textContent = "Guardar presupuesto"; btnFinal.disabled = false; }
  }
}

// =============================================
// CRONOLOGÍA MENSUAL
// =============================================

async function verificarYGuardarCronologia() {
  try {
    const hoy = new Date();
    if (hoy.getDate() !== 1) return;

    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesStr = mesAnterior.toISOString().slice(0, 7);

    const yaExiste = await Sheets.existeCronologiaMes(mesStr);
    if (yaExiste) return;

    const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mesStr));

    const fijoReal = movsDelMes
      .filter(m => m.categoria === "Gasto fijo")
      .reduce((s, m) => s + Math.abs(m.monto), 0);

    const varReal = movsDelMes
      .filter(m => m.categoria === "Gasto variable")
      .reduce((s, m) => s + Math.abs(m.monto), 0);

    const fijoEst = presupuesto
      .filter(p => p.categoria === "Gasto fijo" && p.montoEstimado > 0)
      .reduce((s, p) => s + p.montoEstimado, 0);

    const varEst = presupuesto
      .filter(p => p.categoria === "Gasto variable" && p.montoEstimado > 0)
      .reduce((s, p) => s + p.montoEstimado, 0);

    const fijoAser = fijoEst > 0 ? Math.round(((fijoReal - fijoEst) / fijoEst) * 100) : 0;
    const varAser  = varEst  > 0 ? Math.round(((varReal  - varEst)  / varEst)  * 100) : 0;

    await Sheets.guardarCronologia(mesStr, fijoAser, fijoReal, varAser, varReal);
    console.log(`✅ Cronología guardada para ${mesStr}`);
  } catch (err) {
    console.error("Error guardando cronología:", err);
  }
}

async function cargarYRenderCronologia() {
  try {
    const cronologia = await Sheets.getCronologia();
    renderCronologia(cronologia);
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    console.error("Error cargando cronología:", err);
  }
}

function renderCronologia(datos) {
  const container = document.getElementById("cronologia-wrap");
  if (!container) return;

  const ordenados = datos && datos.length > 0
    ? [...datos].sort((a, b) => b.mes.localeCompare(a.mes))
    : [];

  const filasCuerpo = ordenados.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light);font-style:italic">
        Aún no hay registros. El primer día de cada mes se guarda automáticamente el cierre del mes anterior.
       </td></tr>`
    : ordenados.map(d => {
        const fijoClass = d.fijoAsertividad <= 0 ? "estado-ok" : "estado-mal";
        const varClass  = d.varAsertividad  <= 0 ? "estado-ok" : "estado-mal";
        const mesLabel  = new Date(d.mes + "-15").toLocaleDateString("es-CO", {
          year: "numeric", month: "long"
        });
        return `<tr class="proy-fila">
          <td class="proy-concepto" style="font-weight:600">${mesLabel}</td>
          <td class="proy-num">${formatMonto(d.fijoCantidad)}</td>
          <td class="proy-pct-cell">
            <div class="pct-wrap">
              <div class="pct-bar-bg">
                <div class="pct-bar ${fijoClass}" style="width:${Math.min(Math.abs(d.fijoAsertividad), 100)}%"></div>
              </div>
              <span class="pct-label ${fijoClass}">${d.fijoAsertividad > 0 ? "↑" : "↓"}${Math.abs(d.fijoAsertividad)}%</span>
            </div>
          </td>
          <td class="proy-num">${formatMonto(d.varCantidad)}</td>
          <td class="proy-pct-cell">
            <div class="pct-wrap">
              <div class="pct-bar-bg">
                <div class="pct-bar ${varClass}" style="width:${Math.min(Math.abs(d.varAsertividad), 100)}%"></div>
              </div>
              <span class="pct-label ${varClass}">${d.varAsertividad > 0 ? "↑" : "↓"}${Math.abs(d.varAsertividad)}%</span>
            </div>
          </td>
        </tr>`;
      }).join("");

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="proy-tabla">
        <thead>
          <tr>
            <th>Mes</th>
            <th style="text-align:right">Fijo real</th>
            <th>Asertividad fijo</th>
            <th style="text-align:right">Variable real</th>
            <th>Asertividad variable</th>
          </tr>
        </thead>
        <tbody>${filasCuerpo}</tbody>
      </table>
    </div>
  `;
}

// ---- SETUP LISTENERS PROYECCIÓN ----

function setupProyeccionListeners() {
  document.getElementById("btn-editar-presupuesto")
    .addEventListener("click", abrirModalPresupuesto);
  document.getElementById("btn-cancelar-presupuesto")
    .addEventListener("click", cerrarModalPresupuesto);
  document.getElementById("btn-guardar-presupuesto")
    .addEventListener("click", guardarPresupuesto);
  // proyeccion-mes is now controlled by tab buttons (renderMesesTabs)

  // proy-toggles removed (donuts removed)

  document.getElementById("modal-presupuesto").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-presupuesto")) cerrarModalPresupuesto();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupProyeccionListeners);
} else {
  setTimeout(setupProyeccionListeners, 0);
}

function setupTopbarMenu() {
  const btn      = document.getElementById("btn-menu");
  const dropdown = document.getElementById("dropdown-menu");
  const ddSync   = document.getElementById("dd-sync");
  const ddLogout = document.getElementById("dd-logout");
  const ddLogin  = document.getElementById("dd-login");

  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierto = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", abierto);
    btn.setAttribute("aria-expanded", String(!abierto));
    actualizarDropdownUsuario();
  });

  document.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  });

  dropdown.addEventListener("click", (e) => e.stopPropagation());

  ddSync.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    cargarTodo();
  });

  ddLogout.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    document.getElementById("btn-logout").click();
  });

  ddLogin.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    document.getElementById("btn-login").click();
  });
}

function actualizarDropdownUsuario() {
  const info     = document.getElementById("dropdown-user-info");
  const ddLogout = document.getElementById("dd-logout");
  const ddLogin  = document.getElementById("dd-login");
  const ddSync   = document.getElementById("dd-sync");

  if (currentUser) {
    const initials = currentUser.name
      ? currentUser.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()
      : "?";
    info.innerHTML = `
      ${currentUser.picture
        ? `<img src="${currentUser.picture}" class="dropdown-avatar" alt="avatar"/>`
        : `<div class="dropdown-avatar-placeholder">${initials}</div>`
      }
      <div style="min-width:0">
        <div class="dropdown-user-name">${currentUser.name}</div>
        <div class="dropdown-user-email">${currentUser.email}</div>
      </div>
    `;
    ddLogout.style.display = "";
    ddLogin.style.display  = "none";
    ddSync.style.display   = "";
  } else {
    info.innerHTML = `
      <div style="font-size:13px;color:var(--text-light);width:100%;text-align:center">
        Sin sesión activa
      </div>
    `;
    ddLogout.style.display = "none";
    ddLogin.style.display  = "";
    ddSync.style.display   = "none";
  }
}

// =============================================
// MÓDULO RESUMEN — KPIs financieros
// =============================================

function renderResumen(mesSeleccionado = null) {
  const mes = mesSeleccionado || new Date().toISOString().slice(0, 7);

  // — Selector de mes —
  const mesesDisponibles = [...new Set(
    movimientos.map(m => m.fecha.slice(0, 7))
  )].sort((a, b) => b.localeCompare(a));

  const selectorWrap = document.getElementById("resumen-mes-selector");
  if (selectorWrap) {
    selectorWrap.innerHTML = `
      <select id="resumen-mes-select" class="mes-select">
        ${mesesDisponibles.map(m => `
          <option value="${m}" ${m === mes ? "selected" : ""}>
            ${new Date(m + "-15").toLocaleDateString("es-CO", { year: "numeric", month: "long" })}
          </option>
        `).join("")}
      </select>`;
    document.getElementById("resumen-mes-select")
      .addEventListener("change", e => renderResumen(e.target.value));
  }

  const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", {
    year: "numeric", month: "long"
  });
  const el = document.getElementById("resumen-mes-label");
  if (el) el.textContent = mesLabel;

  const movsDelMes = movimientos.filter(m =>
    m.fecha.startsWith(mes) && m.categoria !== "Transferencia"
  );

  const ingresos = movsDelMes
    .filter(m => m.categoria === "Ingreso")
    .reduce((s, m) => s + m.monto, 0);

  const gastoFijo = movsDelMes
    .filter(m => m.categoria === "Gasto fijo")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const gastoVar = movsDelMes
    .filter(m => m.categoria === "Gasto variable")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const gastoTotal = gastoFijo + gastoVar;

  // ── KPI 1: Potencial de ahorro ──
  const tasaAhorro = ingresos > 0 ? ((ingresos - gastoTotal) / ingresos) * 100 : null;
  const taEl = document.getElementById("kpi-tasa-ahorro-val");
  const taMeta = document.getElementById("kpi-tasa-ahorro-meta");
  const taEstado = document.getElementById("kpi-tasa-ahorro-estado");
  if (taEl) {
    if (tasaAhorro === null) {
      taEl.textContent = "Sin ingresos";
      taEstado.textContent = "⚪";
    } else {
      taEl.textContent = Math.round(tasaAhorro) + "%";
      taEl.style.color = tasaAhorro >= 20
        ? "var(--green)" : tasaAhorro >= 0
        ? "var(--yellow)" : "var(--red)";
      taMeta.textContent = tasaAhorro >= 20
        ? "✅ Buen potencial de ahorro"
        : tasaAhorro >= 0
        ? "⚠️ Margen ajustado — meta: 20% de potencial"
        : "🚨 Gastos superan ingresos";
      taEstado.textContent = tasaAhorro >= 20 ? "🟢" : tasaAhorro >= 0 ? "🟡" : "🔴";
    }
  }

  // ── KPI 2: Ratio deuda/ingreso ──
  const activosConCuota = (prestamos || []).filter(p => !p.pagado);
  const cuotasMes = activosConCuota.reduce((s, p) => {
    const concepto = conceptoPrestamo(p.nombre);
    const pagosMes = movsDelMes
      .filter(m => m.concepto === concepto)
      .reduce((x, m) => x + Math.abs(m.monto), 0);
    return s + pagosMes;
  }, 0);
  const ratioDeuda = ingresos > 0 ? (cuotasMes / ingresos) * 100 : null;
  const rdEl    = document.getElementById("kpi-ratio-deuda-val");
  const rdMeta  = document.getElementById("kpi-ratio-deuda-meta");
  const rdEstado = document.getElementById("kpi-ratio-deuda-estado");
  if (rdEl) {
    if (ratioDeuda === null) {
      rdEl.textContent = "Sin ingresos";
      rdEstado.textContent = "⚪";
    } else {
      rdEl.textContent = Math.round(ratioDeuda) + "%";
      rdEl.style.color = ratioDeuda <= 35
        ? "var(--green)" : ratioDeuda <= 50
        ? "var(--yellow)" : "var(--red)";
      rdMeta.textContent = `${formatMonto(cuotasMes)} en cuotas este mes`;
      rdEstado.textContent = ratioDeuda <= 35 ? "🟢" : ratioDeuda <= 50 ? "🟡" : "🔴";
    }
  }

  // ── KPI 3: Asertividad presupuestal ──
  const gastosEstimados = (presupuesto || [])
    .filter(p => p.montoEstimado > 0)
    .reduce((s, p) => s + p.montoEstimado, 0);
  const asEl    = document.getElementById("kpi-asertividad-val");
  const asMeta  = document.getElementById("kpi-asertividad-meta");
  const asEstado = document.getElementById("kpi-asertividad-estado");
  if (asEl) {
    if (gastosEstimados === 0) {
      asEl.textContent = "Sin presupuesto";
      asMeta.textContent = "Define tu presupuesto en Proyección";
      asEstado.textContent = "⚪";
    } else {
      const ejecucion = Math.round((gastoTotal / gastosEstimados) * 100);
      asEl.textContent = ejecucion + "%";
      asEl.style.color = ejecucion <= 80
        ? "var(--green)" : ejecucion <= 100
        ? "var(--yellow)" : "var(--red)";
      asMeta.textContent = `${formatMonto(gastoTotal)} de ${formatMonto(gastosEstimados)} estimados`;
      asEstado.textContent = ejecucion <= 80 ? "🟢" : ejecucion <= 100 ? "🟡" : "🔴";
    }
  }

  // ── KPI 4: Balance neto (suma de todas las cajas COP) ──
  const balanceNeto = cajas
    .filter(c => c.moneda === "COP")
    .reduce((s, c) => s + calcularSaldoCaja(c.nombre), 0);
  const bnEl    = document.getElementById("kpi-balance-neto-val");
  const bnMeta  = document.getElementById("kpi-balance-neto-meta");
  const bnEstado = document.getElementById("kpi-balance-neto-estado");
  if (bnEl) {
    bnEl.textContent  = formatMonto(balanceNeto);
    bnEl.style.color  = balanceNeto >= 0 ? "var(--green)" : "var(--red)";
    bnMeta.textContent = `${cajas.filter(c => c.moneda === "COP").length} cajas COP`;
    bnEstado.textContent = balanceNeto >= 0 ? "🟢" : "🔴";
  }

  // ── KPI 5 & 6: Distribución fijo vs variable ──
  const pctFijo = gastoTotal > 0 ? Math.round((gastoFijo / gastoTotal) * 100) : 0;
  const pctVar  = gastoTotal > 0 ? Math.round((gastoVar  / gastoTotal) * 100) : 0;
  const gfEl    = document.getElementById("kpi-gasto-fijo-val");
  const gfMeta  = document.getElementById("kpi-gasto-fijo-meta");
  const gfEstado = document.getElementById("kpi-gasto-fijo-estado");
  const gvEl    = document.getElementById("kpi-gasto-var-val");
  const gvMeta  = document.getElementById("kpi-gasto-var-meta");
  const gvEstado = document.getElementById("kpi-gasto-var-estado");
  if (gfEl) {
    gfEl.textContent  = pctFijo + "% del gasto";
    gfMeta.textContent = formatMonto(gastoFijo);
    gfEstado.textContent = pctFijo <= 60 ? "🟢" : pctFijo <= 75 ? "🟡" : "🔴";
    gfEl.style.color = pctFijo <= 60 ? "var(--green)" : pctFijo <= 75 ? "var(--yellow)" : "var(--red)";
  }
  if (gvEl) {
    gvEl.textContent  = pctVar + "% del gasto";
    gvMeta.textContent = formatMonto(gastoVar);
    gvEstado.textContent = "⚪";
  }

  // ── KPI 7 & 8: Gestión de deudas ──
  const totalDeudaActiva = activosConCuota.reduce((s, p) => s + p.monto, 0);
  const totalPagadoDeuda = activosConCuota.reduce((s, p) => s + calcularPagadoPrestamo(p.nombre), 0);
  const pctPagadoTotal   = totalDeudaActiva > 0
    ? Math.round((totalPagadoDeuda / totalDeudaActiva) * 100) : null;
  const dpEl    = document.getElementById("kpi-deuda-pct-val");
  const dpMeta  = document.getElementById("kpi-deuda-pct-meta");
  const dpEstado = document.getElementById("kpi-deuda-pct-estado");
  if (dpEl) {
    if (pctPagadoTotal === null) {
      dpEl.textContent = "Sin deudas";
      dpMeta.textContent = "¡Excelente!";
      dpEstado.textContent = "🟢";
    } else {
      dpEl.textContent   = pctPagadoTotal + "%";
      dpMeta.textContent = `${formatMonto(totalPagadoDeuda)} de ${formatMonto(totalDeudaActiva)}`;
      dpEstado.textContent = pctPagadoTotal >= 75 ? "🟢" : pctPagadoTotal >= 40 ? "🟡" : "🔴";
      dpEl.style.color = pctPagadoTotal >= 75 ? "var(--green)" : pctPagadoTotal >= 40 ? "var(--yellow)" : "var(--red)";
    }
  }
  const cmEl    = document.getElementById("kpi-cuotas-mes-val");
  const cmMeta  = document.getElementById("kpi-cuotas-mes-meta");
  const cmEstado = document.getElementById("kpi-cuotas-mes-estado");
  if (cmEl) {
    const cuotasPagadas = activosConCuota.filter(p => {
      const concepto = conceptoPrestamo(p.nombre);
      return movsDelMes.some(m => m.concepto === concepto);
    }).length;
    cmEl.textContent   = `${cuotasPagadas} / ${activosConCuota.length}`;
    cmMeta.textContent = cuotasPagadas === activosConCuota.length
      ? "Todas al día" : `${activosConCuota.length - cuotasPagadas} préstamo(s) sin pago este mes`;
    cmEstado.textContent = cuotasPagadas === activosConCuota.length ? "🟢" : "🟡";
    cmEl.style.color = cuotasPagadas === activosConCuota.length ? "var(--green)" : "var(--yellow)";
  }

  // ── KPI 9: Tendencia ahorro 3 meses ──
  const cacheCron = localStorage.getItem("cache_cronologia");
  const tdEl    = document.getElementById("kpi-tendencia-val");
  const tdMeta  = document.getElementById("kpi-tendencia-meta");
  const tdEstado = document.getElementById("kpi-tendencia-estado");
  if (tdEl && cacheCron) {
    try {
      const cronData = JSON.parse(cacheCron);
      const ultimos3 = [...cronData]
        .sort((a, b) => b.mes.localeCompare(a.mes))
        .slice(0, 3);
      if (ultimos3.length >= 2) {
        const tendencia = ultimos3[0].fijoCantidad < ultimos3[1].fijoCantidad ? "mejorando" : "empeorando";
        tdEl.textContent = tendencia === "mejorando" ? "↓ Bajando" : "↑ Subiendo";
        tdEl.style.color = tendencia === "mejorando" ? "var(--green)" : "var(--red)";
        tdMeta.textContent = `Gasto fijo: ${ultimos3.map(d =>
          new Date(d.mes + "-15").toLocaleDateString("es-CO", { month: "short" }) +
          " " + formatMonto(d.fijoCantidad)
        ).reverse().join(" → ")}`;
        tdEstado.textContent = tendencia === "mejorando" ? "🟢" : "🔴";
      } else {
        tdEl.textContent = "Pocos datos";
        tdMeta.textContent = "Se necesitan al menos 2 meses";
        tdEstado.textContent = "⚪";
      }
    } catch { tdEl.textContent = "—"; }
  } else if (tdEl) {
    tdEl.textContent = "Sin historial";
    tdMeta.textContent = "Se registra el 1° de cada mes";
    tdEstado.textContent = "⚪";
  }

  // ── KPI 10: Mayor desvío del presupuesto ──
  const dvEl    = document.getElementById("kpi-desvio-val");
  const dvMeta  = document.getElementById("kpi-desvio-meta");
  const dvEstado = document.getElementById("kpi-desvio-estado");
  if (dvEl && presupuesto && presupuesto.length > 0) {
    const realesPorConcepto = {};
    movsDelMes.forEach(m => {
      if (m.categoria === "Ingreso") return;
      realesPorConcepto[m.concepto] = (realesPorConcepto[m.concepto] || 0) + Math.abs(m.monto);
    });
    const desvios = presupuesto
      .filter(p => p.montoEstimado > 0)
      .map(p => ({
        concepto: p.concepto,
        desviacion: (realesPorConcepto[p.concepto] || 0) - p.montoEstimado
      }))
      .filter(d => d.desviacion > 0)
      .sort((a, b) => b.desviacion - a.desviacion);
    if (desvios.length > 0) {
      dvEl.textContent   = desvios[0].concepto;
      dvMeta.textContent = `+${formatMonto(desvios[0].desviacion)} sobre lo estimado`;
      dvEstado.textContent = "🔴";
      dvEl.style.color = "var(--red)";
    } else {
      dvEl.textContent   = "Ninguno";
      dvMeta.textContent = "Todo dentro del presupuesto";
      dvEstado.textContent = "🟢";
      dvEl.style.color = "var(--green)";
    }
  } else if (dvEl) {
    dvEl.textContent = "—";
    dvMeta.textContent = "Define tu presupuesto";
    dvEstado.textContent = "⚪";
  }

  // ── ALERTAS ──
  const alertasWrap = document.getElementById("resumen-alertas");
  if (alertasWrap) {
    const alertas = [];

    const pagadosEsteMes = new Set(
      movsDelMes.filter(m => m.categoria === "Gasto fijo").map(m => m.concepto)
    );
    const fijosFaltantes = GASTOS_FIJOS.filter(f => !pagadosEsteMes.has(f));
    if (fijosFaltantes.length > 0) {
      alertas.push({
        tipo: "warn",
        icono: "📌",
        titulo: `${fijosFaltantes.length} gasto(s) fijo(s) sin registrar`,
        detalle: fijosFaltantes.join(", ")
      });
    }

    const prestamosSinPago = activosConCuota.filter(p => {
      const concepto = conceptoPrestamo(p.nombre);
      return !movsDelMes.some(m => m.concepto === concepto);
    });
    if (prestamosSinPago.length > 0) {
      alertas.push({
        tipo: "warn",
        icono: "💳",
        titulo: `${prestamosSinPago.length} préstamo(s) sin cuota este mes`,
        detalle: prestamosSinPago.map(p => p.nombre).join(", ")
      });
    }

    const totalCompras = (window.compras || []).reduce((s, c) => s + c.montoDestinado, 0);
    if (totalCompras > 0) {
      alertas.push({
        tipo: "info",
        icono: "🛍️",
        titulo: `${formatMonto(totalCompras)} comprometidos en lista de compras`,
        detalle: `${(window.compras || []).length} item(s) pendiente(s)`
      });
    }

    if (balanceNeto < 0) {
      alertas.push({
        tipo: "danger",
        icono: "🚨",
        titulo: "Balance neto negativo",
        detalle: `Debes ${formatMonto(Math.abs(balanceNeto))} en total`
      });
    }

    if (alertas.length === 0) {
      alertasWrap.innerHTML = `
        <div class="alerta-item alerta-ok">
          <span class="alerta-icono">✅</span>
          <div>
            <div class="alerta-titulo">Todo en orden</div>
            <div class="alerta-detalle">No hay alertas activas este mes</div>
          </div>
        </div>`;
    } else {
      alertasWrap.innerHTML = alertas.map(a => `
        <div class="alerta-item alerta-${a.tipo}">
          <span class="alerta-icono">${a.icono}</span>
          <div>
            <div class="alerta-titulo">${a.titulo}</div>
            <div class="alerta-detalle">${a.detalle}</div>
          </div>
        </div>`).join("");
    }
  }
}


// =============================================
// METAS DE AHORRO — v2 con estrategia y submetas
// =============================================
// Estructura meta: { id, nombre, icono, cajaId, objetivo, fechaLimite,
//   estrategia: "20pct"|"custom-pct"|"fixed",
//   estrategiaValor: number,  // % o monto fijo
//   submetas: [{id, mes, montoObjetivo, pagado}] }

function getMetas() {
  try { return JSON.parse(localStorage.getItem("metas_ahorro_v2") || "[]"); } catch { return []; }
}
function saveMetas(metas) {
  localStorage.setItem("metas_ahorro_v2", JSON.stringify(metas));
}
function getCajasAhorro() {
  return cajas.filter(c => c.nombre.toLowerCase().includes("ahorro"));
}

// Calcula el saldo real de una caja basado en movimientos
function getSaldoCaja(cajaId) {
  return movimientos.filter(m => m.caja === cajaId).reduce((s, m) => {
    if (m.categoria === "Ingreso") return s + m.monto;
    if (m.categoria === "Transferencia") return s;
    return s - Math.abs(m.monto);
  }, 0);
}

// Ingreso estimado para un mes
function ingEstimadoMes(mes) {
  return totalIngresosMes(mes) ||
    presupuesto.filter(p => p.ingresoEstimado > 0).reduce((s, p) => s + p.ingresoEstimado, 0);
}

// Excedente proyectado para un mes (ingreso - gastos estimados)
function excedenteEstimadoMes(mes) {
  const ing = ingEstimadoMes(mes);
  const gast = presupuesto.filter(p => p.montoEstimado > 0).reduce((s, p) => s + p.montoEstimado, 0);
  return Math.max(0, ing - gast);
}

// Cuánto debe ahorrar por mes dada la estrategia
function calcularAhorroPorMes(meta, mes) {
  if (meta.estrategia === "cuotas") {
    // monto fijo manual OR cuota calculada (objetivo / nMeses)
    return meta.estrategiaValor || calcularCuotaFija(meta) || 0;
  }
  if (meta.estrategia === "calculada") {
    // Auto: % del excedente proyectado suficiente para llegar al objetivo
    const pct = meta.estrategiaValor || 100; // pct del excedente
    return excedenteEstimadoMes(mes) * (pct / 100);
  }
  if (meta.estrategia === "custom-pct") {
    const pct = meta.estrategiaValor || 20;
    return ingEstimadoMes(mes) * (pct / 100);
  }
  return 0;
}

// Calcula la cuota fija necesaria para llegar al objetivo en el plazo
function calcularCuotaFija(meta) {
  if (!meta.fechaLimite || !meta.objetivo) return 0;
  const hoy = new Date();
  const limite = new Date(meta.fechaLimite);
  let meses = (limite.getFullYear() - hoy.getFullYear()) * 12 + (limite.getMonth() - hoy.getMonth());
  if (meses <= 0) meses = 1;
  const cajaId = meta.cajaId;
  const saldoActual = cajaId ? Math.max(0, getSaldoCaja(cajaId)) : 0;
  const restante = Math.max(0, meta.objetivo - saldoActual);
  return Math.ceil(restante / meses);
}

// Calcula el % del excedente necesario para cubrir el objetivo en el plazo
function calcularPctExcedente(meta) {
  if (!meta.fechaLimite || !meta.objetivo) return null;
  const cuota = calcularCuotaFija(meta);
  if (cuota <= 0) return null;
  // Promedio excedente de los 4 meses proyectados
  const meses4 = obtener4Meses();
  const excProm = meses4.reduce((s, m) => s + excedenteEstimadoMes(m), 0) / 4;
  if (excProm <= 0) return null;
  const pct = Math.round((cuota / excProm) * 100);
  return { cuota, excProm, pct: Math.min(pct, 100) };
}

// Genera submetas mensuales desde hoy hasta la fecha límite
function generarSubmetasDesde(meta) {
  if (!meta.fechaLimite) return [];
  const hoy = new Date();
  const limite = new Date(meta.fechaLimite);
  const submetas = [];
  let d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  while (d <= limite) {
    const mes = d.toISOString().slice(0, 7);
    const existe = (meta.submetas || []).find(s => s.mes === mes);
    const montoObj = calcularAhorroPorMes(meta, mes);
    submetas.push({
      id: existe ? existe.id : "SM" + mes,
      mes,
      montoObjetivo: montoObj,
      pagado: existe ? existe.pagado : false,
    });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return submetas;
}

async function cargarMetas() { renderMetas(); }

function renderMetas() {
  const lista = document.getElementById("metas-list");
  const resBar = document.getElementById("metas-resumen-bar");
  if (!lista) return;

  const cajasAhorro = getCajasAhorro();
  const metas = getMetas();

  // Resumen global
  if (resBar) {
    const totalObj = metas.reduce((s, m) => s + (m.objetivo || 0), 0);
    const totalReal = metas.reduce((s, m) => {
      const saldo = getSaldoCaja(m.cajaId);
      return s + Math.max(0, saldo);
    }, 0);
    const pct = totalObj > 0 ? Math.min(100, Math.round((totalReal / totalObj) * 100)) : 0;
    resBar.innerHTML = `
      <div class="meta-resumen-pill">
        <div class="meta-resumen-label">Total ahorrado</div>
        <div class="meta-resumen-val" style="color:var(--green-dark)">${formatMonto(totalReal)}</div>
      </div>
      <div class="meta-resumen-pill">
        <div class="meta-resumen-label">Total objetivo</div>
        <div class="meta-resumen-val">${formatMonto(totalObj)}</div>
      </div>
      <div class="meta-resumen-pill">
        <div class="meta-resumen-label">Progreso global</div>
        <div class="meta-resumen-val" style="color:var(--purple)">${pct}%</div>
      </div>`;
  }

  if (cajasAhorro.length === 0 && metas.length === 0) {
    lista.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🎯</div>
      <div class="empty-state-text">No tienes cajas de ahorro.<br>
      Crea una caja con la palabra <strong>"ahorro"</strong> en el nombre para empezar.</div>
    </div>`;
    return;
  }
  if (metas.length === 0) {
    lista.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🎯</div>
      <div class="empty-state-text">Tienes ${cajasAhorro.length} caja${cajasAhorro.length > 1 ? "s" : ""} de ahorro. ¡Crea tu primera meta!</div>
    </div>`;
    return;
  }

  lista.innerHTML = metas.map(meta => {
    const caja = cajas.find(c => c.id === meta.cajaId);
    const saldo = Math.max(0, caja ? getSaldoCaja(meta.cajaId) : 0);
    const pct = meta.objetivo > 0 ? Math.min(100, Math.round((saldo / meta.objetivo) * 100)) : 0;
    const restante = Math.max(0, meta.objetivo - saldo);
    const color = pct >= 100 ? "var(--green)" : pct >= 60 ? "var(--blue)" : "var(--purple)";

    // Fecha / tiempo restante
    let fechaInfo = "";
    let diasStr = "";
    if (meta.fechaLimite) {
      const dias = Math.ceil((new Date(meta.fechaLimite) - new Date()) / 86400000);
      diasStr = dias > 0 ? `${dias} días` : "¡Fecha vencida!";
      fechaInfo = dias > 0
        ? `⏳ ${diasStr} · ${new Date(meta.fechaLimite).toLocaleDateString("es-CO", { year:"numeric", month:"short" })}`
        : `⚠️ Fecha vencida`;
    }

    // Excedente promedio 4 meses para proyección
    const meses4 = obtener4Meses();
    const gastosEst = presupuesto.filter(p => p.montoEstimado > 0).reduce((s, p) => s + p.montoEstimado, 0);
    const excProm = meses4.reduce((s, mes) => {
      const ing = totalIngresosMes(mes) || presupuesto.filter(p => p.ingresoEstimado > 0).reduce((a, p) => a + p.ingresoEstimado, 0);
      return s + Math.max(0, ing - gastosEst);
    }, 0) / 4;
    const mesesPara = excProm > 0 && restante > 0 ? Math.ceil(restante / excProm) : null;

    // Estrategia label
    const estrategiaLabel = meta.estrategia === "calculada"
      ? `${meta.estrategiaValor || "?"}% del excedente/mes`
      : meta.estrategia === "cuotas"
      ? (meta.estrategiaValor ? `${formatMonto(meta.estrategiaValor)}/mes fijo` : `${formatMonto(calcularCuotaFija(meta))}/mes cuota`)
      : meta.estrategia === "custom-pct"
      ? `${meta.estrategiaValor}% del ingreso/mes`
      : "Sin estrategia";

    // Submetas del mes actual
    const submetas = (meta.submetas || []);
    const mesActual = new Date().toISOString().slice(0, 7);
    const submetaActual = submetas.find(s => s.mes === mesActual);
    const submetasMostrar = submetas.slice(-6).reverse(); // últimas 6

    return `<div class="meta-card">
      <div class="meta-card-header">
        <span class="meta-icono">${meta.icono || "🎯"}</span>
        <div class="meta-info">
          <div class="meta-nombre">${meta.nombre}</div>
          <div class="meta-caja-tag">🏦 ${caja ? caja.nombre : "Caja no encontrada"}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${pct >= 100 ? `<span style="font-size:20px">🎉</span>` : ""}
          <button class="btn-accion btn-borrar" onclick="borrarMeta('${meta.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>
      <div class="meta-card-body">
        <div class="meta-progress-row">
          <div class="meta-progress-bg">
            <div class="meta-progress-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="meta-pct-badge" style="color:${color}">${pct}%</span>
        </div>
        <div class="meta-amounts">
          <span class="meta-saved" style="color:${color}">${formatMonto(saldo)}</span>
          <span class="meta-of">de</span>
          <span class="meta-target">${formatMonto(meta.objetivo)}</span>
          ${restante > 0 ? `<span class="meta-of">· Faltan ${formatMonto(restante)}</span>` : `<span style="color:var(--green-dark);font-weight:700">¡Meta alcanzada!</span>`}
        </div>
        <div class="meta-stats">
          <span class="meta-stat-chip">📈 ${estrategiaLabel}</span>
          ${fechaInfo ? `<span class="meta-stat-chip">📅 ${fechaInfo}</span>` : ""}
          ${mesesPara !== null ? `<span class="meta-stat-chip">🚀 ~${mesesPara} mes${mesesPara !== 1 ? "es" : ""} con excedente actual</span>` : ""}
          ${submetaActual ? `<span class="meta-stat-chip" style="background:${submetaActual.pagado?"var(--green-soft)":"var(--blue-soft)"}">
            ${submetaActual.pagado ? "✅" : "📌"} Este mes: ${formatMonto(calcularAhorroPorMes(meta, mesActual))}
          </span>` : ""}
        </div>
      </div>
      ${submetas.length > 0 ? `
      <div class="meta-submetas">
        <div class="meta-submetas-header" onclick="toggleSubmetas('${meta.id}')">
          <span class="meta-submetas-title">📅 Submetas mensuales (${submetas.filter(s=>s.pagado).length}/${submetas.length} completadas)</span>
          <span id="submeta-arrow-${meta.id}">▼</span>
        </div>
        <div class="meta-submetas-list" id="submetas-${meta.id}" style="display:none">
          ${submetasMostrar.map(s => {
            const sLabel = new Date(s.mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "2-digit" });
            const montoSm = s.montoObjetivo > 0 ? s.montoObjetivo : calcularAhorroPorMes(meta, s.mes);
            return `<div class="submeta-item">
              <div class="submeta-check ${s.pagado ? "done" : ""}" onclick="toggleSubmeta('${meta.id}','${s.id}')" title="${s.pagado ? "Marcar pendiente" : "Marcar completo"}">
                ${s.pagado ? "✓" : ""}
              </div>
              <div class="submeta-info">
                <div class="submeta-mes">${sLabel}</div>
                <div class="submeta-monto">${formatMonto(montoSm)}</div>
              </div>
              <span style="font-size:11px;color:var(--text-4)">${s.mes === mesActual ? "← Este mes" : ""}</span>
            </div>`;
          }).join("")}
          ${submetas.length > 6 ? `<div style="font-size:11px;color:var(--text-4);text-align:center;padding:4px">+${submetas.length - 6} más…</div>` : ""}
        </div>
      </div>` : ""}
    </div>`;
  }).join("");
}

function toggleSubmetas(metaId) {
  const list = document.getElementById(`submetas-${metaId}`);
  const arrow = document.getElementById(`submeta-arrow-${metaId}`);
  if (!list) return;
  const open = list.style.display !== "none";
  list.style.display = open ? "none" : "flex";
  if (arrow) arrow.textContent = open ? "▼" : "▲";
}

function toggleSubmeta(metaId, submetaId) {
  const metas = getMetas();
  const meta = metas.find(m => m.id === metaId);
  if (!meta) return;
  meta.submetas = (meta.submetas || []).map(s =>
    s.id === submetaId ? { ...s, pagado: !s.pagado } : s
  );
  saveMetas(metas);
  renderMetas();
}

async function guardarMeta() {
  const nombre   = document.getElementById("meta-nombre").value.trim();
  const cajaId   = document.getElementById("meta-caja").value;
  const objetivo = parseFloat(document.getElementById("meta-objetivo").value);
  const icono    = document.getElementById("meta-icono").value;
  const fecha    = document.getElementById("meta-fecha").value;

  // Estrategia
  const estrategiaBtn = document.querySelector(".estrategia-btn.active");
  const estrategia = estrategiaBtn?.dataset.estrategia || "calculada";
  let estrategiaValor = 0;
  if (estrategia === "custom-pct") {
    estrategiaValor = parseFloat(document.getElementById("meta-pct-custom").value) || 20;
  } else if (estrategia === "cuotas") {
    estrategiaValor = parseFloat(document.getElementById("meta-monto-fijo").value) || 0;
  } else if (estrategia === "calculada") {
    // Store the calculated pct of excedente
    const tmpMeta = { objetivo: parseFloat(document.getElementById("meta-objetivo").value) || 0,
      fechaLimite: document.getElementById("meta-fecha").value,
      cajaId: document.getElementById("meta-caja").value };
    const calc = calcularPctExcedente(tmpMeta);
    estrategiaValor = calc ? calc.pct : 100;
  }

  if (!nombre) { alert("Escribe el nombre de la meta"); return; }
  if (!cajaId) { alert("Selecciona una caja de ahorro"); return; }
  if (!objetivo || objetivo <= 0) { alert("Ingresa un monto objetivo"); return; }

  const nuevaMeta = {
    id: "MT" + Date.now(), nombre, icono, cajaId, objetivo,
    fechaLimite: fecha, estrategia, estrategiaValor,
    submetas: []
  };

  // Generar submetas si hay fecha límite
  if (fecha) {
    nuevaMeta.submetas = generarSubmetasDesde(nuevaMeta);
  }

  const metas = getMetas();
  metas.push(nuevaMeta);
  saveMetas(metas);
  document.getElementById("modal-meta").classList.add("hidden");
  limpiarFormMeta();
  renderMetas();
  SyncManager.mostrarToast(`✅ Meta "${nombre}" creada con ${nuevaMeta.submetas.length} submetas`);
}

function limpiarFormMeta() {
  ["meta-nombre", "meta-objetivo", "meta-pct-custom", "meta-monto-fijo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("meta-fecha").value = "";
  document.querySelectorAll(".estrategia-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(".estrategia-btn[data-estrategia='calculada']")?.classList.add("active");
  actualizarEstrategiaUI("calculada");
}

function actualizarEstrategiaUI(tipo) {
  const ids = ["estrategia-calculada-info", "estrategia-cuotas-input", "estrategia-custom-pct-input"];
  const mapa = { "calculada": "estrategia-calculada-info", "cuotas": "estrategia-cuotas-input", "custom-pct": "estrategia-custom-pct-input" };
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add("hidden"); });
  const target = mapa[tipo];
  if (target) { const el = document.getElementById(target); if (el) el.classList.remove("hidden"); }
  actualizarEstrategiaCalculo();
}

function actualizarEstrategiaCalculo() {
  const tipo = document.querySelector(".estrategia-btn.active")?.dataset.estrategia || "calculada";
  const objetivo = parseFloat(document.getElementById("meta-objetivo")?.value) || 0;
  const fecha = document.getElementById("meta-fecha")?.value;
  const cajaId = document.getElementById("meta-caja")?.value;

  if (!objetivo || !fecha) return;

  const tmpMeta = { objetivo, fechaLimite: fecha, cajaId };
  const cuotaFija = calcularCuotaFija(tmpMeta);
  const calc = calcularPctExcedente(tmpMeta);

  // Update "calculada" info
  const infoEl = document.getElementById("estrategia-calculada-texto");
  if (infoEl) {
    if (cuotaFija > 0 && calc) {
      infoEl.innerHTML = `Para llegar a <strong>${formatMonto(objetivo)}</strong> en el plazo necesitas:<br>
        · Cuota mensual sugerida: <strong style="color:var(--blue)">${formatMonto(cuotaFija)}</strong><br>
        · Equivale al <strong style="color:var(--blue)">${calc.pct}%</strong> de tu excedente proyectado promedio (${formatMonto(calc.excProm)}/mes)`;
    } else if (cuotaFija > 0) {
      infoEl.innerHTML = `Cuota mensual necesaria: <strong style="color:var(--blue)">${formatMonto(cuotaFija)}</strong><br>
        <span style="color:var(--text-4)">Define ingresos en Proyección para ver el % del excedente</span>`;
    } else {
      infoEl.textContent = "Ingresa el objetivo y la fecha límite para calcular automáticamente.";
    }
  }

  // Update "cuotas" info
  const cuotasEl = document.getElementById("estrategia-cuotas-info");
  if (cuotasEl && cuotaFija > 0) {
    cuotasEl.innerHTML = `Cuota calculada: <strong style="color:var(--blue)">${formatMonto(cuotaFija)}</strong>/mes. También puedes ingresar un monto diferente abajo.`;
    if (!document.getElementById("meta-monto-fijo").value) {
      document.getElementById("meta-monto-fijo").placeholder = formatMonto(cuotaFija).replace("$", "").replace(/\./g, "");
    }
  }

  // Update "custom-pct" preview
  const pctInput = document.getElementById("meta-pct-custom");
  const pctPreview = document.getElementById("estrategia-pct-preview");
  if (pctPreview && pctInput) {
    const pct = parseFloat(pctInput.value) || 0;
    const meses4 = obtener4Meses();
    const ingProm = meses4.reduce((s, m) => s + ingEstimadoMes(m), 0) / 4;
    if (ingProm > 0 && pct > 0) {
      const montoMes = ingProm * (pct / 100);
      pctPreview.innerHTML = `Con el ${pct}% de tu ingreso promedio (${formatMonto(ingProm)}): <strong style="color:var(--blue)">${formatMonto(montoMes)}/mes</strong>`;
    }
  }
}

function borrarMeta(id) {
  const metas = getMetas();
  const meta = metas.find(m => m.id === id);
  if (!meta) return;
  if (!confirm(`¿Eliminar la meta "${meta.nombre}"? Esto no afecta tu caja de ahorro.`)) return;
  saveMetas(metas.filter(m => m.id !== id));
  renderMetas();
}

function setupMetasListeners() {
  document.getElementById("btn-nueva-meta")?.addEventListener("click", () => {
    const cajasAhorro = getCajasAhorro();
    if (cajasAhorro.length === 0) {
      alert("Crea primero una caja con la palabra 'ahorro' en su nombre.");
      return;
    }
    const sel = document.getElementById("meta-caja");
    sel.innerHTML = cajasAhorro.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
    limpiarFormMeta();
    document.getElementById("modal-meta").classList.remove("hidden");
  });

  document.getElementById("btn-cancelar-meta")?.addEventListener("click", () => {
    document.getElementById("modal-meta").classList.add("hidden");
  });

  document.getElementById("btn-guardar-meta")?.addEventListener("click", guardarMeta);

  document.getElementById("modal-meta")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-meta"))
      document.getElementById("modal-meta").classList.add("hidden");
  });

  // Estrategia selector
  document.getElementById("meta-estrategia-opts")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".estrategia-btn");
    if (!btn) return;
    document.querySelectorAll(".estrategia-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    actualizarEstrategiaUI(btn.dataset.estrategia);
  });

  // Live recalc when objetivo or fecha change
  ["meta-objetivo", "meta-fecha", "meta-caja"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", actualizarEstrategiaCalculo);
    document.getElementById(id)?.addEventListener("input", actualizarEstrategiaCalculo);
  });
  document.getElementById("meta-pct-custom")?.addEventListener("input", actualizarEstrategiaCalculo);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupMetasListeners);
} else {
  setTimeout(setupMetasListeners, 0);
}

// =============================================
// SUGERENCIAS DE COMPRAS — basadas en proyección
// =============================================

function renderSugerenciasCompras() {
  const wrap = document.getElementById("compras-sugerencias-wrap");
  const lista = document.getElementById("compras-sugerencias-list");
  const sub = document.getElementById("compras-sugerencias-sub");
  if (!wrap || !lista) return;

  if (!compras || compras.length === 0 || presupuesto.length === 0) { wrap.style.display = "none"; return; }

  const meses4 = obtener4Meses();
  const gastosEst = presupuesto.filter(p => p.montoEstimado > 0).reduce((s, p) => s + p.montoEstimado, 0);

  const excedentes = meses4.map(mes => {
    const ing = totalIngresosMes(mes) || presupuesto.filter(p => p.ingresoEstimado > 0).reduce((s, p) => s + p.ingresoEstimado, 0);
    const movsM = movimientos.filter(m => m.fecha.startsWith(mes));
    const gastReal = movsM.filter(m => m.categoria !== "Ingreso" && m.categoria !== "Transferencia").reduce((s, m) => s + Math.abs(m.monto), 0);
    const ingReal = movsM.filter(m => m.categoria === "Ingreso").reduce((s, m) => s + m.monto, 0);
    const exc = ingReal > 0 ? ingReal - gastReal : ing - gastosEst;
    return { mes, excedente: Math.max(0, exc) };
  });

  const total4m = excedentes.reduce((s, e) => s + e.excedente, 0);
  if (total4m <= 0) { wrap.style.display = "none"; return; }

  wrap.style.display = "";
  if (sub) sub.textContent = `Excedente 4 meses: ${formatMonto(total4m)}`;

  const orden = { "Alta": 0, "Media": 1, "Baja": 2 };
  const ordenadas = [...compras].sort((a, b) => (orden[a.urgencia] ?? 1) - (orden[b.urgencia] ?? 1) || a.montoDestinado - b.montoDestinado);

  let acum = 0;
  const sugerencias = [];
  for (const compra of ordenadas) {
    const monto = compra.montoDestinado || 0;
    if (monto === 0) { sugerencias.push({ compra, mes: excedentes[0].mes, nota: "Sin monto definido" }); continue; }
    let mesCompra = null;
    let acumLocal = 0;
    for (const e of excedentes) {
      acumLocal += e.excedente;
      if (acumLocal >= monto) { mesCompra = e.mes; break; }
    }
    if (mesCompra) sugerencias.push({ compra, mes: mesCompra });
  }

  if (sugerencias.length === 0) { wrap.style.display = "none"; return; }

  const URGENCIA_CFG = {
    "Alta":  { color: "var(--red)",   bg: "var(--red-soft)",   icon: "🔴" },
    "Media": { color: "var(--amber)", bg: "var(--amber-soft)", icon: "🟡" },
    "Baja":  { color: "var(--green)", bg: "var(--green-soft)", icon: "🟢" }
  };

  lista.innerHTML = `<div class="sugerencias-grid">` + sugerencias.map(({ compra, mes, nota }) => {
    const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long" });
    const urg = URGENCIA_CFG[compra.urgencia] || URGENCIA_CFG["Media"];
    return `<div class="sugerencia-chip">
      <span style="font-size:18px">${urg.icon}</span>
      <div class="sugerencia-info">
        <span class="sugerencia-nombre">${compra.concepto}</span>
        ${compra.montoDestinado > 0
          ? `<span class="sugerencia-monto">${formatMonto(compra.montoDestinado)}</span>`
          : `<span class="empty-hint">${nota}</span>`}
        <span class="sugerencia-mes">📅 ${mesLabel}</span>
      </div>
    </div>`;
  }).join("") + "</div>";
}

// =============================================
// TOPBAR: actualizar título según tab activa
// =============================================
const TAB_TITLES = {
  cajas: "Cuentas", movimientos: "Ingresos / Gastos", proyeccion: "Proyección",
  metas: "Metas", compras: "Compras", prestamos: "Préstamos", resumen: "Análisis"
};

function actualizarTopbarTitulo(tab) {
  const el = document.getElementById("topbar-title");
  if (el) el.textContent = TAB_TITLES[tab] || "";
}
