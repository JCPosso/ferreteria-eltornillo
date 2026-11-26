'use strict';

function leerPrincipal(headers) {
  const crudo = typeof headers?.get === 'function'
    ? headers.get('x-ms-client-principal')
    : headers?.['x-ms-client-principal'];
  if (!crudo) return null;
  try {
    const p = JSON.parse(Buffer.from(crudo, 'base64').toString('utf8'));
    if (!p || typeof p !== 'object') return null;
    return {
      usuario: p.userDetails || 'desconocido',
      roles: Array.isArray(p.userRoles) ? p.userRoles : [],
    };
  } catch {
    return null;
  }
}

function esAdmin(principal) {
  return !!principal && principal.roles.includes('admin');
}

function puedeVerSede(principal, sedeId) {
  if (!principal) return false;
  if (!principal.roles.includes('authenticated') && !esAdmin(principal)) return false;
  return esAdmin(principal) || principal.roles.includes(`sede_${sedeId}`) || principal.roles.includes(`sede-${sedeId}`);
}

module.exports = { leerPrincipal, esAdmin, puedeVerSede };
