const esAdmin = Session.user && Session.user.rol === 'ADMIN';

function tarjetaRecurso(r, icono, color) {
  if (!r) return `<div class="card-soft p-3 text-muted">Recurso no configurado</div>`;
  const pct = (n) => (r.total ? (n / r.total) * 100 : 0);
  return `
  <div class="card-soft resource-card p-3 h-100">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="title"><span class="stat-icon ${color}" style="width:38px;height:38px;flex-basis:38px"><i class="bi bi-${icono}"></i></span>${esc(r.nombre)}</div>
      ${r.estado === 'ACTIVO' ? '' : badge(r.estado)}
    </div>
    <div class="row g-2 text-center mb-3">
      <div class="col-6 col-md-3"><div class="mini"><div class="n">${r.total}</div><div class="l">Total</div></div></div>
      <div class="col-6 col-md-3"><div class="mini"><div class="n text-success">${r.disponibles}</div><div class="l">Disponibles</div></div></div>
      <div class="col-6 col-md-3"><div class="mini"><div class="n" style="color:#b98100">${r.reservadas}</div><div class="l">Reservadas</div></div></div>
      <div class="col-6 col-md-3"><div class="mini"><div class="n text-primary">${r.prestadas}</div><div class="l">Prestadas</div></div></div>
    </div>
    <div class="stack-bar mb-2" title="Distribución del inventario">
      <span style="width:${pct(r.disponibles)}%;background:var(--c-ok)"></span>
      <span style="width:${pct(r.reservadas)}%;background:var(--c-warn)"></span>
      <span style="width:${pct(r.prestadas)}%;background:var(--c-info)"></span>
    </div>
    <div class="small text-muted">
      <span class="me-3"><span class="legend-dot" style="background:var(--c-ok)"></span>Disponibles ${pct(r.disponibles).toFixed(0)}%</span>
      <span class="me-3"><span class="legend-dot" style="background:var(--c-warn)"></span>Reservadas</span>
      <span><span class="legend-dot" style="background:var(--c-info)"></span>Prestadas</span>
    </div>
  </div>`;
}

const statOp = (valor, label, icono, color, href) => `
  <div class="col-6 col-lg-3"><a href="${href}" class="text-decoration-none text-reset">
    <div class="card-soft stat-card"><div class="stat-icon ${color}"><i class="bi bi-${icono}"></i></div>
    <div><div class="stat-value">${valor}</div><div class="stat-label">${label}</div></div></div></a></div>`;

function pintar(d) {
  const op = d.operaciones;
  document.getElementById('cuerpo').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-12 col-xl-6">${tarjetaRecurso(d.mesas, 'table', 'bg-soft-accent')}</div>
      <div class="col-12 col-xl-6">${tarjetaRecurso(d.sillas, 'person-workspace', 'bg-soft-ok')}</div>
    </div>
    <h2 class="h6 text-uppercase text-muted mb-2">${esAdmin ? 'Operaciones' : 'Mis operaciones'}</h2>
    <div class="row g-3 mb-3">
      ${statOp(op.reservas_pendientes, 'Reservas pendientes', 'hourglass-split', 'bg-soft-warn', 'reservas.html')}
      ${statOp(op.prestamos_activos, 'Préstamos activos', 'arrow-left-right', 'bg-soft-info', 'prestamos.html')}
      ${statOp(op.prestamos_vencidos, 'Préstamos vencidos', 'exclamation-triangle', 'bg-soft-danger', 'prestamos.html')}
      ${statOp(op.devoluciones_pendientes, 'Devoluciones pendientes', 'arrow-return-left', 'bg-soft-gray', 'devoluciones.html')}
    </div>
    ${esAdmin ? `
    <div class="card-soft"><div class="p-3 pb-0 fw-semibold">Últimos movimientos</div>
      <div class="table-responsive"><table class="table table-hover mb-0">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Recurso</th><th class="text-end">Cant.</th><th>Usuario</th><th>Descripción</th></tr></thead>
        <tbody>${d.ultimos_movimientos.length ? d.ultimos_movimientos.map((m) => `
          <tr><td class="text-nowrap">${fmtFechaHora(m.fecha)}</td><td>${badge(m.tipo)}</td><td>${esc(m.recurso_nombre || '—')}</td>
          <td class="text-end">${m.cantidad}</td><td>${esc(m.usuario_nombre)}</td><td class="small">${esc(m.descripcion)}</td></tr>`).join('')
          : Layout.vacio(6, 'Sin movimientos')}</tbody></table></div></div>` : ''}
    <div class="text-muted small mt-3"><i class="bi bi-arrow-repeat"></i> Actualizado ${fmtFechaHora(d.actualizado)} · se refresca automáticamente</div>`;
}

async function cargar() {
  try { pintar(await api('/dashboard')); }
  catch (e) { Layout.toast(e.message, 'error'); }
}

if (Layout.mount('Dashboard', '<div id="cuerpo"><div class="text-center text-muted py-5"><div class="spinner-border"></div></div></div>')) {
  cargar();
  setInterval(() => { if (!document.hidden) cargar(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });
}
