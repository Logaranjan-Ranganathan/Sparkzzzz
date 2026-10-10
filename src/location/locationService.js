/**
 * Location adapter for UrbanGrid.
 *
 * Resolves the CITY → ZONE → WARD → AREA → PLACE hierarchy for any
 * coordinate. Ward association is always automatic (GPS or picked place);
 * citizens are never asked to type a ward number.
 *
 * Swap Nominatim for another provider by replacing searchRemotePlaces() and
 * reverseGeocode() only. UI always consumes the same LocationPayload shape:
 *
 *   { latitude, longitude, place_id, place_name, street, area_id, area,
 *     ward_id, ward_number, ward_name, zone, ward, city, state,
 *     postal_code, address, ward_detection }
 *
 * ward_detection: 'auto' (resolved from coordinates) | 'manual'
 * (ward selected by the citizen via the fallback dropdown) | 'none'.
 */

import {
  getActiveWards,
  getAreas,
  getCity,
  getGeo,
  getPlaces,
  getWards,
  areaById,
  wardById,
} from './wardDirectory';

const CITY = getCity();

export const emptyLocation = () => ({
  latitude: CITY.center.latitude,
  longitude: CITY.center.longitude,
  address: '',
  place_id: '',
  place_name: '',
  street: '',
  area_id: '',
  area: '',
  ward: '',
  ward_id: '',
  ward_number: '',
  ward_name: '',
  zone: '',
  city: CITY.city,
  state: CITY.state,
  postal_code: '',
  ward_detection: 'none',
});

export const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const nearest = (lat, lon, list) =>
  list.reduce((best, item) => {
    const d = haversineMeters(lat, lon, item.latitude, item.longitude);
    if (!best || d < best.distance) return { item, distance: d };
    return best;
  }, null);

export const nearestWard = (lat, lon) => nearest(lat, lon, getActiveWards())?.item || getWards()[0];

export const nearestPlace = (lat, lon) => nearest(lat, lon, getPlaces())?.item || getPlaces()[0];

/**
 * Resolve the full hierarchy for a coordinate.
 *  1. Snap to a catalogued place within GEO.placeSnapRadius.
 *  2. Else snap to the nearest area centre within the same radius.
 *  3. Else fall back to the nearest ward centre within GEO.wardDetectionRadius.
 *  4. Else null — the UI must show "Unable to identify your ward
 *     automatically." with a manual ward selector.
 */
export function resolveHierarchy(latitude, longitude) {
  const geo = getGeo();
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const placeHit = nearest(lat, lon, getPlaces());
  if (placeHit && placeHit.distance <= geo.placeSnapRadius) {
    const place = placeHit.item;
    return {
      method: 'place',
      place,
      area: place.area_id ? areaById(place.area_id) : null,
      ward: wardById(place.ward_id),
    };
  }

  const areaHit = nearest(lat, lon, getAreas());
  if (areaHit && areaHit.distance <= geo.placeSnapRadius) {
    const area = areaHit.item;
    return {
      method: 'area',
      place: null,
      area,
      ward: wardById(area.ward_id),
    };
  }

  const wardHit = nearest(lat, lon, getActiveWards());
  if (wardHit && wardHit.distance <= geo.wardDetectionRadius) {
    return { method: 'ward', place: null, area: null, ward: wardHit.item };
  }

  return null;
}

export const formatAddress = ({ place_name, area, city, state }) => {
  const bits = [place_name || area, city].filter(Boolean);
  const line = bits.join(', ');
  return state && !line.includes(state) ? `${line}, ${state}` : line;
};

/**
 * Build the canonical LocationPayload. Ward association is automatic from
 * coordinates unless the caller supplies an explicit place/ward object
 * (picker selection or manual fallback).
 */
export const buildLocation = ({ latitude, longitude, place, area, ward, extra = {}, detection }) => {
  const lat = Number(Number(latitude).toFixed(6));
  const lon = Number(Number(longitude).toFixed(6));

  let resolved;
  let detected = 'auto';
  if (place) {
    // A picked place still resolves its ward automatically.
    resolved = { place, area: place.area_id ? areaById(place.area_id) : null, ward: wardById(place.ward_id) };
  } else if (ward) {
    resolved = { place: null, area: area ? areaById(area.area_id) : null, ward: wardById(ward.ward_id || ward) };
    detected = 'manual';
  } else {
    resolved = resolveHierarchy(lat, lon);
  }
  if (detection) detected = detection;

  const hierarchyWard = resolved?.ward || null;
  const hierarchyArea = resolved?.area || null;
  const hierarchyPlace = resolved?.place || null;

  const payload = {
    latitude: lat,
    longitude: lon,
    place_id: extra.place_id ?? hierarchyPlace?.place_id ?? '',
    place_name: extra.place_name || hierarchyPlace?.place_name || '',
    street: extra.street ?? hierarchyPlace?.street ?? '',
    area_id: extra.area_id ?? hierarchyArea?.area_id ?? '',
    area: extra.area || hierarchyArea?.area_name || hierarchyPlace?.area || '',
    ward_id: hierarchyWard?.ward_id || '',
    ward_number: hierarchyWard?.ward_number || '',
    ward_name: hierarchyWard?.ward_name || '',
    zone: hierarchyWard?.zone || '',
    ward: hierarchyWard?.ward_id || '',
    city: extra.city || CITY.city,
    state: extra.state || CITY.state,
    postal_code: extra.postal_code || hierarchyPlace?.postal_code || hierarchyArea?.postal_code || hierarchyWard?.postal_code || '',
    address: '',
    ward_detection: hierarchyWard ? detected : 'none',
  };
  payload.address = extra.address || formatAddress(payload);
  return payload;
};

/**
 * Spec §6 fallback — the citizen picks a ward from a dropdown only after
 * automatic detection failed. Centres the payload on the ward centroid.
 */
export function manualWardLocation(wardId) {
  const ward = wardById(wardId);
  if (!ward) return emptyLocation();
  const areas = getAreas().filter((a) => a.ward_id === ward.ward_id);
  const area = areas[0] || null;
  const payload = buildLocation({
    latitude: ward.latitude,
    longitude: ward.longitude,
    place: null,
    area,
    ward,
    extra: { place_name: ward.ward_name, area: area?.area_name || ward.area || ward.ward_name },
  });
  payload.ward_detection = 'manual';
  return payload;
}

/** Confirmed-location card rows (Spec §5/§17): Place / Area / Ward / City. */
export function locationHierarchy(location) {
  const loc = location || emptyLocation();
  return [
    { key: 'place', label: 'Place', value: loc.place_name || 'Not identified' },
    { key: 'street', label: 'Street', value: loc.street || '—' },
    { key: 'area', label: 'Area', value: loc.area || 'Not identified' },
    {
      key: 'ward',
      label: 'Ward',
      value: loc.ward_id ? `${loc.ward_name || ''} (Ward No. ${loc.ward_number || '—'})`.trim() : 'Not identified',
    },
    { key: 'zone', label: 'Zone', value: loc.zone || '—' },
    { key: 'city', label: 'City', value: loc.city || CITY.city },
  ];
}

const tokenize = (q) =>
  String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

function suggestionFromPlace(place) {
  const location = buildLocation({ latitude: place.latitude, longitude: place.longitude, place });
  return {
    type: 'place',
    id: place.place_id,
    label: place.place_name,
    street: place.street || null,
    hierarchy: [place.area, place.ward_name ? `${place.ward_name} (${place.ward_id})` : null, place.ward_name ? wardById(place.ward_id)?.zone : null, CITY.city]
      .filter(Boolean)
      .join(' · '),
    location,
  };
}

function suggestionFromArea(area) {
  const ward = wardById(area.ward_id);
  const location = buildLocation({
    latitude: area.latitude,
    longitude: area.longitude,
    ward,
    area,
    extra: { place_name: area.area_name, area: area.area_name },
    detection: 'auto',
  });
  return {
    type: 'area',
    id: area.area_id,
    label: area.area_name,
    street: null,
    hierarchy: [ward?.ward_name ? `${ward.ward_name} (${ward.ward_id})` : null, ward?.zone, CITY.city].filter(Boolean).join(' · '),
    location,
  };
}

function suggestionFromWard(ward) {
  const location = manualWardLocation(ward.ward_id);
  return {
    type: 'ward',
    id: ward.ward_id,
    label: `${ward.ward_name} — Ward No. ${ward.ward_number}`,
    street: null,
    hierarchy: [ward.ward_id, ward.zone, CITY.city].filter(Boolean).join(' · '),
    location,
  };
}

/** Local catalog search across places, areas and wards (live directory). */
export const searchLocalPlaces = (query, limit = 8) => {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const matchTokens = (hay) => {
    const h = hay.toLowerCase();
    return tokens.every((t) => h.includes(t));
  };
  const startsWithFirst = (label) => label.toLowerCase().startsWith(tokens[0]);

  const placeHits = getPlaces()
    .filter((p) => matchTokens(`${p.place_name} ${p.street || ''} ${p.area || ''} ${p.ward_name || ''} ${p.keywords || ''}`))
    .sort((a, b) => Number(startsWithFirst(b.place_name)) - Number(startsWithFirst(a.place_name)) || a.place_name.localeCompare(b.place_name));

  const areaHits = getAreas().filter((a) => matchTokens(`${a.area_name} ${wardById(a.ward_id)?.ward_name || ''}`));

  const wardHits = getActiveWards().filter((w) =>
    matchTokens(`${w.ward_name} ${w.ward_number} ${w.ward_id} ${w.zone} ${w.area || ''}`),
  );

  const suggestions = [
    ...placeHits.map(suggestionFromPlace),
    ...areaHits.map(suggestionFromArea),
    ...wardHits.map(suggestionFromWard),
  ];
  return suggestions.slice(0, limit);
};

const nominatimHeaders = {
  Accept: 'application/json',
  'User-Agent': 'UrbanGrid-Civic/1.0 (civic dispatch demo)',
};

const mapNominatim = (row) => {
  const addr = row.address || {};
  const place_name =
    addr.suburb ||
    addr.neighbourhood ||
    addr.road ||
    addr.amenity ||
    addr.tourism ||
    row.display_name?.split(',')[0] ||
    'Selected location';
  const area = addr.suburb || addr.neighbourhood || addr.city_district || place_name;
  return buildLocation({
    latitude: Number(row.lat),
    longitude: Number(row.lon),
    extra: {
      place_name,
      area,
      city: addr.city || addr.town || CITY.city,
      state: addr.state || CITY.state,
      postal_code: addr.postcode || '',
      address: row.display_name,
    },
  });
};

function suggestionFromRemote(payload) {
  return {
    type: 'remote',
    id: `${payload.latitude},${payload.longitude}`,
    label: payload.place_name,
    street: null,
    hierarchy: payload.address || [payload.area, payload.city].filter(Boolean).join(', '),
    location: payload,
  };
}

export async function searchRemotePlaces(query, limit = 5) {
  const q = `${query} Chennai Tamil Nadu`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: nominatimHeaders });
  if (!res.ok) return [];
  const rows = await res.json();
  return (rows || []).map(mapNominatim);
}

/** Unified search: catalogued places/areas/wards first, then Nominatim. */
export async function searchPlaces(query) {
  const local = searchLocalPlaces(query);
  if (local.length >= 4 || String(query || '').trim().length < 3) return local;
  try {
    const remote = await searchRemotePlaces(query);
    const seen = new Set(local.map((s) => `${s.label.toLowerCase()}|${s.location.ward_id}`));
    const merged = [...local];
    remote.forEach((payload) => {
      const suggestion = suggestionFromRemote(payload);
      const key = `${suggestion.label.toLowerCase()}|${payload.ward_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(suggestion);
      }
    });
    return merged.slice(0, 8);
  } catch {
    return local;
  }
}

export async function reverseGeocode(latitude, longitude) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`;
    const res = await fetch(url, { headers: nominatimHeaders });
    if (res.ok) {
      const row = await res.json();
      if (row?.lat) return mapNominatim(row);
    }
  } catch {
    /* fall through to catalog */
  }
  return buildLocation({ latitude, longitude });
}

export function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 'UNSUPPORTED', message: 'Geolocation is not available in this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        if (err.code === 1) {
          reject({ code: 'DENIED', message: 'Location access is disabled.' });
        } else {
          reject({
            code: 'UNAVAILABLE',
            message: 'Unable to determine your location. Please search for your location manually.',
          });
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  });
}

export const ticketLocation = (ticket) => {
  if (!ticket) return emptyLocation();
  if (ticket.place_name && ticket.address) {
    return {
      latitude: Number(ticket.latitude),
      longitude: Number(ticket.longitude),
      address: ticket.address,
      place_id: ticket.place_id || '',
      place_name: ticket.place_name,
      street: ticket.street || '',
      area_id: ticket.area_id || '',
      area: ticket.area || '',
      ward: ticket.ward || ticket.ward_id || '',
      ward_id: ticket.ward_id || ticket.ward || '',
      ward_number: ticket.ward_number || '',
      ward_name: ticket.ward_name || ticket.ward_id || '',
      zone: ticket.zone || '',
      city: ticket.city || CITY.city,
      state: ticket.state || CITY.state,
      postal_code: ticket.postal_code || '',
      ward_detection: ticket.ward_detection || 'auto',
    };
  }
  const built = buildLocation({
    latitude: Number(ticket.latitude),
    longitude: Number(ticket.longitude),
    extra: {
      place_name: ticket.place_name,
      area: ticket.area,
      address: ticket.address,
      postal_code: ticket.postal_code,
    },
  });
  if (ticket.ward_id) {
    const ward = wardById(ticket.ward_id);
    built.ward = ticket.ward_id;
    built.ward_id = ticket.ward_id;
    built.ward_number = ticket.ward_number || ward?.ward_number || '';
    built.ward_name = ticket.ward_name || ward?.ward_name || ticket.ward_id;
    built.zone = ticket.zone || ward?.zone || '';
  }
  return built;
};

export const locationLine = (ticket) => {
  const loc = ticketLocation(ticket);
  return (
    loc.address ||
    [loc.place_name, loc.area, loc.city].filter(Boolean).join(', ') ||
    'Location pending'
  );
};
