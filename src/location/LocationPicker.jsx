import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { CITY } from './chennaiPlaces';
import {
  getBrowserLocation,
  reverseGeocode,
  searchPlaces,
} from './locationService';

const pinIcon = L.divIcon({
  className: 'ug-pin',
  html: '<span class="ug-pin-dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

export default function LocationPicker({ value, onChange, gpsError, onGpsError, onClearGpsError }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounce = useRef(null);

  const lat = Number(value?.latitude) || CITY.center.latitude;
  const lon = Number(value?.longitude) || CITY.center.longitude;

  const applyLocation = (loc, { fly = true } = {}) => {
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
      onChange?.(loc);
    });

    map.on('click', async (e) => {
      const loc = await reverseGeocode(e.latlng.lat, e.latlng.lng);
      marker.setLatLng(e.latlng);
      onChange?.(loc);
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

  const selectedLabel = useMemo(() => {
    if (!value?.place_name && !value?.address) return 'Tap the map, search, or use current location';
    return value.address || `${value.place_name}, ${value.city || 'Chennai'}`;
  }, [value]);

  return (
    <div className="loc-picker">
      <div className="loc-map-wrap">
        <div className="loc-search-float">
          <Search className="w-4 h-4 loc-search-ico" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            placeholder="Search for a place, street, landmark or area"
            aria-label="Search location"
            autoComplete="off"
          />
        </div>
        {open && (suggestions.length > 0 || searching) && (
          <ul className="loc-suggest" role="listbox">
            {searching && <li className="loc-suggest-empty">Searching places…</li>}
            {suggestions.map((s) => (
              <li key={`${s.place_name}-${s.latitude}`}>
                <button
                  type="button"
                  onClick={() => {
                    applyLocation(s);
                    setQuery(s.place_name);
                    setOpen(false);
                  }}
                >
                  <MapPin className="w-4 h-4" />
                  <span>
                    <strong>{s.place_name}</strong>
                    <em>
                      {s.area && s.area !== s.place_name ? `${s.area}, ` : ''}
                      {s.city}, {s.state}
                    </em>
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
                document.querySelector('.loc-search-float input')?.focus();
              }}
            >
              Search Location Manually
            </button>
          </div>
        </div>
      )}

      <div className="loc-sheet">
        <p className="eyebrow">Selected location</p>
        <p className="loc-sheet-title">
          <MapPin className="w-4 h-4" /> {selectedLabel}
        </p>
        {value?.ward_id && (
          <p className="text-sm text-slate-500 mt-1">
            Ward <strong>{value.ward_id}</strong>
          </p>
        )}
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
        {value?.place_name && (
          <p className="text-xs text-slate-500 mt-2">Your report will be associated with this location.</p>
        )}
        <button type="button" className="ghost-btn mt-3" onClick={locateMe} disabled={locating}>
          <LocateFixed className="w-4 h-4" /> Use my current location
        </button>
      </div>
    </div>
  );
}
