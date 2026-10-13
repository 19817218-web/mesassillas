const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');

async function autenticar(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('Autenticación requerida', 401);

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new AppError('Token inválido o expirado', 401);
    }
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1', [payload.id]);
    const u = rows[0];
    if (!u || !u.activo) throw new AppError('Usuario inexistente o desactivado', 401);
    req.user = u;
    next();
  } catch (e) { next(e); }
}

module.exports = { autenticar };
