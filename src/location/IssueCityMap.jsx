import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CITY, MAP_LABELS } from './chennaiPlaces';
import { locationLine, ticketLocation } from './locationService';

const pinColor = (ticket) => {
  if (ticket.status === 'Resolved') return '#0f7a4a';
  if (ticket.priority_score >= 4) return '#c03221';
  if (ticket.priority_score >= 3) return '#c2410c';
  if (ticket.priority_score >= 2) return '#ca8a04';
  return '#1d4ed8';
};

const issueIcon = (ticket) =>
  L.divIcon({
    className: 'ug-issue-pin',
    html: `<span class="ug-issue-dot" style="background:${pinColor(ticket)}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

export default function IssueCityMap({ tickets = [], onSelect, focus, showLabels = true, height = 360 }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!el.current || mapRef.current) return undefined;

    const map = L.map(el.current, { zoomControl: true }).setView(
      [CITY.center.latitude, CITY.center.longitude],
      CITY.zoom
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    if (showLabels) {
      MAP_LABELS.forEach((place) => {
        L.marker([place.latitude, place.longitude], {
          icon: L.divIcon({
            className: 'ug-label',
            html: `<span>${place.name.replace(' Railway Station', '')}</span>`,
            iconSize: [0, 0],
          }),
          interactive: false,
        }).addTo(map);
      });
    }

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [showLabels]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    tickets.forEach((ticket) => {
      const lat = Number(ticket.latitude);
      const lon = Number(ticket.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return;
      const loc = ticketLocation(ticket);
      const pLabel =
        ticket.status === 'Resolved'
          ? 'Resolved'
          : ticket.priority_score >= 4
            ? 'Critical'
            : ticket.priority_score >= 3
              ? 'High'
              : ticket.priority_score >= 2
                ? 'Medium'
                : 'Low';
      const marker = L.marker([lat, lon], { icon: issueIcon(ticket) });
      marker.bindPopup(
        `<div class="ug-popup">
          <p class="ug-popup-kicker">${ticket.category || 'ISSUE'}</p>
          <p class="ug-popup-title">${ticket.description || ''}</p>
          <p><strong>Ticket:</strong> ${ticket.ticket_id || ticket.id}</p>
          <p><strong>Reports:</strong> ${ticket.report_count || ticket.priority_score || 1}</p>
          <p><strong>Location:</strong> ${locationLine(ticket)}</p>
          <p><strong>Ward:</strong> ${loc.ward_id || ticket.ward_id || '—'}</p>
          <p><strong>Priority:</strong> ${pLabel}</p>
          <p><strong>Status:</strong> ${ticket.status}</p>
          <button type="button" class="ug-popup-btn" data-ticket="${ticket.id}">View Issue</button>
        </div>`
      );
      marker.on('popupopen', () => {
        const btn = document.querySelector(`.ug-popup-btn[data-ticket="${ticket.id}"]`);
        if (btn) {
          btn.onclick = () => onSelect?.(ticket.id);
        }
      });
      marker.addTo(layer);
    });
  }, [tickets, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const lat = Number(focus.latitude);
    const lon = Number(focus.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    map.flyTo([lat, lon], 16, { duration: 0.7 });
  }, [focus]);

  return (
    <div className="issue-city-map" style={{ minHeight: height }}>
      <div ref={el} className="loc-map" style={{ minHeight: height }} role="img" aria-label="City issue map" />
    </div>
  );
}
