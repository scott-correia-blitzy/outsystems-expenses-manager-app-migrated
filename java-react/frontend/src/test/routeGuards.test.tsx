import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation, useNavigate } from 'react-router';
import * as api from '../api/api';
import { ApiError, MESSAGES, type SessionUser } from '../api/types';
import { AuthProvider, useAuth, type AuthContextValue } from '../auth/AuthContext';
import { safeRedirectTarget } from '../routes';
import { expireSession, installApiMocks, SESSION_CATEGORIES, SESSIONS, type SessionCategory } from './fixtures';
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

  it(
    'returns an anonymous visitor to the requested page after sign-in',
    async () => {
      renderRoute('/reports/expense/12', 'anonymous');
      await expectLocation('/login');
      expect(await screen.findByRole('heading', { name: 'Login' }, { timeout: 3000 })).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Username/), { target: { value: SESSIONS.user.username } });
      fireEvent.change(screen.getByLabelText(/Password/), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Login' }));

      await expectLocation('/reports/expense/12');
      expect(
        await screen.findByRole('heading', { name: /^12\/2024 EX: London Trip/ }, { timeout: 3000 }),
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

describe('logout', () => {
  function held<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((settleWith, failWith) => {
      resolve = settleWith;
      reject = failWith;
    });
    return { promise, resolve, reject };
  }

  async function openReports(): Promise<void> {
    renderRoute('/reports', 'user');
    expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();
  }

  async function signInAgain(): Promise<void> {
    expect(await screen.findByRole('heading', { name: 'Login' }, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: SESSIONS.user.username } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await screen.findByRole('button', { name: 'Logout' }, { timeout: 3000 });
  }

  // Waits for every callback and render the released answer triggers before the test asserts.
  async function release(answer: () => void): Promise<void> {
    await act(async () => {
      answer();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { outcome: 'a double click', clicks: 2, answer: () => Promise.resolve() },
    {
      outcome: 'a failed logout call',
      clicks: 1,
      answer: () => Promise.reject(new ApiError(0, 'NETWORK_ERROR', MESSAGES.GENERIC_ERROR)),
    },
  ])(
    'shows Login after $outcome, refreshes the CSRF token and signs in again at the landing route',
    async ({ clicks, answer }) => {
      await openReports();
      vi.mocked(api.logout).mockImplementationOnce(answer);

      const logout = screen.getByRole('button', { name: 'Logout' });
      for (let click = 0; click < clicks; click += 1) {
        fireEvent.click(logout);
      }

      await expectLocation('/login');
      expect(await screen.findByRole('heading', { name: 'Login' }, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
      expect(api.logout).toHaveBeenCalledTimes(1);
      const [loggedOutAt] = vi.mocked(api.logout).mock.invocationCallOrder;
      expect(vi.mocked(api.me).mock.invocationCallOrder.some((calledAt) => calledAt > loggedOutAt)).toBe(true);

      await signInAgain();
      await expectLocation(SESSIONS.user.landingRoute);
      expect(await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 3000 })).toBeInTheDocument();
    },
    15000,
  );

  function HistoryProbe({ go }: { go: string | number }) {
    const navigate = useNavigate();
    const { state } = useLocation();
    const from = (state as { from?: unknown } | null)?.from;
    return (
      <>
        <button onClick={() => (typeof go === 'number' ? navigate(go) : navigate(go))}>Visit</button>
        <div data-testid="return-path">{typeof from === 'string' ? from : ''}</div>
      </>
    );
  }

  it.each([
    { visit: 'Back', go: -1, path: '/reports/expense/12', heading: /^12\/2024 EX: London Trip/ },
    { visit: 'a link', go: '/reports/earning/10', path: '/reports/earning/10', heading: /^10\/2024 EA: Sales Commission/ },
  ])(
    'returns to a protected page reached by $visit after logout once the user signs in',
    async ({ go, path, heading }) => {
      renderRoute(['/reports/expense/12', '/reports'], 'user', <HistoryProbe go={go} />);
      expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      await expectLocation('/login');
      expect(screen.getByTestId('return-path').textContent).toBe('');

      fireEvent.click(screen.getByRole('button', { name: 'Visit' }));
      await waitFor(() => expect(screen.getByTestId('return-path').textContent).toBe(path));
      await expectLocation('/login');

      await signInAgain();
      await expectLocation(path);
      expect(await screen.findByRole('heading', { name: heading }, { timeout: 3000 })).toBeInTheDocument();
    },
    15000,
  );

  it(
    'keeps the next session on its page when the refresh after logout answers late',
    async () => {
      await openReports();
      const refresh = held<SessionUser>();
      vi.mocked(api.me).mockImplementationOnce(() => refresh.promise);

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      await expectLocation('/login');
      await signInAgain();
      fireEvent.click(screen.getByRole('link', { name: 'Reports' }));
      await expectLocation('/reports');
      expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();

      await release(() => refresh.reject(new ApiError(401, 'UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED)));

      expect(screen.getByTestId('location').textContent).toBe('/reports');
      expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    },
    15000,
  );

  it(
    'leaves a newer session signed in when the logout call answers after it began',
    async () => {
      await openReports();
      const logoutCall = held<void>();
      vi.mocked(api.logout).mockImplementationOnce(() => logoutCall.promise);

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      expect(screen.getByRole('button', { name: 'Logout' })).toBeDisabled();
      expireSession();
      fireEvent.click(screen.getByRole('button', { name: 'Earnings' }));
      await expectLocation('/login');
      await signInAgain();
      await expectLocation('/reports');

      await release(() => logoutCall.resolve());

      expect(screen.getByTestId('location').textContent).toBe('/reports');
      expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Logout' })).toBeEnabled();
    },
    15000,
  );

  it('shares one logout call between concurrent callers of a session', async () => {
    installApiMocks('user');
    const auth: { current: AuthContextValue | null } = { current: null };
    function Probe() {
      auth.current = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(auth.current?.status).toBe('signedIn'));
    const session = auth.current;
    if (session === null) {
      throw new Error('AuthProvider rendered no context');
    }

    let ended: boolean[] = [];
    await act(async () => {
      ended = await Promise.all([session.logout(), session.logout()]);
    });

    expect(ended).toEqual([true, true]);
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(auth.current?.status).toBe('anonymous');
  });
});

describe('login return path', () => {
  it.each([
    '/\t/outside.example',
    '/\n/outside.example',
    '/\r/outside.example',
    '//outside.example',
    '/\\outside.example',
    '/.//outside.example',
    'https://outside.example/x',
    'reports',
    '',
    42,
    undefined,
  ])('rejects %j', (from) => {
    expect(safeRedirectTarget(from)).toBeNull();
  });

  it.each(['/reports', '/reports/expense/12', '/reports?kind=earning'])('keeps %s', (from) => {
    expect(safeRedirectTarget(from)).toBe(from);
  });
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
