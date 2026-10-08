'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/components/app-shell';
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Textarea } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import type { Ticket } from '@/lib/types';

export default function NewTicketPage() {
  const me = useCurrentUser();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (me.role !== 'USER') {
    return <EmptyState title="Only users can raise tickets" description="Admins manage tickets raised by users." />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const { ticket } = await api<{ ticket: Ticket }>('/tickets', { method: 'POST', json: { title, description } });
      toast.success('Ticket created');
      router.push(`/tickets/${ticket.id}`);
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/tickets" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-900">
        ← Back to tickets
      </Link>
      <PageHeader title="New ticket" description="Tell us what's wrong and we'll get back to you." />

      <Card className="p-6">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {formError && <Alert>{formError}</Alert>}

          <Field label="Title" error={fieldErrors.title}>
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={title}
                maxLength={150}
                onChange={(e) => setTitle(e.target.value)}
                error={fieldErrors.title}
                placeholder="e.g. Cannot download my invoice"
              />
            )}
          </Field>

          <Field label="Description" error={fieldErrors.description} hint="What happened, and what did you expect?">
            {(id, describedBy) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                rows={7}
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                error={fieldErrors.description}
              />
            )}
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
            <Link href="/tickets">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={submitting}>
              Create ticket
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
