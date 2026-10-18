import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Building2,
  UserCheck,
  ArrowRight,
  Lock,
  CheckCircle2,
  MapPin,
  FileText,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAuth } from './session.jsx';
import { pathForTab } from '../routes.js';

export default function AuthPortal() {
  const navigate = useNavigate();
  const { user, profile, isOfficer, isAdmin, signOut } = useAuth();

  if (user) {
    const roleTitle = isAdmin ? 'Administrator' : isOfficer ? 'Municipal Officer' : 'Public Citizen';
    return (
      <div className="portal-container">
        <div className="portal-card max-w-xl mx-auto text-center py-10 px-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            You are currently signed in
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-1">
            <strong>{profile?.full_name || user.email}</strong>
          </p>
          <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mb-6">
            {roleTitle}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {isOfficer ? (
              <button
                type="button"
                className="primary-btn w-full sm:w-auto"
                onClick={() => navigate(pathForTab('dashboard'))}
              >
                Go to Officer Dashboard
              </button>
            ) : (
              <button
                type="button"
                className="primary-btn w-full sm:w-auto"
                onClick={() => navigate(pathForTab('citizenDashboard'))}
              >
                Go to Citizen Dashboard
              </button>
            )}
            <button
              type="button"
              className="ghost-btn w-full sm:w-auto"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-layout min-h-[calc(100vh-140px)] flex flex-col justify-center py-10 px-4 sm:px-6">
      {/* Header Branding */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Civic Technology Management Platform</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          UrbanGrid Access Portal
        </h1>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          Select your portal to continue. Citizens can report and follow grievances; authorized municipal officers manage ward dispatches.
        </p>
      </div>

      {/* Two Portal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
        {/* Card 1: Citizen Portal */}
        <div className="portal-choice-card group relative bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-800 p-8 shadow-sm hover:shadow-xl hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-200 flex flex-col justify-between">
          <div className="absolute top-5 right-5">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900">
              Public Access
            </span>
          </div>

          <div>
            <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <UserCheck className="w-7 h-7" />
            </div>

            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Citizen Portal
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              For residents reporting neighborhood civic issues, tracking resolution progress, and verifying completed municipal work.
            </p>

            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 mb-8">
              <li className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Submit road, water, drainage, streetlight & garbage issues</span>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Real-time SLA resolution countdown & progress stages</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Cluster duplicate reports (One civic problem = One ticket)</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              className="w-full primary-btn justify-center py-3 text-sm font-semibold rounded-xl"
              onClick={() => navigate(pathForTab('login'))}
            >
              Sign In as Citizen <ArrowRight className="w-4 h-4 ml-1" />
            </button>
            <button
              type="button"
              className="w-full ghost-btn justify-center py-2.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800"
              onClick={() => navigate(pathForTab('register'))}
            >
              Create New Citizen Account
            </button>
          </div>
        </div>

        {/* Card 2: Officer Portal */}
        <div className="portal-choice-card group relative bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-800 p-8 shadow-sm hover:shadow-xl hover:border-amber-500 dark:hover:border-amber-500 transition-all duration-200 flex flex-col justify-between">
          <div className="absolute top-5 right-5">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Staff Only
            </span>
          </div>

          <div>
            <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <Building2 className="w-7 h-7" />
            </div>

            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Municipal Officer
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              For ward officers, zone supervisors, and departmental teams to inspect issues, dispatch field crews, and record resolutions.
            </p>

            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 mb-8">
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Ward-scoped ticket dispatch and status updating</span>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Overdue escalation alerts & SLA tracking</span>
              </li>
              <li className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Inspection reports, audit logging & resolution evidence</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              className="w-full bg-slate-900 dark:bg-amber-600 text-white hover:bg-slate-800 dark:hover:bg-amber-700 py-3 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
              onClick={() => navigate(pathForTab('officerLogin'))}
            >
              Sign In as Officer <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 justify-center text-xs text-slate-500 dark:text-slate-400 py-1">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>Officer accounts are provisioned by administrators</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-12 text-center text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
        <p>UrbanGrid Secure Authentication · Enforced by Supabase Row Level Security (RLS)</p>
      </div>
    </div>
  );
}
