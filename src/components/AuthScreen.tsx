import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Eye,
  EyeOff,
  Gamepad2,
  Loader2,
  CircleDot,
  Grid3X3,
  Check,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface AuthScreenProps {
  initialMode?: 'login' | 'register';
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ initialMode = 'register' }) => {
  const { login, register, error, clearError } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [assignedMode, setAssignedMode] = useState<'75' | '90'>('75');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMessage(null);

    setIsSubmitting(true);

    if (mode === 'register') {
      const res = await register(name, email, password, assignedMode);
      setIsSubmitting(false);
      if (res.success) {
        setSuccessMessage(`¡Registro completado! Bienvenido a la plataforma, ${name.trim()}.`);
      }
    } else {
      const res = await login(email, password);
      setIsSubmitting(false);
      if (res.success) {
        setSuccessMessage('¡Inicio de sesión exitoso! Accediendo a la plataforma...');
      }
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-[#fbf5ee] text-[#431407] relative overflow-hidden select-none">
      {/* Decorative Warm Background Accents */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-orange-200/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-amber-200/40 blur-3xl pointer-events-none" />

      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-[#fffaf5] border-2 border-orange-300 rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10 animate-fade-in">
        {/* Brand Banner */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-orange-100 via-amber-100 to-orange-100 border-b border-orange-200 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md mb-2.5 border-2 border-white/80">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#431407] tracking-tight leading-tight">
            Bolillero Virtual & Planilla
          </h1>
          <p className="text-xs font-bold text-orange-900/75 mt-0.5">
            Acceso Requerido a la Plataforma
          </p>
        </div>

        {/* Tab Selector: Registrarse vs Iniciar Sesión */}
        <div className="p-6 pt-5 pb-3">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-orange-100/80 rounded-2xl border border-orange-200">
            <button
              type="button"
              onClick={() => {
                clearError();
                setSuccessMessage(null);
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

            <button
              type="button"
              onClick={() => {
                clearError();
                setSuccessMessage(null);
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
          </div>
        </div>

        {/* Form Body */}
        <div className="px-6 pb-6 space-y-4">
          {/* Notifications */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Campo: Nombre de Usuario (Solo en Registro) */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                  Nombre de Usuario: *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Daniel Sánchez"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                  />
                </div>
              </div>
            )}

            {/* Campo: Correo Electrónico o Usuario */}
            <div>
              <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                {mode === 'login' ? 'Correo Electrónico o Usuario: *' : 'Correo Electrónico: *'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                <input
                  type={mode === 'login' ? 'text' : 'email'}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'login' ? 'tu-correo@ejemplo.com o nombre de usuario' : 'tu-correo@ejemplo.com'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                />
              </div>
            </div>

            {/* Campo: Contraseña con Ojo Toggle */}
            <div>
              <label className="block text-xs font-black text-orange-950 uppercase tracking-wider mb-1">
                Contraseña: *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Mínimo 6 caracteres...' : 'Ingresa tu contraseña...'}
                  className="w-full pl-9 pr-9 py-2 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 placeholder-orange-300 shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-orange-400 hover:text-orange-700 cursor-pointer p-0.5"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Selector de Modalidad de Bingo (Exclusivo por Panel para Operadoras) */}
            {mode === 'register' && (
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-black text-orange-950 uppercase tracking-wider">
                  Modalidad de Bingo Asignada: *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Opción 1: Bingo 75 Bolas */}
                  <button
                    type="button"
                    onClick={() => setAssignedMode('75')}
                    className={`p-2.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                      assignedMode === '75'
                        ? 'bg-amber-100/90 border-amber-500 ring-2 ring-amber-400 shadow-xs'
                        : 'bg-white border-orange-200 hover:border-orange-300 hover:bg-orange-50/50'
                    }`}
                  >
                    {assignedMode === '75' && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <Grid3X3 className="w-4 h-4 text-amber-700" />
                      <span className="text-xs font-black text-orange-950">Bingo 75</span>
                    </div>
                    <span className="text-[10px] text-orange-900/75 leading-tight font-medium">
                      Multiplicadores X1-X5 y planilla por columnas (1-15)
                    </span>
                  </button>

                  {/* Opción 2: Bingo 90 Bolas */}
                  <button
                    type="button"
                    onClick={() => setAssignedMode('90')}
                    className={`p-2.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                      assignedMode === '90'
                        ? 'bg-amber-100/90 border-amber-500 ring-2 ring-amber-400 shadow-xs'
                        : 'bg-white border-orange-200 hover:border-orange-300 hover:bg-orange-50/50'
                    }`}
                  >
                    {assignedMode === '90' && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mb-1">
                      <CircleDot className="w-4 h-4 text-amber-700" />
                      <span className="text-xs font-black text-orange-950">Bingo 90</span>
                    </div>
                    <span className="text-[10px] text-orange-900/75 leading-tight font-medium">
                      Tradicional 90 bolas y tablas de triples [r, r+30, r+60]
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Aviso informativo de Rol y Panel Bloqueado */}
            {mode === 'register' && (
              <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex items-start gap-2">
                <Gamepad2 className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-black">
                    Panel Exclusivo: Bingo {assignedMode} Bolas
                  </strong>
                  <span className="text-[10px] text-amber-900/80 leading-tight">
                    Tu cuenta tendrá acceso únicamente al panel y planilla de <strong>Bingo {assignedMode}</strong>. Solo las administradoras tienen acceso global y pueden alternar entre ambos modos.
                  </span>
                </div>
              </div>
            )}

            {/* Botón de Enviar */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-black text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'register' ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>
                {isSubmitting
                  ? 'Verificando con Firebase...'
                  : mode === 'register'
                  ? 'Registrarse y Entrar'
                  : 'Iniciar Sesión'}
              </span>
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="px-6 py-2.5 bg-orange-100/50 border-t border-orange-200 text-center text-[10px] font-bold text-orange-900/60">
          Firebase Authentication & Cloud Firestore • Conexión Segura
        </div>
      </div>
    </div>
  );
};
