const admin = Session.user.rol === 'ADMIN';
let pendientes = [];

async function cargar() {
  try {
    const [devs, prest] = await Promise.all([
      api('/devoluciones'),
      api('/prestamos'),
    ]);
    pendientes = prest.filter((p) => p.estado !== 'DEVUELTO' && p.estado !== 'PENDIENTE');
    pintarPendientes();
    pintarHistorial(devs);
  } catch (e) { Layout.toast(e.message, 'error'); }
}

function pintarPendientes() {
  document.getElementById('tPend').innerHTML = pendientes.length ? pendientes.map((p) => `
    <tr class="${p.estado === 'VENCIDO' ? 'row-vencido' : ''}"><td>#${p.id}</td>${admin ? `<td>${esc(p.usuario_nombre)}</td>` : ''}
      <td class="text-nowrap small ${p.estado === 'VENCIDO' ? 'text-danger fw-semibold' : ''}">${fmtFechaHora(p.fecha_prevista_devolucion)}</td>
      <td>${p.pendientes_mesas} / ${p.pendientes_sillas}</td><td>${badge(p.estado)}</td>
      ${admin ? `<td class="text-end"><button class="btn btn-sm btn-success" data-id="${p.id}"><i class="bi bi-arrow-return-left"></i> Devolver</button></td>` : ''}</tr>`).join('')
    : Layout.vacio(admin ? 6 : 4, 'No hay devoluciones pendientes', 'check2-all');
}

function pintarHistorial(devs) {
  document.getElementById('tHist').innerHTML = devs.length ? devs.map((d) => `
    <tr><td>#${d.id}</td><td>#${d.prestamo_id}</td>${admin ? `<td>${esc(d.usuario_nombre)}</td>` : ''}
      <td class="text-nowrap small">${fmtFechaHora(d.fecha_real)}</td><td>${d.cantidad_mesas}</td><td>${d.cantidad_sillas}</td>
      <td class="small">${esc(d.registrado_por_nombre)}</td><td class="small text-muted d-none d-md-table-cell">${esc(d.observaciones || '')}</td></tr>`).join('')
    : Layout.vacio(admin ? 8 : 7, 'Aún no hay devoluciones registradas', 'inbox');
}

/* ---------- registrar devolución (admin) ---------- */
function actualizarLimites() {
  const f = document.getElementById('formDev');
  const p = pendientes.find((x) => x.id === Number(f.prestamo_id.value));
  if (!p) return;
  f.cantidad_mesas.max = p.pendientes_mesas; f.cantidad_sillas.max = p.pendientes_sillas;
  f.cantidad_mesas.disabled = p.pendientes_mesas === 0; f.cantidad_sillas.disabled = p.pendientes_sillas === 0;
  document.getElementById('infoPend').innerHTML =
    `Pendientes: <b>${p.pendientes_mesas}</b> mesas y <b>${p.pendientes_sillas}</b> sillas (de ${p.cantidad_mesas} mesas / ${p.cantidad_sillas} sillas prestadas).`;
}

function abrir(prestamoId) {
  if (!pendientes.length) return Layout.toast('No hay préstamos con devoluciones pendientes', 'warning');
  const f = document.getElementById('formDev');
  f.reset(); f.classList.remove('was-validated');
  f.prestamo_id.innerHTML = pendientes.map((p) => `<option value="${p.id}">#${p.id} · ${esc(p.usuario_nombre)}</option>`).join('');
  if (prestamoId) f.prestamo_id.value = String(prestamoId);
  f.cantidad_mesas.value = 0; f.cantidad_sillas.value = 0;
  actualizarLimites();
  Layout.modal('modalDev').show();
}

async function guardar(e) {
  e.preventDefault();
  const f = e.target;
  f.classList.add('was-validated');
  const m = Number(f.cantidad_mesas.value) || 0; const s = Number(f.cantidad_sillas.value) || 0;
  const p = pendientes.find((x) => x.id === Number(f.prestamo_id.value));
  const err = document.getElementById('errDev');
  let msg = '';
  if (m < 0 || s < 0) msg = 'Las cantidades no pueden ser negativas';
  else if (m + s <= 0) msg = 'Indica al menos una unidad a devolver';
  else if (m > p.pendientes_mesas || s > p.pendientes_sillas) msg = 'No puedes devolver más de lo pendiente';
  err.textContent = msg; err.classList.toggle('d-none', !msg);
  if (msg) return;
  const completa = m === p.pendientes_mesas && s === p.pendientes_sillas;
  if (!(await Layout.confirmar(`Se registrará la devolución de ${m} mesas y ${s} sillas del préstamo #${p.id}${completa ? ' (devolución completa)' : ' (devolución parcial)'}.`, { titulo: 'Confirmar devolución', boton: 'Registrar' }))) return;
  const r = await Layout.ejecutar(() => api('/devoluciones', { method: 'POST', body: {
    prestamo_id: p.id, cantidad_mesas: m, cantidad_sillas: s, observaciones: f.observaciones.value.trim() } }),
    completa ? 'Préstamo devuelto por completo' : 'Devolución parcial registrada');
  if (r) { Layout.modal('modalDev').hide(); cargar(); }
}

const html = `
  <div class="card-soft mb-4">
    <div class="p-3 pb-2 fw-semibold d-flex justify-content-between align-items-center">
      <span>${admin ? 'Préstamos pendientes de devolución' : 'Mis devoluciones pendientes'}</span>
      ${admin ? '<button class="btn btn-primary btn-sm" id="btnReg"><i class="bi bi-plus-lg"></i> Registrar devolución</button>' : ''}
    </div>
    <div class="table-responsive"><table class="table table-hover mb-0">
      <thead><tr><th>Préstamo</th>${admin ? '<th>Responsable</th>' : ''}<th>Devolver antes de</th><th>Pendiente<br><small>mesas / sillas</small></th><th>Estado</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody id="tPend"></tbody></table></div>
  </div>
  <div class="card-soft">
    <div class="p-3 pb-2 fw-semibold">Historial de devoluciones</div>
    <div class="table-responsive"><table class="table table-hover mb-0">
      <thead><tr><th>#</th><th>Préstamo</th>${admin ? '<th>Responsable</th>' : ''}<th>Fecha real</th><th>Mesas</th><th>Sillas</th><th>Registró</th><th class="d-none d-md-table-cell">Notas</th></tr></thead>
      <tbody id="tHist"></tbody></table></div>
  </div>

  <div class="modal fade" id="modalDev" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><form class="modal-content" id="formDev" novalidate>
    <div class="modal-header"><h5 class="modal-title">Registrar devolución</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-3"><label class="form-label">Préstamo</label><select class="form-select" name="prestamo_id"></select></div>
      <div class="alert alert-light border small" id="infoPend"></div>
      <div class="row g-3 mb-1">
        <div class="col-6"><label class="form-label">Mesas devueltas</label><input type="number" class="form-control" name="cantidad_mesas" min="0" step="1"></div>
        <div class="col-6"><label class="form-label">Sillas devueltas</label><input type="number" class="form-control" name="cantidad_sillas" min="0" step="1"></div>
      </div>
      <button type="button" class="btn btn-link btn-sm p-0 mb-2" id="btnTodo">Devolver todo lo pendiente</button>
      <div class="text-danger small d-none mb-2" id="errDev"></div>
      <div><label class="form-label">Observaciones</label><textarea class="form-control" name="observaciones" rows="2" maxlength="500"></textarea></div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-success">Registrar</button></div>
  </form></div></div>`;

if (Layout.mount('Devoluciones', html)) {
  if (admin) {
    const f = document.getElementById('formDev');
    document.getElementById('btnReg').onclick = () => abrir(null);
    f.onsubmit = guardar;
    f.prestamo_id.onchange = () => { f.cantidad_mesas.value = 0; f.cantidad_sillas.value = 0; actualizarLimites(); };
    document.getElementById('btnTodo').onclick = () => {
      const p = pendientes.find((x) => x.id === Number(f.prestamo_id.value));
      f.cantidad_mesas.value = p.pendientes_mesas; f.cantidad_sillas.value = p.pendientes_sillas;
    };
    document.getElementById('tPend').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-id]'); if (b) abrir(Number(b.dataset.id));
    });
  }
  const pre = new URLSearchParams(location.search).get('prestamo');
  cargar().then(() => { if (admin && pre) abrir(Number(pre)); });
}
