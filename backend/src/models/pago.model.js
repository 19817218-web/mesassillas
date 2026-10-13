// Todas las funciones reciben "db" (pool o client de una transacción)
const { redondear } = require('../utils/helpers');

const SELECT = `
  SELECT p.id, p.reserva_id, p.tipo, p.metodo, p.estado, p.monto, p.moneda, p.referencia,
         p.tarjeta_marca, p.tarjeta_ultimos4, p.codigo_error, p.mensaje, p.pago_origen_id, p.created_at,
         p.registrado_por, ur.nombre AS registrado_por_nombre,
         r.usuario_id, u.nombre AS usuario_nombre
    FROM pagos p
    JOIN reservas r  ON r.id = p.reserva_id
    JOIN usuarios u  ON u.id = r.usuario_id
    JOIN usuarios ur ON ur.id = p.registrado_por`;

const FROM = `
    FROM pagos p
    JOIN reservas r  ON r.id = p.reserva_id
    JOIN usuarios u  ON u.id = r.usuario_id`;

const insertar = async (db, p) =>
  (await db.query(
    `INSERT INTO pagos (reserva_id, registrado_por, tipo, metodo, estado, monto, moneda, referencia,
                        tarjeta_marca, tarjeta_ultimos4, codigo_error, mensaje, pago_origen_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [p.reserva_id, p.registrado_por, p.tipo, p.metodo, p.estado, p.monto, p.moneda ?? 'USD', p.referencia,
     p.tarjeta_marca ?? null, p.tarjeta_ultimos4 ?? null, p.codigo_error ?? null, p.mensaje ?? null,
     p.pago_origen_id ?? null])).rows[0].id;

const porId = async (db, id) =>
  (await db.query(`${SELECT} WHERE p.id = $1`, [id])).rows[0];

/** Dinero neto cobrado de una reserva = cobros aprobados - reembolsos aprobados. */
const neto = async (db, reservaId) => {
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'COBRO' THEN monto ELSE -monto END), 0) AS neto
       FROM pagos WHERE reserva_id = $1 AND estado = 'APROBADO'`, [reservaId]);
  return redondear(r.neto);
};

/** Último cobro aprobado (sirve para saber a qué medio devolver un reembolso). */
const ultimoCobro = async (db, reservaId) =>
  (await db.query(
    `SELECT id, metodo, tarjeta_marca, tarjeta_ultimos4
       FROM pagos WHERE reserva_id = $1 AND tipo = 'COBRO' AND estado = 'APROBADO'
      ORDER BY id DESC LIMIT 1`, [reservaId])).rows[0];

function filtros({ usuarioId, reservaId, tipo, estado, metodo, desde, hasta, q }) {
  const where = []; const p = [];
  if (usuarioId) { p.push(usuarioId); where.push(`r.usuario_id = $${p.length}`); }
  if (reservaId) { p.push(reservaId); where.push(`p.reserva_id = $${p.length}`); }
  if (tipo)      { p.push(tipo);      where.push(`p.tipo = $${p.length}::tipo_pago`); }
  if (estado)    { p.push(estado);    where.push(`p.estado = $${p.length}::estado_transaccion`); }
  if (metodo)    { p.push(metodo);    where.push(`p.metodo = $${p.length}::metodo_pago`); }
  if (desde)     { p.push(desde);     where.push(`p.created_at >= $${p.length}::date`); }
  if (hasta)     { p.push(hasta);     where.push(`p.created_at < ($${p.length}::date + 1)`); }
  if (q) {
    p.push(`%${q}%`);
    where.push(`(p.referencia ILIKE $${p.length} OR u.nombre ILIKE $${p.length} OR p.reserva_id::text = $${p.length + 1})`);
    p.push(q.replace(/^#/, ''));
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params: p };
}

const listar = async (db, f, { limit = 200, offset = 0 } = {}) => {
  const { sql, params } = filtros(f);
  params.push(limit, offset);
  return (await db.query(
    `${SELECT} ${sql} ORDER BY p.created_at DESC, p.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params)).rows;
};

/** Totales sobre TODOS los registros que cumplen el filtro (no solo la página mostrada). */
const resumen = async (db, f) => {
  const { sql, params } = filtros(f);
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(SUM(p.monto) FILTER (WHERE p.tipo = 'COBRO'     AND p.estado = 'APROBADO'), 0) AS cobrado,
            COALESCE(SUM(p.monto) FILTER (WHERE p.tipo = 'REEMBOLSO' AND p.estado = 'APROBADO'), 0) AS reembolsado,
            COUNT(*) FILTER (WHERE p.estado = 'RECHAZADO')::int AS rechazados,
            COUNT(*)::int AS transacciones
       ${FROM} ${sql}`, params);
  return {
    cobrado: redondear(r.cobrado),
    reembolsado: redondear(r.reembolsado),
    neto: redondear(r.cobrado - r.reembolsado),
    rechazados: r.rechazados,
    transacciones: r.transacciones,
  };
};

module.exports = { insertar, porId, neto, ultimoCobro, listar, resumen };
