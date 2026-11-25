'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { consultarInventario, SQL_CONSULTA } = require('../src/lib/inventario');
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
  const db = dbFalsa([{ codigo: 'MAR-001', nombre: 'Martillo', categoria: 'Herramientas', sedeId: 1, cantidad: 12 }]);
  const r = await consultarInventario(db, { sede: '1', q: 'mart' });
  assert.equal(r.total, 1);
  assert.equal(r.sede, 1);
  assert.deepEqual(db.llamadas[0].contexto, { sedeId: 1, admin: false });
  assert.deepEqual(db.llamadas[0].parametros, { limite: 20, sede: 1, patron: '%mart%' });
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
  assert.match(SQL_CONSULTA, /TOP \(@limite\)/);
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
