const AppError = require('../utils/AppError');

/** permitir('ADMIN') / permitir('ADMIN','USER') */
const permitir = (...roles) => (req, res, next) => {
  if (!req.user) return next(new AppError('Autenticación requerida', 401));
  if (!roles.includes(req.user.rol)) return next(new AppError('No tienes permisos para esta operación', 403));
  next();
};

module.exports = { permitir };
