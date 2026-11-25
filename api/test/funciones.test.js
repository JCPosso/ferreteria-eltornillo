'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/lib/db');
const inventario = require('../src/functions/inventario');
const categorias = require('../src/functions/categorias');
const health = require('../src/functions/health');

const contexto = { warn() {}, error() {}, log() {} };
const peticion = (query, principal) => ({
  headers: new Map(principal ? [['x-ms-client-principal', Buffer.from(JSON.stringify(principal)).toString('base64')]] : []),
  query: new URLSearchParams(query),
});
const empleado = (n) => ({ userDetails: `emp${n}@tornillo.co`, userRoles: ['anonymous', 'authenticated', `sede-${n}`] });

test('401 sin identidad', async () => {
  const r = await inventario.manejador(peticion('sede=1'), contexto);
  assert.equal(r.status, 401);
});

test('403 al consultar otra sede', async () => {
  db.ejecutar = async () => { throw new Error('no debe llamarse'); };
  const r = await inventario.manejador(peticion('sede=2', empleado(1)), contexto);
  assert.equal(r.status, 403);
});

test('400 con parámetros inválidos', async () => {
  const r = await inventario.manejador(peticion('sede=1&limite=999', empleado(1)), contexto);
  assert.equal(r.status, 400);
});

test('200 con la consulta de su propia sede', async () => {
  db.ejecutar = async (ctx) => [{ codigo: 'X', nombre: 'Prueba', categoria: 'Test', sedeId: ctx.sedeId, cantidad: 3, totalCoincidencias: 1 }];
  const r = await inventario.manejador(peticion('sede=1&q=prueba', empleado(1)), contexto);
  assert.equal(r.status, 200);
  assert.equal(r.jsonBody.total, 1);
  assert.equal(r.jsonBody.items[0].sedeId, 1);
});

test('el administrador consulta cualquier sede', async () => {
  let recibido;
  db.ejecutar = async (ctx) => { recibido = ctx; return []; };
  const admin = { userDetails: 'jefe@tornillo.co', userRoles: ['authenticated', 'admin'] };
  const r = await inventario.manejador(peticion('sede=3', admin), contexto);
  assert.equal(r.status, 200);
  assert.deepEqual(recibido, { sedeId: 3, admin: true });
});

test('500 sin filtrar detalles si la base falla', async () => {
  db.ejecutar = async () => { throw new Error('login failed for user secreto'); };
  const r = await inventario.manejador(peticion('sede=1', empleado(1)), contexto);
  assert.equal(r.status, 500);
  assert.equal(JSON.stringify(r.jsonBody).includes('secreto'), false);
});

test('health responde 200 si la base contesta', async () => {
  db.ping = async () => true;
  const r = await health.manejador({}, contexto);
  assert.equal(r.status, 200);
  assert.equal(r.jsonBody.estado, 'ok');
});

test('health responde 503 si la base no contesta', async () => {
  db.ping = async () => { throw new Error('timeout'); };
  const r = await health.manejador({}, contexto);
  assert.equal(r.status, 503);
});

test('categorías: 401 sin identidad', async () => {
  const r = await categorias.manejador(peticion('sede=1'), contexto);
  assert.equal(r.status, 401);
});

test('categorías: 403 para otra sede', async () => {
  db.ejecutar = async () => { throw new Error('no debe llamarse'); };
  const r = await categorias.manejador(peticion('sede=2', empleado(1)), contexto);
  assert.equal(r.status, 403);
});

test('categorías: 200 con la lista de su sede', async () => {
  db.ejecutar = async () => [{ categoria: 'Pintura' }];
  const r = await categorias.manejador(peticion('sede=1', empleado(1)), contexto);
  assert.equal(r.status, 200);
  assert.deepEqual(r.jsonBody.categorias, ['Pintura']);
});

test('categorías: 500 sin filtrar detalles', async () => {
  db.ejecutar = async () => { throw new Error('login failed for user secreto'); };
  const r = await categorias.manejador(peticion('sede=1', empleado(1)), contexto);
  assert.equal(r.status, 500);
  assert.equal(JSON.stringify(r.jsonBody).includes('secreto'), false);
});

test('inventario: 400 con una página inválida', async () => {
  const r = await inventario.manejador(peticion('sede=1&pagina=0', empleado(1)), contexto);
  assert.equal(r.status, 400);
});

test('inventario: pasa categoría, stock bajo y página a la consulta', async () => {
  let recibido;
  db.ejecutar = async (ctx, consulta, parametros) => { recibido = parametros; return []; };
  const r = await inventario.manejador(peticion('sede=1&categoria=Pintura&bajo=1&limite=25&pagina=2', empleado(1)), contexto);
  assert.equal(r.status, 200);
  assert.equal(recibido.categoria, 'Pintura');
  assert.equal(recibido.bajo, 1);
  assert.equal(recibido.desplazamiento, 25);
});
