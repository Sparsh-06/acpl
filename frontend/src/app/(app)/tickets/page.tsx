'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useCurrentUser } from '@/components/app-shell';
import { StatusBadge } from '@/components/badges';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Skeleton } from '@/components/ui';
import { formatDateTime, humanize } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { TICKET_STATUSES, type Ticket } from '@/lib/types';

export default function TicketsPage() {
  const me = useCurrentUser();
  const isAdmin = me.role === 'ADMIN';

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const { data, error, loading, reload } = useApi<{ tickets: Ticket[] }>(`/tickets?${params}`);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setQ(searchInput.trim());
  }

  const hasFilters = Boolean(q || status);

  return (
    <>
      <PageHeader
        title={isAdmin ? 'All tickets' : 'My tickets'}
        description={isAdmin ? 'View and update every support request.' : 'Track the requests you have raised with support.'}
        actions={
          !isAdmin && (
            <Link href="/tickets/new">
              <Button>+ New ticket</Button>
            </Link>
          )
        }
      />

      {/* Status filter */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {['', ...TICKET_STATUSES].map((value) => (
          <button
            key={value || 'all'}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={clsx(
              'shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
              status === value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
          >
            {value ? humanize(value) : 'All'}
          </button>
        ))}
      </div>

      <Card>
        <form onSubmit={onSearch} className="flex gap-2 border-b border-slate-200 p-4">
          <Input
            type="search"
            placeholder="Search by title or description…"
            aria-label="Search tickets"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="sm:max-w-sm"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput('');
                setQ('');
                setStatus('');
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data || data.tickets.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No tickets match your filters" description="Try a different search or status." />
          ) : isAdmin ? (
            <EmptyState title="No tickets yet" description="When users raise support requests they will appear here." />
          ) : (
            <EmptyState
              title="You haven't raised any tickets"
              description="Having a problem? Create a ticket and our support team will help."
              action={
                <Link href="/tickets/new">
                  <Button>Create your first ticket</Button>
                </Link>
              }
            />
          )
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/tickets/${ticket.id}`} className="flex flex-col gap-2 px-4 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{ticket.title}</p>
                    <p className="text-xs text-slate-500">
                      {isAdmin && <>By {ticket.createdBy.name} · </>}
                      Updated {formatDateTime(ticket.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
