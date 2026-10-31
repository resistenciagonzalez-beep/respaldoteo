import React, { useEffect, useState } from 'react';
import {
  subscribeToSyncStatus,
  getSyncStatusState,
  retryAllFailedAndPendingGamesNow,
  getDiagnosticSaveLogs,
  SyncStatusState,
} from '../utils/savedGamesStorage';
import { DiagnosticSaveLog } from '../utils/offlinePersistenceEngine';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff,
  X,
  Database,
  Server,
} from 'lucide-react';

interface SyncStatusIndicatorProps {
  compact?: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ compact = false }) => {
  const [syncState, setSyncState] = useState<SyncStatusState>(() => getSyncStatusState());
  const [isOpen, setIsOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [logs, setLogs] = useState<DiagnosticSaveLog[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToSyncStatus((state) => {
      setSyncState(state);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setLogs(getDiagnosticSaveLogs().slice(0, 25));
    const interval = setInterval(() => {
      setSyncState(getSyncStatusState());
      setLogs(getDiagnosticSaveLogs().slice(0, 25));
    }, 1500);
    return () => clearInterval(interval);
  }, [isOpen]);

  const {
    status,
    pendingCount,
    syncingCount,
    syncedCount,
    errorCount,
    lastError,
    lastErrorAt,
    isOnline,
    isFirestoreReachable,
    lastSyncedAt,
    queueItems,
  } = syncState;

  const totalUnsynced = pendingCount + syncingCount + errorCount;

  let icon = '🟢';
  let label = 'Sincronizado';
  let badgeClass = 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50 hover:bg-emerald-900 cursor-pointer';
  let tooltip = lastSyncedAt
    ? `Sistema sincronizado (${syncedCount} partidas verificadas — Última: ${lastSyncedAt}). Clic para ver panel de diagnóstico`
    : `Todas las partidas sincronizadas (${syncedCount}). Clic para abrir panel de diagnóstico`;

  if (status === 'saving') {
    icon = '🟡';
    label = 'Sincronizando';
    badgeClass = 'bg-amber-950/95 text-amber-200 border-amber-400/60 animate-pulse cursor-pointer hover:bg-amber-900';
    tooltip = `Sincronizando partida ${syncState.activeSaveId || ''} (${totalUnsynced} en cola)... Clic para diagnóstico`;
  } else if (status === 'pending') {
    icon = '🟠';
    label = totalUnsynced > 0 ? `Pendiente (${totalUnsynced})` : 'Pendiente';
    badgeClass = 'bg-orange-950/95 text-orange-200 border-orange-400/60 cursor-pointer hover:bg-orange-900';
    tooltip = `Guardado seguro en IndexedDB. ${totalUnsynced} partida(s) pendiente(s) de sincronizar. Clic para abrir diagnóstico`;
  } else if (status === 'error') {
    icon = '🔴';
    label = errorCount > 0 ? `Error Pendiente (${errorCount})` : `Error (${totalUnsynced})`;
    badgeClass = 'bg-rose-950/95 text-rose-200 border-rose-500/60 cursor-pointer hover:bg-rose-900';
    tooltip = `Error pendiente (${errorCount}): ${lastError || 'Reintentando automáticamente'}. Clic para abrir panel de diagnóstico`;
  }

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      await retryAllFailedAndPendingGamesNow();
      setSyncState(getSyncStatusState());
      setLogs(getDiagnosticSaveLogs().slice(0, 25));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={tooltip}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-black tracking-tight transition-all shadow-sm select-none ${badgeClass}`}
      >
        <span className="text-xs leading-none">{icon}</span>
        <span className={compact ? 'hidden md:inline' : 'inline'}>{label}</span>
        <Activity className="w-3 h-3 opacity-80 shrink-0" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                    Panel de Diagnóstico de Sincronización
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Estado en tiempo real de Save Queue, IndexedDB y Firestore
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* 4 Main Diagnostic Counters: Pendientes, Sincronizando, Sincronizadas, Con Error */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
                  <div className="flex items-center justify-between text-orange-300 text-xs font-bold mb-1">
                    <span>Pendientes</span>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-white">{pendingCount}</div>
                  <div className="text-[10px] text-orange-200/80 mt-0.5">En cola local</div>
                </div>

                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <div className="flex items-center justify-between text-yellow-300 text-xs font-bold mb-1">
                    <span>Sincronizando</span>
                    <RefreshCw className={`w-4 h-4 ${syncingCount > 0 ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="text-2xl font-black text-white">{syncingCount}</div>
                  <div className="text-[10px] text-yellow-200/80 mt-0.5">Activas ahora</div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="flex items-center justify-between text-emerald-300 text-xs font-bold mb-1">
                    <span>Sincronizadas</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-white">{syncedCount}</div>
                  <div className="text-[10px] text-emerald-200/80 mt-0.5">Verificadas en nube</div>
                </div>

                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                  <div className="flex items-center justify-between text-red-300 text-xs font-bold mb-1">
                    <span>Con Error</span>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-white">{errorCount}</div>
                  <div className="text-[10px] text-red-200/80 mt-0.5">Error pendiente</div>
                </div>
              </div>

              {/* Motivo del último error */}
              <div
                className={`rounded-xl border p-3.5 ${
                  lastError
                    ? 'border-red-500/40 bg-red-950/30 text-red-200'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className={`w-3.5 h-3.5 ${lastError ? 'text-red-400' : 'text-slate-500'}`} />
                    Motivo del último error
                  </span>
                  {lastErrorAt && (
                    <span className="text-[11px] font-mono text-red-300/80">Hora: {lastErrorAt}</span>
                  )}
                </div>
                <p className="text-xs font-mono break-words">
                  {lastError || 'Ningún error registrado — Sistema operando con normalidad.'}
                </p>
              </div>

              {/* Estado de Red y Botón Reintentar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    {isOnline ? (
                      <Wifi className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-slate-400">Red:</span>
                    <span className={isOnline ? 'font-bold text-emerald-300' : 'font-bold text-red-300'}>
                      {isOnline ? 'En línea' : 'Sin Internet (Offline)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Server className={`w-4 h-4 ${isFirestoreReachable ? 'text-emerald-400' : 'text-amber-400'}`} />
                    <span className="text-slate-400">Firestore:</span>
                    <span className={isFirestoreReachable ? 'font-bold text-emerald-300' : 'font-bold text-amber-300'}>
                      {isFirestoreReachable ? 'Disponible' : 'Reintentando'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-indigo-400" />
                    <span className="text-slate-400">Última sync:</span>
                    <span className="font-mono font-bold text-slate-200">{lastSyncedAt || '---'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleManualRetry}
                  disabled={isRetrying}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white shadow transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying ? 'Sincronizando...' : 'Reintentar Cola Ahora'}
                </button>
              </div>

              {/* Cola activa de partidas */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                  Partidas en Cola de Sincronización ({queueItems.length})
                </h4>
                {queueItems.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-emerald-300 font-semibold">
                    ✓ La cola de guardado está vacía. Todas las partidas están respaldadas en IndexedDB y sincronizadas con Firestore.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {queueItems.map((item) => (
                      <div
                        key={item.gameId}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-bold text-white">
                            <span>Partida #{item.round}</span>
                            <span className="text-[11px] font-mono text-slate-400">({item.dailyDate})</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                item.status === 'syncing'
                                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                                  : item.status === 'error'
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                    : 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                              }`}
                            >
                              {item.status === 'syncing'
                                ? 'Sincronizando'
                                : item.status === 'error'
                                  ? 'Error Pendiente'
                                  : 'Pendiente'}
                            </span>
                          </div>
                          {item.lastError && (
                            <p className="text-[11px] text-red-300 font-mono mt-0.5">
                              Motivo: {item.lastError}
                            </p>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 shrink-0">
                          Reintentos: <strong className="text-slate-200">{item.retryCount}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Historial de Diagnóstico */}
              {logs.length > 0 && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                    Últimos Eventos del Motor de Persistencia ({logs.length})
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] font-mono">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-1.5 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">[{log.startTime}]</span>
                          <span className="font-bold text-slate-200">Ronda #{log.round}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              log.result === 'SYNCED_FIRESTORE'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : log.result === 'SAVED_LOCAL'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {log.result}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span>{log.durationMs}ms</span>
                          {log.errorMessage && (
                            <span className="text-red-300 truncate max-w-[260px]" title={log.errorMessage}>
                              • {log.errorMessage}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/80 px-5 py-3 text-xs text-slate-400">
              <span>Ninguna partida bloquea las siguientes • Timeouts activos</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-1.5 font-bold text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

