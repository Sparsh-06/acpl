'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@example.com', password: 'Admin@12345' },
  { label: 'User', email: 'alice@example.com', password: 'User@12345' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await api('/auth/login', { method: 'POST', json: { email, password } });
      router.replace('/tickets');
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-indigo-600 text-lg font-semibold text-white shadow-lg shadow-indigo-600/30">
          SP
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in to Support Portal</h1>
        <p className="mt-1 text-sm text-slate-500">Use your email and password.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {searchParams.get('expired') && !formError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Your session has ended. Please sign in again.
          </div>
        )}
        {formError && <Alert>{formError}</Alert>}

        <Field label="Email" error={fieldErrors.email}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              placeholder="you@company.com"
            />
          )}
        </Field>

        <Field label="Password" error={fieldErrors.password}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
            />
          )}
        </Field>

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4 text-sm">
        <p className="mb-2 font-medium text-slate-700">Demo accounts (seed data)</p>
        <div className="flex gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
              }}
            >
              Fill {account.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-indigo-50 to-slate-50 px-4 py-12">
      {/* useSearchParams needs a Suspense boundary in the Next.js App Router */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
