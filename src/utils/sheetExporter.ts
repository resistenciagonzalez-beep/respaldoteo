import { GameSequenceItem, BingoSheetData, Traditional90SheetData } from '../types';

/**
 * Generate formatted HTML report of a single Bingo Game Sheet (Planilla)
 */
export function generateGameSheetHtml(game: GameSequenceItem): string {
  const is90 = game.mode === '90' || game.sheetType === 'traditional-90';
  const drawnBalls = game.drawnBallsPlayed || [];
  const drawnSet = new Set(drawnBalls);

  let sheetContentHtml = '';

  if (is90 && game.sheet90Snapshot) {
    const s90 = game.sheet90Snapshot;
    const allTables =
      s90.tables && s90.tables.length > 0
        ? s90.tables
        : [s90.table1, s90.table2].filter(Boolean);

    sheetContentHtml = `
      <div class="tables-container">
        ${allTables
          .map((tbl, tIdx) => {
            const tableNum = tbl.tableNumber || tIdx + 1;
            const price = tbl.pricePerRow || s90.pricePerRow || 1.0;
            const prize = tbl.prize || 25.0;

            return `
              <div class="table-block">
                <div class="table-header">
                  <h3>MESA #${tableNum}</h3>
                  <span>Precio por fila: $${price.toFixed(2)} | Premio: $${prize.toFixed(2)}</span>
                </div>
                <table class="grid-table">
                  <thead>
                    <tr>
                      <th style="width: 45px;">Fila</th>
                      <th>Bolas (Tripleta)</th>
                      <th>Jugador / Asignado</th>
                      <th style="width: 70px;">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(tbl.rows || [])
                      .map((row, rIdx) => {
                        const rowNum = row.rowNumber || rIdx + 1;
                        const b1 = rowNum;
                        const b2 = rowNum + 30;
                        const b3 = rowNum + 60;

                        const isWinRow = game.rowLeader === rowNum || (game.tableNumber === tableNum && game.ballNumber === b1);
                        const isB1Marked = drawnSet.has(b1);
                        const isB2Marked = drawnSet.has(b2);
                        const isB3Marked = drawnSet.has(b3);

                        return `
                          <tr class="${isWinRow ? 'winner-row' : ''}">
                            <td class="bold center">#${rowNum}</td>
                            <td>
                              <span class="ball ${isB1Marked ? 'hit' : ''}">${b1}</span>
                              <span class="ball ${isB2Marked ? 'hit' : ''}">${b2}</span>
                              <span class="ball ${isB3Marked ? 'hit' : ''}">${b3}</span>
                            </td>
                            <td class="bold">${row.playerName || '<span class="empty">- Vacío -</span>'}</td>
                            <td class="center text-sm">${row.paid ? '<span class="paid">Pagado</span>' : 'Pendiente'}</td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } else if (game.sheet75Snapshot) {
    const s75 = game.sheet75Snapshot;
    const cols = s75.columns || [];

    sheetContentHtml = `
      <div class="sheet75-container">
        <table class="grid-table sheet75-table">
          <thead>
            <tr>
              <th style="width: 45px;">Fila</th>
              ${cols
                .map(
                  (col) => `
                    <th>
                      <div class="col-title">${col.title || `X${col.multiplier}`}</div>
                      <div class="col-sub">$${(col.columnPrice || 0.1).toFixed(2)}</div>
                    </th>
                  `
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: s75.totalRows || 15 }, (_, rIdx) => {
              const rowNum = rIdx + 1;
              const isWinRow = game.rowLeader === rowNum;

              return `
                <tr class="${isWinRow ? 'winner-row' : ''}">
                  <td class="bold center row-num">#${rowNum}</td>
                  ${cols
                    .map((col) => {
                      const cell = (col.cells || []).find((c) => c.rowNumber === rowNum);
                      const playerName = cell?.playerName || '';
                      return `
                        <td class="${playerName ? 'cell-filled' : 'cell-empty'}">
                          ${playerName ? `<span class="player-name">${playerName}</span>` : '<span class="empty">-</span>'}
                        </td>
                      `;
                    })
                    .join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    sheetContentHtml = `
      <div class="no-sheet-data">
        <p>No se incluyó una captura detallada de celdas para esta partida, pero los datos generales y la secuencia de bolas cantadas se encuentran preservados.</p>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Planilla de Bingo • Partida #${game.round} (${game.dailyDate || game.dateFormatted || 'Hoy'})</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      padding: 24px;
      line-height: 1.5;
    }
    .sheet-card {
      max-width: 1050px;
      margin: 0 auto;
      background: #ffffff;
      border: 2px solid #ea580c;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.08);
    }
    .header {
      border-bottom: 2px solid #fed7aa;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      color: #9a3412;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .game-badge {
      display: inline-block;
      background: #ea580c;
      color: #ffffff;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 13px;
      margin-top: 4px;
    }
    .meta-box {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 12px;
      padding: 12px 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
      font-size: 13px;
    }
    .meta-item strong {
      display: block;
      color: #9a3412;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .grid-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 20px;
    }
    .grid-table th {
      background: #ea580c;
      color: #ffffff;
      font-weight: 800;
      padding: 8px 10px;
      text-align: left;
      border: 1px solid #c2410c;
    }
    .grid-table td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
    }
    .grid-table tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .winner-row {
      background-color: #fef08a !important;
      font-weight: 800;
    }
    .winner-row td {
      border-color: #facc15;
    }
    .ball {
      display: inline-block;
      width: 26px;
      height: 26px;
      line-height: 26px;
      text-align: center;
      border-radius: 50%;
      background: #e2e8f0;
      color: #475569;
      font-weight: 800;
      margin-right: 4px;
      font-size: 11px;
    }
    .ball.hit {
      background: #ea580c;
      color: #ffffff;
      box-shadow: 0 2px 4px rgba(234, 88, 12, 0.3);
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .empty { color: #94a3b8; font-style: italic; }
    .paid { color: #16a34a; font-weight: 700; }
    .balls-section {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      margin-top: 20px;
    }
    .balls-title {
      font-size: 13px;
      font-weight: 800;
      color: #334155;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .balls-flow {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .balls-flow .mini-ball {
      padding: 3px 8px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #1e293b;
    }
    .balls-flow .mini-ball.win {
      background: #facc15;
      border-color: #eab308;
      color: #713f12;
      font-weight: 900;
    }
    .btn-print {
      display: inline-block;
      background: #0284c7;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      text-decoration: none;
      font-size: 13px;
      cursor: pointer;
      border: none;
    }
    @media print {
      body { padding: 0; background: #fff; }
      .sheet-card { border: none; box-shadow: none; padding: 0; }
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="sheet-card">
    <div class="header">
      <div>
        <div class="brand-title">Copia de Planilla Oficial • Bolillero Virtual</div>
        <div class="game-badge">Partida #${game.round} • ${is90 ? 'Bingo 90 Bolas (Triples)' : 'Bingo 75 Bolas (Multiplicadores)'}</div>
      </div>
      <div>
        <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
      </div>
    </div>

    <div class="meta-box">
      <div class="meta-item">
        <strong>Operadora / Host</strong>
        <span>${game.operatorName || 'Principal'}</span>
      </div>
      <div class="meta-item">
        <strong>Fecha y Hora</strong>
        <span>${game.dailyDate || game.dateFormatted || 'Hoy'} • ${game.timestamp || ''}</span>
      </div>
      <div class="meta-item">
        <strong>Bola Ganadora</strong>
        <span style="font-weight: 800; color: #ea580c;">${game.letter ? `${game.letter}-` : ''}${game.ballNumber}</span>
      </div>
      <div class="meta-item">
        <strong>Ganador(a)</strong>
        <span>${game.winningPlayerName || 'Sin asignar'}${game.tableNumber ? ` (Mesa #${game.tableNumber})` : ''}</span>
      </div>
      <div class="meta-item">
        <strong>Total Recaudado</strong>
        <span>$${(game.totalCollected || 0).toFixed(2)}</span>
      </div>
      <div class="meta-item">
        <strong>Premios Pagados</strong>
        <span>$${(game.totalPrizesPaid || 0).toFixed(2)}</span>
      </div>
      <div class="meta-item">
        <strong>Ganancia Neta</strong>
        <span style="font-weight: 800; color: #16a34a;">$${(game.netProfit || 0).toFixed(2)}</span>
      </div>
      <div class="meta-item">
        <strong>Duración del Juego</strong>
        <span>${game.durationFormatted || `${game.durationSeconds || 0}s`}</span>
      </div>
    </div>

    <!-- Sheet Grid Content -->
    ${sheetContentHtml}

    <!-- Drawn Balls Sequence -->
    <div class="balls-section">
      <div class="balls-title">Secuencia de ${drawnBalls.length} Bolas Cantadas en Orden</div>
      <div class="balls-flow">
        ${drawnBalls
          .map((b, idx) => {
            const isWin = b === game.ballNumber;
            return `<span class="mini-ball ${isWin ? 'win' : ''}">#${idx + 1}: ${b}${isWin ? ' 🏆' : ''}</span>`;
          })
          .join('')}
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Trigger download of a single game sheet as a standalone HTML file
 */
export function downloadGameSheetAsHtml(game: GameSequenceItem): void {
  const htmlContent = generateGameSheetHtml(game);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `planilla_partida_${game.round}_${game.dailyDate || 'fecha'}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Trigger download of a single game sheet as a complete JSON snapshot
 */
export function downloadGameSheetAsJson(game: GameSequenceItem): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    gameId: game.id,
    round: game.round,
    mode: game.mode,
    sheetType: game.sheetType,
    operator: {
      uid: game.operatorUid,
      name: game.operatorName,
      email: game.operatorEmail,
    },
    dateTime: {
      dailyDate: game.dailyDate,
      dateFormatted: game.dateFormatted,
      timestamp: game.timestamp,
    },
    winningResult: {
      ballNumber: game.ballNumber,
      letter: game.letter,
      rowLeader: game.rowLeader,
      winningPlayerName: game.winningPlayerName,
      tableNumber: game.tableNumber,
    },
    financials: {
      totalCollected: game.totalCollected,
      totalPrizesPaid: game.totalPrizesPaid,
      netProfit: game.netProfit,
      currency: game.currency || '$',
    },
    drawnBallsSequence: game.drawnBallsPlayed || [],
    sheet75Snapshot: game.sheet75Snapshot || null,
    sheet90Snapshot: game.sheet90Snapshot || null,
  };

  const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const anchor = document.createElement('a');
  anchor.href = jsonStr;
  anchor.download = `planilla_completa_partida_${game.round}_${game.dailyDate || 'fecha'}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/**
 * Download a compilation of multiple sheets in one single HTML document
 */
export function downloadAllSheetsCompilationHtml(games: GameSequenceItem[], filterLabel: string = 'todas'): void {
  if (!games.length) return;

  const combinedSheets = games
    .map((g) => {
      const fullHtml = generateGameSheetHtml(g);
      // Extract inner content of .sheet-card
      const match = fullHtml.match(/<div class="sheet-card">([\s\S]*?)<\/body>/i);
      return match ? `<div class="sheet-card page-break" style="margin-bottom: 40px;">${match[1]}</div>` : '';
    })
    .join('\n<hr style="margin: 40px 0; border: 2px dashed #fed7aa;" />\n');

  const fullDoc = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Colección de Planillas de Bingo • ${filterLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      padding: 24px;
    }
    .sheet-card {
      max-width: 1050px;
      margin: 0 auto;
      background: #ffffff;
      border: 2px solid #ea580c;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.08);
    }
    .header {
      border-bottom: 2px solid #fed7aa;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      color: #9a3412;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .game-badge {
      display: inline-block;
      background: #ea580c;
      color: #ffffff;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 13px;
      margin-top: 4px;
    }
    .meta-box {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 12px;
      padding: 12px 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
      font-size: 13px;
    }
    .meta-item strong {
      display: block;
      color: #9a3412;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .grid-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 20px;
    }
    .grid-table th {
      background: #ea580c;
      color: #ffffff;
      font-weight: 800;
      padding: 8px 10px;
      text-align: left;
      border: 1px solid #c2410c;
    }
    .grid-table td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
    }
    .grid-table tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .winner-row {
      background-color: #fef08a !important;
      font-weight: 800;
    }
    .ball {
      display: inline-block;
      width: 26px;
      height: 26px;
      line-height: 26px;
      text-align: center;
      border-radius: 50%;
      background: #e2e8f0;
      color: #475569;
      font-weight: 800;
      margin-right: 4px;
      font-size: 11px;
    }
    .ball.hit {
      background: #ea580c;
      color: #ffffff;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .empty { color: #94a3b8; font-style: italic; }
    .paid { color: #16a34a; font-weight: 700; }
    .balls-section {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      margin-top: 20px;
    }
    .balls-title {
      font-size: 13px;
      font-weight: 800;
      color: #334155;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .balls-flow {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .balls-flow .mini-ball {
      padding: 3px 8px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #1e293b;
    }
    .balls-flow .mini-ball.win {
      background: #facc15;
      border-color: #eab308;
      color: #713f12;
      font-weight: 900;
    }
    @media print {
      .page-break { page-break-after: always; }
      body { padding: 0; background: #fff; }
      .sheet-card { border: none; box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div style="max-width: 1050px; margin: 0 auto 20px auto; display: flex; justify-content: space-between; align-items: center;">
    <h1 style="font-size: 20px; font-weight: 900; color: #9a3412;">Colección de Planillas (${games.length} partidas)</h1>
    <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer;">🖨️ Imprimir Todas</button>
  </div>
  ${combinedSheets}
</body>
</html>`;

  const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `coleccion_planillas_${filterLabel}_${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
