import React, { useEffect, useState } from 'react';
import { SOCIAL_PLATFORMS, getConnectedAccounts } from '../services/socialService';

const ZERNIO_DASHBOARD = 'https://zernio.com/dashboard';

export default function AccountsView() {
  const [state, setState] = useState({ loading: true });

  const load = () => {
    setState({ loading: true });
    getConnectedAccounts()
      .then((data) => setState({ loading: false, ...data }))
      .catch((err) => setState({ loading: false, error: err.message, connected: [], configured: true }));
  };

  useEffect(load, []);

  const connected = state.connected || [];
  const nameByPlatform = Object.fromEntries((state.displayNames || []).map((d) => [d.platform, d.displayName]));

  return (
    <div style={{ maxWidth: 640 }}>
      {/* INTRO */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(230,3,6,0.12), rgba(230,3,6,0.02))',
        border: '1px solid #2A1012',
        borderRadius: 16,
        padding: '20px 22px',
        marginBottom: 22,
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.04em', color: '#FFF' }}>
          CONNECTED ACCOUNTS
        </div>
        <div style={{ fontSize: 13, color: '#999', marginTop: 6, lineHeight: 1.5 }}>
          Link your social accounts once in the Zernio dashboard. After that, 1P Studio posts to all of
          them automatically — no per-platform login needed here.
        </div>
        <a href={ZERNIO_DASHBOARD} target="_blank" rel="noreferrer">
          <button style={{
            marginTop: 14,
            background: '#E63329',
            color: '#FFF',
            fontSize: 14,
            fontWeight: 700,
            padding: '11px 20px',
            borderRadius: 10,
          }}>
            + Connect / Manage Accounts ↗
          </button>
        </a>
      </div>

      {/* CONFIG WARNING */}
      {state.loading ? null : state.configured === false ? (
        <div style={{ background: 'rgba(255,193,7,0.08)', border: '1px solid #3A3015', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#D9B65A', lineHeight: 1.5, marginBottom: 18 }}>
          Posting isn’t configured on the server yet — add your <strong>ZERNIO_API_KEY</strong> so connection status and publishing work.
        </div>
      ) : state.error ? (
        <div style={{ background: 'rgba(255,68,68,0.07)', border: '1px solid #3A1515', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#E08585', lineHeight: 1.5, marginBottom: 18 }}>
          Couldn’t read account status: {state.error}
        </div>
      ) : null}

      {/* PLATFORM LIST */}
      <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 16, overflow: 'hidden' }}>
        {SOCIAL_PLATFORMS.map(({ id, label }, i) => {
          const isConnected = connected.includes(id);
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '15px 18px',
                borderTop: i === 0 ? 'none' : '1px solid #1A1A1A',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#EEE', fontWeight: 600 }}>{label}</div>
                {state.loading ? (
                  <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>Checking…</div>
                ) : isConnected ? (
                  <div style={{ fontSize: 11, color: '#00C48C', marginTop: 3 }}>
                    {nameByPlatform[id] ? `@${nameByPlatform[id]}` : 'Connected'}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>Not connected</div>
                )}
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: isConnected ? '#00C48C' : '#555',
                background: isConnected ? 'rgba(0,196,140,0.12)' : '#1A1A1A',
                border: `1px solid ${isConnected ? '#00C48C44' : '#2A2A2A'}`,
                borderRadius: 20,
                padding: '4px 12px',
                flexShrink: 0,
              }}>
                {state.loading ? '…' : isConnected ? '● Connected' : 'Connect ↗'}
              </span>
            </div>
          );
        })}
      </div>

      <button
        onClick={load}
        disabled={state.loading}
        style={{ marginTop: 14, background: 'transparent', border: '1px solid #2A2A2A', color: '#888', fontSize: 12, padding: '8px 16px', borderRadius: 8, opacity: state.loading ? 0.5 : 1 }}
      >
        {state.loading ? 'Refreshing…' : 'Refresh status'}
      </button>
    </div>
  );
}
