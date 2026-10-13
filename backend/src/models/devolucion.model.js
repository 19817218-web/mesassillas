const RESUMEN = `
  SELECT dv.id, dv.prestamo_id, dv.fecha_real, dv.observaciones, dv.registrado_por,
         reg.nombre AS registrado_por_nombre, p.usuario_id, u.nombre AS usuario_nombre,
         COALESCE(SUM(dd.cantidad) FILTER (WHERE rc.tipo='MESA'),0)::int  AS cantidad_mesas,
         COALESCE(SUM(dd.cantidad) FILTER (WHERE rc.tipo='SILLA'),0)::int AS cantidad_sillas
    FROM devoluciones dv
    JOIN prestamos p ON p.id = dv.prestamo_id
    JOIN usuarios u ON u.id = p.usuario_id
    JOIN usuarios reg ON reg.id = dv.registrado_por
    LEFT JOIN devolucion_detalle dd ON dd.devolucion_id = dv.id
    LEFT JOIN recursos rc ON rc.id = dd.recurso_id`;

const listar = async (db, { usuarioId, prestamoId }) => {
  const where = []; const p = [];
  if (usuarioId)  { p.push(usuarioId);  where.push(`p.usuario_id = $${p.length}`); }
  if (prestamoId) { p.push(prestamoId); where.push(`dv.prestamo_id = $${p.length}`); }
  return (await db.query(
    `${RESUMEN} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY dv.id, reg.nombre, p.usuario_id, u.nombre ORDER BY dv.fecha_real DESC, dv.id DESC`, p)).rows;
};

const insertar = async (db, { prestamoId, registradoPor, fechaReal, observaciones }) =>
  (await db.query(
    `INSERT INTO devoluciones (prestamo_id, registrado_por, fecha_real, observaciones)
     VALUES ($1,$2,$3,$4) RETURNING *`, [prestamoId, registradoPor, fechaReal, observaciones])).rows[0];

const insertarDetalle = async (db, devolucionId, recursoId, cantidad) =>
  db.query('INSERT INTO devolucion_detalle (devolucion_id, recurso_id, cantidad) VALUES ($1,$2,$3)',
    [devolucionId, recursoId, cantidad]);

module.exports = { listar, insertar, insertarDetalle };
