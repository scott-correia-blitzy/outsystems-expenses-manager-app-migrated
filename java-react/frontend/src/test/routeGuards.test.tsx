import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLocation, useNavigate } from 'react-router';
import * as api from '../api/api';
import { ApiError, MESSAGES, type SessionUser } from '../api/types';
import { AuthProvider, useAuth, type AuthContextValue } from '../auth/AuthContext';
import { safeRedirectTarget } from '../routes';
import {
  expireSession,
  holdNextAnswer,
  installApiMocks,
  SESSION_CATEGORIES,
  SESSIONS,
  switchSession,
  type SessionCategory,
} from './fixtures';
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

async function signInAgain(username: string = SESSIONS.user.username): Promise<void> {
  expect(await screen.findByRole('heading', { name: 'Login' }, { timeout: 3000 })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Username/), { target: { value: username } });
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

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settleWith, failWith) => {
    resolve = settleWith;
    reject = failWith;
  });
  return { promise, resolve, reject };
}

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

  it.each([
    {
      category: 'user',
      path: '/reports/expense/12',
      heading: /^12\/2024 EX: London Trip/,
      calls: [api.reference, api.getReport],
    },
    {
      category: 'administrator',
      path: '/admin',
      heading: 'Administrator Dashboard',
      calls: [api.adminDashboard, api.listReports],
    },
  ] as const)(
    'reports the concurrent 401s of $path once and returns there after sign-in',
    async ({ category, path, heading, calls }) => {
      renderRoute('/blog', category, <HistoryProbe go={path} />);
      expect(await screen.findByRole('heading', { name: 'Blog' }, { timeout: 3000 })).toBeInTheDocument();
      const expired = vi.fn();
      api.onSessionExpired(expired);

      expireSession();
      fireEvent.click(screen.getByRole('button', { name: 'Visit' }));

      await expectLocation('/login');
      expect(screen.getByTestId('return-path').textContent).toBe(path);
      for (const call of calls) {
        expect(vi.mocked(call).mock.settledResults).toEqual([
          { type: 'rejected', value: expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }) },
        ]);
      }
      expect(expired).toHaveBeenCalledTimes(1);

      await signInAgain(SESSIONS[category].username);
      await expectLocation(path);
      expect(await screen.findByRole('heading', { name: heading }, { timeout: 3000 })).toBeInTheDocument();
    },
    15000,
  );

  it.each([
    {
      change: 'logout',
      end: () => fireEvent.click(screen.getByRole('button', { name: 'Logout' })),
      path: '/dashboard',
      heading: 'Dashboard',
    },
    {
      change: 'expiry',
      end: () => fireEvent.click(screen.getByRole('button', { name: 'Expenses' })),
      path: '/reports',
      heading: 'Reports',
    },
  ])(
    'keeps the session signed in again after a $change when an earlier call answers 401 late',
    async ({ end, path, heading }) => {
      renderRoute('/reports', 'user');
      expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();
      // The first list load must be over, or it would take the hold meant for the Earnings call.
      expect(await screen.findByText('12/2024 EX', {}, { timeout: 3000 })).toBeInTheDocument();

      expireSession();
      const answerStale = holdNextAnswer();
      fireEvent.click(screen.getByRole('button', { name: 'Earnings' }));
      end();
      await expectLocation('/login');
      await signInAgain();
      await expectLocation(path);
      expect(await screen.findByRole('heading', { name: heading }, { timeout: 3000 })).toBeInTheDocument();

      const stale = vi.mocked(api.listReports).mock.calls.findIndex(([query]) => query.kind === 'earning');
      expect(vi.mocked(api.listReports).mock.settledResults[stale]).toBeUndefined();
      await release(answerStale);

      expect(vi.mocked(api.listReports).mock.settledResults[stale]).toEqual({
        type: 'rejected',
        value: expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
      });
      expect(screen.getByTestId('location').textContent).toBe(path);
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Logout' })).toBeEnabled();
    },
    15000,
  );
});

describe('session changed in another tab', () => {
  // A registered-only caller is also refused the report list, so two refusals arrive together.
  it.each([
    { category: 'user', links: ['Dashboard', 'Reports', 'Blog'], dashboard: '/dashboard' },
    { category: 'registered', links: ['Dashboard', 'Blog'], dashboard: '/invalid-permissions' },
  ] as const)(
    'follows a $category signed in elsewhere when the administrator dashboard is refused',
    async ({ category, links, dashboard }) => {
      renderRoute('/blog', 'administrator');
      expect(await screen.findByRole('heading', { name: 'Blog' }, { timeout: 3000 })).toBeInTheDocument();
      const meCalls = vi.mocked(api.me).mock.calls.length;

      switchSession(category);
      fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));

      await expectLocation('/invalid-permissions');
      expect(
        await screen.findByRole('heading', { name: DESTINATION_HEADINGS['/invalid-permissions'] }, { timeout: 3000 }),
      ).toBeInTheDocument();
      expect(screen.getByText(SESSIONS[category].displayName)).toBeInTheDocument();
      expect(screen.queryByText(SESSIONS.administrator.displayName)).not.toBeInTheDocument();
      const menu = within(screen.getByRole('navigation', { name: 'Main menu' }));
      expect(menu.getAllByRole('link').map((link) => link.textContent)).toEqual(links);
      expect(menu.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', dashboard);
      expect(api.me).toHaveBeenCalledTimes(meCalls + 1);
    },
    15000,
  );

  it(
    'shows Login with the return path when the refused caller has no session left',
    async () => {
      renderRoute('/blog', 'administrator', <HistoryProbe go="/admin" />);
      expect(await screen.findByRole('heading', { name: 'Blog' }, { timeout: 3000 })).toBeInTheDocument();

      switchSession('user');
      vi.mocked(api.me).mockRejectedValueOnce(new ApiError(401, 'UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED));
      fireEvent.click(screen.getByRole('button', { name: 'Visit' }));

      await expectLocation('/login');
      expect(screen.getByTestId('return-path').textContent).toBe('/admin');

      await signInAgain(SESSIONS.administrator.username);
      await expectLocation('/admin');
      expect(
        await screen.findByRole('heading', { name: 'Administrator Dashboard' }, { timeout: 3000 }),
      ).toBeInTheDocument();
    },
    15000,
  );

  it(
    'keeps an unchanged caller signed in when a report it does not own is refused',
    async () => {
      renderRoute('/reports', 'user', <HistoryProbe go="/reports/expense/7" />);
      expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();
      const meCalls = vi.mocked(api.me).mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: 'Visit' }));

      await waitFor(() =>
        expect(vi.mocked(api.me).mock.settledResults[meCalls]).toEqual({ type: 'fulfilled', value: SESSIONS.user }),
      );
      await expectLocation('/dashboard');
      expect(await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 3000 })).toBeInTheDocument();
      expect(await screen.findByText(MESSAGES.INVALID_REPORT, {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByText(SESSIONS.user.displayName)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Logout' })).toBeEnabled();
      expect(api.me).toHaveBeenCalledTimes(meCalls + 1);
    },
    15000,
  );

  it.each([
    { change: 'logout', end: () => fireEvent.click(screen.getByRole('button', { name: 'Logout' })) },
    {
      change: 'expiry',
      end: () => {
        expireSession();
        fireEvent.click(screen.getByRole('button', { name: 'Earnings' }));
      },
    },
  ])(
    'follows a caller changed after a $change while the check of the earlier session is pending',
    async ({ end }) => {
      renderRoute('/blog', 'administrator');
      expect(await screen.findByRole('heading', { name: 'Blog' }, { timeout: 3000 })).toBeInTheDocument();
      const earlierCheck = held<SessionUser>();
      vi.mocked(api.me).mockImplementationOnce(() => earlierCheck.promise);
      const meCalls = vi.mocked(api.me).mock.calls.length;

      switchSession('user');
      fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
      await waitFor(() => expect(api.me).toHaveBeenCalledTimes(meCalls + 1));
      end();
      await signInAgain(SESSIONS.administrator.username);
      await expectLocation('/admin');
      fireEvent.click(screen.getByRole('link', { name: 'Blog' }));
      expect(await screen.findByRole('heading', { name: 'Blog' }, { timeout: 3000 })).toBeInTheDocument();

      switchSession('user');
      fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));

      await expectLocation('/invalid-permissions');
      expect(screen.getByText(SESSIONS.user.displayName)).toBeInTheDocument();
      await release(() => earlierCheck.resolve(SESSIONS.approver));

      expect(screen.getByTestId('location').textContent).toBe('/invalid-permissions');
      expect(screen.getByText(SESSIONS.user.displayName)).toBeInTheDocument();
      expect(screen.queryByText(SESSIONS.approver.displayName)).not.toBeInTheDocument();
    },
    15000,
  );

  it.each([
    {
      resync: 'another caller',
      answer: () => Promise.resolve(SESSIONS.administrator),
      outcome: '/invalid-permissions',
      user: SESSIONS.administrator,
    },
    {
      resync: 'no session',
      answer: () => Promise.reject(new ApiError(401, 'UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED)),
      outcome: '/login',
      user: null,
    },
  ] as const)(
    'ignores a late 401 of the earlier session once the check finds $resync',
    async ({ answer, outcome, user }) => {
      const auth: { current: AuthContextValue | null } = { current: null };
      function Probe() {
        auth.current = useAuth();
        return null;
      }
      renderRoute('/reports', 'user', <Probe />);
      expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();
      expect(await screen.findByText('12/2024 EX', {}, { timeout: 3000 })).toBeInTheDocument();
      const expired = vi.fn();
      api.onSessionExpired(expired);

      expireSession();
      const answerStale = holdNextAnswer();
      fireEvent.click(screen.getByRole('button', { name: 'Earnings' }));
      switchSession('administrator');
      vi.mocked(api.me).mockImplementationOnce(answer);
      fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
      await expectLocation(outcome);
      expect(
        await screen.findByRole('heading', { name: DESTINATION_HEADINGS[outcome] }, { timeout: 3000 }),
      ).toBeInTheDocument();

      await release(answerStale);

      const stale = vi.mocked(api.listReports).mock.calls.findIndex(([query]) => query.kind === 'earning');
      expect(vi.mocked(api.listReports).mock.settledResults[stale]).toEqual({
        type: 'rejected',
        value: expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
      });
      expect(expired).not.toHaveBeenCalled();
      expect(screen.getByTestId('location').textContent).toBe(outcome);
      expect(screen.getByRole('heading', { name: DESTINATION_HEADINGS[outcome] })).toBeInTheDocument();
      expect(auth.current?.user ?? null).toEqual(user);
    },
    15000,
  );
});

describe('logout', () => {
  async function openReports(): Promise<void> {
    renderRoute('/reports', 'user');
    expect(await screen.findByRole('heading', { name: 'Reports' }, { timeout: 3000 })).toBeInTheDocument();
  }

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
