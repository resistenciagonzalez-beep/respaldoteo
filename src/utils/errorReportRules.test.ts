import { describe, expect, test } from 'bun:test';
import {
  MAX_REPORTS_PER_SESSION,
  SAME_ERROR_COOLDOWN_MS,
  clipText,
  describeError,
  isIgnorableError,
  shouldReport,
} from './errorReportRules';

describe('Registro de errores: límites', () => {
  test('envía un error nuevo', () => {
    expect(shouldReport('Falló algo', 1000, { sent: 0, history: {} })).toBe(true);
  });

  test('no repite el mismo error antes de 10 minutos', () => {
    const state = { sent: 1, history: { 'Falló algo': 1000 } };
    expect(shouldReport('Falló algo', 1000 + 60_000, state)).toBe(false);
    expect(shouldReport('Falló algo', 1000 + SAME_ERROR_COOLDOWN_MS, state)).toBe(true);
  });

  test('máximo de avisos por sesión', () => {
    expect(shouldReport('Otro error', 1000, { sent: MAX_REPORTS_PER_SESSION, history: {} })).toBe(false);
  });

  test('ignora ruido del navegador', () => {
    expect(isIgnorableError('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(isIgnorableError('Script error.')).toBe(true);
    expect(isIgnorableError('')).toBe(true);
    expect(isIgnorableError('No se pudo guardar')).toBe(false);
  });
});

describe('Registro de errores: textos', () => {
  test('recorta textos largos', () => {
    expect(clipText('a'.repeat(20), 5)).toBe('aaaaa…');
    expect(clipText(null, 5)).toBe('');
  });

  test('convierte cualquier error en mensaje', () => {
    expect(describeError(new Error('Fallo X')).message).toBe('Fallo X');
    expect(describeError({ message: 'Fallo Y' }).message).toBe('Fallo Y');
    expect(describeError('Fallo Z').message).toBe('Fallo Z');
  });
});
