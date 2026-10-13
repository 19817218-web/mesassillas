let lista = [];

async function cargar() {
  try {
    lista = await api('/usuarios', { params: { q: document.getElementById('fQ').value.trim() } });
    document.getElementById('tbody').innerHTML = lista.length ? lista.map((u) => `
      <tr><td>${u.id}</td><td class="fw-semibold">${esc(u.nombre)}</td><td>${esc(u.email)}</td><td>${badge(u.rol)}</td>
        <td>${u.activo ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Desactivado</span>'}</td>
        <td class="small text-muted d-none d-md-table-cell">${fmtFecha(u.created_at)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-primary btn-icon" data-a="editar" data-id="${u.id}" title="Editar"><i class="bi bi-pencil"></i></button>
          ${u.id !== Session.user.id ? `<button class="btn btn-sm btn-outline-${u.activo ? 'danger' : 'success'} btn-icon" data-a="toggle" data-id="${u.id}" title="${u.activo ? 'Desactivar' : 'Activar'}"><i class="bi bi-${u.activo ? 'person-x' : 'person-check'}"></i></button>` : ''}
        </td></tr>`).join('') : Layout.vacio(7, 'No hay usuarios', 'people');
  } catch (e) { Layout.toast(e.message, 'error'); }
}

function abrir(u) {
  const f = document.getElementById('formUsr');
  f.reset(); f.classList.remove('was-validated');
  document.getElementById('usrTitulo').textContent = u ? `Editar usuario #${u.id}` : 'Nuevo usuario';
  f.uid.value = u ? u.id : '';
  f.nombre.value = u ? u.nombre : '';
  f.email.value = u ? u.email : '';
  f.email.disabled = !!u;
  f.rol.value = u ? u.rol : 'USER';
  f.rol.disabled = !!u && u.id === Session.user.id;
  f.password.required = !u;
  document.getElementById('passAyuda').textContent = u ? 'Déjala vacía para conservar la contraseña actual.' : 'Mínimo 8 caracteres.';
  Layout.modal('modalUsr').show();
}

async function guardar(e) {
  e.preventDefault();
  const f = e.target;
  f.classList.add('was-validated');
  if (!f.checkValidity()) return;
  const id = f.uid.value;
  const body = { nombre: f.nombre.value.trim(), rol: f.rol.value };
  if (f.password.value) body.password = f.password.value;
  if (!id) body.email = f.email.value.trim();
  const ok = await Layout.ejecutar(() => api(id ? `/usuarios/${id}` : '/usuarios', { method: id ? 'PUT' : 'POST', body }),
    id ? 'Usuario actualizado' : 'Usuario creado');
  if (ok) { Layout.modal('modalUsr').hide(); cargar(); }
}

async function alternar(u) {
  const accion = u.activo ? 'desactivar' : 'activar';
  if (!(await Layout.confirmar(`¿Quieres ${accion} a ${u.nombre}?`, { titulo: `${accion[0].toUpperCase()}${accion.slice(1)} usuario`, boton: accion[0].toUpperCase() + accion.slice(1), peligro: u.activo }))) return;
  if (await Layout.ejecutar(() => api(`/usuarios/${u.id}`, { method: 'PUT', body: { activo: !u.activo } }), `Usuario ${u.activo ? 'desactivado' : 'activado'}`)) cargar();
}

const html = `
  <div class="card-soft mb-3 p-3"><div class="toolbar">
    <input class="form-control" id="fQ" placeholder="Buscar por nombre o correo…">
    <button class="btn btn-primary ms-auto" id="btnNuevo"><i class="bi bi-person-plus"></i> Nuevo usuario</button>
  </div></div>
  <div class="card-soft"><div class="table-responsive"><table class="table table-hover mb-0">
    <thead><tr><th>#</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th class="d-none d-md-table-cell">Alta</th><th></th></tr></thead>
    <tbody id="tbody"></tbody></table></div></div>

  <div class="modal fade" id="modalUsr" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><form class="modal-content" id="formUsr" novalidate>
    <div class="modal-header"><h5 class="modal-title" id="usrTitulo"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><input type="hidden" name="uid">
      <div class="mb-3"><label class="form-label">Nombre</label><input class="form-control" name="nombre" required maxlength="120"></div>
      <div class="mb-3"><label class="form-label">Correo</label><input type="email" class="form-control" name="email" required></div>
      <div class="mb-3"><label class="form-label">Rol</label><select class="form-select" name="rol"><option value="USER">Usuario</option><option value="ADMIN">Administrador</option></select></div>
      <div><label class="form-label">Contraseña</label><input type="password" class="form-control" name="password" minlength="8" autocomplete="new-password"><div class="form-text" id="passAyuda"></div></div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Guardar</button></div>
  </form></div></div>`;

if (Layout.mount('Usuarios', html, { admin: true })) {
  document.getElementById('btnNuevo').onclick = () => abrir(null);
  document.getElementById('formUsr').onsubmit = guardar;
  document.getElementById('fQ').oninput = debounce(cargar);
  document.getElementById('tbody').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const u = lista.find((x) => x.id === Number(b.dataset.id));
    if (b.dataset.a === 'editar') abrir(u); else alternar(u);
  });
  cargar();
}
