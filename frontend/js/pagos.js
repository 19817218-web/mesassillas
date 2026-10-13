const esAdmin = Session.user.rol === 'ADMIN';
let timer;

const stat = (valor, label, icono, color) => `
  <div class="col-6 col-lg-3"><div class="card-soft stat-card"><div class="stat-icon ${color}"><i class="bi bi-${icono}"></i></div>
  <div><div class="stat-value" style="font-size:1.4rem">${valor}</div><div class="stat-label">${label}</div></div></div></div>`;

function pintarResumen(r) {
  document.getElementById('resumen').innerHTML =
    stat(fmtMoneda(r.cobrado), 'Cobrado', 'cash-stack', 'bg-soft-ok') +
    stat(fmtMoneda(r.reembolsado), 'Reembolsado', 'arrow-counterclockwise', 'bg-soft-warn') +
    stat(fmtMoneda(r.neto), 'Neto', 'wallet2', 'bg-soft-info') +
    stat(r.rechazados, 'Intentos rechazados', 'x-octagon', 'bg-soft-danger');
}

async function cargar() {
  const v = (id) => document.getElementById(id).value;
  try {
    const d = await api('/pagos', { params: {
      q: v('fQ').trim(), tipo: v('fTipo'), estado: v('fEstado'), metodo: v('fMetodo'), desde: v('fDesde'), hasta: v('fHasta'), limit: 300 } });
    pintarResumen(d.resumen);
    document.getElementById('tbody').innerHTML = d.pagos.length ? d.pagos.map((p) => `
      <tr><td class="text-nowrap small">${fmtFechaHora(p.created_at)}</td>
        <td><a href="reservas.html">#${p.reserva_id}</a></td>
        ${esAdmin ? `<td>${esc(p.usuario_nombre)}</td>` : ''}
        <td>${badge(p.tipo)}</td><td class="small text-nowrap">${Pago.medio(p)}</td>
        <td class="text-end">${Pago.montoHtml(p)}</td>
        <td>${badge(p.estado)}${p.estado === 'RECHAZADO' && p.mensaje ? `<div class="small text-muted">${esc(p.mensaje)}</div>` : ''}${p.tipo === 'REEMBOLSO' && p.mensaje ? `<div class="small text-muted">${esc(p.mensaje)}</div>` : ''}</td>
        <td class="small"><code>${esc(p.referencia)}</code></td>
        ${esAdmin ? `<td class="small text-muted">${esc(p.registrado_por_nombre)}</td>` : ''}</tr>`).join('')
      : Layout.vacio(esAdmin ? 9 : 7, 'No hay pagos con esos filtros', 'credit-card');
    document.getElementById('total').textContent = d.resumen.transacciones > d.pagos.length
      ? `Mostrando ${d.pagos.length} de ${d.resumen.transacciones} transacciones` : `${d.resumen.transacciones} transacción(es)`;
  } catch (e) { Layout.toast(e.message, 'error'); }
}

const html = `
  <div class="alert alert-warning py-2 small"><i class="bi bi-shield-exclamation"></i> <b>Modo simulación:</b> los pagos son de prueba, no se mueve dinero real.</div>
  <div class="row g-3 mb-3" id="resumen"></div>
  <div class="card-soft mb-3 p-3"><div class="toolbar">
    <input class="form-control" id="fQ" placeholder="Referencia, ${esAdmin ? 'usuario o ' : ''}#reserva…">
    <select class="form-select" id="fTipo"><option value="">Todos los tipos</option><option value="COBRO">Cobros</option><option value="REEMBOLSO">Reembolsos</option></select>
    <select class="form-select" id="fEstado"><option value="">Todos los estados</option><option value="APROBADO">Aprobados</option><option value="RECHAZADO">Rechazados</option></select>
    <select class="form-select" id="fMetodo"><option value="">Todos los medios</option><option value="TARJETA">Tarjeta</option><option value="EFECTIVO">Efectivo</option></select>
    <input type="date" class="form-control" id="fDesde" title="Desde"><input type="date" class="form-control" id="fHasta" title="Hasta">
    <button class="btn btn-light" id="btnLimpiar"><i class="bi bi-x-lg"></i></button>
    <span class="ms-auto text-muted small" id="total"></span>
  </div></div>
  <div class="card-soft"><div class="table-responsive"><table class="table table-hover mb-0">
    <thead><tr><th>Fecha</th><th>Reserva</th>${esAdmin ? '<th>Usuario</th>' : ''}<th>Tipo</th><th>Medio</th><th class="text-end">Monto</th><th>Estado</th><th>Referencia</th>${esAdmin ? '<th>Registrado por</th>' : ''}</tr></thead>
    <tbody id="tbody"></tbody></table></div></div>`;

if (Layout.mount(esAdmin ? 'Pagos' : 'Mis pagos', html)) {
  const r = () => { clearTimeout(timer); timer = setTimeout(cargar, 300); };
  document.getElementById('fQ').oninput = r;
  ['fTipo', 'fEstado', 'fMetodo', 'fDesde', 'fHasta'].forEach((i) => (document.getElementById(i).onchange = cargar));
  document.getElementById('btnLimpiar').onclick = () => { ['fQ', 'fTipo', 'fEstado', 'fMetodo', 'fDesde', 'fHasta'].forEach((i) => { document.getElementById(i).value = ''; }); cargar(); };
  cargar();
}
