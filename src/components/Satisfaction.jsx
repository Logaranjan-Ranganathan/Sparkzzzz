import React, { useState } from 'react';
import { Star, ThumbsDown, ThumbsUp } from 'lucide-react';

/**
 * Spec §26 — post-resolution citizen satisfaction: 👍/👎 plus optional 1–5
 * stars. onFeedback receives { satisfaction: 'up'|'down', rating } — the
 * parent applies it via applyCitizenFeedback (a 👎 reopens the ticket).
 */
export default function Satisfaction({ ticket, onFeedback }) {
  const [choice, setChoice] = useState(ticket?.satisfaction || '');
  const [rating, setRating] = useState(Number(ticket?.rating) || 0);
  const [hover, setHover] = useState(0);
  const [sent, setSent] = useState(false);

  if (!ticket) return null;
  if (ticket.status !== 'Resolved') {
    /* A 👎 reopens the ticket — explain that instead of silently hiding. */
    if (ticket.satisfaction === 'down' && ticket.feedback_at) {
      return (
        <section className="card card-pad satisfaction" aria-label="Citizen satisfaction">
          <h3 className="section-title">Thanks for your feedback</h3>
          <p className="text-sm mt-1">
            You reported that the problem persists. This issue has been <strong>reopened</strong> and routed back
            to the ward team with your rating attached.
          </p>
        </section>
      );
    }
    return null;
  }

  const alreadyRated = Boolean(ticket.satisfaction) && !choice;
  const effectiveChoice = choice || ticket.satisfaction || '';
  const effectiveRating = rating || Number(ticket.rating) || 0;

  const submit = (thumbs, stars) => {
    onFeedback?.({ satisfaction: thumbs, rating: stars });
    setSent(true);
  };

  return (
    <section className="card card-pad satisfaction" aria-label="Citizen satisfaction">
      <h3 className="section-title">Was your issue resolved well?</h3>
      <p className="text-xs text-slate-500 mt-1">
        Your feedback is anonymous and feeds this ward&apos;s performance score.
      </p>

      <div className="satisfaction-thumbs" role="group" aria-label="Rate the resolution">
        <button
          type="button"
          className={`satisfaction-btn ${effectiveChoice === 'up' ? 'is-on is-up' : ''}`}
          onClick={() => {
            setChoice('up');
            if (alreadyRated) submit('up', effectiveRating);
          }}
          aria-pressed={effectiveChoice === 'up'}
        >
          <ThumbsUp className="w-5 h-5" /> Yes, resolved
        </button>
        <button
          type="button"
          className={`satisfaction-btn ${effectiveChoice === 'down' ? 'is-on is-down' : ''}`}
          onClick={() => {
            setChoice('down');
            if (alreadyRated) submit('down', effectiveRating);
          }}
          aria-pressed={effectiveChoice === 'down'}
        >
          <ThumbsDown className="w-5 h-5" /> No, problem persists
        </button>
      </div>

      {effectiveChoice && (
        <div className="satisfaction-stars">
          <span className="field-label">Optional star rating</span>
          <div className="star-row" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`star ${(hover || effectiveRating) >= n ? 'is-on' : ''}`}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                aria-checked={effectiveRating === n}
                role="radio"
              >
                <Star className="w-5 h-5" />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              className="primary-btn"
              onClick={() => submit(effectiveChoice, rating)}
              disabled={sent && ticket.satisfaction === effectiveChoice && Number(ticket.rating) === rating}
            >
              Submit feedback
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => submit(effectiveChoice, 0)}
            >
              Skip stars
            </button>
          </div>
        </div>
      )}

      {sent && ticket.satisfaction && (
        <p className="text-xs mt-2" style={{ color: 'var(--ok)' }}>
          {ticket.satisfaction === 'up'
            ? 'Thanks! Your feedback has been recorded.'
            : 'Thanks — this ticket has been reopened for the ward team.'}
        </p>
      )}
    </section>
  );
}
