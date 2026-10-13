const { pool } = require('../config/db');
const Mov = require('../models/movimiento.model');
const V = require('../utils/validators');
const { oneOf } = require('../utils/helpers');

const TIPOS = ['RESERVA', 'CANCELACION', 'PRESTAMO', 'DEVOLUCION', 'DEVOLUCION_PARCIAL', 'MODIFICACION', 'PAGO', 'REEMBOLSO'];

const listar = (query) => Mov.listar(pool, {
  tipo: oneOf(query.tipo, TIPOS, 'Tipo'),
  desde: query.desde ? V.fecha(query.desde, 'La fecha inicial') : undefined,
  hasta: query.hasta ? V.fecha(query.hasta, 'La fecha final') : undefined,
  usuarioId: query.usuario_id ? V.id(query.usuario_id, 'usuario_id') : undefined,
  q: V.texto(query.q, 'La búsqueda', { max: 80 }) || undefined,
  limit: V.entero(query.limit, 'limit', { min: 1, max: 500 }) ?? 200,
  offset: V.entero(query.offset, 'offset', { min: 0 }) ?? 0,
});

module.exports = { listar };
