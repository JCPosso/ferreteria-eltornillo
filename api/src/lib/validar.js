'use strict';

const SEDES = { 1: 'Centro', 2: 'Norte', 3: 'Sur' };

class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorValidacion';
  }
}

function textoOpcional(valor, maximo, nombre) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const texto = String(valor).trim();
  if (texto.length > maximo) throw new ErrorValidacion(`${nombre} admite máximo ${maximo} caracteres`);
  return texto;
}

function booleanoOpcional(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return false;
  const v = String(valor).toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  throw new ErrorValidacion(`${nombre} debe ser 1 o 0`);
}

function validarSede(sede) {
  const sedeId = Number(sede);
  if (!Number.isInteger(sedeId) || !SEDES[sedeId]) {
    throw new ErrorValidacion('sede inválida: use 1, 2 o 3');
  }
  return sedeId;
}

function validarConsulta({ sede, q, limite, categoria, bajo, pagina } = {}) {
  const sedeId = validarSede(sede);
  const texto = textoOpcional(q, 50, 'q');
  const categoriaTexto = textoOpcional(categoria, 50, 'categoria');
  const soloBajo = booleanoOpcional(bajo, 'bajo');

  let lim = 20;
  if (limite !== undefined && limite !== null && String(limite) !== '') {
    lim = Number(limite);
    if (!Number.isInteger(lim) || lim < 1 || lim > 100) {
      throw new ErrorValidacion('limite debe ser un entero entre 1 y 100');
    }
  }

  let numeroPagina = 1;
  if (pagina !== undefined && pagina !== null && String(pagina) !== '') {
    numeroPagina = Number(pagina);
    if (!Number.isInteger(numeroPagina) || numeroPagina < 1 || numeroPagina > 10000) {
      throw new ErrorValidacion('pagina debe ser un entero entre 1 y 10000');
    }
  }

  return {
    sedeId,
    texto,
    categoria: categoriaTexto,
    bajo: soloBajo,
    limite: lim,
    pagina: numeroPagina,
    desplazamiento: (numeroPagina - 1) * lim,
  };
}

function patronLike(texto) {
  if (texto === null) return null;
  return '%' + texto.replace(/[\\%_\[]/g, (c) => '\\' + c) + '%';
}

module.exports = { SEDES, ErrorValidacion, validarSede, validarConsulta, patronLike };
