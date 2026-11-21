import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError, MESSAGES } from '../api/types';
import { expireSession, SESSION_CATEGORIES, SESSIONS, type SessionCategory } from './fixtures';
import { expectLocation, renderRoute } from './renderRoute';

vi.mock('../api/api');

type Outcome = 'page' | '/login' | '/invalid-permissions' | '/blog' | '/dashboard' | '/admin';

const DESTINATION_HEADINGS: Record<Exclude<Outcome, 'page'>, string> = {
  '/login': 'Login',
  '/invalid-permissions': "You don't have permissions to view this screen.",
  '/blog': 'Blog',
  '/dashboard': 'Dashboard',
  '/admin': 'Administrator Dashboard',
};

// Written out literally so the test checks the route table instead of mirroring it.
const MATRIX: { path: string; heading: string | RegExp; outcomes: Record<SessionCategory, Outcome> }[] = [
  {
    path: '/login',
    heading: 'Login',
    outcomes: { anonymous: 'page', registered: '/blog', user: '/dashboard', approver: '/blog', administrator: '/admin' },
  },
  {
    path: '/invalid-permissions',
    heading: "You don't have permissions to view this screen.",
    outcomes: { anonymous: 'page', registered: 'page', user: 'page', approver: 'page', administrator: 'page' },
  },
  {
    path: '/dashboard',
    heading: 'Dashboard',
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: 'page',
      approver: '/invalid-permissions',
      administrator: '/invalid-permissions',
    },
  },
  {
    path: '/reports',
    heading: 'Reports',
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: 'page',
      approver: '/invalid-permissions',
      administrator: '/invalid-permissions',
    },
  },
  {
    path: '/reports/expense/12',
    heading: /^12\/2024 EX: London Trip/,
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: 'page',
      approver: '/invalid-permissions',
      administrator: '/invalid-permissions',
    },
  },
  {
    path: '/reports/earning/10',
    heading: /^10\/2024 EA: Sales Commission/,
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: 'page',
      approver: '/invalid-permissions',
      administrator: '/invalid-permissions',
    },
  },
  {
    path: '/admin',
    heading: 'Administrator Dashboard',
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: '/invalid-permissions',
      approver: '/invalid-permissions',
      administrator: 'page',
    },
  },
  {
    path: '/admin/reports/expense/9',
    heading: /^9\/2024 EX: Business Trip Expenses/,
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: '/invalid-permissions',
      approver: '/invalid-permissions',
      administrator: 'page',
    },
  },
  {
    path: '/admin/reports/earning/9',
    heading: /^9\/2024 EA: Consulting Fees/,
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: '/invalid-permissions',
      approver: '/invalid-permissions',
      administrator: 'page',
    },
  },
  {
    path: '/blog',
    heading: 'Blog',
    outcomes: { anonymous: '/login', registered: 'page', user: 'page', approver: 'page', administrator: 'page' },
  },
  {
    path: '/blog/posts/new',
    heading: 'New Blog Post',
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: '/invalid-permissions',
      approver: '/invalid-permissions',
      administrator: 'page',
    },
  },
  {
    path: '/tools/usd-to-eur',
    heading: 'USD/EUR Currency Converter',
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: 'page',
      approver: 'page',
      administrator: 'page',
    },
  },
  {
    path: '/tools/mileage',
    heading: 'Mileage Reimbursement',
    outcomes: {
      anonymous: '/login',
      registered: '/invalid-permissions',
      user: 'page',
      approver: 'page',
      administrator: 'page',
    },
  },
  {
    path: '/home',
    heading: '',
    outcomes: { anonymous: '/login', registered: '/blog', user: '/dashboard', approver: '/blog', administrator: '/admin' },
  },
];

const CASES = MATRIX.flatMap((row) =>
  SESSION_CATEGORIES.map((category) => ({
    path: row.path,
    heading: row.heading,
    category,
    outcome: row.outcomes[category],
  })),
);

describe('route guards', () => {
  it('covers 14 routes for 5 session categories', () => {
    expect(CASES).toHaveLength(70);
  });

  it.each(CASES)(
    '$category on $path -> $outcome',
    async ({ path, heading, category, outcome }) => {
      renderRoute(path, category);

      if (outcome === 'page') {
        expect(await screen.findByRole('heading', { name: heading }, { timeout: 3000 })).toBeInTheDocument();
        await expectLocation(path);
        return;
      }

      await expectLocation(outcome);
      expect(
        await screen.findByRole('heading', { name: DESTINATION_HEADINGS[outcome] }, { timeout: 3000 }),
      ).toBeInTheDocument();
    },
    15000,
  );
});

describe('expired session', () => {
  it(
    'shows Login after a protected call is rejected, then returns to the requested page',
    async () => {
      renderRoute('/reports', 'user');
      expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();

      expireSession();
      fireEvent.click(screen.getByRole('button', { name: 'Earnings' }));

      await expectLocation('/login');
      expect(await screen.findByRole('heading', { name: 'Login' }, { timeout: 3000 })).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Username/), { target: { value: SESSIONS.user.username } });
      fireEvent.change(screen.getByLabelText(/Password/), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Login' }));

      await expectLocation('/reports');
      expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();
    },
    15000,
  );
});

describe('api.ts session expiry reporting', () => {
  type Api = typeof import('../api/api');
  let real: Api;
  const unsubscribes: (() => void)[] = [];

  const unauthenticated = { status: 401, code: 'UNAUTHENTICATED', message: MESSAGES.UNAUTHENTICATED };

  function respond(status: number, body?: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }

  function stubFetch(answer: (url: string) => Response | Promise<Response>): void {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => answer(String(input))));
  }

  function listen() {
    const listener = vi.fn();
    unsubscribes.push(real.onSessionExpired(listener));
    return listener;
  }

  beforeAll(async () => {
    real = await vi.importActual<Api>('../api/api');
  });

  afterEach(() => {
    unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
    vi.unstubAllGlobals();
  });

  it('reports concurrent protected 401s once and rethrows each ApiError', async () => {
    stubFetch(() => respond(401, unauthenticated));
    const expired = listen();

    const results = await Promise.allSettled([
      real.listReports({ kind: 'expense' }),
      real.reference(),
      real.userDashboard(),
    ]);

    for (const result of results) {
      const reason: unknown = result.status === 'rejected' ? result.reason : result;
      expect(reason).toBeInstanceOf(ApiError);
      expect(reason).toMatchObject(unauthenticated);
    }
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it.each([
    { probe: 'me', code: 'UNAUTHENTICATED', call: (api: Api) => api.me() },
    {
      probe: 'login',
      code: 'BAD_CREDENTIALS',
      call: (api: Api) => api.login({ username: SESSIONS.user.username, password: 'wrong', rememberMe: false }),
    },
    { probe: 'logout', code: 'UNAUTHENTICATED', call: (api: Api) => api.logout() },
  ])('does not report a 401 from $probe', async ({ code, call }) => {
    stubFetch(() => respond(401, { ...unauthenticated, code }));
    const expired = listen();

    await expect(call(real)).rejects.toMatchObject({ status: 401, code });
    expect(expired).not.toHaveBeenCalled();
  });

  it.each([
    {
      change: 'login',
      answer: () => respond(200, SESSIONS.user),
      act: (api: Api) => api.login({ username: SESSIONS.user.username, password: '123456', rememberMe: false }),
    },
    { change: 'logout', answer: () => respond(204), act: (api: Api) => api.logout() },
  ])('ignores a 401 of a request started before $change', async ({ answer, act }) => {
    let answerStale: (response: Response) => void = () => {};
    stubFetch((url) => {
      if (url.startsWith('/api/reports')) {
        return new Promise<Response>((resolve) => {
          answerStale = resolve;
        });
      }
      return url.startsWith('/api/auth/') ? answer() : respond(401, unauthenticated);
    });
    const expired = listen();

    const stale = real.listReports({ kind: 'expense' });
    await act(real);
    answerStale(respond(401, unauthenticated));

    await expect(stale).rejects.toMatchObject(unauthenticated);
    expect(expired).not.toHaveBeenCalled();

    await expect(real.reference()).rejects.toMatchObject(unauthenticated);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('stops reporting to a listener once it unsubscribes', async () => {
    stubFetch(() => respond(401, unauthenticated));
    const kept = listen();
    const dropped = vi.fn();
    real.onSessionExpired(dropped)();

    await expect(real.mileage(10)).rejects.toMatchObject(unauthenticated);
    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });
});
