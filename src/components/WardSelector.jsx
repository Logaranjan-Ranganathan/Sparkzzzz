import { useEffect, useState } from 'react';
import { getActiveWards, subscribe } from '../location/wardDirectory';

/**
 * Spec §7/§10/§18 — reusable ward dropdown over the live directory.
 * value: 'all' | WARD-xxx. Pass allLabel="" to hide the All Wards option.
 */
export default function WardSelector({
  value = 'all',
  onChange,
  allLabel = 'All Wards',
  label,
  id = 'ward-selector',
  className = '',
}) {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((v) => v + 1)), []);

  const wards = getActiveWards();
  const selected = value !== 'all' && wards.some((w) => w.ward_id === value) ? value : 'all';

  return (
    <div className={`ward-select ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <select
        id={id}
        className="field-control"
        value={selected}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {allLabel && <option value="all">{allLabel}</option>}
        {wards.map((w) => (
          <option key={w.ward_id} value={w.ward_id}>
            {w.ward_name} ({w.ward_id}, No. {w.ward_number})
          </option>
        ))}
      </select>
    </div>
  );
}
