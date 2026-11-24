/**
 * Panel de admin: pestaña de Métricas y Resumen.
 * Se separó de AdminPanelModal.tsx sin cambiar su contenido ni su funcionamiento.
 */
import React from 'react';
import {
  Hash,
  Table2,
  Trophy,
  CircleDot,
  Users,
  Calendar,
  Trash2,
} from 'lucide-react';
import type { AppUser, GameSequenceItem } from '../../types';

export interface AdminStatsTabProps {
  todayLinesTotal: number;
  todayGames: GameSequenceItem[];
  savedGamesList: GameSequenceItem[];
  usersList: AppUser[];
  dailyLinesSummary: Array<{ date: string; gamesCount: number; linesTotal: number; operators: Set<string>; collected: number; prizes: number }>;
  currentLocalDate: string;
  isAdmin: boolean;
  setDayFolderToDelete: React.Dispatch<React.SetStateAction<string | null>>;
}

export const AdminStatsTab: React.FC<AdminStatsTabProps> = ({
  todayLinesTotal,
  todayGames,
  savedGamesList,
  usersList,
  dailyLinesSummary,
  currentLocalDate,
  isAdmin,
  setDayFolderToDelete,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-4">
      {/* Top Row: System KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Stat 0: DAILY LINES EXCLUSIVE COUNTER */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-800 to-indigo-900 text-white border border-purple-400/50 shadow-md space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-black uppercase text-purple-200">
            <span>Líneas Jugadas Hoy</span>
            <Hash className="w-4 h-4 text-yellow-300" />
          </div>
          <div className="text-3xl font-black text-white font-mono">
            {todayLinesTotal.toLocaleString()}
          </div>
          <p className="text-[11px] text-purple-200 font-medium">
            {todayGames.length} {todayGames.length === 1 ? 'partida jugada hoy' : 'partidas jugadas hoy'}
          </p>
          <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/5 pointer-events-none" />
        </div>

        {/* Stat 1: Total Historic Lines */}
        <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
            <span>Total Líneas Históricas</span>
            <Table2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-orange-950 font-mono">
            {savedGamesList.reduce((acc, g) => acc + (g.totalLinesPlayed || 68), 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-orange-900/60">
            En {savedGamesList.length} partidas totales
          </p>
        </div>

        {/* Stat 2: Total Games */}
        <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
            <span>Partidas Guardadas</span>
            <Trophy className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-orange-950">{savedGamesList.length}</div>
          <p className="text-[11px] text-orange-900/60">
            {todayGames.length} archivadas hoy
          </p>
        </div>

        {/* Stat 3: Total Balls */}
        <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
            <span>Bolas Cantadas</span>
            <CircleDot className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-black text-orange-950">
            {savedGamesList.reduce((acc, g) => acc + (g.drawnBallsPlayed?.length || g.totalBallsDrawnCount || 0), 0)}
          </div>
          <p className="text-[11px] text-orange-900/60">En todas las partidas</p>
        </div>

        {/* Stat 4: Operators */}
        <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
            <span>Operadores</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-orange-950">
            {usersList.filter((u) => u.role === 'operator').length}
          </div>
          <p className="text-[11px] text-orange-900/60">
            {usersList.filter((u) => u.role === 'admin').length} Administradores
          </p>
        </div>
      </div>

      {/* Daily Lines Registry Table (EXCLUSIVE ADMIN HISTORICAL AUDIT) */}
      <div className="p-4 rounded-2xl bg-white border-2 border-purple-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <h4 className="text-sm font-black text-purple-950 flex items-center gap-2">
                <span>Registro Diario de Líneas Jugadas (Control de Admin)</span>
                <span className="text-[10px] bg-yellow-400 text-purple-950 font-black px-2 py-0.2 rounded-md uppercase">
                  Solo Admin
                </span>
              </h4>
              <p className="text-xs text-purple-900/70 font-medium">
                Conteo exacto día a día de cuántas líneas se usaron entre todas las partidas realizadas cada fecha
              </p>
            </div>
          </div>

          <div className="text-xs text-purple-950 font-bold bg-purple-50 px-3 py-1 rounded-xl border border-purple-200">
            Hoy: <strong className="text-purple-700 font-mono text-sm">{todayLinesTotal} líneas</strong> ({todayGames.length} partidas)
          </div>
        </div>

        {dailyLinesSummary.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-medium">
            No hay partidas registradas aún para calcular el historial diario de líneas.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-purple-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-purple-50/80 text-purple-950 font-black uppercase text-[10px] tracking-wider border-b border-purple-100">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Partidas del Día</th>
                  <th className="py-2.5 px-3 text-center">Total Líneas Jugadas</th>
                  <th className="py-2.5 px-3">Operadoras de Turno</th>
                  <th className="py-2.5 px-3 text-right">Recaudado</th>
                  <th className="py-2.5 px-3 text-right">Premios</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50">
                {dailyLinesSummary.map((item, idx) => {
                  const isToday = item.date === currentLocalDate;
                  return (
                    <tr
                      key={item.date || idx}
                      className={`hover:bg-purple-50/40 transition-colors font-medium ${
                        isToday ? 'bg-purple-50/60 font-semibold' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{item.date}</span>
                          {isToday && (
                            <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-black uppercase">
                              Hoy
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        <strong>{item.gamesCount}</strong> {item.gamesCount === 1 ? 'partida' : 'partidas'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-3 py-1 rounded-xl bg-purple-100 text-purple-950 font-black font-mono text-sm border border-purple-200">
                          {item.linesTotal.toLocaleString()} líneas
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {Array.from(item.operators).length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {Array.from(item.operators).map((op) => (
                              <span key={op} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[10px] font-bold">
                                🎮 {op}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Operadora Principal</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-mono font-bold">
                        ${item.collected.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-700 font-mono font-bold">
                        ${item.prizes.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDayFolderToDelete(item.date)}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 text-[10px] font-black transition-all cursor-pointer inline-flex items-center gap-1 active:scale-95"
                            title={`Eliminar todas las partidas de la fecha ${item.date}`}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Borrar fecha</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
