require('dotenv').config();
const { Pool, types } = require('pg');

// DATE (oid 1082) se devuelve como texto 'YYYY-MM-DD' para evitar problemas de zona horaria
types.setTypeParser(1082, (v) => v);
// NUMERIC (oid 1700) se devuelve como número (los montos tienen 2 decimales, aritmética exacta en BD).
types.setTypeParser(1700, (v) => parseFloat(v));

if (!process.env.DATABASE_URL) {
  console.error('FALTA la variable de entorno DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon exige SSL. Para una BD local sin SSL usa DB_SSL=false
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('Error inesperado en el pool de PostgreSQL:', err.message));

/** Ejecuta fn(client) dentro de BEGIN ... COMMIT; ante cualquier error hace ROLLBACK. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
