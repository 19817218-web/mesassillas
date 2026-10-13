/* ===== Barra lateral, navbar, alertas y modal de confirmación ===== */
const Layout = (() => {
  const NAV = [
    { href: 'dashboard.html', icon: 'speedometer2', text: 'Dashboard' },
    { href: 'inventario.html', icon: 'box-seam', text: 'Inventario' },
    { href: 'reservas.html', icon: 'calendar-check', text: 'Reservas' },
    { href: 'prestamos.html', icon: 'arrow-left-right', text: 'Préstamos' },
    { href: 'devoluciones.html', icon: 'arrow-return-left', text: 'Devoluciones' },
    { href: 'pagos.html', icon: 'credit-card-2-front', text: 'Pagos' },
    { href: 'historial.html', icon: 'clock-history', text: 'Historial', admin: true },
    { href: 'usuarios.html', icon: 'people', text: 'Usuarios', admin: true },
  ];

  /** Dibuja el armazón de la página. Devuelve false si redirige (sin sesión / sin permiso). */
  function mount(title, contentHtml, { admin = false } = {}) {
    const u = Session.user;
    if (!Session.token || !u) { location.href = 'login.html'; return false; }
    if (admin && u.rol !== 'ADMIN') { location.href = 'dashboard.html'; return false; }
    const actual = location.pathname.split('/').pop() || 'index.html';
    const links = NAV.filter((n) => !n.admin || u.rol === 'ADMIN').map((n) => `
      <a class="nav-link ${actual === n.href ? 'active' : ''}" href="${n.href}"><i class="bi bi-${n.icon}"></i>${n.text}</a>`).join('');

    document.title = `${title} · Mesas y Sillas`;
    document.getElementById('app').innerHTML = `
      <nav class="navbar topbar sticky-top">
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-light d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#sidebar" aria-label="Menú"><i class="bi bi-list fs-5"></i></button>
          <a class="brand" href="dashboard.html"><i class="bi bi-grid-3x3-gap-fill"></i><span>Mesas y Sillas</span></a>
        </div>
        <div class="d-flex align-items-center gap-2">
          <div class="text-end d-none d-sm-block lh-sm">
            <div class="fw-semibold small">${esc(u.nombre)}</div>
            <div class="text-muted" style="font-size:.75rem">${u.rol === 'ADMIN' ? 'Administrador' : 'Usuario'}</div>
          </div>
          <button class="btn btn-outline-secondary btn-sm" id="btnLogout"><i class="bi bi-box-arrow-right"></i><span class="d-none d-md-inline"> Salir</span></button>
        </div>
      </nav>
      <div class="layout">
        <aside class="offcanvas-lg offcanvas-start sidebar" tabindex="-1" id="sidebar">
          <div class="offcanvas-header d-lg-none">
            <h6 class="offcanvas-title text-white">Menú</h6>
            <button class="btn-close btn-close-white" data-bs-dismiss="offcanvas" data-bs-target="#sidebar"></button>
          </div>
          <div class="offcanvas-body flex-column px-0 pt-2 pt-lg-3">
            <div class="sidebar-title">Navegación</div>
            <nav class="nav flex-column">${links}</nav>
          </div>
        </aside>
        <main class="content p-3 p-md-4">
          <h1 class="h4 fw-bold mb-3">${esc(title)}</h1>
          ${contentHtml}
        </main>
      </div>
      <div class="toast-container position-fixed top-0 end-0 p-3" id="toasts" style="z-index:2000"></div>
      <div class="modal fade" id="confirmModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
          <div class="modal-header"><h5 class="modal-title" id="confirmTitle">Confirmar</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body" id="confirmBody"></div>
          <div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal">Volver</button><button class="btn btn-primary" id="confirmOk">Aceptar</button></div>
        </div></div>
      </div>`;
    document.getElementById('btnLogout').onclick = () => { Session.clear(); location.href = 'login.html'; };
    return true;
  }

  function toast(msg, tipo = 'success') {
    const colores = { success: 'success', error: 'danger', warning: 'warning', info: 'info' };
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${colores[tipo] || 'success'} border-0`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    document.getElementById('toasts').appendChild(el);
    const t = new bootstrap.Toast(el, { delay: tipo === 'error' ? 6000 : 3500 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  /** Modal de confirmación -> Promise<boolean> */
  function confirmar(mensaje, { titulo = 'Confirmar', boton = 'Aceptar', peligro = false } = {}) {
    return new Promise((resolve) => {
      const el = document.getElementById('confirmModal');
      const modal = bootstrap.Modal.getOrCreateInstance(el);
      el.querySelector('#confirmTitle').textContent = titulo;
      el.querySelector('#confirmBody').textContent = mensaje;
      const ok = el.querySelector('#confirmOk');
      ok.textContent = boton;
      ok.className = `btn btn-${peligro ? 'danger' : 'primary'}`;
      let respondido = false;
      ok.onclick = () => { respondido = true; modal.hide(); resolve(true); };
      el.addEventListener('hidden.bs.modal', () => { if (!respondido) resolve(false); }, { once: true });
      modal.show();
    });
  }

  /** Ejecuta una acción mostrando éxito/error. Devuelve el resultado o undefined si falló. */
  async function ejecutar(fn, okMsg) {
    try {
      const r = await fn();
      if (okMsg) toast(okMsg, 'success');
      return r;
    } catch (e) {
      toast(e.message, 'error');
      return undefined;
    }
  }

  const vacio = (cols, texto = 'Sin registros', icono = 'inbox') =>
    `<tr><td colspan="${cols}"><div class="empty"><i class="bi bi-${icono}"></i>${esc(texto)}</div></td></tr>`;

  const modal = (id) => bootstrap.Modal.getOrCreateInstance(document.getElementById(id));

  return { mount, toast, confirmar, ejecutar, vacio, modal };
})();
