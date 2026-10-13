const admin = Session.user && Session.user.rol === 'ADMIN';
let recursos = [];

const pill = (r) => {
  const pct = r.cantidad_total ? Math.round((r.cantidad_disponible / r.cantidad_total) * 100) : 0;
  const color = pct > 50 ? 'success' : pct > 20 ? 'warning' : 'danger';
  return `<div style="min-width:130px"><div class="progress" style="height:8px"><div class="progress-bar bg-${color}" style="width:${pct}%"></div></div>
          <small class="text-muted">${pct}% disponible</small></div>`;
};

function pintar() {
  const tb = document.getElementById('tbody');
  tb.innerHTML = recursos.length ? recursos.map((r) => `
    <tr><td class="fw-semibold"><i class="bi bi-${r.tipo === 'MESA' ? 'table' : 'person-workspace'} me-2"></i>${esc(r.nombre)}</td>
      <td>${r.cantidad_total}</td><td class="text-success fw-semibold">${r.cantidad_disponible}</td>
      <td style="color:#b98100" class="fw-semibold">${r.cantidad_reservada}</td><td class="text-primary fw-semibold">${r.cantidad_prestada}</td>
      <td class="fw-semibold">${fmtMoneda(r.precio_unitario)}</td><td>${badge(r.estado)}</td><td>${pill(r)}</td>
      ${admin ? `<td class="text-end"><button class="btn btn-sm btn-outline-primary" data-edit="${r.id}"><i class="bi bi-pencil"></i> Editar</button></td>` : ''}
    </tr>`).join('') : Layout.vacio(9, 'No hay recursos configurados', 'box-seam');
  const faltan = ['MESA', 'SILLA'].filter((t) => !recursos.some((r) => r.tipo === t));
  const btn = document.getElementById('btnNuevo');
  if (btn) btn.classList.toggle('d-none', !faltan.length);
  if (btn) btn.dataset.tipos = faltan.join(',');
  tb.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => abrir(recursos.find((r) => r.id === +b.dataset.edit))));
}

async function cargar() {
  try { recursos = await api('/inventario'); pintar(); }
  catch (e) { Layout.toast(e.message, 'error'); }
}

function abrir(r) {
  const f = document.getElementById('formRec');
  f.reset(); f.classList.remove('was-validated');
  document.getElementById('recTitulo').textContent = r ? `Editar ${r.nombre}` : 'Nuevo recurso';
  f.rid.value = r ? r.id : '';
  const tipos = document.getElementById('btnNuevo').dataset.tipos.split(',').filter(Boolean);
  f.tipo.innerHTML = r ? `<option>${r.tipo}</option>` : tipos.map((t) => `<option>${t}</option>`).join('');
  f.tipo.disabled = !!r;
  f.nombre.value = r ? r.nombre : '';
  f.cantidad_total.value = r ? r.cantidad_total : 0;
  f.estado.value = r ? r.estado : 'ACTIVO';
  f.precio_unitario.value = r ? Number(r.precio_unitario).toFixed(2) : '0.00';
  document.getElementById('recAyuda').textContent = r
    ? `Reservadas + prestadas = ${r.cantidad_reservada + r.cantidad_prestada}. El total no puede ser menor. Las disponibles se recalculan solas.`
    : '';
  Layout.modal('modalRec').show();
}

async function guardar(e) {
  e.preventDefault();
  const f = e.target;
  f.classList.add('was-validated');
  if (!f.checkValidity()) return;
  const body = { nombre: f.nombre.value.trim(), cantidad_total: Number(f.cantidad_total.value), estado: f.estado.value, precio_unitario: Number(f.precio_unitario.value) };
  const id = f.rid.value;
  if (!id) body.tipo = f.tipo.value;
  const ok = await Layout.ejecutar(() => api(id ? `/inventario/${id}` : '/inventario', { method: id ? 'PUT' : 'POST', body }),
    id ? 'Inventario actualizado' : 'Recurso creado');
  if (ok) { Layout.modal('modalRec').hide(); cargar(); }
}

const html = `
  <div class="card-soft">
    <div class="p-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div class="text-muted small">El inventario se calcula en PostgreSQL: total = disponibles + reservadas + prestadas.</div>
      ${admin ? '<button class="btn btn-primary btn-sm d-none" id="btnNuevo"><i class="bi bi-plus-lg"></i> Nuevo recurso</button>' : ''}
    </div>
    <div class="table-responsive"><table class="table table-hover mb-0">
      <thead><tr><th>Recurso</th><th>Total</th><th>Disponibles</th><th>Reservadas</th><th>Prestadas</th><th>Precio</th><th>Estado</th><th>Disponibilidad</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody id="tbody"></tbody></table></div>
  </div>
  <div class="modal fade" id="modalRec" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><form class="modal-content" id="formRec" novalidate>
    <div class="modal-header"><h5 class="modal-title" id="recTitulo"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <input type="hidden" name="rid">
      <div class="mb-3"><label class="form-label">Tipo</label><select class="form-select" name="tipo"></select></div>
      <div class="mb-3"><label class="form-label">Nombre</label><input class="form-control" name="nombre" required maxlength="80"></div>
      <div class="mb-3"><label class="form-label">Cantidad total</label><input type="number" class="form-control" name="cantidad_total" min="0" step="1" required>
        <div class="invalid-feedback">Ingresa un entero mayor o igual a 0</div><div class="form-text" id="recAyuda"></div></div>
      <div class="mb-3"><label class="form-label">Precio por unidad (USD)</label><input type="number" class="form-control" name="precio_unitario" min="0" max="100000" step="0.01" required>
        <div class="invalid-feedback">Importe válido (máx. 2 decimales)</div><div class="form-text">Se cobra una vez por unidad y por reserva. Cambiarlo no afecta reservas ya creadas.</div></div>
      <div class="mb-1"><label class="form-label">Estado</label><select class="form-select" name="estado"><option>ACTIVO</option><option>INACTIVO</option></select>
        <div class="form-text">Un recurso INACTIVO no admite nuevas reservas ni préstamos.</div></div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Guardar</button></div>
  </form></div></div>`;

if (Layout.mount('Inventario', html)) {
  if (admin) {
    document.getElementById('btnNuevo').onclick = () => abrir(null);
    document.getElementById('formRec').onsubmit = guardar;
  }
  cargar();
}
