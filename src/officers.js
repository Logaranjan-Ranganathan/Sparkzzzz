/**
 * Officer roster and assignment engine for UrbanGrid.
 *
 * Spec §15 — every officer has an Officer ID, Name, Department, Ward, Zone,
 * Contact and a live workload. recommendOfficer() ranks candidates for a new
 * ticket by ward, category/department fit, workload, overdue load and
 * distance, and explains its choice in plain language.
 *
 * Contacts are fictional demonstration data.
 */
import { wardById, getActiveWards } from './location/wardDirectory';
import { haversineMeters } from './location/locationService';

export const DEPARTMENTS = [
  'Road Maintenance',
  'Waste Management',
  'Street Lighting',
  'Stormwater & Drainage',
  'Water Works',
  'General Maintenance',
];

/** Civic category → the department that owns it. */
export const CATEGORY_DEPARTMENT = {
  'Road / Pothole': 'Road Maintenance',
  Garbage: 'Waste Management',
  Streetlight: 'Street Lighting',
  Drainage: 'Stormwater & Drainage',
  Water: 'Water Works',
  Other: 'General Maintenance',
};

export const departmentForCategory = (category) => CATEGORY_DEPARTMENT[category] || 'General Maintenance';

/** [officer_id, name, department, ward_id|null, phone] */
const ROSTER = [
  ['OFF-101', 'R. Karthikeyan', 'Road Maintenance', 'WARD-001', '+91 98400 11001'],
  ['OFF-102', 'S. Meenakshi', 'Waste Management', 'WARD-002', '+91 98400 11002'],
  ['OFF-103', 'A. Arjunan', 'Street Lighting', 'WARD-003', '+91 98400 11003'],
  ['OFF-104', 'P. Lakshmi', 'Stormwater & Drainage', 'WARD-004', '+91 98400 11004'],
  ['OFF-105', 'V. Rajendran', 'Water Works', 'WARD-005', '+91 98400 11005'],
  ['OFF-106', 'K. Saravanan', 'General Maintenance', 'WARD-006', '+91 98400 11006'],
  ['OFF-107', 'M. Priyadharshini', 'Road Maintenance', 'WARD-007', '+91 98400 11007'],
  ['OFF-108', 'T. Balaji', 'Waste Management', 'WARD-008', '+91 98400 11008'],
  ['OFF-109', 'N. Deepa', 'Street Lighting', 'WARD-009', '+91 98400 11009'],
  ['OFF-110', 'G. Muthukumar', 'Stormwater & Drainage', 'WARD-010', '+91 98400 11010'],
  ['OFF-111', 'B. Kavitha', 'Water Works', 'WARD-011', '+91 98400 11011'],
  ['OFF-112', 'D. Suresh Kumar', 'General Maintenance', 'WARD-012', '+91 98400 11012'],
  ['OFF-113', 'L. Revathi', 'Road Maintenance', 'WARD-013', '+91 98400 11013'],
  ['OFF-114', 'H. Prakash', 'Waste Management', 'WARD-014', '+91 98400 11014'],
  ['OFF-115', 'J. Nandhini', 'Street Lighting', 'WARD-015', '+91 98400 11015'],
  ['OFF-116', 'F. Vijaykumar', 'Stormwater & Drainage', 'WARD-016', '+91 98400 11016'],
  ['OFF-117', 'W. Anitha', 'Water Works', 'WARD-017', '+91 98400 11017'],
  ['OFF-118', 'S. Gopinath', 'General Maintenance', 'WARD-018', '+91 98400 11018'],
  ['OFF-119', 'C. Hemalatha', 'Road Maintenance', 'WARD-019', '+91 98400 11019'],
  ['OFF-120', 'E. Manikandan', 'Waste Management', 'WARD-020', '+91 98400 11020'],
  ['OFF-121', 'I. Bhuvaneswari', 'Street Lighting', 'WARD-021', '+91 98400 11021'],
  ['OFF-122', 'O. Ramesh', 'Stormwater & Drainage', 'WARD-022', '+91 98400 11022'],
  ['OFF-123', 'R. Divya', 'Water Works', 'WARD-023', '+91 98400 11023'],
  ['OFF-124', 'U. Senthilkumar', 'General Maintenance', 'WARD-024', '+91 98400 11024'],
  ['OFF-125', 'Y. Kalaiselvi', 'Road Maintenance', 'WARD-025', '+91 98400 11025'],
  ['OFF-126', 'M. Hariharan', 'Waste Management', 'WARD-026', '+91 98400 11026'],
  ['OFF-127', 'K. Gayathri', 'Street Lighting', 'WARD-027', '+91 98400 11027'],
  ['OFF-128', 'P. Natarajan', 'Stormwater & Drainage', 'WARD-028', '+91 98400 11028'],
  ['OFF-201', 'T. Ravikumar', 'Road Maintenance', null, '+91 98400 11201'],
  ['OFF-202', 'S. Bhavani', 'Waste Management', null, '+91 98400 11202'],
  ['OFF-203', 'A. Mohanraj', 'Street Lighting', null, '+91 98400 11203'],
  ['OFF-204', 'P. Jayanthi', 'Stormwater & Drainage', null, '+91 98400 11204'],
  ['OFF-205', 'R. Elumalai', 'Water Works', null, '+91 98400 11205'],
  ['OFF-206', 'V. Chandran', 'General Maintenance', null, '+91 98400 11206'],
];

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('.');

function buildSeed() {
  return ROSTER.map(([officer_id, name, department, ward_id, phone]) => {
    const ward = ward_id ? wardById(ward_id) : null;
    return {
      officer_id,
      name,
      department,
      ward_id: ward_id || null,
      zone: ward ? ward.zone : 'All Zones',
      phone,
      email: `${slug(name)}@chennaicivic.example.in`,
      active: true,
    };
  });
}

/* ---------- mutable store (admin can reassign / deactivate) ---------- */

const STORAGE_KEY = 'urbangrid_officers_v1';
const clone = (value) => JSON.parse(JSON.stringify(value));

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw);
    const valid = Array.isArray(parsed) && parsed.every((o) => o && o.officer_id && o.name && o.department);
    return valid ? parsed : buildSeed();
  } catch {
    return buildSeed();
  }
}

let officers = loadState();
let officerIndex = Object.fromEntries(officers.map((o) => [o.officer_id, o]));
const listeners = new Set();
let version = 0;

function commit() {
  officerIndex = Object.fromEntries(officers.map((o) => [o.officer_id, o]));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(officers));
  } catch {
    /* ignore */
  }
  version += 1;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion() {
  return version;
}

/* ---------- read API ---------- */

export function getOfficers() {
  return officers.map((o) => ({ ...o })).sort((a, b) => a.officer_id.localeCompare(b.officer_id));
}

export function getActiveOfficers() {
  return getOfficers().filter((o) => o.active !== false);
}

export function officerById(officerId) {
  return officerIndex[officerId] || null;
}

export function officersOfWard(wardId) {
  return officers.filter((o) => o.ward_id === wardId);
}

export function officersOfZone(zone) {
  return officers.filter((o) => o.zone === zone || o.zone === 'All Zones');
}

export function officerLabel(officer) {
  if (!officer) return 'Unassigned';
  return `${officer.name} · ${officer.department}`;
}

/* ---------- mutations (admin §20) ---------- */

export function updateOfficer(officerId, patch = {}) {
  const officer = officerIndex[officerId];
  if (!officer) return { ok: false, error: `Officer ${officerId} not found.` };

  if ('name' in patch && String(patch.name || '').trim()) officer.name = String(patch.name).trim();
  if ('department' in patch && DEPARTMENTS.includes(patch.department)) officer.department = patch.department;
  if ('phone' in patch && patch.phone) officer.phone = String(patch.phone).trim();
  if ('email' in patch && patch.email) officer.email = String(patch.email).trim();
  if ('active' in patch) officer.active = Boolean(patch.active);
  if ('ward_id' in patch) {
    if (patch.ward_id === null || patch.ward_id === '') {
      officer.ward_id = null;
      officer.zone = 'All Zones';
    } else {
      const ward = wardById(patch.ward_id);
      if (!ward) return { ok: false, error: `Ward ${patch.ward_id} not found.` };
      officer.ward_id = ward.ward_id;
      officer.zone = ward.zone;
    }
  }
  commit();
  return { ok: true, officer: { ...officer } };
}

/** Spec §20 — Assign Officer to Ward. */
export function assignOfficerToWard(officerId, wardId) {
  return updateOfficer(officerId, { ward_id: wardId });
}

/* ---------- workload & recommendation ---------- */

const ACTIVE_STATUSES = ['Open', 'Under Review', 'Assigned', 'In Progress'];

export function workloadFor(officer, tickets = []) {
  const id = officer?.officer_id;
  const name = officer?.name;
  if (!id && !name) return { open: 0, overdue: 0, critical: 0, resolved: 0, total: 0 };
  const mine = tickets.filter((t) => t.assigned_officer_id === id || (!t.assigned_officer_id && t.assigned_officer === name));
  const active = mine.filter((t) => ACTIVE_STATUSES.includes(t.status));
  return {
    open: active.length,
    overdue: active.filter((t) => t.sla_status === 'overdue').length,
    critical: active.filter((t) => Number(t.priority_score) >= 4).length,
    resolved: mine.filter((t) => t.status === 'Resolved').length,
    total: mine.length,
  };
}

const workloadTone = (open) => (open === 0 ? 'no open tickets' : open <= 2 ? `${open} open ticket${open > 1 ? 's' : ''}` : `${open} open tickets (heavy)`);

/**
 * Rank officers for a new ticket. Score (higher = better):
 *   +40 same ward            +20 department matches the category
 *   +15 zone fallback        20 - 4×open workload
 *   -5 per overdue (≤15)     distance bonus up to +12
 */
export function recommendOfficer(tickets = [], { ward_id, category, latitude, longitude } = {}) {
  const pool = getActiveOfficers();
  if (!pool.length) return { officer: null, reason: 'No officers available.', candidates: [] };

  const department = departmentForCategory(category);
  const ward = ward_id ? wardById(ward_id) : null;
  const zone = ward?.zone || null;

  const scored = pool
    .map((officer) => {
      const workload = workloadFor(officer, tickets);
      let score = 0;
      const reasons = [];

      if (ward && officer.ward_id === ward.ward_id) {
        score += 40;
        reasons.push(`Ward officer for ${ward.ward_name} (${ward.ward_id})`);
      } else if (zone && officer.zone === zone) {
        score += 15;
        reasons.push(`Located in ${zone}`);
      } else if (officer.zone === 'All Zones') {
        score += 6;
        reasons.push('Citywide specialist');
      }

      if (officer.department === department) {
        score += 20;
        reasons.push(`${department} specialist`);
      }

      score += Math.max(0, 20 - workload.open * 4);
      reasons.push(workloadTone(workload.open));
      if (workload.overdue) {
        score -= Math.min(15, workload.overdue * 5);
        reasons.push(`${workload.overdue} overdue`);
      }

      if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
        const base = officer.ward_id ? wardById(officer.ward_id) : null;
        if (base) {
          const distance = haversineMeters(latitude, longitude, base.latitude, base.longitude);
          if (distance <= 2000) score += 12;
          else if (distance <= 5000) score += 6;
          else if (distance <= 10000) score += 2;
        }
      }

      return { officer, workload, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.officer.officer_id.localeCompare(b.officer.officer_id));

  const best = scored[0];
  return {
    officer: best.officer,
    workload: best.workload,
    reason: best.reasons.slice(0, 3).join(' · '),
    candidates: scored.slice(0, 4).map(({ officer, workload, score }) => ({ officer, workload, score })),
  };
}

/** Convenience for admin tables: officers grouped by ward with workload. */
export function officersWithWorkload(tickets = []) {
  const wards = getActiveWards();
  return getOfficers().map((officer) => ({
    ...officer,
    workload: workloadFor(officer, tickets),
    ward_name: officer.ward_id ? wardById(officer.ward_id)?.ward_name || '' : 'Citywide',
  })).sort((a, b) => (a.ward_id || 'zzz').localeCompare(b.ward_id || 'zzz') || a.officer_id.localeCompare(b.officer_id));
}

export const OFFICER_DEMO_NOTICE = 'Officer roster and contacts are demonstration data.';
