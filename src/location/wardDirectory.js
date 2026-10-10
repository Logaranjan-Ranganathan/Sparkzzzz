/**
 * Mutable ward/area/place directory for UrbanGrid.
 *
 * The seed catalog in chennaiPlaces.js is immutable. Admin edits (add ward,
 * add area, add place, reassignments, deactivations) are applied here and
 * persisted to localStorage, with best-effort upsert to Supabase.
 *
 * Invariants enforced:
 *  - One ward = one unique Ward ID + one unique Ward Number (never duplicated).
 *  - One place = one unique Place ID (auto-generated, never duplicated).
 *  - Every area belongs to exactly one ward; every place belongs to one ward
 *    (and optionally one area of the same ward).
 */
import { isSupabaseConfigured, supabase } from '../supabase/client.js';
import {
  WARDS as SEED_WARDS,
  AREAS as SEED_AREAS,
  PLACES as SEED_PLACES,
  ZONES,
  CITY,
  DEMO_NOTICE,
  GEO,
} from './chennaiPlaces';

const STORAGE_KEY = 'urbangrid_ward_directory_v1';

const clone = (value) => JSON.parse(JSON.stringify(value));

function seedState() {
  return {
    wards: clone(SEED_WARDS),
    areas: clone(SEED_AREAS),
    places: clone(SEED_PLACES),
  };
}

let state = loadState();
let wardIndex = {};
let areaIndex = {};
let placeIndex = {};
rebuildIndexes();

const listeners = new Set();
let version = 0;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);
    const valid =
      Array.isArray(parsed?.wards) &&
      Array.isArray(parsed?.areas) &&
      Array.isArray(parsed?.places) &&
      parsed.wards.every((w) => w && w.ward_id && w.ward_number) &&
      parsed.places.every((p) => p && p.place_id);
    return valid ? parsed : seedState();
  } catch {
    return seedState();
  }
}

function rebuildIndexes() {
  wardIndex = Object.fromEntries(state.wards.map((w) => [w.ward_id, w]));
  areaIndex = Object.fromEntries(state.areas.map((a) => [a.area_id, a]));
  placeIndex = Object.fromEntries(state.places.map((p) => [p.place_id, p]));
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable — keep in-memory state */
  }
  pushRemote();
}

function commit() {
  rebuildIndexes();
  persist();
  version += 1;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* listener errors must not break the store */
    }
  });
}

/* ---------- best-effort Supabase sync (tables from 002_ward_hierarchy.sql) ---------- */

function getRemoteClient() {
  return isSupabaseConfigured ? supabase : null;
}

async function pushRemote() {
  const client = getRemoteClient();
  if (!client) return;
  try {
    const wardRows = state.wards.map((w) => ({ ...w, city: CITY.city, state: CITY.state }));
    const areaRows = state.areas.map((a) => ({ ...a }));
    const placeRows = state.places.map((p) => ({ ...p }));
    await Promise.all([
      client.from('wards').upsert(wardRows, { onConflict: 'ward_id' }),
      client.from('areas').upsert(areaRows, { onConflict: 'area_id' }),
      client.from('places').upsert(placeRows, { onConflict: 'place_id' }),
    ]);
  } catch {
    /* remote sync is best-effort; the app runs fully offline */
  }
}

/* ---------- reactive plumbing ---------- */

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion() {
  return version;
}

/* ---------- read API ---------- */

export function getDemoNotice() {
  return DEMO_NOTICE;
}

export function getCity() {
  return CITY;
}

export function getGeo() {
  return GEO;
}

export function getZones() {
  return ZONES;
}

export function getWards() {
  return state.wards.map((w) => ({ ...w })).sort((a, b) => a.ward_number.localeCompare(b.ward_number));
}

export function getActiveWards() {
  return getWards().filter((w) => w.active !== false);
}

export function getAreas() {
  return state.areas.map((a) => ({ ...a })).sort((a, b) => a.area_id.localeCompare(b.area_id));
}

export function getPlaces() {
  return state.places.map((p) => ({ ...p })).sort((a, b) => a.place_id.localeCompare(b.place_id));
}

export function wardById(wardId) {
  return wardIndex[wardId] || null;
}

export function areaById(areaId) {
  return areaIndex[areaId] || null;
}

export function placeById(placeId) {
  return placeIndex[placeId] || null;
}

export function areasOfWard(wardId) {
  return state.areas.filter((a) => a.ward_id === wardId);
}

export function placesOfWard(wardId) {
  return state.places.filter((p) => p.ward_id === wardId);
}

export function placesOfArea(areaId) {
  return state.places.filter((p) => p.area_id === areaId);
}

/* ---------- ID generators (guaranteed unique) ---------- */

const pad3 = (n) => String(n).padStart(3, '0');

function nextWardNumber() {
  const max = state.wards.reduce((m, w) => Math.max(m, Number(w.ward_number) || 0), 0);
  return pad3(max + 1);
}

function nextId(prefix, collection, key) {
  const max = collection.reduce((m, item) => {
    const num = Number(String(item[key] || '').replace(/\D/g, ''));
    return Number.isFinite(num) ? Math.max(m, num) : m;
  }, 0);
  return `${prefix}-${pad3(max + 1)}`;
}

/* ---------- validation helpers ---------- */

function isBlank(value) {
  return !value || !String(value).trim();
}

function validCoord(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

function normalizeZone(zoneName) {
  const match = ZONES.find((z) => z.zone_name === zoneName || z.zone_id === zoneName);
  return match ? match.zone_name : null;
}

function placeKeywords(place) {
  return [
    place.place_name,
    place.street,
    place.area,
    place.ward_name,
    place.keywords,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Re-derive the denormalized area/ward_name/keywords fields of one place. */
function refreshPlaceHierarchy(place) {
  const area = place.area_id ? areaIndex[place.area_id] : null;
  const ward = wardIndex[place.ward_id];
  place.area = area ? area.area_name : null;
  place.ward_name = ward ? ward.ward_name : null;
  place.postal_code = place.postal_code || (area ? area.postal_code : null) || (ward ? ward.postal_code : null);
  place.keywords = placeKeywords(place);
}

/** Propagate a ward rename to every place in that ward. */
function refreshPlacesOfWard(wardId) {
  state.places.filter((p) => p.ward_id === wardId).forEach(refreshPlaceHierarchy);
}

/** Propagate an area rename to every place in that area. */
function refreshPlacesOfArea(areaId) {
  state.places.filter((p) => p.area_id === areaId).forEach(refreshPlaceHierarchy);
}

/* ---------- ward mutations ---------- */

export function addWard(input = {}) {
  const wardName = String(input.ward_name || '').trim();
  if (isBlank(wardName)) return { ok: false, error: 'Ward name is required.' };

  const zone = normalizeZone(input.zone);
  if (!zone) return { ok: false, error: 'Zone is required (Central, North, West or South Zone).' };

  if (!validCoord(input.latitude, input.longitude)) {
    return { ok: false, error: 'Ward centre coordinates (latitude & longitude) are required.' };
  }

  const wardNumber = isBlank(input.ward_number) ? nextWardNumber() : String(input.ward_number).trim();
  if (state.wards.some((w) => w.ward_number === wardNumber)) {
    return { ok: false, error: `Ward Number ${wardNumber} already exists. Ward numbers must be unique.` };
  }
  const wardId = isBlank(input.ward_id) ? `WARD-${wardNumber}` : String(input.ward_id).trim().toUpperCase();
  if (state.wards.some((w) => w.ward_id === wardId)) {
    return { ok: false, error: `Ward ID ${wardId} already exists. Ward IDs must be unique.` };
  }

  const ward = {
    ward_id: wardId,
    ward_number: wardNumber,
    ward_name: wardName,
    zone,
    area: input.area ? String(input.area).trim() : wardName,
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    postal_code: input.postal_code ? String(input.postal_code).trim() : null,
    active: true,
  };
  state.wards.push(ward);
  commit();
  return { ok: true, ward: { ...ward } };
}

const WARD_PATCH_FIELDS = ['ward_name', 'zone', 'area', 'latitude', 'longitude', 'postal_code', 'active'];

export function updateWard(wardId, patch = {}) {
  const ward = wardIndex[wardId];
  if (!ward) return { ok: false, error: `Ward ${wardId} not found.` };

  if ('ward_name' in patch) {
    const name = String(patch.ward_name || '').trim();
    if (isBlank(name)) return { ok: false, error: 'Ward name cannot be empty.' };
    ward.ward_name = name;
  }
  if ('zone' in patch) {
    const zone = normalizeZone(patch.zone);
    if (!zone) return { ok: false, error: 'Unknown zone.' };
    ward.zone = zone;
  }
  if ('area' in patch) ward.area = patch.area ? String(patch.area).trim() : ward.area;
  if ('latitude' in patch && 'longitude' in patch) {
    if (!validCoord(patch.latitude, patch.longitude)) return { ok: false, error: 'Invalid coordinates.' };
    ward.latitude = Number(patch.latitude);
    ward.longitude = Number(patch.longitude);
  }
  if ('postal_code' in patch) ward.postal_code = patch.postal_code ? String(patch.postal_code).trim() : null;
  if ('active' in patch) ward.active = Boolean(patch.active);

  const known = WARD_PATCH_FIELDS.every((field) => field in patch);
  if (!known && Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' };

  refreshPlacesOfWard(wardId);
  commit();
  return { ok: true, ward: { ...ward } };
}

export function setWardActive(wardId, active) {
  return updateWard(wardId, { active: Boolean(active) });
}

/* ---------- area mutations ---------- */

export function addArea(input = {}) {
  const areaName = String(input.area_name || '').trim();
  if (isBlank(areaName)) return { ok: false, error: 'Area name is required.' };

  const ward = wardIndex[input.ward_id];
  if (!ward) return { ok: false, error: 'Area must belong to an existing ward.' };
  if (ward.active === false) return { ok: false, error: `Ward ${ward.ward_id} is deactivated.` };

  if (state.areas.some((a) => a.area_name.toLowerCase() === areaName.toLowerCase() && a.ward_id === ward.ward_id)) {
    return { ok: false, error: `Area "${areaName}" already exists in ${ward.ward_name}.` };
  }

  const areaId = nextId('AREA', state.areas, 'area_id');
  const area = {
    area_id: areaId,
    area_name: areaName,
    ward_id: ward.ward_id,
    latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : ward.latitude,
    longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : ward.longitude,
    postal_code: input.postal_code ? String(input.postal_code).trim() : ward.postal_code,
  };
  state.areas.push(area);
  commit();
  return { ok: true, area: { ...area } };
}

export function updateArea(areaId, patch = {}) {
  const area = areaIndex[areaId];
  if (!area) return { ok: false, error: `Area ${areaId} not found.` };

  if ('ward_id' in patch && patch.ward_id !== area.ward_id) {
    const ward = wardIndex[patch.ward_id];
    if (!ward) return { ok: false, error: 'Unknown ward.' };
    area.ward_id = ward.ward_id;
  }
  if ('area_name' in patch) {
    const name = String(patch.area_name || '').trim();
    if (isBlank(name)) return { ok: false, error: 'Area name cannot be empty.' };
    if (
      state.areas.some(
        (a) => a.area_id !== areaId && a.area_name.toLowerCase() === name.toLowerCase() && a.ward_id === area.ward_id,
      )
    ) {
      return { ok: false, error: `Area "${name}" already exists in this ward.` };
    }
    area.area_name = name;
  }
  if ('latitude' in patch && Number.isFinite(Number(patch.latitude))) area.latitude = Number(patch.latitude);
  if ('longitude' in patch && Number.isFinite(Number(patch.longitude))) area.longitude = Number(patch.longitude);
  if ('postal_code' in patch) area.postal_code = patch.postal_code ? String(patch.postal_code).trim() : null;

  refreshPlacesOfArea(areaId);
  commit();
  return { ok: true, area: { ...area } };
}

/* ---------- place mutations ---------- */

export function addPlace(input = {}) {
  const placeName = String(input.place_name || '').trim();
  if (isBlank(placeName)) return { ok: false, error: 'Place name is required.' };
  if (!validCoord(input.latitude, input.longitude)) {
    return { ok: false, error: 'Place coordinates (latitude & longitude) are required.' };
  }

  let area = null;
  let ward = null;
  if (!isBlank(input.area_id)) {
    area = areaIndex[input.area_id];
    if (!area) return { ok: false, error: `Area ${input.area_id} not found.` };
    ward = wardIndex[area.ward_id];
  } else if (!isBlank(input.ward_id)) {
    ward = wardIndex[input.ward_id];
  }
  if (!ward) return { ok: false, error: 'Place must be assigned to a ward (directly or via an area).' };

  const duplicate = state.places.some(
    (p) =>
      p.place_name.toLowerCase() === placeName.toLowerCase() &&
      p.ward_id === ward.ward_id &&
      (area ? p.area_id === area.area_id : true),
  );
  if (duplicate) {
    return { ok: false, error: `Place "${placeName}" already exists in ${ward.ward_name}. Place IDs must never be duplicated.` };
  }

  const placeId = nextId('PLACE', state.places, 'place_id');
  const place = {
    place_id: placeId,
    place_name: placeName,
    street: input.street ? String(input.street).trim() : null,
    type: input.type ? String(input.type).trim() : 'landmark',
    area_id: area ? area.area_id : null,
    ward_id: ward.ward_id,
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    postal_code: input.postal_code ? String(input.postal_code).trim() : null,
    keywords: '',
  };
  rebuildIndexes();
  refreshPlaceHierarchy(place);
  state.places.push(place);
  commit();
  return { ok: true, place: { ...place } };
}

export function updatePlace(placeId, patch = {}) {
  const place = placeIndex[placeId];
  if (!place) return { ok: false, error: `Place ${placeId} not found.` };

  let hierarchyChanged = false;

  if ('area_id' in patch) {
    if (isBlank(patch.area_id)) {
      place.area_id = null;
      hierarchyChanged = true;
    } else {
      const area = areaIndex[patch.area_id];
      if (!area) return { ok: false, error: `Area ${patch.area_id} not found.` };
      place.area_id = area.area_id;
      place.ward_id = area.ward_id;
      hierarchyChanged = true;
    }
  }
  if ('ward_id' in patch && patch.ward_id !== place.ward_id) {
    const ward = wardIndex[patch.ward_id];
    if (!ward) return { ok: false, error: `Ward ${patch.ward_id} not found.` };
    place.ward_id = ward.ward_id;
    const ownArea = place.area_id ? areaIndex[place.area_id] : null;
    if (ownArea && ownArea.ward_id !== ward.ward_id) place.area_id = null;
    hierarchyChanged = true;
  }
  if ('place_name' in patch) {
    const name = String(patch.place_name || '').trim();
    if (isBlank(name)) return { ok: false, error: 'Place name cannot be empty.' };
    place.place_name = name;
    hierarchyChanged = true;
  }
  if ('street' in patch) place.street = patch.street ? String(patch.street).trim() : null;
  if ('type' in patch && !isBlank(patch.type)) place.type = String(patch.type).trim();
  if ('latitude' in patch && 'longitude' in patch) {
    if (!validCoord(patch.latitude, patch.longitude)) return { ok: false, error: 'Invalid coordinates.' };
    place.latitude = Number(patch.latitude);
    place.longitude = Number(patch.longitude);
  }
  if ('postal_code' in patch) place.postal_code = patch.postal_code ? String(patch.postal_code).trim() : null;
  if ('keywords' in patch) place.keywords = String(patch.keywords || '').toLowerCase();

  if (hierarchyChanged) refreshPlaceHierarchy(place);
  commit();
  return { ok: true, place: { ...place } };
}

/** Spec §20 — Assign Place to Ward. Clears the area when it belongs to another ward. */
export function assignPlaceToWard(placeId, wardId) {
  return updatePlace(placeId, { ward_id: wardId });
}

/* ---------- reset ---------- */

export function resetToSeed() {
  state = seedState();
  commit();
  return { ok: true };
}
