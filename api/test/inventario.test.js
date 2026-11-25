'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { consultarInventario, listarCategorias, resumirSede, SQL_CONSULTA, SQL_CATEGORIAS, SQL_RESUMEN, UMBRAL_BAJO } = require('../src/lib/inventario');
const { ErrorValidacion } = require('../src/lib/validar');

function dbFalsa(filas = []) {
  const llamadas = [];
  return {
    llamadas,
    async ejecutar(contexto, consulta, parametros) {
      llamadas.push({ contexto, consulta, parametros });
      return filas;
    },
  };
}

test('consulta con parámetros y contexto de sede', async () => {
  const db = dbFalsa([{ codigo: 'MAR-001', nombre: 'Martillo', categoria: 'Herramientas', sedeId: 1, cantidad: 12, totalCoincidencias: 1 }]);
  const r = await consultarInventario(db, { sede: '1', q: 'mart' });
  assert.equal(r.total, 1);
  assert.equal(r.sede, 1);
  assert.deepEqual(db.llamadas[0].contexto, { sedeId: 1, admin: false });
  assert.deepEqual(db.llamadas[0].parametros, {
    limite: 20, sede: 1, patron: '%mart%', categoria: null, bajo: 0, desplazamiento: 0,
  });
});

test('el texto del usuario nunca se concatena al SQL', async () => {
  const db = dbFalsa();
  const ataque = "'; DROP TABLE productos; --";
  await consultarInventario(db, { sede: 1, q: ataque });
  assert.equal(db.llamadas[0].consulta.includes('DROP'), false);
  assert.equal(db.llamadas[0].consulta, SQL_CONSULTA);
  assert.equal(db.llamadas[0].parametros.patron.includes('DROP TABLE'), true);
});

test('el SQL filtra por sede y usa parámetros', () => {
  assert.match(SQL_CONSULTA, /WHERE e\.sede_id = @sede/);
  assert.match(SQL_CONSULTA, /OFFSET @desplazamiento ROWS FETCH NEXT @limite ROWS ONLY/);
  assert.match(SQL_CONSULTA, /p\.categoria = @categoria/);
});

test('sin búsqueda el patrón es nulo', async () => {
  const db = dbFalsa();
  await consultarInventario(db, { sede: 3 });
  assert.equal(db.llamadas[0].parametros.patron, null);
});

test('el administrador se marca en el contexto', async () => {
  const db = dbFalsa();
  await consultarInventario(db, { sede: 2 }, { admin: true });
  assert.equal(db.llamadas[0].contexto.admin, true);
});

test('una sede inválida falla antes de tocar la base', async () => {
  const db = dbFalsa();
  await assert.rejects(() => consultarInventario(db, { sede: 9 }), ErrorValidacion);
  assert.equal(db.llamadas.length, 0);
});

test('devuelve el total real y no expone la columna auxiliar', async () => {
  const filas = [
    { codigo: 'A', nombre: 'Uno', categoria: 'X', sedeId: 1, cantidad: 5, totalCoincidencias: 1250 },
    { codigo: 'B', nombre: 'Dos', categoria: 'X', sedeId: 1, cantidad: 9, totalCoincidencias: 1250 },
  ];
  const r = await consultarInventario(dbFalsa(filas), { sede: 1, limite: 2, pagina: 3 });
  assert.equal(r.total, 1250);
  assert.equal(r.pagina, 3);
  assert.equal(r.limite, 2);
  assert.equal(r.umbralBajo, UMBRAL_BAJO);
  assert.equal('totalCoincidencias' in r.items[0], false);
});

test('sin filas el total es cero', async () => {
  const r = await consultarInventario(dbFalsa([]), { sede: 1 });
  assert.equal(r.total, 0);
  assert.deepEqual(r.items, []);
});

test('pasa categoría, stock bajo y desplazamiento como parámetros', async () => {
  const db = dbFalsa();
  await consultarInventario(db, { sede: 2, categoria: 'Pintura', bajo: '1', limite: '25', pagina: '2' });
  assert.deepEqual(db.llamadas[0].parametros, {
    limite: 25, sede: 2, patron: null, categoria: 'Pintura', bajo: 1, desplazamiento: 25,
  });
});

test('la categoría del usuario nunca se concatena al SQL', async () => {
  const db = dbFalsa();
  await consultarInventario(db, { sede: 1, categoria: "x'; DROP TABLE productos; --" });
  assert.equal(db.llamadas[0].consulta, SQL_CONSULTA);
  assert.equal(db.llamadas[0].consulta.includes('DROP'), false);
});

test('lista las categorías de la sede con su contexto', async () => {
  const db = dbFalsa([{ categoria: 'Herramientas' }, { categoria: 'Pintura' }]);
  const r = await listarCategorias(db, { sede: '2' }, { admin: true });
  assert.deepEqual(r, { sede: 2, categorias: ['Herramientas', 'Pintura'] });
  assert.deepEqual(db.llamadas[0].contexto, { sedeId: 2, admin: true });
  assert.equal(db.llamadas[0].consulta, SQL_CATEGORIAS);
});

test('listar categorías con una sede inválida falla antes de la base', async () => {
  const db = dbFalsa();
  await assert.rejects(() => listarCategorias(db, { sede: 7 }), ErrorValidacion);
  assert.equal(db.llamadas.length, 0);
});

test('resume la sede con su contexto y el umbral', async () => {
  const db = dbFalsa([{ productos: 1250, unidades: 34039, bajo: 384, agotados: 116 }]);
  const r = await resumirSede(db, { sede: '1' }, { admin: true });
  assert.deepEqual(r, { sede: 1, productos: 1250, unidades: 34039, bajo: 384, agotados: 116, umbralBajo: UMBRAL_BAJO });
  assert.deepEqual(db.llamadas[0].contexto, { sedeId: 1, admin: true });
  assert.deepEqual(db.llamadas[0].parametros, { sede: 1 });
  assert.equal(db.llamadas[0].consulta, SQL_RESUMEN);
});

test('el resumen de una sede sin filas devuelve ceros', async () => {
  const r = await resumirSede(dbFalsa([]), { sede: 3 });
  assert.equal(r.productos, 0);
  assert.equal(r.unidades, 0);
});

test('el resumen con una sede inválida falla antes de la base', async () => {
  const db = dbFalsa();
  await assert.rejects(() => resumirSede(db, { sede: 9 }), ErrorValidacion);
  assert.equal(db.llamadas.length, 0);
});

test('el SQL del resumen filtra por sede y no concatena entradas', () => {
  assert.match(SQL_RESUMEN, /WHERE e\.sede_id = @sede/);
  assert.doesNotMatch(SQL_RESUMEN, /\$\{/);
});
