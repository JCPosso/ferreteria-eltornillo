'use strict';
const NOMBRES = { 1: 'Centro', 2: 'Norte', 3: 'Sur' };
const POR_PAGINA = 25;
const FILAS_ESQUELETO = 8;
const $ = (id) => document.getElementById(id);
const formato = new Intl.NumberFormat('es-CO');

let pagina = 1;
let totalPaginas = 1;
let solicitud = 0;
let aviso;
let umbral = 15;

function sedeActual() {
  const marcada = document.querySelector('input[name="sede"]:checked');
  return marcada ? marcada.value : '1';
}

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

function temaEfectivo() {
  const fijo = document.documentElement.dataset.tema;
  if (fijo) return fijo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

function alternarTema() {
  const nuevo = temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro';
  document.documentElement.dataset.tema = nuevo;
  try {
    localStorage.setItem('tema', nuevo);
  } catch {
    return;
  }
}

async function cargarCategorias() {
  const lista = $('categoria');
  lista.replaceChildren(new Option('Todas las categorías', ''));
  try {
    const r = await fetch(`/api/categorias?sede=${encodeURIComponent(sedeActual())}`);
    if (!r.ok) return;
    const { categorias } = await r.json();
    for (const c of categorias) lista.appendChild(new Option(c, c));
  } catch {
    return;
  }
}

function ponerResumen(r) {
  const valor = (n) => (typeof n === 'number' ? formato.format(n) : '—');
  $('r-productos').textContent = valor(r?.productos);
  $('r-unidades').textContent = valor(r?.unidades);
  $('r-bajo').textContent = valor(r?.bajo);
  $('r-agotados').textContent = valor(r?.agotados);
}

async function cargarResumen() {
  ponerResumen(null);
  try {
    const r = await fetch(`/api/resumen?sede=${encodeURIComponent(sedeActual())}`);
    if (!r.ok) return;
    ponerResumen(await r.json());
  } catch {
    return;
  }
}

function celda(clase, ...hijos) {
  const td = document.createElement('td');
  td.className = clase;
  td.append(...hijos);
  return td;
}

function texto(etiqueta, clase, contenido) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  el.textContent = contenido;
  return el;
}

function celdaStock(cantidad) {
  const estado = cantidad === 0 ? 'cero' : cantidad < umbral ? 'bajo' : 'ok';
  const etiqueta = { cero: 'Agotado', bajo: 'Bajo', ok: 'Normal' }[estado];
  const caja = document.createElement('div');
  caja.className = `stock estado-${estado}`;
  const barra = document.createElement('span');
  barra.className = 'barra';
  const relleno = document.createElement('i');
  relleno.style.setProperty('--nivel', String(Math.min(100, Math.round((cantidad / (umbral * 4)) * 100))));
  barra.appendChild(relleno);
  caja.append(texto('b', '', formato.format(cantidad)), barra, texto('span', 'etiqueta', etiqueta));
  return celda('stock-td', caja);
}

function mostrarTabla(items) {
  const cuerpo = $('tabla').querySelector('tbody');
  cuerpo.replaceChildren();
  for (const it of items) {
    const fila = document.createElement('tr');
    fila.append(
      celda('codigo', it.codigo),
      celda('nombre-td', texto('span', 'nombre', it.nombre)),
      celda('cat', texto('span', 'chip-cat', it.categoria)),
      celdaStock(it.cantidad),
    );
    cuerpo.appendChild(fila);
  }
  $('contenedor').hidden = items.length === 0;
  $('vacio').hidden = items.length !== 0;
}

function mostrarEsqueleto() {
  const cuerpo = $('tabla').querySelector('tbody');
  if (cuerpo.children.length > 0) return;
  for (let i = 0; i < FILAS_ESQUELETO; i += 1) {
    const fila = document.createElement('tr');
    fila.className = 'esqueleto';
    for (const clase of ['codigo', 'nombre-td', 'cat', 'stock-td']) {
      const td = document.createElement('td');
      td.className = clase;
      td.appendChild(document.createElement('span'));
      fila.appendChild(td);
    }
    cuerpo.appendChild(fila);
  }
  $('contenedor').hidden = false;
  $('vacio').hidden = true;
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

function sincronizarBajo() {
  const activo = $('bajo').checked;
  $('r-bajo-boton').setAttribute('aria-pressed', String(activo));
  $('r-bajo-pista').textContent = activo ? 'Filtro activo' : 'Filtrar';
}

async function consultar(nuevaPagina = 1) {
  pagina = nuevaPagina;
  const id = ++solicitud;
  const params = new URLSearchParams({
    sede: sedeActual(),
    limite: String(POR_PAGINA),
    pagina: String(pagina),
  });
  const q = $('q').value.trim();
  if (q) params.set('q', q);
  if ($('categoria').value) params.set('categoria', $('categoria').value);
  if ($('bajo').checked) params.set('bajo', '1');

  $('estado').textContent = 'Consultando…';
  mostrarEsqueleto();
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
    if (r.status === 404) throw new Error('La API no está disponible en este ambiente.');
    if (!r.ok) throw new Error(datos.error || 'No se pudo consultar el inventario.');
    if (datos.items.length === 0 && pagina > 1) {
      consultar(1);
      return;
    }
    umbral = datos.umbralBajo;
    mostrarTabla(datos.items);
    mostrarPaginacion(datos.total);
    if (datos.total === 0) {
      $('estado').textContent = `Sede ${NOMBRES[datos.sede]}`;
      $('vacio-texto').textContent = 'No hay productos que coincidan con los filtros elegidos.';
    } else {
      const inicio = (pagina - 1) * POR_PAGINA + 1;
      const fin = inicio + datos.items.length - 1;
      $('estado').textContent =
        `Mostrando ${formato.format(inicio)}–${formato.format(fin)} de ${formato.format(datos.total)} producto(s) · Sede ${NOMBRES[datos.sede]}`;
    }
  } catch (e) {
    if (id !== solicitud) return;
    mostrarTabla([]);
    $('vacio-texto').textContent = mensajeDeError(e);
    $('paginacion').hidden = true;
    $('estado').textContent = 'No se pudo completar la consulta.';
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
  sincronizarBajo();
  consultar(1);
}

function pintarSedes(sedes) {
  const caja = $('sedes');
  sedes.forEach((s, i) => {
    const etiqueta = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'sede';
    radio.value = String(s);
    radio.checked = i === 0;
    etiqueta.append(radio, texto('span', '', NOMBRES[s]));
    caja.appendChild(etiqueta);
  });
  if (sedes.length === 1) caja.hidden = true;
}

async function cambiarSede() {
  $('categoria').value = '';
  $('subtitulo').textContent = `Existencias de la sede ${NOMBRES[sedeActual()]}`;
  cargarResumen();
  await cargarCategorias();
  consultar(1);
}

(async () => {
  $('tema').addEventListener('click', alternarTema);
  cargarVersion();
  const principal = await cargarUsuario();
  if (!principal) { $('acceso').hidden = false; return; }

  $('correo').textContent = principal.userDetails;
  $('avatar').textContent = principal.userDetails.charAt(0);
  $('usuario').hidden = false;

  const sedes = sedesPermitidas(principal);
  if (sedes.length === 0) {
    $('acceso').hidden = false;
    $('acceso-texto').textContent = 'Su cuenta aún no tiene una sede asignada. Pídale acceso al administrador.';
    $('acceso-boton').hidden = true;
    return;
  }
  pintarSedes(sedes);
  $('consulta').hidden = false;
  $('subtitulo').textContent = `Existencias de la sede ${NOMBRES[sedeActual()]}`;

  $('formulario').addEventListener('submit', (e) => e.preventDefault());
  let espera;
  $('q').addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => consultar(1), 350);
  });
  $('limpiar').addEventListener('click', limpiar);
  $('categoria').addEventListener('change', () => consultar(1));
  $('bajo').addEventListener('change', () => { sincronizarBajo(); consultar(1); });
  $('r-bajo-boton').addEventListener('click', () => {
    $('bajo').checked = !$('bajo').checked;
    sincronizarBajo();
    consultar(1);
  });
  $('sedes').addEventListener('change', cambiarSede);
  $('anterior').addEventListener('click', () => consultar(pagina - 1));
  $('siguiente').addEventListener('click', () => consultar(pagina + 1));

  cargarResumen();
  await cargarCategorias();
  consultar(1);
})();
