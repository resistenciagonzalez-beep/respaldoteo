import html2canvas from 'html2canvas';
import { BingoMode } from '../types';
import { getBingo75Letter } from './ballColors';

export interface BolilleroSnapshotOptions {
  drawnBalls?: number[];
  winningBall?: number | null;
  mode?: BingoMode;
  winningRow?: number | null;
  ternaRow?: number | null;
  amboRow?: number | null;
  roundNumber?: number;
}

/**
 * Capture or generate a complete, high-fidelity visual snapshot of the bolillero
 * and master board showing each row and ball exactly as it stood at the moment Bingo was achieved.
 */
export async function captureBolilleroSnapshot(
  options?: BolilleroSnapshotOptions
): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;

  const drawnNumbers = options?.drawnBalls || [];
  const winningBall = options?.winningBall ?? (drawnNumbers.length > 0 ? drawnNumbers[drawnNumbers.length - 1] : null);
  const mode: BingoMode = options?.mode || (winningBall && winningBall > 75 ? '90' : '75');
  const winningRow = options?.winningRow ?? (winningBall ? ((winningBall - 1) % 15) + 1 : null);
  const ternaRow = options?.ternaRow ?? null;
  const roundNumber = options?.roundNumber ?? 1;

  // 1. If the live arcade board is mounted and visible in the DOM, try capturing it via html2canvas
  try {
    const arcadeContainer = document.getElementById('bingo-format-container');
    if (arcadeContainer && arcadeContainer.clientWidth > 300 && arcadeContainer.clientHeight > 300) {
      const canvas = await html2canvas(arcadeContainer, {
        scale: 1,
        useCORS: true,
        logging: false,
        backgroundColor: '#fffaf5',
        windowWidth: arcadeContainer.scrollWidth || 1200,
        windowHeight: arcadeContainer.scrollHeight || 750,
      });
      return canvas.toDataURL('image/jpeg', 0.85);
    }

    const cageWrapper = document.getElementById('bingo-cage-wrapper');
    if (cageWrapper && cageWrapper.clientWidth > 300) {
      const canvas = await html2canvas(cageWrapper, {
        scale: 1,
        useCORS: true,
        logging: false,
        backgroundColor: '#0f172a',
      });
      return canvas.toDataURL('image/jpeg', 0.85);
    }
  } catch (err) {
    console.warn('html2canvas DOM capture skipped, generating exact canvas board:', err);
  }

  // 2. High-fidelity canvas generator: Draws the entire bolillero master board showing every row and called/uncalled ball
  return generateCompleteBolilleroBoardCanvas({
    drawnBalls: drawnNumbers,
    winningBall,
    mode,
    winningRow,
    ternaRow,
    roundNumber,
  });
}

/**
 * Renders an exact, high-resolution replica of the arcade Bolillero and Master Board
 * showing every column (B-I-N-G-O) and each of the 15 rows with all balls called.
 */
function generateCompleteBolilleroBoardCanvas(opts: {
  drawnBalls: number[];
  winningBall: number | null;
  mode: BingoMode;
  winningRow: number | null;
  ternaRow: number | null;
  roundNumber: number;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const drawnSet = new Set<number>(opts.drawnBalls);
  const winningNum = opts.winningBall;
  const is90 = opts.mode === '90';

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 1200, 720);
  bgGrad.addColorStop(0, '#fffbeb');
  bgGrad.addColorStop(1, '#fed7aa');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 720);

  // Outer Border
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 1194, 714);

  // Top Bar Banner
  const topGrad = ctx.createLinearGradient(0, 6, 1200, 66);
  topGrad.addColorStop(0, '#ea580c');
  topGrad.addColorStop(1, '#c2410c');
  ctx.fillStyle = topGrad;
  ctx.fillRect(6, 6, 1188, 60);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`★ BOLILLERO OFICIAL - PARTIDA #${opts.roundNumber}`, 24, 36);

  ctx.textAlign = 'right';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = '#fef08a';
  ctx.fillText(
    `${is90 ? 'BINGO 90 BOLAS' : 'BINGO 75 BOLAS'} • ${opts.drawnBalls.length} BOLAS EXTRAÍDAS • BINGO EN BOLA #${winningNum ?? '-'}`,
    1170,
    36
  );

  // Left Section: Giant Winning Ball and Tumbler Info (x: 20 to 320)
  const leftX = 24;
  const leftY = 82;
  const leftW = 290;
  const leftH = 614;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#fdba74';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(leftX, leftY, leftW, leftH, 16);
  ctx.fill();
  ctx.stroke();

  // Winning Ball Header
  ctx.fillStyle = '#9a3412';
  ctx.font = '900 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BOLA GANADORA', leftX + leftW / 2, leftY + 30);

  // Big Glowing Sphere
  const sphereX = leftX + leftW / 2;
  const sphereY = leftY + 160;
  const sphereR = 95;

  const sphereGrad = ctx.createRadialGradient(
    sphereX - 30,
    sphereY - 35,
    15,
    sphereX,
    sphereY,
    sphereR
  );
  sphereGrad.addColorStop(0, '#fef08a');
  sphereGrad.addColorStop(0.3, '#f59e0b');
  sphereGrad.addColorStop(0.85, '#d97706');
  sphereGrad.addColorStop(1, '#92400e');

  ctx.beginPath();
  ctx.arc(sphereX, sphereY, sphereR, 0, Math.PI * 2);
  ctx.fillStyle = sphereGrad;
  ctx.shadowColor = 'rgba(217, 119, 6, 0.45)';
  ctx.shadowBlur = 25;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Letter & Number inside sphere
  if (winningNum) {
    const letter = !is90 ? getBingo75Letter(winningNum) : '';
    if (letter) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 24px system-ui, sans-serif';
      ctx.fillText(letter, sphereX, sphereY - 32);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.fillText(`${winningNum}`, sphereX, sphereY + (letter ? 16 : 4));
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px system-ui, sans-serif';
    ctx.fillText('¡BINGO!', sphereX, sphereY);
  }

  // Row Leader & Terna Info Card
  const infoY = leftY + 285;
  ctx.fillStyle = '#fff7ed';
  ctx.strokeStyle = '#fed7aa';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(leftX + 16, infoY, leftW - 32, 180, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#c2410c';
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ESTADO AL MOMENTO DE BINGO', leftX + leftW / 2, infoY + 24);

  ctx.fillStyle = '#431407';
  ctx.font = 'bold 13px system-ui, sans-serif';
  if (opts.winningRow) {
    ctx.fillText(`Fila Ganadora: Fila #${opts.winningRow}`, leftX + leftW / 2, infoY + 60);
  }
  if (opts.ternaRow) {
    ctx.fillStyle = '#047857';
    ctx.fillText(`Fila con Terna: Fila #${opts.ternaRow}`, leftX + leftW / 2, infoY + 90);
  }
  ctx.fillStyle = '#431407';
  ctx.fillText(`Total Bolas Jugadas: ${opts.drawnBalls.length}`, leftX + leftW / 2, infoY + 120);
  ctx.fillText(`Bolillero detenido al cantar Bingo`, leftX + leftW / 2, infoY + 145);

  // Status Badge
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.roundRect(leftX + 24, leftY + leftH - 70, leftW - 48, 44, 12);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 15px system-ui, sans-serif';
  ctx.fillText('✓ PARTIDA FINALIZADA', leftX + leftW / 2, leftY + leftH - 46);

  // Right Section: The Complete 75/90 Master Board showing every row
  const boardX = 332;
  const boardY = 82;
  const boardW = 844;
  const boardH = 614;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#fdba74';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(boardX, boardY, boardW, boardH, 16);
  ctx.fill();
  ctx.stroke();

  if (!is90) {
    // 75-Ball Mode: Columns B, I, N, G, O (1-15, 16-30, 31-45, 46-60, 61-75)
    const cols = [
      { letter: 'B', color: '#ef4444', range: [1, 15] },
      { letter: 'I', color: '#eab308', range: [16, 30] },
      { letter: 'N', color: '#3b82f6', range: [31, 45] },
      { letter: 'G', color: '#22c55e', range: [46, 60] },
      { letter: 'O', color: '#a855f7', range: [61, 75] },
    ];

    const colW = (boardW - 32) / 5;
    const headerH = 36;
    const rowH = (boardH - 24 - headerH) / 15;

    // Headers
    cols.forEach((col, idx) => {
      const cx = boardX + 16 + idx * colW;
      const cy = boardY + 12;

      ctx.fillStyle = col.color;
      ctx.beginPath();
      ctx.roundRect(cx + 2, cy, colW - 4, headerH, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(col.letter, cx + colW / 2, cy + headerH / 2);

      // 15 Rows
      for (let r = 0; r < 15; r++) {
        const num = col.range[0] + r;
        const ry = cy + headerH + 6 + r * rowH;
        const isDrawn = drawnSet.has(num);
        const isWin = num === winningNum;
        const rowNum = r + 1;
        const isWinRow = opts.winningRow === rowNum;
        const isTernaRow = opts.ternaRow === rowNum;

        // Cell background
        if (isWin) {
          ctx.fillStyle = '#f59e0b';
        } else if (isWinRow) {
          ctx.fillStyle = isDrawn ? '#fed7aa' : '#ffedd5';
        } else if (isTernaRow) {
          ctx.fillStyle = isDrawn ? '#bbf7d0' : '#f0fdf4';
        } else if (isDrawn) {
          ctx.fillStyle = '#fde68a';
        } else {
          ctx.fillStyle = '#f8fafc';
        }

        ctx.beginPath();
        ctx.roundRect(cx + 3, ry + 1, colW - 6, rowH - 2, 6);
        ctx.fill();

        // Cell border
        ctx.lineWidth = isWin ? 3 : 1;
        ctx.strokeStyle = isWin ? '#b45309' : isDrawn ? '#f59e0b' : '#e2e8f0';
        ctx.stroke();

        // Cell text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (isWin) {
          ctx.fillStyle = '#78350f';
          ctx.font = '900 14px system-ui, sans-serif';
          ctx.fillText(`★ ${num}`, cx + colW / 2, ry + rowH / 2);
        } else if (isDrawn) {
          ctx.fillStyle = '#78350f';
          ctx.font = '900 13px system-ui, sans-serif';
          ctx.fillText(`${num}`, cx + colW / 2, ry + rowH / 2);
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.fillText(`${num}`, cx + colW / 2, ry + rowH / 2);
        }
      }
    });
  } else {
    // 90-Ball Mode: 9 Columns x 10 Rows
    const colCount = 9;
    const colW = (boardW - 32) / colCount;
    const headerH = 32;
    const rowH = (boardH - 24 - headerH) / 10;

    for (let c = 0; c < colCount; c++) {
      const min = c === 0 ? 1 : c * 10;
      const max = c === 8 ? 90 : c * 10 + 9;
      const cx = boardX + 16 + c * colW;
      const cy = boardY + 12;

      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.roundRect(cx + 2, cy, colW - 4, headerH, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${min}-${max}`, cx + colW / 2, cy + headerH / 2);

      const count = max - min + 1;
      for (let r = 0; r < count; r++) {
        const num = min + r;
        const ry = cy + headerH + 6 + r * rowH;
        const isDrawn = drawnSet.has(num);
        const isWin = num === winningNum;

        ctx.fillStyle = isWin ? '#f59e0b' : isDrawn ? '#fde68a' : '#f8fafc';
        ctx.beginPath();
        ctx.roundRect(cx + 2, ry + 1, colW - 4, rowH - 2, 5);
        ctx.fill();

        ctx.lineWidth = isWin ? 2.5 : 1;
        ctx.strokeStyle = isWin ? '#b45309' : isDrawn ? '#f59e0b' : '#e2e8f0';
        ctx.stroke();

        ctx.fillStyle = isWin || isDrawn ? '#78350f' : '#94a3b8';
        ctx.font = isWin ? '900 13px system-ui, sans-serif' : 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${num}`, cx + colW / 2, ry + rowH / 2);
      }
    }
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}
