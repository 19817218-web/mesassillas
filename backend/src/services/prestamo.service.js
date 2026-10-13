const { pool, withTransaction } = require('../config/db');
const Recurso = require('../models/recurso.model');
const Reserva = require('../models/reserva.model');
const Prestamo = require('../models/prestamo.model');
const Devolucion = require('../models/devolucion.model');
const Mov = require('../models/movimiento.model');
const Usuario = require('../models/usuario.model');
const AppError = require('../utils/AppError');
const V = require('../utils/validators');
const { aItems, describir, NOMBRES, oneOf } = require('../utils/helpers');

const ESTADOS = ['PENDIENTE', 'ACTIVO', 'PARCIALMENTE_DEVUELTO', 'DEVUELTO', 'VENCIDO'];
const esAdmin = (u) => u.rol === 'ADMIN';

async function listar(actor, query) {
  await Prestamo.marcarVencidos(pool);
  return Prestamo.listar(pool, {
    usuarioId: esAdmin(actor) ? (query.usuario_id ? V.id(query.usuario_id, 'usuario_id') : undefined) : actor.id,
    estado: oneOf(query.estado, ESTADOS, 'Estado'),
    q: V.texto(query.q, 'La búsqueda', { max: 80 }) || undefined,
  });
}

async function obtener(actor, id) {
  await Prestamo.marcarVencidos(pool);
  const p = await Prestamo.resumen(pool, id);
  if (!p) throw new AppError('Préstamo inexistente', 404);
  if (!esAdmin(actor) && p.usuario_id !== actor.id) throw new AppError('No puedes ver préstamos de otros usuarios', 403);
  p.detalle = await Prestamo.detalle(pool, id);
  p.devoluciones = await Devolucion.listar(pool, { prestamoId: id });
  return p;
}

async function crear(actor, body) {
  const fechaPrestamo = body.fecha_prestamo ? V.fechaHora(body.fecha_prestamo, 'La fecha del préstamo') : new Date();
  const fechaPrevista = V.fechaHora(body.fecha_prevista_devolucion, 'La fecha prevista de devolución');
  if (fechaPrevista < fechaPrestamo) throw new AppError('La fecha prevista de devolución no puede ser anterior a la fecha del préstamo');
  const observaciones = V.texto(body.observaciones, 'Las observaciones', { max: 500 });

  const id = await withTransaction(async (db) => {
    let usuarioId; let items; let reserva = null;

    if (body.reserva_id) {
      reserva = await Reserva.porIdBloqueada(db, V.id(body.reserva_id, 'reserva_id'));
      if (!reserva) throw new AppError('Reserva inexistente', 404);
      if (reserva.estado === 'CANCELADA') throw new AppError('No se puede prestar una reserva cancelada', 409);
      if (reserva.estado === 'FINALIZADA') throw new AppError('Esa reserva ya fue convertida en préstamo', 409);
      if (reserva.estado !== 'CONFIRMADA') throw new AppError('Solo se pueden convertir en préstamo reservas CONFIRMADAS', 409);
      usuarioId = reserva.usuario_id;
      items = (await Reserva.detalle(db, reserva.id)).map((d) => ({ tipo: d.tipo, cantidad: d.cantidad }));
    } else {
      usuarioId = V.id(body.usuario_id, 'usuario_id');
      const u = await Usuario.porId(db, usuarioId);
      if (!u || !u.activo) throw new AppError('El usuario indicado no existe o está desactivado', 404);
      items = aItems(V.cantidades(body));
    }

    const inv = await Recurso.bloquearTodos(db);
    for (const it of items) {
      const r = inv[it.tipo];
      if (!r || r.estado !== 'ACTIVO') throw new AppError(`El recurso ${it.tipo} no está habilitado`, 409);
      if (!reserva && r.cantidad_disponible < it.cantidad) {
        throw new AppError(`Disponibilidad insuficiente de ${NOMBRES[it.tipo]}: solicitadas ${it.cantidad}, disponibles ${r.cantidad_disponible}`, 409);
      }
    }
    // Con reserva: reservada -> prestada.  Directo: disponible -> prestada.
    for (const it of items) {
      await Recurso.aplicar(db, inv[it.tipo].id, reserva ? 0 : -it.cantidad, reserva ? -it.cantidad : 0, it.cantidad);
    }

    const p = await Prestamo.insertar(db, {
      usuarioId, reservaId: reserva?.id, registradoPor: actor.id, fechaPrestamo,
      fechaPrevista, observaciones,
    });
    for (const it of items) await Prestamo.insertarDetalle(db, p.id, inv[it.tipo].id, it.cantidad);
    if (reserva) await Reserva.cambiarEstado(db, reserva.id, 'FINALIZADA');

    for (const it of items) {
      await Mov.registrar(db, {
        usuario_id: actor.id, tipo: 'PRESTAMO', recurso_id: inv[it.tipo].id, cantidad: it.cantidad,
        estado_anterior: reserva ? 'CONFIRMADA' : null, estado_posterior: 'ACTIVO',
        reserva_id: reserva?.id ?? null, prestamo_id: p.id,
        descripcion: reserva
          ? `Reserva #${reserva.id} convertida en préstamo #${p.id}: ${describir(items)}`
          : `Préstamo directo #${p.id}: ${describir(items)}`,
      });
    }
    return p.id;
  });
  return obtener(actor, id);
}

async function actualizar(actor, id, body) {
  await withTransaction(async (db) => {
    const p = await Prestamo.porIdBloqueado(db, id);
    if (!p) throw new AppError('Préstamo inexistente', 404);
    if (p.estado === 'DEVUELTO') throw new AppError('El préstamo ya fue devuelto por completo y no puede modificarse', 409);

    const fechaPrevista = body.fecha_prevista_devolucion !== undefined
      ? V.fechaHora(body.fecha_prevista_devolucion, 'La fecha prevista de devolución') : p.fecha_prevista_devolucion;
    if (fechaPrevista < p.fecha_prestamo) throw new AppError('La fecha prevista de devolución no puede ser anterior a la fecha del préstamo');
    const observaciones = body.observaciones !== undefined ? V.texto(body.observaciones, 'Las observaciones', { max: 500 }) : p.observaciones;

    const det = await Prestamo.detalle(db, id);
    const algoDevuelto = det.some((d) => d.cantidad_devuelta > 0);
    let estado = p.estado;
    if (p.estado !== 'PENDIENTE') {
      estado = fechaPrevista < new Date() ? 'VENCIDO' : (algoDevuelto ? 'PARCIALMENTE_DEVUELTO' : 'ACTIVO');
    }
    await Prestamo.actualizar(db, id, { fechaPrevista, observaciones, estado });
    await Mov.registrar(db, {
      usuario_id: actor.id, tipo: 'MODIFICACION', cantidad: 0, estado_anterior: p.estado, estado_posterior: estado,
      prestamo_id: id, reserva_id: p.reserva_id,
      descripcion: `Préstamo #${id} modificado (fecha prevista u observaciones)`,
    });
  });
  return obtener(actor, id);
}

module.exports = { listar, obtener, crear, actualizar };
