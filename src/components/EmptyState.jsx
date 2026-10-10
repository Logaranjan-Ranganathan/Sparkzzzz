import { Inbox } from 'lucide-react';

export default function EmptyState({ title, body, action }) {
  return (
    <div className="empty-state">
      <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-400" />
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="text-sm mt-1">{body}</p>
      {action}
    </div>
  );
}
