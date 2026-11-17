import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Red de seguridad: si algo falla, se muestra un aviso con "Recargar" en vez de una pantalla en blanco */}
    <AppErrorBoundary>
      <AuthProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
