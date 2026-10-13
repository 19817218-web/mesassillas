require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { pool } = require('./config/db');
const routes = require('./routes');
const { noEncontrado, errorHandler } = require('./middleware/errorHandler');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET es obligatorio y debe tener al menos 16 caracteres');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Render está detrás de un proxy

app.use(helmet({ contentSecurityPolicy: false }));

// CORS: sin CORS_ORIGIN solo se permite el mismo origen (frontend servido por esta misma app)
const origenes = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: origenes.length ? origenes : false,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '100kb' }));

// Comprobación de salud (Render / diagnóstico)
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, db: 'conectada' }); }
  catch { res.status(503).json({ ok: false, db: 'sin conexión' }); }
});

app.use('/api', routes);
app.use('/api', noEncontrado);

// Frontend estático
const frontendDir = path.join(__dirname, '../../frontend');
app.use(express.static(frontendDir));
app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

app.use(errorHandler);

const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en 0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
});

const apagar = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);

module.exports = app;
