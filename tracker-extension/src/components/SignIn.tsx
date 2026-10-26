export function SignIn({ busy, onSignIn }: { busy: boolean; onSignIn: () => void }) {
  return <section className="signin">
    <div className="signin-mark"><img src="assets/brand-icon.png" alt="" /></div>
    <span className="eyebrow brand">BRANTA TRACKER</span>
    <h1>Your workday,<br /><span className="accent">tracked right.</span></h1>
    <p>Sign in with your Branta Console account to start your Shift, manage breaks and keep your working hours accurately recorded.</p>
    <div className="panel signin-card">
      <h2>Employee Sign-In</h2>
      <p>Use your @brantatech.com account. Two-factor verification applies.</p>
      <button className="full btn-brand big" disabled={busy} onClick={onSignIn}>{busy ? <><span className="spinner" aria-hidden="true" />Opening Branta Console…</> : <>Sign in with Branta Console <span aria-hidden="true">→</span></>}</button>
      <span className="secure"><span aria-hidden="true">🔒</span> Secured by Branta Console · console.brantatech.com</span>
    </div>
    <p className="signin-note">© Branta Tech · For authorized employees only</p>
  </section>;
}
