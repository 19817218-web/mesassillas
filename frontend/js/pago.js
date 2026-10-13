/**
 * Pago: modal de cobro (simulado) + helpers de visualización compartidos por Reservas y Pagos.
 * Requiere api.js y layout.js. El monto NUNCA lo decide el navegador: el servidor cobra el saldo pendiente.
 */
const Pago = (() => {
  const ESTADO_PAGO = {
    PAGADO: ['success', 'Pagado'], PENDIENTE: ['warning text-dark', 'Por pagar'], PARCIAL: ['info text-dark', 'Pago parcial'],
    SIN_COSTO: ['secondary', 'Sin costo'], REEMBOLSADO: ['warning text-dark', 'Reembolsado'], NO_APLICA: ['light text-muted', '—'],
  };
  const badgePago = (r) => {
    const [clase, texto] = ESTADO_PAGO[r.estado_pago] || ['secondary', r.estado_pago || '—'];
    return `<span class="badge text-bg-${clase}">${esc(texto)}</span>`;
  };
  const medio = (p) => (p.metodo === 'TARJETA'
    ? `<i class="bi bi-credit-card"></i> ${esc(p.tarjeta_marca)} ••${esc(p.tarjeta_ultimos4)}`
    : '<i class="bi bi-cash-coin"></i> Efectivo');
  /** Monto con signo: los reembolsos y rechazos se muestran distinto de un cobro aprobado. */
  const montoHtml = (p) => (p.tipo === 'REEMBOLSO'
    ? `<span class="text-danger fw-semibold">−${fmtMoneda(p.monto)}</span>`
    : `<span class="${p.estado === 'RECHAZADO' ? 'text-muted text-decoration-line-through' : 'fw-semibold'}">${fmtMoneda(p.monto)}</span>`);

  /** Mini tabla de transacciones de una reserva (modal "Ver"). */
  const tablaTransacciones = (pagos) => (pagos.length ? `
    <div class="table-responsive"><table class="table table-sm align-middle mb-0">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Medio</th><th class="text-end">Monto</th><th>Estado</th></tr></thead>
      <tbody>${pagos.map((p) => `<tr>
        <td class="text-nowrap small">${fmtFechaHora(p.created_at)}</td><td>${badge(p.tipo)}</td>
        <td class="small text-nowrap">${medio(p)}<div class="text-muted">${esc(p.referencia)}</div></td>
        <td class="text-end">${montoHtml(p)}</td>
        <td>${badge(p.estado)}${p.estado === 'RECHAZADO' && p.mensaje ? `<div class="small text-muted">${esc(p.mensaje)}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="text-muted small">Sin transacciones.</div>');

  // ------------------------------------------------------------------ modal de cobro
  const modalHtml = () => `
  <div class="modal fade" id="modalPago" tabindex="-1" data-bs-backdrop="static"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <form id="formPago" novalidate autocomplete="off">
      <div class="modal-header"><h5 class="modal-title"><i class="bi bi-credit-card-2-front"></i> <span id="pagoTitulo">Pagar reserva</span></h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="alert alert-warning py-2 small"><i class="bi bi-shield-exclamation"></i> <b>Modo simulación.</b> No se realiza ningún cargo real: <b>no ingreses datos de una tarjeta verdadera</b>.</div>
        <div class="pay-summary mb-3">
          <div><span class="text-muted small">Total</span><div id="pagoTotal" class="fw-semibold"></div></div>
          <div><span class="text-muted small">Pagado</span><div id="pagoPagado" class="fw-semibold"></div></div>
          <div class="pay-due"><span class="small">A pagar ahora</span><div id="pagoSaldo" class="fs-5 fw-bold"></div></div>
        </div>
        <div class="btn-group w-100 mb-3" role="group" id="pagoMetodos">
          <input type="radio" class="btn-check" name="metodo" id="mTarjeta" value="TARJETA" checked><label class="btn btn-outline-primary" for="mTarjeta"><i class="bi bi-credit-card"></i> Tarjeta</label>
          <input type="radio" class="btn-check" name="metodo" id="mEfectivo" value="EFECTIVO"><label class="btn btn-outline-primary" for="mEfectivo"><i class="bi bi-cash-coin"></i> Efectivo (mostrador)</label>
        </div>
        <fieldset id="boxTarjeta">
          <div class="mb-3"><select class="form-select form-select-sm" id="pagoPrueba"><option value="">Rellenar con una tarjeta de prueba…</option></select></div>
          <div class="row g-3">
            <div class="col-12"><label class="form-label">Titular</label><input class="form-control" name="titular" maxlength="60" required autocomplete="off"><div class="invalid-feedback">Obligatorio</div></div>
            <div class="col-12"><label class="form-label">Número de tarjeta <span class="badge text-bg-light border ms-1" id="pagoMarca">—</span></label>
              <input class="form-control" name="numero" inputmode="numeric" maxlength="23" placeholder="0000 0000 0000 0000" required autocomplete="off"><div class="invalid-feedback">Obligatorio</div></div>
            <div class="col-6"><label class="form-label">Vencimiento</label><input class="form-control" name="vencimiento" inputmode="numeric" maxlength="5" placeholder="MM/AA" pattern="(0[1-9]|1[0-2])/[0-9]{2}" required autocomplete="off"><div class="invalid-feedback">Formato MM/AA</div></div>
            <div class="col-6"><label class="form-label">CVV</label><input class="form-control" name="cvv" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{3,4}" required autocomplete="off"><div class="invalid-feedback">3 o 4 dígitos</div></div>
          </div>
        </fieldset>
        <div id="boxEfectivo" class="d-none text-muted small">El administrador confirma que recibió el efectivo en mostrador. Se registra el cobro completo del saldo.</div>
        <div class="alert alert-danger py-2 mt-3 mb-0 d-none" id="pagoError"></div>
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
        <button class="btn btn-success" id="btnPagar"><span id="pagoBtnTxt">Pagar</span></button></div>
    </form>
    <div id="pagoRecibo" class="d-none">
      <div class="modal-body text-center py-4">
        <div class="display-5 text-success mb-2"><i class="bi bi-check-circle-fill"></i></div>
        <h5 class="mb-1">Pago aprobado</h5><div class="fs-3 fw-bold" id="rcMonto"></div>
        <dl class="row text-start mt-3 mb-0 small" id="rcDetalle"></dl>
        <div class="text-muted small mt-3">Comprobante simulado: no representa un cargo real.</div>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" data-bs-dismiss="modal">Listo</button></div>
    </div>
  </div></div></div>`;

  let ctx = null; let sim = null; let ligado = false;
  const el = (id) => document.getElementById(id);

  const formatearNumero = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 19);
    if (/^3[47]/.test(d)) return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
    return d.replace(/(.{4})/g, '$1 ').trim();
  };
  const marcaDe = (d) => (/^4/.test(d) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(d) ? 'MASTERCARD' : /^3[47]/.test(d) ? 'AMEX' : '—');

  function setMetodo(m) {
    const tarjeta = m === 'TARJETA';
    el('boxTarjeta').disabled = !tarjeta;
    el('boxTarjeta').classList.toggle('d-none', !tarjeta);
    el('boxEfectivo').classList.toggle('d-none', tarjeta);
  }
  function setError(msg) { const b = el('pagoError'); b.textContent = msg || ''; b.classList.toggle('d-none', !msg); }
  function setCargando(on) {
    el('btnPagar').disabled = on;
    el('pagoBtnTxt').innerHTML = on
      ? '<span class="spinner-border spinner-border-sm me-1"></span> Procesando…'
      : `Pagar ${fmtMoneda(ctx ? ctx.reserva.saldo : 0)}`;
    el('pagoMetodos').querySelectorAll('input').forEach((i) => { i.disabled = on || (i.value === 'EFECTIVO' && Session.user.rol !== 'ADMIN'); });
  }

  function ligar() {
    if (ligado) return; ligado = true;
    const f = el('formPago');
    f.numero.addEventListener('input', () => { f.numero.value = formatearNumero(f.numero.value); el('pagoMarca').textContent = marcaDe(f.numero.value.replace(/\s/g, '')); });
    f.vencimiento.addEventListener('input', () => {
      const d = f.vencimiento.value.replace(/\D/g, '').slice(0, 4);
      f.vencimiento.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    });
    f.cvv.addEventListener('input', () => { f.cvv.value = f.cvv.value.replace(/\D/g, '').slice(0, 4); });
    f.querySelectorAll('input[name="metodo"]').forEach((r) => r.addEventListener('change', () => { setMetodo(r.value); setError(''); }));
    el('pagoPrueba').addEventListener('change', (e) => {
      const t = sim && sim.tarjetas_prueba[Number(e.target.value)];
      if (!t) return;
      f.numero.value = t.numero; f.numero.dispatchEvent(new Event('input'));
      f.vencimiento.value = `12/${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;
      f.cvv.value = /^3[47]/.test(t.numero) ? '1234' : '123';
      if (!f.titular.value.trim()) f.titular.value = 'Titular de Prueba';
      setError('');
    });
    f.addEventListener('submit', enviar);
    // Al cerrar el modal no se conserva ningún dato de tarjeta en el DOM
    el('modalPago').addEventListener('hidden.bs.modal', () => { f.reset(); });
  }

  async function enviar(e) {
    e.preventDefault();
    const f = e.target; setError('');
    const metodo = f.metodo.value;
    f.classList.add('was-validated');
    if (!f.checkValidity()) return;
    const body = { metodo };
    if (metodo === 'TARJETA') {
      body.tarjeta = { titular: f.titular.value.trim(), numero: f.numero.value, vencimiento: f.vencimiento.value, cvv: f.cvv.value };
    }
    setCargando(true);
    try {
      const r = await api(`/reservas/${ctx.reserva.id}/pagar`, { method: 'POST', body });
      f.reset(); // borra tarjeta/CVV del formulario
      mostrarRecibo(r.pago);
      if (ctx.onPagado) ctx.onPagado(r);
    } catch (err) {
      setError(err.message); // el modal sigue abierto para probar con otra tarjeta
      if (ctx.onPagado && /ya está pagada|cancelada|no tiene costo/.test(err.message)) ctx.onPagado(null);
    } finally { setCargando(false); }
  }

  function mostrarRecibo(p) {
    el('formPago').classList.add('d-none'); el('pagoRecibo').classList.remove('d-none');
    el('rcMonto').textContent = fmtMoneda(p.monto);
    el('rcDetalle').innerHTML = `
      <dt class="col-5">Reserva</dt><dd class="col-7">#${p.reserva_id}</dd>
      <dt class="col-5">Medio</dt><dd class="col-7">${medio(p)}</dd>
      <dt class="col-5">Referencia</dt><dd class="col-7"><code>${esc(p.referencia)}</code></dd>
      <dt class="col-5">Fecha</dt><dd class="col-7">${fmtFechaHora(p.created_at)}</dd>`;
  }

  /** Abre el modal para pagar el saldo de `reserva` (objeto del listado de reservas). */
  async function abrir(reserva, onPagado) {
    ctx = { reserva, onPagado };
    ligar();
    if (!sim) {
      try {
        sim = await api('/pagos/simulador');
        el('pagoPrueba').innerHTML = '<option value="">Rellenar con una tarjeta de prueba…</option>'
          + sim.tarjetas_prueba.map((t, i) => `<option value="${i}">${esc(t.etiqueta)} · ${esc(t.numero)}</option>`).join('');
      } catch { /* el formulario funciona igual sin el catálogo */ }
    }
    const f = el('formPago');
    f.reset(); f.classList.remove('was-validated', 'd-none'); el('pagoRecibo').classList.add('d-none');
    el('pagoMarca').textContent = '—'; setError('');
    el('pagoTitulo').textContent = `Pagar reserva #${reserva.id}`;
    el('pagoTotal').textContent = fmtMoneda(reserva.monto_total);
    el('pagoPagado').textContent = fmtMoneda(reserva.monto_pagado);
    el('pagoSaldo').textContent = fmtMoneda(reserva.saldo);
    setMetodo('TARJETA'); setCargando(false);
    // Efectivo solo para administradores (el servidor también lo exige). Va DESPUÉS de setCargando, que rehabilita los radios.
    const esAdmin = Session.user.rol === 'ADMIN';
    el('mEfectivo').closest('.btn-group').querySelector('label[for="mEfectivo"]').classList.toggle('d-none', !esAdmin);
    el('mEfectivo').disabled = !esAdmin;
    Layout.modal('modalPago').show();
  }

  return { modalHtml, abrir, badgePago, medio, montoHtml, tablaTransacciones };
})();
