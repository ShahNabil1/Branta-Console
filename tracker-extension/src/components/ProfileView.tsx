import { useState } from 'react';
import type { Employee } from '../lib/tracker';
export function ProfileView({ employee, connected, lastSyncedAt, onLogout, busy }: { employee: Employee; connected: boolean; lastSyncedAt: number | null; onLogout: () => void; busy: boolean }) {
  const [broken, setBroken] = useState(false);
  const initials = employee.name.split(' ').filter(Boolean).map(v => v[0]).slice(0, 2).join('').toUpperCase();
  const synced = lastSyncedAt ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka', hour12: true }).format(lastSyncedAt) : 'Not synced';
  return <>
    <section className="panel profile-card">
      <div className="profile-cover" />
      <div className="avatar-wrap">{employee.avatar && !broken ? <img className="avatar-img" src={employee.avatar} alt={employee.name} onError={() => setBroken(true)} /> : <div className="avatar">{initials}</div>}<i className={`presence ${connected ? 'ok' : 'bad'}`} /></div>
      <h2>{employee.name}</h2><span className="role-chip">{employee.role}</span>
      <dl>
        <div><dt>Branta Email</dt><dd>{employee.email}</dd></div>
        <div><dt>Employee Code</dt><dd className="mono">{employee.code}</dd></div>
        <div><dt>Workspace</dt><dd>Branta Tech</dd></div>
        <div><dt>Console</dt><dd className={connected ? 'ok-text' : 'bad-text'}>{connected ? `Connected · ${synced}` : 'Not Connected'}</dd></div>
        <div><dt>Version</dt><dd className="mono">0.6.0</dd></div>
      </dl>
    </section>
    <button className="full btn-danger" style={{ marginTop: 12 }} disabled={busy} onClick={onLogout}>Log Out</button>
  </>;
}
