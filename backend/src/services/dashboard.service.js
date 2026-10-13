const { pool } = require('../config/db');
const Recurso = require('../models/recurso.model');
const Prestamo = require('../models/prestamo.model');
const Mov = require('../models/movimiento.model');

const resumenRecurso = (r) => r && ({
  id: r.id, nombre: r.nombre, estado: r.estado, total: r.cantidad_total,
  disponibles: r.cantidad_disponible, reservadas: r.cantidad_reservada, prestadas: r.cantidad_prestada,
});

async function obtener(actor) {
  await Prestamo.marcarVencidos(pool);
  const uid = actor.rol === 'ADMIN' ? null : actor.id;
  const recursos = await Recurso.listar(pool);
  const { rows: [op] } = await pool.query(
    `SELECT
       (SELECT count(*) FROM reservas  WHERE estado = 'PENDIENTE' AND ($1::int IS NULL OR usuario_id = $1))::int AS reservas_pendientes,
       (SELECT count(*) FROM prestamos WHERE estado IN ('ACTIVO','PARCIALMENTE_DEVUELTO') AND ($1::int IS NULL OR usuario_id = $1))::int AS prestamos_activos,
       (SELECT count(*) FROM prestamos WHERE estado = 'VENCIDO' AND ($1::int IS NULL OR usuario_id = $1))::int AS prestamos_vencidos,
       (SELECT count(*) FROM prestamos WHERE estado IN ('ACTIVO','PARCIALMENTE_DEVUELTO','VENCIDO') AND ($1::int IS NULL OR usuario_id = $1))::int AS devoluciones_pendientes`,
    [uid]);
  const data = {
    mesas: resumenRecurso(recursos.find((r) => r.tipo === 'MESA')),
    sillas: resumenRecurso(recursos.find((r) => r.tipo === 'SILLA')),
    operaciones: op,
    actualizado: new Date().toISOString(),
  };
  if (actor.rol === 'ADMIN') data.ultimos_movimientos = await Mov.listar(pool, { limit: 8 });
  return data;
}

module.exports = { obtener };
