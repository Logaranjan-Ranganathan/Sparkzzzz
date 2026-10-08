import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Flame, Star, TrendingUp } from 'lucide-react';
import {
  areaHealth,
  maintenanceAlerts,
  placeRiskScores,
  recurringIssues,
  topProblemPlaces,
  wardStats,
} from '../analytics/wardAnalytics';
import { getDemoNotice, subscribe, wardById } from '../location/wardDirectory';
import WardSelector from './WardSelector';

const fmtDays = (d) => (d === null ? '—' : `${d.toFixed(1)} d`);
const fmtPct = (p) => (p === null ? '—' : `${p}%`);

const Stars = ({ count }) => (
  <span className="star-display" aria-label={`${count} of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`w-4 h-4 ${n <= count ? 'is-on' : 'is-off'}`} />
    ))}
  </span>
);

const RiskBadge = ({ level }) => (
  <span className={`badge risk-${level.toLowerCase()}`}>{level}</span>
);

/**
 * Spec §8, §9, §11–§13, §23, §24 — ward performance page. One ward at a
 * time: KPIs, Ward Health Score with stars, top problem places, area
 * health clusters, recurring problem detection, maintenance alerts and
 * place risk scores.
 */
export default function WardPerformance({ tickets = [] }) {
  const [wardId, setWardId] = useState('all');
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((v) => v + 1)), []);

  const stats = useMemo(() => wardStats(tickets, wardId), [tickets, wardId]);
  const problemPlaces = useMemo(() => topProblemPlaces(tickets, wardId, 5), [tickets, wardId]);
  const areas = useMemo(() => areaHealth(tickets, wardId), [tickets, wardId]);
  const recurring = useMemo(() => recurringIssues(tickets, wardId), [tickets, wardId]);
  const alerts = useMemo(() => maintenanceAlerts(tickets, wardId), [tickets, wardId]);
  const risks = useMemo(() => placeRiskScores(tickets, wardId).slice(0, 6), [tickets, wardId]);

  const ward = wardId !== 'all' ? wardById(wardId) : null;
  const scopeLabel = ward ? `${ward.ward_name} (${ward.ward_id})` : 'All wards — city wide';

  const kpis = [
    { label: 'Total issues', value: stats.total },
    { label: 'Open', value: stats.open },
    { label: 'In progress', value: stats.inProgress },
    { label: 'Resolved', value: stats.resolved },
    { label: 'Critical', value: stats.critical },
    { label: 'Overdue', value: stats.overdue },
  ];

  return (
    <div className="ward-performance">
      <div className="ward-perf-head">
        <WardSelector value={wardId} onChange={setWardId} label="Ward" id="perf-ward" allLabel="All Wards (City)" />
        <div className="ward-meta">
          <strong>{scopeLabel}</strong>
          {ward && (
            <p className="text-xs text-slate-500 mt-0.5">
              Ward No. {ward.ward_number} · {ward.zone} Zone · PIN {ward.postal_code || '—'}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">{getDemoNotice()}</p>
        </div>
      </div>

      <div className="ward-score-row">
        <section className="card card-pad ward-score-card">
          <h3 className="section-title">Ward Health Score</h3>
          <div className="flex items-center gap-4 mt-2">
            <div className="score-ring" style={{ '--p': stats.healthScore }}>
              <span>{stats.healthScore}</span>
            </div>
            <div>
              <span className={`badge badge-${stats.healthStatus.tone}`}>{stats.healthStatus.label}</span>
              <div className="mt-2">
                <Stars count={stats.stars} />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {stats.recurringCount} recurring problem{stats.recurringCount === 1 ? '' : 's'} detected
              </p>
            </div>
          </div>
        </section>

        <section className="card card-pad ward-score-card">
          <h3 className="section-title">Ward Performance Score</h3>
          <div className="flex items-center gap-4 mt-2">
            <div className="score-ring" style={{ '--p': stats.performanceScore }}>
              <span>{stats.performanceScore}</span>
            </div>
            <ul className="perf-metrics">
              <li>
                <span>Avg resolution time</span>
                <strong className="mono">{fmtDays(stats.avgResolutionDays)}</strong>
              </li>
              <li>
                <span>SLA compliance</span>
                <strong className="mono">{fmtPct(stats.slaCompliance)}</strong>
              </li>
              <li>
                <span>Citizen satisfaction</span>
                <strong className="mono">{fmtPct(stats.satisfaction)}</strong>
              </li>
              <li>
                <span>Avg star rating</span>
                <strong className="mono">{stats.avgRating === null ? '—' : stats.avgRating.toFixed(1)}/5</strong>
              </li>
            </ul>
          </div>
        </section>

        <div className="kpi-grid ward-kpis">
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <p className="eyebrow">{k.label}</p>
              <strong>{k.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card card-pad">
          <h3 className="section-title">Top problem locations</h3>
          <p className="text-xs text-slate-500 mt-1">Where this ward&apos;s issues cluster (spec §9).</p>
          {problemPlaces.length === 0 ? (
            <div className="empty-state">
              <p className="font-semibold">No issues recorded yet</p>
            </div>
          ) : (
            <table className="table data">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Dominant category</th>
                  <th>Active</th>
                  <th>Reports</th>
                </tr>
              </thead>
              <tbody>
                {problemPlaces.map((p) => (
                  <tr key={p.place_name + p.dominantCategory}>
                    <td>{p.place_name}</td>
                    <td>{p.dominantCategory}</td>
                    <td>{p.active}</td>
                    <td className="mono">{p.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card card-pad">
          <h3 className="section-title">Area health</h3>
          <p className="text-xs text-slate-500 mt-1">Issues clustered by category within each area (spec §11).</p>
          {areas.length === 0 ? (
            <div className="empty-state">
              <p className="font-semibold">No area activity yet</p>
            </div>
          ) : (
            <ul className="area-health-list">
              {areas.map((a) => (
                <li key={a.area_id || a.area_name}>
                  <div className="area-health-head">
                    <strong>{a.area_name}</strong>
                    <span className={`badge badge-${a.verdict.tone}`}>{a.verdict.label}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {a.dominantCategory} × {a.dominantCount} · {a.active} active · {a.overdue} overdue ·{' '}
                    {a.critical} critical · {a.resolved} resolved
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card card-pad">
        <h3 className="section-title flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Recurring problems
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Places with 3+ tickets in the same category, tracked over the last 6 months (spec §12).
        </p>
        {recurring.length === 0 ? (
          <div className="empty-state">
            <p className="font-semibold">No recurring problems detected</p>
            <p className="text-sm mt-1">Repeated reports at the same place will surface here with a recommendation.</p>
          </div>
        ) : (
          <div className="recurring-grid">
            {recurring.map((r) => {
              const max = Math.max(...r.monthly.map((m) => m.count), 1);
              return (
                <article className="recurring-card" key={r.key}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-sm">{r.place_name}</strong>
                      <p className="text-xs text-slate-500">
                        {r.category} · {r.count} tickets · {r.reports} citizen reports
                      </p>
                    </div>
                    <span className={`badge trend-${r.trend}`}>{r.trendLabel}</span>
                  </div>
                  <div className="mini-bars" aria-label="Reports per month">
                    {r.monthly.map((m) => (
                      <div key={m.label} className="mini-bar" title={`${m.label}: ${m.count}`}>
                        <span style={{ height: `${Math.max(6, (m.count / max) * 100)}%` }} />
                        <em>{m.label}</em>
                      </div>
                    ))}
                  </div>
                  <p className="recurring-rec">
                    <Flame className="w-3.5 h-3.5" /> {r.recommendation}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {alerts.length > 0 && (
        <section className="maintenance-alerts">
          <h3 className="section-title flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Smart maintenance alerts
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {alerts.map((a) => (
              <article className="urgent-card" key={a.key}>
                <p className="font-semibold">{a.title}</p>
                <p className="text-sm mt-1">{a.message}</p>
                <p className="text-sm mt-2">
                  <strong>Recommendation:</strong> {a.recommendation}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="card card-pad">
        <h3 className="section-title">Place risk scores</h3>
        <p className="text-xs text-slate-500 mt-1">
          0–100 risk per location with the reasons behind it (spec §24).
        </p>
        {risks.length === 0 ? (
          <div className="empty-state">
            <p className="font-semibold">No location risk to report</p>
          </div>
        ) : (
          <ul className="risk-list">
            {risks.map((r) => (
              <li key={r.key}>
                <div className="risk-head">
                  <strong>{r.place_name}</strong>
                  <span className="text-xs text-slate-500">{r.area_name}</span>
                  <RiskBadge level={r.level} />
                  <span className="mono risk-score">{r.score}/100</span>
                </div>
                {r.reasons.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">Because: {r.reasons.join(' · ')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
