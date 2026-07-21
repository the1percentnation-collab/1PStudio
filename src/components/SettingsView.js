import React, { useEffect, useState } from 'react';
import { Button, Field, SectionTitle } from './ui';
import { colors as c, fonts as f, radius as r } from '../theme';
import { currentUser, signOutUser } from '../services/firebase';
import { saveUserKeys, watchUserKeys } from '../services/userKeys';
import { getConnectedAccounts } from '../services/socialService';

// The keys the Settings tab manages. Each is the user's own credential,
// stored per-account in Firestore (userConfig/{uid}) and used by the server
// on their behalf.
const FIELDS = [
  { key: 'zernioApiKey', label: 'Zernio API Key', help: 'Posts to your social platforms. Get it in the Zernio dashboard → API.', link: 'https://zernio.com/dashboard' },
  { key: 'zernioProfileId', label: 'Zernio Profile ID (optional)', help: 'Pins which Zernio profile to post from. Leave blank to use your first profile.', link: null },
  { key: 'deepgramApiKey', label: 'Deepgram API Key', help: 'Powers auto-captions & transcripts. console.deepgram.com → API Keys.', link: 'https://console.deepgram.com' },
  { key: 'anthropicApiKey', label: 'Anthropic API Key', help: 'Powers content generation (titles, captions, hooks). console.anthropic.com.', link: 'https://console.anthropic.com/settings/keys' },
];

function mask(v) {
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}••••••••${v.slice(-4)}`;
}

export default function SettingsView() {
  const user = currentUser();
  const [values, setValues] = useState({ zernioApiKey: '', zernioProfileId: '', deepgramApiKey: '', anthropicApiKey: '' });
  const [saved, setSaved] = useState({}); // masked view of what's stored server-side
  const [show, setShow] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type, message }
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { type, message }

  // Live-load stored keys. We keep the raw values in state so edits are
  // possible, but never surface other-user data (rules already scope to uid).
  useEffect(() => {
    const unsub = watchUserKeys((data) => {
      setSaved({
        zernioApiKey: data.zernioApiKey || '',
        zernioProfileId: data.zernioProfileId || '',
        deepgramApiKey: data.deepgramApiKey || '',
        anthropicApiKey: data.anthropicApiKey || '',
      });
      // Only overwrite the form from the server while the user hasn't edited.
      setValues((prev) => (dirty ? prev : {
        zernioApiKey: data.zernioApiKey || '',
        zernioProfileId: data.zernioProfileId || '',
        deepgramApiKey: data.deepgramApiKey || '',
        anthropicApiKey: data.anthropicApiKey || '',
      }));
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key, v) => { setDirty(true); setStatus(null); setValues((p) => ({ ...p, [key]: v })); };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await saveUserKeys(values);
      setDirty(false);
      setStatus({ type: 'ok', message: 'Keys saved to your account. They’ll be used on every device you sign in on.' });
    } catch (e) {
      setStatus({ type: 'error', message: e?.message || 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  // Test Zernio by asking the server (with the just-saved key) which accounts
  // are connected. Anthropic/Deepgram are validated implicitly the first time
  // you generate/caption; Zernio is the one users most need to confirm.
  const testZernio = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await getConnectedAccounts();
      if (!data.configured) {
        setTestResult({ type: 'error', message: 'No Zernio key is active — save your key above first.' });
      } else if (data.error) {
        setTestResult({ type: 'error', message: data.error });
      } else {
        const n = (data.connected || []).length;
        setTestResult({ type: n ? 'ok' : 'warn', message: n
          ? `Connected: ${data.connected.join(', ')} (${n} platform${n !== 1 ? 's' : ''}).`
          : 'Key works, but no platforms are connected yet — connect them in the Zernio dashboard.' });
      }
    } catch (e) {
      setTestResult({ type: 'error', message: e?.message || 'Test failed.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ maxWidth: 620 }}>
      {/* ACCOUNT */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26,
        background: c.surface, border: `1px solid ${c.border}`, borderRadius: r.lg, padding: 16,
      }}>
        {user?.photoURL
          ? <img src={user.photoURL} alt="" style={{ width: 42, height: 42, borderRadius: '50%' }} />
          : <div style={{ width: 42, height: 42, borderRadius: '50%', background: c.surfaceHi }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: c.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName || 'Signed in'}
          </div>
          <div style={{ fontSize: 12, color: c.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email || ''}
          </div>
        </div>
        <Button variant="ghost" onClick={() => signOutUser()} style={{ padding: '9px 14px', fontSize: 13 }}>Sign out</Button>
      </div>

      <SectionTitle style={{ marginBottom: 6 }}>API Keys</SectionTitle>
      <div style={{ fontSize: 13, color: c.textDim, lineHeight: 1.6, marginBottom: 22 }}>
        These are private to your account and stored securely — only you and 1P Studio’s servers can read them.
        A blank field falls back to any key already configured on the server.
      </div>

      {FIELDS.map(({ key, label, help, link }) => {
        const stored = saved[key];
        const revealed = show[key];
        return (
          <div key={key} style={{ marginBottom: 18 }}>
            <div style={{ position: 'relative' }}>
              <Field
                label={label}
                type={revealed ? 'text' : 'password'}
                autoComplete="off"
                value={values[key]}
                placeholder={stored ? mask(stored) : 'Not set'}
                onChange={(e) => setField(key, e.target.value)}
                inputStyle={{ paddingRight: 62 }}
              />
              <button
                type="button"
                onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
                style={{
                  position: 'absolute', right: 8, bottom: 8, background: 'transparent',
                  border: 'none', color: c.textDim, fontSize: 11, fontFamily: f.mono,
                  letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 6px',
                }}
              >
                {revealed ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: c.textFaint, marginTop: 6, lineHeight: 1.5 }}>
              {help}{' '}
              {link && <a href={link} target="_blank" rel="noreferrer" style={{ color: c.redDim }}>Get key ↗</a>}
            </div>
          </div>
        );
      })}

      {status && (
        <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14, color: status.type === 'ok' ? c.success : c.danger }}>
          {status.type === 'ok' ? '✓ ' : '✕ '}{status.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save keys'}</Button>
        <Button variant="ghost" onClick={testZernio} disabled={testing}>{testing ? 'Testing…' : 'Test Zernio connection'}</Button>
      </div>

      {testResult && (
        <div style={{
          fontSize: 13, lineHeight: 1.5, marginTop: 14,
          color: testResult.type === 'ok' ? c.success : testResult.type === 'warn' ? c.warn : c.danger,
        }}>
          {testResult.type === 'ok' ? '✓ ' : testResult.type === 'warn' ? '⚠ ' : '✕ '}{testResult.message}
        </div>
      )}
    </div>
  );
}
