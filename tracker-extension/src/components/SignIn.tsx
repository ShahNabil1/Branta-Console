export function SignIn({ busy, onSignIn }: { busy: boolean; onSignIn: () => void }) {
  return <section className="signin">
    <div className="signin-mark"><img src="assets/brand-icon.png" alt="" /></div>
    <span className="eyebrow brand">BRANTA TRACKER</span>
    <h1>Your workday,<br /><span className="accent">tracked right.</span></h1>
    <p>Check in to your Shift, take breaks and see your progress — all in one place.</p>
    <div className="panel signin-card">
      <button className="full btn-brand big" disabled={busy} onClick={onSignIn}>{busy ? <><span className="spinner" aria-hidden="true" />Opening Branta Console…</> : <>Sign in with Branta Console <span aria-hidden="true">→</span></>}</button>
    </div>
    <p className="signin-note">© Branta Tech</p>
  </section>;
}
