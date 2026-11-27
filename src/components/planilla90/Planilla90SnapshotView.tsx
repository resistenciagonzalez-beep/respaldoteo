/**
 * Vista de solo lectura de una partida guardada con la Planilla 90 nueva
 * (galería de partidas, panel admin y ventana de la partida).
 */
import React, { useMemo } from 'react';
import type { BingoSheetData, GameSequenceItem } from '../../types';
import {
  getActiveSeqEntry,
  getMultiplierLabel,
  getPlanilla90Lines,
  getPlanilla90Summaries,
  getPlanilla90WinningRows,
  normalizePlanilla90,
} from '../../utils/planilla90Rules';
import { Planilla90Grid } from './Planilla90Grid';
import { Planilla90SummaryBar } from './Planilla90SummaryBar';

interface Planilla90SnapshotViewProps {
  game: GameSequenceItem;
  snapshot: BingoSheetData;
}

function fmtMoney(v: number | undefined): string {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export const Planilla90SnapshotView: React.FC<Planilla90SnapshotViewProps> = ({ game, snapshot }) => {
  const sheet = useMemo(() => normalizePlanilla90(snapshot), [snapshot]);
  const drawn = useMemo(() => new Set(game.drawnBallsPlayed || game.markedNumbers || []), [game]);
  const rows = useMemo(() => {
    const r = getPlanilla90WinningRows(sheet, getActiveSeqEntry(sheet));
    if (r.bingoRow === null && sheet.bingoEnabled !== false && game.rowLeader && game.rowLeader >= 1 && game.rowLeader <= 30) {
      r.bingoRow = game.rowLeader;
    }
    return r;
  }, [sheet, game.rowLeader]);
  const summaries = useMemo(() => {
    const saved = sheet.playerSummaryList || game.playerSummarySnapshot;
    if (saved && saved.length > 0) return saved;
    return getPlanilla90Summaries(sheet, rows, { won: {}, debt: {}, offsets: {} });
  }, [sheet, rows, game.playerSummarySnapshot]);

  const counts = sheet.columns.reduce<Record<number, number>>((acc, c) => {
    const m = Number(c.multiplier) || 1;
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs font-black">
        <span className="px-2 py-1 rounded-lg bg-black text-yellow-300">
          {fmtMoney(sheet.baseCost)} X {fmtMoney(sheet.basePrize)}
        </span>
        <span className="px-2 py-1 rounded-lg bg-white border border-slate-300 uppercase text-black">{sheet.title}</span>
        <span className="px-2 py-1 rounded-lg bg-purple-900 text-white">{getPlanilla90Lines(sheet)} líneas</span>
        <span className="px-2 py-1 rounded-lg bg-orange-100 text-orange-950 border border-orange-300">Planilla 90 (formato nuevo)</span>
        <span className="text-slate-600">
          {Object.entries(counts)
            .map(([m, n]) => `${n} ${getMultiplierLabel(Number(m))}`)
            .join(' · ')}
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <div className="min-w-[560px]">
          <Planilla90Grid sheet={sheet} drawnNumbers={drawn} winningRows={rows} activeSeqSlot={sheet.activeSeqSlot} />
          <div style={{ height: 96 }} className="flex">
            <Planilla90SummaryBar summaries={summaries} compact />
          </div>
        </div>
      </div>
    </div>
  );
};
