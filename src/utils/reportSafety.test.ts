import { describe, expect, test } from 'bun:test';
import { sanitizeReportData } from './reportSafety';

describe('Reporte exportado: limpieza de textos', () => {
  test('un texto con código HTML queda sin etiquetas', () => {
    const out = sanitizeReportData('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('"');
  });

  test('limpia textos dentro de objetos y listas, sin tocar números', () => {
    const game = {
      round: 7,
      operatorName: 'Ana <b>',
      sheet75Snapshot: { columns: [{ title: '<script>x</script>', multiplier: 3 }] },
      drawnBallsPlayed: [5, 12],
    };
    const out = sanitizeReportData(game);
    expect(out.round).toBe(7);
    expect(out.drawnBallsPlayed).toEqual([5, 12]);
    expect(out.sheet75Snapshot.columns[0].multiplier).toBe(3);
    expect(out.operatorName).toBe('Ana ‹b›');
    expect(out.sheet75Snapshot.columns[0].title).toBe('‹script›x‹/script›');
  });

  test('no modifica los datos originales', () => {
    const game = { name: '<x>' };
    sanitizeReportData(game);
    expect(game.name).toBe('<x>');
  });

  test('textos normales quedan igual', () => {
    expect(sanitizeReportData('Partida 12 - Turno 2 (X10)')).toBe('Partida 12 - Turno 2 (X10)');
    expect(sanitizeReportData(null)).toBe(null);
  });
});
