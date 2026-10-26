import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SignIn } from './components/SignIn';
import { ShiftView } from './components/ShiftView';
import { ProfileView } from './components/ProfileView';
import { createDemoAdapter, EMPTY, openSSO, runtimeAdapter, type Command, type Snapshot, type TrackerAdapter } from './lib/tracker';
export function App() {
  const [demo,setDemo]=useState(new URLSearchParams(location.search).get('demo')==='1');
  const adapter=useRef<TrackerAdapter>(demo?createDemoAdapter():runtimeAdapter);
  const [snapshot,setSnapshot]=useState<Snapshot>(EMPTY);const [tab,setTab]=useState<'shift'|'profile'>('shift');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [confirm,setConfirm]=useState<'checkout'|'logout'|null>(null);const [now,setNow]=useState(Date.now());
  const busyRef=useRef(false);
  useEffect(()=>{let active=true;adapter.current=demo?createDemoAdapter():runtimeAdapter;
    const refresh=()=>{if(!busyRef.current)void adapter.current.execute('GET_SNAPSHOT').then(s=>{if(active)setSnapshot(s);}).catch(()=>{if(active)setSnapshot(s=>({...s,connection:'unavailable',shift:s.shift?{...s.shift,status:s.shift.status==='active'?'away':s.shift.status}:null}));});};refresh();
    const interval=setInterval(()=>{setNow(Date.now());},1000);const poll=setInterval(refresh,5000);return()=>{active=false;clearInterval(interval);clearInterval(poll);};},[demo]);
  async function command(c:Command) {if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');
    try {if(c==='CHECK_IN'&&!demo){const allowed=await chrome.permissions.request({origins:['<all_urls>']});if(!allowed)throw Error('Tracking permissions were not granted');}setSnapshot(await adapter.current.execute(c));setNow(Date.now());setConfirm(null);if(c==='LOG_OUT')setTab('shift');}
    catch {setError('The action could not be confirmed. Reconnect to sync its result before trying another action.');}
    finally{busyRef.current=false;setBusy(false);}}
  async function signIn() {setBusy(true);setError('');try{await openSSO();setSnapshot(await adapter.current.execute('GET_SNAPSHOT'));setMessage('Signed in to Branta Tracker.');}catch{setError('Branta SSO did not complete. Check the Console callback setup and try again.');}finally{setBusy(false);}}
  async function openPanel(){try{if(!globalThis.chrome?.sidePanel)throw new Error();const win=await chrome.windows.getCurrent();if(win.id===undefined)throw new Error();await chrome.sidePanel.open({windowId:win.id});window.close();}catch{setError('Open the extension in Chrome to use the side panel.');}}
  return <div className="app-shell"><header className="header"><img className="wordmark" src="assets/branta-logo.png" alt="Branta"/><span className="header-divider"/><span className="product-name">Time tracker</span>{!location.pathname.includes('sidepanel')&&<button className="icon-button" aria-label="Open side panel" title="Open side panel" onClick={()=>void openPanel()}>◧</button>}</header>
    {demo&&<div className="demo-banner"><span>UI preview · sample data · no tracking</span><button onClick={()=>{setDemo(false);setSnapshot(EMPTY);setMessage('');}}>Exit preview</button></div>}
    {snapshot.employee&&<nav aria-label="Tracker navigation"><button aria-current={tab==='shift'?'page':undefined} onClick={()=>setTab('shift')}>My shift</button><button aria-current={tab==='profile'?'page':undefined} onClick={()=>setTab('profile')}>Profile & settings</button></nav>}
    <main>{error&&<div className="notice error" role="alert">{error}</div>}{message&&<div className="notice" role="status">{message}</div>}{snapshot.notice&&<div className="notice" role="status">{snapshot.notice}</div>}
    {!snapshot.employee?<SignIn busy={busy} onSignIn={()=>void signIn()} onDemo={()=>{setDemo(true);setMessage('');setError('');}}/>:tab==='shift'?<ShiftView snapshot={snapshot} now={now} busy={busy} onCommand={c=>void command(c)} onCheckOut={()=>setConfirm('checkout')}/>:<ProfileView employee={snapshot.employee} busy={busy} onLogout={()=>setConfirm('logout')}/>}</main>
    <footer><span><i className={`dot ${snapshot.connection}`}/>{demo?'Preview environment':snapshot.connection==='connected'?'Workspace connected':'Branta Console'}</span><span className="mono">v0.4.0</span></footer>
    {confirm&&<ConfirmDialog title={confirm==='checkout'?'Check out of your shift?':'Disconnect your account?'} description={confirm==='checkout'?'This ends the current shift. Review your tracked time before checking out.':'You will need to sign in again. Logging out does not automatically check you out of an active shift.'} confirmLabel={confirm==='checkout'?'Check Out':'Log Out'} busy={busy} onClose={()=>setConfirm(null)} onConfirm={()=>void command(confirm==='checkout'?'CHECK_OUT':'LOG_OUT')}/>}</div>;
}
