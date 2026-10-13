if (Session.token) location.replace('dashboard.html');

const $ = (id) => document.getElementById(id);
const alerta = (msg) => { $('alerta').textContent = msg; $('alerta').classList.toggle('d-none', !msg); };

document.querySelectorAll('#tabs [data-tab]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('#tabs .nav-link').forEach((x) => x.classList.toggle('active', x === b));
    $('formLogin').classList.toggle('d-none', b.dataset.tab !== 'login');
    $('formRegister').classList.toggle('d-none', b.dataset.tab !== 'register');
    alerta('');
  };
});

async function enviar(btn, path, body) {
  alerta('');
  btn.disabled = true;
  try {
    const r = await api(path, { method: 'POST', body });
    Session.set(r.token, r.usuario);
    location.href = 'dashboard.html';
  } catch (e) {
    alerta(e.message);
    btn.disabled = false;
  }
}

$('formLogin').onsubmit = (e) => {
  e.preventDefault();
  const email = $('lEmail').value.trim(); const password = $('lPass').value;
  if (!email || !password) return alerta('Ingresa tu correo y contraseña');
  enviar($('btnLogin'), '/auth/login', { email, password });
};

$('formRegister').onsubmit = (e) => {
  e.preventDefault();
  const nombre = $('rNombre').value.trim(); const email = $('rEmail').value.trim(); const password = $('rPass').value;
  if (!nombre) return alerta('Ingresa tu nombre');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alerta('Correo inválido');
  if (password.length < 8) return alerta('La contraseña debe tener al menos 8 caracteres');
  enviar($('btnRegister'), '/auth/register', { nombre, email, password });
};
