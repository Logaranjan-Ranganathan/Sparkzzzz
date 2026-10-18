import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './session.jsx';
import { ShieldAlert } from 'lucide-react';
import EmptyState from '../components/EmptyState.jsx';
import { pathForTab } from '../routes.js';

// Guard UX only. Real authorization is enforced by Supabase Row Level
// Security policies and database triggers — never by these components.

function CheckingState() {
  return (
    <div className="card card-pad mb-4" aria-live="polite">
      <div className="skel" style={{ width: '38%', marginBottom: 12 }} />
      <div className="skel" style={{ width: '66%' }} />
      <p className="text-xs text-slate-500 mt-3">Checking your officer session…</p>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="max-w-xl mx-auto py-8">
      <EmptyState
        title="Officer access unavailable"
        body="This deployment is not connected to the municipal server, so officer sign-in is disabled. Citizens can keep using reporting and tracking."
      />
    </div>
  );
}

export default function RequireOfficer() {
  const { configured, ready, user, isOfficer, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!configured) return <NotConfigured />;
  if (!ready) return <CheckingState />;

  // 1. Unauthenticated -> redirect to officer login
  if (!user) {
    return <Navigate to="/officer/login" state={{ from: location.pathname }} replace />;
  }

  // 2. Authenticated, but citizen -> access denied, redirect/provide escape
  if (!isOfficer) {
    return (
      <div className="max-w-xl mx-auto py-8 px-4">
        <div className="card card-pad text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Restricted Officer Route
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            You are signed in with a <strong>Citizen Account</strong> ({user.email}). Municipal officer tools and ward dispatch are restricted to authorized personnel.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              className="primary-btn w-full sm:w-auto"
              onClick={() => navigate(pathForTab('citizenDashboard'))}
            >
              Go to Citizen Dashboard
            </button>
            <button
              type="button"
              className="ghost-btn w-full sm:w-auto"
              onClick={() => signOut()}
            >
              Sign out to change accounts
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export function RequireAdmin() {
  const { configured, ready, user, isOfficer, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!configured) return <NotConfigured />;
  if (!ready) return <CheckingState />;

  if (!user) {
    return <Navigate to="/officer/login" state={{ from: location.pathname }} replace />;
  }

  if (!isOfficer) {
    return <RequireOfficer />;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto py-8 px-4">
        <div className="card card-pad text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Administrator Access Required
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            Ward directory and officer provisioning is restricted to municipal administrators. Your officer account does not have this permission.
          </p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => navigate(pathForTab('dashboard'))}
          >
            Back to Officer Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}

