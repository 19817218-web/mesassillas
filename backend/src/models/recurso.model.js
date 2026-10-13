// Todas las funciones reciben "db" (pool o client de una transacción)
const COLS = `id, tipo, nombre, cantidad_total, cantidad_disponible, cantidad_reservada,
              cantidad_prestada, estado, precio_unitario, updated_at`;

const listar = async (db) =>
  (await db.query(`SELECT ${COLS} FROM recursos ORDER BY id`)).rows;

const porId = async (db, id, { lock = false } = {}) =>
  (await db.query(`SELECT ${COLS} FROM recursos WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];

/** Bloquea TODAS las filas de inventario (siempre en el mismo orden => sin deadlocks). Devuelve {MESA, SILLA}. */
const bloquearTodos = async (db) => {
  const rows = (await db.query(`SELECT ${COLS} FROM recursos ORDER BY id FOR UPDATE`)).rows;
  const mapa = {};
  rows.forEach((r) => { mapa[r.tipo] = r; });
  return mapa;
};

/** Aplica deltas al inventario. Los CHECK de PostgreSQL impiden valores negativos o inconsistentes. */
const aplicar = async (db, id, dDisp, dRes, dPrest) =>
  (await db.query(
    `UPDATE recursos
        SET cantidad_disponible = cantidad_disponible + $2,
            cantidad_reservada  = cantidad_reservada  + $3,
            cantidad_prestada   = cantidad_prestada   + $4,
            updated_at = now()
      WHERE id = $1 RETURNING ${COLS}`, [id, dDisp, dRes, dPrest])).rows[0];

const insertar = async (db, { tipo, nombre, total, estado, precio = 0 }) =>
  (await db.query(
    `INSERT INTO recursos (tipo, nombre, cantidad_total, cantidad_disponible, estado, precio_unitario)
     VALUES ($1, $2, $3, $3, $4, $5) RETURNING ${COLS}`, [tipo, nombre, total, estado, precio])).rows[0];

const actualizar = async (db, id, { nombre, total, disponible, estado, precio }) =>
  (await db.query(
    `UPDATE recursos SET nombre = $2, cantidad_total = $3, cantidad_disponible = $4,
            estado = $5, precio_unitario = $6, updated_at = now()
      WHERE id = $1 RETURNING ${COLS}`, [id, nombre, total, disponible, estado, precio])).rows[0];

module.exports = { listar, porId, bloquearTodos, aplicar, insertar, actualizar };
