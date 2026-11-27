import { GameSequenceItem } from '../types';
import { formatTime12h } from './savedGamesStorage';
import { sanitizeReportData } from './reportSafety';
import {
  getActiveSeqEntry,
  getMultiplierLabel,
  getPlanilla90WinningRows,
  getRowNumbers,
  isPlanilla90Snapshot,
} from './planilla90Rules';

// ============================================================================
// Herramientas de exportación (imagen y PDF) cargadas SOLO cuando hacen falta.
// Así la plataforma abre más rápido: estas librerías pesan ~500 KB y casi no se usan.
// Además se precargan en segundo plano unos segundos después de abrir la página,
// para que exportar sea igual de rápido y funcione aunque se publique una versión nueva.
// ============================================================================
type Html2CanvasFn = typeof import('html2canvas').default;
type JsPdfCtor = typeof import('jspdf').jsPDF;

let html2canvasPromise: Promise<Html2CanvasFn> | null = null;
let jsPdfPromise: Promise<JsPdfCtor> | null = null;

const EXPORT_LOAD_ERROR =
  'No se pudo cargar la herramienta de exportación. Revisa tu conexión o recarga la página e intenta de nuevo.';

function loadHtml2Canvas(): Promise<Html2CanvasFn> {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas')
      .then((m) => m.default)
      .catch((err) => {
        html2canvasPromise = null; // permite reintentar después
        console.error('Error cargando html2canvas:', err);
        throw new Error(EXPORT_LOAD_ERROR);
      });
  }
  return html2canvasPromise;
}

function loadJsPdf(): Promise<JsPdfCtor> {
  if (!jsPdfPromise) {
    jsPdfPromise = import('jspdf')
      .then((m) => m.jsPDF)
      .catch((err) => {
        jsPdfPromise = null; // permite reintentar después
        console.error('Error cargando jsPDF:', err);
        throw new Error(EXPORT_LOAD_ERROR);
      });
  }
  return jsPdfPromise;
}

// Precarga en segundo plano (sin afectar la carga inicial)
if (typeof window !== 'undefined') {
  const preload = () => {
    void loadHtml2Canvas().catch(() => undefined);
    void loadJsPdf().catch(() => undefined);
  };
  window.setTimeout(() => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    if (typeof ric === 'function') ric.call(window, preload);
    else preload();
  }, 8000);
}

// Evita que un nombre con código HTML se ejecute dentro del reporte
function escapeReportHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/**
 * Capture any HTML element and trigger download as high-quality JPG image
 */
export async function exportElementAsJpg(
  element: HTMLElement,
  filename: string = 'partida_bingo.jpg'
): Promise<void> {
  try {
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(element, {
      scale: 2, // High resolution for crisp text and numbers
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename.endsWith('.jpg') ? filename : `${filename}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error al exportar elemento como JPG:', error);
    throw error;
  }
}

/**
 * Capture an HTML element and generate a downloadable PDF document
 */
export async function exportElementAsPdf(
  element: HTMLElement,
  filename: string = 'partida_bingo.pdf',
  metadata?: { round?: number; operator?: string; date?: string }
): Promise<void> {
  try {
    const [html2canvas, jsPDF] = await Promise.all([loadHtml2Canvas(), loadJsPdf()]);
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    const orientation = imgWidth > imgHeight ? 'landscape' : 'portrait';
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Top Header on PDF
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(194, 65, 12); // Orange 700
    const headerTitle = metadata?.round
      ? `REGISTRO DE PARTIDA #${metadata.round} • SISTEMA DE BINGO`
      : 'COMPROBANTE DE PARTIDA DE BINGO';
    pdf.text(headerTitle, 10, 10);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(75, 85, 99);
    const subText = `Operadora: ${metadata?.operator || 'Operadora'} | Fecha: ${
      metadata?.date || new Date().toLocaleDateString('es-ES')
    } | Generado automáticamente`;
    pdf.text(subText, 10, 15);

    const margin = 10;
    const topOffset = 18;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - topOffset - margin;

    let renderW = maxW;
    let renderH = (imgHeight * renderW) / imgWidth;
    if (renderH > maxH) {
      renderH = maxH;
      renderW = (imgWidth * renderH) / imgHeight;
    }

    const posX = (pageWidth - renderW) / 2;
    const posY = topOffset + (maxH - renderH) / 2;

    pdf.addImage(imgData, 'JPEG', posX, posY, renderW, renderH);

    const outName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(outName);
  } catch (error) {
    console.error('Error al exportar elemento como PDF:', error);
    throw error;
  }
}

/**
 * Generate full HTML markup of the game, including metrics, financials, and full card sheet
 */
export function buildGameDocumentHtml(rawItem: GameSequenceItem): string {
  // Seguridad: todos los textos de la partida se limpian antes de armar el reporte,
  // así ningún dato guardado puede meter código en la pantalla de quien lo exporta.
  const item = sanitizeReportData(rawItem);
  const isBingo90 = item.mode === '90' || item.sheetType === 'traditional-90';
  const totalBallsCount = item.drawnBallsPlayed?.length || item.totalBallsDrawnCount || 0;
  const linesCount =
    item.totalLinesPlayed ??
    (isBingo90
      ? 30
      : (item.sheet75Snapshot?.columns?.reduce((sum, c) => sum + (Number(c.multiplier) || 1), 0) || 11));

  // Sheet 75 snapshot preview
  let sheetHtml = '';
  if (isPlanilla90Snapshot(item.sheet75Snapshot)) {
    // Planilla 90 nueva: 30 filas (JUEGO r · r+30 · r+60) y columnas SOLO, DOBLE, TRIPLE...
    const p90 = item.sheet75Snapshot!;
    const cols = p90.columns;
    const winRows = getPlanilla90WinningRows(p90, getActiveSeqEntry(p90));
    const bingoRow = winRows.bingoRow ?? item.rowLeader;
    const drawn = new Set(item.drawnBallsPlayed || []);
    sheetHtml = `
      <div style="margin-top: 16px; margin-bottom: 16px; background: #ffffff; border: 1.5px solid #fed7aa; border-radius: 10px; padding: 12px; overflow-x: auto;">
        <div style="font-size: 12px; font-weight: 900; color: #9a3412; margin-bottom: 8px; text-transform: uppercase;">
          COPIA COMPLETA DE PLANILLA 90 (FORMATO NUEVO • 30 FILAS)
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: center;">
          <thead>
            <tr style="background: #000000; color: #ffffff;">
              <th style="padding: 6px 4px; border: 1px solid #334155; width: 90px;">JUEGO</th>
              ${cols
                .map((c) => `<th style="padding: 6px 4px; border: 1px solid #334155;">${escapeReportHtml(getMultiplierLabel(c.multiplier))}</th>`)
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: 30 }, (_, rIdx) => {
              const rowNum = rIdx + 1;
              const isWinning = rowNum === bingoRow;
              const isAmbo = rowNum === winRows.amboRow;
              const isPf = rowNum === winRows.pfRow;
              const bg = isWinning ? '#fef3c7' : isAmbo ? '#e0f2fe' : isPf ? '#d1fae5' : rIdx % 2 === 0 ? '#fffaf5' : '#ffffff';
              const nums = getRowNumbers(rowNum)
                .map((n) => `<span style="${drawn.has(n) ? 'color:#dc2626;' : ''}">${n}</span>`)
                .join(' · ');
              return `
                <tr style="background: ${bg};">
                  <td style="padding: 4px; border: 1px solid #fed7aa; font-weight: 900;">${nums} ${isWinning ? '★' : ''}</td>
                  ${cols
                    .map((c) => {
                      const pName = c.cells?.[rIdx]?.playerName || '';
                      return `<td style="padding: 4px; border: 1px solid #fed7aa; color: ${pName ? '#1e293b' : '#94a3b8'}; font-size: 9.5px;">${escapeReportHtml(pName || '-')}</td>`;
                    })
                    .join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (!isBingo90 && item.sheet75Snapshot && item.sheet75Snapshot.columns) {
    const cols = item.sheet75Snapshot.columns;
    sheetHtml = `
      <div style="margin-top: 16px; margin-bottom: 16px; background: #ffffff; border: 1.5px solid #fed7aa; border-radius: 10px; padding: 12px; overflow-x: auto;">
        <div style="font-size: 12px; font-weight: 900; color: #9a3412; margin-bottom: 8px; text-transform: uppercase;">
          COPIA COMPLETA DE PLANILLA REGISTRADA (15 FILAS • MULTIPLICADORES)
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: center;">
          <thead>
            <tr style="background: #f97316; color: #ffffff;">
              <th style="padding: 6px 4px; border: 1px solid #ea580c; width: 45px;">FILA</th>
              ${cols
                .map(
                  (c) =>
                    `<th style="padding: 6px 4px; border: 1px solid #ea580c;">
                      <div>${c.title || `Col ${c.colNumber}`}</div>
                      <div style="font-size: 9px; opacity: 0.9;">${c.multiplier}x</div>
                    </th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: 15 }, (_, rIdx) => {
              const rowNum = rIdx + 1;
              const isWinning = rowNum === item.rowLeader;
              return `
                <tr style="background: ${isWinning ? '#fef3c7' : rIdx % 2 === 0 ? '#fffaf5' : '#ffffff'}; ${
                isWinning ? 'font-weight: bold; border: 2px solid #d97706;' : ''
              }">
                  <td style="padding: 4px; border: 1px solid #fed7aa; font-weight: 900; color: ${
                    isWinning ? '#b45309' : '#9a3412'
                  };">
                    #${rowNum} ${isWinning ? '★' : ''}
                  </td>
                  ${cols
                    .map((c) => {
                      const cell = c.cells?.find((cellItem) => cellItem.rowNumber === rowNum);
                      const pName = cell?.playerName || '';
                      return `<td style="padding: 4px; border: 1px solid #fed7aa; color: ${
                        pName ? '#1e293b' : '#94a3b8'
                      }; font-size: 9.5px;">
                        ${escapeReportHtml(pName || '-')}
                      </td>`;
                    })
                    .join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (isBingo90 && item.sheet90Snapshot) {
    const s90 = item.sheet90Snapshot;
    const allTables =
      s90.tables && s90.tables.length > 0 ? s90.tables : [s90.table1, s90.table2].filter(Boolean);

    sheetHtml = `
      <div style="margin-top: 16px; margin-bottom: 16px; background: #ffffff; border: 1.5px solid #fed7aa; border-radius: 10px; padding: 12px;">
        <div style="font-size: 12px; font-weight: 900; color: #9a3412; margin-bottom: 8px; text-transform: uppercase;">
          COPIA DE PLANILLAS DE BINGO 90 (TRIPLETAS)
        </div>
        <div style="display: grid; grid-template-columns: repeat(${allTables.length}, 1fr); gap: 10px;">
          ${allTables
            .map((table, tIdx) => {
              const tblNum = table.tableNumber || tIdx + 1;
              const isWinTbl = tblNum === item.tableNumber;
              return `
                <div style="border: 1px solid #fed7aa; border-radius: 8px; padding: 8px; background: ${
                  isWinTbl ? '#fffbeb' : '#ffffff'
                };">
                  <div style="font-weight: 900; font-size: 11px; color: #9a3412; margin-bottom: 6px;">
                    Planilla #${tblNum} ${isWinTbl ? '★ MESA GANADORA' : ''}
                  </div>
                  <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
                    <thead>
                      <tr style="background: #ea580c; color: #ffffff;">
                        <th style="padding: 3px; border: 1px solid #fed7aa;">Fila</th>
                        <th style="padding: 3px; border: 1px solid #fed7aa;">Números</th>
                        <th style="padding: 3px; border: 1px solid #fed7aa;">Jugador</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(table.rows || [])
                        .slice(0, 15)
                        .map((r) => {
                          const isWinRow = isWinTbl && r.rowNumber === item.rowLeader;
                          return `
                            <tr style="background: ${isWinRow ? '#fde68a' : '#ffffff'}; font-weight: ${
                            isWinRow ? 'bold' : 'normal'
                          };">
                              <td style="padding: 3px; border: 1px solid #fed7aa; text-align: center;">#${
                                r.rowNumber
                              }</td>
                              <td style="padding: 3px; border: 1px solid #fed7aa; text-align: center; font-family: monospace;">[${r.numbers.join(
                                ', '
                              )}]</td>
                              <td style="padding: 3px; border: 1px solid #fed7aa;">${escapeReportHtml(r.playerName || '-')}</td>
                            </tr>
                          `;
                        })
                        .join('')}
                    </tbody>
                  </table>
                  ${
                    table.rows && table.rows.length > 15
                      ? `<div style="text-align: center; font-size: 8px; color: #9a3412; margin-top: 4px;">+ ${
                          table.rows.length - 15
                        } filas más archivadas</div>`
                      : ''
                  }
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  return `
    <div style="border: 2px solid #ea580c; border-radius: 12px; padding: 20px; background: #fffaf5; font-family: system-ui, -apple-system, sans-serif; color: #1e293b;">
      {/* Top Header */}
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ea580c; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <div style="display: inline-block; font-size: 10px; font-weight: 900; background: #ea580c; color: #ffffff; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 4px;">
            SISTEMA OFICIAL DE BINGO • COMPROBANTE DE PARTIDA
          </div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 900; color: #9a3412;">PARTIDA #${item.round}</h1>
          <p style="margin: 4px 0 0; font-size: 13px; color: #431407;">
            Operadora: <strong>${escapeReportHtml(item.operatorName || 'Operadora')}</strong> | Modo: <strong>${
    item.mode === '90' ? 'Bingo 90 Triples' : 'Bingo 75 Multiplicadores'
  }</strong>
          </p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; font-size: 13px; font-weight: bold; color: #431407;">${item.dateFormatted || item.dailyDate || ''} - ${formatTime12h(item.timestamp)}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #7c2d12;">Duración: <strong>${item.durationFormatted || 'N/A'}</strong></p>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px;">
        <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px; text-align: center;">
          <div style="font-size: 10px; color: #7c2d12; font-weight: bold; text-transform: uppercase;">FILA GANADORA</div>
          <div style="font-size: 20px; font-weight: 900; color: #9a3412;">#${item.rowLeader || '-'}</div>
        </div>
        <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px; text-align: center;">
          <div style="font-size: 10px; color: #7c2d12; font-weight: bold; text-transform: uppercase;">BALOTA BINGO</div>
          <div style="font-size: 20px; font-weight: 900; color: #ea580c;">${item.letter ? `${item.letter}-` : ''}${item.ballNumber || '-'}</div>
        </div>
        <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px; text-align: center;">
          <div style="font-size: 10px; color: #7c2d12; font-weight: bold; text-transform: uppercase;">TERNA</div>
          <div style="font-size: 20px; font-weight: 900; color: #7e22ce;">${
            item.ternaLeader ? `Fila #${item.ternaLeader}` : (item.ternaBall ? `#${item.ternaBall}` : '-')
          }</div>
        </div>
        <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px; text-align: center;">
          <div style="font-size: 10px; color: #7c2d12; font-weight: bold; text-transform: uppercase;">BOLAS JUGADAS</div>
          <div style="font-size: 20px; font-weight: 900; color: #1e293b;">${totalBallsCount}</div>
        </div>
        <div style="background: #faf5ff; border: 1.5px solid #d8b4fe; border-radius: 8px; padding: 8px; text-align: center;">
          <div style="font-size: 10px; color: #6b21a8; font-weight: 900; text-transform: uppercase;">LÍNEAS JUGADAS</div>
          <div style="font-size: 20px; font-weight: 900; color: #581c87;">${linesCount}</div>
        </div>
      </div>

      {/* Financial Bar */}
      <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; align-items: center;">
          <span>Ganador: <strong style="color: #9a3412;">${escapeReportHtml(item.winningPlayerName || 'Sin asignar')}</strong></span>
          <span>Recaudado: <span style="color: #047857;">$${Number(item.totalCollected || 0).toFixed(2)}</span></span>
          <span>Premios: <span style="color: #b91c1c;">$${Number(item.totalPrizesPaid || 0).toFixed(2)}</span></span>
          <span>Ganancia Neta: <span style="color: #0284c7;">$${Number(item.netProfit || 0).toFixed(2)}</span></span>
        </div>
      </div>

      {/* Sheet Table Snapshot */}
      ${sheetHtml}

      {/* Drawn Balls Played */}
      <div style="font-size: 11px; color: #9a3412; font-weight: 900; margin-bottom: 6px; text-transform: uppercase;">
        BOLAS CANTADAS EN ORDEN CRONOLÓGICO (${(item.drawnBallsPlayed || []).length}):
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;">
        ${(item.drawnBallsPlayed || [])
          .map(
            (n) =>
              `<span style="display: inline-block; padding: 2px 6px; background: #ea580c; color: #ffffff; border-radius: 4px; font-size: 10px; font-weight: bold;">${n}</span>`
          )
          .join('')}
      </div>

      <div style="text-align: center; border-top: 1px solid #fed7aa; padding-top: 8px; font-size: 9px; color: #7c2d12;">
        Documento y captura oficial generada por el Sistema de Bingo • Control de Operadora: ${escapeReportHtml(item.operatorName || 'Operadora')}
      </div>
    </div>
  `;
}

/**
 * Build a clean stand-alone printable document node for a game and export it
 */
export async function downloadGameDirectJpg(item: GameSequenceItem): Promise<void> {
  const container =
    document.getElementById(`saved-game-sheet-container-${item.id}`) ||
    document.getElementById('gallery-sheet-export-target');

  if (container) {
    await exportElementAsJpg(
      container,
      `Partida_${item.round}_${escapeReportHtml(item.operatorName || 'Operadora')}_${item.dailyDate || 'fecha'}.jpg`
    );
    return;
  }

  // Fallback: create temporary render container with complete document markup
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'fixed';
  tempDiv.style.left = '-9999px';
  tempDiv.style.top = '0';
  tempDiv.style.width = '1050px';
  tempDiv.style.backgroundColor = '#ffffff';
  tempDiv.style.padding = '24px';
  tempDiv.style.fontFamily = 'system-ui, sans-serif';

  tempDiv.innerHTML = buildGameDocumentHtml(item);

  document.body.appendChild(tempDiv);
  try {
    await exportElementAsJpg(
      tempDiv,
      `Partida_${item.round}_${escapeReportHtml(item.operatorName || 'Operadora')}_${item.dailyDate || 'fecha'}.jpg`
    );
  } finally {
    document.body.removeChild(tempDiv);
  }
}

/**
 * Direct PDF download for a game
 */
export async function downloadGameDirectPdf(item: GameSequenceItem): Promise<void> {
  const container =
    document.getElementById(`saved-game-sheet-container-${item.id}`) ||
    document.getElementById('gallery-sheet-export-target');

  if (container) {
    await exportElementAsPdf(
      container,
      `Partida_${item.round}_${escapeReportHtml(item.operatorName || 'Operadora')}_${item.dailyDate || 'fecha'}.pdf`,
      {
        round: item.round,
        operator: item.operatorName || 'Operadora',
        date: item.dateFormatted || item.dailyDate,
      }
    );
    return;
  }

  // Fallback: create temporary render container with complete document markup
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'fixed';
  tempDiv.style.left = '-9999px';
  tempDiv.style.top = '0';
  tempDiv.style.width = '1050px';
  tempDiv.style.backgroundColor = '#ffffff';
  tempDiv.style.padding = '24px';
  tempDiv.style.fontFamily = 'system-ui, sans-serif';

  tempDiv.innerHTML = buildGameDocumentHtml(item);

  document.body.appendChild(tempDiv);
  try {
    await exportElementAsPdf(
      tempDiv,
      `Partida_${item.round}_${escapeReportHtml(item.operatorName || 'Operadora')}_${item.dailyDate || 'fecha'}.pdf`,
      {
        round: item.round,
        operator: item.operatorName || 'Operadora',
        date: item.dateFormatted || item.dailyDate,
      }
    );
  } finally {
    document.body.removeChild(tempDiv);
  }
}
