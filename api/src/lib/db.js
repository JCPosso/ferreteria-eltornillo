'use strict';
const sql = require('mssql');

let pool;

function configuracion() {
  const servidor = process.env.SQL_SERVER;
  const base = process.env.SQL_DATABASE;
  if (!servidor || !base) throw new Error('Faltan SQL_SERVER y SQL_DATABASE');
  return {
    server: servidor,
    database: base,
    authentication: { type: 'azure-active-directory-default', options: {} },
    options: { encrypt: true, trustServerCertificate: false },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 30000,
    requestTimeout: 15000,
  };
}

async function obtenerPool() {
  if (!pool) pool = await new sql.ConnectionPool(configuracion()).connect();
  return pool;
}

async function ejecutar({ sedeId, admin }, consulta, parametros) {
  const p = await obtenerPool();
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('sede', sql.Int, sedeId)
      .input('admin', sql.Int, admin ? 1 : 0)
      .query(`EXEC sp_set_session_context @key=N'sede_id', @value=@sede, @read_only=0;
              EXEC sp_set_session_context @key=N'es_admin', @value=@admin, @read_only=0;`);
    const req = new sql.Request(tx);
    for (const [nombre, valor] of Object.entries(parametros)) {
      if (nombre === 'patron') req.input(nombre, sql.NVarChar(120), valor);
      else if (nombre === 'categoria') req.input(nombre, sql.NVarChar(50), valor);
      else req.input(nombre, sql.Int, valor);
    }
    const r = await req.query(consulta);
    await tx.commit();
    return r.recordset;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}

async function ping() {
  const p = await obtenerPool();
  const r = await p.request().query('SELECT 1 AS ok');
  return r.recordset[0].ok === 1;
}

module.exports = { ejecutar, ping };
