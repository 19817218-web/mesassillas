const AppError = require('../utils/AppError');

function noEncontrado(req, res, next) {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404));
}

// Traduce errores de PostgreSQL a respuestas comprensibles
function traducirPg(err) {
  switch (err.code) {
    case '23505': return new AppError('Ya existe un registro duplicado (por ejemplo, una reserva idéntica o un correo repetido)', 409);
    case '23514': return new AppError('La operación viola una regla de integridad del inventario o de los datos', 409);
    case '23503': return new AppError('Referencia a un registro inexistente', 400);
    case '22P02': case '22007': case '22008': case '22003': return new AppError('Datos con formato inválido', 400);
    case '40P01': case '40001': return new AppError('Conflicto de concurrencia, intenta nuevamente', 409);
    default: return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let e = err;
  if (!err.isAppError) {
    if (err.type === 'entity.parse.failed') e = new AppError('JSON inválido en la petición', 400);
    else e = traducirPg(err) || err;
  }
  const status = e.isAppError ? e.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    ok: false,
    error: status >= 500 ? 'Error interno del servidor' : e.message,
  });
}

module.exports = { noEncontrado, errorHandler };
