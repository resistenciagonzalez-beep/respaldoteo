/**
 * Panel lateral de la Planilla 90 (reemplaza al bolillero en esta pantalla):
 * jugadores, columnas, tarifas y secuencia (P.F / A / B).
 */
import React, { useState } from 'react';
import { Copy, Plus, Trash2, Users, Grid, DollarSign, Check } from 'lucide-react';
import type { BingoSheetData, BingoSheetPlayer } from '../../types';
import { VIBRANT_PLAYER_COLORS, getContrastTextColor } from '../../utils/playerColors';
import {
  PLANILLA90_MAX_COLUMNS,
  PLANILLA90_MAX_MULTIPLIER,
  getMultiplierLabel,
  type Planilla90PlayerSummary,
} from '../../utils/planilla90Rules';

type PanelTab = 'players' | 'columns' | 'rates';
export type Planilla90RateField = 'baseCost' | 'basePrize' | 'baseAmboPrize' | 'basePfPrize';
export type Planilla90ToggleField = 'pfEnabled' | 'amboEnabled' | 'bingoEnabled';

interface Planilla90PanelProps {
  sheet: BingoSheetData;
  players: BingoSheetPlayer[];
  summaries: Planilla90PlayerSummary[];
  activePlayerId: string | null;
  onSelectPlayer: (id: string | null) => void;
  onAddPlayer: (name: string, color?: string, textColor?: string) => void;
  onDeletePlayer: (id: string) => void;
  onSetPlayerColor: (id: string, color: string) => void;
  onSetPlayerTextColor: (id: string, textColor: string) => void;
  /** Flechita para ocultar el panel */
  onHide?: () => void;
  onMismos: (player: BingoSheetPlayer) => void;
  onMismosAll: () => void;
  onFillColumn: (columnIndex: number) => void;
  onAddColumn: (multiplier: number) => void;
  onRemoveColumn: (columnIndex: number) => void;
  onSetColumnMultiplier: (columnIndex: number, multiplier: number) => void;
  onToggleDivider: (columnIndex: number) => void;
  onSetRate: (field: Planilla90RateField, value: number) => void;
  onToggleSeq: (field: Planilla90ToggleField) => void;
  onSetTitle: (title: string) => void;
  onMarkPaid: (id: string) => void;
  onClearWon: (id: string) => void;
}

/** Colores para la letra de los nombres en las casillas. */
const TEXT_COLORS: { hex: string; name: string }[] = [
  { hex: '#000000', name: 'Negro' },
  { hex: '#ffffff', name: 'Blanco' },
  { hex: '#475569', name: 'Gris' },
  { hex: '#94a3b8', name: 'Gris claro' },
  { hex: '#7f1d1d', name: 'Rojo oscuro' },
  { hex: '#dc2626', name: 'Rojo' },
  { hex: '#f87171', name: 'Rojo claro' },
  { hex: '#be123c', name: 'Vino' },
  { hex: '#9a3412', name: 'Naranja oscuro' },
  { hex: '#ea580c', name: 'Naranja' },
  { hex: '#fb923c', name: 'Naranja claro' },
  { hex: '#78350f', name: 'Café' },
  { hex: '#a16207', name: 'Mostaza' },
  { hex: '#facc15', name: 'Amarillo' },
  { hex: '#fef08a', name: 'Amarillo claro' },
  { hex: '#d4af37', name: 'Dorado' },
  { hex: '#14532d', name: 'Verde oscuro' },
  { hex: '#16a34a', name: 'Verde' },
  { hex: '#4ade80', name: 'Verde claro' },
  { hex: '#65a30d', name: 'Lima' },
  { hex: '#134e4a', name: 'Turquesa oscuro' },
  { hex: '#0d9488', name: 'Turquesa' },
  { hex: '#0891b2', name: 'Celeste' },
  { hex: '#67e8f9', name: 'Celeste claro' },
  { hex: '#1e3a8a', name: 'Azul marino' },
  { hex: '#2563eb', name: 'Azul' },
  { hex: '#60a5fa', name: 'Azul claro' },
  { hex: '#4c1d95', name: 'Morado oscuro' },
  { hex: '#7c3aed', name: 'Morado' },
  { hex: '#c084fc', name: 'Lila' },
  { hex: '#db2777', name: 'Rosado' },
  { hex: '#f9a8d4', name: 'Rosado claro' },
];

const btn = 'inline-flex items-center justify-center gap-1 rounded-lg font-black text-[10px] px-1.5 py-0.5 border transition-all active:scale-95 cursor-pointer';

export const Planilla90Panel: React.FC<Planilla90PanelProps> = (props) => {
  const { sheet, players, summaries, activePlayerId } = props;
  const [tab, setTab] = useState<PanelTab>('players');
  const [newName, setNewName] = useState('');
  const [colorFor, setColorFor] = useState<string | null>(null);
  // Color elegido en la paleta para el próximo jugador nuevo (si no hay jugador seleccionado)
  const [newColor, setNewColor] = useState<string | null>(null);
  const [newTextColor, setNewTextColor] = useState<string | null>(null);
  const activePlayer = players.find((p) => p.id === activePlayerId) || null;

  const submitPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    props.onAddPlayer(name, newColor || undefined, newTextColor || undefined);
    setNewName('');
    setNewColor(null);
    setNewTextColor(null);
  };

  // Paleta siempre visible: pinta al jugador seleccionado, o guarda el color para el próximo jugador nuevo
  const pickColor = (hex: string) => {
    if (activePlayer) props.onSetPlayerColor(activePlayer.id, hex);
    else setNewColor(hex === newColor ? null : hex);
  };
  const currentPaletteColor = (activePlayer ? activePlayer.color : newColor || '').toLowerCase();

  // Paleta de color de letra: igual, para el jugador elegido o el próximo jugador nuevo
  const pickTextColor = (hex: string) => {
    if (activePlayer) props.onSetPlayerTextColor(activePlayer.id, hex);
    else setNewTextColor(hex === newTextColor ? null : hex);
  };
  const currentTextColor = (activePlayer ? activePlayer.textColor || '#000000' : newTextColor || '').toLowerCase();
  const previewBg = (activePlayer ? activePlayer.color : newColor) || '#ffffff';

  const tabBtn = (id: PanelTab, label: string, Icon: typeof Users) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex-1 flex items-center justify-center gap-0.5 py-1 rounded-lg text-[10px] font-black cursor-pointer ${
        tab === id ? 'bg-orange-500 text-white' : 'text-orange-950 hover:bg-orange-200/70'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );

  return (
    <aside className="no-print h-full min-h-0 flex flex-col bg-[#fffaf5] border-[3px] border-black rounded-none overflow-hidden">
      <div className="flex gap-1 p-1 bg-orange-100 border-b-2 border-black flex-shrink-0">
        {props.onHide && (
          <button
            type="button"
            onClick={props.onHide}
            className="flex-shrink-0 w-6 flex items-center justify-center rounded-lg bg-black text-yellow-300 font-black text-xs cursor-pointer hover:bg-zinc-800"
            title="Ocultar el panel"
          >
            ▶
          </button>
        )}
        {tabBtn('players', 'Jugadores', Users)}
        {tabBtn('columns', 'Columnas', Grid)}
        {tabBtn('rates', 'Tarifas', DollarSign)}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1.5">
        {tab === 'players' && (
          <>
            <div className="flex gap-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitPlayer();
                }}
                placeholder="Nombre del jugador"
                maxLength={30}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border-2 border-slate-300 text-sm font-bold uppercase focus:outline-none focus:border-orange-500"
              />
              <button type="button" onClick={submitPlayer} className={`${btn} bg-orange-500 text-white border-orange-600`} title="Agregar jugador">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-lg border-2 border-slate-200 bg-white p-1">
              <div className="flex items-center gap-1 mb-1">
                <span
                  className="w-4 h-4 rounded border-2 border-black flex-shrink-0"
                  style={{ backgroundColor: currentPaletteColor || '#ffffff' }}
                />
                <span className="text-[10px] font-black text-slate-700 leading-tight truncate">
                  {activePlayer ? `Color de ${activePlayer.name}` : newColor ? 'Color del próximo jugador' : 'Paleta de colores'}
                </span>
              </div>
              <div className="grid grid-cols-10 gap-0.5">
                {VIBRANT_PLAYER_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => pickColor(c.hex)}
                    className={`h-4 rounded-sm cursor-pointer ${
                      currentPaletteColor === c.hex.toLowerCase() ? 'ring-2 ring-black ring-offset-1' : 'border border-black/40'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border-2 border-slate-200 bg-white p-1">
              <div className="flex items-center gap-1 mb-1">
                <span
                  className="px-1 rounded border-2 border-black flex-shrink-0 text-[10px] font-black leading-tight"
                  style={{ backgroundColor: previewBg, color: currentTextColor || '#000000' }}
                >
                  Aa
                </span>
                <span className="text-[10px] font-black text-slate-700 leading-tight truncate">
                  {activePlayer ? `Letra de ${activePlayer.name}` : newTextColor ? 'Letra del próximo jugador' : 'Color de letra'}
                </span>
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => pickTextColor(c.hex)}
                    className={`h-4 rounded-sm cursor-pointer flex items-center justify-center text-[8px] font-black ${
                      currentTextColor === c.hex.toLowerCase() ? 'ring-2 ring-black ring-offset-1' : 'border border-black/40'
                    }`}
                    style={{ backgroundColor: c.hex, color: getContrastTextColor(c.hex) }}
                    title={c.name}
                  >
                    A
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={props.onMismosAll} className={`${btn} w-full bg-blue-600 text-white border-blue-700 py-1.5`} title="Copiar las casillas de la partida anterior a todos">
              <Copy className="w-3.5 h-3.5" /> Mismos a todos
            </button>
            <p className="text-[10px] font-bold text-slate-500 leading-tight">
              Elige un jugador y toca las casillas para asignarlas (otra vez para quitarla). La paleta cambia el color del jugador elegido.
            </p>
            <div className="space-y-1">
              {players.length === 0 && <p className="text-xs font-bold text-slate-400 text-center py-2">Sin jugadores todavía.</p>}
              {players.map((p) => {
                const s = summaries.find((x) => x.id === p.id);
                const active = activePlayerId === p.id;
                return (
                  <div key={p.id} className={`rounded-lg border-2 ${active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'} p-1`}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setColorFor(colorFor === p.id ? null : p.id)}
                        className="w-5 h-5 rounded border-2 border-black flex-shrink-0 cursor-pointer"
                        style={{ backgroundColor: p.color }}
                        title="Cambiar color"
                      />
                      <button
                        type="button"
                        onClick={() => props.onSelectPlayer(active ? null : p.id)}
                        className="flex-1 min-w-0 text-left text-sm font-black uppercase truncate cursor-pointer"
                        title="Seleccionar para asignar casillas"
                      >
                        {p.name}
                        {s ? <span className="ml-1 text-[10px] text-slate-500 font-bold normal-case">({s.cellsCount})</span> : null}
                      </button>
                      <button type="button" onClick={() => props.onMismos(p)} className={`${btn} bg-sky-100 text-sky-900 border-sky-300`} title="Mismas casillas de la partida anterior">
                        Mismos
                      </button>
                      <button type="button" onClick={() => props.onDeletePlayer(p.id)} className={`${btn} bg-red-50 text-red-700 border-red-200 px-1.5`} title="Quitar jugador">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {s && (
                      <div className="flex items-center gap-1 mt-1">
                        <button type="button" onClick={() => props.onMarkPaid(p.id)} disabled={s.debe <= 0} className={`${btn} flex-1 bg-emerald-50 text-emerald-800 border-emerald-300 disabled:opacity-40`}>
                          <Check className="w-3 h-3" /> Pagó (debe ${s.debe.toFixed(2)})
                        </button>
                        <button type="button" onClick={() => props.onClearWon(p.id)} disabled={s.totalGano <= 0} className={`${btn} flex-1 bg-amber-50 text-amber-900 border-amber-300 disabled:opacity-40`}>
                          Entregué ${s.totalGano.toFixed(2)}
                        </button>
                      </div>
                    )}
                    {colorFor === p.id && (
                      <div className="grid grid-cols-10 gap-0.5 mt-1">
                        {VIBRANT_PLAYER_COLORS.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => {
                              props.onSetPlayerColor(p.id, c.hex);
                              setColorFor(null);
                            }}
                            className="h-4 rounded-sm border border-black/40 cursor-pointer"
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'columns' && (
          <>
            <p className="text-[10px] font-bold text-slate-500 leading-tight">
              Toca el título de una columna en la planilla para cambiarla (SOLO → DOBLE → TRIPLE → CUARTA → QUINTA).
            </p>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: PLANILLA90_MAX_MULTIPLIER }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => props.onAddColumn(m)}
                  disabled={sheet.columns.length >= PLANILLA90_MAX_COLUMNS}
                  className={`${btn} flex-col bg-white text-black border-slate-300 hover:border-orange-500 disabled:opacity-40 px-0.5`}
                  title={`Agregar columna ${getMultiplierLabel(m)}`}
                >
                  <Plus className="w-3 h-3" />
                  <span className="text-[9px]">{getMultiplierLabel(m)}</span>
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {sheet.columns.map((col, idx) => (
                <div key={col.id} className="flex items-center gap-1 rounded-lg border-2 border-slate-200 bg-white p-1">
                  <span className="w-5 text-center text-xs font-black text-slate-500">{idx + 1}</span>
                  <select
                    value={col.multiplier || 1}
                    onChange={(e) => props.onSetColumnMultiplier(idx, Number(e.target.value))}
                    className="flex-1 min-w-0 px-1 py-1 rounded border border-slate-300 text-xs font-black"
                  >
                    {Array.from({ length: PLANILLA90_MAX_MULTIPLIER }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {getMultiplierLabel(m)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => props.onFillColumn(idx)} disabled={!activePlayerId} className={`${btn} bg-blue-50 text-blue-800 border-blue-200 disabled:opacity-40`} title="Llenar la columna con el jugador elegido">
                    Llenar
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onToggleDivider(idx)}
                    className={`${btn} px-1.5 ${col.hasRedDividerRight ? 'bg-red-600 text-white border-red-700' : 'bg-white text-black border-slate-300'}`}
                    title="Línea divisoria roja"
                  >
                    |
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRemoveColumn(idx)}
                    disabled={sheet.columns.length <= 1}
                    className={`${btn} bg-red-50 text-red-700 border-red-200 px-1.5 disabled:opacity-40`}
                    title="Quitar columna"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'rates' && (
          <>
            <label className="block">
              <span className="text-[10px] font-black uppercase text-slate-600">Título de la planilla</span>
              <input
                value={sheet.title}
                onChange={(e) => props.onSetTitle(e.target.value.slice(0, 80))}
                className="w-full px-2 py-1.5 rounded-lg border-2 border-slate-300 text-sm font-black uppercase focus:outline-none focus:border-orange-500"
              />
            </label>
            <RateInput label="Costo por línea (SOLO)" value={sheet.baseCost} onChange={(v) => props.onSetRate('baseCost', v)} />
            <div className="rounded-lg border-2 border-slate-200 bg-white p-2 space-y-1.5">
              <span className="text-[10px] font-black uppercase text-slate-600">Secuencia: columnas activas y premio por SOLO</span>
              <SeqToggle label="P.F (primera ficha)" on={Boolean(sheet.pfEnabled)} onToggle={() => props.onToggleSeq('pfEnabled')} value={sheet.basePfPrize ?? 0} onValue={(v) => props.onSetRate('basePfPrize', v)} />
              <SeqToggle label="A (ambo)" on={Boolean(sheet.amboEnabled)} onToggle={() => props.onToggleSeq('amboEnabled')} value={sheet.baseAmboPrize ?? 0} onValue={(v) => props.onSetRate('baseAmboPrize', v)} />
              <SeqToggle label="B (bingo)" on={sheet.bingoEnabled !== false} onToggle={() => props.onToggleSeq('bingoEnabled')} value={sheet.basePrize} onValue={(v) => props.onSetRate('basePrize', v)} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 leading-tight">
              Cada columna multiplica: DOBLE paga y cuesta el doble, TRIPLE el triple, y así.
            </p>
          </>
        )}
      </div>
    </aside>
  );
};

const RateInput: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-[10px] font-black uppercase text-slate-600">{label}</span>
    <input
      type="number"
      min={0}
      step="0.25"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="w-full px-2 py-1.5 rounded-lg border-2 border-slate-300 text-sm font-black focus:outline-none focus:border-orange-500"
    />
  </label>
);

const SeqToggle: React.FC<{ label: string; on: boolean; onToggle: () => void; value: number; onValue: (v: number) => void }> = ({
  label,
  on,
  onToggle,
  value,
  onValue,
}) => (
  <div className="flex items-center gap-1.5">
    <button
      type="button"
      onClick={onToggle}
      className={`w-10 h-5 rounded-full relative flex-shrink-0 transition-colors cursor-pointer ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
      title={on ? 'Desactivar' : 'Activar'}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
    <span className={`flex-1 text-xs font-black ${on ? 'text-black' : 'text-slate-400'}`}>{label}</span>
    <input
      type="number"
      min={0}
      step="0.25"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onValue(Math.max(0, Number(e.target.value) || 0))}
      disabled={!on}
      className="w-16 px-1 py-0.5 rounded border border-slate-300 text-xs font-black text-right disabled:opacity-40"
    />
  </div>
);
