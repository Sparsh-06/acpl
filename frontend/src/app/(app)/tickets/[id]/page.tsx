'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/components/app-shell';
import { RoleBadge, StatusBadge } from '@/components/badges';
import { Avatar, Button, Card, EmptyState, ErrorState, Select, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { TICKET_STATUSES, type Comment, type Ticket, type TicketStatus } from '@/lib/types';

type TicketDetail = { ticket: Ticket; comments: Comment[] };

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUser();
  const { data, setData, error, loading, reload } = useApi<TicketDetail>(`/tickets/${id}`);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <Card>
        <EmptyState
          title="Ticket not found"
          description="It may not exist, or you don't have access to it."
          action={
            <Link href="/tickets">
              <Button variant="secondary">Back to tickets</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <ErrorState message={error?.message ?? 'Could not load ticket'} onRetry={reload} />
      </Card>
    );
  }

  const { ticket, comments } = data;
  const isAdmin = me.role === 'ADMIN';
  const isOwner = ticket.createdBy.id === me.id;

  const updateTicket = (updated: Ticket) => setData({ ...data, ticket: updated });
  const addComment = (comment: Comment) => setData({ ...data, comments: [...comments, comment] });

  return (
    <div>
      <Link href="/tickets" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-900">
        ← Back to tickets
      </Link>

      <div className="mb-6">
        <div className="mb-2">
          <StatusBadge status={ticket.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{ticket.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Opened by {ticket.createdBy.name} on {formatDateTime(ticket.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Description</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{ticket.description}</p>
          </Card>

          <Comments ticketId={ticket.id} comments={comments} onAdded={addComment} />
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Details</h2>
            <dl className="space-y-3 text-sm">
              <DetailRow label="Status">
                <StatusBadge status={ticket.status} />
              </DetailRow>
              <DetailRow label="Created by">{ticket.createdBy.name}</DetailRow>
              <DetailRow label="Created">{formatDateTime(ticket.createdAt)}</DetailRow>
              <DetailRow label="Updated">{formatDateTime(ticket.updatedAt)}</DetailRow>
            </dl>
          </Card>

          {isAdmin && <ChangeStatus ticket={ticket} onUpdated={updateTicket} />}
          {!isAdmin && isOwner && ticket.status !== 'CLOSED' && <CloseTicket ticket={ticket} onUpdated={updateTicket} />}
        </aside>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function Comments({ ticketId, comments, onAdded }: { ticketId: string; comments: Comment[]; onAdded: (c: Comment) => void }) {
  const me = useCurrentUser();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const { comment } = await api<{ comment: Comment }>(`/tickets/${ticketId}/comments`, { method: 'POST', json: { body } });
      onAdded(comment);
      setBody('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Comments <span className="font-normal text-slate-400">({comments.length})</span>
        </h2>
      </div>

      {comments.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No comments yet.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3 px-5 py-4">
              <Avatar name={comment.author.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {comment.author.name}
                    {comment.author.id === me.id && <span className="font-normal text-slate-400"> (you)</span>}
                  </span>
                  <RoleBadge role={comment.author.role} />
                  <time dateTime={comment.createdAt} className="text-xs text-slate-500">
                    {formatDateTime(comment.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{comment.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={onSubmit} className="space-y-3 border-t border-slate-200 p-5">
        <label htmlFor="comment" className="sr-only">
          Add a comment
        </label>
        <Textarea id="comment" rows={3} maxLength={5000} placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={sending} disabled={!body.trim()}>
            Add comment
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ChangeStatus({ ticket, onUpdated }: { ticket: Ticket; onUpdated: (t: Ticket) => void }) {
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await api<{ ticket: Ticket }>(`/tickets/${ticket.id}/status`, { method: 'PATCH', json: { status } });
      onUpdated(result.ticket);
      toast.success('Status updated');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Change status</h2>
      <div className="space-y-3">
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Button className="w-full" disabled={status === ticket.status} loading={saving} onClick={save}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function CloseTicket({ ticket, onUpdated }: { ticket: Ticket; onUpdated: (t: Ticket) => void }) {
  const [closing, setClosing] = useState(false);

  async function close() {
    if (!window.confirm('Close this ticket?')) return;
    setClosing(true);
    try {
      const result = await api<{ ticket: Ticket }>(`/tickets/${ticket.id}/status`, { method: 'PATCH', json: { status: 'CLOSED' } });
      onUpdated(result.ticket);
      toast.success('Ticket closed');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setClosing(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">Issue sorted?</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">Close the ticket to let support know you no longer need help.</p>
      <Button variant="secondary" className="w-full" loading={closing} onClick={close}>
        Close ticket
      </Button>
    </Card>
  );
}
