const { pool, withTransaction } = require('../config/db');
const Recurso = require('../models/recurso.model');
const Reserva = require('../models/reserva.model');
const Mov = require('../models/movimiento.model');
const Usuario = require('../models/usuario.model');
const PagoService = require('./pago.service');
const AppError = require('../utils/AppError');
const V = require('../utils/validators');
const { aItems, describir, NOMBRES, oneOf } = require('../utils/helpers');

const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'FINALIZADA'];
const esAdmin = (u) => u.rol === 'ADMIN';

async function verificarUsuario(db, id) {
  const u = await Usuario.porId(db, id);
  if (!u || !u.activo) throw new AppError('El usuario indicado no existe o está desactivado', 404);
}

function verificarActivos(inv, items) {
  for (const it of items) {
    const r = inv[it.tipo];
    if (!r || r.estado !== 'ACTIVO') throw new AppError(`El recurso ${it.tipo} no está habilitado`, 409);
  }
}

/** Comprueba disponibilidad (con las filas ya bloqueadas) y mueve disponible -> reservada. */
async function apartarStock(db, inv, items) {
  for (const it of items) {
    const r = inv[it.tipo];
    if (r.cantidad_disponible < it.cantidad) {
      throw new AppError(
        `Disponibilidad insuficiente de ${NOMBRES[it.tipo]}: solicitadas ${it.cantidad}, disponibles ${r.cantidad_disponible}`, 409);
    }
  }
  for (const it of items) await Recurso.aplicar(db, inv[it.tipo].id, -it.cantidad, it.cantidad, 0);
}

async function movimientos(db, actor, tipo, items, inv, reservaId, ant, post, desc) {
  for (const it of items) {
    await Mov.registrar(db, {
      usuario_id: actor.id, tipo, recurso_id: inv[it.tipo].id, cantidad: it.cantidad,
      estado_anterior: ant, estado_posterior: post, reserva_id: reservaId, descripcion: desc,
    });
  }
}

const actuales = (det) => {
  const a = { MESA: 0, SILLA: 0 };
  det.forEach((d) => { a[d.tipo] += d.cantidad; });
  return a;
};

async function cargarPropia(db, actor, id) {
  const r = await Reserva.porIdBloqueada(db, id);
  if (!r) throw new AppError('Reserva inexistente', 404);
  if (!esAdmin(actor) && r.usuario_id !== actor.id) throw new AppError('No puedes operar sobre reservas de otros usuarios', 403);
  return r;
}

// ---------------------------------------------------------------- consultas
async function listar(actor, query) {
  return Reserva.listar(pool, {
    usuarioId: esAdmin(actor) ? (query.usuario_id ? V.id(query.usuario_id, 'usuario_id') : undefined) : actor.id,
    estado: oneOf(query.estado, ESTADOS, 'Estado'),
    q: V.texto(query.q, 'La búsqueda', { max: 80 }) || undefined,
    fecha: query.fecha ? V.fecha(query.fecha) : undefined,
  });
}

async function obtener(actor, id) {
  const r = await Reserva.resumen(pool, id);
  if (!r) throw new AppError('Reserva inexistente', 404);
  if (!esAdmin(actor) && r.usuario_id !== actor.id) throw new AppError('No puedes ver reservas de otros usuarios', 403);
  return r;
}

// ---------------------------------------------------------------- crear
async function crear(actor, body) {
  const usuarioId = esAdmin(actor) && body.usuario_id ? V.id(body.usuario_id, 'usuario_id') : actor.id;
  const fecha = V.fecha(body.fecha, 'La fecha');
  if (fecha < V.hoy()) throw new AppError('La fecha de la reserva no puede ser anterior a hoy');
  const horaInicio = V.hora(body.hora_inicio, 'La hora de inicio');
  const horaFin = V.hora(body.hora_fin, 'La hora de finalización');
  if (horaFin <= horaInicio) throw new AppError('La hora de finalización debe ser posterior a la de inicio');
  const items = aItems(V.cantidades(body));
  const observaciones = V.texto(body.observaciones, 'Las observaciones', { max: 500 });
  const confirmar = esAdmin(actor) && (body.confirmar === true || body.estado === 'CONFIRMADA');
  const estado = confirmar ? 'CONFIRMADA' : 'PENDIENTE';

  const id = await withTransaction(async (db) => {
    await verificarUsuario(db, usuarioId);
    if (await Reserva.existeDuplicada(db, { usuarioId, fecha, horaInicio, horaFin })) {
      throw new AppError('Ya existe una reserva vigente idéntica (mismo usuario, fecha y horario)', 409);
    }
    const inv = await Recurso.bloquearTodos(db);
    verificarActivos(inv, items);
    if (confirmar) await apartarStock(db, inv, items);

    const r = await Reserva.insertar(db, { usuarioId, fecha, horaInicio, horaFin, estado, observaciones });
    for (const it of items) await Reserva.guardarDetalle(db, r.id, inv[it.tipo].id, it.cantidad, inv[it.tipo].precio_unitario);
    await movimientos(db, actor, 'RESERVA', items, inv, r.id, null, estado,
      `Reserva #${r.id} creada${confirmar ? ' y confirmada' : ''}: ${describir(items)}`);
    return r.id;
  });
  return Reserva.resumen(pool, id);
}

// ---------------------------------------------------------------- confirmar
async function confirmar(actor, id) {
  await withTransaction(async (db) => {
    const r = await Reserva.porIdBloqueada(db, id);
    if (!r) throw new AppError('Reserva inexistente', 404);
    if (r.estado === 'CANCELADA') throw new AppError('No se puede confirmar una reserva cancelada', 409);
    if (r.estado !== 'PENDIENTE') throw new AppError(`La reserva ya está ${r.estado.toLowerCase()}`, 409);

    const det = await Reserva.detalle(db, id);
    const items = det.map((d) => ({ tipo: d.tipo, cantidad: d.cantidad }));
    const inv = await Recurso.bloquearTodos(db);
    verificarActivos(inv, items);
    await apartarStock(db, inv, items);
    await Reserva.cambiarEstado(db, id, 'CONFIRMADA');
    await movimientos(db, actor, 'RESERVA', items, inv, id, 'PENDIENTE', 'CONFIRMADA',
      `Reserva #${id} confirmada: ${describir(items)}`);
  });
  return Reserva.resumen(pool, id);
}

// ---------------------------------------------------------------- cancelar (y DELETE)
async function cancelar(actor, id) {
  let reembolsado = 0;
  await withTransaction(async (db) => {
    const r = await cargarPropia(db, actor, id);
    if (r.estado === 'CANCELADA') throw new AppError('La reserva ya está cancelada', 409);
    if (r.estado === 'FINALIZADA') throw new AppError('No se puede cancelar una reserva finalizada (ya fue convertida en préstamo)', 409);

    const det = await Reserva.detalle(db, id);
    const items = det.map((d) => ({ tipo: d.tipo, cantidad: d.cantidad }));
    const inv = await Recurso.bloquearTodos(db);
    if (r.estado === 'CONFIRMADA') {
      for (const it of items) await Recurso.aplicar(db, inv[it.tipo].id, it.cantidad, -it.cantidad, 0);
    }
    await Reserva.cambiarEstado(db, id, 'CANCELADA');
    await movimientos(db, actor, 'CANCELACION', items, inv, id, r.estado, 'CANCELADA',
      `Reserva #${id} cancelada: ${describir(items)}${r.estado === 'CONFIRMADA' ? ' (stock liberado)' : ''}`);
    // Si ya se había pagado, se devuelve todo (simulado) en la misma transacción
    reembolsado = await PagoService.reembolsarTodo(db, actor, id, `Cancelación de la reserva #${id}`);
  });
  return { ...(await Reserva.resumen(pool, id)), reembolsado };
}

// ---------------------------------------------------------------- modificar
async function actualizar(actor, id, body) {
  await withTransaction(async (db) => {
    const r = await cargarPropia(db, actor, id);
    if (!esAdmin(actor) && r.estado !== 'PENDIENTE') throw new AppError('Solo puedes modificar tus reservas pendientes', 403);
    if (!['PENDIENTE', 'CONFIRMADA'].includes(r.estado)) {
      throw new AppError(`No se puede modificar una reserva ${r.estado.toLowerCase()}`, 409);
    }
    const det = await Reserva.detalle(db, id);
    const act = actuales(det);
    const precios = {}; // precio congelado de las líneas que ya existen
    det.forEach((d) => { precios[d.tipo] = d.precio_unitario; });

    const fecha = body.fecha !== undefined ? V.fecha(body.fecha, 'La fecha') : r.fecha;
    if (fecha !== r.fecha && fecha < V.hoy()) throw new AppError('La fecha de la reserva no puede ser anterior a hoy');
    const horaInicio = body.hora_inicio !== undefined ? V.hora(body.hora_inicio, 'La hora de inicio') : r.hora_inicio.slice(0, 5);
    const horaFin = body.hora_fin !== undefined ? V.hora(body.hora_fin, 'La hora de finalización') : r.hora_fin.slice(0, 5);
    if (horaFin <= horaInicio) throw new AppError('La hora de finalización debe ser posterior a la de inicio');
    const observaciones = body.observaciones !== undefined ? V.texto(body.observaciones, 'Las observaciones', { max: 500 }) : r.observaciones;
    const nuevo = {
      MESA: body.cantidad_mesas !== undefined ? (V.entero(body.cantidad_mesas, 'La cantidad de mesas') ?? 0) : act.MESA,
      SILLA: body.cantidad_sillas !== undefined ? (V.entero(body.cantidad_sillas, 'La cantidad de sillas') ?? 0) : act.SILLA,
    };
    if (nuevo.MESA + nuevo.SILLA <= 0) throw new AppError('Debes indicar al menos una mesa o una silla');
    if (await Reserva.existeDuplicada(db, { usuarioId: r.usuario_id, fecha, horaInicio, horaFin, excluirId: id })) {
      throw new AppError('Ya existe otra reserva vigente idéntica (mismo usuario, fecha y horario)', 409);
    }

    const inv = await Recurso.bloquearTodos(db);
    let huboCambioStock = false;
    for (const tipo of ['MESA', 'SILLA']) {
      const delta = nuevo[tipo] - act[tipo];
      if (delta === 0) continue;
      huboCambioStock = true;
      if (delta > 0) verificarActivos(inv, [{ tipo }]);
      if (r.estado === 'CONFIRMADA') {
        if (delta > 0 && inv[tipo].cantidad_disponible < delta) {
          throw new AppError(`Disponibilidad insuficiente de ${NOMBRES[tipo]}: necesitas ${delta} más y hay ${inv[tipo].cantidad_disponible}`, 409);
        }
        await Recurso.aplicar(db, inv[tipo].id, -delta, delta, 0);
      }
      // Línea existente: conserva su precio original. Línea nueva: precio vigente del inventario.
      await Reserva.guardarDetalle(db, id, inv[tipo].id, nuevo[tipo], act[tipo] > 0 ? precios[tipo] : inv[tipo].precio_unitario);
      await Mov.registrar(db, {
        usuario_id: actor.id, tipo: 'MODIFICACION', recurso_id: inv[tipo].id, cantidad: Math.abs(delta),
        estado_anterior: r.estado, estado_posterior: r.estado, reserva_id: id,
        descripcion: `Reserva #${id} modificada: ${NOMBRES[tipo]} ${act[tipo]} → ${nuevo[tipo]}`,
      });
    }
    await Reserva.actualizarCampos(db, id, { fecha, horaInicio, horaFin, observaciones });
    // Si la reserva ya estaba pagada y ahora cuesta menos, se reembolsa la diferencia
    await PagoService.ajustarTrasModificacion(db, actor, id);
    if (!huboCambioStock) {
      await Mov.registrar(db, {
        usuario_id: actor.id, tipo: 'MODIFICACION', cantidad: 0, estado_anterior: r.estado, estado_posterior: r.estado,
        reserva_id: id, descripcion: `Reserva #${id} modificada (fecha, horario u observaciones)`,
      });
    }
  });
  return Reserva.resumen(pool, id);
}

module.exports = { listar, obtener, crear, confirmar, cancelar, actualizar };
