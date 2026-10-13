/** Convierte {mesas, sillas} en [{tipo, cantidad}] ignorando ceros. */
function aItems({ mesas = 0, sillas = 0 }) {
  const items = [];
  if (mesas > 0) items.push({ tipo: 'MESA', cantidad: mesas });
  if (sillas > 0) items.push({ tipo: 'SILLA', cantidad: sillas });
  return items;
}

const NOMBRES = { MESA: 'mesas', SILLA: 'sillas' };

function describir(items) {
  return items.map((i) => `${i.cantidad} ${NOMBRES[i.tipo]}`).join(' y ');
}

/** Redondea a 2 decimales (centavos) evitando errores de coma flotante. */
const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** 55 -> "$55.00" */
const dinero = (n) => `$${redondear(n).toFixed(2)}`;

module.exports = { aItems, describir, NOMBRES, redondear, dinero };

const AppError = require('./AppError');
/** Valida que valor (si viene) pertenezca a la lista; devuelve undefined si está vacío. */
function oneOf(valor, lista, nombre) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const v = String(valor).toUpperCase();
  if (!lista.includes(v)) throw new AppError(`${nombre} inválido. Valores permitidos: ${lista.join(', ')}`);
  return v;
}
module.exports.oneOf = oneOf;
