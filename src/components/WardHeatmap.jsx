import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { priorityBand, displayTicketId, CATEGORY_GROUPS } from '../civicEngine';
import {
  areaById,
  areasOfWard,
  getAreas,
  getCity,
  getPlaces,
  placeById,
  placesOfArea,
  placesOfWard,
  subscribe,
  wardById,
} from '../location/wardDirectory';
import WardSelector from './WardSelector';

const CATEGORIES = Object.keys(CATEGORY_GROUPS);
const STATUSES = ['Open', 'Under Review', 'Assigned', 'In Progress', 'Resolved'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low', 'Resolved'];

const LEVELS = {
  HIGH: { emoji: '🔥', color: '#c03221', label: 'High activity' },
  MEDIUM: { emoji: '🟠', color: '#c2410c', label: 'Moderate activity' },
  LOW: { emoji: '🟢', color: '#0f7a4a', label: 'Low activity' },
};

const levelFor = (score) => (score >= 55 ? 'HIGH' : score >= 28 ? 'MEDIUM' : 'LOW');

/**
 * Spec §10 — ward-based issue heatmap. Circles are drawn per location with
 * colour intensity from issue count + severity, and can be filtered by
 * Ward, Area, Place, Category, Priority, Status and date range.
 */
export default function WardHeatmap({ tickets = [], onSelect, height = 420 }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const [ward, setWard] = useState('all');
  const [area, setArea] = useState('all');
  const [place, setPlace] = useState('all');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [, bump] = useState(0);

  useEffect(() => subscribe(() => bump((v) => v + 1)), []);

  const areaOptions = ward === 'all' ? getAreas() : areasOfWard(ward);
  const placeOptions =
    area !== 'all' ? placesOfArea(area) : ward === 'all' ? getPlaces() : placesOfWard(ward);

  const filtered = useMemo(() => {
    const areaName = area !== 'all' ? areaById(area)?.area_name : null;
    const placeName = place !== 'all' ? placeById(place)?.place_name : null;
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return tickets.filter((t) => {
      if (ward !== 'all' && t.ward_id !== ward) return false;
      if (areaName && !(t.area_id === area || t.area === areaName)) return false;
      if (placeName && !(t.place_id === place || t.place_name === placeName)) return false;
      if (category !== 'all' && t.category !== category) return false;
      if (priority !== 'all' && priorityBand(t.priority_score, t.status).label !== priority) return false;
      if (status !== 'all' && t.status !== status) return false;
      const created = new Date(t.created_at).getTime();
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      return true;
    });
  }, [tickets, ward, area, place, category, priority, status, dateFrom, dateTo]);

  /* Group filtered tickets into heat cells (one per place/pinned point). */
  const cells = useMemo(() => {
    const groups = new Map();
    filtered.forEach((t) => {
      const lat = Number(t.latitude);
      const lon = Number(t.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return;
      const key = t.place_id || t.place_name || `${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cell =
        groups.get(key) ||
        {
          key,
          lat,
          lon,
          place_name: t.place_name || 'Pinned location',
          ward_id: t.ward_id || '',
          ward_name: t.ward_name || t.ward_id || '',
          total: 0,
          active: 0,
          overdue: 0,
          critical: 0,
          reports: 0,
          categories: {},
          tickets: [],
        };
      const isActive = t.status !== 'Resolved';
      cell.total += 1;
      cell.reports += Number(t.report_count) || 1;
      if (isActive) {
        cell.active += 1;
        if (t.sla_status === 'overdue') cell.overdue += 1;
        if (Number(t.priority_score) >= 4) cell.critical += 1;
        cell.tickets.push(t);
      }
      cell.categories[t.category] = (cell.categories[t.category] || 0) + 1;
      groups.set(key, cell);
    });

    return [...groups.values()]
      .map((cell) => {
        const score = Math.min(
          100,
          Math.round(cell.active * 10 + cell.critical * 15 + cell.overdue * 12 + Math.min(18, cell.reports * 0.9))
        );
        const dominant = Object.entries(cell.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        return { ...cell, score, level: levelFor(score), dominantCategory: dominant };
      })
      .sort((a, b) => b.score - a.score || b.reports - a.reports);
  }, [filtered]);

  /* Map lifecycle — mirrors IssueCityMap. */
  useEffect(() => {
    if (!el.current || mapRef.current) return undefined;
    const city = getCity();
    const map = L.map(el.current, { zoomControl: true }).setView(
      [city.center.latitude, city.center.longitude],
      city.zoom
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  /* Draw heat circles. */
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    cells.forEach((cell) => {
      const { color } = LEVELS[cell.level];
      const circle = L.circle([cell.lat, cell.lon], {
        radius: 80 + Math.min(260, cell.reports * 8 + cell.total * 20),
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.3,
      });
      const top = [...cell.tickets].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)).slice(0, 3);
      circle.bindPopup(
        `<div class="ug-popup">
          <p class="ug-popup-kicker">${cell.dominantCategory || 'ISSUE'}</p>
          <p class="ug-popup-title">${cell.place_name}</p>
          <p><strong>Ward:</strong> ${cell.ward_name || '—'}</p>
          <p><strong>Issues:</strong> ${cell.total} (${cell.active} active)</p>
          <p><strong>Citizen reports:</strong> ${cell.reports}</p>
          <p><strong>Overdue:</strong> ${cell.overdue} · <strong>Critical:</strong> ${cell.critical}</p>
          <p><strong>Heat level:</strong> ${LEVELS[cell.level].emoji} ${cell.level} (${cell.score}/100)</p>
          ${top
            .map(
              (t) =>
                `<button type="button" class="ug-popup-btn" data-ticket="${t.id}">View ${displayTicketId(t)}</button>`
            )
            .join('')}
          ${cell.tickets.length > 3 ? `<p class="ug-popup-more">+ ${cell.tickets.length - 3} more active issues</p>` : ''}
        </div>`
      );
      circle.on('popupopen', () => {
        top.forEach((t) => {
          const btn = document.querySelector(`.ug-popup-btn[data-ticket="${t.id}"]`);
          if (btn) btn.onclick = () => onSelect?.(t.id);
        });
      });
      circle.addTo(layer);
    });
  }, [cells, onSelect]);

  /* Fly to ward centroid when a single ward is selected. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (ward === 'all') {
      const city = getCity();
      map.flyTo([city.center.latitude, city.center.longitude], city.zoom, { duration: 0.6 });
    } else {
      const w = wardById(ward);
      if (w) map.flyTo([w.latitude, w.longitude], 14, { duration: 0.6 });
    }
  }, [ward]);

  const focusCell = (cell) => mapRef.current?.flyTo([cell.lat, cell.lon], 16, { duration: 0.7 });

  const ranked = cells.slice(0, 8);
  const resetFilters = () => {
    setWard('all');
    setArea('all');
    setPlace('all');
    setCategory('all');
    setPriority('all');
    setStatus('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="ward-heatmap">
      <div className="filters heat-filters">
        <WardSelector
          value={ward}
          onChange={(v) => {
            setWard(v);
            setArea('all');
            setPlace('all');
          }}
          label="Ward"
          id="heat-ward"
        />
        <div className="ward-select">
          <label className="field-label" htmlFor="heat-area">
            Area
          </label>
          <select id="heat-area" className="field-control" value={area} onChange={(e) => { setArea(e.target.value); setPlace('all'); }}>
            <option value="all">All Areas</option>
            {areaOptions.map((a) => (
              <option key={a.area_id} value={a.area_id}>
                {a.area_name}
              </option>
            ))}
          </select>
        </div>
        <div className="ward-select">
          <label className="field-label" htmlFor="heat-place">
            Place
          </label>
          <select id="heat-place" className="field-control" value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="all">All Places</option>
            {placeOptions.map((p) => (
              <option key={p.place_id} value={p.place_id}>
                {p.place_name}
              </option>
            ))}
          </select>
        </div>
        <div className="ward-select">
          <label className="field-label" htmlFor="heat-category">
            Category
          </label>
          <select id="heat-category" className="field-control" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="ward-select">
          <label className="field-label" htmlFor="heat-priority">
            Priority
          </label>
          <select id="heat-priority" className="field-control" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="ward-select">
          <label className="field-label" htmlFor="heat-status">
            Status
          </label>
          <select id="heat-status" className="field-control" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="ward-select">
          <label className="field-label" htmlFor="heat-from">
            From
          </label>
          <input
            id="heat-from"
            type="date"
            className="field-control"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="ward-select">
          <label className="field-label" htmlFor="heat-to">
            To
          </label>
          <input
            id="heat-to"
            type="date"
            className="field-control"
            value={dateTo}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <button type="button" className="ghost-btn" onClick={resetFilters}>
          Reset filters
        </button>
      </div>

      <div className="heat-body">
        <div className="heat-map-wrap">
          <div ref={el} className="loc-map" style={{ minHeight: height }} role="img" aria-label="Ward issue heatmap" />
          <div className="map-legend">
            <span>
              <i className="dot" style={{ background: LEVELS.HIGH.color }} /> High
            </span>
            <span>
              <i className="dot" style={{ background: LEVELS.MEDIUM.color }} /> Moderate
            </span>
            <span>
              <i className="dot" style={{ background: LEVELS.LOW.color }} /> Low
            </span>
          </div>
        </div>

        <aside className="heat-ranking card card-pad">
          <h3 className="section-title">Location density</h3>
          <p className="text-xs text-slate-500 mt-1">
            {filtered.length} issue{filtered.length === 1 ? '' : 's'} across {cells.length} location
            {cells.length === 1 ? '' : 's'}
          </p>
          {ranked.length === 0 ? (
            <div className="empty-state">
              <p className="font-semibold">No issues match these filters</p>
              <p className="text-sm mt-1">Widen the filters to see activity on the map.</p>
            </div>
          ) : (
            <ol className="heat-list">
              {ranked.map((cell) => (
                <li key={cell.key}>
                  <button type="button" onClick={() => focusCell(cell)}>
                    <span className="heat-emoji" aria-hidden="true">
                      {LEVELS[cell.level].emoji}
                    </span>
                    <span className="heat-meta">
                      <strong>{cell.place_name}</strong>
                      <em>
                        {cell.ward_name || 'Ward pending'} · {cell.active} active · {cell.reports} reports
                      </em>
                    </span>
                    <span className={`heat-score heat-${cell.level.toLowerCase()}`}>{cell.score}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
