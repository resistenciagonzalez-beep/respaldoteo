import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner.tsx';
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
