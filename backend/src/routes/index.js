const router = require('express').Router();
const { autenticar } = require('../middleware/auth');
const { permitir } = require('../middleware/roles');
const A = require('../controllers/auth.controller');
const I = require('../controllers/inventario.controller');
const R = require('../controllers/reserva.controller');
const P = require('../controllers/prestamo.controller');
const D = require('../controllers/devolucion.controller');
const H = require('../controllers/historial.controller');
const Dash = require('../controllers/dashboard.controller');
const U = require('../controllers/usuario.controller');
const Pg = require('../controllers/pago.controller');

const admin = permitir('ADMIN');
const todos = permitir('ADMIN', 'USER');

// Públicas
router.post('/auth/login', A.login);
router.post('/auth/register', A.register);

// Todo lo demás exige JWT
router.use(autenticar);
router.get('/auth/me', A.me);

router.get('/dashboard', todos, Dash.obtener);

router.get('/inventario', todos, I.listar);
router.post('/inventario', admin, I.crear);
router.put('/inventario/:id', admin, I.actualizar);

router.get('/reservas', todos, R.listar);
router.get('/reservas/:id', todos, R.obtener);
router.post('/reservas', todos, R.crear);
router.put('/reservas/:id', todos, R.actualizar);
router.delete('/reservas/:id', todos, R.cancelar);
router.post('/reservas/:id/confirmar', admin, R.confirmar);
router.post('/reservas/:id/cancelar', todos, R.cancelar);
router.post('/reservas/:id/pagar', todos, Pg.pagar);   // cobra el saldo (monto calculado por el servidor)

router.get('/prestamos', todos, P.listar);
router.get('/prestamos/:id', todos, P.obtener);
router.post('/prestamos', admin, P.crear);
router.put('/prestamos/:id', admin, P.actualizar);

router.get('/devoluciones', todos, D.listar);
router.post('/devoluciones', admin, D.registrar);

router.get('/pagos/simulador', todos, Pg.simulador);   // modo + tarjetas de prueba
router.get('/pagos', todos, Pg.listar);                // ADMIN: todos · USER: solo los suyos

router.get('/historial', admin, H.listar);

router.get('/usuarios', admin, U.listar);
router.post('/usuarios', admin, U.crear);
router.put('/usuarios/:id', admin, U.actualizar);

module.exports = router;
