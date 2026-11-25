'use strict';
const NOMBRES = { 1: 'Centro', 2: 'Norte', 3: 'Sur' };
const POR_PAGINA = 25;
const $ = (id) => document.getElementById(id);
const formato = new Intl.NumberFormat('es-CO');

let pagina = 1;
let totalPaginas = 1;
let solicitud = 0;
let aviso;

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

async function cargarCategorias() {
  const lista = $('categoria');
  lista.replaceChildren(new Option('Todas', ''));
  try {
    const r = await fetch(`/api/categorias?sede=${encodeURIComponent($('sede').value)}`);
    if (!r.ok) return;
    const { categorias } = await r.json();
    for (const c of categorias) lista.appendChild(new Option(c, c));
  } catch {
    return;
  }
}

function mostrarTabla(items, umbral) {
  const cuerpo = $('tabla').querySelector('tbody');
  cuerpo.replaceChildren();
  for (const it of items) {
    const fila = document.createElement('tr');
    for (const clave of ['codigo', 'nombre', 'categoria']) {
      const celda = document.createElement('td');
      celda.textContent = it[clave];
      if (clave === 'categoria') celda.className = 'cat';
      fila.appendChild(celda);
    }
    const existencias = document.createElement('td');
    existencias.className = 'num';
    existencias.textContent = formato.format(it.cantidad);
    if (it.cantidad < umbral) {
      existencias.classList.add('bajo');
      const marca = document.createElement('span');
      marca.className = 'etiqueta';
      marca.textContent = 'Bajo';
      existencias.appendChild(marca);
    }
    fila.appendChild(existencias);
    cuerpo.appendChild(fila);
  }
  $('contenedor').hidden = items.length === 0;
}

function mostrarPaginacion(total) {
  totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  $('paginacion').hidden = total <= POR_PAGINA;
  $('pagina').textContent = `Página ${formato.format(pagina)} de ${formato.format(totalPaginas)}`;
  $('anterior').disabled = pagina <= 1;
  $('siguiente').disabled = pagina >= totalPaginas;
}

function ocupado(valor) {
  $('contenedor').setAttribute('aria-busy', String(valor));
  for (const id of ['anterior', 'siguiente']) {
    if (valor) $(id).disabled = true;
  }
}

function mensajeDeError(e) {
  if (e instanceof TypeError) return 'No hay conexión con el servidor.';
  return e.message;
}

async function consultar(nuevaPagina = 1) {
  pagina = nuevaPagina;
  const id = ++solicitud;
  const params = new URLSearchParams({
    sede: $('sede').value,
    limite: String(POR_PAGINA),
    pagina: String(pagina),
  });
  const texto = $('q').value.trim();
  if (texto) params.set('q', texto);
  if ($('categoria').value) params.set('categoria', $('categoria').value);
  if ($('bajo').checked) params.set('bajo', '1');

  $('estado').textContent = 'Consultando…';
  ocupado(true);
  clearTimeout(aviso);
  aviso = setTimeout(() => {
    if (id === solicitud) {
      $('estado').textContent = 'Consultando… la base de datos puede tardar hasta un minuto en despertar.';
    }
  }, 5000);

  try {
    const r = await fetch(`/api/inventario?${params}`);
    const datos = await r.json().catch(() => ({}));
    if (id !== solicitud) return;
    if (r.status === 403) throw new Error('No tiene permiso para esta sede.');
    if (r.status === 401) throw new Error('Su sesión expiró. Inicie sesión de nuevo.');
    if (!r.ok) throw new Error(datos.error || 'No se pudo consultar el inventario.');
    if (datos.items.length === 0 && pagina > 1) {
      consultar(1);
      return;
    }
    mostrarTabla(datos.items, datos.umbralBajo);
    mostrarPaginacion(datos.total);
    if (datos.total === 0) {
      $('estado').textContent = 'Sin resultados para los filtros elegidos.';
    } else {
      const inicio = (pagina - 1) * POR_PAGINA + 1;
      const fin = inicio + datos.items.length - 1;
      $('estado').textContent =
        `Mostrando ${formato.format(inicio)}–${formato.format(fin)} de ${formato.format(datos.total)} producto(s) en la sede ${NOMBRES[datos.sede]}.`;
    }
  } catch (e) {
    if (id !== solicitud) return;
    mostrarTabla([], 0);
    $('paginacion').hidden = true;
    $('estado').textContent = mensajeDeError(e);
  } finally {
    if (id === solicitud) {
      clearTimeout(aviso);
      ocupado(false);
    }
  }
}

function limpiar() {
  $('q').value = '';
  $('categoria').value = '';
  $('bajo').checked = false;
  consultar(1);
}

(async () => {
  cargarVersion();
  const principal = await cargarUsuario();
  if (!principal) { $('acceso').hidden = false; return; }

  $('usuario').textContent = principal.userDetails + ' · ';
  const salir = document.createElement('a');
  salir.href = '/.auth/logout?post_logout_redirect_uri=/';
  salir.textContent = 'Cerrar sesión';
  $('usuario').appendChild(salir);

  const sedes = sedesPermitidas(principal);
  if (sedes.length === 0) {
    $('acceso').hidden = false;
    $('acceso').querySelector('p').textContent = 'Su cuenta aún no tiene una sede asignada. Pídale acceso al administrador.';
    $('acceso').querySelector('a').hidden = true;
    return;
  }
  for (const s of sedes) $('sede').appendChild(new Option(NOMBRES[s], String(s)));
  $('consulta').hidden = false;

  $('formulario').addEventListener('submit', (e) => { e.preventDefault(); consultar(1); });
  $('limpiar').addEventListener('click', limpiar);
  $('categoria').addEventListener('change', () => consultar(1));
  $('bajo').addEventListener('change', () => consultar(1));
  $('sede').addEventListener('change', async () => {
    $('categoria').value = '';
    await cargarCategorias();
    consultar(1);
  });
  $('anterior').addEventListener('click', () => consultar(pagina - 1));
  $('siguiente').addEventListener('click', () => consultar(pagina + 1));

  await cargarCategorias();
  consultar(1);
})();
