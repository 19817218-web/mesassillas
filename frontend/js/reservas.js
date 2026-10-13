const admin = Session.user.rol === 'ADMIN';
let lista = [];
let stock = {};
let usuarios = [];

async function cargarStock() {
  try {
    const inv = await api('/inventario');
    inv.forEach((r) => { stock[r.tipo] = r; });
  } catch { /* se muestra al abrir el modal */ }
}

function accionesDe(r) {
  const b = [];
  b.push(`<button class="btn btn-sm btn-outline-secondary btn-icon" title="Ver" data-a="ver" data-id="${r.id}"><i class="bi bi-eye"></i></button>`);
  const editable = ['PENDIENTE', 'CONFIRMADA'].includes(r.estado) && (admin || r.estado === 'PENDIENTE');
  if (editable) b.push(`<button class="btn btn-sm btn-outline-primary btn-icon" title="Modificar" data-a="editar" data-id="${r.id}"><i class="bi bi-pencil"></i></button>`);
  if (r.estado !== 'CANCELADA' && r.saldo > 0) b.push(`<button class="btn btn-sm btn-outline-success btn-icon" title="Pagar ${fmtMoneda(r.saldo)}" data-a="pagar" data-id="${r.id}"><i class="bi bi-credit-card"></i></button>`);
  if (admin && r.estado === 'PENDIENTE') b.push(`<button class="btn btn-sm btn-success btn-icon" title="Confirmar" data-a="confirmar" data-id="${r.id}"><i class="bi bi-check2-circle"></i></button>`);
  if (admin && r.estado === 'CONFIRMADA') b.push(`<a class="btn btn-sm btn-info btn-icon" title="Convertir en préstamo" href="prestamos.html?reserva=${r.id}"><i class="bi bi-arrow-left-right"></i></a>`);
  if (['PENDIENTE', 'CONFIRMADA'].includes(r.estado)) b.push(`<button class="btn btn-sm btn-outline-danger btn-icon" title="Cancelar" data-a="cancelar" data-id="${r.id}"><i class="bi bi-x-circle"></i></button>`);
  return `<div class="d-flex gap-1 justify-content-end flex-wrap">${b.join('')}</div>`;
}

function pintar() {
  const tb = document.getElementById('tbody');
  tb.innerHTML = lista.length ? lista.map((r) => `
    <tr><td>#${r.id}</td>${admin ? `<td>${esc(r.usuario_nombre)}</td>` : ''}
      <td class="text-nowrap">${fmtFecha(r.fecha)}<div class="small text-muted">${fmtHora(r.hora_inicio)} – ${fmtHora(r.hora_fin)}</div></td>
      <td>${r.cantidad_mesas}</td><td>${r.cantidad_sillas}</td><td>${badge(r.estado)}</td>
      <td class="text-nowrap">${r.estado === 'CANCELADA' ? '' : `<div class="fw-semibold">${fmtMoneda(r.monto_total)}</div>`}${Pago.badgePago(r)}${r.saldo > 0 && r.monto_pagado > 0 ? `<div class="small text-muted">Saldo ${fmtMoneda(r.saldo)}</div>` : ''}</td>
      <td class="small text-muted d-none d-md-table-cell" style="max-width:220px">${esc(r.observaciones || '')}</td>
      <td>${accionesDe(r)}</td></tr>`).join('') : Layout.vacio(admin ? 9 : 8, 'No hay reservas con esos filtros', 'calendar-x');
}

async function cargar() {
  try {
    lista = await api('/reservas', { params: {
      q: document.getElementById('fQ').value.trim(), estado: document.getElementById('fEstado').value,
      fecha: document.getElementById('fFecha').value } });
    pintar();
  } catch (e) { Layout.toast(e.message, 'error'); }
}

function pintarDisponibilidad() {
  const m = stock.MESA; const s = stock.SILLA;
  document.getElementById('disp').innerHTML = (m && s)
    ? `<span class="avail-pill me-2"><i class="bi bi-table"></i> Mesas disponibles: <b>${m.cantidad_disponible}</b></span>
       <span class="avail-pill"><i class="bi bi-person-workspace"></i> Sillas disponibles: <b>${s.cantidad_disponible}</b></span>` : '';
}

async function abrirForm(r) {
  await cargarStock(); pintarDisponibilidad();
  const f = document.getElementById('formRes');
  f.reset(); f.classList.remove('was-validated');
  document.getElementById('resTitulo').textContent = r ? `Modificar reserva #${r.id}` : 'Nueva reserva';
  f.rid.value = r ? r.id : '';
  f.fecha.min = hoyISO();
  f.fecha.value = r ? String(r.fecha).slice(0, 10) : '';
  f.hora_inicio.value = r ? fmtHora(r.hora_inicio) : '';
  f.hora_fin.value = r ? fmtHora(r.hora_fin) : '';
  f.cantidad_mesas.value = r ? r.cantidad_mesas : 0;
  f.cantidad_sillas.value = r ? r.cantidad_sillas : 0;
  f.observaciones.value = r ? r.observaciones || '' : '';
  const boxAdmin = document.getElementById('boxAdmin');
  boxAdmin.classList.toggle('d-none', !admin || !!r);
  if (admin && !r) {
    if (!usuarios.length) usuarios = (await Layout.ejecutar(() => api('/usuarios'))) || [];
    f.usuario_id.innerHTML = usuarios.filter((u) => u.activo).map((u) => `<option value="${u.id}">${esc(u.nombre)} (${esc(u.email)})</option>`).join('');
    f.confirmar.checked = false;
  }
  actualizarEstimado();
  Layout.modal('modalRes').show();
}

function actualizarEstimado() {
  const f = document.getElementById('formRes'); const box = document.getElementById('totalEst');
  if (f.rid.value) { box.innerHTML = '<i class="bi bi-info-circle"></i> El total se recalcula al guardar. Si la reserva ya está pagada y baja de precio, se reembolsa la diferencia; si sube, queda saldo por pagar.'; return; }
  const m = Math.max(0, Number(f.cantidad_mesas.value) || 0); const s = Math.max(0, Number(f.cantidad_sillas.value) || 0);
  const total = m * Number((stock.MESA || {}).precio_unitario || 0) + s * Number((stock.SILLA || {}).precio_unitario || 0);
  box.innerHTML = `Total estimado: <b>${fmtMoneda(total)}</b> <span class="text-muted">(${fmtMoneda((stock.MESA || {}).precio_unitario)} por mesa · ${fmtMoneda((stock.SILLA || {}).precio_unitario)} por silla)</span>`;
}

function validar(f) {
  f.classList.add('was-validated');
  const ini = f.hora_inicio.value; const fin = f.hora_fin.value;
  f.hora_fin.setCustomValidity(ini && fin && fin <= ini ? 'La hora final debe ser posterior' : '');
  const m = Number(f.cantidad_mesas.value); const s = Number(f.cantidad_sillas.value);
  const vacio = !(m > 0 || s > 0);
  document.getElementById('errCant').classList.toggle('d-none', !vacio);
  if (!f.checkValidity() || vacio) return false;
  if (!f.rid.value && f.fecha.value < hoyISO()) { Layout.toast('La fecha no puede ser anterior a hoy', 'error'); return false; }
  return true;
}

async function guardar(e) {
  e.preventDefault();
  const f = e.target;
  if (!validar(f)) return;
  const body = {
    fecha: f.fecha.value, hora_inicio: f.hora_inicio.value, hora_fin: f.hora_fin.value,
    cantidad_mesas: Number(f.cantidad_mesas.value), cantidad_sillas: Number(f.cantidad_sillas.value),
    observaciones: f.observaciones.value.trim(),
  };
  const id = f.rid.value;
  if (!id && admin) { body.usuario_id = Number(f.usuario_id.value); body.confirmar = f.confirmar.checked; }
  const ok = await Layout.ejecutar(() => api(id ? `/reservas/${id}` : '/reservas', { method: id ? 'PUT' : 'POST', body }),
    id ? 'Reserva modificada' : 'Reserva creada');
  if (ok) {
    Layout.modal('modalRes').hide(); cargar();
    if (!id && ok.saldo > 0) Layout.toast(`Total a pagar: ${fmtMoneda(ok.saldo)}. Puedes pagarla desde la lista.`, 'info');
    if (id && ok.monto_pagado > 0 && ok.saldo > 0) Layout.toast(`Quedó un saldo de ${fmtMoneda(ok.saldo)} por pagar.`, 'info');
  }
}

async function accion(a, id) {
  const r = lista.find((x) => x.id === id);
  if (a === 'editar') return abrirForm(r);
  if (a === 'pagar') return Pago.abrir(r, () => cargar());
  if (a === 'ver') {
    document.getElementById('verBody').innerHTML = `
      <dl class="row mb-0">
        <dt class="col-5">Reserva</dt><dd class="col-7">#${r.id} ${badge(r.estado)}</dd>
        <dt class="col-5">Usuario</dt><dd class="col-7">${esc(r.usuario_nombre)}</dd>
        <dt class="col-5">Fecha</dt><dd class="col-7">${fmtFecha(r.fecha)}</dd>
        <dt class="col-5">Horario</dt><dd class="col-7">${fmtHora(r.hora_inicio)} – ${fmtHora(r.hora_fin)}</dd>
        <dt class="col-5">Mesas</dt><dd class="col-7">${r.cantidad_mesas}</dd>
        <dt class="col-5">Sillas</dt><dd class="col-7">${r.cantidad_sillas}</dd>
        <dt class="col-5">Préstamo</dt><dd class="col-7">${r.prestamo_id ? `<a href="prestamos.html">#${r.prestamo_id}</a>` : '—'}</dd>
        <dt class="col-5">Total</dt><dd class="col-7">${fmtMoneda(r.monto_total)} ${Pago.badgePago(r)}</dd>
        <dt class="col-5">Pagado</dt><dd class="col-7">${fmtMoneda(r.monto_pagado)}${r.saldo > 0 ? ` <span class="text-muted">· saldo ${fmtMoneda(r.saldo)}</span>` : ''}</dd>
        <dt class="col-5">Observaciones</dt><dd class="col-7">${esc(r.observaciones || '—')}</dd>
        <dt class="col-5">Creada</dt><dd class="col-7">${fmtFechaHora(r.created_at)}</dd>
      </dl>
      <hr><h6 class="mb-2">Transacciones</h6><div id="verPagos"><div class="text-muted small">Cargando…</div></div>`;
    Layout.modal('modalVer').show();
    try {
      const d = await api('/pagos', { params: { reserva_id: r.id } });
      document.getElementById('verPagos').innerHTML = Pago.tablaTransacciones(d.pagos);
    } catch (e) { document.getElementById('verPagos').innerHTML = `<div class="text-danger small">${esc(e.message)}</div>`; }
    return;
  }
  const textos = {
    confirmar: [`¿Confirmar la reserva #${id}? Se apartarán ${r.cantidad_mesas} mesas y ${r.cantidad_sillas} sillas del inventario.`, 'Confirmar reserva', 'Confirmar', false, 'Reserva confirmada'],
    cancelar: [`¿Cancelar la reserva #${id}? ${r.estado === 'CONFIRMADA' ? 'Los recursos reservados volverán a estar disponibles. ' : ''}${r.monto_pagado > 0 ? `Se reembolsarán ${fmtMoneda(r.monto_pagado)} (simulado).` : ''}`, 'Cancelar reserva', 'Sí, cancelar', true, 'Reserva cancelada'],
  }[a];
  if (!(await Layout.confirmar(textos[0], { titulo: textos[1], boton: textos[2], peligro: textos[3] }))) return;
  const res = await Layout.ejecutar(() => api(`/reservas/${id}/${a}`, { method: 'POST' }), textos[4]);
  if (res) {
    if (res.reembolsado > 0) Layout.toast(`Se reembolsaron ${fmtMoneda(res.reembolsado)}.`, 'info');
    cargar();
  }
}

const html = `
  <div class="card-soft mb-3 p-3"><div class="toolbar">
    <input class="form-control" id="fQ" placeholder="Buscar (usuario, nota, #)…">
    <select class="form-select" id="fEstado"><option value="">Todos los estados</option>
      <option>PENDIENTE</option><option>CONFIRMADA</option><option>CANCELADA</option><option>FINALIZADA</option></select>
    <input type="date" class="form-control" id="fFecha" title="Filtrar por fecha">
    <button class="btn btn-light" id="btnLimpiar"><i class="bi bi-x-lg"></i></button>
    <button class="btn btn-primary ms-auto" id="btnNueva"><i class="bi bi-plus-lg"></i> Nueva reserva</button>
  </div></div>
  <div class="card-soft"><div class="table-responsive"><table class="table table-hover mb-0">
    <thead><tr><th>#</th>${admin ? '<th>Usuario</th>' : ''}<th>Fecha / horario</th><th>Mesas</th><th>Sillas</th><th>Estado</th><th>Total / pago</th><th class="d-none d-md-table-cell">Notas</th><th></th></tr></thead>
    <tbody id="tbody"></tbody></table></div></div>

  <div class="modal fade" id="modalRes" tabindex="-1"><div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><form class="modal-content" id="formRes" novalidate>
    <div class="modal-header"><h5 class="modal-title" id="resTitulo"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <input type="hidden" name="rid">
      <div class="mb-3" id="disp"></div>
      <div id="boxAdmin" class="d-none">
        <div class="mb-3"><label class="form-label">Usuario</label><select class="form-select" name="usuario_id"></select></div>
        <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" name="confirmar" id="chkConf"><label class="form-check-label" for="chkConf">Confirmar de inmediato (aparta el inventario)</label></div>
      </div>
      <div class="row g-3">
        <div class="col-12"><label class="form-label">Fecha</label><input type="date" class="form-control" name="fecha" required><div class="invalid-feedback">Fecha obligatoria</div></div>
        <div class="col-6"><label class="form-label">Hora de inicio</label><input type="time" class="form-control" name="hora_inicio" required></div>
        <div class="col-6"><label class="form-label">Hora de fin</label><input type="time" class="form-control" name="hora_fin" required><div class="invalid-feedback">Debe ser posterior al inicio</div></div>
        <div class="col-6"><label class="form-label">Mesas</label><input type="number" class="form-control" name="cantidad_mesas" min="0" step="1" required></div>
        <div class="col-6"><label class="form-label">Sillas</label><input type="number" class="form-control" name="cantidad_sillas" min="0" step="1" required></div>
        <div class="col-12"><div class="text-danger small d-none" id="errCant">Indica al menos una mesa o una silla.</div></div>
        <div class="col-12"><div class="alert alert-light border small py-2 mb-0" id="totalEst"></div></div>
        <div class="col-12"><label class="form-label">Observaciones</label><textarea class="form-control" name="observaciones" rows="2" maxlength="500"></textarea></div>
      </div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cerrar</button><button class="btn btn-primary">Guardar</button></div>
  </form></div></div>

  <div class="modal fade" id="modalVer" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">Detalle de reserva</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body" id="verBody"></div></div></div></div>
  ${Pago.modalHtml()}`;

if (Layout.mount('Reservas', html)) {
  document.getElementById('btnNueva').onclick = () => abrirForm(null);
  document.getElementById('formRes').onsubmit = guardar;
  ['cantidad_mesas', 'cantidad_sillas'].forEach((n) => document.getElementById('formRes')[n].addEventListener('input', actualizarEstimado));
  const recargar = debounce(cargar);
  document.getElementById('fQ').oninput = recargar;
  document.getElementById('fEstado').onchange = cargar;
  document.getElementById('fFecha').onchange = cargar;
  document.getElementById('btnLimpiar').onclick = () => {
    ['fQ', 'fEstado', 'fFecha'].forEach((i) => { document.getElementById(i).value = ''; }); cargar();
  };
  document.getElementById('tbody').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-a]'); if (b) accion(b.dataset.a, Number(b.dataset.id));
  });
  cargarStock(); cargar();
}
