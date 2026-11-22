import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { REFERENCE, SESSIONS } from '../test/fixtures';
import { MESSAGES, type ReportListQuery } from './types';

type Api = typeof import('./api');
type Reply = (init?: RequestInit) => Promise<Response>;

const REFERENCE_KEY = 'GET /api/reference';
const SERVER_ERROR = { status: 500, code: 'INTERNAL_ERROR', message: MESSAGES.INTERNAL_ERROR };
const UNAUTHENTICATED = { status: 401, code: 'UNAUTHENTICATED', message: MESSAGES.UNAUTHENTICATED };

let api: Api;
let routes: Record<string, Reply>;
let fetchMock: Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;

function json(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function untilAborted(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (init?.signal?.aborted) {
      abort();
    } else {
      init?.signal?.addEventListener('abort', abort, { once: true });
    }
  });
}

function requested(): string[] {
  return fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}`);
}

beforeEach(async () => {
  routes = {
    [REFERENCE_KEY]: () => json(200, REFERENCE),
    'POST /api/auth/login': () => json(200, SESSIONS.user),
    'POST /api/auth/logout': () => Promise.resolve(new Response(null, { status: 204 })),
    'GET /api/dashboard/user': () => json(401, UNAUTHENTICATED),
  };
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const reply = routes[`${init?.method ?? 'GET'} ${String(input)}`];
    return reply ? reply(init) : Promise.reject(new Error(`Unrouted request to ${String(input)}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  // A token cookie spares writes the CSRF handshake, so each test sees only its own requests.
  document.cookie = 'XSRF-TOKEN=test-token; path=/';
  vi.resetModules();
  api = await import('./api');
});

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  vi.unstubAllGlobals();
});

describe('reference loader', () => {
  it('shares one request between concurrent and later callers', async () => {
    const [first, second] = await Promise.all([api.reference(), api.reference()]);
    const later = await api.reference();

    expect(first).toEqual(REFERENCE);
    expect(second).toBe(first);
    expect(later).toBe(first);
    expect(requested()).toEqual([REFERENCE_KEY]);
  });

  it.each<[string, Reply, number]>([
    ['a server error', () => json(500, SERVER_ERROR), 500],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 0],
  ])('requests again after %s', async (_label, failure, status) => {
    routes[REFERENCE_KEY] = failure;
    await expect(api.reference()).rejects.toMatchObject({ status });

    routes[REFERENCE_KEY] = () => json(200, REFERENCE);
    await expect(api.reference()).resolves.toEqual(REFERENCE);
    expect(requested()).toEqual([REFERENCE_KEY, REFERENCE_KEY]);
  });

  it.each<[string, (session: Api) => Promise<unknown>, string[]]>([
    [
      'login',
      (session) => session.login({ username: 'em_user1', password: '123456', rememberMe: false }),
      ['POST /api/auth/login'],
    ],
    ['logout', (session) => session.logout(), ['POST /api/auth/logout']],
    ['startNewSession', async (session) => session.startNewSession(), []],
    [
      'a 401 from another signed-in call',
      (session) => expect(session.userDashboard()).rejects.toMatchObject({ status: 401 }),
      ['GET /api/dashboard/user'],
    ],
  ])('requests again after %s', async (_label, changeSession, sessionRequests) => {
    await api.reference();
    await changeSession(api);
    await expect(api.reference()).resolves.toEqual(REFERENCE);

    expect(requested()).toEqual([REFERENCE_KEY, ...sessionRequests, REFERENCE_KEY]);
  });

  it('keeps a load from an earlier session away from the next one', async () => {
    let release: (reply: Promise<Response>) => void = () => undefined;
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    routes[REFERENCE_KEY] = () => held;
    const stale = api.reference();
    api.startNewSession();

    routes[REFERENCE_KEY] = () => json(200, REFERENCE);
    const current = await api.reference();
    release(json(500, SERVER_ERROR));
    await expect(stale).rejects.toMatchObject({ status: 500 });

    await expect(api.reference()).resolves.toBe(current);
    expect(requested()).toEqual([REFERENCE_KEY, REFERENCE_KEY]);
  });
});

describe('report list request', () => {
  const QUERY: ReportListQuery = {
    kind: 'expense',
    status: 'Submitted',
    q: 'Many',
    sort: 'code,desc',
    from: '2024-03-05',
    to: '',
  };
  const LIST_KEY = 'GET /api/reports?kind=expense&status=Submitted&q=Many&sort=code%2Cdesc&from=2024-03-05';

  it('builds the URL from the query and forwards the signal to fetch', async () => {
    routes[LIST_KEY] = () => json(200, []);
    const controller = new AbortController();

    await expect(api.listReports(QUERY, controller.signal)).resolves.toEqual([]);
    expect(requested()).toEqual([LIST_KEY]);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('rejects an aborted request without ending the session', async () => {
    const expired = vi.fn();
    api.onSessionExpired(expired);
    const cached = await api.reference();
    routes[LIST_KEY] = untilAborted;
    const controller = new AbortController();

    const listing = api.listReports(QUERY, controller.signal);
    controller.abort();

    await expect(listing).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'ABORTED',
      message: MESSAGES.GENERIC_ERROR,
    });
    await expect(api.reference()).resolves.toBe(cached);
    expect(expired).not.toHaveBeenCalled();
    expect(requested()).toEqual([REFERENCE_KEY, LIST_KEY]);
  });
});
