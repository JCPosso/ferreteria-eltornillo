'use strict';
const { validarConsulta, patronLike } = require('./validar');

const SQL_CONSULTA = `
SELECT TOP (@limite)
       p.codigo, p.nombre, p.categoria, e.sede_id AS sedeId, e.cantidad
FROM dbo.existencias AS e
JOIN dbo.productos  AS p ON p.id = e.producto_id
WHERE e.sede_id = @sede
  AND (@patron IS NULL OR p.codigo LIKE @patron ESCAPE '\\' OR p.nombre LIKE @patron ESCAPE '\\')
ORDER BY p.nombre;`;

/**
 * Consulta el inventario de una sede.
 * @param {object} db  Adaptador con ejecutar(sedeId, esAdmin, sql, params). Ver db.js
 */
async function consultarInventario(db, parametros, { admin = false } = {}) {
  const { sedeId, texto, limite } = validarConsulta(parametros);
  const filas = await db.ejecutar(
    { sedeId, admin },
    SQL_CONSULTA,
    { limite, sede: sedeId, patron: patronLike(texto) },
  );
  return { sede: sedeId, total: filas.length, items: filas };
}

module.exports = { consultarInventario, SQL_CONSULTA };
