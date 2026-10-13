const { pool, withTransaction } = require('../config/db');
const Recurso = require('../models/recurso.model');
const Prestamo = require('../models/prestamo.model');
const Devolucion = require('../models/devolucion.model');
const Mov = require('../models/movimiento.model');
const AppError = require('../utils/AppError');
const V = require('../utils/validators');
const { aItems, describir, NOMBRES } = require('../utils/helpers');

const esAdmin = (u) => u.rol === 'ADMIN';

async function listar(actor, query) {
  return Devolucion.listar(pool, {
    usuarioId: esAdmin(actor) ? undefined : actor.id,
    prestamoId: query.prestamo_id ? V.id(query.prestamo_id, 'prestamo_id') : undefined,
  });
}

/** Registra una devolución completa o parcial. */
async function registrar(actor, body) {
  const prestamoId = V.id(body.prestamo_id, 'prestamo_id');
  const items = aItems(V.cantidades(body));
  const fechaReal = body.fecha_real ? V.fechaHora(body.fecha_real, 'La fecha de devolución') : new Date();
  if (fechaReal > new Date(Date.now() + 5 * 60 * 1000)) throw new AppError('La fecha real de devolución no puede ser futura');
  const observaciones = V.texto(body.observaciones, 'Las observaciones', { max: 500 });

  const devolucionId = await withTransaction(async (db) => {
    const p = await Prestamo.porIdBloqueado(db, prestamoId);
    if (!p) throw new AppError('Préstamo inexistente', 404);
    if (p.estado === 'DEVUELTO') throw new AppError('El préstamo ya fue devuelto por completo', 409);
    if (p.estado === 'PENDIENTE') throw new AppError('El préstamo aún no está activo', 409);
    if (fechaReal < new Date(p.fecha_prestamo)) throw new AppError('La fecha de devolución no puede ser anterior al préstamo');

    const det = await Prestamo.detalle(db, prestamoId, { lock: true });
    const porTipo = {};
    det.forEach((d) => { porTipo[d.tipo] = d; });
    for (const it of items) {
      const d = porTipo[it.tipo];
      if (!d) throw new AppError(`El préstamo no incluye ${NOMBRES[it.tipo]}`, 409);
      if (it.cantidad > d.cantidad_pendiente) {
        throw new AppError(`No puedes devolver ${it.cantidad} ${NOMBRES[it.tipo]}: solo hay ${d.cantidad_pendiente} pendientes`, 409);
      }
    }

    const inv = await Recurso.bloquearTodos(db);
    const dv = await Devolucion.insertar(db, { prestamoId, registradoPor: actor.id, fechaReal, observaciones });
    for (const it of items) {
      await Recurso.aplicar(db, inv[it.tipo].id, it.cantidad, 0, -it.cantidad); // prestada -> disponible
      await Prestamo.sumarDevuelto(db, porTipo[it.tipo].id, it.cantidad);
      await Devolucion.insertarDetalle(db, dv.id, inv[it.tipo].id, it.cantidad);
    }

    const pendienteTotal = det.reduce((s, d) => s + d.cantidad_pendiente, 0) - items.reduce((s, i) => s + i.cantidad, 0);
    const completo = pendienteTotal === 0;
    let estado = 'DEVUELTO';
    if (!completo) estado = new Date(p.fecha_prevista_devolucion) < new Date() ? 'VENCIDO' : 'PARCIALMENTE_DEVUELTO';
    await Prestamo.cambiarEstado(db, prestamoId, estado);

    for (const it of items) {
      await Mov.registrar(db, {
        usuario_id: actor.id, tipo: completo ? 'DEVOLUCION' : 'DEVOLUCION_PARCIAL', recurso_id: inv[it.tipo].id,
        cantidad: it.cantidad, estado_anterior: p.estado, estado_posterior: estado,
        reserva_id: p.reserva_id, prestamo_id: prestamoId, devolucion_id: dv.id,
        descripcion: `${completo ? 'Devolución final' : 'Devolución parcial'} del préstamo #${prestamoId}: ${describir(items)}`,
      });
    }
    return dv.id;
  });

  const prestamo = await Prestamo.resumen(pool, prestamoId);
  return { devolucion_id: devolucionId, prestamo };
}

module.exports = { listar, registrar };
