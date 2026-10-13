const wrap = require('../utils/asyncHandler');
const S = require('../services/historial.service');

exports.listar = wrap(async (req, res) => res.json({ ok: true, data: await S.listar(req.query) }));
