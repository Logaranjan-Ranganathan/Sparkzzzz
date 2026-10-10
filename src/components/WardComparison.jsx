import { useEffect, useMemo, useState } from 'react';
import { comparisonRows } from '../analytics/wardAnalytics';
import { getDemoNotice, subscribe } from '../location/wardDirectory';

const METRICS = {
  performance: {
    label: 'Performance Score',
    unit: '/100',
    higherBetter: true,
    get: (r) => r.performanceScore,
    fmt: (v) => (v === null ? '—' : `${v}`),
  },
  resolutionRate: {
    label: 'Resolution Rate',
    unit: '%',
    higherBetter: true,
    get: (r) => r.resolutionRate,
    fmt: (v) => (v === null ? '—' : `${v}%`),
  },
  sla: {
    label: 'SLA Compliance',
    unit: '%',
    higherBetter: true,
    get: (r) => r.slaCompliance,
    fmt: (v) => (v === null ? '—' : `${v}%`),
  },
  speed: {
    label: 'Avg Resolution Time',
    unit: 'days',
    higherBetter: false,
    get: (r) => r.avgResolutionDays,
    fmt: (v) => (v === null ? '—' : `${v.toFixed(1)} d`),
  },
  satisfaction: {
    label: 'Citizen Satisfaction',
    unit: '%',
    higherBetter: true,
    get: (r) => r.satisfaction,
    fmt: (v) => (v === null ? '—' : `${v}%`),
  },
  health: {
    label: 'Ward Health Score',
    unit: '/100',
    higherBetter: true,
    get: (r) => r.healthScore,
    fmt: (v) => (v === null ? '—' : `${v}`),
  },
};

/**
 * Spec §14 — ward comparison page. Ranked bars for the selected metric plus
 * a full comparison table across all active wards.
 */
export default function WardComparison({ tickets = [] }) {
  const [metric, setMetric] = useState('performance');
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((v) => v + 1)), []);

  const rows = useMemo(() => comparisonRows(tickets), [tickets]);
  const active = METRICS[metric];

  const ranked = useMemo(() => {
    const withValues = rows.filter((r) => active.get(r) !== null && active.get(r) !== undefined);
    const without = rows.filter((r) => active.get(r) === null || active.get(r) === undefined);
    const sorted = [...withValues].sort((a, b) =>
      active.higherBetter ? active.get(b) - active.get(a) : active.get(a) - active.get(b)
    );
    return [...sorted, ...without];
  }, [rows, active]);

  const numericValues = ranked.map((r) => active.get(r)).filter((v) => v !== null && v !== undefined);
  const max = Math.max(...numericValues, 0.0001);

  return (
    <div className="ward-comparison">
      <div className="filters">
        <div className="seg" role="tablist" aria-label="Comparison metric">
          {Object.entries(METRICS).map(([key, m]) => (
            <button key={key} type="button" className={metric === key ? 'is-on' : ''} onClick={() => setMetric(key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        {active.higherBetter ? 'Higher is better' : 'Lower is better'} · {active.unit}
        {' · '}
        {getDemoNotice()}
      </p>

      <section className="card card-pad mt-3">
        <h3 className="section-title">{active.label} — ward ranking</h3>
        {ranked.length === 0 ? (
          <div className="empty-state">
            <p className="font-semibold">No wards to compare</p>
          </div>
        ) : (
          <ol className="compare-bars">
            {ranked.slice(0, 12).map((r, i) => {
              const value = active.get(r);
              const width = value === null || value === undefined ? 0 : active.higherBetter ? value : (value / max) * 100;
              return (
                <li key={r.ward_id} className={value === null || value === undefined ? 'is-empty' : ''}>
                  <span className="compare-rank" aria-label={`Rank ${i + 1}`}>
                    {i + 1}
                  </span>
                  <div className="compare-bar-row">
                    <div className="flex justify-between text-xs mb-1">
                      <span>
                        {r.ward_name} <em className="text-slate-400">({r.ward_id})</em>
                      </span>
                      <span className="mono">{active.fmt(value)}</span>
                    </div>
                    <div className="chart-track">
                      <div
                        className={`chart-fill ${i === 0 ? 'is-top' : ''}`}
                        style={{ width: `${Math.min(100, Math.max(2, width))}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="table-wrap mt-4">
        <table className="table data">
          <thead>
            <tr>
              <th>Ward</th>
              <th>Zone</th>
              <th>Total</th>
              <th>Resolved</th>
              <th>Resolution</th>
              <th>SLA</th>
              <th>Avg time</th>
              <th>Satisfaction</th>
              <th>Overdue</th>
              <th>Critical</th>
              <th>Perf.</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ward_id}>
                <td>
                  <strong>{r.ward_name}</strong>
                  <br />
                  <span className="text-xs text-slate-400">
                    {r.ward_id} · No. {r.ward_number}
                  </span>
                </td>
                <td>{r.zone}</td>
                <td className="mono">{r.total}</td>
                <td className="mono">{r.resolved}</td>
                <td className="mono">{METRICS.resolutionRate.fmt(r.resolutionRate)}</td>
                <td className="mono">{METRICS.sla.fmt(r.slaCompliance)}</td>
                <td className="mono">{METRICS.speed.fmt(r.avgResolutionDays)}</td>
                <td className="mono">{METRICS.satisfaction.fmt(r.satisfaction)}</td>
                <td className="mono">{r.overdue}</td>
                <td className="mono">{r.critical}</td>
                <td>
                  <span className="badge badge-info mono">{r.performanceScore}</span>
                </td>
                <td>
                  <span className="badge badge-ok mono">{r.healthScore}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
