import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPin, normalizePin } from '../src/lib/validation.ts';

test('isValidPin: rechaza cualquier no-dígito (letras, espacios, símbolos)', () => {
  const invalidos = [
    'abcd',
    'a1b2c3',
    '12 34',
    '12ab',
    '1234-',
    '1234.5',
    '1234e5',
    'uno23',
    '１２３４',
  ];
  for (const v of invalidos) {
    assert.equal(isValidPin(v), false, `no debe validar: ${JSON.stringify(v)}`);
  }
});

test('isValidPin: acepta solo dígitos entre 4 y 6', () => {
  const validos = ['1234', '12345', '123456'];
  for (const v of validos) {
    assert.equal(isValidPin(v), true, `debe validar: ${JSON.stringify(v)}`);
  }
  const fuera = ['123', '1234567', '1', ''];
  for (const v of fuera) {
    assert.equal(isValidPin(v), false, `no debe validar: ${JSON.stringify(v)}`);
  }
});

test('normalizePin: elimina no-dígitos y limita a máximo 6', () => {
  assert.equal(normalizePin('12a34'), '1234', 'quita letra');
  assert.equal(normalizePin(' 12 34 '), '1234', 'quita espacios');
  assert.equal(normalizePin('1234567'), '123456', 'cap a 6');
  assert.equal(normalizePin('1-2-3-4-5-6-7'), '123456', 'quita guiones');
  assert.equal(normalizePin('abc'), '', 'puro no-dígito');
  assert.equal(normalizePin(''), '', 'vacío');
  assert.equal(normalizePin(undefined), '', 'undefined no revienta');
  assert.equal(normalizePin(null), '', 'null no revienta');
});
