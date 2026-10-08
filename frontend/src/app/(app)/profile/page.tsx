'use client';

import { useCurrentUser } from '@/components/app-shell';
import { ActiveBadge, RoleBadge } from '@/components/badges';
import { Avatar, Card, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';

export default function ProfilePage() {
  const me = useCurrentUser();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" description="Your account details." />

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={me.name} className="size-16 text-xl" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">{me.name}</h2>
            <p className="text-sm text-slate-500">{me.email}</p>
          </div>
          <div className="flex gap-2">
            <RoleBadge role={me.role} />
            <ActiveBadge active={me.isActive} />
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Role</dt>
            <dd className="mt-1 font-medium text-slate-900">{me.role === 'ADMIN' ? 'Administrator' : 'User'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Member since</dt>
            <dd className="mt-1 font-medium text-slate-900">{formatDate(me.createdAt)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
