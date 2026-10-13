const AppError = require('./AppError');

const TZ = process.env.APP_TIMEZONE || 'America/El_Salvador';

function hoy() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}

function entero(valor, nombre, { min = 0, max = 1000000, requerido = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw new AppError(`${nombre} es obligatorio`);
    return undefined;
  }
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new AppError(`${nombre} debe ser un número entero`);
  if (n < min) throw new AppError(`${nombre} no puede ser menor a ${min}`);
  if (n > max) throw new AppError(`${nombre} no puede ser mayor a ${max}`);
  return n;
}

/** Importe monetario >= 0 con a lo sumo 2 decimales. */
function precio(valor, nombre, { max = 100000, requerido = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw new AppError(`${nombre} es obligatorio`);
    return undefined;
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new AppError(`${nombre} debe ser un número`);
  if (n < 0) throw new AppError(`${nombre} no puede ser negativo`);
  if (n > max) throw new AppError(`${nombre} no puede ser mayor a ${max}`);
  if (Math.round(n * 100) / 100 !== n) throw new AppError(`${nombre} admite como máximo 2 decimales`);
  return n;
}

function id(valor, nombre = 'id') {
  return entero(valor, nombre, { min: 1, requerido: true });
}

function fecha(valor, nombre = 'fecha') {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new AppError(`${nombre} inválida (formato AAAA-MM-DD)`);
  }
  const d = new Date(valor + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new AppError(`${nombre} inválida`);
  }
  return valor;
}

function hora(valor, nombre = 'hora') {
  if (typeof valor !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor)) {
    throw new AppError(`${nombre} inválida (formato HH:MM)`);
  }
  return valor.slice(0, 5);
}

function fechaHora(valor, nombre = 'fecha') {
  const d = new Date(valor);
  if (valor === undefined || valor === null || valor === '' || Number.isNaN(d.getTime())) {
    throw new AppError(`${nombre} inválida`);
  }
  return d;
}

function email(valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 160) throw new AppError('Correo electrónico inválido');
  return v;
}

function texto(valor, nombre, { max = 500, requerido = false } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (requerido) throw new AppError(`${nombre} es obligatorio`);
    return null;
  }
  const v = String(valor).trim();
  if (v.length > max) throw new AppError(`${nombre} es demasiado largo (máx. ${max})`);
  return v;
}

function password(valor) {
  if (typeof valor !== 'string' || valor.length < 8) throw new AppError('La contraseña debe tener al menos 8 caracteres');
  if (valor.length > 72) throw new AppError('La contraseña es demasiado larga (máx. 72)');
  return valor;
}

/** Lee cantidad_mesas / cantidad_sillas del body. */
function cantidades(body, { exigirAlMenosUna = true } = {}) {
  const mesas = entero(body.cantidad_mesas, 'La cantidad de mesas') ?? 0;
  const sillas = entero(body.cantidad_sillas, 'La cantidad de sillas') ?? 0;
  if (exigirAlMenosUna && mesas + sillas <= 0) throw new AppError('Debes indicar al menos una mesa o una silla');
  return { mesas, sillas };
}

module.exports = { hoy, entero, precio, id, fecha, hora, fechaHora, email, texto, password, cantidades };
