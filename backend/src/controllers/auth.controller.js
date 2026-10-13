const wrap = require('../utils/asyncHandler');
const Auth = require('../services/auth.service');

exports.login    = wrap(async (req, res) => res.json({ ok: true, data: await Auth.login(req.body) }));
exports.register = wrap(async (req, res) => res.status(201).json({ ok: true, data: await Auth.register(req.body) }));
exports.me       = wrap(async (req, res) => res.json({ ok: true, data: req.user }));
