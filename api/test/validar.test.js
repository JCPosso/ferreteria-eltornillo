'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarConsulta, patronLike, ErrorValidacion } = require('../src/lib/validar');

test('acepta una consulta válida y aplica los valores por defecto', () => {
  assert.deepEqual(validarConsulta({ sede: '2' }), { sedeId: 2, texto: null, limite: 20 });
});

test('recorta espacios y conserva el texto de búsqueda', () => {
  assert.equal(validarConsulta({ sede: 1, q: '  martillo ' }).texto, 'martillo');
});

for (const sede of [undefined, null, '', '0', '4', 'abc', '1.5', '-1']) {
  test(`rechaza la sede inválida: ${JSON.stringify(sede)}`, () => {
    assert.throws(() => validarConsulta({ sede }), ErrorValidacion);
  });
}

test('rechaza un texto de más de 50 caracteres', () => {
  assert.throws(() => validarConsulta({ sede: 1, q: 'x'.repeat(51) }), ErrorValidacion);
});

for (const limite of ['0', '101', 'diez', '2.5']) {
  test(`rechaza el límite inválido: ${limite}`, () => {
    assert.throws(() => validarConsulta({ sede: 1, limite }), ErrorValidacion);
  });
}

test('un texto vacío se trata como sin búsqueda', () => {
  assert.equal(validarConsulta({ sede: 1, q: '   ' }).texto, null);
});

test('patronLike escapa los comodines del usuario', () => {
  assert.equal(patronLike('50%_[x]\\'), '%50\\%\\_\\[x]\\\\%');
  assert.equal(patronLike(null), null);
});
