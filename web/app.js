'use strict';
const NOMBRES = { 1: 'Centro', 2: 'Norte', 3: 'Sur' };
const $ = (id) => document.getElementById(id);

async function cargarUsuario() {
  try {
    const r = await fetch('/.auth/me');
    const { clientPrincipal } = await r.json();
    return clientPrincipal;
  } catch {
    return null;
  }
}

async function cargarVersion() {
  try {
    const r = await fetch('/api/health');
    const { version } = await r.json();
    $('version').textContent = String(version).slice(0, 7);
  } catch {
    return;
  }
}

function sedesPermitidas(principal) {
  if (principal.userRoles.includes('admin')) return [1, 2, 3];
  return principal.userRoles
    .map((rol) => /^sede-(\d)$/.exec(rol))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

function mostrarTabla(items) {
  const cuerpo = $('tabla').querySelector('tbody');
  cuerpo.replaceChildren();
  for (const it of items) {
    const fila = document.createElement('tr');
    for (const [clave, clase] of [['codigo'], ['nombre'], ['categoria'], ['cantidad', 'num']]) {
      const celda = document.createElement('td');
      celda.textContent = it[clave]; // textContent: nunca HTML
      if (clase) celda.className = clase;
      if (clave === 'cantidad' && it.cantidad < 15) celda.classList.add('bajo');
      fila.appendChild(celda);
    }
    cuerpo.appendChild(fila);
  }
  $('tabla').hidden = items.length === 0;
}

async function consultar(evento) {
  evento.preventDefault();
  const params = new URLSearchParams({ sede: $('sede').value, limite: '50' });
  if ($('q').value.trim()) params.set('q', $('q').value.trim());
  $('estado').textContent = 'Consultando…';
  try {
    const r = await fetch(`/api/inventario?${params}`);
    const datos = await r.json().catch(() => ({}));
    if (r.status === 403) throw new Error('No tiene permiso para esta sede.');
    if (r.status === 401) throw new Error('Su sesión expiró. Inicie sesión de nuevo.');
    if (!r.ok) throw new Error(datos.error || 'No se pudo consultar el inventario.');
    mostrarTabla(datos.items);
    $('estado').textContent = datos.total === 0
      ? 'Sin resultados.'
      : `${datos.total} producto(s) en la sede ${NOMBRES[datos.sede]}.`;
  } catch (e) {
    mostrarTabla([]);
    $('estado').textContent = e.message;
  }
}

(async () => {
  cargarVersion();
  const principal = await cargarUsuario();
  if (!principal) { $('acceso').hidden = false; return; }

  $('usuario').textContent = principal.userDetails + ' · ';
  const salir = document.createElement('a');
  salir.href = '/.auth/logout?post_logout_redirect_uri=/';
  salir.textContent = 'Cerrar sesión';
  salir.style.color = '#fff';
  $('usuario').appendChild(salir);

  const sedes = sedesPermitidas(principal);
  if (sedes.length === 0) {
    $('acceso').hidden = false;
    $('acceso').querySelector('p').textContent = 'Su cuenta aún no tiene una sede asignada. Pídale acceso al administrador.';
    $('acceso').querySelector('a').hidden = true;
    return;
  }
  for (const s of sedes) {
    const op = document.createElement('option');
    op.value = String(s);
    op.textContent = NOMBRES[s];
    $('sede').appendChild(op);
  }
  $('consulta').hidden = false;
  $('formulario').addEventListener('submit', consultar);
})();
