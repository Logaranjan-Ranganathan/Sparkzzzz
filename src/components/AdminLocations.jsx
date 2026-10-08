import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import * as directory from '../location/wardDirectory';
import {
  DEPARTMENTS,
  OFFICER_DEMO_NOTICE,
  assignOfficerToWard,
  officersWithWorkload,
  subscribe as subscribeOfficers,
  updateOfficer,
} from '../officers';

const { getDemoNotice, getZones } = directory;

const EMPTY_WARD = {
  editing: null,
  ward_name: '',
  zone: '',
  ward_number: '',
  latitude: '',
  longitude: '',
  postal_code: '',
  area: '',
};
const EMPTY_AREA = { editing: null, area_name: '', ward_id: '' };
const EMPTY_PLACE = {
  editing: null,
  place_name: '',
  street: '',
  type: '',
  ward_id: '',
  area_id: '',
  latitude: '',
  longitude: '',
};

/**
 * Spec §20 + §15 — admin location management: add/edit/deactivate wards,
 * add/edit areas, add/edit places, assign places to wards and assign
 * officers to wards. Duplicate IDs are rejected by the store and surfaced
 * here; every deactivation/reset requires an explicit confirm step.
 */
export default function AdminLocations({ tickets = [] }) {
  const [tab, setTab] = useState('wards');
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [wardForm, setWardForm] = useState(EMPTY_WARD);
  const [areaForm, setAreaForm] = useState(EMPTY_AREA);
  const [placeForm, setPlaceForm] = useState(EMPTY_PLACE);
  const [, bump] = useState(0);

  useEffect(() => {
    const offA = directory.subscribe(() => bump((v) => v + 1));
    const offB = subscribeOfficers(() => bump((v) => v + 1));
    return () => {
      offA();
      offB();
    };
  }, []);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);

  const wards = directory.getWards();
  const areas = directory.getAreas();
  const places = directory.getPlaces();
  const activeWards = directory.getActiveWards();
  const zones = getZones();
  const officers = useMemo(() => officersWithWorkload(tickets), [tickets]);

  const report = (result, okText) => {
    if (result.ok) setMsg({ type: 'ok', text: okText });
    else setMsg({ type: 'error', text: result.error });
    return result;
  };

  /* ---------- ward actions ---------- */

  const startEditWard = (w) =>
    setWardForm({
      editing: w.ward_id,
      ward_name: w.ward_name,
      zone: w.zone,
      ward_number: w.ward_number,
      latitude: String(w.latitude),
      longitude: String(w.longitude),
      postal_code: w.postal_code || '',
      area: w.area || '',
    });

  const submitWard = (e) => {
    e.preventDefault();
    if (wardForm.editing) {
      const result = directory.updateWard(wardForm.editing, {
        ward_name: wardForm.ward_name,
        zone: wardForm.zone,
        area: wardForm.area,
        latitude: Number(wardForm.latitude),
        longitude: Number(wardForm.longitude),
        postal_code: wardForm.postal_code,
      });
      if (report(result, `Ward ${wardForm.editing} updated.`).ok) setWardForm(EMPTY_WARD);
    } else {
      const result = directory.addWard({
        ward_name: wardForm.ward_name,
        zone: wardForm.zone,
        ward_number: wardForm.ward_number,
        latitude: Number(wardForm.latitude),
        longitude: Number(wardForm.longitude),
        postal_code: wardForm.postal_code,
        area: wardForm.area,
      });
      if (report(result, `Ward added — IDs are unique by design.`).ok) setWardForm(EMPTY_WARD);
    }
  };

  /* ---------- area actions ---------- */

  const startEditArea = (a) => setAreaForm({ editing: a.area_id, area_name: a.area_name, ward_id: a.ward_id });

  const submitArea = (e) => {
    e.preventDefault();
    if (areaForm.editing) {
      const result = directory.updateArea(areaForm.editing, {
        area_name: areaForm.area_name,
        ward_id: areaForm.ward_id,
      });
      if (report(result, `Area ${areaForm.editing} updated.`).ok) setAreaForm(EMPTY_AREA);
    } else {
      const result = directory.addArea({ area_name: areaForm.area_name, ward_id: areaForm.ward_id });
      if (report(result, 'Area added to the ward.').ok) setAreaForm(EMPTY_AREA);
    }
  };

  /* ---------- place actions ---------- */

  const startEditPlace = (p) =>
    setPlaceForm({
      editing: p.place_id,
      place_name: p.place_name,
      street: p.street || '',
      type: p.type || '',
      ward_id: p.ward_id || '',
      area_id: p.area_id || '',
      latitude: String(p.latitude),
      longitude: String(p.longitude),
    });

  const submitPlace = (e) => {
    e.preventDefault();
    const base = {
      place_name: placeForm.place_name,
      street: placeForm.street,
      type: placeForm.type,
      latitude: Number(placeForm.latitude),
      longitude: Number(placeForm.longitude),
    };
    const hierarchy = placeForm.area_id ? { area_id: placeForm.area_id } : { ward_id: placeForm.ward_id };
    if (placeForm.editing) {
      const result = directory.updatePlace(placeForm.editing, {
        ...base,
        ...hierarchy,
        area_id: placeForm.area_id || '',
      });
      if (report(result, `Place ${placeForm.editing} updated.`).ok) setPlaceForm(EMPTY_PLACE);
    } else {
      const result = directory.addPlace({ ...base, ...hierarchy });
      if (report(result, 'Place added — a unique Place ID was generated.').ok) setPlaceForm(EMPTY_PLACE);
    }
  };

  const assignPlace = (placeId, wardId) => {
    const result = directory.assignPlaceToWard(placeId, wardId);
    report(result, `Place ${placeId} assigned to ${wardId}.`);
  };

  /* ---------- confirmed actions ---------- */

  const runConfirmed = (kind, id) => {
    setConfirming(null);
    if (kind === 'ward-active') {
      const ward = directory.wardById(id);
      const result = directory.setWardActive(id, !(ward?.active !== false));
      report(
        result,
        ward?.active !== false ? `Ward ${id} deactivated — hidden from citizen flows.` : `Ward ${id} reactivated.`
      );
    } else if (kind === 'officer-active') {
      const officer = officers.find((o) => o.officer_id === id);
      const result = updateOfficer(id, { active: !(officer?.active !== false) });
      report(result, officer?.active !== false ? `Officer ${id} deactivated.` : `Officer ${id} reactivated.`);
    } else if (kind === 'reset') {
      directory.resetToSeed();
      setMsg({ type: 'ok', text: 'Directory restored to the demonstration catalog.' });
    }
  };

  const confirmButton = (kind, id, label, className = 'ghost-btn') => {
    const active = confirming?.kind === kind && confirming?.id === id;
    return active ? (
      <span className="confirm-inline">
        <button type="button" className="danger-btn" onClick={() => runConfirmed(kind, id)}>
          Confirm
        </button>
        <button type="button" className="ghost-btn" onClick={() => setConfirming(null)}>
          Cancel
        </button>
      </span>
    ) : (
      <button
        type="button"
        className={className}
        onClick={() => setConfirming({ kind, id })}
      >
        {label}
      </button>
    );
  };

  const placeAreaOptions = placeForm.ward_id ? directory.areasOfWard(placeForm.ward_id) : [];

  const TABS = [
    ['wards', `Wards (${wards.length})`],
    ['areas', `Areas (${areas.length})`],
    ['places', `Places (${places.length})`],
    ['officers', `Officers (${officers.length})`],
  ];

  return (
    <div className="admin-locations">
      <div className="admin-head">
        <div className="seg" role="tablist" aria-label="Admin sections">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="admin-head-note">
          <p className="text-xs text-slate-500">{getDemoNotice()}</p>
          {confirmButton('reset', 'directory', 'Restore demo catalog', 'ghost-btn')}
        </div>
      </div>

      {msg && (
        <div className={msg.type === 'ok' ? 'success-state' : 'error-state'} role="alert">
          <p className="text-sm font-semibold">{msg.text}</p>
        </div>
      )}

      {tab === 'wards' && (
        <>
          <form className="card card-pad admin-form" onSubmit={submitWard}>
            <h3 className="section-title">{wardForm.editing ? `Edit ${wardForm.editing}` : 'Add ward'}</h3>
            <div className="admin-grid">
              <div>
                <label className="field-label" htmlFor="aw-name">
                  Ward name *
                </label>
                <input
                  id="aw-name"
                  className="field-control"
                  value={wardForm.ward_name}
                  onChange={(e) => setWardForm({ ...wardForm, ward_name: e.target.value })}
                  placeholder="e.g. Kilpauk Central"
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="aw-zone">
                  Zone *
                </label>
                <select
                  id="aw-zone"
                  className="field-control"
                  value={wardForm.zone}
                  onChange={(e) => setWardForm({ ...wardForm, zone: e.target.value })}
                  required
                >
                  <option value="">Select zone</option>
                  {zones.map((z) => (
                    <option key={z.zone_id} value={z.zone_name}>
                      {z.zone_name}
                    </option>
                  ))}
                </select>
              </div>
              {!wardForm.editing && (
                <div>
                  <label className="field-label" htmlFor="aw-number">
                    Ward number (auto if blank)
                  </label>
                  <input
                    id="aw-number"
                    className="field-control"
                    value={wardForm.ward_number}
                    onChange={(e) => setWardForm({ ...wardForm, ward_number: e.target.value })}
                    placeholder="e.g. 029"
                  />
                </div>
              )}
              <div>
                <label className="field-label" htmlFor="aw-lat">
                  Latitude *
                </label>
                <input
                  id="aw-lat"
                  className="field-control"
                  type="number"
                  step="any"
                  value={wardForm.latitude}
                  onChange={(e) => setWardForm({ ...wardForm, latitude: e.target.value })}
                  placeholder="13.0827"
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="aw-lon">
                  Longitude *
                </label>
                <input
                  id="aw-lon"
                  className="field-control"
                  type="number"
                  step="any"
                  value={wardForm.longitude}
                  onChange={(e) => setWardForm({ ...wardForm, longitude: e.target.value })}
                  placeholder="80.2707"
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="aw-pin">
                  PIN code
                </label>
                <input
                  id="aw-pin"
                  className="field-control"
                  value={wardForm.postal_code}
                  onChange={(e) => setWardForm({ ...wardForm, postal_code: e.target.value })}
                  placeholder="600010"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="submit" className="primary-btn">
                <Plus className="w-4 h-4" /> {wardForm.editing ? 'Save ward' : 'Add ward'}
              </button>
              {wardForm.editing && (
                <button type="button" className="ghost-btn" onClick={() => setWardForm(EMPTY_WARD)}>
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}
            </div>
          </form>

          <div className="table-wrap mt-4">
            <table className="table data">
              <thead>
                <tr>
                  <th>Ward ID</th>
                  <th>No.</th>
                  <th>Name</th>
                  <th>Zone</th>
                  <th>PIN</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wards.map((w) => (
                  <tr key={w.ward_id} className={w.active === false ? 'is-inactive' : ''}>
                    <td className="mono">{w.ward_id}</td>
                    <td className="mono">{w.ward_number}</td>
                    <td>
                      <strong>{w.ward_name}</strong>
                    </td>
                    <td>{w.zone}</td>
                    <td className="mono">{w.postal_code || '—'}</td>
                    <td>
                      <span className={`badge ${w.active === false ? 'badge-low' : 'badge-resolved'}`}>
                        {w.active === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="ghost-btn" onClick={() => startEditWard(w)}>
                          Edit
                        </button>
                        {confirmButton(
                          'ward-active',
                          w.ward_id,
                          w.active === false ? 'Reactivate' : 'Deactivate',
                          'ghost-btn'
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'areas' && (
        <>
          <form className="card card-pad admin-form" onSubmit={submitArea}>
            <h3 className="section-title">{areaForm.editing ? `Edit ${areaForm.editing}` : 'Add area'}</h3>
            <div className="admin-grid">
              <div>
                <label className="field-label" htmlFor="aa-name">
                  Area / locality name *
                </label>
                <input
                  id="aa-name"
                  className="field-control"
                  value={areaForm.area_name}
                  onChange={(e) => setAreaForm({ ...areaForm, area_name: e.target.value })}
                  placeholder="e.g. Chetpet"
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="aa-ward">
                  Belongs to ward *
                </label>
                <select
                  id="aa-ward"
                  className="field-control"
                  value={areaForm.ward_id}
                  onChange={(e) => setAreaForm({ ...areaForm, ward_id: e.target.value })}
                  required
                >
                  <option value="">Select ward</option>
                  {activeWards.map((w) => (
                    <option key={w.ward_id} value={w.ward_id}>
                      {w.ward_name} ({w.ward_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="submit" className="primary-btn">
                <Plus className="w-4 h-4" /> {areaForm.editing ? 'Save area' : 'Add area'}
              </button>
              {areaForm.editing && (
                <button type="button" className="ghost-btn" onClick={() => setAreaForm(EMPTY_AREA)}>
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}
            </div>
          </form>

          <div className="table-wrap mt-4">
            <table className="table data">
              <thead>
                <tr>
                  <th>Area ID</th>
                  <th>Name</th>
                  <th>Ward</th>
                  <th>Places</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.area_id}>
                    <td className="mono">{a.area_id}</td>
                    <td>
                      <strong>{a.area_name}</strong>
                    </td>
                    <td>
                      {directory.wardById(a.ward_id)?.ward_name || a.ward_id}
                    </td>
                    <td className="mono">{directory.placesOfArea(a.area_id).length}</td>
                    <td>
                      <button type="button" className="ghost-btn" onClick={() => startEditArea(a)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'places' && (
        <>
          <form className="card card-pad admin-form" onSubmit={submitPlace}>
            <h3 className="section-title">{placeForm.editing ? `Edit ${placeForm.editing}` : 'Add place'}</h3>
            <div className="admin-grid">
              <div>
                <label className="field-label" htmlFor="ap-name">
                  Place / street / landmark *
                </label>
                <input
                  id="ap-name"
                  className="field-control"
                  value={placeForm.place_name}
                  onChange={(e) => setPlaceForm({ ...placeForm, place_name: e.target.value })}
                  placeholder="e.g. Chetpet Railway Station"
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="ap-street">
                  Street
                </label>
                <input
                  id="ap-street"
                  className="field-control"
                  value={placeForm.street}
                  onChange={(e) => setPlaceForm({ ...placeForm, street: e.target.value })}
                  placeholder="e.g. Poonamallee High Road"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="ap-ward">
                  Ward *
                </label>
                <select
                  id="ap-ward"
                  className="field-control"
                  value={placeForm.ward_id}
                  onChange={(e) => setPlaceForm({ ...placeForm, ward_id: e.target.value, area_id: '' })}
                  required
                >
                  <option value="">Select ward</option>
                  {activeWards.map((w) => (
                    <option key={w.ward_id} value={w.ward_id}>
                      {w.ward_name} ({w.ward_id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="ap-area">
                  Area (optional)
                </label>
                <select
                  id="ap-area"
                  className="field-control"
                  value={placeForm.area_id}
                  onChange={(e) => setPlaceForm({ ...placeForm, area_id: e.target.value })}
                  disabled={!placeForm.ward_id}
                >
                  <option value="">{placeForm.ward_id ? 'No specific area' : 'Pick a ward first'}</option>
                  {placeAreaOptions.map((a) => (
                    <option key={a.area_id} value={a.area_id}>
                      {a.area_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="ap-lat">
                  Latitude *
                </label>
                <input
                  id="ap-lat"
                  className="field-control"
                  type="number"
                  step="any"
                  value={placeForm.latitude}
                  onChange={(e) => setPlaceForm({ ...placeForm, latitude: e.target.value })}
                  placeholder="13.0720"
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="ap-lon">
                  Longitude *
                </label>
                <input
                  id="ap-lon"
                  className="field-control"
                  type="number"
                  step="any"
                  value={placeForm.longitude}
                  onChange={(e) => setPlaceForm({ ...placeForm, longitude: e.target.value })}
                  placeholder="80.2510"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="submit" className="primary-btn">
                <MapPin className="w-4 h-4" /> {placeForm.editing ? 'Save place' : 'Add place'}
              </button>
              {placeForm.editing && (
                <button type="button" className="ghost-btn" onClick={() => setPlaceForm(EMPTY_PLACE)}>
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}
            </div>
          </form>

          <div className="table-wrap mt-4">
            <table className="table data">
              <thead>
                <tr>
                  <th>Place ID</th>
                  <th>Name</th>
                  <th>Street</th>
                  <th>Area</th>
                  <th>Ward</th>
                  <th>Assign to ward</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {places.map((p) => (
                  <tr key={p.place_id}>
                    <td className="mono">{p.place_id}</td>
                    <td>
                      <strong>{p.place_name}</strong>
                    </td>
                    <td>{p.street || '—'}</td>
                    <td>{p.area || '—'}</td>
                    <td className="mono">{p.ward_id}</td>
                    <td>
                      <select
                        className="field-control"
                        value={p.ward_id}
                        aria-label={`Assign ${p.place_name} to ward`}
                        onChange={(e) => assignPlace(p.place_id, e.target.value)}
                      >
                        {activeWards.map((w) => (
                          <option key={w.ward_id} value={w.ward_id}>
                            {w.ward_name} ({w.ward_id})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="ghost-btn" onClick={() => startEditPlace(p)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'officers' && (
        <>
          <p className="text-xs text-slate-500">
            {OFFICER_DEMO_NOTICE} Assign an officer to a ward, update their department, or deactivate them.
          </p>
          <div className="table-wrap mt-3">
            <table className="table data">
              <thead>
                <tr>
                  <th>Officer ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Ward</th>
                  <th>Zone</th>
                  <th>Contact</th>
                  <th>Workload</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {officers.map((o) => (
                  <tr key={o.officer_id} className={o.active === false ? 'is-inactive' : ''}>
                    <td className="mono">{o.officer_id}</td>
                    <td>
                      <strong>{o.name}</strong>
                    </td>
                    <td>
                      <select
                        className="field-control"
                        value={o.department}
                        aria-label={`Department for ${o.name}`}
                        onChange={(e) => report(updateOfficer(o.officer_id, { department: e.target.value }), 'Department updated.')}
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="field-control"
                        value={o.ward_id || ''}
                        aria-label={`Ward for ${o.name}`}
                        onChange={(e) =>
                          report(
                            assignOfficerToWard(o.officer_id, e.target.value),
                            `Officer ${o.officer_id} assigned.`
                          )
                        }
                      >
                        <option value="">Citywide</option>
                        {activeWards.map((w) => (
                          <option key={w.ward_id} value={w.ward_id}>
                            {w.ward_name} ({w.ward_id})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{o.zone}</td>
                    <td className="mono admin-contact">
                      {o.phone}
                      <br />
                      <span className="text-xs text-slate-400">{o.email}</span>
                    </td>
                    <td>
                      <span className="mono">
                        {o.workload.open} open · {o.workload.overdue} overdue
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <span className={`badge ${o.active === false ? 'badge-low' : 'badge-resolved'}`}>
                          {o.active === false ? 'Inactive' : 'Active'}
                        </span>
                        {confirmButton(
                          'officer-active',
                          o.officer_id,
                          o.active === false ? 'Reactivate' : 'Deactivate',
                          'ghost-btn'
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
