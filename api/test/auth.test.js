'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { leerPrincipal, esAdmin, puedeVerSede } = require('../src/lib/auth');

const cabecera = (obj) => ({ 'x-ms-client-principal': Buffer.from(JSON.stringify(obj)).toString('base64') });

test('sin encabezado no hay principal', () => {
  assert.equal(leerPrincipal({}), null);
  assert.equal(leerPrincipal(new Map()), null);
});

test('un encabezado corrupto se ignora', () => {
  assert.equal(leerPrincipal({ 'x-ms-client-principal': '%%%no-base64-json' }), null);
});

test('lee usuario y roles del encabezado', () => {
  const p = leerPrincipal(cabecera({ userDetails: 'ana@tornillo.co', userRoles: ['anonymous', 'authenticated', 'sede-2'] }));
  assert.equal(p.usuario, 'ana@tornillo.co');
  assert.deepEqual(p.roles, ['anonymous', 'authenticated', 'sede-2']);
});

test('el empleado solo ve su sede', () => {
  const p = { usuario: 'ana', roles: ['authenticated', 'sede-2'] };
  assert.equal(puedeVerSede(p, 2), true);
  assert.equal(puedeVerSede(p, 1), false);
  assert.equal(puedeVerSede(p, 3), false);
});

test('el administrador ve todas las sedes', () => {
  const p = { usuario: 'jefe', roles: ['authenticated', 'admin'] };
  assert.equal(esAdmin(p), true);
  for (const s of [1, 2, 3]) assert.equal(puedeVerSede(p, s), true);
});

test('un usuario autenticado sin rol de sede no ve nada', () => {
  const p = { usuario: 'nuevo', roles: ['authenticated'] };
  for (const s of [1, 2, 3]) assert.equal(puedeVerSede(p, s), false);
});

test('sin principal no se ve ninguna sede', () => {
  assert.equal(puedeVerSede(null, 1), false);
});

test('un rol de sede sin estar autenticado no basta', () => {
  assert.equal(puedeVerSede({ usuario: 'x', roles: ['sede-1'] }, 1), false);
});
