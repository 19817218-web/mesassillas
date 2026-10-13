const RESUMEN = `
  SELECT p.id, p.usuario_id, u.nombre AS usuario_nombre, p.reserva_id, p.registrado_por,
         p.fecha_prestamo, p.fecha_prevista_devolucion, p.estado, p.observaciones, p.updated_at,
         COALESCE(SUM(d.cantidad_prestada) FILTER (WHERE rc.tipo='MESA'),0)::int  AS cantidad_mesas,
         COALESCE(SUM(d.cantidad_prestada) FILTER (WHERE rc.tipo='SILLA'),0)::int AS cantidad_sillas,
         COALESCE(SUM(d.cantidad_devuelta) FILTER (WHERE rc.tipo='MESA'),0)::int  AS devueltas_mesas,
         COALESCE(SUM(d.cantidad_devuelta) FILTER (WHERE rc.tipo='SILLA'),0)::int AS devueltas_sillas,
         COALESCE(SUM(d.cantidad_prestada - d.cantidad_devuelta) FILTER (WHERE rc.tipo='MESA'),0)::int  AS pendientes_mesas,
         COALESCE(SUM(d.cantidad_prestada - d.cantidad_devuelta) FILTER (WHERE rc.tipo='SILLA'),0)::int AS pendientes_sillas
    FROM prestamos p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN prestamo_detalle d ON d.prestamo_id = p.id
    LEFT JOIN recursos rc ON rc.id = d.recurso_id`;

/** Marca como VENCIDO los préstamos con pendientes cuya fecha prevista ya pasó. */
const marcarVencidos = async (db) =>
  db.query(
    `UPDATE prestamos SET estado = 'VENCIDO', updated_at = now()
      WHERE estado IN ('ACTIVO','PARCIALMENTE_DEVUELTO') AND fecha_prevista_devolucion < now()`);

const listar = async (db, { usuarioId, estado, q }) => {
  const where = []; const p = [];
  if (usuarioId) { p.push(usuarioId); where.push(`p.usuario_id = $${p.length}`); }
  if (estado)    { p.push(estado);    where.push(`p.estado = $${p.length}::estado_prestamo`); }
  if (q) {
    p.push(`%${q}%`);
    where.push(`(u.nombre ILIKE $${p.length} OR p.observaciones ILIKE $${p.length} OR ('#' || p.id) ILIKE $${p.length})`);
  }
  return (await db.query(
    `${RESUMEN} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY p.id, u.nombre ORDER BY p.fecha_prestamo DESC, p.id DESC`, p)).rows;
};

const resumen = async (db, id) =>
  (await db.query(`${RESUMEN} WHERE p.id = $1 GROUP BY p.id, u.nombre`, [id])).rows[0];

const porIdBloqueado = async (db, id) =>
  (await db.query('SELECT * FROM prestamos WHERE id = $1 FOR UPDATE', [id])).rows[0];

const detalle = async (db, id, { lock = false } = {}) =>
  (await db.query(
    `SELECT d.id, d.recurso_id, rc.tipo, d.cantidad_prestada, d.cantidad_devuelta,
            (d.cantidad_prestada - d.cantidad_devuelta) AS cantidad_pendiente
       FROM prestamo_detalle d JOIN recursos rc ON rc.id = d.recurso_id
      WHERE d.prestamo_id = $1 ORDER BY d.recurso_id ${lock ? 'FOR UPDATE OF d' : ''}`, [id])).rows;

const insertar = async (db, p) =>
  (await db.query(
    `INSERT INTO prestamos (usuario_id, reserva_id, registrado_por, fecha_prestamo,
                            fecha_prevista_devolucion, estado, observaciones)
     VALUES ($1,$2,$3,$4,$5,'ACTIVO',$6) RETURNING *`,
    [p.usuarioId, p.reservaId ?? null, p.registradoPor, p.fechaPrestamo, p.fechaPrevista, p.observaciones])).rows[0];

const insertarDetalle = async (db, prestamoId, recursoId, cantidad) =>
  db.query('INSERT INTO prestamo_detalle (prestamo_id, recurso_id, cantidad_prestada) VALUES ($1,$2,$3)',
    [prestamoId, recursoId, cantidad]);

const sumarDevuelto = async (db, detalleId, cantidad) =>
  db.query('UPDATE prestamo_detalle SET cantidad_devuelta = cantidad_devuelta + $2 WHERE id = $1', [detalleId, cantidad]);

const actualizar = async (db, id, { fechaPrevista, observaciones, estado }) =>
  db.query(
    `UPDATE prestamos SET fecha_prevista_devolucion=$2, observaciones=$3, estado=$4, updated_at=now() WHERE id=$1`,
    [id, fechaPrevista, observaciones, estado]);

const cambiarEstado = async (db, id, estado) =>
  db.query('UPDATE prestamos SET estado=$2, updated_at=now() WHERE id=$1', [id, estado]);

module.exports = { marcarVencidos, listar, resumen, porIdBloqueado, detalle, insertar, insertarDetalle,
                   sumarDevuelto, actualizar, cambiarEstado };
