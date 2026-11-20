'use strict';
const { app } = require('@azure/functions');
const db = require('../lib/db');
const { leerPrincipal, esAdmin, puedeVerSede } = require('../lib/auth');
const { consultarInventario } = require('../lib/inventario');
const { ErrorValidacion } = require('../lib/validar');

/** GET /api/inventario?sede=1&q=martillo&limite=20 */
async function manejador(request, context) {
  const principal = leerPrincipal(request.headers);
  if (!principal) return { status: 401, jsonBody: { error: 'no autenticado' } };

  const sede = request.query.get('sede');
  try {
    if (!puedeVerSede(principal, Number(sede))) {
      context.warn(`acceso denegado a la sede ${sede} para ${principal.usuario}`);
      return { status: 403, jsonBody: { error: 'sin permiso para esta sede' } };
    }
    const resultado = await consultarInventario(
      db,
      { sede, q: request.query.get('q'), limite: request.query.get('limite') },
      { admin: esAdmin(principal) },
    );
    return { status: 200, jsonBody: resultado };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { status: 400, jsonBody: { error: e.message } };
    context.error('error consultando inventario', e);
    return { status: 500, jsonBody: { error: 'error interno' } };
  }
}

app.http('inventario', { methods: ['GET'], authLevel: 'anonymous', route: 'inventario', handler: manejador });
module.exports = { manejador };
