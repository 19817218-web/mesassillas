const wrap = require('../utils/asyncHandler');
const S = require('../services/inventario.service');
const V = require('../utils/validators');

exports.listar     = wrap(async (req, res) => res.json({ ok: true, data: await S.listar() }));
exports.crear      = wrap(async (req, res) => res.status(201).json({ ok: true, data: await S.crear(req.user, req.body) }));
exports.actualizar = wrap(async (req, res) => res.json({ ok: true, data: await S.actualizar(req.user, V.id(req.params.id), req.body) }));
