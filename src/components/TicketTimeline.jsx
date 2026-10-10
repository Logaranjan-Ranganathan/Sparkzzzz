import { buildTicketTimeline } from '../civicEngine';

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';

/**
 * Spec §25 — the 10-stage civic issue lifecycle with a timestamp for every
 * completed stage. Derived from ticket state by buildTicketTimeline; stored
 * timeline events override derived timestamps/notes.
 */
export default function TicketTimeline({ ticket, settings }) {
  if (!ticket) return null;
  const stages = buildTicketTimeline(ticket, settings);

  return (
    <div className="timeline ticket-timeline">
      {stages.map((s) => {
        const on = s.status === 'done' || s.status === 'current';
        return (
          <div className="tl-item" key={s.key}>
            <div className="tl-rail">
              <div className={`tl-dot ${on ? 'is-on' : ''} ${s.status === 'current' ? 'is-current' : ''}`} />
              <div className={`tl-line ${s.status === 'done' ? 'is-on' : ''}`} />
            </div>
            <div className="pb-4">
              <strong className="text-sm">
                {s.label}
                {s.status === 'current' && <span className="badge badge-pending tl-now">Current</span>}
              </strong>
              <p className="text-xs text-slate-500 mt-0.5">
                {s.status === 'pending' ? 'Pending' : fmt(s.at)} · {s.actor}
              </p>
              {s.note && s.status !== 'pending' && <p className="text-xs text-slate-500 mt-1">{s.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
