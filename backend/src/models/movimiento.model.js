const registrar = async (db, m) =>
  db.query(
    `INSERT INTO movimientos
       (usuario_id, tipo, recurso_id, cantidad, estado_anterior, estado_posterior,
        reserva_id, prestamo_id, devolucion_id, descripcion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [m.usuario_id, m.tipo, m.recurso_id ?? null, m.cantidad ?? 0, m.estado_anterior ?? null,
     m.estado_posterior ?? null, m.reserva_id ?? null, m.prestamo_id ?? null,
     m.devolucion_id ?? null, m.descripcion]);

const listar = async (db, { tipo, desde, hasta, usuarioId, q, limit = 200, offset = 0 }) => {
  const where = []; const p = [];
  if (tipo)      { p.push(tipo);      where.push(`m.tipo = $${p.length}::tipo_movimiento`); }
  if (desde)     { p.push(desde);     where.push(`m.fecha >= $${p.length}::date`); }
  if (hasta)     { p.push(hasta);     where.push(`m.fecha < ($${p.length}::date + 1)`); }
  if (usuarioId) { p.push(usuarioId); where.push(`m.usuario_id = $${p.length}`); }
  if (q) {
    p.push(`%${q}%`);
    where.push(`(m.descripcion ILIKE $${p.length} OR u.nombre ILIKE $${p.length})`);
  }
  p.push(limit, offset);
  const sql = `
    SELECT m.id, m.tipo, m.cantidad, m.fecha, m.estado_anterior, m.estado_posterior,
           m.reserva_id, m.prestamo_id, m.devolucion_id, m.descripcion,
           m.usuario_id, u.nombre AS usuario_nombre, r.tipo AS recurso_tipo, r.nombre AS recurso_nombre
      FROM movimientos m
      JOIN usuarios u ON u.id = m.usuario_id
      LEFT JOIN recursos r ON r.id = m.recurso_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY m.fecha DESC, m.id DESC
     LIMIT $${p.length - 1} OFFSET $${p.length}`;
  return (await db.query(sql, p)).rows;
};

module.exports = { registrar, listar };
