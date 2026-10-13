const wrap = require('../utils/asyncHandler');
const S = require('../services/dashboard.service');

exports.obtener = wrap(async (req, res) => res.json({ ok: true, data: await S.obtener(req.user) }));
