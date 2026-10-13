/* ===== Sesión, llamadas a la API y utilidades de formato (compartido por todas las páginas) ===== */
const Session = {
  get token() { return localStorage.getItem('token'); },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  set(token, user) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); },
};

async function api(path, { method = 'GET', body, params } = {}) {
  let url = '/api' + path;
  if (params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v); });
    const s = q.toString();
    if (s) url += '?' + s;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (Session.token) headers.Authorization = 'Bearer ' + Session.token;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No se pudo conectar con el servidor');
  }
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    Session.clear();
    location.href = 'login.html';
    throw new Error('Tu sesión expiró');
  }
  if (!res.ok || !json || json.ok === false) throw new Error((json && json.error) || 'Error del servidor');
  return json.data;
}

/* ---------- formato ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtFecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');
const fmtHora = (h) => (h ? String(h).slice(0, 5) : '');
const fmtFechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtMoneda = (n) => Number(n || 0).toLocaleString('es-SV', { style: 'currency', currency: 'USD' });
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const aInputLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

const BADGES = {
  PENDIENTE: 'warning text-dark', CONFIRMADA: 'success', CANCELADA: 'secondary', FINALIZADA: 'dark',
  ACTIVO: 'primary', PARCIALMENTE_DEVUELTO: 'info text-dark', DEVUELTO: 'success', VENCIDO: 'danger',
  INACTIVO: 'secondary', ADMIN: 'dark', USER: 'secondary',
  RESERVA: 'primary', CANCELACION: 'secondary', PRESTAMO: 'info text-dark', DEVOLUCION: 'success',
  DEVOLUCION_PARCIAL: 'warning text-dark', MODIFICACION: 'dark',
  PAGO: 'success', REEMBOLSO: 'warning text-dark', COBRO: 'primary', APROBADO: 'success', RECHAZADO: 'danger',
};
const badge = (e) => `<span class="badge text-bg-${BADGES[e] || 'secondary'}">${esc(String(e || '').replace(/_/g, ' '))}</span>`;

const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
