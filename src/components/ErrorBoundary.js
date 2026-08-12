import React from 'react';
import { reportError } from '../services/errorReporter';
import { colors as c, fonts as f, radius as r } from '../theme';

// Catches render-phase crashes. Without this, a throw anywhere in the tree
// unmounts everything to a blank white page and nobody ever learns it
// happened. Must be a class — hooks cannot catch.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, message: error?.message || 'Something broke.' };
  }

  componentDidCatch(error, info) {
    reportError(error, {
      kind: 'boundary',
      // The component stack names the subtree that blew up — the single most
      // useful field when diagnosing from a report alone.
      component: String(info?.componentStack || '').slice(0, 500),
    });
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          background: c.bg,
          color: c.text,
          fontFamily: f.body,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontFamily: f.display, fontSize: 34, textTransform: 'uppercase', color: '#FFF', lineHeight: 1 }}>
            Something <span style={{ color: c.red }}>broke.</span>
          </div>
          <p style={{ fontSize: 14, color: c.textDim, lineHeight: 1.6, margin: '14px 0 22px' }}>
            This screen crashed, and the error has been reported automatically. Reloading usually
            gets you going again — your library is saved on this device.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: c.red,
              color: '#FFF',
              border: 'none',
              borderRadius: r.md,
              fontFamily: f.body,
              fontSize: 14,
              fontWeight: 700,
              padding: '12px 24px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {this.state.message && (
            <div style={{ marginTop: 18, fontFamily: f.mono, fontSize: 11, color: c.textFaint, wordBreak: 'break-word' }}>
              {this.state.message}
            </div>
          )}
        </div>
      </div>
    );
  }
}
