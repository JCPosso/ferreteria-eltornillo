'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarConsulta, patronLike, ErrorValidacion } = require('../src/lib/validar');

test('acepta una consulta válida y aplica los valores por defecto', () => {
  assert.deepEqual(validarConsulta({ sede: '2' }), {
    sedeId: 2, texto: null, categoria: null, bajo: false, limite: 20, pagina: 1, desplazamiento: 0,
  });
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

test('calcula el desplazamiento a partir de la página y el límite', () => {
  const v = validarConsulta({ sede: 1, limite: '25', pagina: '3' });
  assert.equal(v.pagina, 3);
  assert.equal(v.desplazamiento, 50);
});

for (const pagina of ['0', '-1', 'x', '1.5', '10001']) {
  test(`rechaza la página inválida: ${pagina}`, () => {
    assert.throws(() => validarConsulta({ sede: 1, pagina }), ErrorValidacion);
  });
}

test('acepta la categoría y la recorta', () => {
  assert.equal(validarConsulta({ sede: 1, categoria: ' Pintura ' }).categoria, 'Pintura');
  assert.equal(validarConsulta({ sede: 1, categoria: '  ' }).categoria, null);
});

test('rechaza una categoría de más de 50 caracteres', () => {
  assert.throws(() => validarConsulta({ sede: 1, categoria: 'x'.repeat(51) }), ErrorValidacion);
});

for (const [valor, esperado] of [['1', true], ['true', true], ['0', false], ['false', false], ['', false], [undefined, false]]) {
  test(`interpreta bajo=${JSON.stringify(valor)}`, () => {
    assert.equal(validarConsulta({ sede: 1, bajo: valor }).bajo, esperado);
  });
}

test('rechaza un valor inválido en bajo', () => {
  assert.throws(() => validarConsulta({ sede: 1, bajo: 'quizas' }), ErrorValidacion);
});
