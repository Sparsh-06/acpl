import { clsx } from 'clsx';
import { humanize } from '@/lib/format';
import type { Role, TicketStatus } from '@/lib/types';

const base = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';

const STATUS_STYLES: Record<TicketStatus, { badge: string; dot: string }> = {
  OPEN: { badge: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  IN_PROGRESS: { badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  RESOLVED: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  CLOSED: { badge: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={clsx(base, style.badge)}>
      <span className={clsx('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {humanize(status)}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={clsx(base, role === 'ADMIN' ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-slate-50 text-slate-600 ring-slate-200')}>
      {role === 'ADMIN' ? 'Admin' : 'User'}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={clsx(base, active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200')}>
      <span className={clsx('size-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-rose-500')} aria-hidden="true" />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
