import { displayTicketId, priorityBand } from '../civicEngine.js';
import { locationLine } from '../location/locationService.js';

export function exportTicketsToCSV(tickets, filename = 'urbangrid_complaints_export.csv') {
  if (!tickets || tickets.length === 0) {
    alert('No complaints to export.');
    return;
  }

  const headers = [
    'Reference ID',
    'Category',
    'Description',
    'Status',
    'Priority Level',
    'Priority Score',
    'Report Count',
    'Ward ID',
    'Ward Name',
    'Zone',
    'Location',
    'Latitude',
    'Longitude',
    'Assigned Officer',
    'Department',
    'Created At',
    'Response Deadline',
    'Resolution Target',
    'SLA Status',
    'Resolved At',
    'Resolution Note',
  ];

  const escapeCSV = (val) => {
    if (val == null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = tickets.map((t) => [
    escapeCSV(displayTicketId(t)),
    escapeCSV(t.category),
    escapeCSV(t.description),
    escapeCSV(t.status),
    escapeCSV(priorityBand(t.priority_score, t.status).label),
    escapeCSV(t.priority_score),
    escapeCSV(t.report_count || 1),
    escapeCSV(t.ward_id || ''),
    escapeCSV(t.ward_name || ''),
    escapeCSV(t.zone || ''),
    escapeCSV(locationLine(t)),
    escapeCSV(t.latitude),
    escapeCSV(t.longitude),
    escapeCSV(t.assigned_officer || 'Unassigned'),
    escapeCSV(t.department || ''),
    escapeCSV(t.created_at || ''),
    escapeCSV(t.response_deadline || ''),
    escapeCSV(t.deadline || ''),
    escapeCSV(t.sla_status || 'on_track'),
    escapeCSV(t.resolved_at || ''),
    escapeCSV(t.resolution_note || ''),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
