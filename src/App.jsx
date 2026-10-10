import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabase/client.js';
import { useAuth } from './auth/session.jsx';
import RequireOfficer, { RequireAdmin } from './auth/guards.jsx';
import CitizenAuth from './auth/AuthScreens.jsx';
import OfficerLogin from './auth/OfficerLogin.jsx';
import EmptyState from './components/EmptyState.jsx';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  FileText,
  Filter,
  Flame,
  Home,
  ImageOff,
  Inbox,
  LayoutDashboard,
  Layers,
  Lightbulb,
  LocateFixed,
  MapPin,
  MoreHorizontal,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Upload,
  User,
  Waves,
} from 'lucide-react';
import './App.css';
import LocationPicker from './location/LocationPicker.jsx';
import IssueCityMap from './location/IssueCityMap.jsx';
import WardSelector from './components/WardSelector.jsx';
import WardHeatmap from './components/WardHeatmap.jsx';
import PublicWardMap from './components/PublicWardMap.jsx';
import WardPerformance from './components/WardPerformance.jsx';
import WardComparison from './components/WardComparison.jsx';
import AdminLocations from './components/AdminLocations.jsx';
import TicketTimeline from './components/TicketTimeline.jsx';
import Satisfaction from './components/Satisfaction.jsx';
import { matchRoute, pathForTab, OFFICER_TABS } from './routes.js';
import { recommendOfficer } from './officers.js';
import { wardStats, maintenanceAlerts } from './analytics/wardAnalytics.js';
import { CITY } from './location/chennaiPlaces.js';
import {
  buildLocation,
  locationHierarchy,
  locationLine,
  ticketLocation,
  reverseGeocode,
  getBrowserLocation,
} from './location/locationService.js';
import {
  applyCitizenFeedback,
  buildEscalationTimeline,
  calculatePriorityScore,
  citizenUpdateCopy,
  computeDeadlines,
  DEFAULT_SLA,
  displayTicketId,
  ESCALATION_ROLES,
  enrichTicket,
  findDuplicateTicket,
  isDueOnDay,
  loadSettings,
  nextTicketId,
  notificationForEvent,
  priorityBand,
  saveSettings,
  seedTimeline,
  slaMeta,
  sortOfficerQueue,
  ticketPayload,
  timelineEvent,
} from './civicEngine.js';

const STATUSES = ['Open', 'Under Review', 'Assigned', 'In Progress', 'Resolved'];
const STATUS_LABEL = {
  Open: 'Reported',
  'Under Review': 'Under Review',
  Assigned: 'Assigned',
  'In Progress': 'In Progress',
  Resolved: 'Resolved',
};

const CATEGORIES = [
  { id: 'Road / Pothole', label: 'Road / Pothole', hint: 'Surface damage', Icon: AlertTriangle },
  { id: 'Garbage', label: 'Garbage', hint: 'Waste overflow', Icon: Trash2 },
  { id: 'Streetlight', label: 'Streetlight', hint: 'Dark or broken', Icon: Lightbulb },
  { id: 'Drainage', label: 'Drainage', hint: 'Clogged or flooded', Icon: Waves },
  { id: 'Water', label: 'Water', hint: 'Leak or shortage', Icon: Droplets },
  { id: 'Other', label: 'Other', hint: 'Anything else', Icon: MoreHorizontal },
];

const withTimeout = (promise, ms = 2500) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);

const calculateDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const inferCategory = (description = '') => {
  const d = description.toLowerCase();
  if (d.includes('garbage') || d.includes('waste')) return 'Garbage';
  if (d.includes('light')) return 'Streetlight';
  if (d.includes('drain') || d.includes('flood')) return 'Drainage';
  if (d.includes('water') || d.includes('leak')) return 'Water';
  if (d.includes('pothole') || d.includes('road') || d.includes('collapse')) return 'Road / Pothole';
  return 'Other';
};

const statusClass = (status) => {
  if (status === 'Resolved') return 'badge badge-resolved';
  if (status === 'In Progress') return 'badge badge-progress';
  if (status === 'Assigned') return 'badge badge-assigned';
  if (status === 'Under Review') return 'badge badge-review';
  return 'badge badge-open';
};

const priorityMeta = (score, status) => priorityBand(score, status);

const formatLongDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const slaToneClass = (tone) => {
  if (tone === 'overdue') return 'sla-pill sla-overdue';
  if (tone === 'due-soon') return 'sla-pill sla-soon';
  if (tone === 'resolved') return 'sla-pill sla-ok';
  return 'sla-pill sla-ok';
};

const stageIndex = (status) => {
  const i = STATUSES.indexOf(status);
  return i >= 0 ? i : 0;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const applyTicketLocation = (ticket, settings) => {
  const loc = ticketLocation(ticket);
  return enrichTicket(
    {
      ...ticket,
      ...loc,
      ward_id: ticket.ward_id || loc.ward_id,
      category: ticket.category || inferCategory(ticket.description),
    },
    settings
  );
};

function TicketThumb({ src, alt = '' }) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div className="thumb-fallback" aria-hidden="true">
        <ImageOff className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img src={src} alt={alt} onError={() => setBroken(true)} className="thumb" />
  );
}

const seedLoc = (lat, lon, extra = {}) => buildLocation({ latitude: lat, longitude: lon, extra });

const SEED = [
  {
    id: 't-101',
    ticket_id: 'UG-2026-00101',
    description: 'Major road collapse/pothole near main intersection',
    image_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=500',
    ...seedLoc(13.085, 80.2101),
    priority_score: 3,
    report_count: 17,
    status: 'Open',
    category: 'Road / Pothole',
    created_at: new Date(Date.now() - 36 * 3600000).toISOString(),
    assigned_officer: '',
    latest_update: 'Municipal desk has received this report.',
  },
  {
    id: 't-108',
    ticket_id: 'UG-2026-00108',
    description: 'Overflowing garbage near bus stop',
    image_url: 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb3?w=500',
    ...seedLoc(13.0418, 80.2337),
    priority_score: 2,
    report_count: 4,
    status: 'Under Review',
    category: 'Garbage',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    latest_update: 'Ward sanitation is reviewing this cluster.',
  },
  {
    id: 't-114',
    ticket_id: 'UG-2026-00114',
    description: 'Broken streetlight on residential lane',
    image_url: '',
    ...seedLoc(13.0067, 80.257),
    priority_score: 1,
    report_count: 2,
    status: 'In Progress',
    category: 'Streetlight',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    assigned_officer: 'Ward Field Unit',
    latest_update: 'Electrician dispatched to replace the fixture.',
  },
  {
    id: 't-121',
    ticket_id: 'UG-2026-00121',
    description: 'Clogged storm drain causing standing water',
    image_url: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=500',
    ...seedLoc(13.0067, 80.2206),
    priority_score: 4,
    report_count: 12,
    status: 'Assigned',
    category: 'Drainage',
    created_at: new Date(Date.now() - 5400000).toISOString(),
    assigned_officer: 'Stormwater Crew A',
    latest_update: 'Maintenance team assigned.',
  },
  {
    id: 't-090',
    ticket_id: 'UG-2026-00090',
    description: 'Water leakage from municipal pipeline',
    image_url: '',
    ...seedLoc(12.981, 80.218),
    priority_score: 1,
    report_count: 3,
    status: 'Resolved',
    category: 'Water',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    resolved_at: new Date(Date.now() - 86400000).toISOString(),
    resolution_note: 'Pipeline clamp installed and leak stopped.',
    assigned_officer: 'Water Board Unit',
    latest_update: 'Your civic issue has been resolved.',
  },
];

function AccountMenu({ user, profile, isOfficer, isAdmin, open, onToggle, onClose, onNavigate, onSignOut, dark }) {
  if (!user) {
    return (
      <button type="button" className={dark ? 'signin-chip' : 'ghost-btn'} onClick={() => onNavigate('login')}>
        Sign in
      </button>
    );
  }
  const name = profile?.full_name || user.email || 'Citizen';
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'C';
  const roleLabel = isAdmin ? 'Administrator' : isOfficer ? 'Municipal officer' : 'Citizen account';
  return (
    <div className="account-wrap">
      <button
        type="button"
        className={`avatar ${dark ? 'on-dark' : ''}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <>
          <button type="button" className="account-backdrop" aria-hidden="true" tabIndex={-1} onClick={onClose} />
          <div className="account-pop" role="menu" aria-label="Account">
            <div className="account-head">
              <strong>{name}</strong>
              <span>{user.email}</span>
              <span className="account-role">{roleLabel}</span>
            </div>
            <button type="button" className="account-item" role="menuitem" onClick={() => onNavigate('reports')}>
              My Complaints
            </button>
            {isOfficer && (
              <button type="button" className="account-item" role="menuitem" onClick={() => onNavigate('dashboard')}>
                Officer Dashboard
              </button>
            )}
            <button type="button" className="account-item" role="menuitem" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [civicSettings, setCivicSettings] = useState(() => loadSettings());
  const location = useLocation();
  const navigate = useNavigate();
  const route = useMemo(() => matchRoute(location.pathname), [location.pathname]);
  const activeTab = route.tab;
  const { user, profile, officerProfile, isOfficer, isAdmin, signOut } = useAuth();
  const officerArea = OFFICER_TABS.includes(activeTab) || activeTab === 'detail';
  const [tickets, setTickets] = useState(() => SEED.map((t) => applyTicketLocation(t, loadSettings())));
  const [formData, setFormData] = useState({
    description: '',
    image_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=500',
    category: '',
    ...buildLocation({ latitude: CITY.center.latitude, longitude: CITY.center.longitude }),
  });
  const [reportStep, setReportStep] = useState(1);
  const [submittedTicket, setSubmittedTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [notification, setNotification] = useState(null);
  const [searchId, setSearchId] = useState('');
  const [trackedTicket, setTrackedTicket] = useState(null);
  const [syncState, setSyncState] = useState({ ok: true, message: null });
  const [formError, setFormError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [reportFilter, setReportFilter] = useState('All');
  const [reportSort, setReportSort] = useState('newest');
  const [officerFilter, setOfficerFilter] = useState({
    status: 'All',
    priority: 'All',
    ward: 'All',
    category: 'All',
    area: 'All',
    location: '',
  });
  const [gpsError, setGpsError] = useState(null);
  const [trackerMapOpen, setTrackerMapOpen] = useState(false);
  const [areaHint, setAreaHint] = useState('Chennai, Tamil Nadu');
  const [confirmResolve, setConfirmResolve] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [afterPhoto, setAfterPhoto] = useState('');
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [userNotifications, setUserNotifications] = useState([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const fileRef = useRef(null);

  const pushAlert = (evt) => {
    setAlerts((prev) => [{ id: `${Date.now()}-${evt.type}`, at: new Date().toISOString(), ...evt }, ...prev].slice(0, 20));
  };

  const fetchTickets = useCallback(async () => {
    try {
      const [publicRes, scopedRes] = await withTimeout(
        Promise.all([
          supabase.from('public_issues').select('*').order('priority_score', { ascending: false }),
          supabase.from('tickets').select('*').order('priority_score', { ascending: false }),
        ])
      );

      const publicRows = publicRes?.error ? [] : publicRes?.data || [];
      const scopedRows = scopedRes?.error ? [] : scopedRes?.data || [];

      if (publicRes?.error && scopedRes?.error) {
        setSyncState({
          ok: false,
          message: 'Could not sync with the dispatch server. Local queue is still available.',
        });
        return;
      }

      // Officers work only from their ward-scoped rows; the database policies
      // decide what the scoped query returns. Citizens and guests also get the
      // public city feed (non-personal columns) for the ward map and tracker.
      const rows = new Map();
      if (!isOfficer) {
        publicRows.forEach((row) => rows.set(row.id, row));
      }
      scopedRows.forEach((row) => rows.set(row.id, { ...(rows.get(row.id) || {}), ...row }));
      const list = [...rows.values()];

      if (list.length > 0) {
        setTickets(list.map((row) => applyTicketLocation(row, civicSettings)));
      }

      setSyncState({ ok: true, message: null });
    } catch {
      setSyncState({
        ok: false,
        message: 'Could not sync with the dispatch server. Local queue is still available.',
      });
    } finally {
      setHydrating(false);
    }
  }, [isOfficer, civicSettings]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets, user?.id]);

  // Complaint updates for the signed-in account. Row Level Security returns
  // only the caller's own notifications, so no citizen data crosses accounts.
  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setUserNotifications([]);
      return;
    }
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('notifications')
          .select('id, ticket_id, kind, title, body, created_at, read_at')
          .order('created_at', { ascending: false })
          .limit(20)
      );
      if (!error && data) setUserNotifications(data);
    } catch {
      // Offline — the list re-syncs next time the drawer opens.
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Server-side overdue sweep (migration 004). Officers and administrators may
  // run it; the database scopes it to the caller's ward and is the only place
  // sla_status = 'overdue' is persisted.
  const runOverdueCheck = useCallback(async () => {
    if (!isOfficer) return;
    try {
      await withTimeout(supabase.rpc('mark_overdue_tickets'), 4000);
    } catch {
      // Offline — the sweep runs again when the dispatch server is reachable.
    }
  }, [isOfficer]);

  useEffect(() => {
    if (activeTab === 'dashboard' && isOfficer) {
      runOverdueCheck()
        .then(fetchTickets)
        .then(fetchNotifications);
    }
  }, [activeTab, isOfficer, runOverdueCheck, fetchTickets, fetchNotifications]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (route.tab !== 'tracker' || !route.param) return;
    const q = route.param.trim().toLowerCase();
    const found = tickets.find(
      (t) => t.id.toLowerCase() === q || String(t.ticket_id || '').toLowerCase() === q
    );
    setSearchId(route.param);
    setTrackedTicket(found || 'NOT_FOUND');
  }, [route.tab, route.param, tickets]);

  useEffect(() => {
    if (route.tab === 'detail' && route.param) setSelectedId(route.param);
  }, [route.tab, route.param]);

  useEffect(() => {
    if (!notification) return undefined;
    const t = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(t);
  }, [notification]);

  const mergeLocation = (loc) => {
    setFormData((prev) => ({ ...prev, ...loc, ward_id: loc.ward_id || loc.ward }));
    if (loc.address) setAreaHint(loc.address);
  };

  const setDemoLocation = (offsetMeters = 20) => {
    const offset = (offsetMeters / 11) * 0.0001;
    const loc = buildLocation({
      latitude: Number((13.085 + offset).toFixed(6)),
      longitude: Number((80.2101 + offset).toFixed(6)),
    });
    setFormData((prev) => ({
      ...prev,
      ...loc,
      description: 'Dangerous road fracture creating traffic hazard',
      category: 'Road / Pothole',
    }));
    setReportStep(2);
    navigate(pathForTab('report'));
  };

  const useCurrentLocation = async () => {
    setGpsError(null);
    try {
      const pos = await getBrowserLocation();
      const loc = await reverseGeocode(pos.latitude, pos.longitude);
      mergeLocation(loc);
    } catch (err) {
      setGpsError(err);
      setFormError(err.message);
    }
  };

  const persistTicket = async (ticket) => {
    try {
      await withTimeout(supabase.from('tickets').upsert([ticketPayload(ticket)]));
    } catch {
      console.warn('Ticket saved locally');
    }
  };

  const persistSubmission = async (row) => {
    try {
      await withTimeout(supabase.from('submissions').insert([row]));
    } catch {
      console.warn('Submission saved locally');
    }
  };

  const buildNewTicket = (lat, lon) => {
    const loc = buildLocation({
      latitude: lat,
      longitude: lon,
      extra: {
        place_name: formData.place_name,
        area: formData.area,
        address: formData.address,
        postal_code: formData.postal_code,
        city: formData.city,
        state: formData.state,
      },
    });
    const created_at = new Date().toISOString();
    const category = formData.category || inferCategory(formData.description);
    const ticket_id = nextTicketId(tickets);
    const draft = {
      id: ticket_id,
      ticket_id,
      description: formData.description,
      image_url: formData.image_url,
      report_count: 1,
      status: 'Open',
      category,
      user_id: user?.id || null,
      created_at,
      updated_at: created_at,
      latest_reported_at: created_at,
      latest_update: 'Your report has been received.',
      ...loc,
      ward_id: formData.ward_id || loc.ward_id,
    };
    const enriched = applyTicketLocation(draft, civicSettings);
    return { ...enriched, timeline: seedTimeline(enriched) };
  };

  const supportExisting = async (existing) => {
    setLoading(true);
    const now = new Date().toISOString();
    const submission = {
      ticket_id: existing.id,
      description: formData.description,
      image_url: formData.image_url,
      latitude: Number(formData.latitude),
      longitude: Number(formData.longitude),
      category: formData.category || inferCategory(formData.description),
      created_at: now,
    };

    // Merging happens server-side (support_complaint RPC) so the report count
    // and priority stay server-controlled. Offline, the local merge below
    // keeps the demo fully functional.
    let serverRow = null;
    try {
      const { data, error } = await withTimeout(
        supabase.rpc('support_complaint', {
          p_ticket_id: existing.id,
          p_description: submission.description,
          p_image_url: submission.image_url,
          p_latitude: submission.latitude,
          p_longitude: submission.longitude,
          p_category: submission.category,
        })
      );
      if (!error && data) serverRow = Array.isArray(data) ? data[0] : data;
    } catch {
      /* offline — fall back to the local merge */
    }

    let updated;
    if (serverRow && serverRow.id) {
      updated = applyTicketLocation({ ...existing, ...serverRow, id: existing.id }, civicSettings);
    } else {
      const report_count = (existing.report_count || existing.priority_score || 1) + 1;
      const sla = computeDeadlines({ ...existing, report_count }, civicSettings);
      updated = applyTicketLocation(
        {
          ...existing,
          report_count,
          latest_reported_at: now,
          updated_at: now,
          sla_status: sla.sla_status,
          escalation_level: sla.escalation_level,
          timeline: [
            ...(Array.isArray(existing.timeline) ? existing.timeline : []),
            timelineEvent(
              'duplicate_check',
              'Another citizen reported the same problem at this location — merged into this ticket (ONE problem = ONE ticket).',
              now
            ),
          ],
          priority_score: calculatePriorityScore({
            reportCount: report_count,
            category: existing.category,
            description: existing.description,
            createdAt: existing.created_at,
            slaStatus: sla.sla_status,
            status: existing.status,
          }),
        },
        civicSettings
      );
      await persistTicket(updated);
      await persistSubmission(submission);
    }

    setSubmissions((prev) => [submission, ...prev]);
    setTickets((prev) => prev.map((t) => (t.id === existing.id ? updated : t)));
    setSubmittedTicket({ ...updated, duplicate: true });
    const note = notificationForEvent('supported', updated);
    setNotification(note);
    pushAlert(note);
    const mergedCount = updated.report_count || updated.priority_score || 1;
    if ([3, 6, 11].includes(mergedCount)) pushAlert(notificationForEvent('surge', updated));
    if (updated.priority_score >= 4 && (existing.priority_score || 0) < 4) {
      pushAlert(notificationForEvent('critical', updated));
    }
    setPendingDuplicate(null);
    setReportStep(5);
    setLoading(false);
  };

  const createFreshTicket = async (lat, lon) => {
    const newTicket = buildNewTicket(lat, lon);
    const submission = {
      ticket_id: newTicket.id,
      description: newTicket.description,
      image_url: newTicket.image_url,
      latitude: lat,
      longitude: lon,
      category: newTicket.category,
      created_at: newTicket.created_at,
    };
    await persistTicket(newTicket);
    await persistSubmission(submission);
    setSubmissions((prev) => [submission, ...prev]);
    setTickets((prev) => [newTicket, ...prev]);
    setSubmittedTicket(newTicket);
    const note = notificationForEvent('created', newTicket);
    setNotification(note);
    pushAlert(note);
    setPendingDuplicate(null);
    setReportStep(5);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    setNotification(null);
    setFormError(null);

    const lat = parseFloat(formData.latitude);
    const lon = parseFloat(formData.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setFormError('Enter valid latitude and longitude before submitting.');
      setLoading(false);
      return;
    }

    if (!formData.description.trim()) {
      setFormError('Please describe the issue before submitting.');
      setLoading(false);
      return;
    }

    const match = findDuplicateTicket(
      tickets,
      {
        latitude: lat,
        longitude: lon,
        category: formData.category || inferCategory(formData.description),
        description: formData.description,
        place_id: formData.place_id,
        ward_id: formData.ward_id,
      },
      civicSettings,
      calculateDistanceInMeters
    );
    if (match) {
      setPendingDuplicate({
        ...match.ticket,
        matchDistance: Math.round(match.dist),
      });
      setLoading(false);
      return;
    }

    await createFreshTicket(lat, lon);
    setLoading(false);
  };

  const handleStatusChange = async (ticketId, newStatus) => {
    if (newStatus === 'Resolved' && confirmResolve !== ticketId) {
      setConfirmResolve(ticketId);
      setResolutionNote('');
      setAfterPhoto('');
      return;
    }

    const current = tickets.find((t) => t.id === ticketId);
    if (!current) return;

    if (newStatus === 'Resolved' && !resolutionNote.trim()) {
      setFormError('A resolution note is required before closing a ticket.');
      return;
    }

    const now = new Date().toISOString();
    const patch = {
      ...current,
      status: newStatus,
      updated_at: now,
    };

    if (newStatus === 'Assigned' || newStatus === 'In Progress') {
      if (!current.assigned_officer) {
        const rec = recommendOfficer(
          tickets.filter((t) => t.id !== ticketId),
          {
            ward_id: current.ward_id,
            category: current.category || inferCategory(current.description),
            latitude: Number(current.latitude),
            longitude: Number(current.longitude),
          }
        );
        if (rec.officer) {
          patch.assigned_officer = rec.officer.name;
          patch.assigned_officer_id = rec.officer.officer_id;
          patch.officer_name = rec.officer.name;
          patch.department = rec.officer.department;
          patch.officer_reason = rec.reason;
        }
      }
      patch.assigned_officer = patch.assigned_officer || 'Ward Field Unit';
      patch.latest_update =
        newStatus === 'Assigned'
          ? `Your issue has been assigned to ${patch.assigned_officer}.`
          : 'Maintenance team started work on this issue.';
      patch.timeline = [
        ...(Array.isArray(current.timeline) ? current.timeline : []),
        timelineEvent(
          newStatus === 'Assigned' ? 'officer_assigned' : 'repair_started',
          newStatus === 'Assigned'
            ? `Assigned to ${patch.assigned_officer}${patch.department ? ` (${patch.department})` : ''}.`
            : 'Field crew started work on this issue.',
          now
        ),
      ];
    }
    if (newStatus === 'Resolved') {
      patch.resolved_at = now;
      patch.resolution_note = resolutionNote.trim();
      patch.after_photo_url = afterPhoto;
      patch.latest_update = resolutionNote.trim();
      patch.sla_status = 'resolved';
      patch.timeline = [
        ...(Array.isArray(current.timeline) ? current.timeline : []),
        timelineEvent('resolution_submitted', resolutionNote.trim(), now),
      ];
    }

    const next = applyTicketLocation(patch, civicSettings);
    setConfirmResolve(null);
    setResolutionNote('');
    setAfterPhoto('');

    try {
      await withTimeout(supabase.from('tickets').update(ticketPayload(next)).eq('id', ticketId));
    } catch {
      /* keep local update */
    }

    setTickets((prev) => prev.map((t) => (t.id === ticketId ? next : t)));

    if (newStatus === 'Assigned') pushAlert(notificationForEvent('assigned', next));
    if (newStatus === 'In Progress') pushAlert(notificationForEvent('responded', next));
    if (newStatus === 'Resolved') {
      const note = notificationForEvent('resolved', next);
      setNotification(note);
      pushAlert(note);
    }
  };

  /** Spec §26 — citizen 👍/👎 verification. 👎 reopens the ticket. */
  const handleFeedback = async (ticketId, feedback) => {
    const current = tickets.find((t) => t.id === ticketId);
    if (!current) return;
    const now = new Date().toISOString();
    const patch = applyCitizenFeedback(current, feedback);
    const next = applyTicketLocation(
      { ...current, ...patch, updated_at: now, status: patch.status || current.status },
      civicSettings
    );
    try {
      await withTimeout(supabase.from('tickets').update(ticketPayload(next)).eq('id', ticketId));
    } catch {
      /* keep local update */
    }
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? next : t)));
    if (next.satisfaction === 'up') {
      const note = {
        type: 'success',
        title: `✅ ${next.ward_id ? `${next.ward_id} — ` : ''}Issue Closed`,
        message: `Ticket ${displayTicketId(next)} closed after positive citizen verification.`,
        tone: 'ok',
      };
      setNotification(note);
      pushAlert(note);
    } else {
      const note = notificationForEvent('reopened', next);
      setNotification(note);
      pushAlert(note);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchId.trim();
    if (!q) return;
    navigate(pathForTab('tracker', q));
  };

  const openTicket = (id) => {
    setSelectedId(id);
    navigate(pathForTab('detail', id));
  };

  const openTracker = (id) => {
    navigate(pathForTab('tracker', id));
  };

  const handleSignOut = async () => {
    setAccountOpen(false);
    await signOut();
    navigate(pathForTab('home'));
  };

  const unreadCount = userNotifications.filter((n) => !n.read_at).length;

  const markNotificationsRead = async () => {
    const unreadIds = userNotifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const readAt = new Date().toISOString();
    setUserNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: readAt })));
    try {
      await withTimeout(supabase.from('notifications').update({ read_at: readAt }).in('id', unreadIds));
    } catch {
      // Offline — the badge re-syncs the next time the drawer opens.
    }
  };

  const toggleNotifyDrawer = () => {
    if (!notifyOpen) fetchNotifications();
    setNotifyOpen((v) => !v);
  };

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'Open' || t.status === 'Under Review').length;
    const inProgress = tickets.filter((t) => t.status === 'In Progress' || t.status === 'Assigned').length;
    const resolved = tickets.filter((t) => t.status === 'Resolved').length;
    const clustered = tickets.filter((t) => (t.report_count || 0) > 1).length;
    const critical = tickets.filter(
      (t) => priorityMeta(t.priority_score, t.status).label === 'Critical' && t.status !== 'Resolved'
    ).length;
    const active = tickets.filter((t) => t.status !== 'Resolved');
    const overdue = active.filter((t) => slaMeta(t, civicSettings).sla_status === 'overdue').length;
    const dueToday = active.filter((t) => isDueOnDay(t.response_deadline, 0)).length;
    const dueTomorrow = active.filter((t) => isDueOnDay(t.response_deadline, 1)).length;
    return {
      total: tickets.length,
      active: active.length,
      open,
      inProgress,
      resolved,
      clustered,
      critical,
      overdue,
      dueToday,
      dueTomorrow,
    };
  }, [tickets, civicSettings]);

  const sortedTickets = useMemo(
    () => sortOfficerQueue(tickets, civicSettings),
    [tickets, civicSettings]
  );

  const chartMax = Math.max(stats.open, stats.inProgress, stats.resolved, 1);
  const priorityMax = Math.max(...tickets.map((t) => t.priority_score), 1);
  const responseScore = Math.round((stats.resolved / Math.max(stats.total, 1)) * 70 + 30);

  const searchedTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => {
      const loc = locationLine(t).toLowerCase();
      return (
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        String(t.ward_id || '').toLowerCase().includes(q) ||
        loc.includes(q) ||
        String(t.area || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, query]);

  const myReports = useMemo(() => {
    let list = [...searchedTickets];
    if (user) list = list.filter((t) => t.user_id === user.id);
    if (reportFilter === 'Open') list = list.filter((t) => t.status === 'Open' || t.status === 'Under Review');
    if (reportFilter === 'In Progress') {
      list = list.filter((t) => t.status === 'In Progress' || t.status === 'Assigned');
    }
    if (reportFilter === 'Resolved') list = list.filter((t) => t.status === 'Resolved');
    if (reportSort === 'newest') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (reportSort === 'oldest') list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (reportSort === 'priority') list.sort((a, b) => b.priority_score - a.priority_score);
    return list;
  }, [searchedTickets, reportFilter, reportSort, user]);

  const officerList = useMemo(() => {
    return sortedTickets.filter((t) => {
      if (officerFilter.status !== 'All' && t.status !== officerFilter.status) return false;
      if (officerFilter.ward !== 'All' && t.ward_id !== officerFilter.ward) return false;
      if (officerFilter.category !== 'All' && (t.category || inferCategory(t.description)) !== officerFilter.category) {
        return false;
      }
      if (officerFilter.area !== 'All' && (t.area || ticketLocation(t).area) !== officerFilter.area) return false;
      const locq = officerFilter.location.trim().toLowerCase();
      if (locq && !locationLine(t).toLowerCase().includes(locq) && !String(t.ward_id || '').toLowerCase().includes(locq)) {
        return false;
      }
      const band = priorityMeta(t.priority_score, t.status).label;
      if (officerFilter.priority !== 'All' && band !== officerFilter.priority) return false;
      return true;
    });
  }, [sortedTickets, officerFilter]);

  const selected = tickets.find((t) => t.id === selectedId);
  const categoryCounts = CATEGORIES.map((c) => ({
    ...c,
    value: tickets.filter((t) => (t.category || inferCategory(t.description)) === c.id).length,
  }));
  const wardCounts = Object.entries(
    tickets.reduce((acc, t) => {
      const w = t.ward_id || 'Unassigned';
      acc[w] = (acc[w] || 0) + 1;
      return acc;
    }, {})
  );

  const tracked = useMemo(() => {
    if (!trackedTicket || trackedTicket === 'NOT_FOUND') return trackedTicket;
    return tickets.find((t) => t.id === trackedTicket.id) || trackedTicket;
  }, [trackedTicket, tickets]);

  // Analytics helpers only treat lowercase 'all' as "no ward filter".
  const scopeWard = officerFilter.ward === 'All' ? 'all' : officerFilter.ward;

  const wardSnapshot = useMemo(() => wardStats(tickets, scopeWard), [tickets, scopeWard]);

  const maintAlerts = useMemo(() => maintenanceAlerts(tickets, scopeWard), [tickets, scopeWard]);

  const nav = [
    { id: 'home', label: 'Citizen Portal', icon: Home, group: 'Citizen' },
    { id: 'report', label: 'Report Issue', icon: FileText, group: 'Citizen' },
    { id: 'reports', label: 'My Reports', icon: Inbox, group: 'Citizen' },
    { id: 'tracker', label: 'Status Tracker', icon: Radio, group: 'Citizen' },
    { id: 'wardmap', label: 'Ward Map', icon: Layers, group: 'Citizen' },
    { id: 'dashboard', label: 'Officer Dashboard', icon: LayoutDashboard, group: 'Operations' },
    { id: 'heatmap', label: 'Issue Heatmap', icon: Flame, group: 'Operations' },
    { id: 'performance', label: 'Ward Performance', icon: TrendingUp, group: 'Operations' },
    { id: 'comparison', label: 'Ward Comparison', icon: BarChart3, group: 'Operations' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Operations' },
    { id: 'admin', label: 'Wards & Locations', icon: Building2, group: 'System' },
    { id: 'settings', label: 'Settings', icon: Settings, group: 'System' },
  ];

  const go = (id) => {
    if (id === 'report' && reportStep === 5) setReportStep(1);
    navigate(pathForTab(id));
  };

  const onFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFormData((p) => ({ ...p, image_url: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const lat = Number(formData.latitude) || CITY.center.latitude;
  const lon = Number(formData.longitude) || CITY.center.longitude;
  const areas = [...new Set(tickets.map((t) => t.area || ticketLocation(t).area).filter(Boolean))];

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1>UrbanGrid</h1>
            <p>Civic dispatch</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {['Citizen', 'Operations', 'System']
            .filter((group) => group === 'Citizen' || isOfficer)
            .map((group) => (
            <div key={group}>
              <div className="nav-section">{group}</div>
              {nav
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id || (item.id === 'dashboard' && activeTab === 'detail');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`nav-btn ${active ? 'is-active' : ''}`}
                      onClick={() => go(item.id)}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="nav-icon" />
                      {item.label}
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">{civicSettings.proximityMeters}m clustering · SLA dispatch</div>
      </aside>

      <header className="mobile-top">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" />
          <strong>UrbanGrid</strong>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={toggleNotifyDrawer} aria-label="Notifications">
            <Bell className="w-4 h-4" />
            {(notification || unreadCount > 0) && <span className="notif-dot" />}
          </button>
          <AccountMenu
            dark
            user={user}
            profile={profile}
            isOfficer={isOfficer}
            isAdmin={isAdmin}
            open={accountOpen}
            onToggle={() => setAccountOpen((v) => !v)}
            onClose={() => setAccountOpen(false)}
            onNavigate={(tabId) => {
              setAccountOpen(false);
              go(tabId);
            }}
            onSignOut={handleSignOut}
          />
        </div>
      </header>

      <header className="topbar">
        <div className="search-wrap">
          <Search className="w-4 h-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets, wards, or issues"
            aria-label="Search tickets"
          />
        </div>
        <div className="topbar-actions">
          <button type="button" className="chip-btn" aria-label="Current location" onClick={useCurrentLocation}>
            <MapPin className="w-4 h-4" />
            {formData.area || 'Chennai'}
          </button>
          <button type="button" className="icon-btn" onClick={toggleNotifyDrawer} aria-label="Notifications">
            <Bell className="w-4 h-4" />
            {(notification || unreadCount > 0) && <span className="notif-dot" />}
          </button>
          <AccountMenu
            user={user}
            profile={profile}
            isOfficer={isOfficer}
            isAdmin={isAdmin}
            open={accountOpen}
            onToggle={() => setAccountOpen((v) => !v)}
            onClose={() => setAccountOpen(false)}
            onNavigate={(tabId) => {
              setAccountOpen(false);
              go(tabId);
            }}
            onSignOut={handleSignOut}
          />
        </div>
      </header>

      <main id="main-content" className="app-main">
        {!syncState.ok && (
          <div className="sync-banner" role="status">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Offline mode.</strong> {syncState.message}
            </span>
          </div>
        )}

        {hydrating && (
          <div className="card card-pad mb-4" aria-hidden="true">
            <div className="skel" style={{ width: '40%', marginBottom: 12 }} />
            <div className="skel" style={{ width: '72%' }} />
          </div>
        )}

        {officerArea && <RequireOfficer />}
        {activeTab === 'admin' && <RequireAdmin />}

        {activeTab === 'home' && (
          <div className="space-y-6">
            <div className="page-head">
              <div>
                <p className="eyebrow">{greeting()}</p>
                <h2>Help make your city better.</h2>
                <p>
                  Report civic issues. Nearby duplicates join one ticket within {civicSettings.proximityMeters}m
                  so officers work a single civic problem.
                </p>
              </div>
              <button type="button" className="primary-btn" onClick={() => go('report')}>
                Report an Issue <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="card card-pad flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4" />
                <div>
                  <div className="eyebrow" style={{ margin: 0 }}>Your current area</div>
                  <strong>{areaHint}</strong>
                  {formData.ward_id && <div className="text-xs text-slate-500">{formData.ward_id}</div>}
                </div>
              </div>
              <button type="button" className="ghost-btn" onClick={useCurrentLocation}>
                <LocateFixed className="w-4 h-4" /> Use my current location
              </button>
            </div>

            <section>
              <h3 className="section-title">Quick report</h3>
              <div className="quick-grid">
                {CATEGORIES.map((c) => {
                  const Icon = c.Icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="quick-card"
                      onClick={() => {
                        setFormData((p) => ({ ...p, category: c.id }));
                        go('report');
                      }}
                    >
                      <div className="ico">
                        <Icon className="w-4 h-4" />
                      </div>
                      <strong>{c.label}</strong>
                      <span>{c.hint}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="card card-pad">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-title" style={{ margin: 0 }}>My recent reports</h3>
                <button type="button" className="ghost-btn" onClick={() => go('reports')}>
                  View all
                </button>
              </div>
              {tickets.length === 0 ? (
                <EmptyState
                  title="No civic reports yet"
                  body="New submissions will appear here after a citizen files an issue."
                  action={
                    <button type="button" className="primary-btn mt-4" onClick={() => go('report')}>
                      Report an Issue
                    </button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {tickets.slice(0, 4).map((ticket) => {
                    const p = priorityMeta(ticket.priority_score, ticket.status);
                    const idx = stageIndex(ticket.status);
                    return (
                      <button key={ticket.id} type="button" className="ticket-row" onClick={() => openTracker(ticket.id)}>
                        <TicketThumb src={ticket.image_url} alt="" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm">{displayTicketId(ticket)}</span>
                            <span className={p.cls}>{p.label} · {ticket.report_count || ticket.priority_score} reports</span>
                          </div>
                          <p className="text-sm truncate mt-0.5">{ticket.description}</p>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {locationLine(ticket)} · {ticket.ward_id} · {formatDate(ticket.created_at)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={statusClass(ticket.status)}>{ticket.status}</span>
                          </div>
                          <div className="progress-bar" aria-hidden="true">
                            <span style={{ width: `${((idx + 1) / STATUSES.length) * 100}%` }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'report' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <section className="xl:col-span-8 card card-pad">
              <div className="page-kicker mb-4">
                <p className="eyebrow">Citizen intake</p>
                <h2 className="text-2xl font-extrabold tracking-tight">Report a civic issue</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Nearby reports of the same problem join one ticket within {civicSettings.proximityMeters}m. Your
                  report still counts.
                </p>
              </div>

              {reportStep < 5 && (
                <div className="steps" aria-label="Report steps">
                  {['Issue', 'Location', 'Evidence', 'Submit'].map((label, i) => {
                    const n = i + 1;
                    return (
                      <div
                        key={label}
                        className={`step ${reportStep === n ? 'is-current' : ''} ${reportStep > n ? 'is-done' : ''}`}
                      >
                        <span className="step-num">{n}</span>
                        {label}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs font-medium">
                  <strong>Demo verification:</strong> Pre-fill coordinates &lt; {civicSettings.proximityMeters}m of UG-2026-00101
                </span>
                <button type="button" onClick={() => setDemoLocation(25)} className="ghost-btn">
                  Load Duplicate Test
                </button>
              </div>

              {reportStep === 1 && (
                <div>
                  <h3 className="section-title">What problem did you find?</h3>
                  <div className="quick-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                    {CATEGORIES.map((c) => {
                      const Icon = c.Icon;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`cat-card ${formData.category === c.id ? 'is-selected' : ''}`}
                          onClick={() => setFormData((p) => ({ ...p, category: c.id }))}
                        >
                          <div className="ico">
                            <Icon className="w-4 h-4" />
                          </div>
                          <strong>{c.label}</strong>
                          <span>{c.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-end mt-5">
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => setReportStep(2)}
                      disabled={!formData.category}
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {reportStep === 2 && (
                <div className="space-y-4">
                  <h3 className="section-title">Where is the problem?</h3>
                  <LocationPicker
                    value={formData}
                    onChange={mergeLocation}
                    gpsError={gpsError}
                    onGpsError={(err) => {
                      setGpsError(err);
                      setFormError(err.message);
                    }}
                    onClearGpsError={() => {
                      setGpsError(null);
                      setFormError(null);
                    }}
                  />
                  <div className="flex justify-between">
                    <button type="button" className="ghost-btn" onClick={() => setReportStep(1)}>Back</button>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => setReportStep(3)}
                      disabled={!formData.place_name && !formData.ward_id}
                    >
                      Confirm location <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {reportStep === 3 && (
                <div className="space-y-4">
                  <h3 className="section-title">Evidence</h3>
                  <div
                    className="dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                  >
                    <Upload className="w-6 h-6 mx-auto mb-2" />
                    <strong>Upload or take a photo</strong>
                    <p className="text-sm mt-1">Drag and drop, or click to browse</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => onFiles(e.target.files)}
                    />
                  </div>
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Evidence preview" className="rounded-xl max-h-48 object-cover w-full" />
                  )}
                  <div>
                    <label className="field-label" htmlFor="photo-url">Photo URL</label>
                    <input
                      id="photo-url"
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      className="field-control"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="issue-description">Describe the issue</label>
                    <textarea
                      id="issue-description"
                      required
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe the issue (e.g., Deep pothole blocking traffic)"
                      className="field-control"
                    />
                  </div>
                  <div className="flex justify-between">
                    <button type="button" className="ghost-btn" onClick={() => setReportStep(2)}>Back</button>
                    <button type="button" className="primary-btn" onClick={() => setReportStep(4)}>
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {reportStep === 4 && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="section-title">Review and submit</h3>
                  <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
                    <p><strong>Category:</strong> {formData.category || 'Other'}</p>
                    <p><strong>Description:</strong> {formData.description || '—'}</p>
                    {formData.image_url && (
                      <img src={formData.image_url} alt="" className="rounded-lg max-h-36 object-cover" />
                    )}
                  </div>
                  <div className="loc-confirm">
                    <p className="eyebrow">Location</p>
                    <p className="loc-sheet-title">
                      <MapPin className="w-4 h-4" /> {formData.address || `${formData.place_name || 'Selected point'}, Chennai`}
                    </p>
                    <ul className="loc-hierarchy mt-2">
                      {locationHierarchy(formData)
                        .filter((row) => row.value && row.value !== '—')
                        .map((row) => (
                          <li key={row.key}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                          </li>
                        ))}
                    </ul>
                    <div className="loc-coords">
                      <div>
                        <span>Latitude</span>
                        <strong className="mono">{Number(lat).toFixed(6)}</strong>
                      </div>
                      <div>
                        <span>Longitude</span>
                        <strong className="mono">{Number(lon).toFixed(6)}</strong>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Your report will be associated with this location.</p>
                    <button type="button" className="ghost-btn mt-3" onClick={() => setReportStep(2)}>
                      Change Location
                    </button>
                  </div>
                  {formError && (
                    <div className="error-state py-3" role="alert">{formError}</div>
                  )}
                  <div className="flex justify-between gap-2">
                    <button type="button" className="ghost-btn" onClick={() => setReportStep(3)}>Back</button>
                    <button type="submit" disabled={loading} className="primary-btn">
                      {loading ? <RefreshCw className="w-4 h-4 spin" /> : <>Submit Report <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </form>
              )}

              {reportStep === 5 && submittedTicket && (
                <div className="success-state">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3" />
                  <h3 className="text-xl font-extrabold">
                    {submittedTicket.duplicate
                      ? 'Your report has been added to an existing civic issue.'
                      : 'Your report has been received.'}
                  </h3>
                  <p className="text-sm mt-2 max-w-md mx-auto">
                    Ticket <strong>{displayTicketId(submittedTicket)}</strong> ·{' '}
                    {formData.address || locationLine(submittedTicket)} · {new Date().toLocaleTimeString()}
                  </p>
                  <p className="text-sm mt-2">
                    {submittedTicket.duplicate
                      ? `${submittedTicket.report_count} citizens have now reported this issue. Officers still work a single ticket.`
                      : `Officer response required by ${formatLongDate(submittedTicket.response_deadline)}.`}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-5">
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        setSearchId(displayTicketId(submittedTicket));
                        setTrackedTicket(tickets.find((t) => t.id === submittedTicket.id) || submittedTicket);
                        go('tracker');
                      }}
                    >
                      Track Report
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setReportStep(1);
                        setSubmittedTicket(null);
                      }}
                    >
                      File another
                    </button>
                  </div>
                </div>
              )}
            </section>

            <aside className="xl:col-span-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="card kpi">
                  <span>Active tickets</span>
                  <strong>{stats.active}</strong>
                </div>
                <div className="card kpi">
                  <span>Citizen reports merged</span>
                  <strong>{stats.clustered}</strong>
                </div>
              </div>
              <div className="card card-pad">
                <h3 className="section-title">Live ticket stream</h3>
                {tickets.length === 0 ? (
                  <EmptyState
                    title="No civic reports yet"
                    body="New submissions will appear here after a citizen files an issue."
                  />
                ) : (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {tickets.map((ticket) => (
                      <button key={ticket.id} type="button" className="ticket-row" onClick={() => openTracker(ticket.id)}>
                        <TicketThumb src={ticket.image_url} alt="" />
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs">{displayTicketId(ticket)}</span>
                            <span className="badge badge-med">
                              <TrendingUp className="w-3 h-3" /> {ticket.report_count || ticket.priority_score}
                            </span>
                          </div>
                          <p className="text-xs truncate mt-1">{ticket.description}</p>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {locationLine(ticket)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="page-head">
              <div>
                <p className="eyebrow">History</p>
                <h2>My reports</h2>
                <p>Searchable complaint history with status and priority.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="seg" role="tablist">
                {['All', 'Open', 'In Progress', 'Resolved'].map((f) => (
                  <button key={f} type="button" className={reportFilter === f ? 'is-on' : ''} onClick={() => setReportFilter(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <select value={reportSort} onChange={(e) => setReportSort(e.target.value)} aria-label="Sort reports">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="priority">Highest Priority</option>
              </select>
            </div>
            {myReports.length === 0 ? (
              <EmptyState title="No matching reports" body="Try another filter, or file a new civic issue." />
            ) : (
              <div className="space-y-3">
                {myReports.map((t) => {
                  const p = priorityMeta(t.priority_score, t.status);
                  return (
                    <button key={t.id} type="button" className="ticket-row" onClick={() => openTracker(t.id)}>
                      <TicketThumb src={t.image_url} alt="" />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex justify-between gap-2">
                          <strong>{displayTicketId(t)}</strong>
                          <span className={statusClass(t.status)}>{t.status}</span>
                        </div>
                        <p className="text-sm truncate">{t.description}</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {locationLine(t)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {t.ward_id} · {formatDate(t.created_at)} · <span className={p.cls}>{p.label}</span>
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tracker' && (
          <div className="max-w-xl mx-auto space-y-6">
            <section className="card card-pad">
              <p className="eyebrow">Grievance status</p>
              <h2 className="text-2xl font-extrabold tracking-tight">Track your report</h2>
              <p className="text-sm text-slate-500 mt-1 mb-4">Enter ticket ID to view real-time status and report weight.</p>
              <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  placeholder="e.g. t-101 or UG-2026-00124"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="field-control"
                  aria-label="Ticket ID"
                />
                <button type="submit" className="primary-btn sm:w-auto px-4">
                  <Search className="w-4 h-4" /> Track
                </button>
              </form>
            </section>

            {trackedTicket == null && (
              <EmptyState
                title="No ticket loaded"
                body="Search with a ticket ID such as t-101 to see the status timeline."
              />
            )}

            {tracked && tracked !== 'NOT_FOUND' && (
              <section className="card card-pad space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <span className="eyebrow">Ticket</span>
                    <h3 className="text-xl font-bold">{displayTicketId(tracked)}</h3>
                    <p className="eyebrow mt-3" style={{ marginBottom: 0 }}>
                      {(tracked.category || inferCategory(tracked.description)).toUpperCase()}
                    </p>
                    <p className="text-sm mt-2 flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> {locationLine(tracked)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {tracked.place_name ? `${tracked.place_name} · ` : ''}
                      {tracked.ward_name ? `${tracked.ward_name} ` : ''}
                      {tracked.ward_id
                        ? `(${tracked.ward_id}${tracked.ward_number ? `, No. ${tracked.ward_number}` : ''})`
                        : 'Ward pending'}
                      {tracked.zone ? ` · ${tracked.zone}` : ''}
                    </p>
                    <button type="button" className="ghost-btn mt-3" onClick={() => setTrackerMapOpen(true)}>
                      View on Map
                    </button>
                  </div>
                  <span className="badge badge-med">
                    {tracked.report_count || tracked.priority_score} citizens
                  </span>
                </div>
                {trackerMapOpen && (
                  <IssueCityMap
                    tickets={[tracked]}
                    focus={tracked}
                    showLabels={false}
                    height={280}
                    onSelect={openTracker}
                  />
                )}
                <div className="flex gap-3">
                  <TicketThumb src={tracked.image_url} alt="" />
                  <div className="min-w-0">
                    <p className="text-sm">{tracked.description}</p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {tracked.ward_id} · {formatDate(tracked.created_at)}
                    </p>
                    <p className="text-xs mt-1">
                      Status: {STATUS_LABEL[tracked.status] || tracked.status} · Priority:{' '}
                      {priorityMeta(tracked.priority_score, tracked.status).label}
                    </p>
                  </div>
                </div>
                {(() => {
                  const sla = slaMeta(tracked, civicSettings);
                  return (
                    <div className="sla-panel">
                      <div>
                        <span className="eyebrow">SLA</span>
                        <p className={slaToneClass(sla.tone)}>
                          {sla.tone === 'on-track' ? '🟢' : sla.tone === 'due-soon' ? '🟡' : sla.tone === 'overdue' ? '🔴' : '✅'}{' '}
                          {sla.label}
                        </p>
                      </div>
                      <div>
                        <span className="eyebrow">Expected resolution</span>
                        <p className="text-sm font-semibold">{formatLongDate(tracked.deadline)}</p>
                      </div>
                      <div>
                        <span className="eyebrow">Officer response</span>
                        <p className="text-sm font-semibold">{sla.countdown}</p>
                      </div>
                    </div>
                  );
                })()}
                <Satisfaction ticket={tracked} onFeedback={(fb) => handleFeedback(tracked.id, fb)} />
                <div>
                  <h4 className="eyebrow">Progress</h4>
                  <TicketTimeline ticket={tracked} settings={civicSettings} />
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <h4 className="eyebrow">Latest update</h4>
                  <p className="text-sm mt-1">{citizenUpdateCopy(tracked)}</p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <User className="w-3 h-3" /> {tracked.assigned_officer || 'Ward operations'} ·{' '}
                    {formatDate(tracked.updated_at || tracked.created_at)}
                  </p>
                </div>
              </section>
            )}

            {trackedTicket === 'NOT_FOUND' && (
              <div className="error-state" role="alert">
                <p className="font-semibold">Ticket not found</p>
                <p className="text-sm mt-1">
                  No active ticket found with ID &quot;{searchId}&quot;. Please verify and try again.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'dashboard' && isOfficer && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Operations</p>
                <h2 className="text-2xl font-extrabold tracking-tight">Officer command center</h2>
                <p className="text-sm text-slate-500">
                  One civic problem, one ticket. Sorted by overdue, critical, deadline, then report count.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="scope-chip">
                    <User className="w-3 h-3" />
                    {profile?.full_name || user?.email || 'Officer'} · {isAdmin ? 'Administrator' : 'Ward officer'}
                  </span>
                  <span className="scope-chip">
                    <MapPin className="w-3 h-3" />
                    {isAdmin
                      ? 'City-wide scope'
                      : officerProfile?.ward_id
                        ? `Ward scope ${officerProfile.ward_id}${officerProfile.zone ? ` · ${officerProfile.zone}` : ''}`
                        : 'No ward assigned yet — an administrator must assign your ward'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  runOverdueCheck().then(fetchTickets).then(fetchNotifications);
                }}
                className="ghost-btn w-fit"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Dispatch
              </button>
            </div>

            <div className="kpi-grid sla-kpis">
              {[
                ['Total Active Issues', stats.active, 'Open civic problems'],
                ['Due Today', stats.dueToday, 'Officer response'],
                ['Due Tomorrow', stats.dueTomorrow, 'Next 24h'],
                ['Overdue', stats.overdue, 'SLA breached'],
                ['Critical', stats.critical, 'Highest visibility'],
                ['Resolved', stats.resolved, 'Closed'],
              ].map(([label, value, hint]) => (
                <div className={`card kpi ${label === 'Overdue' && value > 0 ? 'kpi-alert' : ''}`} key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <em>{hint}</em>
                </div>
              ))}
            </div>

            <section className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 className="section-title" style={{ margin: 0 }}>
                  {officerFilter.ward === 'All'
                    ? 'City snapshot'
                    : `Ward snapshot · ${wardSnapshot.ward?.ward_name || officerFilter.ward}`}
                </h3>
                <WardSelector
                  value={officerFilter.ward === 'All' ? 'all' : officerFilter.ward}
                  onChange={(w) => setOfficerFilter({ ...officerFilter, ward: w === 'all' ? 'All' : w })}
                  id="snapshot-ward"
                />
              </div>
              <div className="snapshot-grid">
                <div className="snapshot-cell">
                  <span>Total</span>
                  <strong>{wardSnapshot.total}</strong>
                </div>
                <div className="snapshot-cell">
                  <span>Active</span>
                  <strong>{wardSnapshot.open + wardSnapshot.inProgress}</strong>
                </div>
                <div className="snapshot-cell">
                  <span>Resolved</span>
                  <strong>{wardSnapshot.resolved}</strong>
                </div>
                <div className="snapshot-cell">
                  <span>Overdue</span>
                  <strong className={wardSnapshot.overdue > 0 ? 'snapshot-alert' : ''}>{wardSnapshot.overdue}</strong>
                </div>
                <div className="snapshot-cell">
                  <span>Performance</span>
                  <strong>{wardSnapshot.performanceScore}/100</strong>
                </div>
                <div className="snapshot-cell">
                  <span>Health</span>
                  <strong>
                    {wardSnapshot.healthScore}/100
                    <em className={`badge badge-${wardSnapshot.healthStatus.tone === 'urgent' ? 'crit' : wardSnapshot.healthStatus.tone === 'pending' ? 'med' : wardSnapshot.healthStatus.tone === 'info' ? 'assigned' : 'resolved'} ml-2`}>
                      {wardSnapshot.healthStatus.label}
                    </em>
                  </strong>
                </div>
              </div>
              {wardSnapshot.ward && (
                <p className="text-xs text-slate-500 mt-2">
                  Ward No. {wardSnapshot.ward.ward_number} · {wardSnapshot.ward.zone} · {wardSnapshot.ward.ward_id}
                  {wardSnapshot.critical > 0 ? ` · ${wardSnapshot.critical} critical` : ''}
                </p>
              )}
            </section>

            {maintAlerts.length > 0 && (
              <section className="card card-pad urgent-panel">
                <h3 className="section-title">Maintenance alerts</h3>
                <div className="space-y-3">
                  {maintAlerts.slice(0, 4).map((a) => (
                    <article key={a.key} className="urgent-card is-overdue">
                      <div>
                        <strong>{a.title}</strong>
                        <p className="text-sm mt-1">{a.message}</p>
                        <p className="text-xs mt-1">{a.recommendation}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="card card-pad urgent-panel">
              <h3 className="section-title">Urgent action required</h3>
              {sortedTickets.filter((t) => t.status !== 'Resolved' && (slaMeta(t, civicSettings).sla_status === 'overdue' || priorityMeta(t.priority_score, t.status).label === 'Critical')).length === 0 ? (
                <EmptyState title="No urgent breaches" body="Overdue and critical tickets will pin here so they cannot be missed." />
              ) : (
                <div className="space-y-3">
                  {sortedTickets
                    .filter(
                      (t) =>
                        t.status !== 'Resolved' &&
                        (slaMeta(t, civicSettings).sla_status === 'overdue' ||
                          priorityMeta(t.priority_score, t.status).label === 'Critical')
                    )
                    .slice(0, 6)
                    .map((t) => {
                      const sla = slaMeta(t, civicSettings);
                      const p = priorityMeta(t.priority_score, t.status);
                      return (
                        <article key={t.id} className={`urgent-card ${sla.tone === 'overdue' ? 'is-overdue' : ''}`}>
                          <div>
                            <p className="eyebrow">{(t.category || inferCategory(t.description)).toUpperCase()}</p>
                            <strong>{displayTicketId(t)}</strong>
                            <p className="text-sm mt-1 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" /> {locationLine(t)}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">{t.ward_id} · Reports: {t.report_count || t.priority_score}</p>
                          </div>
                          <div className="urgent-meta">
                            <span className={p.cls}>{p.label}</span>
                            <span className={statusClass(t.status)}>{STATUS_LABEL[t.status] || t.status}</span>
                            <span className={slaToneClass(sla.tone)}>{sla.tone === 'overdue' ? '⚠️ SLA BREACHED' : sla.countdown}</span>
                            <p className="text-xs mt-1">Deadline: {formatLongDate(t.response_deadline)}</p>
                            <div className="flex gap-2 mt-3">
                              <button type="button" className="ghost-btn" onClick={() => openTicket(t.id)}>View Issue</button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
              )}
            </section>

            <div className="filters">
              <Filter className="w-4 h-4 mt-2 text-slate-400" />
              <select value={officerFilter.status} onChange={(e) => setOfficerFilter({ ...officerFilter, status: e.target.value })} aria-label="Filter status">
                <option>All</option>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={officerFilter.priority} onChange={(e) => setOfficerFilter({ ...officerFilter, priority: e.target.value })} aria-label="Filter priority">
                <option>All</option>
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <WardSelector
                value={officerFilter.ward === 'All' ? 'all' : officerFilter.ward}
                onChange={(w) => setOfficerFilter({ ...officerFilter, ward: w === 'all' ? 'All' : w })}
                id="dash-ward-filter"
              />
              <select value={officerFilter.area} onChange={(e) => setOfficerFilter({ ...officerFilter, area: e.target.value })} aria-label="Filter area">
                <option>All</option>
                {areas.map((a) => <option key={a}>{a}</option>)}
              </select>
              <select value={officerFilter.category} onChange={(e) => setOfficerFilter({ ...officerFilter, category: e.target.value })} aria-label="Filter category">
                <option>All</option>
                {CATEGORIES.map((c) => <option key={c.id}>{c.id}</option>)}
              </select>
              <input
                className="field-control"
                style={{ width: 180, padding: '6px 10px' }}
                placeholder="Filter by location"
                value={officerFilter.location}
                onChange={(e) => setOfficerFilter({ ...officerFilter, location: e.target.value })}
                aria-label="Filter location"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <section className="lg:col-span-7 card card-pad">
                <h3 className="section-title">City map</h3>
                <IssueCityMap tickets={officerList} onSelect={openTicket} />
                <div className="map-legend">
                  <span><i className="dot" style={{ background: '#c03221' }} /> Critical</span>
                  <span><i className="dot" style={{ background: '#c2410c' }} /> High</span>
                  <span><i className="dot" style={{ background: '#ca8a04' }} /> Medium</span>
                  <span><i className="dot" style={{ background: '#1d4ed8' }} /> Low</span>
                  <span><i className="dot" style={{ background: '#0f7a4a' }} /> Resolved</span>
                </div>
              </section>
              <section className="lg:col-span-5 card card-pad">
                <h3 className="section-title">Priority issues</h3>
                <div className="space-y-3 max-h-[360px] overflow-y-auto">
                  {officerList.slice(0, 6).map((t) => {
                    const p = priorityMeta(t.priority_score, t.status);
                    const dist = Math.round(
                      calculateDistanceInMeters(CITY.center.latitude, CITY.center.longitude, Number(t.latitude), Number(t.longitude))
                    );
                    return (
                      <button key={t.id} type="button" className="ticket-row" onClick={() => openTicket(t.id)}>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex justify-between gap-2">
                            <strong className="text-sm">#{t.id}</strong>
                            <span className={p.cls}>{p.label}</span>
                          </div>
                          <p className="text-xs truncate">{t.description}</p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {locationLine(t)} · {t.ward_id} · {dist}m · {t.report_count || t.priority_score} reports · {STATUS_LABEL[t.status] || t.status}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="card card-pad">
                <h3 className="section-title">Status mix</h3>
                {[
                  { label: 'Open', value: stats.open, color: '#c03221' },
                  { label: 'In Progress', value: stats.inProgress, color: '#1d4ed8' },
                  { label: 'Resolved', value: stats.resolved, color: '#0f7a4a' },
                ].map((row) => (
                  <div key={row.label} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{row.label}</span>
                      <span className="font-semibold">{row.value}</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: `${(row.value / chartMax) * 100}%`, background: row.color }} />
                    </div>
                  </div>
                ))}
              </section>
              <section className="card card-pad">
                <h3 className="section-title">Priority pressure</h3>
                {tickets.length === 0 ? (
                  <EmptyState title="No dispatch data" body="Charts populate once tickets exist." />
                ) : (
                  sortedTickets.slice(0, 5).map((ticket) => (
                    <div key={ticket.id} className="mb-3 last:mb-0">
                      <div className="flex justify-between text-xs mb-1 gap-2">
                        <span className="truncate">#{ticket.id}</span>
                        <span className="font-semibold shrink-0">{ticket.report_count || ticket.priority_score}</span>
                      </div>
                      <div className="chart-track">
                        <div
                          className="chart-fill"
                          style={{
                            width: `${(ticket.priority_score / priorityMax) * 100}%`,
                            background: ticket.priority_score > 2 ? '#c03221' : '#c47a0a',
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>

            {tickets.length === 0 ? (
              <EmptyState
                title="Dispatch queue is empty"
                body="Citizen reports will appear here for status updates and routing."
              />
            ) : (
              <div className="card overflow-hidden">
                <div className="desktop-table table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Location</th>
                        <th>Ward</th>
                        <th>Reports</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Deadline</th>
                        <th>Time remaining</th>
                        <th style={{ textAlign: 'right' }}>Dispatch Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officerList.map((t) => {
                        const sla = slaMeta(t, civicSettings);
                        const p = priorityMeta(t.priority_score, t.status);
                        return (
                        <tr key={t.id} className={sla.tone === 'overdue' ? 'row-overdue' : ''}>
                          <td>
                            <button type="button" className="font-bold" onClick={() => openTicket(t.id)}>{displayTicketId(t)}</button>
                            <div className="text-xs text-slate-500 truncate max-w-[220px]">{t.description}</div>
                          </td>
                          <td>{locationLine(t)}</td>
                          <td>{t.ward_id}</td>
                          <td>{t.report_count || t.priority_score}</td>
                          <td>
                            <span className={p.cls}>{p.label}</span>
                          </td>
                          <td><span className={statusClass(t.status)}>{STATUS_LABEL[t.status] || t.status}</span></td>
                          <td>{formatDate(t.response_deadline)}</td>
                          <td>
                            <span className={slaToneClass(sla.tone)}>{sla.countdown}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <select
                              value={t.status}
                              onChange={(e) => handleStatusChange(t.id, e.target.value)}
                              className="field-control"
                              style={{ width: 'auto', padding: '6px 8px' }}
                              aria-label={`Update status for ticket ${t.id}`}
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>Mark {STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mobile-cards p-3 space-y-3">
                  {officerList.map((t) => (
                    <article key={t.id} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <button type="button" className="font-bold" onClick={() => openTicket(t.id)}>{displayTicketId(t)}</button>
                        <span className={statusClass(t.status)}>{STATUS_LABEL[t.status] || t.status}</span>
                      </div>
                      <p className="text-sm">{t.description}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {locationLine(t)} · {t.ward_id} · {slaMeta(t, civicSettings).countdown}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className={priorityMeta(t.priority_score, t.status).cls}>{t.report_count || t.priority_score} reports</span>
                        <select
                          value={t.status}
                          onChange={(e) => handleStatusChange(t.id, e.target.value)}
                          className="field-control"
                          style={{ width: 'auto', padding: '6px 8px' }}
                          aria-label={`Update status for ticket ${t.id}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>Mark {s}</option>
                          ))}
                        </select>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'detail' && isOfficer && selected && (
          <div className="space-y-4">
            <button type="button" className="ghost-btn" onClick={() => go('dashboard')}>Back to queue</button>
            <div className="page-head">
              <div>
                <p className="eyebrow">Ticket · {displayTicketId(selected)}</p>
                <h2>{selected.description}</h2>
                <p className="mt-2 flex items-center gap-1 text-sm">
                  <MapPin className="w-4 h-4" /> {locationLine(selected)}
                </p>
                <p className="text-sm text-slate-500">{selected.ward_id} · Officer: {selected.assigned_officer || 'Unassigned'}</p>
              </div>
              <span className={priorityMeta(selected.priority_score, selected.status).cls}>
                {priorityMeta(selected.priority_score, selected.status).label} · {selected.report_count || selected.priority_score} reports
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 space-y-4">
                {selected.image_url ? (
                  <img src={selected.image_url} alt="" className="card w-full max-h-80 object-cover" />
                ) : (
                  <div className="card empty-state">No photo attached</div>
                )}
                <div className="card card-pad">
                  <h3 className="section-title">Timeline</h3>
                  <TicketTimeline ticket={selected} settings={civicSettings} />
                </div>
                <Satisfaction ticket={selected} onFeedback={(fb) => handleFeedback(selected.id, fb)} />
              </div>
              <div className="lg:col-span-5 space-y-4">
                <IssueCityMap tickets={[selected]} focus={selected} showLabels={false} height={280} />
                <div className="card card-pad space-y-3">
                  <p className="eyebrow">Issue details</p>
                  {(() => {
                    const sla = slaMeta(selected, civicSettings);
                    return (
                      <div className="sla-panel compact">
                        <div>
                          <span className="eyebrow">SLA</span>
                          <p className={slaToneClass(sla.tone)}>{sla.label}</p>
                        </div>
                        <div>
                          <span className="eyebrow">Response deadline</span>
                          <p className="text-sm font-semibold">{formatLongDate(selected.response_deadline)}</p>
                          <p className="text-xs">{sla.countdown}</p>
                        </div>
                        <div>
                          <span className="eyebrow">Resolution target</span>
                          <p className="text-sm font-semibold">{formatLongDate(selected.deadline)}</p>
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-sm"><strong>Ticket:</strong> {displayTicketId(selected)}</p>
                  <p className="text-sm"><strong>Issue:</strong> {selected.category || inferCategory(selected.description)}</p>
                  <p className="text-sm"><strong>Location:</strong> {locationLine(selected)}</p>
                  <p className="text-sm">
                    <strong>Place:</strong> {selected.place_name || 'Not identified'}
                    {selected.place_id ? ` · ${selected.place_id}` : ''}
                  </p>
                  <p className="text-sm"><strong>Street:</strong> {selected.street || '—'}</p>
                  <p className="text-sm"><strong>Area:</strong> {selected.area || ticketLocation(selected).area}</p>
                  <p className="text-sm">
                    <strong>Ward:</strong>{' '}
                    {selected.ward_name
                      ? `${selected.ward_name} (${selected.ward_id}${selected.ward_number ? `, No. ${selected.ward_number}` : ''})`
                      : selected.ward_id || 'Not identified'}
                  </p>
                  <p className="text-sm"><strong>Zone:</strong> {selected.zone || '—'}</p>
                  <p className="text-sm">
                    <strong>Ward detection:</strong>{' '}
                    {selected.ward_detection === 'manual'
                      ? 'Selected manually'
                      : selected.ward_detection === 'auto'
                        ? 'Auto-detected from location'
                        : 'Not identified'}
                  </p>
                  <p className="text-sm"><strong>Reports:</strong> {selected.report_count || selected.priority_score} citizens</p>
                  <p className="text-sm"><strong>Responsible officer:</strong> {selected.assigned_officer || 'Unassigned'}</p>
                  {selected.officer_reason && (
                    <p className="text-xs text-slate-500">Why this officer: {selected.officer_reason}</p>
                  )}
                  <p className="text-sm mono">
                    {Math.abs(Number(selected.latitude)).toFixed(4)}° {Number(selected.latitude) >= 0 ? 'N' : 'S'}
                    <br />
                    {Math.abs(Number(selected.longitude)).toFixed(4)}° {Number(selected.longitude) >= 0 ? 'E' : 'W'}
                  </p>
                  <p className="text-sm"><strong>Reported:</strong> {formatLongDate(selected.created_at)}</p>
                  <p className="text-sm"><strong>Response required by:</strong> {formatLongDate(selected.response_deadline)}</p>
                  <p className="text-sm"><strong>Status:</strong> {STATUS_LABEL[selected.status] || selected.status}</p>
                  <p className="text-sm"><strong>Priority:</strong> {priorityMeta(selected.priority_score, selected.status).label}</p>
                  {selected.escalation_level > 0 && (
                    <p className="text-sm font-semibold text-red-700">⚠️ SLA BREACHED · {ESCALATION_ROLES[Math.min(selected.escalation_level, 3)]}</p>
                  )}
                  <div>
                    <h4 className="eyebrow">Escalation timeline</h4>
                    <div className="timeline mt-2">
                      {buildEscalationTimeline(selected, civicSettings).map((item, i) => (
                        <div className="tl-item" key={`${item.title}-${i}`}>
                          <div className="tl-rail">
                            <div className={`tl-dot ${item.warn ? 'is-warn' : 'is-on'}`} />
                          </div>
                          <div className="pb-3">
                            <strong className="text-sm">{item.title}</strong>
                            <p className="text-xs text-slate-500">{item.detail}</p>
                            <p className="text-xs">{item.actor} · {formatDate(item.at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {submissions.filter((s) => s.ticket_id === selected.id).length > 0 && (
                    <p className="text-xs text-slate-500">
                      {submissions.filter((s) => s.ticket_id === selected.id).length} additional citizen submission(s) linked to this ticket.
                    </p>
                  )}
                  <label className="field-label" htmlFor="detail-status">Update status</label>
                  <select
                    id="detail-status"
                    value={selected.status}
                    onChange={(e) => handleStatusChange(selected.id, e.target.value)}
                    className="field-control"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  <button
                    type="button"
                    className="primary-btn w-full"
                    onClick={() => handleStatusChange(selected.id, selected.status === 'Resolved' ? 'Open' : 'Resolved')}
                  >
                    {selected.status === 'Resolved' ? 'Reopen issue' : 'Update status'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'detail' && isOfficer && !selected && (
          <EmptyState title="Issue not found" body="Return to the officer queue and pick a ticket." />
        )}

        {activeTab === 'analytics' && isOfficer && (
          <div className="space-y-4">
            <div className="page-head">
              <div>
                <p className="eyebrow">Performance</p>
                <h2>Civic analytics</h2>
              </div>
              <div className="card card-pad flex items-center gap-4">
                <div className="score-ring" style={{ '--p': responseScore }}>
                  <span>{responseScore}</span>
                </div>
                <div>
                  <div className="eyebrow">Urban Response Score</div>
                  <strong className="text-lg">{responseScore}/100</strong>
                  <p className="text-xs text-slate-500 mt-1">
                    {Math.round((stats.resolved / Math.max(stats.total, 1)) * 100)}% resolution · {stats.clustered} duplicates merged
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="card card-pad">
                <h3 className="section-title">Issues by category</h3>
                {categoryCounts.map((c) => (
                  <div key={c.id} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{c.label}</span>
                      <span>{c.value}</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: `${(c.value / Math.max(stats.total, 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </section>
              <section className="card card-pad">
                <h3 className="section-title">Issues by ward</h3>
                {wardCounts.length === 0 ? (
                  <EmptyState title="No ward data" body="Tickets will group here by ward." />
                ) : (
                  wardCounts.map(([w, n]) => (
                    <div key={w} className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{w}</span>
                        <span>{n}</span>
                      </div>
                      <div className="chart-track">
                        <div className="chart-fill" style={{ width: `${(n / Math.max(stats.total, 1)) * 100}%`, background: '#1a3655' }} />
                      </div>
                    </div>
                  ))
                )}
              </section>
              <section className="card card-pad">
                <h3 className="section-title">Priority distribution</h3>
                {[
                  ['Critical', tickets.filter((t) => priorityMeta(t.priority_score, t.status).label === 'Critical').length, '#c03221'],
                  ['High', tickets.filter((t) => priorityMeta(t.priority_score, t.status).label === 'High').length, '#c2410c'],
                  ['Medium', tickets.filter((t) => priorityMeta(t.priority_score, t.status).label === 'Medium').length, '#ca8a04'],
                  ['Low', tickets.filter((t) => priorityMeta(t.priority_score, t.status).label === 'Low').length, '#64748b'],
                ].map(([label, n, color]) => (
                  <div key={label} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{label}</span>
                      <span>{n}</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: `${(n / Math.max(stats.total, 1)) * 100}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </section>
              <section className="card card-pad">
                <h3 className="section-title">Resolution mix</h3>
                <p className="text-sm mb-3">{stats.clustered} duplicate reports folded into existing tickets.</p>
                {[
                  ['Open / review', stats.open, '#c03221'],
                  ['In progress', stats.inProgress, '#1d4ed8'],
                  ['Resolved', stats.resolved, '#0f7a4a'],
                ].map(([label, n, color]) => (
                  <div key={label} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{label}</span>
                      <span>{n}</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: `${(n / chartMax) * 100}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}

        {activeTab === 'wardmap' && (
          <div className="space-y-4">
            <div className="page-head">
              <div>
                <p className="eyebrow">Public view</p>
                <h2>City issue map</h2>
                <p>Every active civic problem by ward, area and status. No personal citizen information is shown.</p>
              </div>
            </div>
            <PublicWardMap
              tickets={tickets}
              height={560}
              onSelect={(id) => openTracker(id)}
            />
          </div>
        )}

        {activeTab === 'heatmap' && isOfficer && (
          <div className="space-y-4">
            <div className="page-head">
              <div>
                <p className="eyebrow">Ward intelligence</p>
                <h2>Issue heatmap</h2>
                <p>Report density by place, priority and overdue pressure. Filters apply to the map and the ranking.</p>
              </div>
            </div>
            <WardHeatmap tickets={tickets} onSelect={openTicket} height={560} />
          </div>
        )}

        {activeTab === 'performance' && isOfficer && (
          <div className="space-y-4">
            <div className="page-head">
              <div>
                <p className="eyebrow">Ward analytics</p>
                <h2>Ward performance & health</h2>
                <p>Resolution speed, SLA compliance, satisfaction, recurring problems and place risk scores.</p>
              </div>
            </div>
            <WardPerformance tickets={tickets} />
          </div>
        )}

        {activeTab === 'comparison' && isOfficer && (
          <div className="space-y-4">
            <div className="page-head">
              <div>
                <p className="eyebrow">Ward analytics</p>
                <h2>Ward comparison</h2>
                <p>Rank every active ward on one metric at a time.</p>
              </div>
            </div>
            <WardComparison tickets={tickets} />
          </div>
        )}

        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-4">
            <div className="page-head">
              <div>
                <p className="eyebrow">Administration</p>
                <h2>Wards & locations</h2>
                <p>Maintain the verified ward, area and place directory used for automatic ward detection.</p>
              </div>
            </div>
            <AdminLocations tickets={tickets} />
          </div>
        )}

        {activeTab === 'settings' && isOfficer && (
          <div className="max-w-2xl space-y-4">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2 className="text-2xl font-extrabold">SLA & duplicate settings</h2>
            </div>
            <div className="card card-pad space-y-3 text-sm">
              <p><strong>Profile:</strong> Logaranjan · Chennai ward officer / citizen demo</p>
              <p><strong>Database:</strong> {syncState.ok ? 'Supabase connected' : 'Local queue (offline)'}</p>
              <p className="text-slate-500">
                One civic problem maps to one officer ticket. Extra citizen reports increase report count and priority.
              </p>
            </div>
            <form
              className="card card-pad space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveSettings(civicSettings);
                setTickets((prev) => prev.map((t) => applyTicketLocation(t, civicSettings)));
                setNotification({ type: 'success', title: 'Settings saved', message: 'SLA and clustering rules updated.' });
              }}
            >
              <h3 className="section-title">Duplicate detection</h3>
              <label className="field-label" htmlFor="radius">Proximity radius (meters)</label>
              <input
                id="radius"
                type="number"
                min={10}
                max={500}
                className="field-control"
                value={civicSettings.proximityMeters}
                onChange={(e) => setCivicSettings({ ...civicSettings, proximityMeters: Number(e.target.value) })}
              />
              <h3 className="section-title">Officer response (max 2–3 days)</h3>
              <label className="field-label" htmlFor="max-resp">Maximum officer response hours</label>
              <input
                id="max-resp"
                type="number"
                min={24}
                max={72}
                className="field-control"
                value={civicSettings.responseMaxHours}
                onChange={(e) => setCivicSettings({ ...civicSettings, responseMaxHours: Number(e.target.value) })}
              />
              <label className="field-label" htmlFor="esc">Escalate after additional hours overdue</label>
              <input
                id="esc"
                type="number"
                min={12}
                max={168}
                className="field-control"
                value={civicSettings.escalateAfterHours}
                onChange={(e) => setCivicSettings({ ...civicSettings, escalateAfterHours: Number(e.target.value) })}
              />
              <h3 className="section-title">Category SLA (action hours / resolution days)</h3>
              {Object.keys(DEFAULT_SLA).map((band) => (
                <div key={band} className="sla-settings-row">
                  <strong>{band}</strong>
                  <label>
                    Action hours
                    <input
                      type="number"
                      className="field-control"
                      value={civicSettings.sla[band].actionHours}
                      onChange={(e) =>
                        setCivicSettings({
                          ...civicSettings,
                          sla: {
                            ...civicSettings.sla,
                            [band]: { ...civicSettings.sla[band], actionHours: Number(e.target.value) },
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Resolve days
                    <input
                      type="number"
                      className="field-control"
                      value={civicSettings.sla[band].resolutionDaysMax}
                      onChange={(e) =>
                        setCivicSettings({
                          ...civicSettings,
                          sla: {
                            ...civicSettings.sla,
                            [band]: { ...civicSettings.sla[band], resolutionDaysMax: Number(e.target.value) },
                          },
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              <button type="submit" className="primary-btn">Save SLA settings</button>
            </form>
          </div>
        )}

        {(activeTab === 'login' || activeTab === 'register') && (
          <CitizenAuth mode={activeTab === 'register' ? 'register' : 'login'} />
        )}

        {activeTab === 'officerLogin' && <OfficerLogin />}

        {activeTab === 'notFound' && (
          <EmptyState
            title="Page not found"
            body={`No page matches ${route.path}. Check the address or return to the Citizen Portal.`}
            action={
              <button type="button" className="primary-btn mt-4" onClick={() => go('home')}>
                Back to Citizen Portal
              </button>
            }
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Mobile">
        {[
          { id: 'home', label: 'Home', icon: Home },
          { id: 'reports', label: 'Reports', icon: Inbox },
          { id: 'tracker', label: 'Track', icon: Radio },
          isOfficer
            ? { id: 'dashboard', label: 'Officer', icon: LayoutDashboard }
            : { id: 'login', label: 'Account', icon: User },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className={activeTab === item.id ? 'is-active' : ''} onClick={() => go(item.id)}>
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {activeTab !== 'report' && (
        <button type="button" className="fab" onClick={() => go('report')} aria-label="Report an issue">
          <FileText className="w-5 h-5" />
        </button>
      )}

      {pendingDuplicate && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="dup-title">
          <div className="modal dup-modal">
            <p className="eyebrow">Nearby match · {pendingDuplicate.matchDistance}m</p>
            <h3 id="dup-title" className="font-bold text-lg">An existing report for this issue already exists nearby.</h3>
            <div className="dup-card">
              <p><strong>Existing Ticket:</strong> {displayTicketId(pendingDuplicate)}</p>
              <p><strong>Location:</strong> {locationLine(pendingDuplicate)}</p>
              <p><strong>Current Status:</strong> {STATUS_LABEL[pendingDuplicate.status] || pendingDuplicate.status}</p>
              <p>
                <strong>Reports:</strong> {pendingDuplicate.report_count || pendingDuplicate.priority_score} citizens have
                reported this issue.
              </p>
            </div>
            <p className="text-sm mt-3">Would you like to support this existing report?</p>
            <p className="text-xs text-slate-500 mt-1">
              Supporting adds your report to the same ticket. Officers still see one civic problem.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-5">
              <button
                type="button"
                className="ghost-btn"
                onClick={async () => {
                  const lat = parseFloat(formData.latitude);
                  const lon = parseFloat(formData.longitude);
                  setLoading(true);
                  await createFreshTicket(lat, lon);
                  setLoading(false);
                }}
              >
                Report a Different Issue
              </button>
              <button type="button" className="primary-btn" onClick={() => supportExisting(pendingDuplicate)}>
                Support Existing Report
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="toast-stack" role="status">
          <div className="toast">
            <strong>{notification.title || (notification.type === 'supported' ? 'Report added' : 'Report logged')}</strong>
            <p className="mt-1 text-slate-600">{notification.message}</p>
          </div>
        </div>
      )}

      {notifyOpen && (
        <div className="toast-stack notify-drawer">
          <div className="toast">
            <div className="notify-head">
              <strong>Notifications</strong>
              {unreadCount > 0 && (
                <button type="button" className="link-btn" onClick={markNotificationsRead}>
                  Mark all read ({unreadCount})
                </button>
              )}
            </div>
            {user ? (
              userNotifications.length > 0 && (
                <>
                  <h4 className="eyebrow mt-3">Your updates</h4>
                  <ul className="notify-list">
                    {userNotifications.slice(0, 6).map((n) => (
                      <li key={n.id} className={n.read_at ? '' : 'notify-unread'}>
                        <strong>{n.title}</strong>
                        <p>{n.body}</p>
                        <p className="notify-meta">
                          {formatDate(n.created_at)}
                          {n.ticket_id ? ` · ${n.ticket_id}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : (
              <p className="mt-1 text-slate-600">Sign in to see status updates about your own complaints here.</p>
            )}
            <h4 className="eyebrow mt-3">Dispatch activity</h4>
            {alerts.length === 0 ? (
              <p className="mt-1 text-slate-600">No new municipal alerts. Due-soon and overdue tickets appear here.</p>
            ) : (
              <ul className="notify-list">
                {alerts.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <strong>{a.title}</strong>
                    <p>{a.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {confirmResolve && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="modal">
            <h3 id="confirm-title" className="font-bold text-lg">Close this civic issue?</h3>
            <p className="text-sm text-slate-500 mt-2">
              Ticket {displayTicketId(tickets.find((t) => t.id === confirmResolve) || { id: confirmResolve })} cannot be
              marked resolved without a resolution note.
            </p>
            <label className="field-label" htmlFor="res-note">Resolution note</label>
            <textarea
              id="res-note"
              className="field-control"
              rows={3}
              required
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Pothole repaired and road surface restored."
            />
            <label className="field-label" htmlFor="after-photo">After photo URL (optional)</label>
            <input
              id="after-photo"
              className="field-control"
              value={afterPhoto}
              onChange={(e) => setAfterPhoto(e.target.value)}
              placeholder="https://…"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="ghost-btn" onClick={() => setConfirmResolve(null)}>Cancel</button>
              <button
                type="button"
                className="primary-btn"
                disabled={!resolutionNote.trim()}
                onClick={() => handleStatusChange(confirmResolve, 'Resolved')}
              >
                Confirm resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
