'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { User } from '@/lib/types';
import { RoleBadge } from './badges';
import { Avatar, ErrorState, Spinner } from './ui';

const CurrentUserContext = createContext<User | null>(null);

export function useCurrentUser() {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser must be used inside <AppShell>');
  return user;
}

const NAV = [
  { href: '/tickets', label: 'Tickets', adminOnly: false },
  { href: '/users', label: 'Users', adminOnly: true },
  { href: '/profile', label: 'Profile', adminOnly: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data, error, loading, reload } = useApi<{ user: User }>('/auth/me');
  const router = useRouter();
  const pathname = usePathname();
  const notSignedIn = error?.status === 401;

  useEffect(() => {
    if (notSignedIn) router.replace('/login');
  }, [notSignedIn, router]);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      router.replace('/login');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (error && !notSignedIn) {
    return (
      <div className="grid min-h-screen place-items-center">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="grid min-h-screen place-items-center text-indigo-600">
        <Spinner className="size-8" />
      </div>
    );
  }

  const me = data.user;
  const links = NAV.filter((item) => !item.adminOnly || me.role === 'ADMIN');

  return (
    <CurrentUserContext.Provider value={me}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/tickets" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-sm text-white">SP</span>
            <span className="hidden sm:inline">Support Portal</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto" aria-label="Main">
            {links.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'rounded-lg px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Avatar name={me.name} />
            <div className="leading-tight">
              <div className="text-sm font-medium text-slate-900">{me.name}</div>
              <RoleBadge role={me.role} />
            </div>
          </div>
          <button onClick={logout} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </CurrentUserContext.Provider>
  );
}
