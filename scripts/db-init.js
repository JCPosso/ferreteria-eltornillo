'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sql = require(path.join(__dirname, '..', 'api', 'node_modules', 'mssql'));

const requeridas = ['SQL_SERVER', 'SQL_DATABASE', 'IDENTITY_NAME', 'IDENTITY_CLIENT_ID', 'SQL_ACCESS_TOKEN'];
const faltan = requeridas.filter((v) => !process.env[v]);
if (faltan.length) {
  console.error(`Faltan variables de entorno: ${faltan.join(', ')}`);
  process.exit(1);
}
if (!/^[A-Za-z0-9-]+$/.test(process.env.IDENTITY_NAME)) {
  console.error('IDENTITY_NAME solo admite letras, números y guiones');
  process.exit(1);
}
if (!/^[0-9a-fA-F-]{36}$/.test(process.env.IDENTITY_CLIENT_ID)) {
  console.error('IDENTITY_CLIENT_ID debe ser un GUID');
  process.exit(1);
}

async function conectar() {
  const intentos = 8;
  for (let i = 1; i <= intentos; i++) {
    try {
      return await new sql.ConnectionPool({
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
        authentication: { type: 'azure-active-directory-access-token', options: { token: process.env.SQL_ACCESS_TOKEN } },
        options: { encrypt: true },
        connectionTimeout: 30000,
        requestTimeout: 60000,
        pool: { max: 1, min: 1 },
      }).connect();
    } catch (e) {
      if (i === intentos) throw e;
      console.log(`Intento ${i}/${intentos} sin conexión (${e.message}); reintento en 20 s`);
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
}

(async () => {
  const pool = await conectar();

  const dir = path.join(__dirname, '..', 'db');
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    const texto = fs.readFileSync(path.join(dir, archivo), 'utf8').replaceAll('$(IDENTITY_NAME)', process.env.IDENTITY_NAME).replaceAll('$(IDENTITY_CLIENT_ID)', process.env.IDENTITY_CLIENT_ID);
    const lotes = texto.split(/^\s*GO\s*$/im).map((l) => l.trim()).filter(Boolean);
    for (const lote of lotes) await pool.request().batch(lote);
    console.log(`ok ${archivo} (${lotes.length} lotes)`);
  }
  await pool.close();
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
