const wrap = require('../utils/asyncHandler');
const S = require('../services/prestamo.service');
const V = require('../utils/validators');

exports.listar     = wrap(async (req, res) => res.json({ ok: true, data: await S.listar(req.user, req.query) }));
exports.obtener    = wrap(async (req, res) => res.json({ ok: true, data: await S.obtener(req.user, V.id(req.params.id)) }));
exports.crear      = wrap(async (req, res) => res.status(201).json({ ok: true, data: await S.crear(req.user, req.body) }));
exports.actualizar = wrap(async (req, res) => res.json({ ok: true, data: await S.actualizar(req.user, V.id(req.params.id), req.body) }));
