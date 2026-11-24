import React from 'react';

/**
 * Red de seguridad de la plataforma.
 *
 * Si alguna parte de la pantalla falla (un error inesperado al dibujar la planilla,
 * la galería, etc.), en vez de quedar TODO en blanco se muestra un aviso con
 * botones para volver a intentarlo o recargar.
 *
 * No toca ningún dato: las partidas ya guardadas y las que están en la cola de
 * guardado siguen en el dispositivo y se suben solas al recargar.
 */

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
  retries: number;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: '', retries: 0 };

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Queda registrado en la consola del navegador para poder revisarlo después
    console.error('[RED DE SEGURIDAD] Error en la pantalla:', error, info && info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState((s) => ({ hasError: false, message: '', retries: s.retries + 1 }));
  };

  private handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      // La "key" cambia en cada reintento para volver a montar la pantalla desde cero
      return <React.Fragment key={this.state.retries}>{this.props.children}</React.Fragment>;
    }

    // Estilos escritos aquí mismo para que el aviso se vea aunque fallen los estilos de la página
    const overlay: React.CSSProperties = {
      position: 'fixed',
      inset: 0,
      zIndex: 2147483000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
      fontFamily: 'Outfit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    };
    const card: React.CSSProperties = {
      width: '100%',
      maxWidth: '440px',
      background: '#ffffff',
      border: '2px solid #fdba74',
      borderRadius: '18px',
      boxShadow: '0 20px 50px rgba(124, 45, 18, 0.18)',
      padding: '24px',
      textAlign: 'center',
      color: '#431407',
    };
    const btnBase: React.CSSProperties = {
      width: '100%',
      padding: '12px 16px',
      borderRadius: '12px',
      fontWeight: 900,
      fontSize: '15px',
      cursor: 'pointer',
      border: 'none',
      marginTop: '10px',
    };

    // Después de 2 intentos fallidos, solo se ofrece recargar
    const canRetry = this.state.retries < 2;

    return (
      <div style={overlay} role="alert">
        <div style={card}>
          <div style={{ fontSize: '40px', lineHeight: 1, marginBottom: '10px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 8px' }}>Algo falló al mostrar la pantalla</h1>
          <p style={{ fontSize: '14px', lineHeight: 1.45, margin: '0 0 6px', color: '#7c2d12' }}>
            Tus partidas guardadas <strong>no se perdieron</strong>. Las que estaban pendientes se suben solas al
            recargar.
          </p>
          <p style={{ fontSize: '12.5px', margin: '0 0 8px', color: '#9a3412' }}>
            Presiona un botón para continuar.
          </p>

          {canRetry && (
            <button
              type="button"
              onClick={this.handleRetry}
              style={{ ...btnBase, background: '#ea580c', color: '#ffffff' }}
            >
              Intentar de nuevo
            </button>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              ...btnBase,
              background: canRetry ? '#ffffff' : '#ea580c',
              color: canRetry ? '#c2410c' : '#ffffff',
              border: canRetry ? '2px solid #fdba74' : 'none',
            }}
          >
            Recargar la página
          </button>

          {this.state.message && (
            <p
              style={{
                fontSize: '10.5px',
                color: '#a8a29e',
                marginTop: '14px',
                marginBottom: 0,
                wordBreak: 'break-word',
              }}
            >
              Detalle técnico: {this.state.message.slice(0, 180)}
            </p>
          )}
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
