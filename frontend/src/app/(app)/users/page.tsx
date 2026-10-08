'use client';

import { clsx } from 'clsx';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/components/app-shell';
import { ActiveBadge, RoleBadge } from '@/components/badges';
import { Alert, Avatar, Button, Card, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Role, User } from '@/lib/types';

type DialogState = null | 'new' | User;

export default function UsersPage() {
  const me = useCurrentUser();
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);

  const { data, error, loading, reload } = useApi<{ users: User[] }>(`/users?q=${encodeURIComponent(q)}`);

  if (me.role !== 'ADMIN') {
    return (
      <Card>
        <EmptyState title="Admins only" description="You don't have permission to manage users." />
      </Card>
    );
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setQ(searchInput.trim());
  }

  async function toggleActive(user: User) {
    if (user.isActive && !window.confirm(`Deactivate ${user.name}? They will be signed out immediately.`)) return;
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', json: { isActive: !user.isActive } });
      toast.success(`${user.name} ${user.isActive ? 'deactivated' : 'activated'}`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Users" description="Manage accounts, roles and access." actions={<Button onClick={() => setDialog('new')}>+ New user</Button>} />

      <Card>
        <form onSubmit={onSearch} className="flex gap-2 border-b border-slate-200 p-4">
          <Input
            type="search"
            placeholder="Search by name or email…"
            aria-label="Search users"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="sm:max-w-sm"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data || data.users.length === 0 ? (
          <EmptyState title={q ? 'No users match your search' : 'No users yet'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.map((user) => {
                  const isMe = user.id === me.id;
                  return (
                    <tr key={user.id} className={clsx(!user.isActive && 'bg-slate-50/60')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} />
                          <div>
                            <div className="font-medium text-slate-900">
                              {user.name} {isMe && <span className="font-normal text-slate-400">(you)</span>}
                            </div>
                            <div className="text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3">
                        <ActiveBadge active={user.isActive} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setDialog(user)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isMe}
                            title={isMe ? "You can't deactivate yourself" : undefined}
                            onClick={() => toggleActive(user)}
                            className={clsx(user.isActive && 'text-rose-600 hover:bg-rose-50 hover:text-rose-700')}
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog === 'new' ? 'New user' : 'Edit user'}>
        {dialog && (
          <UserForm
            user={dialog === 'new' ? null : dialog}
            isSelf={dialog !== 'new' && dialog.id === me.id}
            onSaved={() => {
              setDialog(null);
              reload();
            }}
            onCancel={() => setDialog(null)}
          />
        )}
      </Dialog>
    </>
  );
}

function UserForm({ user, isSelf, onSaved, onCancel }: { user: User | null; isSelf: boolean; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'USER');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSaving(true);
    try {
      if (user) {
        await api(`/users/${user.id}`, { method: 'PATCH', json: { name, email, role, ...(password && { password }) } });
        toast.success('User updated');
      } else {
        await api('/users', { method: 'POST', json: { name, email, role, password } });
        toast.success('User created');
      }
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
      setFormError(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert>{formError}</Alert>}

      <Field label="Full name" error={fieldErrors.name}>
        {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} autoFocus />}
      </Field>
      <Field label="Email" error={fieldErrors.email}>
        {(id, d) => <Input id={id} aria-describedby={d} type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />}
      </Field>
      <Field label="Role" error={fieldErrors.role} hint={isSelf ? "You can't change your own role." : undefined}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </Select>
        )}
      </Field>
      <Field label={user ? 'New password' : 'Password'} error={fieldErrors.password} hint={user ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}>
        {(id, d) => (
          <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
        )}
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {user ? 'Save changes' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}
