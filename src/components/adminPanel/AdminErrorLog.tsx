/**
 * Panel de admin: pestaña "Errores".
 * Muestra los últimos 50 avisos de error que llegaron desde los dispositivos de las operadoras.
 * Solo se conecta a la base de datos mientras la pestaña está abierta.
 */
import React, { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { ERROR_LOG_COLLECTION, type ErrorLogEntry } from '../../utils/errorReportRules';

type ErrorLogRow = ErrorLogEntry & { id: string };

const SOURCE_LABEL: Record<ErrorLogEntry['source'], string> = {
  pantalla: 'Pantalla',
  pagina: 'Página',
  promesa: 'Proceso interno',
};

function formatWhen(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('es-PA', {
      timeZone: 'America/Panama',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

export const AdminErrorLog: React.FC = () => {
  const [rows, setRows] = useState<ErrorLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, ERROR_LOG_COLLECTION), orderBy('createdAtMs', 'desc'), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ErrorLogEntry) })));
        setLoading(false);
        setLoadError(null);
      },
      (err) => {
        console.warn('No se pudo leer el registro de errores:', err);
        setLoadError('No se pudo leer el registro de errores.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, ERROR_LOG_COLLECTION, id));
    } catch (err) {
      console.warn('No se pudo borrar el aviso:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-3">
      <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 font-semibold">
        Aquí aparecen los fallos que ocurren en los dispositivos de las operadoras (los últimos 50).
        Cada dispositivo envía como máximo 5 avisos por sesión y nunca el mismo fallo dos veces en 10 minutos.
      </div>

      {loading ? (
        <p className="text-xs text-orange-900/60 font-bold py-6 text-center">Cargando…</p>
      ) : loadError ? (
        <p className="text-xs text-rose-700 font-bold py-6 text-center">{loadError}</p>
      ) : rows.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center text-emerald-800">
          <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-600" />
          <p className="text-sm font-black">Sin errores registrados</p>
          <p className="text-xs text-emerald-900/70 mt-1">Todo está funcionando bien en los dispositivos.</p>
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="p-3 rounded-2xl bg-white border border-rose-200 shadow-xs space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-black text-rose-950 break-words">{row.message || 'Error sin descripción'}</p>
                  <p className="text-[11px] text-orange-900/70 font-semibold mt-0.5">
                    {formatWhen(row.createdAtMs)} • {row.email || 'Sin correo'} • {SOURCE_LABEL[row.source] || row.source}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(row.id)}
                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer flex-shrink-0"
                title="Borrar este aviso"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpenId(openId === row.id ? null : row.id)}
              className="text-[11px] font-bold text-orange-700 hover:text-orange-900 underline cursor-pointer"
            >
              {openId === row.id ? 'Ocultar detalles' : 'Ver detalles'}
            </button>
            {openId === row.id && (
              <div className="text-[10px] font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2 whitespace-pre-wrap break-words space-y-1">
                <div>Dispositivo: {row.device || '-'}</div>
                <div>Versión: {row.build || '-'}</div>
                <div>Ruta: {row.path || '-'}</div>
                {row.detail && <div>{row.detail}</div>}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};
