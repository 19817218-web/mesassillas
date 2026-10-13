// Uso opcional:
//   npm run db:schema    -> ejecuta database/schema.sql (instalación nueva, base VACÍA)
//   npm run db:migrate   -> ejecuta database/migrations/001_pagos_simulados.sql (base ya existente)
//   node src/utils/runSchema.js migrations/otro.sql   -> cualquier archivo dentro de /database
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

(async () => {
  const dbDir = path.resolve(__dirname, '../../../database');
  const archivo = path.resolve(dbDir, process.argv[2] || 'schema.sql');
  // Solo se permiten archivos dentro de /database
  if (!archivo.startsWith(dbDir + path.sep) || !fs.existsSync(archivo)) {
    console.error(`Archivo SQL no encontrado dentro de /database: ${process.argv[2] || 'schema.sql'}`);
    process.exitCode = 1;
    await pool.end();
    return;
  }
  const sql = fs.readFileSync(archivo, 'utf8');
  try {
    await pool.query(sql);
    console.log(`${path.relative(dbDir, archivo)} ejecutado correctamente`);
  } catch (e) {
    console.error(`Error ejecutando ${path.relative(dbDir, archivo)}:`, e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
