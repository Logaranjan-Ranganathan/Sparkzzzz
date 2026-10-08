/**
 * Ward analytics for UrbanGrid (pure functions over the live ticket list).
 *
 * Covers spec §7–§14, §23, §24:
 *   - wardStats        → per-ward KPIs, performance score (/100) and Ward
 *                        Health Score (/100, stars, status)
 *   - topProblemPlaces → top problem locations per ward (§9)
 *   - areaHealth       → smart clustering by category within an area (§11)
 *   - recurringIssues  → monthly trend detection + recommendations (§12)
 *   - maintenanceAlerts→ repeated-complaint alerts (§13)
 *   - placeRiskScores  → Area/Place Risk Score 0–100 with reasons (§24)
 *   - comparisonRows   → ward comparison metrics (§14)
 */
import { getActiveWards, areaById, placeById, wardById } from '../location/wardDirectory';

const ACTIVE_STATUSES = ['Open', 'Under Review', 'Assigned', 'In Progress'];
const isOpen = (t) => ['Open', 'Under Review'].includes(t.status);
const inProgress = (t) => ['Assigned', 'In Progress'].includes(t.status);
const isActive = (t) => ACTIVE_STATUSES.includes(t.status);
const isCritical = (t) => Number(t.priority_score) >= 4;
const isOverdue = (t) => isActive(t) && t.sla_status === 'overdue';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const dayMs = 24 * 60 * 60 * 1000;

function daysBetween(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / dayMs;
}

const monthKey = (date) => {
  const d = new Date(date);
  return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null;
};

const monthLabel = (key) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en', { month: 'short' });
};

const inWard = (t, wardId) => !wardId || wardId === 'all' || t.ward_id === wardId;

const CATEGORY_RECOMMENDATION = {
  'Road / Pothole': 'Inspect underlying road condition and schedule permanent re-laying instead of patch work.',
  Garbage: 'Review bin placement and increase collection frequency for this location.',
  Streetlight: 'Audit the streetlight circuit and replace the failing pole segment permanently.',
  Drainage: 'Inspect and desilt the drainage line; check for upstream blockage.',
  Water: 'Check the supply pipeline for leaks or pressure failure at this location.',
  Other: 'Inspect the site for an underlying recurring cause.',
};

export function starsFromScore(score) {
  return clamp(Math.round((Number(score) || 0) / 20), 1, 5);
}

export function healthStatus(score) {
  if (score >= 85) return { label: 'Excellent', tone: 'ok' };
  if (score >= 70) return { label: 'Good', tone: 'info' };
  if (score >= 50) return { label: 'Needs Attention', tone: 'pending' };
  return { label: 'Critical', tone: 'urgent' };
}

/**
 * Per-ward KPIs + performance & health scores.
 * wardId: 'all' or a WARD-xxx id (null/'' treated as all).
 */
export function wardStats(tickets = [], wardId = 'all') {
  const scoped = tickets.filter((t) => inWard(t, wardId));
  const ward = wardId && wardId !== 'all' ? wardById(wardId) : null;

  const total = scoped.length;
  const open = scoped.filter(isOpen).length;
  const progress = scoped.filter(inProgress).length;
  const resolved = scoped.filter((t) => t.status === 'Resolved').length;
  const critical = scoped.filter((t) => isActive(t) && isCritical(t)).length;
  const overdue = scoped.filter(isOverdue).length;
  const active = open + progress;

  const resolvedTickets = scoped.filter((t) => t.status === 'Resolved' && t.resolved_at);
  const resolutionDays = resolvedTickets
    .map((t) => daysBetween(t.created_at, t.resolved_at))
    .filter((d) => d !== null && d >= 0);
  const avgResolutionDays = resolutionDays.length
    ? resolutionDays.reduce((s, d) => s + d, 0) / resolutionDays.length
    : null;

  const onTime = resolvedTickets.filter((t) => new Date(t.resolved_at) <= new Date(t.deadline || t.resolved_at));
  const slaCompliance = resolvedTickets.length ? Math.round((onTime.length / resolvedTickets.length) * 100) : null;

  const rated = scoped.filter((t) => t.satisfaction === 'up' || t.satisfaction === 'down');
  const thumbsUp = rated.filter((t) => t.satisfaction === 'up').length;
  const satisfaction = rated.length ? Math.round((thumbsUp / rated.length) * 100) : null;
  const ratedStars = scoped.filter((t) => Number.isFinite(Number(t.rating)));
  const avgRating = ratedStars.length
    ? ratedStars.reduce((s, t) => s + Number(t.rating), 0) / ratedStars.length
    : null;

  /* Performance score /100 (spec §8) */
  const resolutionRate = total ? resolved / total : 0;
  const slaFactor = slaCompliance === null ? 0.7 : slaCompliance / 100;
  const speedFactor = avgResolutionDays === null ? 0.6 : clamp((14 - avgResolutionDays) / 14, 0, 1);
  const overdueFactor = active ? clamp(1 - overdue / active, 0, 1) : 1;
  const criticalFactor = active ? clamp(1 - critical / active, 0, 1) : 1;
  const satisfactionFactor = satisfaction === null ? 0.8 : satisfaction / 100;
  const performanceScore = Math.round(
    100 *
      (0.3 * resolutionRate +
        0.25 * slaFactor +
        0.15 * speedFactor +
        0.1 * overdueFactor +
        0.05 * criticalFactor +
        0.15 * satisfactionFactor)
  );

  /* Ward Health Score /100 (spec §23) */
  const unresolvedRate = total ? active / total : 0;
  const criticalRate = total ? critical / total : 0;
  const breachRate = active ? overdue / active : 0;
  const speedPenalty = avgResolutionDays === null ? 0.1 : clamp(avgResolutionDays / 21, 0, 1);
  const recurring = recurringIssues(tickets, wardId);
  const recurringPenalty = recurring.length >= 3 ? 1 : recurring.length ? 0.5 : 0;
  const satisfactionPenalty = satisfaction === null ? 0.2 : 1 - satisfaction / 100;
  const healthScore = Math.round(
    clamp(
      100 -
        35 * unresolvedRate -
        15 * criticalRate -
        20 * breachRate -
        10 * speedPenalty -
        10 * recurringPenalty -
        10 * satisfactionPenalty,
      0,
      100
    )
  );

  return {
    ward,
    total,
    open,
    inProgress: progress,
    resolved,
    critical,
    overdue,
    active,
    avgResolutionDays,
    slaCompliance,
    satisfaction,
    avgRating,
    ratedCount: rated.length,
    performanceScore,
    healthScore,
    healthStatus: healthStatus(healthScore),
    stars: starsFromScore(healthScore),
    recurringCount: recurring.length,
  };
}

/** Spec §9 — top problem locations per ward. */
export function topProblemPlaces(tickets = [], wardId = 'all', limit = 5) {
  const scoped = tickets.filter((t) => inWard(t, wardId));
  const groups = new Map();
  scoped.forEach((t) => {
    const key = t.place_id || t.place_name || 'unknown';
    const group = groups.get(key) || { key, place: null, total: 0, active: 0, reports: 0, categories: {} };
    if (!group.place) group.place = placeById(t.place_id) || (t.place_name ? { place_name: t.place_name, place_id: t.place_id || '' } : null);
    group.total += 1;
    if (isActive(t)) group.active += 1;
    group.reports += Number(t.report_count) || 1;
    group.categories[t.category] = (group.categories[t.category] || 0) + 1;
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((g) => {
      const dominant = Object.entries(g.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      return {
        place: g.place,
        place_name: g.place?.place_name || g.key,
        total: g.total,
        active: g.active,
        reports: g.reports,
        dominantCategory: dominant,
        categories: g.categories,
      };
    })
    .sort((a, b) => b.active - a.active || b.reports - a.reports || b.total - a.total)
    .slice(0, limit);
}

/** Spec §11 — AREA HEALTH: cluster issues by category within each area. */
export function areaHealth(tickets = [], wardId = 'all') {
  const scoped = tickets.filter((t) => inWard(t, wardId));
  const groups = new Map();
  scoped.forEach((t) => {
    const key = t.area_id || t.area || 'unknown';
    const group = groups.get(key) || {
      area_id: t.area_id || '',
      area_name: t.area || 'Unknown area',
      area: null,
      total: 0,
      active: 0,
      overdue: 0,
      critical: 0,
      resolved: 0,
      categories: {},
    };
    if (!group.area && t.area_id) group.area = areaById(t.area_id);
    group.total += 1;
    if (isActive(t)) {
      group.active += 1;
      if (isOverdue(t)) group.overdue += 1;
      if (isCritical(t)) group.critical += 1;
    }
    if (t.status === 'Resolved') group.resolved += 1;
    group.categories[t.category] = (group.categories[t.category] || 0) + 1;
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((g) => {
      const dominant = Object.entries(g.categories).sort((a, b) => b[1] - a[1])[0];
      const verdict =
        g.overdue > 0 || g.critical >= 2
          ? { label: 'At Risk', tone: 'urgent' }
          : g.active >= 3
            ? { label: 'Watch', tone: 'pending' }
            : g.active > 0
              ? { label: 'Stable', tone: 'info' }
              : { label: 'Healthy', tone: 'ok' };
      return {
        ...g,
        dominantCategory: dominant?.[0] || '—',
        dominantCount: dominant?.[1] || 0,
        verdict,
      };
    })
    .sort((a, b) => b.active - a.active || b.total - a.total);
}

/**
 * Spec §12 — recurring problem detection. Groups by place + category and
 * compares monthly report volumes over the last 6 months.
 */
export function recurringIssues(tickets = [], wardId = 'all', { minTickets = 3 } = {}) {
  const scoped = tickets.filter((t) => inWard(t, wardId));
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const groups = new Map();
  scoped.forEach((t) => {
    const key = `${t.place_id || t.place_name || 'unknown'}||${t.category}`;
    const group = groups.get(key) || {
      key,
      place_id: t.place_id || '',
      place_name: t.place_name || 'Unknown place',
      place: placeById(t.place_id) || null,
      category: t.category,
      count: 0,
      reports: 0,
      lastReportedAt: null,
      monthly: Object.fromEntries(months.map((m) => [m, 0])),
    };
    group.count += 1;
    group.reports += Number(t.report_count) || 1;
    const mk = monthKey(t.created_at || t.latest_reported_at);
    if (mk && mk in group.monthly) group.monthly[mk] += Number(t.report_count) || 1;
    const reported = new Date(t.latest_reported_at || t.created_at);
    if (Number.isFinite(reported.getTime()) && (!group.lastReportedAt || reported > new Date(group.lastReportedAt))) {
      group.lastReportedAt = reported.toISOString();
    }
    groups.set(key, group);
  });

  return [...groups.values()]
    .filter((g) => g.count >= minTickets)
    .map((g) => {
      const series = months.map((m) => g.monthly[m]);
      const last = series[series.length - 1] || 0;
      const priorAvg = series.slice(0, -1).reduce((s, n) => s + n, 0) / 5;
      const trend = last > priorAvg * 1.25 && last >= 2 ? 'increasing' : last < priorAvg * 0.75 ? 'decreasing' : 'steady';
      return {
        ...g,
        monthly: months.map((m) => ({ label: monthLabel(m), count: g.monthly[m] })),
        trend,
        trendLabel: trend === 'increasing' ? 'Increasing ↑' : trend === 'decreasing' ? 'Improving ↓' : 'Steady',
        recommendation: CATEGORY_RECOMMENDATION[g.category] || CATEGORY_RECOMMENDATION.Other,
      };
    })
    .sort((a, b) => b.reports - a.reports || b.count - a.count);
}

/** Spec §13 — ⚠️ MAINTENANCE ALERT for locations with repeated complaints. */
export function maintenanceAlerts(tickets = [], wardId = 'all', { reportThreshold = 15, ticketThreshold = 5 } = {}) {
  const recurring = recurringIssues(tickets, wardId, { minTickets: 2 });
  return recurring
    .filter((g) => g.reports >= reportThreshold || g.count >= ticketThreshold)
    .map((g) => ({
      ...g,
      title: `⚠️ MAINTENANCE ALERT — ${g.place_name}`,
      message: `${g.reports} citizen reports across ${g.count} ${g.category} tickets at ${g.place_name}. Temporary fixes are not holding.`,
      recommendation: `${CATEGORY_RECOMMENDATION[g.category] || CATEGORY_RECOMMENDATION.Other} Recommend permanent infrastructure repair.`,
    }));
}

/** Spec §24 — Area/Place Risk Score 0–100 with reasons and HIGH/MEDIUM/LOW. */
export function placeRiskScores(tickets = [], wardId = 'all') {
  const recurring = recurringIssues(tickets, wardId, { minTickets: 3 });
  const recurringKeys = new Set(recurring.map((r) => r.key));
  const scoped = tickets.filter((t) => inWard(t, wardId));
  const groups = new Map();

  scoped.forEach((t) => {
    const key = t.place_id || t.place_name || 'unknown';
    const group = groups.get(key) || {
      key,
      place: placeById(t.place_id) || (t.place_name ? { place_id: t.place_id || '', place_name: t.place_name } : null),
      place_name: t.place_name || 'Unknown place',
      area_name: t.area || '',
      active: 0,
      overdue: 0,
      critical: 0,
      reports: 0,
      categories: {},
    };
    if (isActive(t)) {
      group.active += 1;
      if (isOverdue(t)) group.overdue += 1;
      if (isCritical(t)) group.critical += 1;
    }
    group.reports += Number(t.report_count) || 1;
    group.categories[t.category] = (group.categories[t.category] || 0) + 1;
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((g) => {
      const reasons = [];
      let score = 0;
      if (g.active) {
        score += g.active * 9;
        reasons.push(`${g.active} open/in-progress issue${g.active > 1 ? 's' : ''}`);
      }
      if (g.overdue) {
        score += g.overdue * 12;
        reasons.push(`${g.overdue} overdue past SLA`);
      }
      if (g.critical) {
        score += g.critical * 12;
        reasons.push(`${g.critical} critical priority`);
      }
      const reportWeight = Math.min(15, g.reports * 0.8);
      if (g.reports >= 5) {
        score += reportWeight;
        reasons.push(`${g.reports} total citizen reports`);
      }
      if (recurringKeys.has(`${g.key}||${Object.entries(g.categories).sort((a, b) => b[1] - a[1])[0]?.[0]}`)) {
        score += 8;
        reasons.push('Recurring monthly pattern');
      }
      score = Math.round(clamp(score, 0, 100));
      const level = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
      return { ...g, score, level, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

/** Spec §14 — comparison rows for every active ward. */
export function comparisonRows(tickets = []) {
  const rows = getActiveWards().map((ward) => {
    const stats = wardStats(tickets, ward.ward_id);
    return {
      ward_id: ward.ward_id,
      ward_number: ward.ward_number,
      ward_name: ward.ward_name,
      zone: ward.zone,
      total: stats.total,
      resolved: stats.resolved,
      resolutionRate: stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0,
      slaCompliance: stats.slaCompliance,
      avgResolutionDays: stats.avgResolutionDays,
      satisfaction: stats.satisfaction,
      overdue: stats.overdue,
      critical: stats.critical,
      performanceScore: stats.performanceScore,
      healthScore: stats.healthScore,
    };
  });
  return rows.sort((a, b) => b.performanceScore - a.performanceScore);
}

/** City-wide rollup for the dashboard header. */
export function cityStats(tickets = []) {
  return wardStats(tickets, 'all');
}
