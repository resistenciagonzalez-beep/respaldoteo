/**
 * Panel de admin: lista de usuarios con sus botones (aprobar, rango, modalidad, eliminar).
 * Se separó de AdminPanelModal.tsx sin cambiar su contenido ni su funcionamiento.
 */
import React from 'react';
import {
  Mail,
  Calendar,
  RefreshCw,
  ArrowUpDown,
  UserCheck,
  UserX,
  Trash2,
} from 'lucide-react';
import type { AppUser } from '../../types';

export interface AdminUsersListProps {
  filteredUsers: AppUser[];
  currentUser: AppUser | null;
  handleToggleAssignedMode: (user: AppUser) => Promise<void>;
  handleToggleRole: (user: AppUser) => Promise<void>;
  handleToggleStatus: (user: AppUser) => Promise<void>;
  handleDeleteUser: (user: AppUser) => Promise<void>;
}

export const AdminUsersList: React.FC<AdminUsersListProps> = ({
  filteredUsers,
  currentUser,
  handleToggleAssignedMode,
  handleToggleRole,
  handleToggleStatus,
  handleDeleteUser,
}) => {
  return (
    <div className="space-y-2.5">
      {filteredUsers.map((user) => {
        const isUserAdmin = user.role === 'admin';
        const isSuspended = user.status === 'suspended';
        const isPending = user.status === 'pending';
        const isSelf = currentUser?.id === user.id;

        return (
          <div
            key={user.id}
            className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
              isSelf
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/40'
                : isSuspended
                ? 'bg-rose-50/70 border-rose-200 opacity-80'
                : 'bg-white border-orange-200 hover:border-orange-300'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-xs flex-shrink-0"
                style={{ backgroundColor: user.avatarColor || (isUserAdmin ? '#f59e0b' : '#10b981') }}
              >
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm text-orange-950 truncate">
                    {user.name}
                  </span>

                  {isSelf && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                      Tú (Admin actual)
                    </span>
                  )}

                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      isUserAdmin
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    }`}
                  >
                    {isUserAdmin ? '👑 Administrador' : '🎮 Operador'}
                  </span>

                  {/* Insignia de Modalidad Asignada */}
                  {!isUserAdmin && (
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        user.assignedMode === '90'
                          ? 'bg-blue-100 text-blue-900 border-blue-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                      title="Modalidad y panel exclusivo asignado"
                    >
                      {user.assignedMode === '90' ? '🎱 Bingo 90' : '🎯 Bingo 75'}
                    </span>
                  )}

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isPending
                        ? 'bg-amber-100 text-amber-900 border-amber-400'
                        : isSuspended
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {isPending ? '● Pendiente de aprobación' : isSuspended ? '● Suspendido' : '● Activo'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-orange-900/70 mt-1 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3 opacity-60" />
                    {user.email}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[10px]">
                    UID: {user.id?.slice(0, 10)}...
                  </span>
                  {user.joinedDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 opacity-60" />
                      Reg: {user.joinedDate}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Admin Controls */}
            <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
              {/* Botón para cambiar modalidad asignada a operadoras */}
              {!isUserAdmin && (
                <button
                  type="button"
                  onClick={() => handleToggleAssignedMode(user)}
                  className="px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer bg-white hover:bg-orange-50 text-orange-950 border-orange-300 shadow-xs"
                  title={`Cambiar modalidad exclusiva asignada a ${user.assignedMode === '90' ? 'Bingo 75' : 'Bingo 90'}`}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-orange-600" />
                  <span>{user.assignedMode === '90' ? 'Pasar a B75' : 'Pasar a B90'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSelf}
                onClick={() => handleToggleRole(user)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                  isSelf
                    ? 'opacity-40 cursor-not-allowed bg-orange-100 border-orange-200'
                    : isUserAdmin
                    ? 'bg-orange-100 hover:bg-orange-200 text-orange-950 border-orange-300'
                    : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>{isUserAdmin ? 'Hacer Operador' : 'Asignar Admin'}</span>
              </button>

              <button
                type="button"
                disabled={isSelf}
                onClick={() => handleToggleStatus(user)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                  isSelf
                    ? 'opacity-40 cursor-not-allowed bg-orange-100 border-orange-200'
                    : isSuspended || isPending
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700 shadow-xs'
                    : 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300'
                }`}
              >
                {isPending ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Aprobar</span>
                  </>
                ) : isSuspended ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Reactivar</span>
                  </>
                ) : (
                  <>
                    <UserX className="w-3.5 h-3.5" />
                    <span>Suspender</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSelf}
                onClick={() => handleDeleteUser(user)}
                className={'px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ' + (isSelf ? 'opacity-40 cursor-not-allowed bg-orange-100 border-orange-200' : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-xs')}
                title="Eliminar usuario (solo administradores)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
