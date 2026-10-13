const { redondear } = require('../utils/helpers');

const RESUMEN = `
  SELECT r.id, r.usuario_id, u.nombre AS usuario_nombre, r.fecha, r.hora_inicio, r.hora_fin,
         r.estado, r.observaciones, r.created_at, r.updated_at,
         COALESCE(SUM(d.cantidad) FILTER (WHERE rc.tipo = 'MESA'), 0)::int  AS cantidad_mesas,
         COALESCE(SUM(d.cantidad) FILTER (WHERE rc.tipo = 'SILLA'), 0)::int AS cantidad_sillas,
         COALESCE(SUM(d.cantidad * d.precio_unitario), 0)::numeric(10,2) AS monto_total,
         (SELECT COALESCE(SUM(CASE WHEN pg.tipo = 'COBRO' THEN pg.monto ELSE -pg.monto END), 0)
            FROM pagos pg WHERE pg.reserva_id = r.id AND pg.estado = 'APROBADO')::numeric(10,2) AS monto_pagado,
         EXISTS (SELECT 1 FROM pagos pg WHERE pg.reserva_id = r.id AND pg.tipo = 'REEMBOLSO' AND pg.estado = 'APROBADO') AS tiene_reembolso,
         (SELECT p.id FROM prestamos p WHERE p.reserva_id = r.id) AS prestamo_id
    FROM reservas r
    JOIN usuarios u ON u.id = r.usuario_id
    LEFT JOIN reserva_detalle d ON d.reserva_id = r.id
    LEFT JOIN recursos rc ON rc.id = d.recurso_id`;

/**
 * Agrega saldo y estado_pago (derivados, no se guardan):
 *   SIN_COSTO | PENDIENTE (por pagar) | PARCIAL | PAGADO | REEMBOLSADO (cancelada con devolución) | NO_APLICA
 */
const decorar = (r) => {
  if (!r) return r;
  const saldo = r.estado === 'CANCELADA' ? 0 : Math.max(0, redondear(r.monto_total - r.monto_pagado));
  let estadoPago;
  if (r.estado === 'CANCELADA') estadoPago = r.tiene_reembolso ? 'REEMBOLSADO' : 'NO_APLICA';
  else if (r.monto_total <= 0) estadoPago = 'SIN_COSTO';
  else if (saldo <= 0) estadoPago = 'PAGADO';
  else estadoPago = r.monto_pagado > 0 ? 'PARCIAL' : 'PENDIENTE';
  return { ...r, saldo, estado_pago: estadoPago };
};

const listar = async (db, { usuarioId, estado, q, fecha }) => {
  const where = []; const p = [];
  if (usuarioId) { p.push(usuarioId); where.push(`r.usuario_id = $${p.length}`); }
  if (estado)    { p.push(estado);    where.push(`r.estado = $${p.length}::estado_reserva`); }
  if (fecha)     { p.push(fecha);     where.push(`r.fecha = $${p.length}::date`); }
  if (q) {
    p.push(`%${q}%`);
    where.push(`(u.nombre ILIKE $${p.length} OR r.observaciones ILIKE $${p.length} OR r.id::text ILIKE $${p.length})`);
  }
  const sql = `${RESUMEN} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               GROUP BY r.id, u.nombre ORDER BY r.fecha DESC, r.id DESC`;
  return (await db.query(sql, p)).rows.map(decorar);
};

const resumen = async (db, id) =>
  decorar((await db.query(`${RESUMEN} WHERE r.id = $1 GROUP BY r.id, u.nombre`, [id])).rows[0]);

const porIdBloqueada = async (db, id) =>
  (await db.query('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [id])).rows[0];

const detalle = async (db, id) =>
  (await db.query(
    `SELECT d.recurso_id, rc.tipo, d.cantidad, d.precio_unitario
       FROM reserva_detalle d JOIN recursos rc ON rc.id = d.recurso_id
      WHERE d.reserva_id = $1 ORDER BY d.recurso_id`, [id])).rows;

const existeDuplicada = async (db, { usuarioId, fecha, horaInicio, horaFin, excluirId = 0 }) =>
  (await db.query(
    `SELECT 1 FROM reservas
      WHERE usuario_id = $1 AND fecha = $2 AND hora_inicio = $3 AND hora_fin = $4
        AND estado IN ('PENDIENTE','CONFIRMADA') AND id <> $5`,
    [usuarioId, fecha, horaInicio, horaFin, excluirId])).rowCount > 0;

const insertar = async (db, { usuarioId, fecha, horaInicio, horaFin, estado, observaciones }) =>
  (await db.query(
    `INSERT INTO reservas (usuario_id, fecha, hora_inicio, hora_fin, estado, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [usuarioId, fecha, horaInicio, horaFin, estado, observaciones])).rows[0];

const actualizarCampos = async (db, id, { fecha, horaInicio, horaFin, observaciones }) =>
  db.query(
    `UPDATE reservas SET fecha=$2, hora_inicio=$3, hora_fin=$4, observaciones=$5, updated_at=now() WHERE id=$1`,
    [id, fecha, horaInicio, horaFin, observaciones]);

const cambiarEstado = async (db, id, estado) =>
  db.query('UPDATE reservas SET estado = $2, updated_at = now() WHERE id = $1', [id, estado]);

/** Inserta/actualiza una línea. El precio solo se fija al CREAR la línea (al actualizar se conserva el original). */
const guardarDetalle = async (db, reservaId, recursoId, cantidad, precio = 0) => {
  if (cantidad > 0) {
    await db.query(
      `INSERT INTO reserva_detalle (reserva_id, recurso_id, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)
       ON CONFLICT (reserva_id, recurso_id) DO UPDATE SET cantidad = EXCLUDED.cantidad`,
      [reservaId, recursoId, cantidad, precio]);
  } else {
    await db.query('DELETE FROM reserva_detalle WHERE reserva_id=$1 AND recurso_id=$2', [reservaId, recursoId]);
  }
};

/** Total a pagar de una reserva (suma de cantidad × precio congelado de cada línea). */
const total = async (db, id) => {
  const { rows: [r] } = await db.query(
    'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS t FROM reserva_detalle WHERE reserva_id = $1', [id]);
  return redondear(r.t);
};

module.exports = { listar, resumen, porIdBloqueada, detalle, existeDuplicada, insertar,
                   actualizarCampos, cambiarEstado, guardarDetalle, total };
