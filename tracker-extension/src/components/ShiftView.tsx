import { formatMinutes, overtimeMinutes, punctuality } from '../lib/schedule';
import { elapsed, formatDuration, type Snapshot, type Command } from '../lib/tracker';
const time = (v: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka', hour12: true }).format(v);
export function ShiftView({ snapshot, now, busy, onCommand, onCheckOut }: { snapshot: Snapshot; now: number; busy: boolean; onCommand: (c: Command) => void; onCheckOut: () => void }) {
  const shift = snapshot.shift; const times = elapsed(shift, now);
  const status = shift?.status ?? 'completed';
  const labels = { active: 'Active', away: 'Away', break: 'On Break', completed: 'Checked Out' };
  const extraWork = times.work - (shift?.workedSeconds ?? 0); const extraBreak = times.breakTime - (shift?.breakSeconds ?? 0);
  const breakUsed = snapshot.todayBreakSeconds + extraBreak; const breakPct = Math.min(100, snapshot.breakLimitSeconds ? breakUsed / snapshot.breakLimitSeconds * 100 : 0);
  const plan = snapshot.plan ?? null; const punct = shift && plan ? punctuality(plan, shift.checkedInAt) : null;
  const ot = shift && plan && status !== 'completed' ? overtimeMinutes(plan, now) : 0;
  const paused = status === 'break' || status === 'away'; const open = !!shift && status !== 'completed';
  return <>
    <section className={`hero ${status}`} aria-label="Current Shift">
      <div className="hero-top"><span className="hero-title">{shift?.name ?? 'No Active Shift'}</span><span className={`badge ${shift ? status : 'none'}`}><i />{shift ? labels[status] : 'Not Checked In'}</span></div>
      <div className="timer" role="timer" aria-label="Time worked">{formatDuration(times.work)}</div>
      <p className="timer-caption">{status === 'break' ? 'Work timer paused during your break' : status === 'away' ? 'Work timer paused while away' : status === 'completed' ? 'Your tracked work time' : 'Time worked this Shift'}</p>
      <div className="hero-meta"><span>Checked In <strong>{shift ? time(shift.checkedInAt) : '—'}</strong></span><span>Scheduled <strong>{plan ? plan.label : 'Not set'}</strong></span><span>Break <strong>{plan ? formatMinutes(plan.breakMinutes) : '—'}</strong></span></div>
      {shift && plan && <div className="chips">
        {punct && <span className={`chip ${punct.kind}`}>{punct.kind === 'late' ? `${formatMinutes(punct.minutes)} Late` : punct.kind === 'early' ? `${formatMinutes(punct.minutes)} Early` : 'On Time'}</span>}
        {ot > 0 && <span className="chip ot">+{formatMinutes(ot)} Overtime</span>}
      </div>}
    </section>
    {open ? <div className="controls">
      <button className={paused ? 'btn-resume' : 'btn-break'} disabled={busy} onClick={() => onCommand(paused ? 'RESUME' : 'TAKE_BREAK')}><span className="ico" aria-hidden="true">{paused ? '▶' : '❚❚'}</span>{paused ? 'Resume' : 'Take Break'}</button>
      <button className="btn-checkout" disabled={busy} onClick={onCheckOut}><span className="ico" aria-hidden="true">■</span>Check Out</button>
    </div> : <button className="full btn-brand big checkin" disabled={busy || snapshot.connection !== 'connected'} onClick={() => onCommand('CHECK_IN')}><span className="ico" aria-hidden="true">▶</span>Check In & Start Shift</button>}
    <div className="summary-heading"><h2>Daily Summary</h2><span>Today</span></div>
    <div className="stats">
      <div className="stat work"><span>Tracked</span><strong>{formatDuration(snapshot.todayWorkedSeconds + extraWork)}</strong><small>All Shifts today</small></div>
      <div className="stat brk"><span>Break</span><strong>{formatDuration(breakUsed)}</strong><div className="bar"><b style={{ width: `${breakPct}%` }} /></div><small>of {Math.floor(snapshot.breakLimitSeconds / 60)} min</small></div>
      <div className="stat shots"><span>Screenshots</span><strong>{snapshot.screenshotsToday ?? 0}</strong><small>{snapshot.screenshotStatus ?? (snapshot.lastScreenshotAt ? `Last ${time(snapshot.lastScreenshotAt)}` : 'None yet today')}</small></div>
    </div>
    {!shift && <p className="hint">During your Shift, Branta records work and idle time, numeric click/key counts and random screenshots of your active tab. Breaks and idle time pause screenshots.</p>}
  </>;
}
