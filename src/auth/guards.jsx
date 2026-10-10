import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './session.jsx';
import EmptyState from '../components/EmptyState.jsx';

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
    <div className="max-w-xl mx-auto">
      <EmptyState
        title="Officer access unavailable"
        body="This deployment is not connected to the municipal server, so officer sign-in is disabled. Citizens can keep using reporting and tracking."
      />
    </div>
  );
}

export default function RequireOfficer() {
  const { configured, ready, isOfficer } = useAuth();
  const location = useLocation();

  if (!configured) return <NotConfigured />;
  if (!ready) return <CheckingState />;
  if (!isOfficer) {
    return <Navigate to="/officer/login" state={{ from: location.pathname }} replace />;
  }
  return null;
}

export function RequireAdmin() {
  const { configured, ready, isOfficer, isAdmin } = useAuth();
  const location = useLocation();

  if (!configured) return <NotConfigured />;
  if (!ready) return <CheckingState />;
  if (!isOfficer) {
    return <Navigate to="/officer/login" state={{ from: location.pathname }} replace />;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto">
        <EmptyState
          title="Administrator access required"
          body="Ward directory and account management is limited to administrator accounts. Your officer account does not have this permission."
        />
      </div>
    );
  }
  return null;
}
