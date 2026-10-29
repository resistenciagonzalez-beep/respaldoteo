import React, { useState, useRef, useEffect } from 'react';
import {
  Lock,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  LogOut,
  UserPlus,
  Eye,
  EyeOff,
  X,
  Crown,
  Gamepad2,
  Loader2,
  ShieldAlert,
  CircleDot,
  Grid3X3,
  Check,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdmin: () => void;
  onAccessDeniedNotice?: (msg: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onOpenAdmin,
  onAccessDeniedNotice,
}) => {
  const { currentUser, login, register, logout, error, clearError, isAdmin } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  
  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register fields: username, email, password, assignedMode
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAssignedMode, setRegAssignedMode] = useState<'75' | '90'>('75');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localSuccessMsg, setLocalSuccessMsg] = useState<string | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalSuccessMsg(null);

    if (!loginEmail.trim()) {
      return;
    }
    if (!loginPassword) {
      return;
    }

    setIsSubmitting(true);
    const res = await login(loginEmail, loginPassword);
    setIsSubmitting(false);

    if (res.success) {
      setLocalSuccessMsg('¡Inicio de sesión exitoso!');
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = setTimeout(() => {
        setLocalSuccessMsg(null);
        onClose();
      }, 750);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalSuccessMsg(null);

    if (!regName.trim() || !regEmail.trim() || !regPassword) {
      return;
    }

    setIsSubmitting(true);
    // Everyone registers as 'operator' by default in backend logic with exclusive mode panel
    const res = await register(regName, regEmail, regPassword, regAssignedMode);
    setIsSubmitting(false);

    if (res.success) {
      setLocalSuccessMsg(`¡Cuenta creada con éxito! Bienvenido a Bingo ${regAssignedMode}, ${regName.trim()}.`);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = setTimeout(() => {
        setLocalSuccessMsg(null);
        onClose();
      }, 950);
    }
  };

  const handleAdminPanelClick = () => {
    if (isAdmin) {
      onClose();
      onOpenAdmin();
    } else {
      if (onAccessDeniedNotice) {
        onAccessDeniedNotice('Acceso denegado: El panel de administración solo es accesible para cuentas con rango de Administrador.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-md bg-[#fffaf5] border-2 border-orange-300 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-[#431407]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-orange-100 via-amber-100 to-orange-100 border-b border-orange-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#431407]">
                {currentUser
                  ? 'Perfil de Usuario'
                  : mode === 'login'
                  ? 'Iniciar Sesión'
                  : 'Crear Cuenta de Operador'}
              </h2>
              <p className="text-[11px] text-orange-900/70 font-semibold">
                Autenticación segura con Firebase
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-orange-200/70 text-orange-950 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Notification Alerts */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {localSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{localSuccessMsg}</span>
            </div>
          )}

          {/* Already logged in view */}
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-sm border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: currentUser.avatarColor || (isAdmin ? '#f59e0b' : '#10b981') }}
                  >
                    {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black text-orange-950 truncate">
                        {currentUser.name}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                          isAdmin
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        }`}
                      >
                        {isAdmin ? '👑 Administrador' : '🎮 Operador'}
                      </span>
                    </div>

                    <p className="text-xs text-orange-900/70 truncate">{currentUser.email}</p>
                    <p className="text-[10px] text-orange-900/60 mt-0.5">
                      Estado: <strong className="text-emerald-700 font-black">● Activo</strong> • ID: <span className="font-mono text-[9px]">{currentUser.id?.slice(0, 8)}...</span>
                    </p>
                  </div>
                </div>

                {/* Role Status Explanation */}
                <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200/70 text-xs">
                  {isAdmin ? (
                    <div className="flex items-start gap-2 text-amber-950">
                      <Crown className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black">Rango Administrador activo:</span>
                        <p className="text-[11px] text-orange-900/80">
                          Acceso total al Panel de Administrador, monitoreo en tiempo real de operadores y asignación de rangos.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-emerald-950">
                      <Gamepad2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black">Rango Operador activo:</span>
                        <p className="text-[11px] text-orange-900/80">
                          Habilitado para operar los bolilleros virtuales (75 y 90), cantar bolas, gestionar planillas y registrar partidas.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-orange-100 flex flex-col gap-2">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={handleAdminPanelClick}
                      className="w-full py-2.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Abrir Panel de Administrador</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAdminPanelClick}
                      className="w-full py-2 px-3 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-900/60 hover:text-orange-900 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-orange-200 cursor-pointer"
                      title="Área restringida solo para administradores"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-orange-600" />
                      <span>Panel Admin (Restringido a Administradores)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      setLocalSuccessMsg('Has cerrado sesión correctamente.');
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-orange-100 hover:bg-rose-100 hover:text-rose-900 text-orange-950 text-xs font-bold transition-all border border-orange-300 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Toggle Mode Tab (Iniciar Sesión vs Registrarse) */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-orange-100/80 rounded-2xl border border-orange-200 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setMode('login');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white text-orange-950 shadow-xs border border-orange-200'
                      : 'text-orange-900/70 hover:text-orange-950'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Iniciar Sesión</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setMode('register');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white text-orange-950 shadow-xs border border-orange-200'
                      : 'text-orange-900/70 hover:text-orange-950'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Registrarse</span>
                </button>
              </div>

              {mode === 'login' ? (
                /* Formulario de Inicio de Sesión */
                <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                      Correo Electrónico o Usuario:
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="tu-correo@ejemplo.com o nombre de usuario"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                      Contraseña:
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Ingresa tu contraseña..."
                        className="w-full pl-9 pr-9 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-orange-400 hover:text-orange-700 cursor-pointer"
                        title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-black text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                    <span>{isSubmitting ? 'Verificando con Firebase...' : 'Iniciar Sesión'}</span>
                  </button>
                </form>
              ) : (
                /* Formulario de Registro */
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                      Nombre de Usuario: *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Ej: Daniel Sánchez"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                      Correo Electrónico: *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="daniel@ejemplo.com"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                      Contraseña (mínimo 6 caracteres): *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres..."
                        className="w-full pl-9 pr-9 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-orange-400 hover:text-orange-700 cursor-pointer"
                        title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Selector de Modalidad de Bingo */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-black text-orange-950 uppercase tracking-wider">
                      Modalidad de Bingo Asignada: *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRegAssignedMode('75')}
                        className={`p-2.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                          regAssignedMode === '75'
                            ? 'bg-amber-100/90 border-amber-500 ring-2 ring-amber-400 shadow-xs'
                            : 'bg-white border-orange-200 hover:border-orange-300 hover:bg-orange-50/50'
                        }`}
                      >
                        {regAssignedMode === '75' && (
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mb-1">
                          <Grid3X3 className="w-4 h-4 text-amber-700" />
                          <span className="text-xs font-black text-orange-950">Bingo 75</span>
                        </div>
                        <span className="text-[10px] text-orange-900/75 leading-tight font-medium">
                          Multiplicadores y planilla 1 al 15
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRegAssignedMode('90')}
                        className={`p-2.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                          regAssignedMode === '90'
                            ? 'bg-amber-100/90 border-amber-500 ring-2 ring-amber-400 shadow-xs'
                            : 'bg-white border-orange-200 hover:border-orange-300 hover:bg-orange-50/50'
                        }`}
                      >
                        {regAssignedMode === '90' && (
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mb-1">
                          <CircleDot className="w-4 h-4 text-amber-700" />
                          <span className="text-xs font-black text-orange-950">Bingo 90</span>
                        </div>
                        <span className="text-[10px] text-orange-900/75 leading-tight font-medium">
                          Tradicional 90 y triples
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Aviso informativo de Rol y Panel Bloqueado */}
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex items-start gap-2">
                    <Gamepad2 className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-black">
                        Panel Exclusivo: Bingo {regAssignedMode} Bolas
                      </strong>
                      <p className="text-[10px] text-amber-900/80 leading-tight">
                        Tu cuenta operará únicamente en el panel de <strong>Bingo {regAssignedMode}</strong>. Solo las administradoras tienen acceso a ambos paneles.
                      </p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-black text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>{isSubmitting ? 'Creando cuenta en Firebase...' : 'Completar Registro'}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
