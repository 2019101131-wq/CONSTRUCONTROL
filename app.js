/**
 * CONSTRUCONTROL — Sistema Industrial de Control de Obras
 * Base de datos: JSONBin.io (REST API persistente)
 * Versión: 2.0
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   CONFIG & ESTADO GLOBAL
═══════════════════════════════════════════════════════ */
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';
let CFG = { apiKey: '', binId: '', nombreObra: '' };
let DB  = { cronograma: [], gastos: [], despacho: [], presupuesto: [] };
let syncTimer = null;
let isSyncing = false;
let pendingDelete = null;
let charts = {};

/* ═══════════════════════════════════════════════════════
   INICIALIZACIÓN
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  updateDate();
  setInterval(updateDate, 60000);
  loadConfig();
  if (CFG.apiKey && CFG.binId) {
    fetchDB();
  } else {
    showConfigModal();
    setStatus('offline', 'Sin configurar');
  }
});

function updateDate() {
  const d = new Date();
  const opts = { weekday:'short', year:'numeric', month:'short', day:'numeric' };
  document.getElementById('topbarDate').textContent = d.toLocaleDateString('es-PE', opts).toUpperCase();
}

/* ═══════════════════════════════════════════════════════
   PERSISTENCIA LOCAL (config solamente)
═══════════════════════════════════════════════════════ */
function loadConfig() {
  try {
    const raw = sessionStorage.getItem('cc_config');
    if (raw) CFG = JSON.parse(raw);
  } catch(e) {}
}

function persistConfig() {
  try {
    sessionStorage.setItem('cc_config', JSON.stringify(CFG));
  } catch(e) {}
}

/* ═══════════════════════════════════════════════════════
   JSONBIN.IO — CRUD CENTRALIZADO
═══════════════════════════════════════════════════════ */
async function fetchDB() {
  if (!CFG.apiKey || !CFG.binId) return;
  setStatus('syncing', 'Cargando...');
  showLoading('Cargando datos de la obra...');
  try {
    const res = await fetch(`${JSONBIN_BASE}/S/.{CFG.binId}/latest`, {
      headers: { 'X-Master-Key': CFG.apiKey }
    });
    if (!res.ok) throw new Error(`HTTP S/.{res.status}`);
    const json = await res.json();
    const record = json.record || {};
    DB.cronograma  = Array.isArray(record.cronograma)  ? record.cronograma  : [];
    DB.gastos      = Array.isArray(record.gastos)      ? record.gastos      : [];
    DB.despacho    = Array.isArray(record.despacho)    ? record.despacho    : [];
    DB.presupuesto = Array.isArray(record.presupuesto) ? record.presupuesto : [];
    if (record.nombreObra) CFG.nombreObra = record.nombreObra;
    setStatus('online', CFG.nombreObra || 'Conectado');
    renderAll();
    toast('success', 'CONECTADO', 'Datos sincronizados correctamente');
  } catch(err) {
    setStatus('offline', 'Error de conexión');
    toast('error', 'ERROR', 'No se pudo cargar la BD: ' + err.message);
  } finally {
    hideLoading();
  }
}

async function pushDB() {
  if (!CFG.apiKey || !CFG.binId) {
    toast('warn', 'SIN BD', 'Configura la base de datos primero');
    return;
  }
  if (isSyncing) return;
  isSyncing = true;
  setStatus('syncing', 'Guardando...');
  setSyncIndicator('active');
  try {
    const payload = {
      cronograma:  DB.cronograma,
      gastos:      DB.gastos,
      despacho:    DB.despacho,
      presupuesto: DB.presupuesto,
      nombreObra:  CFG.nombreObra,
      lastUpdate:  new Date().toISOString()
    };
    const res = await fetch(`S/.{JSONBIN_BASE}/S/.{CFG.binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': CFG.apiKey
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP S/.{res.status}`);
    setStatus('online', CFG.nombreObra || 'Conectado');
    setSyncIndicator('active');
  } catch(err) {
    setStatus('offline', 'Error al guardar');
    toast('error', 'ERROR BD', 'No se guardaron los cambios: ' + err.message);
    setSyncIndicator('error');
  } finally {
    isSyncing = false;
    setTimeout(() => setSyncIndicator(''), 2000);
  }
}

function schedulePush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushDB, 1200);
}

/* ═══════════════════════════════════════════════════════
   CONFIG MODAL
═══════════════════════════════════════════════════════ */
function showConfigModal() {
  document.getElementById('cfgApiKey').value     = CFG.apiKey     || '';
  document.getElementById('cfgBinId').value      = CFG.binId      || '';
  document.getElementById('cfgNombreObra').value = CFG.nombreObra || '';
  openModal('modal-config');
}

function saveConfig() {
  const apiKey    = document.getElementById('cfgApiKey').value.trim();
  const binId     = document.getElementById('cfgBinId').value.trim();
  const nombreObra = document.getElementById('cfgNombreObra').value.trim();
  if (!apiKey || !binId) {
    toast('warn', 'ATENCIÓN', 'API Key y BIN ID son obligatorios');
    return;
  }
  CFG = { apiKey, binId, nombreObra };
  persistConfig();
  closeModal('modal-config');
  fetchDB();
}

/* ═══════════════════════════════════════════════════════
   MÓDULO: CRONOGRAMA DE PAGOS
═══════════════════════════════════════════════════════ */
function saveCronograma() {
  const etapa = v('cro-etapa');
  const fecha = v('cro-fecha');
  const monto = parseFloat(v('cro-monto'));
  const estado = v('cro-estado');
  const obs   = v('cro-obs');
  const editId = v('cro-edit-id');

  if (!etapa || !fecha || isNaN(monto) || monto <= 0) {
    toast('warn', 'CAMPOS VACÍOS', 'Etapa, fecha y monto son obligatorios');
    return;
  }

  if (editId) {
    const idx = DB.cronograma.findIndex(r => r.id === editId);
    if (idx >= 0) {
      DB.cronograma[idx] = { ...DB.cronograma[idx], etapa, fecha, monto, estado, obs };
      toast('info', 'ACTUALIZADO', 'Pago modificado');
    }
  } else {
    DB.cronograma.push({ id: uid(), etapa, fecha, monto, estado, obs, createdAt: now() });
    toast('success', 'GUARDADO', 'Pago registrado correctamente');
  }

  closeModal('modal-cronograma');
  renderCronograma();
  renderDashboard();
  schedulePush();
}

function renderCronograma(filter = '') {
  const tbody = document.getElementById('tbodyCronograma');
  const filterEstado = document.getElementById('filterCronogramaEstado')?.value || '';
  const q = (filter || document.getElementById('filterCronograma')?.value || '').toLowerCase();

  let rows = DB.cronograma.filter(r => {
    const matchQ = !q || r.etapa.toLowerCase().includes(q) || (r.obs||'').toLowerCase().includes(q);
    const matchE = !filterEstado || r.estado === filterEstado;
    return matchQ && matchE;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📋</div>Sin registros</div></td></tr>`;
    renderCronogramaSummary();
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td class="row-num">S/.{i+1}</td>
      <td>S/.{r.etapa}</td>
      <td class="num">S/.{fmtDate(r.fecha)}</td>
      <td class="num">S/.{fmtMoney(r.monto)}</td>
      <td>S/.{badgeEstado(r.estado)}</td>
      <td>S/.{r.obs || '—'}</td>
      <td>
        <button class="tbl-btn tbl-btn-edit" onclick="editCronograma('S/.{r.id}')">EDITAR</button>
        <button class="tbl-btn tbl-btn-del"  onclick="confirmDelete('cronograma','S/.{r.id}')">ELIMINAR</button>
      </td>
    </tr>`).join('');

  renderCronogramaSummary();
}

function renderCronogramaSummary() {
  const total     = DB.cronograma.reduce((s,r) => s + r.monto, 0);
  const pagado    = DB.cronograma.filter(r => r.estado === 'PAGADO').reduce((s,r) => s + r.monto, 0);
  const pendiente = total - pagado;
  document.getElementById('cronogramaSummary').innerHTML = `
    <div class="sum-chip"><span class="sum-chip-label">Total Programado</span><span class="sum-chip-val">S/.{fmtMoney(total)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">Total Pagado</span><span class="sum-chip-val positive">S/.{fmtMoney(pagado)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">Pendiente</span><span class="sum-chip-val S/.{pendiente>0?'negative':''}">S/.{fmtMoney(pendiente)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">N° Pagos</span><span class="sum-chip-val">S/.{DB.cronograma.length}</span></div>`;
}

function editCronograma(id) {
  const r = DB.cronograma.find(x => x.id === id);
  if (!r) return;
  sv('cro-etapa', r.etapa);
  sv('cro-fecha', r.fecha);
  sv('cro-monto', r.monto);
  sv('cro-estado', r.estado);
  sv('cro-obs', r.obs || '');
  sv('cro-edit-id', r.id);
  document.getElementById('modalCronogramaTitle').textContent = '✏ EDITAR PAGO';
  openModal('modal-cronograma');
}

/* ═══════════════════════════════════════════════════════
   MÓDULO: GASTOS ADICIONALES
═══════════════════════════════════════════════════════ */
function calcPendienteGasto() {
  const costo   = parseFloat(v('gas-costo'))  || 0;
  const pagado  = parseFloat(v('gas-pagado')) || 0;
  document.getElementById('gas-pendiente').value = (costo - pagado).toFixed(2);
}

function saveGasto() {
  const fecha     = v('gas-fecha');
  const desc      = v('gas-desc');
  const costo     = parseFloat(v('gas-costo'));
  const fechaPago = v('gas-fechapago');
  const pagado    = parseFloat(v('gas-pagado')) || 0;
  const pendiente = costo - pagado;
  const editId    = v('gas-edit-id');

  if (!fecha || !desc || isNaN(costo) || costo <= 0) {
    toast('warn', 'CAMPOS VACÍOS', 'Fecha, descripción y costo son obligatorios');
    return;
  }

  if (editId) {
    const idx = DB.gastos.findIndex(r => r.id === editId);
    if (idx >= 0) {
      DB.gastos[idx] = { ...DB.gastos[idx], fecha, desc, costo, fechaPago, pagado, pendiente };
      toast('info', 'ACTUALIZADO', 'Gasto modificado');
    }
  } else {
    DB.gastos.push({ id: uid(), fecha, desc, costo, fechaPago, pagado, pendiente, createdAt: now() });
    toast('success', 'GUARDADO', 'Gasto registrado');
  }

  closeModal('modal-gastos');
  renderGastos();
  renderDashboard();
  schedulePush();
}

function renderGastos(filter = '') {
  const tbody = document.getElementById('tbodyGastos');
  const q = (filter || document.getElementById('filterGastos')?.value || '').toLowerCase();

  let rows = DB.gastos.filter(r => !q || r.desc.toLowerCase().includes(q));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">💰</div>Sin gastos registrados</div></td></tr>`;
    renderGastosSummary();
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td class="row-num">S/.{i+1}</td>
      <td class="num">S/.{fmtDate(r.fecha)}</td>
      <td>S/.{r.desc}</td>
      <td class="num">S/.{fmtMoney(r.costo)}</td>
      <td class="num">S/.{r.fechaPago ? fmtDate(r.fechaPago) : '—'}</td>
      <td class="num">S/.{fmtMoney(r.pagado)}</td>
      <td class="num S/.{r.pendiente>0?'over-cost':'under-cost'}">S/.{fmtMoney(r.pendiente)}</td>
      <td>
        <button class="tbl-btn tbl-btn-edit" onclick="editGasto('S/.{r.id}')">EDITAR</button>
        <button class="tbl-btn tbl-btn-del"  onclick="confirmDelete('gastos','S/.{r.id}')">ELIMINAR</button>
      </td>
    </tr>`).join('');

  renderGastosSummary();
}

function renderGastosSummary() {
  const total    = DB.gastos.reduce((s,r) => s + r.costo,     0);
  const pagado   = DB.gastos.reduce((s,r) => s + (r.pagado||0), 0);
  const pendiente = total - pagado;
  document.getElementById('gastosSummary').innerHTML = `
    <div class="sum-chip"><span class="sum-chip-label">Total Gastos</span><span class="sum-chip-val">S/.{fmtMoney(total)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">Pagado</span><span class="sum-chip-val positive">S/.{fmtMoney(pagado)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">Pendiente</span><span class="sum-chip-val S/.{pendiente>0?'negative':''}">S/.{fmtMoney(pendiente)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">N° Gastos</span><span class="sum-chip-val">S/.{DB.gastos.length}</span></div>`;
}

function editGasto(id) {
  const r = DB.gastos.find(x => x.id === id);
  if (!r) return;
  sv('gas-fecha', r.fecha);
  sv('gas-desc', r.desc);
  sv('gas-costo', r.costo);
  sv('gas-fechapago', r.fechaPago || '');
  sv('gas-pagado', r.pagado || 0);
  sv('gas-pendiente', r.pendiente || 0);
  sv('gas-edit-id', r.id);
  document.getElementById('modalGastosTitle').textContent = '✏ EDITAR GASTO';
  openModal('modal-gastos');
}

/* ═══════════════════════════════════════════════════════
   MÓDULO: DESPACHO DE MATERIALES
═══════════════════════════════════════════════════════ */
function calcTotalDespacho() {
  const cant  = parseFloat(v('des-cantidad')) || 0;
  const cunit = parseFloat(v('des-cunit'))    || 0;
  document.getElementById('des-ctotal').value = (cant * cunit).toFixed(2);
}

function saveDespacho() {
  const fecha    = v('des-fecha');
  const guia     = v('des-guia');
  const material = v('des-material');
  const unidad   = v('des-unidad');
  const cantidad = parseFloat(v('des-cantidad'));
  const cunit    = parseFloat(v('des-cunit'));
  const ctotal   = cantidad * cunit;
  const resp     = v('des-resp');
  const obs      = v('des-obs');
  const editId   = v('des-edit-id');

  if (!fecha || !guia || !material || isNaN(cantidad) || isNaN(cunit)) {
    toast('warn', 'CAMPOS VACÍOS', 'Fecha, guía, material, cantidad y costo son obligatorios');
    return;
  }

  if (editId) {
    const idx = DB.despacho.findIndex(r => r.id === editId);
    if (idx >= 0) {
      DB.despacho[idx] = { ...DB.despacho[idx], fecha, guia, material, unidad, cantidad, cunit, ctotal, resp, obs };
      toast('info', 'ACTUALIZADO', 'Despacho modificado');
    }
  } else {
    DB.despacho.push({ id: uid(), fecha, guia, material, unidad, cantidad, cunit, ctotal, resp, obs, createdAt: now() });
    toast('success', 'GUARDADO', 'Despacho registrado');
  }

  closeModal('modal-despacho');
  renderDespacho();
  renderBalance();
  renderDesviaciones();
  renderEstandar();
  renderDashboard();
  schedulePush();
}

function renderDespacho(filter = '') {
  const tbody = document.getElementById('tbodyDespacho');
  const q     = (filter || document.getElementById('filterDespacho')?.value || '').toLowerCase();
  const fIni  = document.getElementById('filterDespachoFechaIni')?.value || '';
  const fFin  = document.getElementById('filterDespachoFechaFin')?.value || '';

  let rows = DB.despacho.filter(r => {
    const matchQ = !q || r.material.toLowerCase().includes(q) || r.guia.toLowerCase().includes(q) || (r.resp||'').toLowerCase().includes(q);
    const matchFIni = !fIni || r.fecha >= fIni;
    const matchFFin = !fFin || r.fecha <= fFin;
    return matchQ && matchFIni && matchFFin;
  });

  rows.sort((a,b) => b.fecha.localeCompare(a.fecha));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="empty-state-icon">🏗</div>Sin despachos registrados</div></td></tr>`;
    renderDespachoSummary();
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td class="row-num">S/.{i+1}</td>
      <td class="num">S/.{fmtDate(r.fecha)}</td>
      <td><span style="font-family:var(--mono);font-size:11px">S/.{r.guia}</span></td>
      <td><strong>S/.{r.material}</strong></td>
      <td>S/.{r.unidad}</td>
      <td class="num">S/.{fmtNum(r.cantidad)}</td>
      <td class="num">S/.{fmtMoney(r.cunit)}</td>
      <td class="num"><strong>S/.{fmtMoney(r.ctotal)}</strong></td>
      <td>S/.{r.resp || '—'}</td>
      <td>S/.{r.obs || '—'}</td>
      <td>
        <button class="tbl-btn tbl-btn-edit" onclick="editDespacho('S/.{r.id}')">EDITAR</button>
        <button class="tbl-btn tbl-btn-del"  onclick="confirmDelete('despacho','S/.{r.id}')">ELIMINAR</button>
      </td>
    </tr>`).join('');

  renderDespachoSummary();
}

function renderDespachoSummary() {
  const total    = DB.despacho.reduce((s,r) => s + r.ctotal, 0);
  const guias    = new Set(DB.despacho.map(r => r.guia)).size;
  const materiales = new Set(DB.despacho.map(r => r.material.toLowerCase())).size;
  document.getElementById('despachoSummary').innerHTML = `
    <div class="sum-chip"><span class="sum-chip-label">Costo Total</span><span class="sum-chip-val">S/.{fmtMoney(total)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">N° Despachos</span><span class="sum-chip-val">S/.{DB.despacho.length}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">N° Guías</span><span class="sum-chip-val">S/.{guias}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">Materiales Distintos</span><span class="sum-chip-val">S/.{materiales}</span></div>`;
}

function editDespacho(id) {
  const r = DB.despacho.find(x => x.id === id);
  if (!r) return;
  sv('des-fecha',    r.fecha);
  sv('des-guia',     r.guia);
  sv('des-material', r.material);
  sv('des-unidad',   r.unidad);
  sv('des-cantidad', r.cantidad);
  sv('des-cunit',    r.cunit);
  sv('des-ctotal',   r.ctotal);
  sv('des-resp',     r.resp || '');
  sv('des-obs',      r.obs  || '');
  sv('des-edit-id',  r.id);
  document.getElementById('modalDespachoTitle').textContent = '✏ EDITAR DESPACHO';
  openModal('modal-despacho');
}

/* ═══════════════════════════════════════════════════════
   MÓDULO: BALANCE DE MATERIALES (auto-generado)
═══════════════════════════════════════════════════════ */
function renderBalance() {
  const tbody = document.getElementById('tbodyBalance');
  const q = (document.getElementById('filterBalance')?.value || '').toLowerCase();

  // Agrupar por material
  const map = {};
  DB.despacho.forEach(r => {
    const key = r.material.toLowerCase().trim();
    if (!map[key]) map[key] = { material: r.material, unidad: r.unidad, cantidad: 0, costo: 0, count: 0, cuniArr: [] };
    map[key].cantidad += r.cantidad;
    map[key].costo    += r.ctotal;
    map[key].count    += 1;
    map[key].cuniArr.push(r.cunit);
  });

  let rows = Object.values(map);
  if (q) rows = rows.filter(r => r.material.toLowerCase().includes(q));
  rows.sort((a,b) => b.costo - a.costo);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📦</div>Sin datos de despacho</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r, i) => {
    const cunitProm = r.costo / r.cantidad;
    return `<tr>
      <td class="row-num">S/.{i+1}</td>
      <td><strong>S/.{r.material}</strong></td>
      <td>S/.{r.unidad}</td>
      <td class="num">S/.{fmtNum(r.cantidad)}</td>
      <td class="num">S/.{fmtMoney(cunitProm)}</td>
      <td class="num"><strong>S/.{fmtMoney(r.costo)}</strong></td>
      <td class="num">S/.{r.count}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   MÓDULO: PRESUPUESTO DE MATERIALES
═══════════════════════════════════════════════════════ */
function calcValorStd() {
  const cant  = parseFloat(v('pre-cantidad')) || 0;
  const cunit = parseFloat(v('pre-cunit'))    || 0;
  document.getElementById('pre-valor').value = (cant * cunit).toFixed(2);
}

function savePresupuesto() {
  const piso      = v('pre-piso');
  const etapa     = v('pre-etapa');
  const categoria = v('pre-categoria');
  const material  = v('pre-material');
  const unidad    = v('pre-unidad');
  const cantidad  = parseFloat(v('pre-cantidad'));
  const cunit     = parseFloat(v('pre-cunit'));
  const valor     = cantidad * cunit;
  const editId    = v('pre-edit-id');

  if (!piso || !etapa || !material || isNaN(cantidad) || isNaN(cunit)) {
    toast('warn', 'CAMPOS VACÍOS', 'Todos los campos con * son obligatorios');
    return;
  }

  if (editId) {
    const idx = DB.presupuesto.findIndex(r => r.id === editId);
    if (idx >= 0) {
      DB.presupuesto[idx] = { ...DB.presupuesto[idx], piso, etapa, categoria, material, unidad, cantidad, cunit, valor };
      toast('info', 'ACTUALIZADO', 'Ítem modificado');
    }
  } else {
    DB.presupuesto.push({ id: uid(), piso, etapa, categoria, material, unidad, cantidad, cunit, valor, createdAt: now() });
    toast('success', 'GUARDADO', 'Ítem presupuesto registrado');
  }

  closeModal('modal-presupuesto');
  renderPresupuesto();
  renderDesviaciones();
  renderEstandar();
  renderDashboard();
  updatePisoFilter();
  schedulePush();
}

function renderPresupuesto(filter = '') {
  const tbody = document.getElementById('tbodyPresupuesto');
  const q     = (filter || document.getElementById('filterPresupuesto')?.value || '').toLowerCase();
  const piso  = document.getElementById('filterPresupuestoPiso')?.value || '';

  let rows = DB.presupuesto.filter(r => {
    const matchQ    = !q || r.material.toLowerCase().includes(q) || r.etapa.toLowerCase().includes(q) || r.piso.toLowerCase().includes(q);
    const matchPiso = !piso || r.piso === piso;
    return matchQ && matchPiso;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">📊</div>Sin ítems presupuestados</div></td></tr>`;
    renderPresupuestoSummary();
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td class="row-num">S/.{i+1}</td>
      <td><span class="badge badge-blue">S/.{r.piso}</span></td>
      <td>S/.{r.etapa}</td>
      <td>S/.{r.categoria}</td>
      <td><strong>S/.{r.material}</strong></td>
      <td>S/.{r.unidad}</td>
      <td class="num">S/.{fmtNum(r.cantidad)}</td>
      <td class="num">S/.{fmtMoney(r.cunit)}</td>
      <td class="num"><strong>S/.{fmtMoney(r.valor)}</strong></td>
      <td>
        <button class="tbl-btn tbl-btn-edit" onclick="editPresupuesto('S/.{r.id}')">EDITAR</button>
        <button class="tbl-btn tbl-btn-del"  onclick="confirmDelete('presupuesto','S/.{r.id}')">ELIMINAR</button>
      </td>
    </tr>`).join('');

  renderPresupuestoSummary();
}

function renderPresupuestoSummary() {
  const total    = DB.presupuesto.reduce((s,r) => s + r.valor, 0);
  const pisos    = new Set(DB.presupuesto.map(r => r.piso)).size;
  const etapas   = new Set(DB.presupuesto.map(r => r.etapa)).size;
  document.getElementById('presupuestoSummary').innerHTML = `
    <div class="sum-chip"><span class="sum-chip-label">Valor Total STD</span><span class="sum-chip-val">S/.{fmtMoney(total)}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">N° Ítems</span><span class="sum-chip-val">S/.{DB.presupuesto.length}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">Pisos</span><span class="sum-chip-val">S/.{pisos}</span></div>
    <div class="sum-chip"><span class="sum-chip-label">Etapas</span><span class="sum-chip-val">S/.{etapas}</span></div>`;
}

function updatePisoFilter() {
  const sel = document.getElementById('filterPresupuestoPiso');
  if (!sel) return;
  const pisos = [...new Set(DB.presupuesto.map(r => r.piso))].sort();
  const current = sel.value;
  sel.innerHTML = `<option value="">Todos los pisos</option>` + pisos.map(p => `<option value="S/.{p}">S/.{p}</option>`).join('');
  sel.value = current;
}

function editPresupuesto(id) {
  const r = DB.presupuesto.find(x => x.id === id);
  if (!r) return;
  sv('pre-piso',      r.piso);
  sv('pre-etapa',     r.etapa);
  sv('pre-categoria', r.categoria);
  sv('pre-material',  r.material);
  sv('pre-unidad',    r.unidad);
  sv('pre-cantidad',  r.cantidad);
  sv('pre-cunit',     r.cunit);
  sv('pre-valor',     r.valor);
  sv('pre-edit-id',   r.id);
  document.getElementById('modalPresupuestoTitle').textContent = '✏ EDITAR ÍTEM PRESUPUESTO';
  openModal('modal-presupuesto');
}

/* ═══════════════════════════════════════════════════════
   MÓDULO: ANÁLISIS DE DESVIACIONES
═══════════════════════════════════════════════════════ */
function renderDesviaciones() {
  const tbody = document.getElementById('tbodyDesviaciones');
  const q = (document.getElementById('filterDesviaciones')?.value || '').toLowerCase();

  const realMap = buildRealMap();
  const stdMap  = buildStdMap();

  // Unión de materiales
  const allMats = new Set([...Object.keys(stdMap), ...Object.keys(realMap)]);
  let rows = [];

  allMats.forEach(key => {
    const std  = stdMap[key]  || { material: key, unidad: '—', cantidad: 0, valor: 0, cunit: 0 };
    const real = realMap[key] || { cantidad: 0, costo: 0 };

    const desvCant  = real.cantidad - std.cantidad;
    const pctDesv   = std.cantidad ? (desvCant / std.cantidad * 100) : (real.cantidad ? 100 : 0);
    const valorStd  = std.valor;
    const valorReal = real.costo;
    const desvEcon  = valorReal - valorStd;

    rows.push({ material: std.material, unidad: std.unidad, cantStd: std.cantidad, cantReal: real.cantidad, desvCant, pctDesv, valorStd, valorReal, desvEcon });
  });

  if (q) rows = rows.filter(r => r.material.toLowerCase().includes(q));
  rows.sort((a,b) => b.desvEcon - a.desvEcon);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">📈</div>Registra presupuesto y despachos para ver desviaciones</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const estado = desvEstado(r.pctDesv);
    return `<tr>
      <td><strong>S/.{r.material}</strong></td>
      <td>S/.{r.unidad}</td>
      <td class="num">S/.{fmtNum(r.cantStd)}</td>
      <td class="num">S/.{fmtNum(r.cantReal)}</td>
      <td class="num S/.{r.desvCant>0?'over-cost':r.desvCant<0?'under-cost':''}">S/.{fmtNum(r.desvCant)}</td>
      <td class="num S/.{r.pctDesv>0?'over-cost':r.pctDesv<0?'under-cost':''}">S/.{r.pctDesv.toFixed(1)}%</td>
      <td class="num">S/.{fmtMoney(r.valorStd)}</td>
      <td class="num">S/.{fmtMoney(r.valorReal)}</td>
      <td class="num S/.{r.desvEcon>0?'over-cost':r.desvEcon<0?'under-cost':''}">S/.{fmtMoney(r.desvEcon)}</td>
      <td>S/.{estado}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   MÓDULO: CONTROL SOBRE/SUB ESTÁNDAR
═══════════════════════════════════════════════════════ */
function renderEstandar() {
  const tbody = document.getElementById('tbodyEstandar');
  const realMap = buildRealMap();
  const stdMap  = buildStdMap();
  const allMats = new Set([...Object.keys(stdMap), ...Object.keys(realMap)]);

  let sobre = 0, bajo = 0, sobreEcon = 0, bajoEcon = 0;
  let rows = [];

  allMats.forEach(key => {
    const std  = stdMap[key]  || { material: key, unidad: '—', cantidad: 0, valor: 0 };
    const real = realMap[key] || { cantidad: 0, costo: 0 };

    const diff      = real.cantidad - std.cantidad;
    const diffEcon  = real.costo - std.valor;
    const pct       = std.cantidad ? (diff / std.cantidad * 100) : (real.cantidad ? 100 : 0);
    const tipo      = diff > 0 ? 'SOBRECONSUMO' : diff < 0 ? 'SUBCONSUMO' : 'ESTÁNDAR';
    const efic      = eficiencia(pct);

    if (diff > 0) { sobre++; sobreEcon += diffEcon; }
    else if (diff < 0) { bajo++; bajoEcon += Math.abs(diffEcon); }

    rows.push({ material: std.material, tipo, cantStd: std.cantidad, cantReal: real.cantidad, diff, diffEcon, pct, efic });
  });

  // Summary cards
  document.getElementById('estandarSummary').innerHTML = `
    <div class="est-card over">
      <div class="est-card-label">MATERIALES CON SOBRECONSUMO</div>
      <div class="est-card-val">S/.{sobre}</div>
    </div>
    <div class="est-card under">
      <div class="est-card-label">MATERIALES CON SUBCONSUMO</div>
      <div class="est-card-val">S/.{bajo}</div>
    </div>
    <div class="est-card S/.{sobreEcon>0?'over':'ok'}">
      <div class="est-card-label">IMPACTO ECONÓMICO TOTAL</div>
      <div class="est-card-val">S/.{fmtMoney(sobreEcon - bajoEcon)}</div>
    </div>`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">⚖</div>Sin datos para analizar</div></td></tr>`;
    return;
  }

  rows.sort((a,b) => b.diffEcon - a.diffEcon);

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>S/.{r.material}</strong></td>
      <td>S/.{tipoBadge(r.tipo)}</td>
      <td class="num">S/.{fmtNum(r.cantStd)}</td>
      <td class="num">S/.{fmtNum(r.cantReal)}</td>
      <td class="num S/.{r.diff>0?'over-cost':r.diff<0?'under-cost':''}">S/.{fmtNum(r.diff)}</td>
      <td class="num S/.{r.diffEcon>0?'over-cost':r.diffEcon<0?'under-cost':''}">S/.{fmtMoney(r.diffEcon)}</td>
      <td class="num">S/.{r.pct.toFixed(1)}%</td>
      <td>S/.{r.efic}</td>
    </tr>`).join('');
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════ */
function renderDashboard() {
  // KPIs
  const totalEstimado  = DB.presupuesto.reduce((s,r) => s + r.valor, 0);
  const totalMateriales = DB.despacho.reduce((s,r) => s + r.ctotal, 0);
  const totalPagos     = DB.cronograma.reduce((s,r) => s + r.monto, 0);
  const totalGastos    = DB.gastos.reduce((s,r) => s + r.costo, 0);
  const totalReal      = totalMateriales + totalGastos;
  const pagado         = DB.cronograma.filter(r => r.estado === 'PAGADO').reduce((s,r) => s + r.monto, 0);
  const pendiente      = DB.cronograma.filter(r => r.estado !== 'PAGADO').reduce((s,r) => s + r.monto, 0) +
                         DB.gastos.reduce((s,r) => s + (r.pendiente||0), 0);
  const desviacion     = totalReal - totalEstimado;

  // Avance: % de pagos PAGADO
  const avance = totalPagos > 0 ? Math.round(pagado / totalPagos * 100) : 0;

  setText('kpi-estimado',  fmtMoney(totalEstimado));
  setText('kpi-real',      fmtMoney(totalReal));
  setText('kpi-pendiente', fmtMoney(pendiente));
  setText('kpi-avance',    avance + '%');
  setText('kpi-materiales',fmtMoney(totalMateriales));
  setText('kpi-desviacion',fmtMoney(desviacion));

  document.getElementById('kpi-desviacion').closest('.kpi-card').querySelector('.kpi-value').style.color =
    desviacion > 0 ? 'var(--red)' : desviacion < 0 ? 'var(--green)' : '';

  // Alerts
  renderAlerts(pendiente, desviacion, totalEstimado);

  // Charts
  renderCharts(totalEstimado, totalMateriales, totalGastos);

  // Mini tables
  renderDashPagos();
  renderDashDespachos();
}

function renderAlerts(pendiente, desviacion, totalEstimado) {
  const sec = document.getElementById('alertsSection');
  const alerts = [];

  if (!CFG.apiKey || !CFG.binId) {
    alerts.push({ type:'error', msg:'⚠ Base de datos no configurada. Haz clic en "CONFIGURAR BD" para comenzar.' });
  }
  if (pendiente > 0) {
    alerts.push({ type:'warn', msg:`💳 Hay S/.{fmtMoney(pendiente)} pendientes de pago en cronograma y gastos.` });
  }
  if (totalEstimado > 0 && desviacion / totalEstimado > 0.1) {
    alerts.push({ type:'error', msg:`🔴 Sobrecoste del S/.{(desviacion/totalEstimado*100).toFixed(1)}% vs presupuesto (S/.{fmtMoney(desviacion)}).` });
  } else if (totalEstimado > 0 && desviacion / totalEstimado > 0.05) {
    alerts.push({ type:'warn', msg:`🟡 Desviación moderada: S/.{(desviacion/totalEstimado*100).toFixed(1)}% sobre el presupuesto.` });
  } else if (totalEstimado > 0) {
    alerts.push({ type:'ok', msg:`✅ Costos dentro del estándar presupuestado.` });
  }
  if (DB.cronograma.length === 0 && DB.presupuesto.length === 0) {
    alerts.push({ type:'info', msg:'ℹ Comienza registrando el presupuesto y el cronograma de pagos de la obra.' });
  }

  sec.innerHTML = alerts.map(a => `<div class="alert-item alert-S/.{a.type === 'info' ? 'ok' : a.type}">S/.{a.msg}</div>`).join('');
}

function renderCharts(totalEstimado, totalMateriales, totalGastos) {
  const totalReal = totalMateriales + totalGastos;

  // Donut — distribución costos
  const ctx1 = document.getElementById('chartCostos');
  if (charts.costos) charts.costos.destroy();
  charts.costos = new Chart(ctx1, {
    type: 'doughnut',
    data: {
      labels: ['Materiales', 'Gastos Adicionales', 'Presupuesto Base'],
      datasets: [{ data: [totalMateriales, totalGastos, Math.max(0, totalEstimado - totalReal)],
        backgroundColor: ['#0052cc','#e06800','#e2e8f0'],
        borderWidth: 0, hoverOffset: 6 }]
    },
    options: { plugins: { legend: { position:'bottom', labels: { font: { family:'IBM Plex Mono', size:10 }, padding:10 } } }, cutout:'65%' }
  });

  // Donut — pagos
  const pagado   = DB.cronograma.filter(r => r.estado==='PAGADO').reduce((s,r)=>s+r.monto,0);
  const parcial  = DB.cronograma.filter(r => r.estado==='PARCIAL').reduce((s,r)=>s+r.monto,0);
  const pendCro  = DB.cronograma.filter(r => r.estado==='PENDIENTE').reduce((s,r)=>s+r.monto,0);
  const ctx2 = document.getElementById('chartPagos');
  if (charts.pagos) charts.pagos.destroy();
  charts.pagos = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['Pagado', 'Parcial', 'Pendiente'],
      datasets: [{ data: [pagado, parcial, pendCro],
        backgroundColor: ['#1a7f37','#b45309','#c0392b'],
        borderWidth: 0, hoverOffset: 6 }]
    },
    options: { plugins: { legend: { position:'bottom', labels:{ font:{family:'IBM Plex Mono',size:10}, padding:10 } } }, cutout:'65%' }
  });

  // Bar — Top 8 materiales
  const matMap = {};
  DB.despacho.forEach(r => {
    const k = r.material;
    matMap[k] = (matMap[k]||0) + r.ctotal;
  });
  const sorted = Object.entries(matMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const ctx3 = document.getElementById('chartMateriales');
  if (charts.materiales) charts.materiales.destroy();
  charts.materiales = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: sorted.map(e=>e[0]),
      datasets: [{ label:'Costo Total', data: sorted.map(e=>e[1]),
        backgroundColor: '#0052cc', borderRadius: 2 }]
    },
    options: {
      plugins: { legend: { display:false } },
      scales: {
        y: { ticks: { font:{family:'IBM Plex Mono',size:9}, callback: v => 'S/.'+fmtK(v) }, grid: { color:'#e4e7ec' } },
        x: { ticks: { font:{family:'IBM Plex Mono',size:9} }, grid: { display:false } }
      }
    }
  });
}

function renderDashPagos() {
  const tbody = document.getElementById('dashPagosTbody');
  const rows = [...DB.cronograma].sort((a,b) => b.fecha?.localeCompare(a.fecha)).slice(0,6);
  if (!rows.length) { tbody.innerHTML=`<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:12px;font-size:11px">Sin pagos</td></tr>`; return; }
  tbody.innerHTML = rows.map(r=>`
    <tr><td>S/.{r.etapa}</td><td class="num">S/.{fmtMoney(r.monto)}</td><td>S/.{badgeEstado(r.estado)}</td></tr>`).join('');
}

function renderDashDespachos() {
  const tbody = document.getElementById('dashDespachosTbody');
  const rows = [...DB.despacho].sort((a,b)=>b.fecha?.localeCompare(a.fecha)).slice(0,6);
  if (!rows.length) { tbody.innerHTML=`<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:12px;font-size:11px">Sin despachos</td></tr>`; return; }
  tbody.innerHTML = rows.map(r=>`
    <tr><td>S/.{r.material}</td><td class="num">S/.{fmtNum(r.cantidad)} S/.{r.unidad}</td><td class="num">S/.{fmtMoney(r.ctotal)}</td></tr>`).join('');
}

/* ═══════════════════════════════════════════════════════
   RENDER ALL
═══════════════════════════════════════════════════════ */
function renderAll() {
  renderDashboard();
  renderCronograma();
  renderGastos();
  renderDespacho();
  renderBalance();
  renderPresupuesto();
  renderDesviaciones();
  renderEstandar();
  updatePisoFilter();
}

/* ═══════════════════════════════════════════════════════
   DELETE / CONFIRM
═══════════════════════════════════════════════════════ */
function confirmDelete(collection, id) {
  pendingDelete = { collection, id };
  document.getElementById('confirmMsg').textContent =
    `¿Seguro que deseas eliminar este registro de "S/.{collection}"? Esta acción no se puede deshacer.`;
  document.getElementById('confirmBtn').onclick = executeDelete;
  openModal('modal-confirm');
}

function executeDelete() {
  if (!pendingDelete) return;
  const { collection, id } = pendingDelete;
  DB[collection] = DB[collection].filter(r => r.id !== id);
  pendingDelete  = null;
  closeModal('modal-confirm');
  toast('info', 'ELIMINADO', 'Registro eliminado correctamente');
  renderAll();
  schedulePush();
}

/* ═══════════════════════════════════════════════════════
   FILTROS
═══════════════════════════════════════════════════════ */
function filterTable(mod) {
  switch(mod) {
    case 'cronograma':  renderCronograma();  break;
    case 'gastos':      renderGastos();      break;
    case 'despacho':    renderDespacho();    break;
    case 'presupuesto': renderPresupuesto(); break;
  }
}

/* ═══════════════════════════════════════════════════════
   EXPORTAR A EXCEL
═══════════════════════════════════════════════════════ */
function exportToExcel(mod) {
  let data = [];
  let sheetName = mod.toUpperCase();

  switch(mod) {
    case 'cronograma':
      data = DB.cronograma.map(r => ({ Etapa: r.etapa, Fecha: r.fecha, Monto: r.monto, Estado: r.estado, Observaciones: r.obs }));
      break;
    case 'gastos':
      data = DB.gastos.map(r => ({ Fecha: r.fecha, Descripcion: r.desc, Costo: r.costo, FechaPago: r.fechaPago, Pagado: r.pagado, Pendiente: r.pendiente }));
      break;
    case 'despacho':
      data = DB.despacho.map(r => ({ Fecha: r.fecha, Guia: r.guia, Material: r.material, Unidad: r.unidad, Cantidad: r.cantidad, CostoUnit: r.cunit, CostoTotal: r.ctotal, Responsable: r.resp, Observaciones: r.obs }));
      break;
    case 'balance': {
      const map = {};
      DB.despacho.forEach(r => {
        const k = r.material.toLowerCase();
        if (!map[k]) map[k] = { Material: r.material, Unidad: r.unidad, Cantidad: 0, Costo: 0, Despachos: 0 };
        map[k].Cantidad += r.cantidad; map[k].Costo += r.ctotal; map[k].Despachos++;
      });
      data = Object.values(map).sort((a,b) => b.Costo - a.Costo);
      break;
    }
    case 'presupuesto':
      data = DB.presupuesto.map(r => ({ Piso: r.piso, Etapa: r.etapa, Categoria: r.categoria, Material: r.material, Unidad: r.unidad, CantSTD: r.cantidad, CostoUnit: r.cunit, ValorSTD: r.valor }));
      break;
    case 'desviaciones':
    case 'estandar': {
      const realMap = buildRealMap();
      const stdMap  = buildStdMap();
      const allMats = new Set([...Object.keys(stdMap), ...Object.keys(realMap)]);
      allMats.forEach(key => {
        const std  = stdMap[key]  || { material:key, cantidad:0, valor:0 };
        const real = realMap[key] || { cantidad:0, costo:0 };
        data.push({
          Material: std.material,
          CantSTD: std.cantidad, CantReal: real.cantidad,
          DesvCant: real.cantidad - std.cantidad,
          PctDesv: std.cantidad ? ((real.cantidad-std.cantidad)/std.cantidad*100).toFixed(1)+'%' : '—',
          ValorSTD: std.valor, ValorReal: real.costo,
          DesvEcon: real.costo - std.valor
        });
      });
      break;
    }
  }

  if (!data.length) { toast('warn', 'SIN DATOS', 'No hay datos para exportar'); return; }

  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `CONSTRUCONTROL_S/.{sheetName}_S/.{dateFn()}.xlsx`);
    toast('success', 'EXPORTADO', 'Archivo Excel descargado');
  } catch(e) {
    toast('error', 'ERROR', 'No se pudo exportar: ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════
   HELPER: BUILDS
═══════════════════════════════════════════════════════ */
function buildRealMap() {
  const map = {};
  DB.despacho.forEach(r => {
    const key = r.material.toLowerCase().trim();
    if (!map[key]) map[key] = { cantidad: 0, costo: 0 };
    map[key].cantidad += r.cantidad;
    map[key].costo    += r.ctotal;
  });
  return map;
}

function buildStdMap() {
  const map = {};
  DB.presupuesto.forEach(r => {
    const key = r.material.toLowerCase().trim();
    if (!map[key]) map[key] = { material: r.material, unidad: r.unidad, cantidad: 0, valor: 0, cunit: r.cunit };
    map[key].cantidad += r.cantidad;
    map[key].valor    += r.valor;
  });
  return map;
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════ */
function showModule(name) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const mod  = document.getElementById('mod-'+name);
  const nav  = document.querySelector(`[data-module="S/.{name}"]`);
  if (mod) mod.classList.add('active');
  if (nav) nav.classList.add('active');
  const titles = {
    dashboard:'Dashboard General', cronograma:'Cronograma de Pagos', gastos:'Gastos Adicionales',
    despacho:'Despacho de Materiales', balance:'Balance de Materiales', presupuesto:'Presupuesto de Materiales',
    desviaciones:'Análisis de Desviaciones', estandar:'Control Sobre/Sub Estándar'
  };
  document.getElementById('topbarTitle').textContent = titles[name] || name;
  window.scrollTo(0,0);
}

/* ═══════════════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════════════ */
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Reset edit ids and titles on fresh opens
  if (id === 'modal-cronograma') {
    const editId = document.getElementById('cro-edit-id');
    if (editId && !editId.dataset.keepValue) {
      clearForm(['cro-etapa','cro-fecha','cro-monto','cro-obs','cro-edit-id']);
      sv('cro-estado','PENDIENTE');
      document.getElementById('modalCronogramaTitle').textContent = '+ NUEVO PAGO';
    }
    editId && delete editId.dataset.keepValue;
  }
  if (id === 'modal-gastos') {
    const editId = document.getElementById('gas-edit-id');
    if (editId && !editId.dataset.keepValue) {
      clearForm(['gas-fecha','gas-desc','gas-costo','gas-fechapago','gas-pagado','gas-pendiente','gas-edit-id']);
      document.getElementById('modalGastosTitle').textContent = '+ NUEVO GASTO ADICIONAL';
    }
    editId && delete editId.dataset.keepValue;
  }
  if (id === 'modal-despacho') {
    const editId = document.getElementById('des-edit-id');
    if (editId && !editId.dataset.keepValue) {
      clearForm(['des-fecha','des-guia','des-material','des-cantidad','des-cunit','des-ctotal','des-resp','des-obs','des-edit-id']);
      document.getElementById('modalDespachoTitle').textContent = '+ NUEVO DESPACHO DE MATERIAL';
    }
    editId && delete editId.dataset.keepValue;
  }
  if (id === 'modal-presupuesto') {
    const editId = document.getElementById('pre-edit-id');
    if (editId && !editId.dataset.keepValue) {
      clearForm(['pre-piso','pre-etapa','pre-categoria','pre-material','pre-cantidad','pre-cunit','pre-valor','pre-edit-id']);
      document.getElementById('modalPresupuestoTitle').textContent = '+ NUEVO ÍTEM PRESUPUESTO';
    }
    editId && delete editId.dataset.keepValue;
  }
  el.classList.add('open');
}

// Override edits to set keepValue flag before opening
const _editCro = editCronograma;
window.editCronograma = function(id) {
  const el = document.getElementById('cro-edit-id');
  if (el) el.dataset.keepValue = '1';
  _editCro(id);
  openModal('modal-cronograma');
};
const _editGas = editGasto;
window.editGasto = function(id) {
  const el = document.getElementById('gas-edit-id');
  if (el) el.dataset.keepValue = '1';
  _editGas(id);
  openModal('modal-gastos');
};
const _editDes = editDespacho;
window.editDespacho = function(id) {
  const el = document.getElementById('des-edit-id');
  if (el) el.dataset.keepValue = '1';
  _editDes(id);
  openModal('modal-despacho');
};
const _editPre = editPresupuesto;
window.editPresupuesto = function(id) {
  const el = document.getElementById('pre-edit-id');
  if (el) el.dataset.keepValue = '1';
  _editPre(id);
  openModal('modal-presupuesto');
};

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ═══════════════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════════════ */
function setStatus(state, text) {
  const dot  = document.getElementById('statusDot');
  const txt  = document.getElementById('statusText');
  dot.className = 'status-dot ' + state;
  txt.textContent = text;
}

function setSyncIndicator(state) {
  const el = document.getElementById('syncIndicator');
  el.className = 'sync-indicator' + (state ? ' '+state : '');
  el.textContent = state === 'active' ? '● SYNC OK' : state === 'error' ? '● SYNC ERR' : '● SYNC';
}

function showLoading(text='') {
  const el = document.getElementById('loadingOverlay');
  document.getElementById('loadingText').textContent = text || 'CARGANDO...';
  el.classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

function toast(type, title, msg) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-S/.{type}`;
  t.innerHTML = `<div class="toast-title">S/.{title}</div><div class="toast-msg">S/.{msg}</div>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(20px)'; t.style.transition='0.3s'; setTimeout(()=>t.remove(),300); }, 3500);
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 800) {
    sb.classList.toggle('mobile-open');
  } else {
    sb.classList.toggle('hidden');
  }
}

/* ═══════════════════════════════════════════════════════
   FORMATTING HELPERS
═══════════════════════════════════════════════════════ */
function fmtMoney(n) {
  if (isNaN(n)) return 'S/.0.00';
  return 'S/.' + Number(n).toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtNum(n) {
  if (isNaN(n)) return '0';
  return Number(n).toLocaleString('es-PE', { maximumFractionDigits:3 });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y,m,dy] = d.split('-');
  return `S/.{dy}/S/.{m}/S/.{y}`;
}

function fmtK(v) {
  if (v >= 1000000) return (v/1000000).toFixed(1)+'M';
  if (v >= 1000)    return (v/1000).toFixed(0)+'K';
  return v;
}

function dateFn() {
  const d = new Date();
  return `S/.{d.getFullYear()}S/.{String(d.getMonth()+1).padStart(2,'0')}S/.{String(d.getDate()).padStart(2,'0')}`;
}

function now() { return new Date().toISOString(); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function v(id)  { const el = document.getElementById(id); return el ? el.value : ''; }
function sv(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function clearForm(ids) { ids.forEach(id => { const el = document.getElementById(id); if(el) el.value=''; }); }

function badgeEstado(estado) {
  const map = { PAGADO:'badge-green', PENDIENTE:'badge-red', PARCIAL:'badge-yellow' };
  return `<span class="badge S/.{map[estado]||'badge-gray'}">S/.{estado}</span>`;
}

function desvEstado(pct) {
  if (pct <= 5)  return `<span class="badge badge-green">NORMAL</span>`;
  if (pct <= 15) return `<span class="badge badge-yellow">MODERADO</span>`;
  return `<span class="badge badge-red">CRÍTICO</span>`;
}

function tipoBadge(tipo) {
  const map = { SOBRECONSUMO:'badge-red', SUBCONSUMO:'badge-green', 'ESTÁNDAR':'badge-blue' };
  return `<span class="badge S/.{map[tipo]||'badge-gray'}">S/.{tipo}</span>`;
}

function eficiencia(pct) {
  if (Math.abs(pct) <= 5)  return `<span class="badge badge-green">● ÓPTIMO</span>`;
  if (Math.abs(pct) <= 15) return `<span class="badge badge-yellow">● MODERADO</span>`;
  return `<span class="badge badge-red">● CRÍTICO</span>`;
}
