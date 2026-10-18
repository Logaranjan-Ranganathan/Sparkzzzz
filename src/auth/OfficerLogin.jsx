import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
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
            <div className="auth-icon bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2>Officer access is administrator-provisioned</h2>
              <p>
                <strong>{profile?.full_name || user.email}</strong> is a citizen account. Municipal officer access is restricted to authorized personnel and configured directly in the database.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" className="primary-btn" onClick={() => navigate(pathForTab('citizenDashboard'))}>
              Go to Citizen Dashboard
            </button>
            <button type="button" className="ghost-btn" onClick={() => signOut()}>
              Sign out to use an officer account
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
      setError('Enter a valid officer email address.');
      return;
    }
    if (!form.password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    try {
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
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
            onClick={() => navigate(pathForTab('portal'))}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Portal selection
          </button>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
            Municipal Staff
          </span>
        </div>

        <div className="auth-head">
          <div className="auth-icon bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2>Municipal Officer Sign In</h2>
            <p>
              Authorized municipal staff only. Accounts are provisioned by an administrator with ward-level dispatch scopes.
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
              Official Work Email
            </label>
            <input
              id="officer-email"
              className="field-control"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="officer@municipality.gov"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="officer-password">
              Password
            </label>
            <div className="relative">
              <input
                id="officer-password"
                className="field-control pr-10"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Enter officer password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" className="primary-btn bg-slate-900 hover:bg-slate-800 dark:bg-amber-600 dark:hover:bg-amber-700" disabled={busy}>
            {busy ? 'Verifying officer credentials…' : 'Sign In as Officer'}
          </button>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
            <strong>Security Notice:</strong> Role and ward authorization are enforced by Supabase Row Level Security. Public registration does not grant officer privileges.
          </div>
          <p className="auth-switch">
            Public citizen?{' '}
            <button type="button" className="link-btn font-semibold text-blue-600 dark:text-blue-400" onClick={() => navigate(pathForTab('login'))}>
              Go to Citizen Portal
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

