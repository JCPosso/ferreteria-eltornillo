'use strict';

// Sedes del negocio (supuesto: 3 sedes). El id es el que se guarda en la base.
const SEDES = { 1: 'Centro', 2: 'Norte', 3: 'Sur' };

class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorValidacion';
  }
}

/**
 * Valida y normaliza los parámetros de una consulta de inventario.
 * Nunca se concatena nada al SQL: estos valores solo se usan como parámetros.
 */
function validarConsulta({ sede, q, limite } = {}) {
  const sedeId = Number(sede);
  if (!Number.isInteger(sedeId) || !SEDES[sedeId]) {
    throw new ErrorValidacion('sede inválida: use 1, 2 o 3');
  }

  let texto = null;
  if (q !== undefined && q !== null && String(q).trim() !== '') {
    texto = String(q).trim();
    if (texto.length > 50) throw new ErrorValidacion('q admite máximo 50 caracteres');
  }

  let lim = 20;
  if (limite !== undefined && limite !== null && String(limite) !== '') {
    lim = Number(limite);
    if (!Number.isInteger(lim) || lim < 1 || lim > 100) {
      throw new ErrorValidacion('limite debe ser un entero entre 1 y 100');
    }
  }
  return { sedeId, texto, limite: lim };
}

/** Escapa los comodines de LIKE para que el texto del usuario se busque literal. */
function patronLike(texto) {
  if (texto === null) return null;
  return '%' + texto.replace(/[\\%_\[]/g, (c) => '\\' + c) + '%';
}

module.exports = { SEDES, ErrorValidacion, validarConsulta, patronLike };
