const wrap = require('../utils/asyncHandler');
const S = require('../services/devolucion.service');

exports.listar   = wrap(async (req, res) => res.json({ ok: true, data: await S.listar(req.user, req.query) }));
exports.registrar = wrap(async (req, res) => res.status(201).json({ ok: true, data: await S.registrar(req.user, req.body) }));
