const { pool, withTransaction } = require('../config/db');
const Recurso = require('../models/recurso.model');
const Mov = require('../models/movimiento.model');
const AppError = require('../utils/AppError');
const V = require('../utils/validators');
const { oneOf, dinero } = require('../utils/helpers');

const listar = () => Recurso.listar(pool);

async function crear(actor, body) {
  const tipo = oneOf(body.tipo, ['MESA', 'SILLA'], 'Tipo');
  if (!tipo) throw new AppError('El tipo es obligatorio (MESA o SILLA)');
  const nombre = V.texto(body.nombre, 'El nombre', { max: 80 }) || (tipo === 'MESA' ? 'Mesas' : 'Sillas');
  const total = V.entero(body.cantidad_total, 'La cantidad total', { min: 0, requerido: true });
  const estado = oneOf(body.estado, ['ACTIVO', 'INACTIVO'], 'Estado') || 'ACTIVO';
  const precio = V.precio(body.precio_unitario, 'El precio') ?? 0;

  return withTransaction(async (db) => {
    const ya = (await Recurso.listar(db)).find((r) => r.tipo === tipo);
    if (ya) throw new AppError(`Ya existe el recurso ${tipo}. Usa PUT /api/inventario/${ya.id} para modificarlo`, 409);
    const r = await Recurso.insertar(db, { tipo, nombre, total, estado, precio });
    await Mov.registrar(db, {
      usuario_id: actor.id, tipo: 'MODIFICACION', recurso_id: r.id, cantidad: total,
      estado_anterior: null, estado_posterior: `total ${total}`,
      descripcion: `Recurso ${tipo} creado con ${total} unidades (precio ${dinero(precio)})`,
    });
    return r;
  });
}

async function actualizar(actor, id, body) {
  return withTransaction(async (db) => {
    const r = await Recurso.porId(db, id, { lock: true });
    if (!r) throw new AppError('Recurso inexistente', 404);

    const total = body.cantidad_total !== undefined
      ? V.entero(body.cantidad_total, 'La cantidad total', { min: 0, requerido: true }) : r.cantidad_total;
    const comprometido = r.cantidad_reservada + r.cantidad_prestada;
    if (total < comprometido) {
      throw new AppError(`El total no puede ser menor a lo reservado + prestado (${comprometido})`, 409);
    }
    const nombre = body.nombre !== undefined ? V.texto(body.nombre, 'El nombre', { max: 80, requerido: true }) : r.nombre;
    const estado = oneOf(body.estado, ['ACTIVO', 'INACTIVO'], 'Estado') || r.estado;
    const precio = body.precio_unitario !== undefined
      ? V.precio(body.precio_unitario, 'El precio', { requerido: true }) : r.precio_unitario;
    const disponible = total - comprometido;

    const upd = await Recurso.actualizar(db, id, { nombre, total, disponible, estado, precio });
    await Mov.registrar(db, {
      usuario_id: actor.id, tipo: 'MODIFICACION', recurso_id: id, cantidad: Math.abs(total - r.cantidad_total),
      estado_anterior: `total ${r.cantidad_total} / ${r.estado}`, estado_posterior: `total ${total} / ${estado}`,
      descripcion: `Inventario de ${r.tipo} modificado: total ${r.cantidad_total} → ${total}, estado ${r.estado} → ${estado}`
        + (precio !== r.precio_unitario ? `, precio ${dinero(r.precio_unitario)} → ${dinero(precio)} (no afecta reservas ya creadas)` : ''),
    });
    return upd;
  });
}

module.exports = { listar, crear, actualizar };
