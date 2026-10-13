const { pool, withTransaction } = require('../config/db');
const Reserva = require('../models/reserva.model');
const Pago = require('../models/pago.model');
const Mov = require('../models/movimiento.model');
const Pasarela = require('./pasarela.simulada');
const AppError = require('../utils/AppError');
const V = require('../utils/validators');
const { oneOf, redondear, dinero } = require('../utils/helpers');

const MONEDA = 'USD';
const METODOS = ['TARJETA', 'EFECTIVO'];
const TIPOS = ['COBRO', 'REEMBOLSO'];
const ESTADOS = ['APROBADO', 'RECHAZADO'];
const esAdmin = (u) => u.rol === 'ADMIN';
const medio = (p) => (p.metodo === 'TARJETA' ? `tarjeta ${p.tarjeta_marca} ••${p.tarjeta_ultimos4}` : 'efectivo');

// ---------------------------------------------------------------- información del simulador
function simulador() {
  return { modo: 'SIMULACION', moneda: MONEDA, metodos: METODOS, tarjetas_prueba: Pasarela.TARJETAS_PRUEBA };
}

// ---------------------------------------------------------------- cobrar una reserva
/**
 * Cobra el SALDO PENDIENTE de una reserva.
 *  - El monto lo calcula SIEMPRE el servidor (total de la reserva - lo ya pagado); el cliente no lo envía.
 *  - La fila de la reserva queda bloqueada durante todo el cobro: dos clics / dos pestañas no pueden cobrar dos veces.
 *  - Un rechazo de la tarjeta se REGISTRA (queda en el libro) y luego se responde con 402.
 */
async function cobrar(actor, reservaId, body = {}) {
  const metodo = oneOf(body.metodo, METODOS, 'Método de pago');
  if (!metodo) throw new AppError('El método de pago es obligatorio (TARJETA o EFECTIVO)');
  if (metodo === 'EFECTIVO' && !esAdmin(actor)) {
    throw new AppError('Solo un administrador puede registrar pagos en efectivo', 403);
  }
  // Se valida el formato ANTES de abrir la transacción: datos inválidos no bloquean nada ni generan transacción.
  const tarjeta = metodo === 'TARJETA' ? Pasarela.validarTarjeta(body.tarjeta) : null;

  const pagoId = await withTransaction(async (db) => {
    const r = await Reserva.porIdBloqueada(db, reservaId);
    if (!r) throw new AppError('Reserva inexistente', 404);
    if (!esAdmin(actor) && r.usuario_id !== actor.id) throw new AppError('No puedes pagar reservas de otros usuarios', 403);
    if (r.estado === 'CANCELADA') throw new AppError('No se puede pagar una reserva cancelada', 409);

    const total = await Reserva.total(db, reservaId);
    if (total <= 0) throw new AppError('Esta reserva no tiene costo, no requiere pago', 409);
    const pagado = await Pago.neto(db, reservaId);
    const saldo = redondear(total - pagado);
    if (saldo <= 0) throw new AppError('Esta reserva ya está pagada', 409);

    const resultado = tarjeta ? await Pasarela.autorizar(tarjeta, saldo) : { aprobado: true };
    const id = await Pago.insertar(db, {
      reserva_id: reservaId, registrado_por: actor.id, tipo: 'COBRO', metodo,
      estado: resultado.aprobado ? 'APROBADO' : 'RECHAZADO', monto: saldo, moneda: MONEDA,
      referencia: Pasarela.referencia(metodo === 'TARJETA' ? 'SIM' : 'EFE'),
      tarjeta_marca: tarjeta ? resultado.marca : null, tarjeta_ultimos4: tarjeta ? resultado.ultimos4 : null,
      codigo_error: resultado.codigo, mensaje: resultado.mensaje,
    });
    if (resultado.aprobado) {
      const p = await Pago.porId(db, id);
      await Mov.registrar(db, {
        usuario_id: actor.id, tipo: 'PAGO', cantidad: 0, reserva_id: reservaId,
        estado_anterior: pagado > 0 ? 'PARCIAL' : 'PENDIENTE', estado_posterior: 'PAGADO',
        descripcion: `Pago de ${dinero(saldo)} de la reserva #${reservaId} con ${medio(p)} (ref ${p.referencia})`,
      });
    }
    return id;
  });

  // Fuera de la transacción: el rechazo ya quedó guardado (un throw dentro habría hecho ROLLBACK).
  const pago = await Pago.porId(pool, pagoId);
  if (pago.estado === 'RECHAZADO') throw new AppError(`Pago rechazado: ${pago.mensaje}`, 402);
  return { pago, reserva: await Reserva.resumen(pool, reservaId) };
}

// ---------------------------------------------------------------- reembolsos (uso interno, dentro de la transacción del llamador)
async function reembolsar(db, actor, reservaId, monto, motivo, estadoPosterior) {
  const origen = await Pago.ultimoCobro(db, reservaId);
  if (!origen) return null; // nada que devolver
  const id = await Pago.insertar(db, {
    reserva_id: reservaId, registrado_por: actor.id, tipo: 'REEMBOLSO', metodo: origen.metodo,
    estado: 'APROBADO', monto, moneda: MONEDA, referencia: Pasarela.referencia('REM'),
    tarjeta_marca: origen.tarjeta_marca, tarjeta_ultimos4: origen.tarjeta_ultimos4,
    mensaje: motivo, pago_origen_id: origen.id,
  });
  const p = await Pago.porId(db, id);
  await Mov.registrar(db, {
    usuario_id: actor.id, tipo: 'REEMBOLSO', cantidad: 0, reserva_id: reservaId,
    estado_anterior: 'PAGADO', estado_posterior: estadoPosterior,
    descripcion: `Reembolso de ${dinero(monto)} de la reserva #${reservaId} a ${medio(p)} (ref ${p.referencia}): ${motivo}`,
  });
  return p;
}

/** Devuelve TODO lo pagado (al cancelar una reserva). Devuelve el monto reembolsado (0 si no había pagos). */
async function reembolsarTodo(db, actor, reservaId, motivo) {
  const pagado = await Pago.neto(db, reservaId);
  if (pagado <= 0) return 0;
  await reembolsar(db, actor, reservaId, pagado, motivo, 'REEMBOLSADO');
  return pagado;
}

/**
 * Tras modificar cantidades: si lo pagado supera el nuevo total se reembolsa la diferencia automáticamente.
 * Si el nuevo total es MAYOR, no se cobra nada solo: la reserva queda con saldo pendiente (pago PARCIAL).
 */
async function ajustarTrasModificacion(db, actor, reservaId) {
  const total = await Reserva.total(db, reservaId);
  const pagado = await Pago.neto(db, reservaId);
  const exceso = redondear(pagado - total);
  if (exceso > 0) await reembolsar(db, actor, reservaId, exceso, `Ajuste por modificación de la reserva #${reservaId}`, 'PAGADO');
  return exceso > 0 ? exceso : 0;
}

// ---------------------------------------------------------------- consultas
async function listar(actor, query) {
  const f = {
    usuarioId: esAdmin(actor) ? (query.usuario_id ? V.id(query.usuario_id, 'usuario_id') : undefined) : actor.id,
    reservaId: query.reserva_id ? V.id(query.reserva_id, 'reserva_id') : undefined,
    tipo: oneOf(query.tipo, TIPOS, 'Tipo'),
    estado: oneOf(query.estado, ESTADOS, 'Estado'),
    metodo: oneOf(query.metodo, METODOS, 'Método'),
    desde: query.desde ? V.fecha(query.desde, 'La fecha inicial') : undefined,
    hasta: query.hasta ? V.fecha(query.hasta, 'La fecha final') : undefined,
    q: V.texto(query.q, 'La búsqueda', { max: 80 }) || undefined,
  };
  const limit = V.entero(query.limit, 'limit', { min: 1, max: 500 }) ?? 200;
  const offset = V.entero(query.offset, 'offset', { min: 0 }) ?? 0;
  const [pagos, resumen] = await Promise.all([Pago.listar(pool, f, { limit, offset }), Pago.resumen(pool, f)]);
  return { pagos, resumen };
}

module.exports = { simulador, cobrar, reembolsarTodo, ajustarTrasModificacion, listar };
