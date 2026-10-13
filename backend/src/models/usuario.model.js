const COLS = 'id, nombre, email, rol, activo, created_at';

const porId = async (db, id) => (await db.query(`SELECT ${COLS} FROM usuarios WHERE id = $1`, [id])).rows[0];
const porEmail = async (db, email) => (await db.query('SELECT * FROM usuarios WHERE email = $1', [email])).rows[0];

const listar = async (db, { q } = {}) => {
  const p = []; let where = '';
  if (q) { p.push(`%${q}%`); where = 'WHERE nombre ILIKE $1 OR email ILIKE $1'; }
  return (await db.query(`SELECT ${COLS} FROM usuarios ${where} ORDER BY id`, p)).rows;
};

const insertar = async (db, { nombre, email, hash, rol }) =>
  (await db.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1,$2,$3,$4) RETURNING ${COLS}`,
    [nombre, email, hash, rol])).rows[0];

const actualizar = async (db, id, { nombre, rol, activo, hash }) =>
  (await db.query(
    `UPDATE usuarios SET nombre = $2, rol = $3, activo = $4,
            password_hash = COALESCE($5, password_hash)
      WHERE id = $1 RETURNING ${COLS}`, [id, nombre, rol, activo, hash ?? null])).rows[0];

module.exports = { porId, porEmail, listar, insertar, actualizar };
