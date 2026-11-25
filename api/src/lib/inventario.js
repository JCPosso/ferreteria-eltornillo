'use strict';
const { validarConsulta, validarSede, patronLike } = require('./validar');

const UMBRAL_BAJO = 15;

const SQL_CONSULTA = `
SELECT p.codigo, p.nombre, p.categoria, e.sede_id AS sedeId, e.cantidad,
       COUNT(*) OVER() AS totalCoincidencias
FROM dbo.existencias AS e
JOIN dbo.productos  AS p ON p.id = e.producto_id
WHERE e.sede_id = @sede
  AND (@patron IS NULL OR p.codigo LIKE @patron ESCAPE '\\' OR p.nombre LIKE @patron ESCAPE '\\')
  AND (@categoria IS NULL OR p.categoria = @categoria)
  AND (@bajo = 0 OR e.cantidad < ${UMBRAL_BAJO})
ORDER BY p.nombre, p.codigo
OFFSET @desplazamiento ROWS FETCH NEXT @limite ROWS ONLY;`;

const SQL_CATEGORIAS = `
SELECT DISTINCT p.categoria
FROM dbo.existencias AS e
JOIN dbo.productos  AS p ON p.id = e.producto_id
WHERE e.sede_id = @sede
ORDER BY p.categoria;`;

const SQL_RESUMEN = `
SELECT COUNT(*) AS productos,
       ISNULL(SUM(e.cantidad), 0) AS unidades,
       ISNULL(SUM(CASE WHEN e.cantidad < ${UMBRAL_BAJO} THEN 1 ELSE 0 END), 0) AS bajo,
       ISNULL(SUM(CASE WHEN e.cantidad = 0 THEN 1 ELSE 0 END), 0) AS agotados
FROM dbo.existencias AS e
WHERE e.sede_id = @sede;`;

async function consultarInventario(db, parametros, { admin = false } = {}) {
  const { sedeId, texto, categoria, bajo, limite, pagina, desplazamiento } = validarConsulta(parametros);
  const filas = await db.ejecutar(
    { sedeId, admin },
    SQL_CONSULTA,
    {
      limite,
      sede: sedeId,
      patron: patronLike(texto),
      categoria,
      bajo: bajo ? 1 : 0,
      desplazamiento,
    },
  );
  const total = filas.length ? filas[0].totalCoincidencias : 0;
  const items = filas.map(({ totalCoincidencias, ...fila }) => fila);
  return { sede: sedeId, total, pagina, limite, umbralBajo: UMBRAL_BAJO, items };
}

async function listarCategorias(db, { sede }, { admin = false } = {}) {
  const sedeId = validarSede(sede);
  const filas = await db.ejecutar({ sedeId, admin }, SQL_CATEGORIAS, { sede: sedeId });
  return { sede: sedeId, categorias: filas.map((f) => f.categoria) };
}

async function resumirSede(db, { sede }, { admin = false } = {}) {
  const sedeId = validarSede(sede);
  const filas = await db.ejecutar({ sedeId, admin }, SQL_RESUMEN, { sede: sedeId });
  const { productos = 0, unidades = 0, bajo = 0, agotados = 0 } = filas[0] || {};
  return { sede: sedeId, productos, unidades, bajo, agotados, umbralBajo: UMBRAL_BAJO };
}

module.exports = {
  consultarInventario, listarCategorias, resumirSede,
  SQL_CONSULTA, SQL_CATEGORIAS, SQL_RESUMEN, UMBRAL_BAJO,
};
