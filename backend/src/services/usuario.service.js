const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const Usuario = require('../models/usuario.model');
const AppError = require('../utils/AppError');
const V = require('../utils/validators');
const { oneOf } = require('../utils/helpers');

const listar = (query) => Usuario.listar(pool, { q: V.texto(query.q, 'La búsqueda', { max: 80 }) });

async function crear(body) {
  const nombre = V.texto(body.nombre, 'El nombre', { max: 120, requerido: true });
  const email = V.email(body.email);
  const hash = await bcrypt.hash(V.password(body.password), 10);
  const rol = oneOf(body.rol, ['ADMIN', 'USER'], 'Rol') || 'USER';
  if (await Usuario.porEmail(pool, email)) throw new AppError('Ya existe un usuario con ese correo', 409);
  return Usuario.insertar(pool, { nombre, email, hash, rol });
}

async function actualizar(actor, id, body) {
  const u = await Usuario.porId(pool, id);
  if (!u) throw new AppError('Usuario inexistente', 404);
  const nombre = body.nombre !== undefined ? V.texto(body.nombre, 'El nombre', { max: 120, requerido: true }) : u.nombre;
  const rol = oneOf(body.rol, ['ADMIN', 'USER'], 'Rol') || u.rol;
  const activo = body.activo !== undefined ? body.activo === true || body.activo === 'true' : u.activo;
  if (actor.id === id && (!activo || rol !== 'ADMIN')) {
    throw new AppError('No puedes desactivarte ni quitarte el rol de administrador a ti mismo', 409);
  }
  const hash = body.password ? await bcrypt.hash(V.password(body.password), 10) : null;
  return Usuario.actualizar(pool, id, { nombre, rol, activo, hash });
}

module.exports = { listar, crear, actualizar };
