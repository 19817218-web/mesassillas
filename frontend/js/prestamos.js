const admin = Session.user.rol === 'ADMIN';
let lista = [];
let usuarios = [];
let confirmadas = [];

function pintar() {
  const tb = document.getElementById('tbody');
  tb.innerHTML = lista.length ? lista.map((p) => {
    const pend = p.pendientes_mesas + p.pendientes_sillas;
    return `<tr class="${p.estado === 'VENCIDO' ? 'row-vencido' : ''}">
      <td>#${p.id}${p.reserva_id ? `<div class="small text-muted">Reserva #${p.reserva_id}</div>` : ''}</td>
      ${admin ? `<td>${esc(p.usuario_nombre)}</td>` : ''}
      <td class="text-nowrap small">${fmtFechaHora(p.fecha_prestamo)}</td>
      <td class="text-nowrap small ${p.estado === 'VENCIDO' ? 'text-danger fw-semibold' : ''}">${fmtFechaHora(p.fecha_prevista_devolucion)}</td>
      <td>${p.cantidad_mesas} / ${p.cantidad_sillas}</td>
      <td>${p.pendientes_mesas} / ${p.pendientes_sillas}</td>
      <td>${badge(p.estado)}</td>
      <td><div class="d-flex gap-1 justify-content-end">
        <button class="btn btn-sm btn-outline-secondary btn-icon" title="Detalle" data-a="ver" data-id="${p.id}"><i class="bi bi-eye"></i></button>
        ${admin && p.estado !== 'DEVUELTO' ? `<button class="btn btn-sm btn-outline-primary btn-icon" title="Modificar" data-a="editar" data-id="${p.id}"><i class="bi bi-pencil"></i></button>` : ''}
        ${admin && pend > 0 ? `<a class="btn btn-sm btn-success btn-icon" title="Registrar devolución" href="devoluciones.html?prestamo=${p.id}"><i class="bi bi-arrow-return-left"></i></a>` : ''}
      </div></td></tr>`;
  }).join('') : Layout.vacio(admin ? 8 : 7, 'No hay préstamos con esos filtros', 'arrow-left-right');
}

async function cargar() {
  try {
    lista = await api('/prestamos', { params: { q: document.getElementById('fQ').value.trim(), estado: document.getElementById('fEstado').value } });
    pintar();
  } catch (e) { Layout.toast(e.message, 'error'); }
}

/* ---------- nuevo préstamo ---------- */
function modoOrigen() {
  const f = document.getElementById('formPre');
  const desdeReserva = f.origen.value === 'reserva';
  document.getElementById('boxReserva').classList.toggle('d-none', !desdeReserva);
  document.getElementById('boxDirecto').classList.toggle('d-none', desdeReserva);
  f.reserva_id.required = desdeReserva;
  f.usuario_id.required = !desdeReserva;
  if (desdeReserva) mostrarResumenReserva();
}

function mostrarResumenReserva() {
  const f = document.getElementById('formPre');
  const r = confirmadas.find((x) => x.id === Number(f.reserva_id.value));
  document.getElementById('resumenReserva').textContent = r
    ? `${r.usuario_nombre} · ${fmtFecha(r.fecha)} ${fmtHora(r.hora_inicio)}-${fmtHora(r.hora_fin)} · ${r.cantidad_mesas} mesas, ${r.cantidad_sillas} sillas`
    : 'No hay reservas confirmadas pendientes de entrega';
}

async function abrirNuevo(reservaId) {
  const f = document.getElementById('formPre');
  f.reset(); f.classList.remove('was-validated');
  [usuarios, confirmadas] = await Promise.all([
    usuarios.length ? usuarios : Layout.ejecutar(() => api('/usuarios')),
    api('/reservas', { params: { estado: 'CONFIRMADA' } }).catch(() => []),
  ]);
  usuarios = usuarios || [];
  confirmadas = confirmadas.filter((r) => !r.prestamo_id);
  f.reserva_id.innerHTML = confirmadas.map((r) => `<option value="${r.id}">#${r.id} · ${esc(r.usuario_nombre)} · ${fmtFecha(r.fecha)}</option>`).join('');
  f.usuario_id.innerHTML = usuarios.filter((u) => u.activo).map((u) => `<option value="${u.id}">${esc(u.nombre)} (${esc(u.email)})</option>`).join('');
  f.origen.value = reservaId || confirmadas.length ? 'reserva' : 'directo';
  if (reservaId) f.reserva_id.value = String(reservaId);
  const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(18, 0, 0, 0);
  f.fecha_prevista.value = aInputLocal(d);
  f.fecha_prevista.min = aInputLocal(new Date());
  modoOrigen();
  Layout.modal('modalPre').show();
}

async function guardarNuevo(e) {
  e.preventDefault();
  const f = e.target;
  f.classList.add('was-validated');
  const reserva = f.origen.value === 'reserva';
  const m = Number(f.cantidad_mesas.value); const s = Number(f.cantidad_sillas.value);
  document.getElementById('errCantPre').classList.toggle('d-none', reserva || m > 0 || s > 0);
  if (!f.checkValidity() || (!reserva && !(m > 0 || s > 0))) return;
  if (new Date(f.fecha_prevista.value) < new Date()) return Layout.toast('La fecha prevista de devolución no puede estar en el pasado', 'error');
  const body = { fecha_prevista_devolucion: new Date(f.fecha_prevista.value).toISOString(), observaciones: f.observaciones.value.trim() };
  if (reserva) body.reserva_id = Number(f.reserva_id.value);
  else Object.assign(body, { usuario_id: Number(f.usuario_id.value), cantidad_mesas: m, cantidad_sillas: s });
  const ok = await Layout.ejecutar(() => api('/prestamos', { method: 'POST', body }), 'Préstamo registrado');
  if (ok) { Layout.modal('modalPre').hide(); cargar(); }
}

/* ---------- detalle / edición ---------- */
async function ver(id) {
  const p = await Layout.ejecutar(() => api(`/prestamos/${id}`));
  if (!p) return;
  const filas = p.detalle.map((d) => `<tr><td>${d.tipo === 'MESA' ? 'Mesas' : 'Sillas'}</td><td>${d.cantidad_prestada}</td><td>${d.cantidad_devuelta}</td><td class="fw-semibold">${d.cantidad_pendiente}</td></tr>`).join('');
  const devs = p.devoluciones.length ? p.devoluciones.map((d) => `<li>${fmtFechaHora(d.fecha_real)} — ${d.cantidad_mesas} mesas, ${d.cantidad_sillas} sillas <span class="text-muted">(${esc(d.registrado_por_nombre)})</span></li>`).join('') : '<li class="text-muted">Sin devoluciones todavía</li>';
  document.getElementById('verBody').innerHTML = `
    <div class="mb-2">#${p.id} ${badge(p.estado)} · <b>${esc(p.usuario_nombre)}</b></div>
    <div class="small text-muted mb-3">Prestado: ${fmtFechaHora(p.fecha_prestamo)} · Devolución prevista: ${fmtFechaHora(p.fecha_prevista_devolucion)}${p.reserva_id ? ` · Reserva #${p.reserva_id}` : ''}</div>
    <table class="table table-sm"><thead><tr><th>Recurso</th><th>Prestadas</th><th>Devueltas</th><th>Pendientes</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="fw-semibold mt-3 mb-1">Devoluciones</div><ul class="small ps-3 mb-2">${devs}</ul>
    <div class="small"><b>Observaciones:</b> ${esc(p.observaciones || '—')}</div>`;
  Layout.modal('modalVer').show();
}

function editar(id) {
  const p = lista.find((x) => x.id === id);
  const f = document.getElementById('formEdit');
  f.classList.remove('was-validated');
  f.pid.value = id;
  f.fecha_prevista.value = aInputLocal(p.fecha_prevista_devolucion);
  f.observaciones.value = p.observaciones || '';
  Layout.modal('modalEdit').show();
}

async function guardarEdicion(e) {
  e.preventDefault();
  const f = e.target;
  f.classList.add('was-validated');
  if (!f.checkValidity()) return;
  const p = lista.find((x) => x.id === Number(f.pid.value));
  if (new Date(f.fecha_prevista.value) < new Date(p.fecha_prestamo)) return Layout.toast('La fecha prevista no puede ser anterior al préstamo', 'error');
  const ok = await Layout.ejecutar(() => api(`/prestamos/${p.id}`, { method: 'PUT', body: {
    fecha_prevista_devolucion: new Date(f.fecha_prevista.value).toISOString(), observaciones: f.observaciones.value.trim() } }), 'Préstamo actualizado');
  if (ok) { Layout.modal('modalEdit').hide(); cargar(); }
}

const html = `
  <div class="card-soft mb-3 p-3"><div class="toolbar">
    <input class="form-control" id="fQ" placeholder="Buscar (usuario, nota, #)…">
    <select class="form-select" id="fEstado"><option value="">Todos los estados</option>
      <option>ACTIVO</option><option>PARCIALMENTE_DEVUELTO</option><option>VENCIDO</option><option>DEVUELTO</option></select>
    <button class="btn btn-light" id="btnLimpiar"><i class="bi bi-x-lg"></i></button>
    ${admin ? '<button class="btn btn-primary ms-auto" id="btnNuevo"><i class="bi bi-plus-lg"></i> Nuevo préstamo</button>' : ''}
  </div></div>
  <div class="card-soft"><div class="table-responsive"><table class="table table-hover mb-0">
    <thead><tr><th>#</th>${admin ? '<th>Responsable</th>' : ''}<th>Préstamo</th><th>Devolver antes de</th><th>Prestado<br><small>mesas / sillas</small></th><th>Pendiente<br><small>mesas / sillas</small></th><th>Estado</th><th></th></tr></thead>
    <tbody id="tbody"></tbody></table></div></div>

  <div class="modal fade" id="modalPre" tabindex="-1"><div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><form class="modal-content" id="formPre" novalidate>
    <div class="modal-header"><h5 class="modal-title">Nuevo préstamo</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="btn-group w-100 mb-3" role="group">
        <input type="radio" class="btn-check" name="origen" id="oRes" value="reserva" checked><label class="btn btn-outline-primary" for="oRes">Desde reserva confirmada</label>
        <input type="radio" class="btn-check" name="origen" id="oDir" value="directo"><label class="btn btn-outline-primary" for="oDir">Préstamo directo</label>
      </div>
      <div id="boxReserva" class="mb-3"><label class="form-label">Reserva</label><select class="form-select" name="reserva_id"></select>
        <div class="form-text" id="resumenReserva"></div>
        <div class="form-text">Las cantidades reservadas pasan automáticamente a prestadas.</div></div>
      <div id="boxDirecto" class="d-none">
        <div class="mb-3"><label class="form-label">Usuario responsable</label><select class="form-select" name="usuario_id"></select></div>
        <div class="row g-3 mb-3">
          <div class="col-6"><label class="form-label">Mesas</label><input type="number" class="form-control" name="cantidad_mesas" min="0" step="1" value="0"></div>
          <div class="col-6"><label class="form-label">Sillas</label><input type="number" class="form-control" name="cantidad_sillas" min="0" step="1" value="0"></div>
          <div class="col-12 text-danger small d-none" id="errCantPre">Indica al menos una mesa o una silla.</div>
        </div>
      </div>
      <div class="mb-3"><label class="form-label">Fecha prevista de devolución</label><input type="datetime-local" class="form-control" name="fecha_prevista" required></div>
      <div><label class="form-label">Observaciones</label><textarea class="form-control" name="observaciones" rows="2" maxlength="500"></textarea></div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Registrar préstamo</button></div>
  </form></div></div>

  <div class="modal fade" id="modalEdit" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><form class="modal-content" id="formEdit" novalidate>
    <div class="modal-header"><h5 class="modal-title">Modificar préstamo</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><input type="hidden" name="pid">
      <div class="mb-3"><label class="form-label">Fecha prevista de devolución</label><input type="datetime-local" class="form-control" name="fecha_prevista" required></div>
      <div><label class="form-label">Observaciones</label><textarea class="form-control" name="observaciones" rows="2" maxlength="500"></textarea></div></div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Guardar</button></div>
  </form></div></div>

  <div class="modal fade" id="modalVer" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">Detalle del préstamo</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body" id="verBody"></div></div></div></div>`;

if (Layout.mount('Préstamos', html)) {
  const recargar = debounce(cargar);
  document.getElementById('fQ').oninput = recargar;
  document.getElementById('fEstado').onchange = cargar;
  document.getElementById('btnLimpiar').onclick = () => { document.getElementById('fQ').value = ''; document.getElementById('fEstado').value = ''; cargar(); };
  document.getElementById('tbody').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.a === 'ver') ver(id); else editar(id);
  });
  if (admin) {
    document.getElementById('btnNuevo').onclick = () => abrirNuevo(null);
    const f = document.getElementById('formPre');
    f.onsubmit = guardarNuevo;
    f.querySelectorAll('[name=origen]').forEach((r) => (r.onchange = modoOrigen));
    f.reserva_id.onchange = mostrarResumenReserva;
    document.getElementById('formEdit').onsubmit = guardarEdicion;
    const rid = new URLSearchParams(location.search).get('reserva');
    if (rid) abrirNuevo(Number(rid));
  }
  cargar();
}
