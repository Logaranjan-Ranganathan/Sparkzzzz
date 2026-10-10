/** Duplicate detection, SLA deadlines, and civic priority for UrbanGrid. */

export const SETTINGS_KEY = 'urbangrid_sla_settings';

export const DEFAULT_SLA = {
  Critical: { actionHours: 24, resolutionDaysMin: 1, resolutionDaysMax: 2 },
  High: { actionHours: 24, resolutionDaysMin: 2, resolutionDaysMax: 3 },
  Medium: { actionHours: 48, resolutionDaysMin: 3, resolutionDaysMax: 5 },
  Low: { actionHours: 72, resolutionDaysMin: 5, resolutionDaysMax: 7 },
};

export const DEFAULT_SETTINGS = {
  proximityMeters: 50,
  responseMaxHours: 72,
  escalateAfterHours: 48,
  sla: DEFAULT_SLA,
};

export const CATEGORY_GROUPS = {
  'Road / Pothole': 'road',
  Garbage: 'waste',
  Streetlight: 'light',
  Drainage: 'water',
  Water: 'water',
  Other: 'other',
};

const CRITICAL_HINTS =
  /collapse|manhole|pipeline burst|electrical hazard|traffic signal|live wire|open drain danger/i;
const HIGH_HINTS =
  /large pothole|major garbage|broken streetlight|significant drainage|dangerous/i;

export const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, sla: { ...DEFAULT_SLA } };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      sla: { ...DEFAULT_SLA, ...(parsed.sla || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, sla: { ...DEFAULT_SLA } };
  }
};

export const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const displayTicketId = (ticket) => ticket?.ticket_id || ticket?.id || '—';

export const nextTicketId = (tickets = []) => {
  const year = new Date().getFullYear();
  let max = 100;
  tickets.forEach((t) => {
    const ids = [t.ticket_id, t.id].filter(Boolean).map(String);
    ids.forEach((id) => {
      const ug = id.match(/UG-(\d{4})-(\d+)/i);
      if (ug && Number(ug[1]) === year) max = Math.max(max, Number(ug[2]));
      const legacy = id.match(/^t-(\d+)/i);
      if (legacy) max = Math.max(max, Number(legacy[1]));
    });
  });
  return `UG-${year}-${String(max + 1).padStart(5, '0')}`;
};

export const tokenOverlap = (a = '', b = '') => {
  const tok = (s) =>
    new Set(
      String(s)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((w) => {
    if (B.has(w)) hit += 1;
  });
  return hit / Math.min(A.size, B.size);
};

export const categoriesSimilar = (a, b) => {
  if (!a || !b) return true;
  if (a === b) return true;
  return CATEGORY_GROUPS[a] === CATEGORY_GROUPS[b];
};

export const inferSeverityLabel = (category, description = '', reportCount = 1) => {
  if (CRITICAL_HINTS.test(description)) return 'Critical';
  if (HIGH_HINTS.test(description)) return 'High';
  if (/pothole|road/i.test(description) && /major|deep|collapse/i.test(description)) return 'Critical';
  if (category === 'Road / Pothole' && /collapse|fracture|hazard/i.test(description)) return 'High';
  if (reportCount >= 11) return 'Critical';
  if (reportCount >= 6) return 'High';
  if (reportCount >= 3) return 'Medium';
  if (category === 'Streetlight' || category === 'Garbage') return 'Medium';
  return 'Low';
};

export const priorityBand = (score, status) => {
  if (status === 'Resolved') return { label: 'Resolved', cls: 'badge badge-resolved', rank: 0 };
  if (score >= 4) return { label: 'Critical', cls: 'badge badge-crit', rank: 4 };
  if (score >= 3) return { label: 'High', cls: 'badge badge-high', rank: 3 };
  if (score >= 2) return { label: 'Medium', cls: 'badge badge-med', rank: 2 };
  return { label: 'Low', cls: 'badge badge-low', rank: 1 };
};

export const calculatePriorityScore = ({
  reportCount = 1,
  category = 'Other',
  description = '',
  createdAt,
  slaStatus,
  status,
} = {}) => {
  if (status === 'Resolved') return 1;
  let score;
  if (reportCount >= 11) score = 4;
  else if (reportCount >= 6) score = 3;
  else if (reportCount >= 3) score = 2;
  else score = 1;

  const severity = inferSeverityLabel(category, description, reportCount);
  const sevMap = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  score = Math.max(score, sevMap[severity] || 1);

  const ageHours = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 36e5 : 0;
  if (ageHours > 48 && status !== 'Resolved') score += 0.5;
  if (slaStatus === 'overdue' || slaStatus === 'breached') score += 1;

  return Math.min(5, Number(score.toFixed(1)));
};

const addHours = (iso, hours) => new Date(new Date(iso).getTime() + hours * 36e5).toISOString();
const addDays = (iso, days) => addHours(iso, days * 24);

export const computeDeadlines = (ticket, settings = DEFAULT_SETTINGS, now = Date.now()) => {
  const created = ticket.created_at || new Date(now).toISOString();
  const reportCount = ticket.report_count || ticket.priority_score || 1;
  const category = ticket.category || 'Other';
  const band = inferSeverityLabel(category, ticket.description, reportCount);
  const sla = settings.sla?.[band] || DEFAULT_SLA[band] || DEFAULT_SLA.Medium;
  const actionHours = Math.min(sla.actionHours, settings.responseMaxHours || 72);
  const responseDeadline = ticket.response_deadline || addHours(created, actionHours);
  const deadline = ticket.deadline || addDays(created, sla.resolutionDaysMax);
  const remainingMs = new Date(responseDeadline).getTime() - now;
  const resolutionRemaining = new Date(deadline).getTime() - now;

  let slaStatus = ticket.status === 'Resolved' ? 'resolved' : 'on_track';
  if (ticket.status !== 'Resolved') {
    if (remainingMs < 0) slaStatus = 'overdue';
    else if (remainingMs < 24 * 36e5) slaStatus = 'due_soon';
  }

  const officerResponded = ['Assigned', 'In Progress', 'Resolved'].includes(ticket.status);
  if (officerResponded && slaStatus === 'overdue') slaStatus = remainingMs < 0 ? 'overdue' : slaStatus;
  if (ticket.status !== 'Resolved' && remainingMs < 0) slaStatus = 'overdue';

  const escalateAfter = (settings.escalateAfterHours || 48) * 36e5;
  let escalationLevel = ticket.escalation_level || 0;
  if (ticket.status !== 'Resolved' && remainingMs < 0) {
    const overdueFor = -remainingMs;
    if (overdueFor > escalateAfter * 2) escalationLevel = 3;
    else if (overdueFor > escalateAfter) escalationLevel = 2;
    else escalationLevel = Math.max(escalationLevel, 1);
  }

  return {
    band,
    response_deadline: responseDeadline,
    deadline,
    sla_status: slaStatus,
    escalation_level: escalationLevel,
    remainingMs,
    resolutionRemaining,
  };
};

export const slaMeta = (ticket, settings, now = Date.now()) => {
  const d = computeDeadlines(ticket, settings, now);
  const hours = Math.abs(d.remainingMs) / 36e5;
  const days = Math.floor(hours / 24);
  const hrs = Math.floor(hours % 24);
  const part = [days ? `${days} day${days === 1 ? '' : 's'}` : null, `${hrs} hour${hrs === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' ');

  let tone = 'on-track';
  let label = 'On Track';
  let countdown = `⏱ ${part} remaining`;
  if (ticket.status === 'Resolved') {
    tone = 'resolved';
    label = 'Resolved';
    countdown = 'Closed';
  } else if (d.sla_status === 'overdue') {
    tone = 'overdue';
    label = 'Overdue';
    countdown = `OVERDUE BY ${part.toUpperCase()}`;
  } else if (d.sla_status === 'due_soon') {
    tone = 'due-soon';
    label = 'Due Soon';
    countdown = `⏱ ${part} remaining`;
  }

  return { ...d, tone, label, countdown, hoursLeft: d.remainingMs / 36e5 };
};

export const isDueOnDay = (iso, offsetDays = 0, now = new Date()) => {
  if (!iso) return false;
  const d = new Date(iso);
  const target = new Date(now);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + offsetDays);
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate();
};

export const findDuplicateTicket = (tickets, { latitude, longitude, category, description, place_id, ward_id }, settings, distanceFn) => {
  const radius = Number(settings.proximityMeters) || 50;
  const active = tickets.filter((t) => t.status !== 'Resolved');
  const scored = active
    .map((ticket) => {
      const dist = distanceFn(
        latitude,
        longitude,
        Number(ticket.latitude),
        Number(ticket.longitude)
      );
      const catOk = categoriesSimilar(category, ticket.category);
      const near = dist <= radius;
      if (!near || !catOk) return null;
      return {
        ticket,
        dist,
        text: tokenOverlap(description, ticket.description),
        samePlace: Boolean(place_id && ticket.place_id === place_id),
        sameWard: Boolean(ward_id && ticket.ward_id === ward_id),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(b.samePlace) - Number(a.samePlace) ||
        Number(b.sameWard) - Number(a.sameWard) ||
        a.dist - b.dist ||
        b.text - a.text
    );
  return scored[0] || null;
};

export const sortOfficerQueue = (tickets, settings) =>
  [...tickets].sort((a, b) => {
    const sa = slaMeta(a, settings);
    const sb = slaMeta(b, settings);
    const overdueRank = (s) => (s.sla_status === 'overdue' ? 0 : s.sla_status === 'due_soon' ? 1 : 2);
    if (overdueRank(sa) !== overdueRank(sb)) return overdueRank(sa) - overdueRank(sb);
    const pa = priorityBand(a.priority_score, a.status).rank;
    const pb = priorityBand(b.priority_score, b.status).rank;
    if (pb !== pa) return pb - pa;
    if (sa.remainingMs !== sb.remainingMs) return sa.remainingMs - sb.remainingMs;
    const ra = a.report_count || a.priority_score || 0;
    const rb = b.report_count || b.priority_score || 0;
    if (rb !== ra) return rb - ra;
    return (b.priority_score || 0) - (a.priority_score || 0);
  });

export const ESCALATION_ROLES = ['Responsible Officer', 'Senior Officer', 'Ward Supervisor', 'Administrator'];

export const buildEscalationTimeline = (ticket, settings) => {
  const created = ticket.created_at;
  const d = computeDeadlines(ticket, settings);
  const log = [
    { at: created, title: 'Reported', detail: 'Citizen report received.', actor: 'Citizen desk' },
  ];
  if (ticket.status !== 'Open') {
    log.push({
      at: ticket.updated_at || created,
      title: ticket.status,
      detail: ticket.latest_update || `Moved to ${ticket.status}.`,
      actor: ticket.assigned_officer || 'Ward operations',
    });
  }
  if (d.sla_status === 'overdue' || ticket.escalation_level >= 1) {
    log.push({
      at: d.response_deadline,
      title: 'SLA BREACHED',
      detail: 'No officer response before the deadline. Priority increased.',
      actor: 'SLA engine',
      warn: true,
    });
  }
  if ((ticket.escalation_level || d.escalation_level) >= 2) {
    log.push({
      at: addHours(d.response_deadline, settings.escalateAfterHours || 48),
      title: 'Escalated to Ward Supervisor',
      detail: 'Issue remained unresolved after the breach window.',
      actor: 'Ward Supervisor',
      warn: true,
    });
  }
  if ((ticket.escalation_level || d.escalation_level) >= 3) {
    log.push({
      at: addHours(d.response_deadline, (settings.escalateAfterHours || 48) * 2),
      title: 'Escalated to Administrator',
      detail: 'Senior municipal review required.',
      actor: 'Administrator',
      warn: true,
    });
  }
  if (ticket.resolved_at) {
    log.push({
      at: ticket.resolved_at,
      title: 'Resolved',
      detail: ticket.resolution_note || 'Issue marked resolved.',
      actor: ticket.assigned_officer || 'Field team',
    });
  }
  return log;
};

/* ---------- civic issue timeline (spec §25) ---------- */

export const TIMELINE_STAGES = [
  { key: 'citizen_reported', label: 'Citizen Reported', actor: 'Citizen' },
  { key: 'duplicate_check', label: 'Duplicate Check', actor: 'UrbanGrid system' },
  { key: 'ward_identified', label: 'Ward Identified', actor: 'UrbanGrid system' },
  { key: 'priority_calculated', label: 'Priority Calculated', actor: 'Priority engine' },
  { key: 'officer_assigned', label: 'Officer Assigned', actor: 'Ward office' },
  { key: 'officer_responded', label: 'Officer Responded', actor: 'Assigned officer' },
  { key: 'repair_started', label: 'Repair Started', actor: 'Field team' },
  { key: 'resolution_submitted', label: 'Resolution Submitted', actor: 'Assigned officer' },
  { key: 'citizen_verification', label: 'Citizen Verification', actor: 'Citizen' },
  { key: 'closed', label: 'Closed', actor: 'UrbanGrid system' },
];

export const timelineEvent = (stage, note, at = new Date().toISOString()) => ({ stage, at, note });

/** Stored events for a brand-new ticket — stages 1–4 happen at creation. */
export function seedTimeline(ticket, { duplicateMerged = false } = {}) {
  const now = new Date().toISOString();
  const wardNote = ticket.ward_id
    ? `${ticket.ward_name || ticket.ward_id} (${ticket.ward_id}) — ${
        ticket.ward_detection === 'manual' ? 'ward selected by citizen' : 'auto-detected from location'
      }`
    : 'Ward could not be identified automatically.';
  return [
    timelineEvent('citizen_reported', `Report received for ${ticket.category}.`, ticket.created_at || now),
    timelineEvent(
      'duplicate_check',
      duplicateMerged
        ? 'Matched an existing active ticket for the same problem — merged as a duplicate report.'
        : 'No existing active ticket matched this location and category.',
      now
    ),
    timelineEvent('ward_identified', wardNote, now),
    timelineEvent(
      'priority_calculated',
      `Priority score ${ticket.priority_score} · report count ${ticket.report_count}.`,
      now
    ),
  ];
}

/**
 * Full 10-stage timeline for a ticket. Stored events (ticket.timeline) win;
 * missing stages are derived from status with deterministic timestamps.
 */
export function buildTicketTimeline(ticket, settings = DEFAULT_SETTINGS) {
  const stored = new Map(
    (Array.isArray(ticket.timeline) ? ticket.timeline : []).filter((e) => e && e.stage).map((e) => [e.stage, e])
  );
  const created = ticket.created_at || new Date().toISOString();
  const plus = (mins) => new Date(new Date(created).getTime() + mins * 60000).toISOString();
  const reportCount = Number(ticket.report_count) || 1;
  const assigned = ['Assigned', 'In Progress', 'Resolved'].includes(ticket.status);
  const repairing = ['In Progress', 'Resolved'].includes(ticket.status);
  const resolved = ticket.status === 'Resolved' && ticket.resolved_at;
  const verified = Boolean(ticket.satisfaction);
  const reopened = verified && ticket.satisfaction === 'down' && ticket.status !== 'Resolved';
  const band = computeDeadlines(ticket, settings).band;
  const lastTouch = ticket.updated_at || ticket.resolved_at || created;

  const stages = [
    {
      key: 'citizen_reported',
      done: true,
      at: created,
      note: `Report received for ${ticket.category}.`,
    },
    {
      key: 'duplicate_check',
      done: true,
      at: plus(2),
      note:
        reportCount > 1
          ? `${reportCount} citizens reported this same problem — merged into one ticket (ONE problem = ONE ticket).`
          : 'No existing active ticket matched this location and category.',
    },
    {
      key: 'ward_identified',
      done: Boolean(ticket.ward_id),
      at: plus(4),
      note: ticket.ward_id
        ? `${ticket.ward_name || ticket.ward_id} (${ticket.ward_id}) — ${
            ticket.ward_detection === 'manual' ? 'ward selected by citizen' : 'auto-detected from location'
          }`
        : 'Ward could not be identified automatically.',
    },
    {
      key: 'priority_calculated',
      done: true,
      at: plus(6),
      note: `Priority ${ticket.priority_score} (${priorityBand(ticket.priority_score, ticket.status).label}) · SLA band ${band}.`,
    },
    {
      key: 'officer_assigned',
      done: assigned,
      at: lastTouch,
      note: assigned
        ? `${ticket.assigned_officer || 'Ward officer'}${ticket.department ? ` · ${ticket.department}` : ''}`
        : 'Awaiting officer assignment.',
    },
    {
      key: 'officer_responded',
      done: assigned,
      at: lastTouch,
      note: assigned ? 'Officer acknowledged the ticket within the response window.' : 'Pending officer response.',
    },
    {
      key: 'repair_started',
      done: repairing,
      at: lastTouch,
      note: repairing ? ticket.latest_update || 'Field crew dispatched to the site.' : 'Repair not started yet.',
    },
    {
      key: 'resolution_submitted',
      done: Boolean(resolved),
      at: ticket.resolved_at || null,
      note: reopened
        ? 'Previous resolution rejected by the citizen — a new resolution is required.'
        : resolved
          ? ticket.resolution_note || 'Resolution submitted for citizen verification.'
          : 'Pending resolution.',
    },
    {
      key: 'citizen_verification',
      done: verified,
      at: ticket.feedback_at || null,
      note: verified
        ? ticket.satisfaction === 'up'
          ? `Citizen confirmed the fix 👍${ticket.rating ? ` · ${ticket.rating}★` : ''}`
          : 'Citizen reported the problem persists 👎 — reopened for review.'
        : resolved
          ? 'Awaiting citizen verification (👍 / 👎).'
          : 'Opens after the officer submits a resolution.',
    },
    {
      key: 'closed',
      done: verified && ticket.satisfaction === 'up',
      at: ticket.feedback_at || null,
      note:
        verified && ticket.satisfaction === 'up'
          ? 'Ticket closed after positive citizen verification.'
          : 'Closes after the citizen confirms the resolution.',
    },
  ];

  let currentAssigned = false;
  return TIMELINE_STAGES.map((meta) => {
    const stage = stages.find((s) => s.key === meta.key);
    const event = stored.get(meta.key);
    let status;
    if (stage.done) status = 'done';
    else if (!currentAssigned && meta.key !== 'closed') {
      status = 'current';
      currentAssigned = true;
    } else status = 'pending';
    return {
      ...meta,
      status,
      at: event?.at || stage.at,
      note: event?.note || stage.note,
    };
  });
}

/** Spec §26 — apply 👍/👎 (+ optional 1–5★) after resolution. 👎 reopens the ticket. */
export function applyCitizenFeedback(ticket, { satisfaction, rating } = {}) {
  const now = new Date().toISOString();
  const events = Array.isArray(ticket.timeline) ? [...ticket.timeline] : [];
  const patch = {
    satisfaction,
    rating: Number.isFinite(Number(rating)) && rating ? Number(rating) : null,
    feedback_at: now,
    timeline: events,
  };
  patch.timeline.push(
    timelineEvent(
      'citizen_verification',
      satisfaction === 'up'
        ? `Citizen confirmed the resolution 👍${rating ? ` · ${rating}★` : ''}`
        : 'Citizen reported the problem persists 👎.',
      now
    )
  );
  if (satisfaction === 'up') {
    patch.timeline.push(timelineEvent('closed', 'Ticket closed after citizen verification.', now));
  } else {
    patch.status = 'In Progress';
    patch.latest_update = 'Reopened after citizen reported the problem persists.';
    patch.timeline.push(timelineEvent('repair_started', 'Reopened for a second resolution attempt.', now));
  }
  return patch;
}

export const citizenUpdateCopy = (ticket) => {  if (ticket.status === 'Resolved') return ticket.resolution_note || 'Your civic issue has been resolved.';
  if (ticket.status === 'In Progress') return ticket.latest_update || 'Maintenance team is on site working this issue.';
  if (ticket.status === 'Assigned') return ticket.latest_update || 'Your issue has been assigned to the maintenance team.';
  if (ticket.status === 'Under Review') return 'Municipal desk is reviewing this report.';
  return 'Your report has been received.';
};

/**
 * Spec §19 — ward notification system. Titles carry the ward alert format
 * (e.g. "🚨 WARD-001 ALERT — SLA Breached").
 */
export const notificationForEvent = (type, ticket) => {
  const id = displayTicketId(ticket);
  const ward = ticket?.ward_id || ticket?.ward || '';
  const place = ticket?.place_name || ticket?.area || 'the reported location';
  const category = ticket?.category || 'issue';
  const officer = ticket?.assigned_officer || 'the ward officer';
  const w = (core) => (ward ? `${ward} — ${core}` : core);
  const reports = Number(ticket?.report_count) || 1;
  const priority = priorityBand(ticket?.priority_score, ticket?.status).label;

  const map = {
    created: {
      title: w('📍 New Issue Reported'),
      message: `${category} at ${place} · Ticket ${id} · Priority ${priority}. Ward auto-detection applied.`,
      tone: 'info',
    },
    supported: {
      title: w('📍 Duplicate Report Merged'),
      message: `Another citizen reported the same ${category} at ${place}. Ticket ${id} now has ${reports} reports — one real-world problem, one ticket.`,
      tone: 'info',
    },
    surge: {
      title: w('⚠️ ALERT — Duplicate Surge'),
      message: `${reports} citizens have now reported ${category} at ${place} (Ticket ${id}). Priority automatically raised to ${priority}.`,
      tone: 'pending',
    },
    critical: {
      title: w('🚨 ALERT — Critical Priority'),
      message: `Ticket ${id} (${category}, ${place}) was scored CRITICAL. Immediate ward officer dispatch recommended.`,
      tone: 'urgent',
    },
    assigned: {
      title: w('✅ Officer Assigned'),
      message: `Ticket ${id} assigned to ${officer}${ticket?.department ? ` (${ticket.department})` : ''}. Response clock started.`,
      tone: 'ok',
    },
    responded: {
      title: w('🔧 Officer Responded'),
      message: `${officer} responded to Ticket ${id} (${category} at ${place}).`,
      tone: 'ok',
    },
    due_soon: {
      title: w('⏰ SLA Approaching'),
      message: `Ticket ${id} (${category} at ${place}) is due within 24 hours. Ensure the officer responds on time.`,
      tone: 'pending',
    },
    overdue: {
      title: w('🚨 ALERT — SLA Breached'),
      message: `Ticket ${id} (${category} at ${place}) has exceeded its response deadline. Escalation level ${ticket?.escalation_level || 1}.`,
      tone: 'urgent',
    },
    escalated: {
      title: w('🚨 ALERT — Escalated'),
      message: `Ticket ${id} breached SLA and escalated to ${ESCALATION_ROLES[ticket?.escalation_level] || ESCALATION_ROLES[1]}.`,
      tone: 'urgent',
    },
    resolved: {
      title: w('✅ Issue Resolved'),
      message: `Ticket ${id} (${category} at ${place}) was resolved. ${ticket?.resolution_note || 'Resolution submitted for citizen verification.'}`,
      tone: 'ok',
    },
    reopened: {
      title: w('🔁 ALERT — Citizen Reopened'),
      message: `The citizen rejected the resolution for Ticket ${id} (${category} at ${place}). Ticket reopened — second resolution required.`,
      tone: 'urgent',
    },
  };
  return {
    type,
    ticketId: ticket?.id,
    wardId: ward,
    at: new Date().toISOString(),
    ...(map[type] || { title: w('Update'), message: '', tone: 'info' }),
  };
};

export const enrichTicket = (ticket, settings = DEFAULT_SETTINGS) => {
  const report_count = Number(ticket.report_count || ticket.priority_score || 1);
  const sla = computeDeadlines({ ...ticket, report_count }, settings);
  const priority_score = calculatePriorityScore({
    reportCount: report_count,
    category: ticket.category,
    description: ticket.description,
    createdAt: ticket.created_at,
    slaStatus: sla.sla_status,
    status: ticket.status,
  });
  const ticket_id =
    ticket.ticket_id ||
    (String(ticket.id || '').startsWith('t-')
      ? `UG-${new Date().getFullYear()}-${String(ticket.id).replace(/\D/g, '').padStart(5, '0')}`
      : ticket.id);
  return {
    ...ticket,
    ticket_id,
    report_count,
    priority_score,
    response_deadline: sla.response_deadline,
    deadline: sla.deadline,
    sla_status: sla.sla_status,
    escalation_level: sla.escalation_level,
    latest_reported_at: ticket.latest_reported_at || ticket.created_at,
    assigned_officer: ticket.assigned_officer || (ticket.status === 'Assigned' || ticket.status === 'In Progress' ? 'Ward Field Unit' : ''),
    assigned_officer_id: ticket.assigned_officer_id || '',
    officer_name: ticket.officer_name || '',
    department: ticket.department || '',
    latest_update: ticket.latest_update || '',
    resolution_note: ticket.resolution_note || '',
    resolved_at: ticket.resolved_at || (ticket.status === 'Resolved' ? ticket.updated_at || ticket.created_at : null),
    place_id: ticket.place_id || '',
    area_id: ticket.area_id || '',
    street: ticket.street || '',
    ward_number: ticket.ward_number || '',
    ward_name: ticket.ward_name || '',
    zone: ticket.zone || '',
    ward_detection: ticket.ward_detection || 'auto',
    timeline: Array.isArray(ticket.timeline) ? ticket.timeline : [],
    satisfaction: ticket.satisfaction || null,
    rating: Number.isFinite(Number(ticket.rating)) ? Number(ticket.rating) : null,
    feedback_at: ticket.feedback_at || null,
    after_photo_url: ticket.after_photo_url || '',
  };
};

export const ticketPayload = (ticket) => ({
  id: ticket.id,
  ticket_id: ticket.ticket_id,
  description: ticket.description,
  image_url: ticket.image_url || '',
  latitude: ticket.latitude,
  longitude: ticket.longitude,
  place_id: ticket.place_id || '',
  place_name: ticket.place_name || '',
  street: ticket.street || '',
  area_id: ticket.area_id || '',
  area: ticket.area || '',
  address: ticket.address || '',
  ward_id: ticket.ward_id || ticket.ward || '',
  ward_number: ticket.ward_number || '',
  ward_name: ticket.ward_name || '',
  zone: ticket.zone || '',
  ward_detection: ticket.ward_detection || 'auto',
  category: ticket.category,
  status: ticket.status,
  user_id: ticket.user_id || null,
  priority_score: ticket.priority_score,
  report_count: ticket.report_count,
  created_at: ticket.created_at,
  updated_at: ticket.updated_at || ticket.created_at,
  latest_reported_at: ticket.latest_reported_at,
  deadline: ticket.deadline,
  response_deadline: ticket.response_deadline,
  sla_status: ticket.sla_status,
  escalation_level: ticket.escalation_level || 0,
  assigned_officer: ticket.assigned_officer || '',
  assigned_officer_id: ticket.assigned_officer_id || '',
  officer_name: ticket.officer_name || '',
  department: ticket.department || '',
  resolved_at: ticket.resolved_at || null,
  resolution_note: ticket.resolution_note || '',
  after_photo_url: ticket.after_photo_url || '',
  latest_update: ticket.latest_update || '',
  timeline: Array.isArray(ticket.timeline) ? ticket.timeline : [],
  satisfaction: ticket.satisfaction || null,
  rating: Number.isFinite(Number(ticket.rating)) ? Number(ticket.rating) : null,
  feedback_at: ticket.feedback_at || null,
  postal_code: ticket.postal_code || '',
  city: ticket.city || '',
  state: ticket.state || '',
});
