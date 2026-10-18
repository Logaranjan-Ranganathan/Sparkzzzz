import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  ShieldAlert,
  Layers,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import EmptyState from './EmptyState.jsx';
import TicketTimeline from './TicketTimeline.jsx';
import Satisfaction from './Satisfaction.jsx';
import { displayTicketId, priorityBand, slaMeta } from '../civicEngine.js';
import { locationLine } from '../location/locationService.js';
import { pathForTab } from '../routes.js';

const STATUS_CLASSES = {
  Open: 'badge-urgent',
  'Under Review': 'badge-pending',
  Assigned: 'badge-info',
  'In Progress': 'badge-pending',
  Resolved: 'badge-ok',
};

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function PublicDashboard({
  user,
  profile,
  tickets = [],
  civicSettings,
  onFeedback,
  offlineQueueCount = 0,
  onSyncNow,
  syncing = false,
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [trackerInput, setTrackerInput] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);

  const citizenName = profile?.full_name || user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : 'Citizen');

  // Filter complaints belonging to this user or filed from this browser session
  const userTickets = useMemo(() => {
    let list = tickets;
    if (user?.id) {
      // Show user's complaints or complaints associated with their session
      list = tickets.filter((t) => t.user_id === user.id || !t.user_id);
    }
    return list;
  }, [tickets, user]);

  const stats = useMemo(() => {
    const total = userTickets.length;
    const active = userTickets.filter((t) => t.status !== 'Resolved').length;
    const resolved = userTickets.filter((t) => t.status === 'Resolved').length;
    const pendingSync = userTickets.filter((t) => t.sync_status === 'pending_sync').length + offlineQueueCount;
    return { total, active, resolved, pendingSync };
  }, [userTickets, offlineQueueCount]);

  const filteredTickets = useMemo(() => {
    return userTickets
      .filter((t) => {
        if (filter === 'Active') return t.status !== 'Resolved';
        if (filter === 'Resolved') return t.status === 'Resolved';
        if (filter === 'Pending Sync') return t.sync_status === 'pending_sync';
        return true;
      })
      .filter((t) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          displayTicketId(t).toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q) ||
          (t.ward_id || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sort === 'oldest') {
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        }
        if (sort === 'priority') {
          return (b.priority_score || 1) - (a.priority_score || 1);
        }
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [userTickets, filter, searchQuery, sort]);

  const handleTrackSubmit = (e) => {
    e.preventDefault();
    const q = trackerInput.trim();
    if (!q) return;
    navigate(pathForTab('tracker', q));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-900 dark:to-slate-950 text-white p-6 sm:p-8 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-3 border border-blue-400/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Public Citizen Dashboard</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {citizenName}!
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-xl">
              Track your reported civic issues, monitor real-time municipal resolution progress, and verify completed field work.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="primary-btn bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
              onClick={() => navigate(pathForTab('report'))}
            >
              <FileText className="w-4 h-4" />
              <span>Report a New Issue</span>
            </button>
            <button
              type="button"
              className="ghost-btn border border-white/20 text-white hover:bg-white/10 rounded-xl px-4 py-2.5"
              onClick={() => navigate(pathForTab('wardmap'))}
            >
              <Layers className="w-4 h-4" />
              <span>View City Map</span>
            </button>
          </div>
        </div>
      </div>

      {/* Offline Sync Banner if pending items */}
      {(stats.pendingSync > 0 || offlineQueueCount > 0) && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong>{stats.pendingSync} pending offline item(s) awaiting server synchronization.</strong>
              <div className="text-xs text-amber-700/80 dark:text-amber-400/80">
                Queued locally to protect your data. Will synchronize automatically when connected.
              </div>
            </div>
          </div>
          {onSyncNow && (
            <button
              type="button"
              className="ghost-btn bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 py-1.5 px-3 rounded-lg text-xs font-semibold shrink-0"
              onClick={onSyncNow}
              disabled={syncing}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card card-pad flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Reports
          </span>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white my-1">
            {stats.total}
          </div>
          <span className="text-xs text-slate-500">Submitted by your account</span>
        </div>

        <div className="card card-pad flex flex-col justify-between">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            Active Issues
          </span>
          <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 my-1">
            {stats.active}
          </div>
          <span className="text-xs text-slate-500">Under municipal review or in progress</span>
        </div>

        <div className="card card-pad flex flex-col justify-between">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Resolved
          </span>
          <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 my-1">
            {stats.resolved}
          </div>
          <span className="text-xs text-slate-500">Successfully closed & verified</span>
        </div>

        <div className="card card-pad flex flex-col justify-between">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Pending Sync
          </span>
          <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 my-1">
            {stats.pendingSync}
          </div>
          <span className="text-xs text-slate-500">Stored safely in local queue</span>
        </div>
      </div>

      {/* Complaint Tracker Search Box */}
      <div className="card card-pad">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Track Any Complaint
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enter your complaint reference number to view real-time SLA deadlines and field crew status.
            </p>
          </div>
          <form onSubmit={handleTrackSubmit} className="flex gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="e.g. UG-2026-00101"
              value={trackerInput}
              onChange={(e) => setTrackerInput(e.target.value)}
              className="field-control text-sm w-full sm:w-64"
              aria-label="Complaint ID to track"
            />
            <button type="submit" className="primary-btn whitespace-nowrap px-4 text-sm font-semibold">
              <Search className="w-4 h-4" />
              <span>Track</span>
            </button>
          </form>
        </div>
      </div>

      {/* My Complaints Section */}
      <div className="card card-pad space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              My Complaints History
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Search and review your filed civic issues and their resolution timelines.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter complaints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 w-36 sm:w-48 text-slate-800 dark:text-slate-200"
                aria-label="Filter my complaints"
              />
            </div>

            <div className="seg" role="tablist">
              {['All', 'Active', 'Resolved'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={filter === f ? 'is-on' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
              {stats.pendingSync > 0 && (
                <button
                  type="button"
                  className={filter === 'Pending Sync' ? 'is-on' : ''}
                  onClick={() => setFilter('Pending Sync')}
                >
                  Pending Sync ({stats.pendingSync})
                </button>
              )}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-white dark:bg-slate-900"
              aria-label="Sort complaints"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="priority">Highest Priority</option>
            </select>
          </div>
        </div>

        {/* Complaints List */}
        {filteredTickets.length === 0 ? (
          <EmptyState
            title="No complaints found"
            body={
              searchQuery
                ? `No complaints match "${searchQuery}". Try a different search term.`
                : 'You have not submitted any complaints matching this filter yet.'
            }
            action={
              <button
                type="button"
                className="primary-btn mt-4"
                onClick={() => navigate(pathForTab('report'))}
              >
                <FileText className="w-4 h-4 mr-1.5" /> Report a Civic Issue
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((t) => {
              const band = priorityBand(t.priority_score, t.status);
              const sla = slaMeta(t, civicSettings);
              const isPendingSync = t.sync_status === 'pending_sync';

              return (
                <div
                  key={t.id}
                  className="ticket-card p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 transition-all bg-white dark:bg-slate-900/60 shadow-xs"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {t.image_url ? (
                        <img
                          src={t.image_url}
                          alt="Evidence"
                          className="w-16 h-16 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-400">
                          <FileText className="w-6 h-6" />
                        </div>
                      )}

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                            {displayTicketId(t)}
                          </span>
                          <span className={`badge ${STATUS_CLASSES[t.status] || 'badge-pending'}`}>
                            {t.status}
                          </span>
                          {isPendingSync ? (
                            <span className="badge badge-pending flex items-center gap-1 text-[11px]">
                              <Clock className="w-3 h-3" /> Pending Sync
                            </span>
                          ) : (
                            <span className="badge badge-ok flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="w-3 h-3" /> Synced with Server
                            </span>
                          )}
                          <span className="text-xs text-slate-500 font-medium">
                            · {t.category} ({band.label} priority)
                          </span>
                        </div>

                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1 line-clamp-2">
                          {t.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {locationLine(t)} {t.ward_id ? `(${t.ward_id})` : ''}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatDate(t.created_at)}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {t.report_count || 1} citizen{t.report_count === 1 ? '' : 's'} reported
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex md:flex-col items-center md:items-end justify-between gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                      <div className="text-right">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                          SLA Status
                        </span>
                        <span className={`text-xs font-bold ${sla.tone === 'overdue' ? 'text-red-600' : sla.tone === 'due-soon' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {sla.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="ghost-btn text-xs py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700"
                          onClick={() => setSelectedTicket(t)}
                        >
                          View Details & Timeline
                        </button>
                        <button
                          type="button"
                          className="primary-btn text-xs py-1.5 px-3 rounded-lg"
                          onClick={() => navigate(pathForTab('tracker', t.id))}
                        >
                          Track <ExternalLink className="w-3 h-3 ml-1" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Resolution Note if resolved */}
                  {t.status === 'Resolved' && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Resolution note from Municipal Team:
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Resolved {formatDate(t.resolved_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                        {t.resolution_note || 'Issue resolved by field unit.'}
                      </p>
                      {t.after_photo_url && (
                        <div className="mt-2">
                          <span className="text-[11px] text-slate-500 font-medium">After repair proof:</span>
                          <img
                            src={t.after_photo_url}
                            alt="Resolution Evidence"
                            className="mt-1 h-20 rounded-md object-cover border border-slate-200 dark:border-slate-700"
                          />
                        </div>
                      )}
                      {onFeedback && (
                        <div className="mt-3 pt-2 border-t border-emerald-100 dark:border-emerald-900/40">
                          <Satisfaction ticket={t} onFeedback={(fb) => onFeedback(t.id, fb)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ticket Details & Timeline Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
              <div>
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                  {displayTicketId(selectedTicket)}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {selectedTicket.category} Complaint
                </h3>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 text-xl"
                onClick={() => setSelectedTicket(null)}
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Description
                </h4>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                  {selectedTicket.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-500 block">Location</span>
                  <strong className="text-slate-900 dark:text-white">{locationLine(selectedTicket)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Ward</span>
                  <strong className="text-slate-900 dark:text-white">{selectedTicket.ward_id || 'Unassigned'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Current Status</span>
                  <span className={`badge ${STATUS_CLASSES[selectedTicket.status] || 'badge-pending'} mt-0.5 inline-block`}>
                    {selectedTicket.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Assigned Officer</span>
                  <strong className="text-slate-900 dark:text-white">{selectedTicket.assigned_officer || 'Ward Field Unit'}</strong>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Official Progress Timeline
                </h4>
                <TicketTimeline ticket={selectedTicket} settings={civicSettings} />
              </div>

              {selectedTicket.status === 'Resolved' && (
                <div className="pt-2">
                  <Satisfaction ticket={selectedTicket} onFeedback={(fb) => onFeedback(selectedTicket.id, fb)} />
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                className="primary-btn"
                onClick={() => setSelectedTicket(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
