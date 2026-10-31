import React, { useEffect, useState } from 'react';
import {
  subscribeToSyncStatus,
  getSyncStatusState,
  processSaveQueue,
  SyncStatusState,
} from '../utils/savedGamesStorage';

interface SyncStatusIndicatorProps {
  compact?: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ compact = false }) => {
  const [syncState, setSyncState] = useState<SyncStatusState>(() => getSyncStatusState());

  useEffect(() => {
    const unsubscribe = subscribeToSyncStatus((state) => {
      setSyncState(state);
    });
    return () => unsubscribe();
  }, []);

  const handleManualSyncClick = () => {
    if (syncState.pendingCount > 0) {
      void processSaveQueue();
    }
  };

  let icon = '🟢';
  let label = 'Sincronizado';
  let badgeClass = 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50 hover:bg-emerald-900';
  let tooltip = syncState.lastSyncedAt
    ? `Sistema sincronizado con Firestore (Última verificación: ${syncState.lastSyncedAt})`
    : 'Todas las partidas están guardadas en IndexedDB y sincronizadas con Firestore';

  if (syncState.status === 'saving') {
    icon = '🟡';
    label = 'Guardando';
    badgeClass = 'bg-amber-950/95 text-amber-200 border-amber-400/60 animate-pulse';
    tooltip = `Guardando y verificando partida ${syncState.activeSaveId || ''}...`;
  } else if (syncState.status === 'pending') {
    icon = '🟠';
    label =
      syncState.pendingCount > 1
        ? `Pendiente de sincronizar (${syncState.pendingCount})`
        : 'Pendiente de sincronizar';
    badgeClass = 'bg-orange-950/95 text-orange-200 border-orange-400/60 cursor-pointer hover:bg-orange-900';
    tooltip = `Guardado seguro en este dispositivo (IndexedDB). ${syncState.pendingCount} partida(s) en cola esperando conexión para sincronizar.`;
  } else if (syncState.status === 'error') {
    icon = '🔴';
    label =
      syncState.pendingCount > 0
        ? `Error de sincronización (${syncState.pendingCount})`
        : 'Error de sincronización';
    badgeClass = 'bg-rose-950/95 text-rose-200 border-rose-500/60 cursor-pointer hover:bg-rose-900';
    tooltip = `${syncState.lastError || 'Error de conexión con Firestore'}. Partidas protegidas localmente en IndexedDB. Reintentando automáticamente con Backoff Exponencial (clic para reintentar ahora).`;
  }

  return (
    <button
      type="button"
      onClick={handleManualSyncClick}
      title={tooltip}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-black tracking-tight transition-all shadow-sm select-none ${badgeClass}`}
    >
      <span className="text-xs leading-none">{icon}</span>
      <span className={compact ? 'hidden md:inline' : 'inline'}>{label}</span>
    </button>
  );
};
