import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, MailCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from './session.jsx';
import { friendlyAuthError as friendlyError } from './authMessages.js';
import EmptyState from '../components/EmptyState.jsx';
import { pathForTab } from '../routes.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{10,15}$/;

const cleanPhone = (value) => String(value || '').replace(/[\s().-]/g, '');
const cleanEmail = (value) => String(value || '').trim();

const PanelHead = ({ icon: Icon, title, body }) => (
  <div className="auth-head">
    <div className="auth-icon">
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
    </div>
  </div>
);

function SignedInPanel() {
  const { user, profile, isOfficer, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const roleLabel = isAdmin ? 'Administrator' : isOfficer ? 'Municipal officer' : 'Citizen account';
  return (
    <div className="auth-wrap">
      <div className="card card-pad">
        <PanelHead
          icon={CheckCircle2}
          title="You are signed in"
          body={`${profile?.full_name || 'Citizen'} · ${user?.email || ''}`}
        />
        <p className="auth-note mb-4">
          {roleLabel}. Complaints filed from this browser are linked to your account so you can follow their status.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="primary-btn" onClick={() => navigate(pathForTab('citizenDashboard'))}>
            Citizen Dashboard
          </button>
          <button type="button" className="ghost-btn" onClick={() => navigate(pathForTab('reports'))}>
            My Complaints
          </button>
          {isOfficer && (
            <button type="button" className="ghost-btn" onClick={() => navigate(pathForTab('dashboard'))}>
              Officer Dashboard
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function ForgotPanel({ onBack }) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="auth-wrap">
        <div className="card card-pad">
          <PanelHead
            icon={MailCheck}
            title="Check your inbox"
            body={`If an account exists for ${cleanEmail(email)}, a password reset link is on its way. Open it to choose a new password.`}
          />
          <button type="button" className="ghost-btn" onClick={onBack}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(cleanEmail(email))) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(cleanEmail(email));
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card card-pad">
        <PanelHead icon={KeyRound} title="Reset your password" body="We email you a link to choose a new password." />
        <form className="auth-form" onSubmit={submit} noValidate>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <label className="field-label" htmlFor="forgot-email">
              Email
            </label>
            <input
              id="forgot-email"
              className="field-control"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a reset link'}
          </button>
          <p className="auth-switch">
            <button type="button" className="link-btn" onClick={onBack}>
              Back to sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordPanel({ onDone }) {
  const { updatePassword } = useAuth();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(form.password);
      onDone();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card card-pad">
        <PanelHead icon={KeyRound} title="Choose a new password" body="You followed a reset link — set a new password to continue." />
        <form className="auth-form" onSubmit={submit} noValidate>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <label className="field-label" htmlFor="reset-password">
              New password
            </label>
            <input
              id="reset-password"
              className="field-control"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="reset-confirm">
              Confirm new password
            </label>
            <input
              id="reset-confirm"
              className="field-control"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
            />
          </div>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RegisterPanel({ onSignedIn }) {
  const { signUp } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '', terms: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const navigate = useNavigate();

  if (sentTo) {
    return (
      <div className="auth-wrap">
        <div className="card card-pad">
          <PanelHead
            icon={MailCheck}
            title="Verify your email"
            body={`We sent a verification link to ${sentTo}. Open it to activate your account, then sign in.`}
          />
          <p className="auth-note mb-4">
            Until you confirm, you can still report issues from this browser as a guest — confirmed accounts simply keep your
            complaints in one place.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="primary-btn" onClick={() => navigate(pathForTab('login'))}>
              Go to sign in
            </button>
            <button type="button" className="ghost-btn" onClick={() => navigate(pathForTab('report'))}>
              Report an issue meanwhile
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    const email = cleanEmail(form.email);
    const phone = cleanPhone(form.phone);
    if (form.fullName.trim().length < 2) return setError('Enter your full name.');
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address.');
    if (!PHONE_RE.test(phone)) return setError('Enter a valid phone number (10–15 digits, +91 allowed).');
    if (form.password.length < 8) return setError('Choose a password with at least 8 characters.');
    if (form.password !== form.confirm) return setError('The two passwords do not match.');
    if (!form.terms) return setError('Please accept the terms to create an account.');
    setBusy(true);
    try {
      const data = await signUp({ email, password: form.password, fullName: form.fullName.trim(), phone });
      if (data?.session) {
        onSignedIn();
        return;
      }
      setSentTo(email);
    } catch (err) {
      setError(friendlyError(err));
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
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
            Citizen Registration
          </span>
        </div>

        <PanelHead
          icon={ShieldCheck}
          title="Create Citizen Account"
          body="Track your complaints and their resolution timeline in one place."
        />
        <form className="auth-form" onSubmit={submit} noValidate>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <label className="field-label" htmlFor="reg-name">
              Full name
            </label>
            <input
              id="reg-name"
              className="field-control"
              type="text"
              autoComplete="name"
              value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              placeholder="e.g. Priya Raman"
            />
          </div>
          <div className="auth-row">
            <div>
              <label className="field-label" htmlFor="reg-email">
                Email
              </label>
              <input
                id="reg-email"
                className="field-control"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="reg-phone">
                Phone
              </label>
              <input
                id="reg-phone"
                className="field-control"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+91 90000 00000"
              />
            </div>
          </div>
          <div className="auth-row">
            <div>
              <label className="field-label" htmlFor="reg-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  className="field-control pr-9"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="reg-confirm">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="reg-confirm"
                  className="field-control pr-9"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repeat the password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
          <label className="auth-terms" htmlFor="reg-terms">
            <input
              id="reg-terms"
              type="checkbox"
              checked={form.terms}
              onChange={(e) => setForm((p) => ({ ...p, terms: e.target.checked }))}
            />
            <span>
              I agree to the platform's terms of use and privacy policy, and I understand this is a civic-issue
              tracking service, not an emergency line.
            </span>
          </label>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="auth-switch">
            Already have an account?{' '}
            <button type="button" className="link-btn" onClick={() => navigate(pathForTab('login'))}>
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

function LoginPanel() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [forgot, setForgot] = useState(false);

  if (forgot) return <ForgotPanel onBack={() => setForgot(false)} />;

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(cleanEmail(form.email))) return setError('Enter a valid email address.');
    if (!form.password) return setError('Enter your password.');
    setBusy(true);
    try {
      await signIn({ email: cleanEmail(form.email), password: form.password });
      navigate(pathForTab('citizenDashboard'));
    } catch (err) {
      setError(friendlyError(err));
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
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
            Citizen Access
          </span>
        </div>

        <PanelHead icon={KeyRound} title="Citizen Sign In" body="Access your civic complaints, track resolution timelines, and verify completed work." />
        <form className="auth-form" onSubmit={submit} noValidate>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <label className="field-label" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              className="field-control"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="login-password">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                className="field-control pr-10"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Enter your password"
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
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In as Citizen'}
          </button>
          <p className="auth-switch">
            <button type="button" className="link-btn" onClick={() => setForgot(true)}>
              Forgot password?
            </button>
            {' · '}
            <button type="button" className="link-btn" onClick={() => navigate(pathForTab('register'))}>
              Create citizen account
            </button>
          </p>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-500">
              Municipal Officer?{' '}
              <button type="button" className="font-semibold text-amber-600 dark:text-amber-400 hover:underline" onClick={() => navigate(pathForTab('officerLogin'))}>
                Go to Officer Sign In
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CitizenAuth({ mode }) {
  const { configured, ready, user, recoveryMode } = useAuth();
  const navigate = useNavigate();
  const [resetDone, setResetDone] = useState(false);

  if (!configured) {
    return (
      <div className="max-w-xl mx-auto">
        <EmptyState
          title="Accounts unavailable"
          body="This deployment is not connected to the civic server, so sign-in and registration are disabled. You can still report and track issues."
          action={
            <button type="button" className="primary-btn mt-4" onClick={() => navigate(pathForTab('report'))}>
              Report an Issue
            </button>
          }
        />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="auth-wrap" aria-live="polite">
        <div className="card card-pad">
          <div className="skel" style={{ width: '42%', marginBottom: 12 }} />
          <div className="skel" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  if (mode === 'login' && recoveryMode && !resetDone) {
    return <ResetPasswordPanel onDone={() => setResetDone(true)} />;
  }

  if (resetDone && !recoveryMode) {
    return (
      <div className="auth-wrap">
        <div className="card card-pad">
          <PanelHead
            icon={CheckCircle2}
            title="Password updated"
            body="You can now sign in with your new password."
          />
          <button type="button" className="primary-btn" onClick={() => setResetDone(false)}>
            Continue to sign in
          </button>
        </div>
      </div>
    );
  }

  if (user) return <SignedInPanel />;

  if (mode === 'register') {
    return <RegisterPanel onSignedIn={() => navigate(pathForTab('reports'))} />;
  }
  return <LoginPanel />;
}
