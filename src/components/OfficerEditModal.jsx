import { useState, useEffect } from 'react';
import {
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  Shield,
  User,
  MapPin,
  History,
  ArrowRight,
} from 'lucide-react';
import { displayTicketId, priorityBand, timelineEvent } from '../civicEngine.js';

const STATUSES = ['Open', 'Under Review', 'Assigned', 'In Progress', 'Resolved'];
const PRIORITY_BANDS = ['Low', 'Medium', 'High', 'Critical'];
const DEPARTMENTS = [
  'Road Maintenance Division',
  'Solid Waste Management',
  'Street Lighting & Electricals',
  'Stormwater Drainage & Floods',
  'Metro Water & Sewerage Board',
  'Public Works Department (PWD)',
  'Health & Sanitation Wing',
];

export default function OfficerEditModal({
  ticket,
  isOpen,
  onClose,
  onSave,
  officerUser,
  officerProfile,
  isAdmin = false,
}) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'audit' | 'inspection'
  const [status, setStatus] = useState(ticket?.status || 'Open');
  const [priorityBandChoice, setPriorityBandChoice] = useState(
    priorityBand(ticket?.priority_score, ticket?.status).label || 'Medium'
  );
  const [priorityReason, setPriorityReason] = useState('');
  const [assignedOfficer, setAssignedOfficer] = useState(ticket?.assigned_officer || '');
  const [department, setDepartment] = useState(ticket?.department || '');
  const [progressNote, setProgressNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState(ticket?.resolution_note || '');
  const [afterPhotoUrl, setAfterPhotoUrl] = useState(ticket?.after_photo_url || '');
  
  // Inspection fields
  const [inspectorName, setInspectorName] = useState(
    officerProfile?.officer_id || officerUser?.email || ''
  );
  const [inspectionNotes, setInspectionNotes] = useState(ticket?.inspection_notes || '');

  // Form states
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [confirmPrompt, setConfirmPrompt] = useState(null);

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status || 'Open');
      setPriorityBandChoice(priorityBand(ticket.priority_score, ticket.status).label || 'Medium');
      setAssignedOfficer(ticket.assigned_officer || '');
      setDepartment(ticket.department || '');
      setProgressNote('');
      setResolutionNote(ticket.resolution_note || '');
      setAfterPhotoUrl(ticket.after_photo_url || '');
      setInspectionNotes(ticket.inspection_notes || '');
      setFormError(null);
      setConfirmPrompt(null);
    }
  }, [ticket]);

  if (!isOpen || !ticket) return null;

  const currentBand = priorityBand(ticket.priority_score, ticket.status).label;
  const officerName = officerUser?.user_metadata?.full_name || officerUser?.email || 'Officer';

  // Audit log from ticket or fallback to parsed timeline
  const auditEntries = Array.isArray(ticket.audit_log)
    ? ticket.audit_log
    : (Array.isArray(ticket.timeline) ? ticket.timeline : []).map((t, idx) => ({
        id: idx,
        timestamp: t.at,
        actor: t.stage?.includes('officer') ? 'Municipal Officer' : 'System',
        action: t.stage,
        note: t.note,
      }));

  const validateAndPrompt = (e) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (status === 'Resolved' && !resolutionNote.trim()) {
      setFormError('A clear resolution note is required before marking this complaint as Resolved.');
      return;
    }

    if (priorityBandChoice !== currentBand && !priorityReason.trim()) {
      setFormError('Please provide a brief justification for changing the ticket priority level.');
      return;
    }

    // Confirmation if closing or marking Critical
    if (status === 'Resolved' && ticket.status !== 'Resolved') {
      setConfirmPrompt({
        title: 'Confirm Ticket Resolution',
        body: 'Are you sure you want to resolve this complaint? The citizen will be notified and invited to verify the repair.',
        action: performSave,
      });
      return;
    }

    if (priorityBandChoice === 'Critical' && currentBand !== 'Critical') {
      setConfirmPrompt({
        title: 'Escalate to Critical Priority',
        body: 'Marking this issue as Critical triggers rapid municipal dispatch and emergency SLA clocks. Proceed?',
        action: performSave,
      });
      return;
    }

    performSave();
  };

  const performSave = async () => {
    setBusy(true);
    setFormError(null);
    setConfirmPrompt(null);

    try {
      const now = new Date().toISOString();
      const scoreMap = { Low: 1, Medium: 2, High: 3, Critical: 4 };
      const newScore = scoreMap[priorityBandChoice] || ticket.priority_score || 2;

      // Construct audit entry
      const auditLogItem = {
        timestamp: now,
        officer_email: officerUser?.email,
        officer_name: officerName,
        previous_status: ticket.status,
        new_status: status,
        previous_priority: currentBand,
        new_priority: priorityBandChoice,
        priority_reason: priorityReason.trim() || undefined,
        assigned_officer: assignedOfficer.trim() || ticket.assigned_officer,
        department: department || ticket.department,
        progress_note: progressNote.trim() || undefined,
        resolution_note: status === 'Resolved' ? resolutionNote.trim() : undefined,
        inspection_notes: inspectionNotes.trim() || undefined,
      };

      const updatedTimeline = [...(Array.isArray(ticket.timeline) ? ticket.timeline : [])];

      if (status !== ticket.status) {
        updatedTimeline.push(
          timelineEvent(
            status === 'Resolved' ? 'resolution_submitted' : status === 'In Progress' ? 'repair_started' : 'officer_responded',
            `Status updated to ${status} by ${officerName}.${progressNote ? ` Note: ${progressNote}` : ''}`,
            now
          )
        );
      } else if (progressNote.trim()) {
        updatedTimeline.push(
          timelineEvent('progress_update', `${officerName}: ${progressNote.trim()}`, now)
        );
      }

      if (status === 'Resolved' && resolutionNote.trim()) {
        updatedTimeline.push(
          timelineEvent('resolution_submitted', resolutionNote.trim(), now)
        );
      }

      const patch = {
        status,
        priority_score: newScore,
        priority_reason: priorityReason.trim() || ticket.priority_reason,
        assigned_officer: assignedOfficer.trim() || ticket.assigned_officer || 'Ward Field Unit',
        department: department || ticket.department,
        inspection_notes: inspectionNotes.trim() || ticket.inspection_notes,
        latest_update:
          status === 'Resolved'
            ? resolutionNote.trim()
            : progressNote.trim() || `Status updated to ${status}.`,
        resolution_note: status === 'Resolved' ? resolutionNote.trim() : ticket.resolution_note,
        after_photo_url: status === 'Resolved' ? (afterPhotoUrl.trim() || ticket.after_photo_url) : ticket.after_photo_url,
        resolved_at: status === 'Resolved' ? (ticket.resolved_at || now) : null,
        timeline: updatedTimeline,
        audit_log: [auditLogItem, ...(Array.isArray(ticket.audit_log) ? ticket.audit_log : [])],
        updated_at: now,
      };

      await onSave(ticket, patch);
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to update complaint.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                  {displayTicketId(ticket)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
                  {isAdmin ? 'Admin / Officer Management' : 'Officer Management'}
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
                Manage & Edit Complaint
              </h3>
            </div>
          </div>

          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-lg"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 bg-white dark:bg-slate-900 gap-4 text-xs font-semibold">
          <button
            type="button"
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            onClick={() => setActiveTab('details')}
          >
            Edit & Update Status
          </button>
          <button
            type="button"
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'inspection'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            onClick={() => setActiveTab('inspection')}
          >
            Inspection & Field Notes
          </button>
          <button
            type="button"
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            onClick={() => setActiveTab('audit')}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History ({auditEntries.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {formError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Error:</strong> {formError}
              </div>
            </div>
          )}

          {/* TAB 1: Edit & Status */}
          {activeTab === 'details' && (
            <form id="officer-edit-form" onSubmit={validateAndPrompt} className="space-y-4">
              {/* Complaint Overview Card */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Category: <strong>{ticket.category}</strong>
                  </span>
                  <span className="text-slate-500">
                    Ward: <strong>{ticket.ward_id || 'Unassigned'}</strong>
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  {ticket.description}
                </p>
                {ticket.address && (
                  <div className="flex items-center gap-1 text-slate-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{ticket.address}</span>
                  </div>
                )}
              </div>

              {/* Status & Priority Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label" htmlFor="edit-status">
                    Complaint Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="edit-status"
                    className="field-control font-semibold"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label" htmlFor="edit-priority">
                    Priority Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="edit-priority"
                    className="field-control font-semibold"
                    value={priorityBandChoice}
                    onChange={(e) => setPriorityBandChoice(e.target.value)}
                  >
                    {PRIORITY_BANDS.map((p) => (
                      <option key={p} value={p}>
                        {p} {p === 'Critical' ? '🚨 (Emergency SLA)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Justification if priority changed */}
              {priorityBandChoice !== currentBand && (
                <div className="animate-in fade-in duration-150">
                  <label className="field-label" htmlFor="edit-priority-reason">
                    Reason for Priority Change <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-priority-reason"
                    type="text"
                    className="field-control"
                    placeholder="e.g. Field inspection found live electrical wire hazard near school"
                    value={priorityReason}
                    onChange={(e) => setPriorityReason(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    An audit log will be created linking your account to this priority modification.
                  </p>
                </div>
              )}

              {/* Assignment Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label" htmlFor="edit-officer">
                    Assigned Field Unit / Officer
                  </label>
                  <input
                    id="edit-officer"
                    type="text"
                    className="field-control"
                    placeholder="e.g. Ward Field Unit 105"
                    value={assignedOfficer}
                    onChange={(e) => setAssignedOfficer(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="edit-dept">
                    Department
                  </label>
                  <select
                    id="edit-dept"
                    className="field-control"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="">Select Department...</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress Note */}
              <div>
                <label className="field-label" htmlFor="edit-progress-note">
                  Progress Note / Dispatch Update
                </label>
                <textarea
                  id="edit-progress-note"
                  rows={2}
                  className="field-control"
                  placeholder="e.g. Crew dispatched with suction tanker to clear main road obstruction."
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                />
              </div>

              {/* If Resolved, show resolution notes and after photo */}
              {status === 'Resolved' && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Resolution Verification Details</span>
                  </div>

                  <div>
                    <label className="field-label text-emerald-900 dark:text-emerald-200" htmlFor="edit-res-note">
                      Resolution Summary Note <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="edit-res-note"
                      rows={2}
                      className="field-control border-emerald-300 dark:border-emerald-700"
                      placeholder="Explain how the issue was fixed (e.g. Patching complete with hot-mix asphalt; drainage cleared and water receded)."
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label text-emerald-900 dark:text-emerald-200" htmlFor="edit-after-photo">
                      After-Repair Photo URL (Evidence)
                    </label>
                    <input
                      id="edit-after-photo"
                      type="url"
                      className="field-control border-emerald-300 dark:border-emerald-700"
                      placeholder="https://images.unsplash.com/... or evidence link"
                      value={afterPhotoUrl}
                      onChange={(e) => setAfterPhotoUrl(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </form>
          )}

          {/* TAB 2: Inspection Notes */}
          {activeTab === 'inspection' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300">
                Record on-site physical inspection findings. These are stored permanently in the municipal dispatch record for supervisory review.
              </div>

              <div>
                <label className="field-label" htmlFor="ins-inspector">
                  Inspecting Officer
                </label>
                <input
                  id="ins-inspector"
                  type="text"
                  className="field-control"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="ins-notes">
                  On-Site Inspection Findings & Technical Assessment
                </label>
                <textarea
                  id="ins-notes"
                  rows={4}
                  className="field-control"
                  placeholder="Record observed damage, estimated repair equipment needed, safety cordoning status, or utility clash observations..."
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* TAB 3: Audit Log */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Complete tamper-evident log of changes made to this complaint by municipal personnel.
              </p>

              {auditEntries.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No audit entries recorded yet for this complaint.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto">
                  {auditEntries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-amber-500" />
                          {entry.officer_name || entry.actor || 'Municipal Staff'}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Just now'}
                        </span>
                      </div>

                      {entry.previous_status && entry.new_status && (
                        <div className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          Status changed: <span className="font-semibold">{entry.previous_status}</span>{' '}
                          <ArrowRight className="w-3 h-3" /> <span className="font-bold text-amber-600">{entry.new_status}</span>
                        </div>
                      )}

                      {entry.priority_reason && (
                        <div className="text-slate-600 dark:text-slate-300">
                          Priority justification: <em>"{entry.priority_reason}"</em>
                        </div>
                      )}

                      {entry.progress_note && (
                        <div className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">
                          Note: {entry.progress_note}
                        </div>
                      )}

                      {entry.note && !entry.progress_note && (
                        <div className="text-slate-500">{entry.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirmation Overlay if pending critical action */}
        {confirmPrompt && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/80 border-t border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <strong>{confirmPrompt.title}:</strong> {confirmPrompt.body}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                className="ghost-btn text-xs py-1.5 px-3"
                onClick={() => setConfirmPrompt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn bg-amber-600 hover:bg-amber-700 text-xs py-1.5 px-3"
                onClick={confirmPrompt.action}
              >
                Yes, Proceed
              </button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <button
            type="button"
            className="ghost-btn text-xs py-2 px-4 rounded-xl"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary-btn bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs py-2 px-5 rounded-xl flex items-center gap-2 shadow-sm"
            onClick={validateAndPrompt}
            disabled={busy}
          >
            <Save className="w-4 h-4" />
            <span>{busy ? 'Saving Changes...' : 'Save & Update Dispatch'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
