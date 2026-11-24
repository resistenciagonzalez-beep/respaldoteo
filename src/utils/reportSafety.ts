/**
 * Seguridad de los reportes exportados (PDF / imagen).
 *
 * El reporte se arma como HTML. Para que ningún dato guardado (nombres, títulos,
 * notas...) pueda meter código en la pantalla de quien exporta, todos los textos
 * se limpian antes: los caracteres que forman etiquetas HTML se cambian por otros
 * que se ven casi igual. Los números no cambian.
 */
// Cambia los caracteres que podrían formar código HTML por otros que se ven casi igual
const REPORT_UNSAFE_CHARS: Record<string, string> = {
  '<': '‹',
  '>': '›',
  '"': '”',
  "'": '’',
  '`': 'ˋ',
};

/** Copia de los datos de la partida con todos sus textos limpios (los números no cambian). */
export function sanitizeReportData<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/[<>"'`]/g, (ch) => REPORT_UNSAFE_CHARS[ch] || '') as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeReportData(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeReportData(v);
    }
    return out as T;
  }
  return value;
}
