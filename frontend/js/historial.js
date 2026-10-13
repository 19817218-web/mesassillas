let timer;

async function cargar() {
  const v = (id) => document.getElementById(id).value;
  try {
    const rows = await api('/historial', { params: { tipo: v('fTipo'), desde: v('fDesde'), hasta: v('fHasta'), q: v('fQ').trim(), limit: 300 } });
    document.getElementById('tbody').innerHTML = rows.length ? rows.map((m) => `
      <tr><td class="text-nowrap small">${fmtFechaHora(m.fecha)}</td><td>${badge(m.tipo)}</td>
        <td>${esc(m.recurso_nombre || '—')}</td><td class="text-end fw-semibold">${m.cantidad}</td>
        <td class="small text-nowrap">${esc(m.estado_anterior || '—')} <i class="bi bi-arrow-right text-muted"></i> ${esc(m.estado_posterior || '—')}</td>
        <td class="small text-nowrap">${m.reserva_id ? `Res #${m.reserva_id} ` : ''}${m.prestamo_id ? `Pré #${m.prestamo_id} ` : ''}${m.devolucion_id ? `Dev #${m.devolucion_id}` : ''}</td>
        <td>${esc(m.usuario_nombre)}</td><td class="small">${esc(m.descripcion)}</td></tr>`).join('')
      : Layout.vacio(8, 'No hay movimientos con esos filtros', 'clock-history');
    document.getElementById('total').textContent = `${rows.length} movimiento(s)`;
  } catch (e) { Layout.toast(e.message, 'error'); }
}

const html = `
  <div class="card-soft mb-3 p-3"><div class="toolbar">
    <input class="form-control" id="fQ" placeholder="Buscar en descripción o usuario…">
    <select class="form-select" id="fTipo"><option value="">Todos los tipos</option>
      <option>RESERVA</option><option>CANCELACION</option><option>PRESTAMO</option><option>DEVOLUCION</option><option>DEVOLUCION_PARCIAL</option><option>MODIFICACION</option><option>PAGO</option><option>REEMBOLSO</option></select>
    <input type="date" class="form-control" id="fDesde" title="Desde">
    <input type="date" class="form-control" id="fHasta" title="Hasta">
    <button class="btn btn-light" id="btnLimpiar"><i class="bi bi-x-lg"></i></button>
    <span class="ms-auto text-muted small" id="total"></span>
  </div></div>
  <div class="card-soft"><div class="table-responsive"><table class="table table-hover mb-0">
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Recurso</th><th class="text-end">Cant.</th><th>Estado</th><th>Referencia</th><th>Usuario</th><th>Descripción</th></tr></thead>
    <tbody id="tbody"></tbody></table></div></div>`;

if (Layout.mount('Historial de movimientos', html, { admin: true })) {
  const r = () => { clearTimeout(timer); timer = setTimeout(cargar, 300); };
  ['fQ'].forEach((i) => (document.getElementById(i).oninput = r));
  ['fTipo', 'fDesde', 'fHasta'].forEach((i) => (document.getElementById(i).onchange = cargar));
  document.getElementById('btnLimpiar').onclick = () => { ['fQ', 'fTipo', 'fDesde', 'fHasta'].forEach((i) => { document.getElementById(i).value = ''; }); cargar(); };
  cargar();
}
