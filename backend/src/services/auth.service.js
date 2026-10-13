const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const Usuario = require('../models/usuario.model');
const AppError = require('../utils/AppError');
const V = require('../utils/validators');

const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10); // evita revelar si el correo existe por tiempos de respuesta

function firmar(u) {
  return jwt.sign({ id: u.id, rol: u.rol }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}
const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });

async function login(body) {
  const email = V.email(body.email);
  const password = String(body.password || '');
  const u = await Usuario.porEmail(pool, email);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) throw new AppError('Correo o contraseña incorrectos', 401);
  if (!u.activo) throw new AppError('Tu usuario está desactivado', 403);
  return { token: firmar(u), usuario: publico(u) };
}

// El registro público SIEMPRE crea usuarios con rol USER
async function register(body) {
  const nombre = V.texto(body.nombre, 'El nombre', { max: 120, requerido: true });
  const email = V.email(body.email);
  const password = V.password(body.password);
  if (await Usuario.porEmail(pool, email)) throw new AppError('Ya existe un usuario con ese correo', 409);
  const hash = await bcrypt.hash(password, 10);
  const u = await Usuario.insertar(pool, { nombre, email, hash, rol: 'USER' });
  return { token: firmar(u), usuario: publico(u) };
}

module.exports = { login, register };
