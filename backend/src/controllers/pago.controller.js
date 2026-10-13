const wrap = require('../utils/asyncHandler');
const S = require('../services/pago.service');
const V = require('../utils/validators');

exports.simulador = wrap(async (req, res) => res.json({ ok: true, data: S.simulador() }));
exports.listar    = wrap(async (req, res) => res.json({ ok: true, data: await S.listar(req.user, req.query) }));
exports.pagar     = wrap(async (req, res) => res.status(201).json({ ok: true, data: await S.cobrar(req.user, V.id(req.params.id), req.body) }));
