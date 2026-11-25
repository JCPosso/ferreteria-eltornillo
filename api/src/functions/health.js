'use strict';
const { app } = require('@azure/functions');
const db = require('../lib/db');

async function manejador(request, context) {
  try {
    const ok = await db.ping();
    return { status: ok ? 200 : 503, jsonBody: { estado: ok ? 'ok' : 'degradado', version: process.env.APP_VERSION || 'dev' } };
  } catch (e) {
    context.error('health: la base no responde', e);
    return { status: 503, jsonBody: { estado: 'degradado', version: process.env.APP_VERSION || 'dev' } };
  }
}

app.http('health', { methods: ['GET'], authLevel: 'anonymous', route: 'health', handler: manejador });
module.exports = { manejador };
