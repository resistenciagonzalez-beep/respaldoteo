import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner.tsx';
import { setupPwa } from './utils/pwa';
import { startErrorReporting } from './utils/errorReporter';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Red de seguridad: si algo falla, se muestra un aviso con "Recargar" en vez de una pantalla en blanco */}
    <AppErrorBoundary>
      <AuthProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
        {/* Aviso cuando se publica una versión nueva (nunca recarga sola) */}
        <UpdateAvailableBanner />
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

// Registro de errores para administradores (con límite, nunca afecta el juego)
startErrorReporting();

// App instalable: modo sin señal, datos protegidos y pantalla encendida (solo en la app instalada)
setupPwa();
