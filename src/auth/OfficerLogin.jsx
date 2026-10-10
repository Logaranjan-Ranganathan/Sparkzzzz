import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from './session.jsx';
import { friendlyAuthError } from './authMessages.js';
import EmptyState from '../components/EmptyState.jsx';
import { pathForTab } from '../routes.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CheckingState() {
  return (
    <div className="auth-wrap" aria-live="polite">
      <div className="card card-pad">
        <div className="skel" style={{ width: '40%', marginBottom: 12 }} />
        <div className="skel" style={{ width: '68%' }} />
      </div>
    </div>
  );
}

export default function OfficerLogin() {
  const { configured, ready, user, profile, isOfficer, signIn, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = location.state?.from || pathForTab('dashboard');
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!configured) {
    return (
      <div className="max-w-xl mx-auto">
        <EmptyState
          title="Officer access unavailable"
          body="This deployment is not connected to the municipal server, so officer sign-in is disabled. Citizens can keep using reporting and tracking."
        />
      </div>
    );
  }

  if (!ready) return <CheckingState />;

  // Officer accounts are administrator-provisioned; role always comes from the
  // database profile, never from this page.
  if (user && isOfficer) return <Navigate to={from} replace />;

  if (user && !isOfficer) {
    return (
      <div className="auth-wrap">
        <div className="card card-pad">
          <div className="auth-head">
            <div className="auth-icon">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2>Officer access is provisioned by administrators</h2>
              <p>
                {profile?.full_name || user.email} is a citizen account. Officer access is granted by a municipal
                administrator from the database — it cannot be enabled from this page.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ghost-btn" onClick={() => signOut()}>
              Sign out to use an officer account
            </button>
            <button type="button" className="primary-btn" onClick={() => navigate(pathForTab('home'))}>
              Go to Citizen Portal
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(form.email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!form.password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    try {
      // On success the auth state updates and this page re-renders: officers
      // are forwarded to their dashboard, citizen accounts see the notice
      // above. Authorization itself is enforced in the database.
      await signIn({ email: form.email.trim(), password: form.password });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card card-pad">
        <div className="auth-head">
          <div className="auth-icon">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2>Officer sign-in</h2>
            <p>
              Municipal staff only. Accounts are provisioned by an administrator — there is no self-registration for
              officer access.
            </p>
          </div>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <label className="field-label" htmlFor="officer-email">
              Work email
            </label>
            <input
              id="officer-email"
              className="field-control"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="officer@municipality.example"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="officer-password">
              Password
            </label>
            <input
              id="officer-password"
              className="field-control"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </div>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in as officer'}
          </button>
          <p className="auth-note">
            Ward scope is set by the administrator for each officer account. A signed-in officer only sees complaints in
            their assigned ward.
          </p>
          <p className="auth-switch">
            Citizen?{' '}
            <button type="button" className="link-btn" onClick={() => navigate(pathForTab('login'))}>
              Use the citizen sign-in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
