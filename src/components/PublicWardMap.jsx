import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ShieldCheck } from 'lucide-react';
import { CATEGORY_GROUPS, displayTicketId } from '../civicEngine';
import {
  areaById,
  areasOfWard,
  getCity,
  subscribe,
  wardById,
} from '../location/wardDirectory';
import WardSelector from './WardSelector';

const CATEGORIES = Object.keys(CATEGORY_GROUPS);

const STATUS_STYLE = {
  open: { color: '#c03221', label: 'Open' },
  progress: { color: '#b45309', label: 'In Progress' },
  resolved: { color: '#0f7a4a', label: 'Resolved' },
};

const bucketOf = (status) =>
  status === 'Resolved'
    ? 'resolved'
    : ['Assigned', 'In Progress'].includes(status)
      ? 'progress'
      : 'open';

/**
 * Spec §18 — public ward map. Citizens can explore issues by ward, area,
 * category and status. Popups carry issue facts only: no personal citizen
 * information is ever displayed.
 */
export default function PublicWardMap({ tickets = [], onSelect, height = 460 }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const [ward, setWard] = useState('all');
  const [area, setArea] = useState('all');
  const [category, setCategory] = useState('all');
  const [statusBucket, setStatusBucket] = useState('all');
  const [, bump] = useState(0);

  useEffect(() => subscribe(() => bump((v) => v + 1)), []);

  const areaOptions = ward === 'all' ? [] : areasOfWard(ward);

  const visible = useMemo(() => {
    const areaName = area !== 'all' ? areaById(area)?.area_name : null;
    return tickets.filter((t) => {
      if (ward !== 'all' && t.ward_id !== ward) return false;
      if (areaName && !(t.area_id === area || t.area === areaName)) return false;
      if (category !== 'all' && t.category !== category) return false;
      if (statusBucket !== 'all' && bucketOf(t.status) !== statusBucket) return false;
      return true;
    });
  }, [tickets, ward, area, category, statusBucket]);

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

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    visible.forEach((t) => {
      const lat = Number(t.latitude);
      const lon = Number(t.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return;
      const style = STATUS_STYLE[bucketOf(t.status)];
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'ug-issue-pin',
          html: `<span class="ug-issue-dot" style="background:${style.color}"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      });
      /* Public popup: issue facts only — never any personal citizen data. */
      marker.bindPopup(
        `<div class="ug-popup">
          <p class="ug-popup-kicker">${t.category || 'ISSUE'}</p>
          <p class="ug-popup-title">${t.description || ''}</p>
          <p><strong>Ticket:</strong> ${displayTicketId(t)}</p>
          <p><strong>Place:</strong> ${t.place_name || t.area || '—'}</p>
          <p><strong>Ward:</strong> ${t.ward_name || t.ward_id || '—'}</p>
          <p><strong>Reports:</strong> ${t.report_count || 1}</p>
          <p><strong>Status:</strong> ${t.status}</p>
          <button type="button" class="ug-popup-btn" data-ticket="${t.id}">View Issue</button>
        </div>`
      );
      marker.on('popupopen', () => {
        const btn = document.querySelector(`.ug-popup-btn[data-ticket="${t.id}"]`);
        if (btn) btn.onclick = () => onSelect?.(t.id);
      });
      marker.addTo(layer);
    });
  }, [visible, onSelect]);

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

  const counts = useMemo(() => {
    const acc = { open: 0, progress: 0, resolved: 0 };
    tickets.forEach((t) => {
      if (
        (ward === 'all' || t.ward_id === ward) &&
        (category === 'all' || t.category === category) &&
        (area === 'all' || t.area_id === area || t.area === areaById(area)?.area_name)
      ) {
        acc[bucketOf(t.status)] += 1;
      }
    });
    return acc;
  }, [tickets, ward, area, category]);

  return (
    <div className="public-ward-map">
      <div className="filters public-map-filters">
        <WardSelector
          value={ward}
          onChange={(v) => {
            setWard(v);
            setArea('all');
          }}
          label="Ward"
          id="public-ward"
        />
        <div className="ward-select">
          <label className="field-label" htmlFor="public-area">
            Area
          </label>
          <select
            id="public-area"
            className="field-control"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={ward === 'all'}
          >
            <option value="all">{ward === 'all' ? 'Pick a ward first' : 'All Areas'}</option>
            {areaOptions.map((a) => (
              <option key={a.area_id} value={a.area_id}>
                {a.area_name}
              </option>
            ))}
          </select>
        </div>
        <div className="ward-select">
          <label className="field-label" htmlFor="public-category">
            Category
          </label>
          <select id="public-category" className="field-control" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="ward-select">
          <span className="field-label">Status</span>
          <div className="seg" role="tablist" aria-label="Filter by status">
            {['all', 'open', 'progress', 'resolved'].map((b) => (
              <button
                key={b}
                type="button"
                className={statusBucket === b ? 'is-on' : ''}
                onClick={() => setStatusBucket(b)}
              >
                {b === 'all' ? 'All' : STATUS_STYLE[b].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="public-map-body">
        <div className="heat-map-wrap">
          <div ref={el} className="loc-map" style={{ minHeight: height }} role="img" aria-label="Public issue map" />
          <div className="map-legend">
            <span>
              <i className="dot" style={{ background: STATUS_STYLE.open.color }} /> Open ({counts.open})
            </span>
            <span>
              <i className="dot" style={{ background: STATUS_STYLE.progress.color }} /> In Progress ({counts.progress})
            </span>
            <span>
              <i className="dot" style={{ background: STATUS_STYLE.resolved.color }} /> Resolved ({counts.resolved})
            </span>
          </div>
        </div>
      </div>

      <p className="public-privacy-note">
        <ShieldCheck className="w-4 h-4" /> Public view — {visible.length} issue
        {visible.length === 1 ? '' : 's'} shown. No personal citizen information is displayed.
      </p>
    </div>
  );
}
