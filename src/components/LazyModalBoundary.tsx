import React, { Suspense } from 'react';

/**
 * Envoltura para ventanas que se cargan bajo demanda (galería, panel de administración).
 *
 * - Mientras se descarga, muestra un aviso pequeño de "Cargando...".
 * - Si no se puede abrir (por ejemplo, sin internet), muestra un aviso con botón
 *   para cerrar, SIN afectar el resto de la plataforma ni la partida en curso.
 */

interface LazyModalBoundaryProps {
  onClose: () => void;
  children: React.ReactNode;
}

interface LazyModalBoundaryState {
  failed: boolean;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 70,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(0,0,0,0.45)',
};

const cardStyle: React.CSSProperties = {
  maxWidth: 340,
  width: '100%',
  background: '#fffaf5',
  border: '2px solid #fdba74',
  borderRadius: 20,
  padding: 18,
  textAlign: 'center',
  fontFamily: 'Outfit, system-ui, sans-serif',
  color: '#431407',
  boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
};

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: '9px 10px',
  borderRadius: 12,
  border: 'none',
  fontWeight: 900,
  fontSize: 12,
  cursor: 'pointer',
};

function LoadingNotice() {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 220, padding: 14, fontWeight: 800, fontSize: 13 }}>Cargando…</div>
    </div>
  );
}

export class LazyModalBoundary extends React.Component<LazyModalBoundaryProps, LazyModalBoundaryState> {
  state: LazyModalBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazyModalBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('[CARGA DIFERIDA] No se pudo abrir la ventana:', error);
  }

  private handleClose = (): void => {
    this.setState({ failed: false });
    this.props.onClose();
  };

  render() {
    if (this.state.failed) {
      return (
        <div style={overlayStyle}>
          <div style={cardStyle}>
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>No se pudo abrir esta ventana</div>
            <div style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 14 }}>
              Revisa tu conexión a internet e inténtalo de nuevo. Tu partida y lo guardado no se afectan.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={this.handleClose} style={{ ...buttonStyle, background: '#f97316', color: '#fff' }}>
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ ...buttonStyle, background: '#fff', color: '#7c2d12', border: '1px solid #fdba74' }}
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <Suspense fallback={<LoadingNotice />}>{this.props.children}</Suspense>;
  }
}
