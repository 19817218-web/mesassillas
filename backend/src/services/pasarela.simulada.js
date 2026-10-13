/**
 * PASARELA DE PAGO SIMULADA
 * -------------------------
 * Imita a un procesador de tarjetas SIN mover dinero real ni contactar a ningún tercero.
 *
 *  - validarTarjeta(): validaciones de formato (Luhn, vencimiento, CVV según marca). Si fallan
 *    es un error de DATOS (HTTP 400): no se crea ninguna transacción, igual que en una pasarela real.
 *  - autorizar(): espera un tiempo (latencia simulada) y aprueba o rechaza según el número de tarjeta.
 *
 * Números de prueba (todos pasan Luhn). Cualquier OTRA tarjeta válida se aprueba:
 *    4242 4242 4242 4242  Visa          -> aprobada
 *    5555 5555 5555 4444  Mastercard    -> aprobada
 *    3782 822463 10005    American Exp. -> aprobada (CVV de 4 dígitos)
 *    4000 0000 0000 0002  -> rechazada por el banco emisor
 *    4000 0000 0000 9995  -> fondos insuficientes
 *    4000 0000 0000 0069  -> tarjeta vencida
 *    4000 0000 0000 0127  -> CVC incorrecto
 *
 * SEGURIDAD: el número completo y el CVV solo viven en memoria durante la petición. Nunca se
 * guardan ni se escriben en logs; a la base de datos solo llegan la marca y los últimos 4 dígitos.
 *
 * Para usar una pasarela real en el futuro basta con reemplazar autorizar() (misma firma).
 */
const crypto = require('crypto');
const AppError = require('../utils/AppError');

const ESCENARIOS = {
  '4000000000000002': { codigo: 'card_declined', mensaje: 'La tarjeta fue rechazada por el banco emisor' },
  '4000000000009995': { codigo: 'insufficient_funds', mensaje: 'Fondos insuficientes' },
  '4000000000000069': { codigo: 'expired_card', mensaje: 'La tarjeta está vencida' },
  '4000000000000127': { codigo: 'incorrect_cvc', mensaje: 'El código de seguridad (CVC) es incorrecto' },
};

/** Catálogo que el frontend muestra para rellenar el formulario con un clic. */
const TARJETAS_PRUEBA = [
  { etiqueta: 'Visa · aprobada', numero: '4242 4242 4242 4242', resultado: 'APROBADA' },
  { etiqueta: 'Mastercard · aprobada', numero: '5555 5555 5555 4444', resultado: 'APROBADA' },
  { etiqueta: 'American Express · aprobada (CVV de 4 dígitos)', numero: '3782 822463 10005', resultado: 'APROBADA' },
  { etiqueta: 'Rechazada por el banco', numero: '4000 0000 0000 0002', resultado: 'RECHAZADA' },
  { etiqueta: 'Fondos insuficientes', numero: '4000 0000 0000 9995', resultado: 'RECHAZADA' },
  { etiqueta: 'Tarjeta vencida', numero: '4000 0000 0000 0069', resultado: 'RECHAZADA' },
  { etiqueta: 'CVC incorrecto', numero: '4000 0000 0000 0127', resultado: 'RECHAZADA' },
];

function luhn(numero) {
  let suma = 0;
  let doble = false;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    let d = numero.charCodeAt(i) - 48;
    if (doble) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
    doble = !doble;
  }
  return suma % 10 === 0;
}

function detectarMarca(numero) {
  if (/^4/.test(numero)) return 'VISA';
  if (/^(5[1-5]\d{2}|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(numero)) return 'MASTERCARD';
  if (/^3[47]/.test(numero)) return 'AMEX';
  return 'TARJETA';
}

/**
 * Valida el formato de una tarjeta. Devuelve { numero, ultimos4, marca } o lanza AppError 400.
 * @param {{numero?:string, titular?:string, vencimiento?:string, cvv?:string}} t
 */
function validarTarjeta(t) {
  if (!t || typeof t !== 'object') throw new AppError('Los datos de la tarjeta son obligatorios');

  const numero = String(t.numero ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(numero) || !luhn(numero)) throw new AppError('Número de tarjeta inválido');

  const titular = String(t.titular ?? '').trim();
  if (titular.length < 2 || titular.length > 60) throw new AppError('El nombre del titular es obligatorio (2 a 60 caracteres)');

  const m = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/.exec(String(t.vencimiento ?? '').trim());
  if (!m) throw new AppError('Fecha de vencimiento inválida (formato MM/AA)');
  const mes = Number(m[1]);
  const anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  const ahora = new Date();
  const anioAct = ahora.getUTCFullYear();
  const mesAct = ahora.getUTCMonth() + 1;
  if (anio < anioAct || (anio === anioAct && mes < mesAct)) throw new AppError('La tarjeta está vencida');
  if (anio > anioAct + 20) throw new AppError('Fecha de vencimiento inválida');

  const marca = detectarMarca(numero);
  const cvv = String(t.cvv ?? '').trim();
  if (!(marca === 'AMEX' ? /^\d{4}$/ : /^\d{3}$/).test(cvv)) {
    throw new AppError(`El CVV debe tener ${marca === 'AMEX' ? 4 : 3} dígitos`);
  }

  return { numero, ultimos4: numero.slice(-4), marca };
}

function latencia() {
  const n = Number.parseInt(process.env.PAGO_SIM_LATENCIA_MS, 10);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

/**
 * Simula la autorización del cobro.
 * @returns {Promise<{aprobado:boolean, marca:string, ultimos4:string, codigo?:string, mensaje?:string}>}
 */
async function autorizar(tarjeta /* , monto */) {
  const ms = latencia();
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  const base = { marca: tarjeta.marca, ultimos4: tarjeta.ultimos4 };
  const rechazo = ESCENARIOS[tarjeta.numero];
  return rechazo ? { ...base, aprobado: false, ...rechazo } : { ...base, aprobado: true };
}

/** Referencia única legible: SIM-3F9A1C07B2 (tarjeta) / EFE-... (efectivo) / REM-... (reembolso) */
const referencia = (prefijo) => `${prefijo}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

module.exports = { validarTarjeta, autorizar, referencia, TARJETAS_PRUEBA, _luhn: luhn, _marca: detectarMarca };
