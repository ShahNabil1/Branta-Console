import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SignIn } from './components/SignIn';
import { ShiftView } from './components/ShiftView';
import { ProfileView } from './components/ProfileView';
import { createDemoAdapter, EMPTY, openSSO, runtimeAdapter, type Command, type Snapshot, type TrackerAdapter } from './lib/tracker';
type Confirm = 'checkout' | 'logout' | null;
export function App() {
  // Hidden developer-only sample mode (?demo=1); there is no visible preview entry point.
  const [demo] = useState(new URLSearchParams(location.search).get('demo') === '1');
  const adapter = useRef<TrackerAdapter>(demo ? createDemoAdapter() : runtimeAdapter);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY); const [tab, setTab] = useState<'shift' | 'profile'>('shift');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null); const [now, setNow] = useState(Date.now());
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (!busyRef.current) void adapter.current.execute('GET_SNAPSHOT').then(s => { if (active) setSnapshot(s); }).catch(() => { if (active) setSnapshot(s => ({ ...s, connection: 'unavailable', shift: s.shift ? { ...s.shift, status: s.shift.status === 'active' ? 'away' : s.shift.status } : null })); }); };
    refresh();
    const interval = setInterval(() => setNow(Date.now()), 1000); const poll = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(interval); clearInterval(poll); };
  }, [demo]);
  async function command(c: Command) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try {
      const next = await adapter.current.execute(c); setSnapshot(next); setNow(Date.now()); setConfirm(null);
      if (c === 'LOG_OUT') { setTab('shift'); setMessage(''); }
      if (c === 'TAKEOVER_CONFIRM') setMessage('Signed in. Your shift continues from where it was.');
    } catch { setError('That action could not be confirmed. Check your connection and try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function signIn() {
    setBusy(true); setError('');
    try { await openSSO(); const s = await adapter.current.execute('GET_SNAPSHOT'); setSnapshot(s); if (s.employee) setMessage('Signed in to Branta Tracker.'); }
    catch { setError('Sign-in was not completed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function openPanel() { try { if (!globalThis.chrome?.sidePanel) throw new Error(); const win = await chrome.windows.getCurrent(); if (win.id === undefined) throw new Error(); await chrome.sidePanel.open({ windowId: win.id }); window.close(); } catch { setError('Open the extension in Chrome to use the side panel.'); } }
  const connected = snapshot.connection === 'connected';
  return <div className="app-shell">
    <header className="header">
      <img className="wordmark" src="assets/branta-logo.png" alt="Branta" /><span className="header-divider" /><span className="product-name">Tracker</span>
      <span className="header-right">
        {snapshot.employee && <span className={`conn-pill ${connected ? 'ok' : 'bad'}`} title={connected ? 'Connected to Branta Console' : 'Not connected to Branta Console'}><i />{connected ? 'Connected' : 'Not Connected'}</span>}
        {!location.pathname.includes('sidepanel') && <button className="icon-button" aria-label="Open side panel" title="Open side panel" onClick={() => void openPanel()}>◧</button>}
      </span>
    </header>
    {snapshot.employee && <nav aria-label="Tracker navigation"><button aria-current={tab === 'shift' ? 'page' : undefined} onClick={() => setTab('shift')}>My Shift</button><button aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setTab('profile')}>Profile & Settings</button></nav>}
    <main>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && snapshot.employee && <div className="notice ok" role="status">{message}</div>}
      {snapshot.notice && <div className={`notice ${snapshot.employee ? '' : 'error'}`} role="status">{snapshot.notice}</div>}
      {!snapshot.employee ? <SignIn busy={busy} onSignIn={() => void signIn()} /> : tab === 'shift' ? <ShiftView snapshot={snapshot} now={now} busy={busy} onCommand={c => void command(c)} onCheckOut={() => setConfirm('checkout')} /> : <ProfileView employee={snapshot.employee} connected={connected} lastSyncedAt={snapshot.lastSyncedAt} busy={busy} onLogout={() => setConfirm('logout')} />}
    </main>
    {confirm && <ConfirmDialog title={confirm === 'checkout' ? 'Check out of your Shift?' : 'Log out of Branta Tracker?'} description={confirm === 'checkout' ? 'This ends your current Shift. Review your tracked time before checking out.' : 'You will need to sign in again. Logging out does not check you out of an active Shift.'} confirmLabel={confirm === 'checkout' ? 'Check Out' : 'Log Out'} busy={busy} onClose={() => setConfirm(null)} onConfirm={() => void command(confirm === 'checkout' ? 'CHECK_OUT' : 'LOG_OUT')} />}
    {snapshot.pendingTakeover && <ConfirmDialog tone="brand" title="Already signed in on another browser" description="Your Branta Tracker account is active in another browser right now. If you continue here, that browser will be signed out automatically and your current Shift will keep running here without resetting." confirmLabel="Continue Here" cancelLabel="Cancel" busy={busy} onClose={() => void command('TAKEOVER_CANCEL')} onConfirm={() => void command('TAKEOVER_CONFIRM')} />}
  </div>;
}
