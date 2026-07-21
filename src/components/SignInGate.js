import React, { useState } from 'react';
import { signInWithGoogle } from '../services/firebase';
import { GlowBackground } from './ui';
import { colors as c, fonts as f, radius as r } from '../theme';

// Full-screen sign-in wall. The app is gated behind a real Google account so
// each user's API keys (Settings tab) are tied to a stable identity that
// syncs across devices. Redirect flow — the page navigates to Google and
// returns; getRedirectResult in firebase.js completes it on load.
export default function SignInGate() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Redirects away; nothing runs after this on success.
    } catch (e) {
      setError(e?.message || 'Sign-in failed. Try again.');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: f.body, position: 'relative' }}>
      <GlowBackground />
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 14, background: '#000',
          border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: f.display, fontSize: 26, color: '#fff', marginBottom: 22,
        }}>
          1P
        </div>
        <div style={{ fontFamily: f.display, fontSize: 40, lineHeight: 0.95, textTransform: 'uppercase', marginBottom: 12 }}>
          1P Studio
        </div>
        <div style={{ color: c.textDim, fontSize: 14, lineHeight: 1.6, maxWidth: 360, marginBottom: 28 }}>
          Sign in to load your workspace. Your API keys live with your account and sync across your devices.
        </div>

        <button
          onClick={signIn}
          disabled={busy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            background: '#fff', color: '#111', border: 'none',
            borderRadius: r.md, padding: '13px 22px', fontSize: 15, fontWeight: 700,
            fontFamily: f.body, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>

        {error && (
          <div style={{ color: c.danger, fontSize: 12.5, marginTop: 16, maxWidth: 360, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
