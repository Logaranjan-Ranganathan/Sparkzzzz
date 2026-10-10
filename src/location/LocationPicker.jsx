import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, CheckCircle2, LocateFixed, MapPin, Search } from 'lucide-react';
import { CITY } from './chennaiPlaces';
import { getActiveWards, subscribe } from './wardDirectory';
import {
  getBrowserLocation,
  locationHierarchy,
  manualWardLocation,
  reverseGeocode,
  searchPlaces,
} from './locationService';

const pinIcon = L.divIcon({
  className: 'ug-pin',
  html: '<span class="ug-pin-dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

const TYPE_LABEL = { place: 'Place', area: 'Area', ward: 'Ward', remote: 'Map result' };

export default function LocationPicker({ value, onChange, gpsError, onGpsError, onClearGpsError }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const searchRef = useRef(null);
  const debounce = useRef(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [touched, setTouched] = useState(false);
  const [wardPick, setWardPick] = useState('');
  const [, bump] = useState(0);

  useEffect(() => subscribe(() => bump((v) => v + 1)), []);
  const wards = getActiveWards();

  const lat = Number(value?.latitude) || CITY.center.latitude;
  const lon = Number(value?.longitude) || CITY.center.longitude;

  const applyLocation = (loc, { fly = true } = {}) => {
    if (!loc) return;
    setTouched(true);
    setWardPick(loc.ward_id || '');
    onChange?.(loc);
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const ll = L.latLng(loc.latitude, loc.longitude);
    marker.setLatLng(ll);
    if (fly) map.flyTo(ll, Math.max(map.getZoom(), 15), { duration: 0.6 });
  };

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return undefined;

    const map = L.map(mapEl.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lon], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const marker = L.marker([lat, lon], { draggable: true, icon: pinIcon }).addTo(map);

    marker.on('dragend', async () => {
      const { lat: mlat, lng } = marker.getLatLng();
      const loc = await reverseGeocode(mlat, lng);
      applyLocation(loc, { fly: false });
    });

    map.on('click', async (e) => {
      const loc = await reverseGeocode(e.latlng.lat, e.latlng.lng);
      applyLocation(loc, { fly: false });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - lat) < 1e-6 && Math.abs(current.lng - lon) < 1e-6) return;
    marker.setLatLng([lat, lon]);
  }, [lat, lon]);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!query.trim()) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const rows = await searchPlaces(query);
      setSuggestions(rows);
      setSearching(false);
      setOpen(true);
    }, 220);
    return () => clearTimeout(debounce.current);
  }, [query]);

  const locateMe = async () => {
    onClearGpsError?.();
    setLocating(true);
    try {
      const pos = await getBrowserLocation();
      const loc = await reverseGeocode(pos.latitude, pos.longitude);
      applyLocation(loc);
    } catch (err) {
      onGpsError?.(err);
    } finally {
      setLocating(false);
    }
  };

  const confirmed = Boolean(value?.place_name || value?.address || value?.ward_id);
  const needsWard = Boolean(!value?.ward_id && (touched || value?.place_name || value?.address));
  const hierarchyRows = useMemo(
    () => locationHierarchy(value).filter((row) => row.value && row.value !== '—'),
    [value]
  );

  const pickSuggestion = (s) => {
    applyLocation(s.location);
    setQuery(s.label);
    setOpen(false);
  };

  return (
    <div className="loc-picker">
      <div className="loc-map-wrap">
        <div className="loc-search-float">
          <Search className="w-4 h-4 loc-search-ico" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            placeholder="Search for a place, street, landmark or area"
            aria-label="Search location"
            autoComplete="off"
          />
        </div>
        {open && (searching || query.trim()) && (
          <ul className="loc-suggest" role="listbox">
            {searching && <li className="loc-suggest-empty">Searching places…</li>}
            {!searching &&
              suggestions.map((s) => (
                <li key={`${s.type}-${s.id}`}>
                  <button type="button" onClick={() => pickSuggestion(s)}>
                    <MapPin className="w-4 h-4" />
                    <span>
                      <strong>
                        {s.label}
                        <span className={`loc-chip loc-chip-${s.type}`}>{TYPE_LABEL[s.type] || 'Result'}</span>
                      </strong>
                      {s.hierarchy && <em>{s.hierarchy}</em>}
                    </span>
                  </button>
                </li>
              ))}
            {!searching && suggestions.length === 0 && query.trim() && (
              <li className="loc-suggest-empty">No matching places. Try a Chennai area or landmark.</li>
            )}
          </ul>
        )}
        <button type="button" className="loc-fab" onClick={locateMe} disabled={locating} aria-label="Locate me">
          <LocateFixed className={`w-4 h-4 ${locating ? 'spin' : ''}`} />
        </button>
        <div ref={mapEl} className="loc-map" role="application" aria-label="Interactive location map" />
      </div>

      {gpsError && (
        <div className="error-state loc-gps-error" role="alert">
          <p className="font-semibold">{gpsError.message}</p>
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {gpsError.code === 'DENIED' && (
              <button type="button" className="ghost-btn" onClick={locateMe}>
                Try Again
              </button>
            )}
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                onClearGpsError?.();
                searchRef.current?.focus();
              }}
            >
              Search Location Manually
            </button>
          </div>
        </div>
      )}

      {needsWard && (
        <div className="ward-fallback" role="status">
          <p className="ward-fallback-title">
            <AlertTriangle className="w-4 h-4" /> Unable to identify your ward automatically.
          </p>
          <p className="ward-fallback-hint">
            Select the ward for this location so your report reaches the correct ward team. You never need to type a
            ward number.
          </p>
          <div className="ward-fallback-row">
            <select
              className="field-control"
              aria-label="Select your ward"
              value={wardPick}
              onChange={(e) => setWardPick(e.target.value)}
            >
              <option value="">Select your ward…</option>
              {wards.map((w) => (
                <option key={w.ward_id} value={w.ward_id}>
                  {w.ward_name} ({w.ward_id}, No. {w.ward_number})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary-btn"
              disabled={!wardPick}
              onClick={() => applyLocation(manualWardLocation(wardPick))}
            >
              Use This Ward
            </button>
          </div>
        </div>
      )}

      <div className="loc-sheet">
        {confirmed ? (
          <>
            <p className="loc-sheet-confirm">
              <CheckCircle2 className="w-4 h-4" /> Location confirmed
            </p>
            <ul className="loc-hierarchy">
              {hierarchyRows.map((row) => (
                <li key={row.key}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </li>
              ))}
            </ul>
            {value?.ward_id && (
              <p className={`loc-detection ${value.ward_detection === 'manual' ? 'is-manual' : 'is-auto'}`}>
                {value.ward_detection === 'manual' ? 'Ward selected manually' : 'Ward detected automatically'}
              </p>
            )}
            {needsWard && <p className="loc-detection is-missing">Ward not identified yet</p>}
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
            <div className="loc-sheet-actions">
              <button type="button" className="ghost-btn" onClick={() => searchRef.current?.focus()}>
                <Search className="w-4 h-4" /> Change Location
              </button>
              <button type="button" className="ghost-btn" onClick={locateMe} disabled={locating}>
                <LocateFixed className={`w-4 h-4 ${locating ? 'spin' : ''}`} /> Use my current location
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">Selected location</p>
            <p className="loc-sheet-title">
              <MapPin className="w-4 h-4" /> Tap the map, search, or use current location
            </p>
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
            <button type="button" className="ghost-btn mt-3" onClick={locateMe} disabled={locating}>
              <LocateFixed className="w-4 h-4" /> Use my current location
            </button>
          </>
        )}
      </div>
    </div>
  );
}
