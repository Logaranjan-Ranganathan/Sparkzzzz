import { isSupabaseConfigured } from '../supabase/client.js';
import { ticketPayload } from '../civicEngine.js';

const QUEUE_STORAGE_KEY = 'urbangrid_offline_sync_queue';
const SYNC_EVENTS_KEY = 'urbangrid_sync_event';

const timeoutPromise = (promise, ms = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), ms)),
  ]);

export const getOfflineQueue = () => {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const saveOfflineQueue = (queue) => {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    // Dispatch storage event for other tabs/listeners
    window.dispatchEvent(new CustomEvent(SYNC_EVENTS_KEY, { detail: { count: queue.length } }));
  } catch (err) {
    console.error('Failed to save offline queue', err);
  }
};

export const addToOfflineQueue = (operation) => {
  const current = getOfflineQueue();
  // Idempotency: avoid duplicate operations for the same ticket_id and operation type
  const exists = current.find(
    (op) => op.ticketId === operation.ticketId && op.type === operation.type
  );
  if (exists) {
    // update with latest payload
    const updated = current.map((op) =>
      op.ticketId === operation.ticketId && op.type === operation.type ? { ...op, ...operation } : op
    );
    saveOfflineQueue(updated);
    return updated;
  }
  const next = [...current, { ...operation, enqueuedAt: new Date().toISOString() }];
  saveOfflineQueue(next);
  return next;
};

export const removeFromOfflineQueue = (ticketId, type) => {
  const current = getOfflineQueue();
  const next = current.filter((op) => !(op.ticketId === ticketId && (!type || op.type === type)));
  saveOfflineQueue(next);
  return next;
};

/**
 * Submit complaint online-first.
 * If online and Supabase is configured, attempts server save.
 * If offline or server fails, preserves in offline queue with 'pending_sync' status.
 */
export async function submitComplaintOnlineFirst({ ticket, submission, supabaseClient }) {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (isOnline && isSupabaseConfigured && supabaseClient) {
    try {
      const payload = ticketPayload(ticket);

      // 1. Submit/upsert ticket
      const { data: ticketData, error: ticketError } = await timeoutPromise(
        supabaseClient.from('tickets').upsert([payload]).select().maybeSingle(),
        6000
      );

      if (ticketError) {
        throw new Error(ticketError.message || 'Database error during ticket submission');
      }

      // 2. Submit submission entry if provided
      if (submission) {
        const { error: subError } = await timeoutPromise(
          supabaseClient.from('submissions').insert([
            {
              ticket_id: ticket.ticket_id || ticket.id,
              description: submission.description,
              image_url: submission.image_url || '',
              latitude: Number(submission.latitude),
              longitude: Number(submission.longitude),
              category: submission.category,
              created_at: submission.created_at || new Date().toISOString(),
            },
          ]),
          6000
        );
        if (subError) {
          console.warn('Submission record error:', subError);
        }
      }

      // Server confirmed!
      return {
        success: true,
        synced: true,
        pendingSync: false,
        ticket: {
          ...ticket,
          ...(ticketData || {}),
          sync_status: 'synced',
          id: ticketData?.id || ticket.id,
          ticket_id: ticketData?.ticket_id || ticket.ticket_id,
        },
        message: 'Successfully submitted and synchronized with municipal dispatch server.',
      };
    } catch (err) {
      console.warn('Online sync failed, enqueuing locally for background retry:', err.message);
      // Fall through to offline queue below
    }
  }

  // Offline or network error: save to offline queue with pending_sync
  const queuedTicket = {
    ...ticket,
    sync_status: 'pending_sync',
  };

  addToOfflineQueue({
    type: 'create_ticket',
    ticketId: ticket.ticket_id || ticket.id,
    ticket: queuedTicket,
    submission,
  });

  return {
    success: true,
    synced: false,
    pendingSync: true,
    ticket: queuedTicket,
    message: isOnline
      ? 'Municipal server temporarily unreachable. Complaint saved locally (Pending Sync) and will retry automatically.'
      : 'Device is offline. Complaint queued locally (Pending Sync) and will sync once internet is restored.',
  };
}

/**
 * Update complaint online-first.
 */
export async function updateComplaintOnlineFirst({ ticket, patch, supabaseClient }) {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const merged = { ...ticket, ...patch, updated_at: new Date().toISOString() };

  if (isOnline && isSupabaseConfigured && supabaseClient) {
    try {
      const payload = ticketPayload(merged);
      const { data, error } = await timeoutPromise(
        supabaseClient
          .from('tickets')
          .update(payload)
          .eq('id', ticket.id)
          .select()
          .maybeSingle(),
        6000
      );

      if (error) throw new Error(error.message);

      return {
        success: true,
        synced: true,
        ticket: { ...merged, ...(data || {}), sync_status: 'synced' },
        message: 'Changes saved and synced to database.',
      };
    } catch (err) {
      console.warn('Online update failed, enqueuing locally:', err.message);
    }
  }

  const queuedTicket = { ...merged, sync_status: 'pending_sync' };
  addToOfflineQueue({
    type: 'update_ticket',
    ticketId: ticket.id,
    ticket: queuedTicket,
    patch,
  });

  return {
    success: true,
    synced: false,
    pendingSync: true,
    ticket: queuedTicket,
    message: 'Update saved locally (Pending Sync). Will synchronize when connection is restored.',
  };
}

/**
 * Flush pending offline queue to Supabase.
 */
export async function flushOfflineQueue(supabaseClient, onSyncedCallback) {
  if (!isSupabaseConfigured || !supabaseClient) {
    return { attempted: 0, succeeded: 0, failed: 0, errors: ['Server not configured'] };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  }

  let succeeded = 0;
  let failed = 0;
  const errors = [];

  for (const op of queue) {
    try {
      if (op.type === 'create_ticket') {
        const payload = ticketPayload(op.ticket);
        const { data: ticketData, error: ticketError } = await timeoutPromise(
          supabaseClient.from('tickets').upsert([payload]).select().maybeSingle(),
          6000
        );
        if (ticketError) throw ticketError;

        if (op.submission) {
          await timeoutPromise(
            supabaseClient.from('submissions').insert([
              {
                ticket_id: op.ticket.ticket_id || op.ticket.id,
                description: op.submission.description,
                image_url: op.submission.image_url || '',
                latitude: Number(op.submission.latitude),
                longitude: Number(op.submission.longitude),
                category: op.submission.category,
                created_at: op.submission.created_at || new Date().toISOString(),
              },
            ]),
            6000
          ).catch((e) => console.warn('Submission insert error during flush:', e));
        }

        removeFromOfflineQueue(op.ticketId, 'create_ticket');
        succeeded += 1;
        if (onSyncedCallback) {
          onSyncedCallback({
            ticketId: op.ticketId,
            ticket: { ...op.ticket, ...(ticketData || {}), sync_status: 'synced' },
          });
        }
      } else if (op.type === 'update_ticket') {
        const payload = ticketPayload(op.ticket);
        const { data, error } = await timeoutPromise(
          supabaseClient
            .from('tickets')
            .update(payload)
            .eq('id', op.ticketId)
            .select()
            .maybeSingle(),
          6000
        );
        if (error) throw error;

        removeFromOfflineQueue(op.ticketId, 'update_ticket');
        succeeded += 1;
        if (onSyncedCallback) {
          onSyncedCallback({
            ticketId: op.ticketId,
            ticket: { ...op.ticket, ...(data || {}), sync_status: 'synced' },
          });
        }
      }
    } catch (err) {
      failed += 1;
      errors.push(`Ticket ${op.ticketId}: ${err.message}`);
    }
  }

  return { attempted: queue.length, succeeded, failed, errors };
}
