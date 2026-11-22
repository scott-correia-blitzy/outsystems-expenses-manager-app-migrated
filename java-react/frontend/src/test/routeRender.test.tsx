import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/api';
import {
  ApiError,
  MESSAGES,
  type FieldError,
  type Kind,
  type LineBody,
  type LineView,
  type MileageResult,
  type ReferenceData,
  type ReportDetail,
  type ReportListQuery,
  type ReportSummary,
  type StatusLabel,
  type UsdToEurResult,
} from '../api/types';
import { PATHS } from '../routes';
import { theme } from '../theme/theme';
import {
  ADMIN_EXPENSE_ROWS,
  EXPENSE_ROWS,
  MILEAGE_RESULT,
  REFERENCE,
  REPORT_DETAILS,
  SESSIONS,
  USD_TO_EUR_RESULT,
  USER_DASHBOARD,
  type SessionCategory,
} from './fixtures';
import { expectLocation, renderRoute } from './renderRoute';

vi.mock('../api/api');

beforeEach(() => {
  vi.resetAllMocks();
});

// jsdom has no layout, so it implements no scrolling either.
const scrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

const FIND_TIMEOUT = 3000;
const TEST_TIMEOUT = 15_000;
const CONTROL_ROLES = ['button', 'link', 'menuitem'] as const;

const PERMISSIONS_HEADING = "You don't have permissions to view this screen.";
const APP_NAME = 'Expenses Manager V2';

async function heading(name: string | RegExp): Promise<HTMLElement> {
  return screen.findByRole('heading', { name }, { timeout: FIND_TIMEOUT });
}

// Pages keep their own status regions inside main, so the screen announcer is the one outside it.
function liveRegion(): HTMLElement {
  const announcers = screen.getAllByRole('status').filter((region) => region.closest('main') === null);
  expect(announcers).toHaveLength(1);
  return announcers[0];
}

async function clickControl(name: string | RegExp): Promise<void> {
  const control = await waitFor(
    () => {
      const found = CONTROL_ROLES.flatMap((role) => screen.queryAllByRole(role, { name }));
      expect(found.length).toBeGreaterThan(0);
      return found[0];
    },
    { timeout: FIND_TIMEOUT },
  );
  fireEvent.click(control);
}

async function expandRow(code: string): Promise<void> {
  fireEvent.click(await screen.findByText(code, {}, { timeout: FIND_TIMEOUT }));
  fireEvent.click((await screen.findAllByText('View Report Details', {}, { timeout: FIND_TIMEOUT }))[0]);
}

async function startAt(category: SessionCategory, landing: string): Promise<void> {
  renderRoute('/', category);
  await expectLocation(landing);
}

async function arriveAt(path: string, name: string | RegExp): Promise<void> {
  expect(await heading(name)).toBeInTheDocument();
  await expectLocation(path);
}

type RenderCase = { path: string; category: SessionCategory; name: string | RegExp; title: string };

const RENDER_CASES: RenderCase[] = [
  { path: '/login', category: 'anonymous', name: 'Login', title: 'Login' },
  { path: '/invalid-permissions', category: 'anonymous', name: PERMISSIONS_HEADING, title: 'Invalid Permissions' },
  { path: '/dashboard', category: 'user', name: 'Dashboard', title: 'Dashboard' },
  { path: '/reports', category: 'user', name: 'Reports', title: 'Reports' },
  {
    path: '/reports/expense/12',
    category: 'user',
    name: /^12\/2024 EX: London Trip/,
    title: 'Expense Report Detail',
  },
  {
    path: '/reports/earning/10',
    category: 'user',
    name: /^10\/2024 EA: Sales Commission/,
    title: 'Earning Report Detail',
  },
  { path: '/admin', category: 'administrator', name: 'Administrator Dashboard', title: 'Administrator Dashboard' },
  {
    path: '/admin/reports/expense/9',
    category: 'administrator',
    name: /^9\/2024 EX: Business Trip Expenses/,
    title: 'Expense Report Detail',
  },
  {
    path: '/admin/reports/earning/9',
    category: 'administrator',
    name: /^9\/2024 EA: Consulting Fees/,
    title: 'Earning Report Detail',
  },
  { path: '/blog', category: 'user', name: 'Blog', title: 'Blog' },
  { path: '/blog/posts/new', category: 'administrator', name: 'New Blog Post', title: 'Blog Post' },
  {
    path: '/tools/usd-to-eur',
    category: 'user',
    name: 'USD/EUR Currency Converter',
    title: 'USD/EUR Currency Converter',
  },
  { path: '/tools/mileage', category: 'user', name: 'Mileage Reimbursement', title: 'Mileage Reimbursement' },
];

describe('route renders', () => {
  it.each(RENDER_CASES)(
    '$path renders its page for $category',
    async ({ path, category, name, title }) => {
      renderRoute(path, category);
      const page = await heading(name);
      expect(page).toBeInTheDocument();
      await expectLocation(path);
      expect(document.title).toBe(`${title} - ${APP_NAME}`);
      expect(liveRegion()).toBeEmptyDOMElement();
      expect(page).not.toHaveFocus();
    },
    TEST_TIMEOUT,
  );

  it(
    '/home redirects to the landing route',
    async () => {
      renderRoute('/home', 'user');
      await expectLocation('/dashboard');
      expect(await heading('Dashboard')).toBeInTheDocument();

      cleanup();
      renderRoute('/home', 'approver');
      await expectLocation('/blog');
      expect(await heading('Blog')).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );
});

describe('in-app navigation', () => {
  it(
    'a user lands on /dashboard',
    async () => {
      await startAt('user', '/dashboard');
      await arriveAt('/dashboard', 'Dashboard');
    },
    TEST_TIMEOUT,
  );

  it(
    'an administrator lands on /admin',
    async () => {
      await startAt('administrator', '/admin');
      await arriveAt('/admin', 'Administrator Dashboard');
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches /reports from the dashboard',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl('View Reports');
      await arriveAt('/reports', 'Reports');
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches an expense report detail from the reports list',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl('Reports');
      await arriveAt('/reports', 'Reports');
      await expandRow('12/2024 EX');
      await arriveAt('/reports/expense/12', /^12\/2024 EX: London Trip/);
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches an earning report detail from the reports list',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl('Reports');
      await arriveAt('/reports', 'Reports');
      await clickControl('Earnings');
      await expandRow('10/2024 EA');
      await arriveAt('/reports/earning/10', /^10\/2024 EA: Sales Commission/);
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches an admin expense report detail from the dashboard list',
    async () => {
      await startAt('administrator', '/admin');
      // Expenses is preselected, so the toggle is exercised by switching away and back.
      await clickControl('Earnings');
      await clickControl('Expenses');
      await expandRow('9/2024 EX');
      await arriveAt('/admin/reports/expense/9', /^9\/2024 EX: Business Trip Expenses/);
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches an admin earning report detail from the dashboard list',
    async () => {
      await startAt('administrator', '/admin');
      await clickControl('Earnings');
      await expandRow('10/2024 EA');
      await arriveAt('/admin/reports/earning/10', /^10\/2024 EA: Sales Commission/);
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches /blog from the menu',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl('Blog');
      await arriveAt('/blog', 'Blog');
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches the new blog post form from the blog',
    async () => {
      await startAt('administrator', '/admin');
      await clickControl('Blog');
      await arriveAt('/blog', 'Blog');
      await clickControl('New Post');
      await arriveAt('/blog/posts/new', 'New Blog Post');
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches the USD to EUR converter from the Tools menu',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl('Tools');
      await clickControl('USD to EUR Converter');
      await arriveAt('/tools/usd-to-eur', 'USD/EUR Currency Converter');
    },
    TEST_TIMEOUT,
  );

  it(
    'reaches the reimbursement calculator from the Tools menu',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl('Tools');
      await clickControl('Reimbursement Calculator');
      await arriveAt('/tools/mileage', 'Mileage Reimbursement');
    },
    TEST_TIMEOUT,
  );

  it(
    'an approver reaches /invalid-permissions through the Dashboard link',
    async () => {
      await startAt('approver', '/blog');
      await clickControl('Dashboard');
      await arriveAt('/invalid-permissions', PERMISSIONS_HEADING);
    },
    TEST_TIMEOUT,
  );

  it(
    'logging out returns to /login with focus kept in Username',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl(/log ?out/i);
      await arriveAt('/login', 'Login');
      await waitFor(() => expect(liveRegion().textContent).toBe('Login'));
      expect(screen.getByRole('textbox', { name: /Username/ })).toHaveFocus();
      expect(document.title).toBe(`Login - ${APP_NAME}`);
    },
    TEST_TIMEOUT,
  );
});

type ScreenState = 'login' | 'app' | 'empty';

// Only AppLayout's app bar renders a header; Login renders its main alone.
function screenState(): ScreenState {
  if (document.querySelector('main') === null) {
    return 'empty';
  }
  return document.querySelector('header') === null ? 'login' : 'app';
}

function watchScreens(): { seen: ScreenState[]; stop: () => void } {
  const seen: ScreenState[] = [screenState()];
  const record = () => {
    const state = screenState();
    if (seen[seen.length - 1] !== state) {
      seen.push(state);
    }
  };
  const observer = new MutationObserver(record);
  observer.observe(document.body, { childList: true, subtree: true });
  return {
    seen,
    stop: () => {
      if (observer.takeRecords().length > 0) {
        record();
      }
      observer.disconnect();
    },
  };
}

type SessionSwapCase = { start: string; username: string; path: string; name: string | RegExp };

const SESSION_SWAP_CASES: SessionSwapCase[] = [
  { start: '/login', username: SESSIONS.user.username, path: '/dashboard', name: 'Dashboard' },
  {
    start: '/login',
    username: SESSIONS.administrator.username,
    path: '/admin',
    name: 'Administrator Dashboard',
  },
  {
    start: '/reports/expense/12',
    username: SESSIONS.user.username,
    path: '/reports/expense/12',
    name: /^12\/2024 EX: London Trip/,
  },
];

describe('session screen swaps', () => {
  it.each(SESSION_SWAP_CASES)(
    'signing in from $start as $username swaps Login for $path and logging out swaps back with no blank screen',
    async ({ start, username, path, name }) => {
      renderRoute(start, 'anonymous');
      await arriveAt('/login', 'Login');
      fireEvent.change(screen.getByLabelText(/Username/), { target: { value: username } });
      fireEvent.change(screen.getByLabelText(/Password/), { target: { value: '123456' } });

      const screens = watchScreens();
      try {
        fireEvent.click(screen.getByRole('button', { name: 'Login' }));
        await arriveAt(path, name);
        await clickControl(/log ?out/i);
        await arriveAt('/login', 'Login');
      } finally {
        screens.stop();
      }
      expect(screens.seen).toEqual(['login', 'app', 'login']);
    },
    TEST_TIMEOUT,
  );
});

type AnnounceCase = {
  via: string;
  category: SessionCategory;
  landing: string;
  go: () => Promise<void>;
  path: string;
  name: string | RegExp;
  title: string;
};

const ANNOUNCE_CASES: AnnounceCase[] = [
  {
    via: 'the Reports menu entry',
    category: 'user',
    landing: '/dashboard',
    go: () => clickControl('Reports'),
    path: '/reports',
    name: 'Reports',
    title: 'Reports',
  },
  {
    via: 'a report row, whose heading renders after loading',
    category: 'user',
    landing: '/dashboard',
    go: async () => {
      await clickControl('View Reports');
      await arriveAt('/reports', 'Reports');
      await expandRow('12/2024 EX');
    },
    path: '/reports/expense/12',
    name: /^12\/2024 EX: London Trip/,
    title: 'Expense Report Detail',
  },
  {
    via: 'the Tools menu',
    category: 'user',
    landing: '/dashboard',
    go: async () => {
      await clickControl('Tools');
      await clickControl('USD to EUR Converter');
    },
    path: '/tools/usd-to-eur',
    name: 'USD/EUR Currency Converter',
    title: 'USD/EUR Currency Converter',
  },
  {
    via: 'the Blog menu entry',
    category: 'administrator',
    landing: '/admin',
    go: () => clickControl('Blog'),
    path: '/blog',
    name: 'Blog',
    title: 'Blog',
  },
];

describe('dashboard loading and errors', () => {
  const failure = new ApiError(500, 'INTERNAL_ERROR', 'An error occurred, please try later');
  const cases: {
    path: string;
    category: SessionCategory;
    name: string;
    endpoint: typeof api.userDashboard | typeof api.adminDashboard;
    spinner: string;
    loaded: string;
    announcement: string;
  }[] = [
    {
      path: '/dashboard',
      category: 'user',
      name: 'Dashboard',
      endpoint: api.userDashboard,
      spinner: 'Loading',
      loaded: 'Total Balance',
      announcement: 'Dashboard loaded',
    },
    {
      path: '/admin',
      category: 'administrator',
      name: 'Administrator Dashboard',
      endpoint: api.adminDashboard,
      spinner: 'Loading report counters',
      loaded: '5.88%',
      announcement: 'Total Reports 17, Reports Waiting Verification 15, Approved Report Rate 5.88%',
    },
  ];

  it.each(cases)(
    '$path keeps an inline error with Retry after its first load fails',
    async ({ path, category, name, endpoint, spinner, loaded, announcement }) => {
      vi.mocked(endpoint).mockRejectedValueOnce(failure);
      renderRoute(path, category);
      expect(await heading(name)).toBeInTheDocument();

      const retry = await screen.findByRole('button', { name: 'Retry' }, { timeout: FIND_TIMEOUT });
      const alert = retry.closest('[role="alert"]');
      expect(alert).toHaveTextContent(failure.message);
      expect(alert?.closest('main')).not.toBeNull();
      expect(screen.queryByText(loaded)).toBeNull();

      retry.focus();
      fireEvent.click(retry);
      expect(screen.getByRole('progressbar', { name: spinner })).toBeInTheDocument();
      expect(await screen.findByText(announcement, {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(screen.getByText(loaded)).toBeInTheDocument();
      expect(alert).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      await waitFor(() => expect(screen.getByRole('heading', { name })).toHaveFocus());
    },
    TEST_TIMEOUT,
  );
});

describe('route announcements', () => {
  it.each(ANNOUNCE_CASES)(
    'announces and focuses $path reached through $via',
    async ({ category, landing, go, path, name, title }) => {
      await startAt(category, landing);
      expect(liveRegion()).toBeEmptyDOMElement();

      await go();
      const page = await heading(name);
      await expectLocation(path);
      await waitFor(() => {
        expect(liveRegion().textContent).toBe(title);
        expect(page).toHaveFocus();
      });
      expect(document.title).toBe(`${title} - ${APP_NAME}`);
    },
    TEST_TIMEOUT,
  );
});

describe('line form preview', () => {
  it(
    'line form preview uses the reference rates',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(/^12\/2024 EX: London Trip/)).toBeInTheDocument();
      await clickControl('Add Expense');

      fireEvent.mouseDown(await screen.findByRole('combobox', { name: /Expense Type/ }, { timeout: FIND_TIMEOUT }));
      fireEvent.click(await screen.findByRole('option', { name: 'Kilometers' }, { timeout: FIND_TIMEOUT }));
      fireEvent.change(await screen.findByLabelText(/Distance/, {}, { timeout: FIND_TIMEOUT }), {
        target: { value: '10' },
      });

      expect(await screen.findByText(/€ 5,00/, {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(screen.queryByText(/€ 3,70/)).toBeNull();
    },
    TEST_TIMEOUT,
  );
});

describe('narrow line list', () => {
  it(
    '/reports/expense/12 lists its lines as captioned cards below md',
    async () => {
      const narrowQuery = theme.breakpoints.down('md').replace(/^@media ?/, '');
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === narrowQuery,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }));
      try {
        renderRoute('/reports/expense/12', 'user');
        const list = await screen.findByRole('list', { name: 'Expenses' }, { timeout: FIND_TIMEOUT });
        expect(screen.queryByRole('table')).toBeNull();
        const card = within(list).getByRole('listitem');
        expect(within(card).getByText('Amount Spent')).toBeInTheDocument();
        expect(within(card).getByText('€ 42,00')).toBeInTheDocument();
        expect(within(card).getByRole('button', { name: 'View' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /^Sort by/ })).toBeInTheDocument();
      } finally {
        vi.unstubAllGlobals();
      }
    },
    TEST_TIMEOUT,
  );
});

describe('blog search', () => {
  it(
    'uses the shared search field and queries by keyword',
    async () => {
      renderRoute('/blog', 'user');
      expect(await heading('Blog')).toBeInTheDocument();
      const search = screen.getByRole('searchbox', { name: 'Search' });
      expect(search).toHaveAttribute('placeholder', 'Search');
      expect(search.closest('.MuiFormControl-root')?.querySelector('label')).toBeNull();
      expect(search.parentElement?.querySelector('.MuiInputAdornment-positionStart svg')).not.toBeNull();

      fireEvent.change(search, { target: { value: 'Mileage' } });
      await waitFor(() => expect(vi.mocked(api.listBlogPosts)).toHaveBeenLastCalledWith('Mileage'), {
        timeout: FIND_TIMEOUT,
      });
    },
    TEST_TIMEOUT,
  );
});

type SearchCapCase = {
  path: string;
  category: SessionCategory;
  label: string;
  cap: number;
  sentQueries: () => (string | undefined)[];
};

const SEARCH_CAP_CASES: SearchCapCase[] = [
  {
    path: '/reports',
    category: 'user',
    label: 'Search by title',
    cap: 50,
    sentQueries: () => vi.mocked(api.listReports).mock.calls.map(([query]) => query.q),
  },
  {
    path: '/admin',
    category: 'administrator',
    label: 'Search by title',
    cap: 50,
    sentQueries: () => vi.mocked(api.listReports).mock.calls.map(([query]) => query.q),
  },
  {
    path: '/blog',
    category: 'user',
    label: 'Search',
    cap: 500,
    sentQueries: () => vi.mocked(api.listBlogPosts).mock.calls.map(([q]) => q),
  },
];

describe('search length caps', () => {
  it.each(SEARCH_CAP_CASES)(
    '$path cuts an over-long search to $cap characters',
    async ({ path, category, label, cap, sentQueries }) => {
      renderRoute(path, category);
      const field = await screen.findByLabelText(label, {}, { timeout: FIND_TIMEOUT });
      expect(field).toHaveAttribute('maxlength', String(cap));

      fireEvent.change(field, { target: { value: 'A'.repeat(9000) } });
      expect(field).toHaveValue('A'.repeat(cap));
      await waitFor(() => expect(sentQueries().at(-1)).toBe('A'.repeat(cap)), { timeout: FIND_TIMEOUT });
      expect(sentQueries().filter((q) => (q ?? '').length > cap)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

async function fillField(label: string | RegExp, value: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText(label, {}, { timeout: FIND_TIMEOUT }), { target: { value } });
}

type ServerErrorCase = {
  path: string;
  category: SessionCategory;
  name: string | RegExp;
  fill: () => Promise<void>;
  submit: string;
  endpoint:
    | typeof api.createBlogPost
    | typeof api.usdToEur
    | typeof api.mileage
    | typeof api.createReport
    | typeof api.createLine;
  label: string | RegExp;
  field: string;
  messages: [string, string];
  unknown: FieldError;
};

const SERVER_ERROR_CASES: ServerErrorCase[] = [
  {
    path: '/blog/posts/new',
    category: 'administrator',
    name: 'New Blog Post',
    fill: () => fillField(/^Title/, 'Quarterly update'),
    submit: 'Save',
    endpoint: api.createBlogPost,
    label: /^Title/,
    field: 'title',
    messages: ['Title is already in use', 'Title must not end with a period'],
    unknown: { field: 'slug', message: 'Slug is already in use' },
  },
  {
    path: '/tools/usd-to-eur',
    category: 'user',
    name: 'USD/EUR Currency Converter',
    fill: async () => {
      await fillField('USD Amount', '100');
      await waitFor(() =>
        expect(screen.getByLabelText('Exchange Rate USD/EUR')).toHaveValue(REFERENCE.dollarsToEuros),
      );
    },
    submit: 'Convert',
    endpoint: api.usdToEur,
    label: 'USD Amount',
    field: 'amount',
    messages: ['Amount is too large', 'Amount allows at most 2 decimals'],
    unknown: { field: 'currency', message: 'Currency is not supported' },
  },
  {
    path: '/tools/mileage',
    category: 'user',
    name: 'Mileage Reimbursement',
    fill: () => fillField('Mileage', '10'),
    submit: 'Convert',
    endpoint: api.mileage,
    label: 'Mileage',
    field: 'km',
    messages: ['Distance is too large', 'Distance allows at most 2 decimals'],
    unknown: { field: 'vehicle', message: 'Vehicle is required' },
  },
  {
    path: '/reports',
    category: 'user',
    name: 'Reports',
    fill: async () => {
      await clickControl('New Report');
      const dialog = await findDialog('New Report');
      enter(dialog, 'Report Title', 'Car Rental');
      press(dialog, 'Expense');
    },
    submit: 'Submit',
    endpoint: api.createReport,
    label: 'Report Title',
    field: 'title',
    messages: ['Title is already in use', 'Title must not end with a period'],
    unknown: { field: 'owner', message: 'Owner is not active' },
  },
  {
    path: '/reports/expense/12',
    category: 'user',
    name: /^12\/2024 EX: London Trip/,
    fill: async () => {
      await clickControl('Add Expense');
      const dialog = await findDialog(/^New Expense/);
      await choose(dialog, /Expense Type/, 'Restaurant');
      enter(dialog, /^Title/, 'Team lunch');
      enter(dialog, 'Amount', '18.5');
    },
    submit: 'Save',
    endpoint: api.createLine,
    label: /^Title/,
    field: 'title',
    messages: ['Title is already in use on this report', 'Title must not end with a period'],
    unknown: { field: 'receipt', message: 'Receipt number is required' },
  },
];

describe('server field errors', () => {
  it.each(SERVER_ERROR_CASES)(
    '$path shows every server field error',
    async ({ path, category, name, fill, submit, endpoint, label, field, messages, unknown }) => {
      renderRoute(path, category);
      expect(await heading(name)).toBeInTheDocument();
      vi.mocked(endpoint).mockRejectedValueOnce(
        new ApiError(422, 'VALIDATION_FAILED', messages[0], [
          { field, message: messages[0] },
          { field, message: messages[1] },
          unknown,
        ]),
      );
      await fill();
      await clickControl(submit);

      const toast = await screen.findByRole('alert', {}, { timeout: FIND_TIMEOUT });
      const details = within(toast).getAllByRole('listitem').map((item) => item.textContent);
      expect(details).toEqual([unknown.message]);
      expect(toast).not.toHaveTextContent(`${unknown.field}:`);
      expect(toast).not.toHaveTextContent(messages[1]);
      const helperId = screen.getByLabelText(label).getAttribute('aria-describedby') ?? '';
      const helper = document.getElementById(helperId);
      expect(helper?.textContent).toBe(messages.join('\n'));
      expect(helper && getComputedStyle(helper).whiteSpace).toBe('pre-line');
      expect(screen.getByLabelText(label)).toHaveFocus();
    },
    TEST_TIMEOUT,
  );
});

async function defaultRateLoaded(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Exchange Rate USD/EUR')).toHaveValue(REFERENCE.dollarsToEuros), {
    timeout: FIND_TIMEOUT,
  });
}

function submitButton(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

type ValidationFocusCase = {
  path: string;
  category: SessionCategory;
  name: string;
  fill: () => Promise<void>;
  submit: string;
  focused: string | RegExp;
};

const VALIDATION_FOCUS_CASES: ValidationFocusCase[] = [
  {
    path: '/login',
    category: 'anonymous',
    name: 'Login',
    fill: () => fillField(/^Username/, 'em_user1'),
    submit: 'Login',
    focused: /^Password/,
  },
  {
    path: '/tools/usd-to-eur',
    category: 'user',
    name: 'USD/EUR Currency Converter',
    fill: defaultRateLoaded,
    submit: 'Convert',
    focused: 'USD Amount',
  },
  {
    path: '/tools/usd-to-eur',
    category: 'user',
    name: 'USD/EUR Currency Converter',
    fill: async () => {
      await defaultRateLoaded();
      await fillField('USD Amount', '100');
      await fillField('Exchange Rate USD/EUR', '0');
    },
    submit: 'Convert',
    focused: 'Exchange Rate USD/EUR',
  },
  {
    path: '/tools/mileage',
    category: 'user',
    name: 'Mileage Reimbursement',
    fill: () => fillField('Mileage', '-5'),
    submit: 'Convert',
    focused: 'Mileage',
  },
  {
    path: '/blog/posts/new',
    category: 'administrator',
    name: 'New Blog Post',
    fill: async () => undefined,
    submit: 'Save',
    focused: /^Title/,
  },
  {
    path: '/blog/posts/new',
    category: 'administrator',
    name: 'New Blog Post',
    fill: async () => {
      await fillField(/^Title/, 'Quarterly update');
      await fillField('Description', 'x'.repeat(10_001));
    },
    submit: 'Save',
    focused: 'Description',
  },
];

describe('focus after a failed submit', () => {
  it.each(VALIDATION_FOCUS_CASES)(
    '$path focuses $focused when client validation fails',
    async ({ path, category, name, fill, submit, focused }) => {
      renderRoute(path, category);
      expect(await heading(name)).toBeInTheDocument();
      await fill();
      const button = submitButton(submit);
      button.focus();
      fireEvent.click(button);

      await waitFor(() => expect(screen.getByLabelText(focused)).toHaveFocus());
      expect(screen.getByLabelText(focused)).toHaveAttribute('aria-invalid', 'true');
    },
    TEST_TIMEOUT,
  );

  it.each([
    {
      failure: 'a 401',
      error: new ApiError(401, 'BAD_CREDENTIALS', MESSAGES.BAD_CREDENTIALS),
      message: MESSAGES.BAD_CREDENTIALS,
      focused: /^Password/,
    },
    {
      failure: 'a network error',
      error: new TypeError('Failed to fetch'),
      message: MESSAGES.GENERIC_ERROR,
      focused: /^Password/,
    },
    {
      failure: 'a 422 on the username',
      error: new ApiError(422, 'VALIDATION_FAILED', MESSAGES.MAX_LENGTH_50, [
        { field: 'username', message: MESSAGES.MAX_LENGTH_50 },
      ]),
      message: MESSAGES.MAX_LENGTH_50,
      focused: /^Username/,
    },
  ])(
    'login focuses $focused after $failure',
    async ({ error, message, focused }) => {
      renderRoute('/login', 'anonymous');
      expect(await heading('Login')).toBeInTheDocument();
      vi.mocked(api.login).mockRejectedValueOnce(error);
      await fillField(/^Username/, 'em_user1');
      await fillField(/^Password/, 'wrong');
      const button = submitButton('Login');
      button.focus();
      fireEvent.click(button);

      expect(await screen.findByRole('alert', {}, { timeout: FIND_TIMEOUT })).toHaveTextContent(message);
      await waitFor(() => expect(screen.getByLabelText(focused)).toHaveFocus());
    },
    TEST_TIMEOUT,
  );
});

type RestoreFocusCase = {
  path: string;
  category: SessionCategory;
  name: string;
  fill: () => Promise<void>;
  submit: string;
  endpoint: typeof api.createBlogPost | typeof api.usdToEur | typeof api.mileage;
  outcome: 'success' | 'a server error';
};

const USD_FILL = async () => {
  await defaultRateLoaded();
  await fillField('USD Amount', '100');
};

const RESTORE_FOCUS_CASES: RestoreFocusCase[] = [
  {
    path: '/tools/usd-to-eur',
    category: 'user',
    name: 'USD/EUR Currency Converter',
    fill: USD_FILL,
    submit: 'Convert',
    endpoint: api.usdToEur,
    outcome: 'success',
  },
  {
    path: '/tools/usd-to-eur',
    category: 'user',
    name: 'USD/EUR Currency Converter',
    fill: USD_FILL,
    submit: 'Convert',
    endpoint: api.usdToEur,
    outcome: 'a server error',
  },
  {
    path: '/tools/mileage',
    category: 'user',
    name: 'Mileage Reimbursement',
    fill: () => fillField('Mileage', '10'),
    submit: 'Convert',
    endpoint: api.mileage,
    outcome: 'success',
  },
  {
    path: '/tools/mileage',
    category: 'user',
    name: 'Mileage Reimbursement',
    fill: () => fillField('Mileage', '10'),
    submit: 'Convert',
    endpoint: api.mileage,
    outcome: 'a server error',
  },
  {
    path: '/blog/posts/new',
    category: 'administrator',
    name: 'New Blog Post',
    fill: () => fillField(/^Title/, 'Quarterly update'),
    submit: 'Save',
    endpoint: api.createBlogPost,
    outcome: 'a server error',
  },
];

describe('focus after a request', () => {
  // The browser blurs the disabled loading button, so each click starts with focus on body.
  it.each(RESTORE_FOCUS_CASES)(
    '$path returns focus to $submit after $outcome',
    async ({ path, category, name, fill, submit, endpoint, outcome }) => {
      renderRoute(path, category);
      expect(await heading(name)).toBeInTheDocument();
      if (outcome !== 'success') {
        vi.mocked(endpoint).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', MESSAGES.GENERIC_ERROR));
      }
      await fill();
      const button = submitButton(submit);
      expect(document.body).toHaveFocus();
      fireEvent.click(button);

      await waitFor(() => expect(button).toHaveFocus(), { timeout: FIND_TIMEOUT });
      if (outcome !== 'success') {
        expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.GENERIC_ERROR);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'leaves focus in Mileage when the user edits it during a conversion',
    async () => {
      renderRoute('/tools/mileage', 'user');
      expect(await heading('Mileage Reimbursement')).toBeInTheDocument();
      let resolve: (result: MileageResult) => void = () => undefined;
      vi.mocked(api.mileage).mockReturnValueOnce(new Promise<MileageResult>((done) => (resolve = done)));
      await fillField('Mileage', '10');
      fireEvent.click(submitButton('Convert'));
      await waitFor(() => expect(submitButton('Convert')).toBeDisabled());

      const field = screen.getByLabelText('Mileage');
      field.focus();
      fireEvent.change(field, { target: { value: '12' } });
      await waitFor(() => expect(submitButton('Convert')).toBeEnabled());
      await act(async () => resolve(MILEAGE_RESULT));

      expect(field).toHaveFocus();
      expect(screen.getByLabelText('Result in EUR')).toHaveValue('');
    },
    TEST_TIMEOUT,
  );
});

function setBadInput(field: HTMLElement, badInput: boolean): void {
  Object.defineProperty(field, 'validity', { configurable: true, value: { badInput } });
  fireEvent.input(field);
}

describe('number fields with unparsable text', () => {
  it.each([
    { path: '/tools/usd-to-eur', name: 'USD/EUR Currency Converter', label: 'USD Amount' },
    { path: '/tools/usd-to-eur', name: 'USD/EUR Currency Converter', label: 'Exchange Rate USD/EUR' },
    { path: '/tools/mileage', name: 'Mileage Reimbursement', label: 'Mileage' },
  ])(
    '$path keeps the $label label raised while its text is unparsable',
    async ({ path, name, label }) => {
      renderRoute(path, 'user');
      expect(await heading(name)).toBeInTheDocument();
      if (path === '/tools/usd-to-eur') {
        await defaultRateLoaded();
      }
      const field = screen.getByLabelText(label);
      fireEvent.change(field, { target: { value: '' } });
      const fieldLabel = document.querySelector(`label[for="${field.id}"]`);
      const legend = field.parentElement?.querySelector('legend');
      const notchWidth = () => (legend ? getComputedStyle(legend).maxWidth : null);
      expect(fieldLabel).toHaveAttribute('data-shrink', 'false');
      expect(notchWidth()).toBe('0.01px');

      setBadInput(field, true);
      await waitFor(() => expect(fieldLabel).toHaveAttribute('data-shrink', 'true'));
      expect(field).toHaveValue(null);
      expect(notchWidth()).toBe('100%');

      setBadInput(field, false);
      await waitFor(() => expect(fieldLabel).toHaveAttribute('data-shrink', 'false'));
      expect(notchWidth()).toBe('0.01px');
    },
    TEST_TIMEOUT,
  );
});

describe('converter default rate', () => {
  it.each([
    { outcome: 'loads', rate: REFERENCE.dollarsToEuros, toast: null },
    { outcome: 'fails', rate: null, toast: MESSAGES.GENERIC_ERROR },
  ])(
    'disables the rate and Convert until the default rate $outcome',
    async ({ outcome, rate, toast }) => {
      renderRoute('/tools/usd-to-eur', 'user');
      let settle: { resolve: (data: ReferenceData) => void; reject: (err: unknown) => void } | null = null;
      vi.mocked(api.reference).mockReturnValueOnce(
        new Promise<ReferenceData>((resolve, reject) => (settle = { resolve, reject })),
      );
      expect(await heading('USD/EUR Currency Converter')).toBeInTheDocument();
      await waitFor(() => expect(api.reference).toHaveBeenCalled(), { timeout: FIND_TIMEOUT });
      const rateField = screen.getByLabelText('Exchange Rate USD/EUR');
      const loadingRate = { name: 'Loading exchange rate' };
      expect(screen.getByRole('progressbar', loadingRate)).toBeInTheDocument();
      expect(rateField).toBeDisabled();
      expect(rateField).toHaveValue(null);
      expect(submitButton('Convert')).toBeDisabled();

      await act(async () => {
        if (outcome === 'loads') {
          settle?.resolve(REFERENCE);
        } else {
          settle?.reject(new ApiError(500, 'INTERNAL_ERROR', MESSAGES.GENERIC_ERROR));
        }
      });

      expect(screen.queryByRole('progressbar', loadingRate)).toBeNull();
      expect(rateField).toBeEnabled();
      expect(rateField).toHaveValue(rate);
      expect(submitButton('Convert')).toBeEnabled();
      if (toast === null) {
        expect(screen.queryByRole('alert')).toBeNull();
      } else {
        expect(screen.getByRole('alert')).toHaveTextContent(toast);
      }
    },
    TEST_TIMEOUT,
  );

  it.each(SERVER_ERROR_CASES)(
    '$path shows a server error with no placeable field once',
    async ({ path, category, name, fill, submit, endpoint, unknown }) => {
      renderRoute(path, category);
      expect(await heading(name)).toBeInTheDocument();
      vi.mocked(endpoint).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_FAILED', unknown.message, [unknown]));
      await fill();
      await clickControl(submit);

      const toast = await screen.findByRole('alert', {}, { timeout: FIND_TIMEOUT });
      expect(toast.textContent).toBe(unknown.message);
      expect(within(toast).queryAllByRole('listitem')).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );
});

const LONDON_TRIP = /^12\/2024 EX: London Trip/;
const REPORT_CODE = /^\d+\/\d{4} E[XA]$/;
const STATUS_LABEL = /^(Draft|Submitted|Approved|Declined)$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const DEFAULT_LIST_QUERY = {
  kind: 'expense',
  from: '2023-01-01T00:00:00',
  to: expect.stringMatching(LOCAL_DATE_TIME),
};
const ANY_SIGNAL = expect.any(AbortSignal);
const DRAFT_BANNER = 'You have reports with Draft status, this reports are not considered for statistics';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type CallResult<R> = { type: 'return'; value: Promise<R> } | { type: 'throw' | 'incomplete' };

async function lastAnswer<R>(results: readonly CallResult<R>[]): Promise<R> {
  const last = results.at(-1);
  if (last?.type !== 'return') {
    throw new Error('The endpoint has not answered yet');
  }
  return last.value;
}

function currentPath(): string | null {
  return screen.getByTestId('location').textContent;
}

async function findDialog(name: string | RegExp): Promise<HTMLElement> {
  return screen.findByRole('dialog', { name }, { timeout: FIND_TIMEOUT });
}

async function dialogClosed(): Promise<void> {
  await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(), { timeout: FIND_TIMEOUT });
}

async function toast(text: string): Promise<HTMLElement> {
  return waitFor(
    () => {
      const alert = screen.queryAllByRole('alert').find((candidate) => candidate.textContent?.includes(text));
      if (alert === undefined) {
        throw new Error(`No alert says "${text}"`);
      }
      return alert;
    },
    { timeout: FIND_TIMEOUT },
  );
}

function alertTexts(): (string | null)[] {
  return screen.queryAllByRole('alert', { hidden: true }).map((alert) => alert.textContent);
}

function enter(container: HTMLElement, label: string | RegExp, value: string): void {
  fireEvent.change(within(container).getByLabelText(label), { target: { value } });
}

function press(container: HTMLElement, name: string | RegExp): void {
  fireEvent.click(within(container).getByRole('button', { name }));
}

async function choose(container: HTMLElement, label: RegExp, option: string): Promise<void> {
  fireEvent.mouseDown(within(container).getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }, { timeout: FIND_TIMEOUT }));
  // The open menu hides everything else from role queries until it has gone.
  await waitFor(
    () => expect(within(container).getByRole('combobox', { name: label })).toHaveTextContent(option),
    { timeout: FIND_TIMEOUT },
  );
}

function lineRow(table: HTMLElement, title: string): HTMLElement {
  return within(table).getByRole('row', { name: (name) => name.includes(title) });
}

function lineTitles(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).queryAllByRole('cell')[1]?.textContent ?? '');
}

function shownCodes(): (string | null)[] {
  return screen.queryAllByText(REPORT_CODE).map((code) => code.textContent);
}

function reportStatus(): string | null {
  const title = screen.getByRole('heading', { level: 1 });
  return within(title.parentElement ?? title).getByText(STATUS_LABEL).textContent;
}

async function expandReport(code: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByText(code, {}, { timeout: FIND_TIMEOUT }));
  return screen.findByRole('region', { name: (name) => name.includes(code) }, { timeout: FIND_TIMEOUT });
}

function kpiCard(label: string): HTMLElement {
  const title = screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === label);
  const card = title.closest<HTMLElement>('.MuiCard-root');
  if (card === null) {
    throw new Error(`"${label}" is not inside a card`);
  }
  return card;
}

function expectKpi(label: string, value: string, caption: string): void {
  const card = kpiCard(label);
  expect(within(card).getByText(value)).toBeInTheDocument();
  expect(within(card).getByText(caption)).toBeInTheDocument();
}

async function openNewReport(): Promise<HTMLElement> {
  renderRoute('/reports', 'user');
  expect(await heading('Reports')).toBeInTheDocument();
  await clickControl('New Report');
  return findDialog('New Report');
}

type CreateCase = { type: string; kind: Kind; title: string; created: ReportDetail };

const CREATE_CASES: CreateCase[] = [
  {
    type: 'Expense',
    kind: 'expense',
    title: 'Car Rental',
    created: {
      ...REPORT_DETAILS['expense/12'],
      id: 13,
      code: '13/2024 EX',
      title: 'Car Rental',
      totalEur: 0,
      vatTotal: 0,
      lines: [],
    },
  },
  {
    type: 'Earning',
    kind: 'earning',
    title: 'Speaking Fees',
    created: {
      ...REPORT_DETAILS['earning/10'],
      id: 11,
      code: '11/2024 EA',
      title: 'Speaking Fees',
      status: 'Draft',
      submitedOn: null,
      totalEur: 0,
      vatTotal: 0,
      lines: [],
    },
  },
];

describe('report creation', () => {
  it(
    'asks for a title and a report type before calling the API',
    async () => {
      const dialog = await openNewReport();
      enter(dialog, 'Report Title', '   ');
      press(dialog, 'Submit');

      expect(await within(dialog).findByText(MESSAGES.INSERT_TITLE)).toBeInTheDocument();
      expect(within(dialog).getByText(MESSAGES.SELECT_REPORT_TYPE)).toBeInTheDocument();
      expect(api.createReport).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT,
  );

  it.each(CREATE_CASES)(
    'creates a trimmed $type report and opens it',
    async ({ type, kind, title, created }) => {
      const dialog = await openNewReport();
      const reply = deferred<ReportSummary>();
      vi.mocked(api.createReport).mockReturnValueOnce(reply.promise);
      vi.mocked(api.getReport).mockResolvedValueOnce(created);
      enter(dialog, 'Report Title', `  ${title}  `);
      press(dialog, type);
      press(dialog, 'Submit');

      expect(within(dialog).getByRole('button', { name: 'Submit' })).toBeDisabled();
      expect(within(dialog).getByLabelText('Report Title')).toBeDisabled();
      expect(api.createReport).toHaveBeenCalledExactlyOnceWith({ kind, title });
      expect(currentPath()).toBe('/reports');

      reply.resolve(created);
      await arriveAt(`/reports/${kind}/${created.id}`, new RegExp(`^${created.code}: ${title}`));
      await dialogClosed();
      expect(api.getReport).toHaveBeenCalledExactlyOnceWith(kind, created.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'keeps the dialog open with the server message when creation fails',
    async () => {
      const dialog = await openNewReport();
      vi.mocked(api.createReport).mockRejectedValueOnce(new ApiError(409, 'CODE_CONFLICT', MESSAGES.GENERIC_ERROR));
      enter(dialog, 'Report Title', 'Car Rental');
      press(dialog, 'Expense');
      press(dialog, 'Submit');

      expect(await toast(MESSAGES.GENERIC_ERROR)).toBeInTheDocument();
      expect(api.createReport).toHaveBeenCalledExactlyOnceWith({ kind: 'expense', title: 'Car Rental' });
      expect(await findDialog('New Report')).toBe(dialog);
      expect(within(dialog).getByRole('button', { name: 'Submit' })).toBeEnabled();
      expect(within(dialog).getByLabelText('Report Title')).toHaveValue('Car Rental');
      expect(currentPath()).toBe('/reports');
    },
    TEST_TIMEOUT,
  );

  it(
    'closes on Cancel without creating a report',
    async () => {
      const dialog = await openNewReport();
      enter(dialog, 'Report Title', 'Car Rental');
      press(dialog, 'Cancel');

      await dialogClosed();
      expect(api.createReport).not.toHaveBeenCalled();
      expect(currentPath()).toBe('/reports');
    },
    TEST_TIMEOUT,
  );
});

const LINE_TEXT = { title: 'Team lunch', description: 'Lunch with the project team', date: '2024-05-20' };

type LineCase = {
  line: string;
  kind: Kind;
  id: number;
  name: RegExp;
  type: string;
  currency: 'EUR' | 'USD' | null;
  field: 'Amount' | 'Distance';
  value: string;
  body: LineBody;
  added: string;
  shown: string;
};

const LINE_CASES: LineCase[] = [
  {
    line: 'a euro expense',
    kind: 'expense',
    id: 12,
    name: LONDON_TRIP,
    type: 'Restaurant',
    currency: 'EUR',
    field: 'Amount',
    value: '18.5',
    body: { expenseTypeId: 1, currencyId: 1, amount: 18.5, ...LINE_TEXT },
    added: 'Expense was added',
    shown: '€ 18,50',
  },
  {
    line: 'a dollar expense',
    kind: 'expense',
    id: 12,
    name: LONDON_TRIP,
    type: 'Travel',
    currency: 'USD',
    field: 'Amount',
    value: '100',
    body: { expenseTypeId: 2, currencyId: 2, amount: 100, ...LINE_TEXT },
    added: 'Expense was added',
    shown: '€ 90,00',
  },
  {
    line: 'a Kilometers expense',
    kind: 'expense',
    id: 12,
    name: LONDON_TRIP,
    type: 'Kilometers',
    currency: null,
    field: 'Distance',
    value: '12',
    body: { expenseTypeId: 3, currencyId: 1, amount: null, kilometers: 12, ...LINE_TEXT },
    added: 'Expense was added',
    shown: '€ 6,00',
  },
  {
    line: 'an earning',
    kind: 'earning',
    id: 4,
    name: /^4\/2024 EA: Miscellaneous Income/,
    type: 'Salary',
    currency: 'EUR',
    field: 'Amount',
    value: '250',
    body: { earningTypeId: 1, currencyId: 1, amount: 250, ...LINE_TEXT },
    added: 'Earning was added',
    shown: '€ 250,00',
  },
];

const UPLOAD_CASES = [
  { outcome: 'accepted', failure: null, fileError: null },
  {
    outcome: 'rejected',
    failure: new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', MESSAGES.FILE_TYPE_NOT_SUPPORTED),
    fileError: MESSAGES.FILE_TYPE_NOT_SUPPORTED,
  },
];

describe('line forms', () => {
  it.each(LINE_CASES)(
    'adds $line and reloads the report with it',
    async ({ kind, id, name, type, currency, field, value, body, added, shown }) => {
      const noun = kind === 'expense' ? 'Expense' : 'Earning';
      renderRoute(`/reports/${kind}/${id}`, 'user');
      expect(await heading(name)).toBeInTheDocument();
      const report = await lastAnswer(vi.mocked(api.getReport).mock.results);
      vi.mocked(api.getReport).mockImplementationOnce(async () => ({
        ...report,
        lines: [...report.lines, await lastAnswer(vi.mocked(api.createLine).mock.results)],
      }));

      await clickControl(`Add ${noun}`);
      const dialog = await findDialog(new RegExp(`^New ${noun}`));
      enter(dialog, 'Date', body.date);
      await choose(dialog, new RegExp(`${noun} Type`), type);
      enter(dialog, /^Title/, body.title);
      enter(dialog, 'Description', body.description);
      if (currency !== null) {
        press(dialog, currency);
      }
      enter(dialog, field, value);
      press(dialog, 'Save');

      expect(await toast(added)).toBeInTheDocument();
      expect(api.createLine).toHaveBeenCalledExactlyOnceWith(kind, id, body);
      expect(api.uploadInvoice).not.toHaveBeenCalled();
      await dialogClosed();
      const table = screen.getByRole('table', { name: `${noun}s` });
      await waitFor(() => expect(lineRow(table, body.title)).toHaveTextContent(shown), { timeout: FIND_TIMEOUT });
      expect(api.getReport).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'edits a line from its current values and reloads the new amount',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      const report = await lastAnswer(vi.mocked(api.getReport).mock.results);
      vi.mocked(api.getReport).mockImplementationOnce(async () => ({
        ...report,
        lines: [await lastAnswer(vi.mocked(api.updateLine).mock.results)],
      }));
      const table = screen.getByRole('table', { name: 'Expenses' });
      fireEvent.click(within(lineRow(table, 'Flight tickets')).getByRole('button', { name: 'Edit' }));

      const dialog = await findDialog('Edit Details');
      expect(within(dialog).getByLabelText('Date')).toHaveValue('2024-05-21');
      expect(within(dialog).getByRole('combobox', { name: /Expense Type/ })).toHaveTextContent('Travel');
      expect(within(dialog).getByLabelText(/^Title/)).toHaveValue('Flight tickets');
      expect(within(dialog).getByLabelText('Description')).toHaveValue('Tickets for flight to London');
      expect(within(dialog).getByLabelText('Amount')).toHaveValue(42);
      enter(dialog, 'Amount', '55.5');
      press(dialog, 'Save');

      expect(await toast('Your expense detail was successfully edited')).toBeInTheDocument();
      expect(api.updateLine).toHaveBeenCalledExactlyOnceWith('expense', 121, {
        expenseTypeId: 2,
        currencyId: 1,
        amount: 55.5,
        title: 'Flight tickets',
        description: 'Tickets for flight to London',
        date: '2024-05-21',
      });
      expect(api.createLine).not.toHaveBeenCalled();
      await dialogClosed();
      await waitFor(() => expect(lineRow(table, 'Flight tickets')).toHaveTextContent('€ 55,50'), {
        timeout: FIND_TIMEOUT,
      });
    },
    TEST_TIMEOUT,
  );

  it.each(UPLOAD_CASES)(
    'uploads the invoice to the saved line and reloads it when the file is $outcome',
    async ({ failure, fileError }) => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      vi.mocked(api.createLine).mockResolvedValueOnce({ ...REPORT_DETAILS['expense/12'].lines[0], id: 777 });
      vi.mocked(api.uploadInvoice).mockImplementationOnce(async () => {
        if (failure !== null) {
          throw failure;
        }
      });
      const invoice = new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' });

      await clickControl('Add Expense');
      const dialog = await findDialog(/^New Expense/);
      await choose(dialog, /Expense Type/, 'Restaurant');
      enter(dialog, /^Title/, 'Team lunch');
      enter(dialog, 'Amount', '18.5');
      fireEvent.change(within(dialog).getByLabelText('browse'), { target: { files: [invoice] } });
      expect(within(dialog).getByText('Selected file: receipt.pdf')).toBeInTheDocument();
      press(dialog, 'Save');

      await toast('Expense was added');
      expect(alertTexts()).toEqual(['Expense was added']);
      expect(api.uploadInvoice).toHaveBeenCalledExactlyOnceWith('expense', 777, invoice);
      await waitFor(() => expect(api.getReport).toHaveBeenCalledTimes(2), { timeout: FIND_TIMEOUT });
      if (fileError === null) {
        await dialogClosed();
      } else {
        expect(dialog).toHaveAccessibleName('Edit Details');
        expect(within(dialog).getByText(fileError)).toBeInTheDocument();
      }
    },
    TEST_TIMEOUT,
  );
});

type DecisionCase = {
  button: string;
  kind: Kind;
  id: number;
  name: RegExp;
  accept: boolean;
  status: StatusLabel;
  message: string;
};

const DETAIL_DECISION_CASES: DecisionCase[] = [
  {
    button: 'Approve Report',
    kind: 'expense',
    id: 7,
    name: /^7\/2024 EX: Household Expenses/,
    accept: true,
    status: 'Approved',
    message: 'Expense report was approved',
  },
  {
    button: 'Decline Report',
    kind: 'earning',
    id: 9,
    name: /^9\/2024 EA: Consulting Fees/,
    accept: false,
    status: 'Declined',
    message: 'Earning report was declined',
  },
];

describe('report actions', () => {
  it(
    'submits a Draft report, holding the controls until the server answers',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      const report = await lastAnswer(vi.mocked(api.getReport).mock.results);
      const reply = deferred<ReportSummary>();
      vi.mocked(api.submitReport).mockReturnValueOnce(reply.promise);
      vi.mocked(api.getReport).mockResolvedValueOnce({ ...report, status: 'Submitted' });
      fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));

      expect(screen.getByRole('button', { name: 'Submit Report' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete Report' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add Expense' })).toBeDisabled();
      expect(api.submitReport).toHaveBeenCalledExactlyOnceWith('expense', 12);

      reply.resolve({ ...report, status: 'Submitted' });
      expect(await toast('Expense report was submitted')).toBeInTheDocument();
      await waitFor(() => expect(reportStatus()).toBe('Submitted'), { timeout: FIND_TIMEOUT });
      expect(screen.queryByRole('button', { name: 'Submit Report' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete Report' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add Expense' })).toBeNull();
      const table = screen.getByRole('table', { name: 'Expenses' });
      expect(within(table).queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(api.getReport).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'keeps a report in Draft when the server refuses the submission',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      vi.mocked(api.submitReport).mockRejectedValueOnce(new ApiError(422, 'NO_LINES', MESSAGES.NO_LINES));
      fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));

      expect(await toast(MESSAGES.NO_LINES)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Submit Report' })).toBeEnabled(), {
        timeout: FIND_TIMEOUT,
      });
      expect(reportStatus()).toBe('Draft');
      expect(api.submitReport).toHaveBeenCalledExactlyOnceWith('expense', 12);
      expect(api.getReport).toHaveBeenCalledTimes(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'deletes a report only once the deletion is confirmed',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Delete Report' }));
      press(await findDialog('Delete Report'), 'Cancel');
      await dialogClosed();
      expect(api.deleteReport).not.toHaveBeenCalled();

      const reply = deferred<void>();
      vi.mocked(api.deleteReport).mockReturnValueOnce(reply.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Report' }));
      const confirm = await findDialog('Delete Report');
      press(confirm, 'Yes, delete it');

      expect(within(confirm).getByRole('button', { name: 'Yes, delete it' })).toBeDisabled();
      expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(currentPath()).toBe('/reports/expense/12');

      reply.resolve();
      expect(await toast('Expense report was deleted')).toBeInTheDocument();
      await arriveAt('/reports', 'Reports');
      expect(api.deleteReport).toHaveBeenCalledExactlyOnceWith('expense', 12);
    },
    TEST_TIMEOUT,
  );

  it(
    'deletes a line once confirmed and reloads the report without it',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      const report = await lastAnswer(vi.mocked(api.getReport).mock.results);
      vi.mocked(api.getReport).mockResolvedValueOnce({ ...report, totalEur: 0, vatTotal: 0, lines: [] });
      const table = screen.getByRole('table', { name: 'Expenses' });
      fireEvent.click(within(lineRow(table, 'Flight tickets')).getByRole('button', { name: 'Delete' }));
      press(await findDialog('Delete Expense'), 'Yes, delete it');

      expect(await toast('Expense was deleted')).toBeInTheDocument();
      expect(api.deleteLine).toHaveBeenCalledExactlyOnceWith('expense', 121);
      await dialogClosed();
      expect(await within(table).findByText('No records available', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(within(kpiCard('Total Expenses')).getByText('€ 0,00')).toBeInTheDocument();
      expect(api.getReport).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'keeps a line the server refuses to delete',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      vi.mocked(api.deleteLine).mockRejectedValueOnce(
        new ApiError(409, 'NOT_DRAFT', MESSAGES.DETAIL_CANT_BE_DELETED),
      );
      const table = screen.getByRole('table', { name: 'Expenses' });
      fireEvent.click(within(lineRow(table, 'Flight tickets')).getByRole('button', { name: 'Delete' }));
      press(await findDialog('Delete Expense'), 'Yes, delete it');

      expect(await toast(MESSAGES.DETAIL_CANT_BE_DELETED)).toBeInTheDocument();
      expect(api.deleteLine).toHaveBeenCalledExactlyOnceWith('expense', 121);
      await dialogClosed();
      await waitFor(() => expect(api.getReport).toHaveBeenCalledTimes(2), { timeout: FIND_TIMEOUT });
      expect(lineRow(table, 'Flight tickets')).toHaveTextContent('€ 42,00');
    },
    TEST_TIMEOUT,
  );

  it.each(DETAIL_DECISION_CASES)(
    '$button sends the decision and reloads the report as $status',
    async ({ button, kind, id, name, accept, status, message }) => {
      renderRoute(`/admin/reports/${kind}/${id}`, 'administrator');
      expect(await heading(name)).toBeInTheDocument();
      const report = await lastAnswer(vi.mocked(api.getReport).mock.results);
      const reply = deferred<ReportSummary>();
      vi.mocked(api.decideReport).mockReturnValueOnce(reply.promise);
      vi.mocked(api.getReport).mockResolvedValueOnce({ ...report, status });
      fireEvent.click(screen.getByRole('button', { name: button }));

      expect(screen.getByRole('button', { name: 'Approve Report' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Decline Report' })).toBeDisabled();
      expect(api.decideReport).toHaveBeenCalledExactlyOnceWith(kind, id, accept);

      reply.resolve({ ...report, status });
      expect(await toast(message)).toBeInTheDocument();
      await waitFor(() => expect(reportStatus()).toBe(status), { timeout: FIND_TIMEOUT });
      expect(screen.queryByRole('button', { name: 'Approve Report' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Decline Report' })).toBeNull();
      expect(api.getReport).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'approves from the administrator list, then reloads the list and the counters',
    async () => {
      renderRoute('/admin', 'administrator');
      expect(await heading('Administrator Dashboard')).toBeInTheDocument();
      const region = await expandReport('7/2024 EX');
      await within(region).findByRole('table', { name: 'Expenses of 7/2024 EX' }, { timeout: FIND_TIMEOUT });
      const reply = deferred<ReportSummary>();
      vi.mocked(api.decideReport).mockReturnValueOnce(reply.promise);
      vi.mocked(api.listReports).mockResolvedValueOnce(
        ADMIN_EXPENSE_ROWS.map((row) => (row.id === 7 ? { ...row, status: 'Approved' } : row)),
      );
      vi.mocked(api.adminDashboard).mockResolvedValueOnce({ totalReports: 17, waiting: 14, approvedRate: 11.76 });
      press(region, 'Approve');

      expect(within(region).getByRole('button', { name: 'Approve' })).toBeDisabled();
      expect(within(region).getByRole('button', { name: 'Decline' })).toBeDisabled();
      expect(api.decideReport).toHaveBeenCalledExactlyOnceWith('expense', 7, true);

      reply.resolve({ ...ADMIN_EXPENSE_ROWS[2], status: 'Approved' });
      expect(await toast('Expense report was approved')).toBeInTheDocument();
      await waitFor(() => expect(within(region).queryByRole('button', { name: 'Approve' })).toBeNull(), {
        timeout: FIND_TIMEOUT,
      });
      expect(screen.getByRole('button', { name: (name) => name.includes('7/2024 EX') })).toHaveTextContent(
        'Approved',
      );
      await waitFor(() => expect(within(kpiCard('Reports Waiting Verification')).getByText('14')).toBeInTheDocument(), {
        timeout: FIND_TIMEOUT,
      });
      expect(within(kpiCard('Approved Report Rate')).getByText('11.76%')).toBeInTheDocument();
      expect(api.adminDashboard).toHaveBeenCalledTimes(2);
      expect(api.listReports).toHaveBeenCalledTimes(2);
      expect(api.listReports).toHaveBeenLastCalledWith(DEFAULT_LIST_QUERY, ANY_SIGNAL);
    },
    TEST_TIMEOUT,
  );
});

const RECEIPT = { filename: 'receipt.png', contentType: 'image/png', uploadedOn: '2024-05-22T10:00:00' };

type ViewCase = {
  where: string;
  open: () => Promise<HTMLElement>;
  date: string;
  total: string;
  vat: string;
};

const NO_INVOICE_CASES: ViewCase[] = [
  {
    where: 'an owned report',
    open: async () => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Expenses' });
      fireEvent.click(within(lineRow(table, 'Flight tickets')).getByRole('button', { name: 'View' }));
      return findDialog('Flight tickets');
    },
    date: '2024-05-21',
    total: '€ 42,00',
    vat: 'VAT (23%): € 9,66',
  },
  {
    where: 'the administrator list',
    open: async () => {
      renderRoute('/admin', 'administrator');
      const region = await expandReport('9/2024 EX');
      const table = await within(region).findByRole(
        'table',
        { name: 'Expenses of 9/2024 EX' },
        { timeout: FIND_TIMEOUT },
      );
      fireEvent.click(within(lineRow(table, 'Dining Expenses')).getByRole('button', { name: 'View' }));
      return findDialog('Dining Expenses');
    },
    date: '2024-04-02',
    total: '€ 200,00',
    vat: 'VAT (23%): € 46,00',
  },
];

describe('line view', () => {
  it.each(NO_INVOICE_CASES)(
    'shows a line of $where with no invoice',
    async ({ open, date, total, vat }) => {
      const dialog = await open();
      expect(within(dialog).getByText(date)).toBeInTheDocument();
      expect(within(dialog).getByText(total)).toBeInTheDocument();
      expect(within(dialog).getByText(vat)).toBeInTheDocument();
      expect(within(dialog).getByText(MESSAGES.NO_INVOICE)).toBeInTheDocument();
      expect(within(dialog).queryByRole('link', { name: 'Download Invoice' })).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'previews and links the invoice of a line at its download address',
    async () => {
      renderRoute('/reports/expense/12', 'user');
      const report = REPORT_DETAILS['expense/12'];
      vi.mocked(api.getReport).mockResolvedValueOnce({
        ...report,
        lines: report.lines.map((line) => ({ ...line, invoice: RECEIPT })),
      });
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Expenses' });
      fireEvent.click(within(lineRow(table, 'Flight tickets')).getByRole('button', { name: 'View' }));

      const dialog = await findDialog('Flight tickets');
      expect(within(dialog).getByText('receipt.png')).toBeInTheDocument();
      expect(within(dialog).getByRole('img', { name: 'Invoice receipt.png' })).toHaveAttribute(
        'src',
        '/api/lines/expense/121/invoice',
      );
      expect(within(dialog).getByRole('link', { name: 'Download Invoice' })).toHaveAttribute(
        'href',
        '/api/lines/expense/121/invoice',
      );
      expect(within(dialog).queryByText(MESSAGES.NO_INVOICE)).toBeNull();
      expect(api.invoiceDownloadUrl).toHaveBeenCalledWith('expense', 121);
      expect(api.getReport).toHaveBeenCalledExactlyOnceWith('expense', 12);
    },
    TEST_TIMEOUT,
  );
});

type ListFilterCase = {
  filter: string;
  apply: () => Promise<void>;
  // For filters the fixture's listReports does not apply.
  answer?: (query: ReportListQuery) => ReportSummary[];
  query: Record<string, string>;
  calls: number;
  codes: string[];
};

const ALL_EXPENSE_CODES = EXPENSE_ROWS.map((row) => row.code);

function createdBetween({ from, to }: ReportListQuery): ReportSummary[] {
  return EXPENSE_ROWS.filter(
    (row) => (from === undefined || row.createdOn > from) && (to === undefined || row.createdOn <= to),
  );
}

const LIST_FILTER_CASES: ListFilterCase[] = [
  {
    filter: 'the Submited status',
    apply: () => clickControl('Submited'),
    query: { status: 'Submitted' },
    calls: 2,
    codes: ['3/2024 EX', '2/2024 EX', '1/2024 EX'],
  },
  {
    filter: 'a title search',
    apply: () => fillField('Search by title', 'trip'),
    query: { q: 'trip' },
    calls: 2,
    codes: ['12/2024 EX', '9/2024 EX'],
  },
  {
    filter: 'a date range',
    apply: async () => {
      await fillField('From', '2024-04-01');
      await fillField('To', '2024-04-30');
    },
    answer: createdBetween,
    query: { from: '2024-04-01T00:00:00', to: '2024-04-30T00:00:00' },
    calls: 2,
    codes: ['11/2024 EX', '10/2024 EX', '9/2024 EX'],
  },
];

type TypingCase = { typing: string; label: string; keystrokes: string[]; query: Record<string, string> | null };

// A browser date field reports the year as typed, digit by digit.
const TYPING_CASES: TypingCase[] = [
  {
    typing: 'a title one key at a time',
    label: 'Search by title',
    keystrokes: ['M', 'Ma', 'Man', 'Many'],
    query: { q: 'Many' },
  },
  {
    typing: 'the From year one digit at a time',
    label: 'From',
    keystrokes: ['0002-03-05', '0020-03-05', '0202-03-05', '2024-03-05'],
    query: { from: '2024-03-05T00:00:00' },
  },
  { typing: 'an incomplete From date', label: 'From', keystrokes: ['0002-03-05'], query: null },
];

// Longer than the list's typing pause, so any request the typing causes has been sent.
const PAST_TYPING_PAUSE_MS = 600;
// Shorter than the list's typing pause, while two of them are longer.
const BETWEEN_KEYS_MS = 200;

const DATE_CLEAR_FIELDS = [
  { label: 'From', bound: 'from', date: '2024-04-10', codes: ['12/2024 EX', '11/2024 EX', '10/2024 EX'] },
  {
    label: 'To',
    bound: 'to',
    date: '2024-04-15',
    codes: ['10/2024 EX', '9/2024 EX', '8/2024 EX', '3/2024 EX', '2/2024 EX', '1/2024 EX'],
  },
] as const;

// A browser date field sends no change event when its last segment is cleared, only keyup and blur follow.
const DATE_CLEAR_CASES = DATE_CLEAR_FIELDS.flatMap((field) =>
  (['keyUp', 'blur'] as const).map((reread) => ({ ...field, reread })),
);

function byTitle(sort: string | undefined): ReportSummary[] {
  const rows = [...EXPENSE_ROWS];
  if (sort === 'title,asc') {
    rows.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === 'title,desc') {
    rows.sort((a, b) => b.title.localeCompare(a.title));
  }
  return rows;
}

type SortCase = { control: string; sortBy: (direction: 'ascending' | 'descending') => Promise<void> };

const SORT_CASES: SortCase[] = [
  {
    control: 'the Title column header',
    sortBy: async () => {
      fireEvent.click(await screen.findByRole('button', { name: /^Title/ }, { timeout: FIND_TIMEOUT }));
    },
  },
  {
    control: 'the Sort by menu',
    // jsdom's 1024px window is a desktop one, where this small-screen menu is display: none.
    sortBy: async (direction) => {
      const menu = await screen.findByRole('combobox', { name: /Sort by/, hidden: true }, { timeout: FIND_TIMEOUT });
      fireEvent.mouseDown(menu);
      fireEvent.click(await screen.findByRole('option', { name: `Title, ${direction}` }, { timeout: FIND_TIMEOUT }));
    },
  },
];

function pagedLines(count: number): LineView[] {
  const [first] = REPORT_DETAILS['expense/9'].lines;
  return Array.from({ length: count }, (_, index) => ({ ...first, id: 900 + index, title: `Receipt ${index + 1}` }));
}

const PAGER_FOCUS_CASES = [
  {
    pager: 'administrator report list',
    path: '/admin',
    lines: null,
    first: '1 to 5 of 9 items',
    last: '6 to 9 of 9 items',
  },
  {
    pager: 'report line table',
    path: '/admin/reports/expense/9',
    lines: 11,
    first: '1 to 10 of 11 items',
    last: '11 to 11 of 11 items',
  },
] as const;

describe('browsing reports and lines', () => {
  it(
    'lists expense reports created from 2023-01-01 up to now by default',
    async () => {
      renderRoute('/reports', 'user');
      expect(await screen.findByText('1 to 8 of 8 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(shownCodes()).toEqual(ALL_EXPENSE_CODES);
      expect(api.listReports).toHaveBeenCalledExactlyOnceWith(DEFAULT_LIST_QUERY, ANY_SIGNAL);
      const [[query]] = vi.mocked(api.listReports).mock.calls;
      expect(Math.abs(new Date(query.to ?? '').getTime() - Date.now())).toBeLessThan(60_000);
    },
    TEST_TIMEOUT,
  );

  it.each(LIST_FILTER_CASES)(
    'filters the reports list by $filter',
    async ({ apply, answer, query, calls, codes }) => {
      renderRoute('/reports', 'user');
      if (answer !== undefined) {
        vi.mocked(api.listReports).mockImplementation(async (sent) => answer(sent));
      }
      expect(await screen.findByText('1 to 8 of 8 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      await apply();

      await waitFor(() => expect(shownCodes()).toEqual(codes), { timeout: FIND_TIMEOUT });
      expect(screen.getByText(`1 to ${codes.length} of ${codes.length} items`)).toBeInTheDocument();
      expect(api.listReports).toHaveBeenCalledTimes(calls);
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, ...query }, ANY_SIGNAL);
    },
    TEST_TIMEOUT,
  );

  it.each(TYPING_CASES)(
    'typing $typing sends at most one list request, for the last whole value',
    async ({ label, keystrokes, query }) => {
      renderRoute('/reports', 'user');
      expect(await screen.findByText('1 to 8 of 8 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      const field = screen.getByLabelText(label);
      for (const value of keystrokes) {
        fireEvent.change(field, { target: { value } });
      }
      await act(() => new Promise((resolve) => setTimeout(resolve, PAST_TYPING_PAUSE_MS)));

      expect(field).toHaveValue(keystrokes.at(-1));
      if (query === null) {
        expect(api.listReports).toHaveBeenCalledTimes(1);
        expect(shownCodes()).toEqual(ALL_EXPENSE_CODES);
      } else {
        expect(api.listReports).toHaveBeenCalledTimes(2);
        expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, ...query }, ANY_SIGNAL);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'waits out the typing pause after every keystroke, including one that leaves the date incomplete',
    async () => {
      renderRoute('/reports', 'user');
      expect(await screen.findByText('1 to 8 of 8 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      const field = screen.getByLabelText('From');
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const typeThenWait = async (value: string, pauseMs: number) => {
          fireEvent.change(field, { target: { value } });
          await act(async () => {
            vi.advanceTimersByTime(pauseMs);
          });
        };

        await typeThenWait('2023-03-01', BETWEEN_KEYS_MS);
        await typeThenWait('0002-03-05', BETWEEN_KEYS_MS);
        expect(api.listReports).toHaveBeenCalledTimes(1);

        await typeThenWait('2024-03-05', PAST_TYPING_PAUSE_MS);
        expect(api.listReports).toHaveBeenCalledTimes(2);
        expect(api.listReports).toHaveBeenLastCalledWith(
          { ...DEFAULT_LIST_QUERY, from: '2024-03-05T00:00:00' },
          ANY_SIGNAL,
        );
      } finally {
        vi.useRealTimers();
      }
    },
    TEST_TIMEOUT,
  );

  it.each(DATE_CLEAR_CASES)(
    'drops the $label bound once the field is wholly cleared, noticed on $reread',
    async ({ label, bound, date, codes, reread }) => {
      renderRoute('/reports', 'user');
      vi.mocked(api.listReports).mockImplementation(async (sent) => createdBetween(sent));
      expect(await screen.findByText('1 to 8 of 8 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      const field = screen.getByLabelText(label);
      const pastTypingPause = () => act(() => new Promise((resolve) => setTimeout(resolve, PAST_TYPING_PAUSE_MS)));

      fireEvent[reread](field);
      await pastTypingPause();
      expect(api.listReports).toHaveBeenCalledTimes(1);

      await fillField(label, date);
      await waitFor(() => expect(shownCodes()).toEqual(codes), { timeout: FIND_TIMEOUT });
      expect(api.listReports).toHaveBeenLastCalledWith(
        { ...DEFAULT_LIST_QUERY, [bound]: `${date}T00:00:00` },
        ANY_SIGNAL,
      );

      setBadInput(field, true);
      await fillField(label, '');
      fireEvent[reread](field);
      await pastTypingPause();
      expect(api.listReports).toHaveBeenCalledTimes(2);
      expect(shownCodes()).toEqual(codes);

      setBadInput(field, false);
      fireEvent[reread](field);
      await waitFor(() => expect(shownCodes()).toEqual(ALL_EXPENSE_CODES), { timeout: FIND_TIMEOUT });
      const cleared = { ...DEFAULT_LIST_QUERY, [bound]: undefined };
      expect(api.listReports).toHaveBeenCalledTimes(3);
      expect(api.listReports).toHaveBeenLastCalledWith(cleared, ANY_SIGNAL);

      await clickControl('Draft');
      await waitFor(() => expect(api.listReports).toHaveBeenCalledTimes(4), { timeout: FIND_TIMEOUT });
      expect(api.listReports).toHaveBeenLastCalledWith({ ...cleared, status: 'Draft' }, ANY_SIGNAL);
      expect(field).toHaveValue('');
    },
    TEST_TIMEOUT,
  );

  it(
    'aborts a superseded list request and keeps the rows of the newest',
    async () => {
      renderRoute('/reports', 'user');
      const superseded = deferred<ReportSummary[]>();
      vi.mocked(api.listReports).mockReturnValueOnce(superseded.promise);
      expect(await heading('Reports')).toBeInTheDocument();
      await waitFor(() => expect(api.listReports).toHaveBeenCalledTimes(1), { timeout: FIND_TIMEOUT });
      await clickControl('Submited');

      await waitFor(() => expect(shownCodes()).toEqual(['3/2024 EX', '2/2024 EX', '1/2024 EX']), {
        timeout: FIND_TIMEOUT,
      });
      const [[, abandoned], [, newest]] = vi.mocked(api.listReports).mock.calls;
      expect(abandoned?.aborted).toBe(true);
      expect(newest?.aborted).toBe(false);

      await act(async () => superseded.resolve(EXPENSE_ROWS));
      expect(shownCodes()).toEqual(['3/2024 EX', '2/2024 EX', '1/2024 EX']);
      expect(api.listReports).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT,
  );

  it.each(SORT_CASES)(
    'sorts the reports list by title through $control',
    async ({ sortBy }) => {
      renderRoute('/reports', 'user');
      vi.mocked(api.listReports).mockImplementation(async ({ sort }) => byTitle(sort));
      await waitFor(() => expect(shownCodes()).toEqual(ALL_EXPENSE_CODES), { timeout: FIND_TIMEOUT });

      await sortBy('ascending');
      await waitFor(() => expect(shownCodes()).toEqual(byTitle('title,asc').map((row) => row.code)), {
        timeout: FIND_TIMEOUT,
      });
      expect(shownCodes()[0]).toBe('2/2024 EX');
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, sort: 'title,asc' }, ANY_SIGNAL);

      await sortBy('descending');
      await waitFor(() => expect(shownCodes()[0]).toBe('3/2024 EX'), { timeout: FIND_TIMEOUT });
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, sort: 'title,desc' }, ANY_SIGNAL);
      expect(api.listReports).toHaveBeenCalledTimes(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'pages the administrator list five reports at a time and returns to page 1 on a new filter',
    async () => {
      renderRoute('/admin', 'administrator');
      expect(await screen.findByText('1 to 5 of 9 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(shownCodes()).toEqual(['9/2024 EX', '8/2024 EX', '7/2024 EX', '6/2024 EX', '5/2024 EX']);

      fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
      expect(await screen.findByText('6 to 9 of 9 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(shownCodes()).toEqual(['4/2024 EX', '3/2024 EX', '2/2024 EX', '1/2024 EX']);

      await clickControl('Submited');
      expect(await screen.findByText('1 to 5 of 7 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(shownCodes()).toEqual(['7/2024 EX', '6/2024 EX', '5/2024 EX', '4/2024 EX', '3/2024 EX']);
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, status: 'Submitted' }, ANY_SIGNAL);
    },
    TEST_TIMEOUT,
  );

  it(
    'searches the lines of a report by title',
    async () => {
      renderRoute('/admin/reports/expense/9', 'administrator');
      expect(await heading(/^9\/2024 EX: Business Trip Expenses/)).toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Expenses' });
      expect(lineTitles(table)).toEqual(['Dining Expenses', 'Hotel Accommodation']);

      fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'hotel' } });
      expect(lineTitles(table)).toEqual(['Hotel Accommodation']);
      expect(screen.getByText('1 to 1 of 1 items')).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'sorts the lines of a report by amount in both directions',
    async () => {
      renderRoute('/admin/reports/expense/9', 'administrator');
      const report = REPORT_DETAILS['expense/9'];
      vi.mocked(api.getReport).mockResolvedValueOnce({ ...report, lines: [...report.lines].reverse() });
      expect(await heading(/^9\/2024 EX: Business Trip Expenses/)).toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Expenses' });
      expect(lineTitles(table)).toEqual(['Hotel Accommodation', 'Dining Expenses']);

      fireEvent.click(within(table).getByRole('button', { name: 'Amount Spent' }));
      expect(lineTitles(table)).toEqual(['Dining Expenses', 'Hotel Accommodation']);
      fireEvent.click(within(table).getByRole('button', { name: 'Amount Spent' }));
      expect(lineTitles(table)).toEqual(['Hotel Accommodation', 'Dining Expenses']);
    },
    TEST_TIMEOUT,
  );

  it(
    'pages the lines of a report ten at a time',
    async () => {
      renderRoute('/admin/reports/expense/9', 'administrator');
      const reply = deferred<ReportDetail>();
      vi.mocked(api.getReport).mockReturnValueOnce(reply.promise);
      await waitFor(() => expect(api.getReport).toHaveBeenCalledExactlyOnceWith('expense', 9), {
        timeout: FIND_TIMEOUT,
      });
      // Inside act, so the table's page reset for the new lines has run before the page is changed.
      await act(async () => reply.resolve({ ...REPORT_DETAILS['expense/9'], lines: pagedLines(11) }));
      expect(await heading(/^9\/2024 EX: Business Trip Expenses/)).toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Expenses' });
      expect(screen.getByText('1 to 10 of 11 items')).toBeInTheDocument();
      expect(lineTitles(table)).toEqual(pagedLines(10).map((line) => line.title));

      fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
      expect(screen.getByText('11 to 11 of 11 items')).toBeInTheDocument();
      expect(lineTitles(table)).toEqual(['Receipt 11']);
    },
    TEST_TIMEOUT,
  );

  it.each(PAGER_FOCUS_CASES)(
    'hands focus to the other arrow when an arrow of the $pager reaches the last or first page',
    async ({ path, lines, first, last }) => {
      renderRoute(path, 'administrator');
      if (lines !== null) {
        vi.mocked(api.getReport).mockResolvedValueOnce({ ...REPORT_DETAILS['expense/9'], lines: pagedLines(lines) });
      }
      expect(await screen.findByText(first, {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      const previous = screen.getByRole('button', { name: 'Go to previous page' });
      const next = screen.getByRole('button', { name: 'Go to next page' });

      next.focus();
      fireEvent.click(next);
      expect(screen.getByText(last)).toBeInTheDocument();
      expect(next).toBeDisabled();
      expect(previous).toHaveFocus();

      fireEvent.click(previous);
      expect(screen.getByText(first)).toBeInTheDocument();
      expect(previous).toBeDisabled();
      expect(next).toHaveFocus();

      next.blur();
      fireEvent.click(next);
      expect(screen.getByText(last)).toBeInTheDocument();
      expect(document.body).toHaveFocus();
    },
    TEST_TIMEOUT,
  );
});

describe('dashboard figures', () => {
  it(
    'shows every user dashboard figure in its own card',
    async () => {
      renderRoute('/dashboard', 'user');
      expect(await screen.findByText(DRAFT_BANNER, {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expectKpi('Total Balance', '€ 3.412,95', 'Your balance is ok');
      expectKpi('Total Spent (current month)', '€ 0,00', 'is 100.00% less of last month');
      expectKpi('Total Spent (last month)', '€ 500,00', 'April 01 - April 30');
      expectKpi('Earnings (current month)', '€ 0,00', 'May 01 - May 31');

      const shares = within(screen.getByRole('list', { name: 'Expenses per type' })).getAllByRole('listitem');
      const expectedShares = [
        ['Travel', 'Count: 3', '69.93%', '€ 900,00'],
        ['Restaurant', 'Count: 3', '25.64%', '€ 330,00'],
        ['Other', 'Count: 2', '3.88%', '€ 50,00'],
        ['Kilometers', 'Count: 1', '0.55%', '€ 7,05'],
      ];
      expect(shares).toHaveLength(expectedShares.length);
      expectedShares.forEach((texts, index) => {
        for (const text of texts) {
          expect(within(shares[index]).getByText(text)).toBeInTheDocument();
        }
      });

      const trends = screen.getByRole('region', { name: 'Earnings trends' });
      expect(
        within(trends)
          .getAllByRole('progressbar')
          .map((bar) => [bar.getAttribute('aria-label'), bar.getAttribute('aria-valuetext')]),
      ).toEqual([
        ['Salary', '€ 4.000,00'],
        ['Service', '€ 500,00'],
        ['Investment', '€ 200,00'],
      ]);
      expect(within(trends).getByText('€ 4.000,00')).toBeInTheDocument();

      const statuses = within(screen.getByRole('list', { name: 'Report Status Summary' })).getAllByRole('listitem');
      expect(statuses.map((item) => item.textContent)).toEqual(['Approved1', 'Declined1', 'Submitted7', 'Draft5']);

      const perDate = screen.getByRole('region', { name: 'Expenses & Earnings per date (last 30 days)' });
      expect(within(perDate).getByRole('img', { name: 'Expenses on 21 May 2024: € 42,00' })).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'follows the signs and flags the server returns',
    async () => {
      renderRoute('/dashboard', 'user');
      vi.mocked(api.userDashboard).mockResolvedValueOnce({
        ...USER_DASHBOARD,
        balance: -120.5,
        monthChangePercent: -25,
        currentMonthEarnings: 300,
        draftBanner: false,
      });
      expect(await screen.findByText('Total Balance', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expectKpi('Total Balance', '€ -120,50', 'Your balance is in debt');
      expectKpi('Total Spent (current month)', '€ 0,00', 'is 25.00% above of last month');
      expectKpi('Earnings (current month)', '€ +300,00', 'May 01 - May 31');
      expect(screen.queryByText(DRAFT_BANNER)).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'reports a user dashboard that fails to load',
    async () => {
      renderRoute('/dashboard', 'user');
      vi.mocked(api.userDashboard).mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', MESSAGES.STARTING));
      expect(await toast(MESSAGES.STARTING)).toBeInTheDocument();
      expect(screen.queryByText('Total Balance')).toBeNull();
      expect(screen.queryByRole('progressbar', { name: 'Loading' })).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'shows every administrator counter in its own card',
    async () => {
      renderRoute('/admin', 'administrator');
      // The hidden loading placeholder repeats these labels, so wait for the counters themselves.
      expect(
        await screen.findByRole('progressbar', { name: 'Approved Report Rate' }, { timeout: FIND_TIMEOUT }),
      ).toBeInTheDocument();
      expect(within(kpiCard('Total Reports')).getByText('17')).toBeInTheDocument();
      expect(within(kpiCard('Reports Waiting Verification')).getByText('15')).toBeInTheDocument();
      const rate = kpiCard('Approved Report Rate');
      expect(within(rate).getByText('5.88%')).toBeInTheDocument();
      expect(within(rate).getByRole('progressbar', { name: 'Approved Report Rate' })).toHaveAttribute(
        'aria-valuetext',
        '5.88%',
      );
    },
    TEST_TIMEOUT,
  );
});

const PREVIEW_CASES = [
  { currency: 'USD', amount: '100', total: '€ 90,00', vat: 'VAT (23%): € 20,70' },
  { currency: 'EUR', amount: '42', total: '€ 42,00', vat: 'VAT (23%): € 9,66' },
];

type ConverterCase = { rate: string; edited: string | null; result: UsdToEurResult; message: string };

const CONVERTER_CASES: ConverterCase[] = [
  {
    rate: 'reference',
    edited: null,
    result: USD_TO_EUR_RESULT,
    message: '100$ using exchange rate of 0.9 equals to 90€',
  },
  {
    rate: 'edited',
    edited: '1.1',
    result: { eur: 110, rate: 1.1 },
    message: '100$ using exchange rate of 1.1 equals to 110€',
  },
];

describe('dashboard charts', () => {
  const perDateSection = 'Expenses & Earnings per date (last 30 days)';
  const emptyCases: {
    field: 'perDate' | 'expenseTypeShares' | 'earningTypeShares';
    section: string;
    message: string;
    chart: (region: HTMLElement) => HTMLElement[];
  }[] = [
    {
      field: 'perDate',
      section: perDateSection,
      message: 'No expenses or earnings in the last 30 days',
      chart: (region) => [
        ...within(region).queryAllByRole('img'),
        ...within(region).queryAllByText(/^(Expenses|Earnings)$/),
      ],
    },
    {
      field: 'expenseTypeShares',
      section: 'Expenses per type',
      message: 'No expenses to show',
      chart: (region) => within(region).queryAllByRole('list'),
    },
    {
      field: 'earningTypeShares',
      section: 'Earnings trends',
      message: 'No earnings to show',
      chart: (region) => within(region).queryAllByRole('progressbar'),
    },
  ];

  it.each(emptyCases)(
    'shows $message in place of the chart when $field is empty',
    async ({ field, section, message, chart }) => {
      vi.mocked(api.userDashboard).mockResolvedValueOnce({ ...USER_DASHBOARD, [field]: [] });
      renderRoute('/dashboard', 'user');

      const region = await screen.findByRole('region', { name: section }, { timeout: FIND_TIMEOUT });
      expect(within(region).getByText(message)).toBeVisible();
      expect(chart(region)).toEqual([]);
      for (const other of emptyCases.filter((candidate) => candidate.field !== field)) {
        const otherRegion = screen.getByRole('region', { name: other.section });
        expect(within(otherRegion).queryByText(other.message)).toBeNull();
        expect(other.chart(otherRegion)).not.toEqual([]);
      }
    },
    TEST_TIMEOUT,
  );

  const captionCases: {
    scenario: string;
    perDate: typeof USER_DASHBOARD.perDate;
    captions: string[];
    bars: string[];
  }[] = [
    {
      scenario: 'one seeded bar',
      perDate: USER_DASHBOARD.perDate,
      captions: ['21 May 2024'],
      bars: ['Expenses on 21 May 2024: € 42,00'],
    },
    {
      scenario: 'two dates with three bars',
      perDate: [
        { kind: 'earning', date: '2024-05-22', amountInEuros: 300 },
        { kind: 'expense', date: '2024-05-21', amountInEuros: 42 },
        { kind: 'expense', date: '2024-05-22', amountInEuros: 100 },
      ],
      captions: ['21 May 2024', '22 May 2024'],
      bars: [
        'Expenses on 21 May 2024: € 42,00',
        'Expenses on 22 May 2024: € 100,00',
        'Earnings on 22 May 2024: € 300,00',
      ],
    },
  ];

  it.each(captionCases)(
    'captions each date under its bars ($scenario)',
    async ({ perDate, captions, bars }) => {
      vi.mocked(api.userDashboard).mockResolvedValueOnce({ ...USER_DASHBOARD, perDate });
      renderRoute('/dashboard', 'user');

      const region = await screen.findByRole('region', { name: perDateSection }, { timeout: FIND_TIMEOUT });
      const shown = within(region).getAllByText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
      expect(shown.map((caption) => caption.textContent)).toEqual(captions);
      expect(within(region).getAllByRole('img').map((bar) => bar.getAttribute('aria-label'))).toEqual(bars);
      for (const caption of shown) {
        expect(caption).toBeVisible();
        const column = within(caption.parentElement as HTMLElement).getAllByRole('img');
        for (const bar of column) {
          expect(bar).toHaveAccessibleName(new RegExp(` on ${caption.textContent}: `));
        }
      }
    },
    TEST_TIMEOUT,
  );
});

describe('previews and tool forms', () => {
  it.each(PREVIEW_CASES)(
    'previews $amount $currency with the reference rates',
    async ({ currency, amount, total, vat }) => {
      renderRoute('/reports/expense/12', 'user');
      expect(await heading(LONDON_TRIP)).toBeInTheDocument();
      await clickControl('Add Expense');
      const dialog = await findDialog(/^New Expense/);
      press(dialog, currency);
      enter(dialog, 'Amount', amount);

      expect(within(dialog).getByText(total)).toBeInTheDocument();
      expect(within(dialog).getByText(vat)).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it.each(CONVERTER_CASES)(
    'converts 100 USD at the $rate rate',
    async ({ edited, result, message }) => {
      renderRoute('/tools/usd-to-eur', 'user');
      expect(await heading('USD/EUR Currency Converter')).toBeInTheDocument();
      vi.mocked(api.usdToEur).mockResolvedValueOnce(result);
      const rate = screen.getByLabelText('Exchange Rate USD/EUR');
      await waitFor(() => expect(rate).toHaveValue(REFERENCE.dollarsToEuros), { timeout: FIND_TIMEOUT });
      if (edited !== null) {
        await fillField('Exchange Rate USD/EUR', edited);
      }
      await fillField('USD Amount', '100');
      await clickControl('Convert');

      const shown = await screen.findByText(message, {}, { timeout: FIND_TIMEOUT });
      expect(shown.closest('[role="status"]')).not.toBeNull();
      expect(api.usdToEur).toHaveBeenCalledExactlyOnceWith(100, result.rate);
    },
    TEST_TIMEOUT,
  );

  it(
    'shows the mileage result until the distance changes',
    async () => {
      renderRoute('/tools/mileage', 'user');
      expect(await heading('Mileage Reimbursement')).toBeInTheDocument();
      await fillField('Mileage', '10');
      await clickControl('Convert');

      await waitFor(() => expect(screen.getByLabelText('Result in EUR')).toHaveValue('€ 5,00'), {
        timeout: FIND_TIMEOUT,
      });
      expect(api.mileage).toHaveBeenCalledExactlyOnceWith(10);
      await fillField('Mileage', '12');
      expect(screen.getByLabelText('Result in EUR')).toHaveValue('');
      expect(api.mileage).toHaveBeenCalledTimes(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'publishes a new blog post and returns to the blog',
    async () => {
      renderRoute('/blog/posts/new', 'administrator');
      expect(await heading('New Blog Post')).toBeInTheDocument();
      await fillField(/^Title/, 'Quarterly update');
      await fillField('Description', 'Second-quarter figures are in.');
      await clickControl('Save');

      expect(await toast(MESSAGES.BLOG_POST_PUBLISHED)).toBeInTheDocument();
      await arriveAt('/blog', 'Blog');
      expect(api.createBlogPost).toHaveBeenCalledExactlyOnceWith({
        title: 'Quarterly update',
        description: 'Second-quarter figures are in.',
      });
      expect(api.updateBlogPost).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT,
  );

  it(
    'edits a blog post from its stored values and returns to the blog',
    async () => {
      renderRoute('/blog', 'administrator');
      const post = await screen.findByRole(
        'article',
        { name: 'Mileage reimbursement rate' },
        { timeout: FIND_TIMEOUT },
      );
      fireEvent.click(within(post).getByRole('link', { name: 'Edit post' }));
      await arriveAt('/blog/posts/2', 'Edit Blog Post');
      await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Mileage reimbursement rate'), {
        timeout: FIND_TIMEOUT,
      });
      expect(screen.getByLabelText('Description')).toHaveValue(
        'Kilometers expenses are reimbursed at 0.37 EUR per km.',
      );
      expect(api.getBlogPost).toHaveBeenCalledExactlyOnceWith(2);

      await fillField(/^Title/, 'Mileage rate for 2024');
      await clickControl('Save');
      expect(await toast(MESSAGES.BLOG_POST_PUBLISHED)).toBeInTheDocument();
      await arriveAt('/blog', 'Blog');
      expect(api.updateBlogPost).toHaveBeenCalledExactlyOnceWith(2, {
        title: 'Mileage rate for 2024',
        description: 'Kilometers expenses are reimbursed at 0.37 EUR per km.',
      });
      expect(api.createBlogPost).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT,
  );

  it.each(['/blog/posts/1%27%20OR%201%3D1', '/blog/posts/abc', '/blog/posts/0'])(
    'reports %s as not found and returns to the blog',
    async (path) => {
      renderRoute(path, 'administrator');

      expect(await toast(MESSAGES.NOT_FOUND)).toBeInTheDocument();
      await arriveAt('/blog', 'Blog');
      expect(api.getBlogPost).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT,
  );
});

describe('new report dialog', () => {
  it(
    'creates one report when Submit is activated twice in one task',
    async () => {
      renderRoute('/reports', 'user');
      expect(await heading('Reports')).toBeInTheDocument();
      vi.mocked(api.createReport).mockClear();
      vi.mocked(api.getReport).mockResolvedValue({
        ...REPORT_DETAILS['expense/12'],
        id: 13,
        code: '13/2024 EX',
        title: 'Double Create',
        totalEur: 0,
        vatTotal: 0,
        lines: [],
      });

      await clickControl('New Report');
      await fillField('Report Title', 'Double Create');
      fireEvent.click(screen.getByRole('button', { name: 'Expense' }));
      const submit = screen.getByRole('button', { name: 'Submit' });
      act(() => {
        submit.click();
        submit.click();
      });

      await arriveAt('/reports/expense/13', /^13\/2024 EX: Double Create/);
      expect(api.createReport).toHaveBeenCalledTimes(1);
      expect(api.createReport).toHaveBeenCalledWith({ kind: 'expense', title: 'Double Create' });
    },
    TEST_TIMEOUT,
  );
});

const OWNER_REPORT = '/reports/expense/12';
const OWNER_HEADING = /^12\/2024 EX: London Trip/;
const ADMIN_REPORT = '/admin/reports/expense/7';
const ADMIN_HEADING = /^7\/2024 EX: Household Expenses/;

async function button(name: string | RegExp): Promise<HTMLElement> {
  return screen.findByRole('button', { name }, { timeout: FIND_TIMEOUT });
}

async function fillNewExpense(): Promise<void> {
  await clickControl('Add Expense');
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: /Expense Type/ }, { timeout: FIND_TIMEOUT }));
  fireEvent.click(await screen.findByRole('option', { name: 'Restaurant' }, { timeout: FIND_TIMEOUT }));
  await fillField(/^Title/, 'Taxi');
  await fillField(/^Amount/, '15');
}

function chooseInvoice(name: string, type: string): void {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) {
    throw new Error('The line form has no file input');
  }
  fireEvent.change(input, { target: { files: [new File(['invoice'], name, { type })] } });
}

function helperText(control: HTMLElement): string | null | undefined {
  return document.getElementById(control.getAttribute('aria-describedby') ?? '')?.textContent;
}

// One act scope keeps React from re-rendering between the clicks, as when both land in one browser task.
function clickInOneTask(first: HTMLElement, second: HTMLElement): void {
  act(() => {
    fireEvent.click(first);
    fireEvent.click(second);
  });
}

type DoubleClickCase = {
  action: string;
  path: string;
  category: SessionCategory;
  name: RegExp;
  prepare?: () => Promise<void>;
  clicks: [string, string];
  endpoint:
    | typeof api.createLine
    | typeof api.submitReport
    | typeof api.decideReport
    | typeof api.deleteLine
    | typeof api.deleteReport;
  args: unknown[];
  done: string;
};

const DOUBLE_CLICK_CASES: DoubleClickCase[] = [
  {
    action: 'Save twice on a new line',
    path: OWNER_REPORT,
    category: 'user',
    name: OWNER_HEADING,
    prepare: fillNewExpense,
    clicks: ['Save', 'Save'],
    endpoint: api.createLine,
    args: ['expense', 12, expect.objectContaining({ title: 'Taxi', amount: 15 })],
    done: 'Expense was added',
  },
  {
    action: 'Submit Report twice',
    path: OWNER_REPORT,
    category: 'user',
    name: OWNER_HEADING,
    clicks: ['Submit Report', 'Submit Report'],
    endpoint: api.submitReport,
    args: ['expense', 12],
    done: 'Expense report was submitted',
  },
  {
    action: 'Yes, delete it twice on a line',
    path: OWNER_REPORT,
    category: 'user',
    name: OWNER_HEADING,
    prepare: () => clickControl('Delete'),
    clicks: ['Yes, delete it', 'Yes, delete it'],
    endpoint: api.deleteLine,
    args: ['expense', 121],
    done: 'Expense was deleted',
  },
  {
    action: 'Yes, delete it twice on a report',
    path: OWNER_REPORT,
    category: 'user',
    name: OWNER_HEADING,
    prepare: () => clickControl('Delete Report'),
    clicks: ['Yes, delete it', 'Yes, delete it'],
    endpoint: api.deleteReport,
    args: ['expense', 12],
    done: 'Expense report was deleted',
  },
  {
    action: 'Approve Report twice',
    path: ADMIN_REPORT,
    category: 'administrator',
    name: ADMIN_HEADING,
    clicks: ['Approve Report', 'Approve Report'],
    endpoint: api.decideReport,
    args: ['expense', 7, true],
    done: 'Expense report was approved',
  },
  {
    action: 'Decline Report twice',
    path: ADMIN_REPORT,
    category: 'administrator',
    name: ADMIN_HEADING,
    clicks: ['Decline Report', 'Decline Report'],
    endpoint: api.decideReport,
    args: ['expense', 7, false],
    done: 'Expense report was declined',
  },
  {
    action: 'Approve then Decline Report',
    path: ADMIN_REPORT,
    category: 'administrator',
    name: ADMIN_HEADING,
    clicks: ['Approve Report', 'Decline Report'],
    endpoint: api.decideReport,
    args: ['expense', 7, true],
    done: 'Expense report was approved',
  },
];

type ConflictCase = {
  action: string;
  prepare?: () => Promise<void>;
  send: string;
  endpoint:
    | typeof api.submitReport
    | typeof api.deleteReport
    | typeof api.deleteLine
    | typeof api.createLine
    | typeof api.uploadInvoice;
  message: string;
};

const CONFLICT_CASES: ConflictCase[] = [
  { action: 'Submit Report', send: 'Submit Report', endpoint: api.submitReport, message: MESSAGES.CANNOT_SUBMIT },
  {
    action: 'Delete Report',
    prepare: () => clickControl('Delete Report'),
    send: 'Yes, delete it',
    endpoint: api.deleteReport,
    message: MESSAGES.REPORT_CANT_BE_DELETED,
  },
  {
    action: 'a line delete',
    prepare: () => clickControl('Delete'),
    send: 'Yes, delete it',
    endpoint: api.deleteLine,
    message: MESSAGES.DETAIL_CANT_BE_DELETED,
  },
  {
    action: 'a line save',
    prepare: fillNewExpense,
    send: 'Save',
    endpoint: api.createLine,
    message: MESSAGES.NOT_DRAFT,
  },
  {
    action: 'an invoice upload',
    prepare: async () => {
      await fillNewExpense();
      chooseInvoice('invoice.pdf', 'application/pdf');
    },
    send: 'Save',
    endpoint: api.uploadInvoice,
    message: MESSAGES.NOT_DRAFT,
  },
];

const SERVER_FAILURE = new ApiError(500, 'INTERNAL_ERROR', MESSAGES.INTERNAL_ERROR);

// Browsers move focus to the body when the focused button turns disabled; jsdom leaves it in place.
function clickAndLoseFocus(control: HTMLElement): void {
  control.focus();
  fireEvent.click(control);
  expect(control).toBeDisabled();
  control.blur();
}

type ActionFocusCase = {
  outcome: string;
  path: string;
  category: SessionCategory;
  name: RegExp;
  trigger: string;
  endpoint: typeof api.submitReport | typeof api.decideReport;
  rejection?: ApiError;
};

const ACTION_FOCUS_CASES: ActionFocusCase[] = [
  {
    outcome: 'a rejected Submit Report',
    path: OWNER_REPORT,
    category: 'user',
    name: OWNER_HEADING,
    trigger: 'Submit Report',
    endpoint: api.submitReport,
    rejection: new ApiError(422, 'NO_LINES', MESSAGES.NO_LINES),
  },
  {
    outcome: 'a rejected Approve Report',
    path: ADMIN_REPORT,
    category: 'administrator',
    name: ADMIN_HEADING,
    trigger: 'Approve Report',
    endpoint: api.decideReport,
    rejection: SERVER_FAILURE,
  },
  {
    outcome: 'a rejected Decline Report',
    path: ADMIN_REPORT,
    category: 'administrator',
    name: ADMIN_HEADING,
    trigger: 'Decline Report',
    endpoint: api.decideReport,
    rejection: SERVER_FAILURE,
  },
  {
    outcome: 'a successful Submit Report',
    path: OWNER_REPORT,
    category: 'user',
    name: OWNER_HEADING,
    trigger: 'Submit Report',
    endpoint: api.submitReport,
  },
  {
    outcome: 'a successful Approve Report',
    path: ADMIN_REPORT,
    category: 'administrator',
    name: ADMIN_HEADING,
    trigger: 'Approve Report',
    endpoint: api.decideReport,
  },
];

type DecisionFocusCase = {
  outcome: string;
  filter?: string;
  arrange: () => void;
  meanwhile?: () => void;
  focused: () => HTMLElement;
};

const DECISION_FOCUS_CASES: DecisionFocusCase[] = [
  {
    outcome: 'a failure refocuses Approve',
    arrange: () => vi.mocked(api.decideReport).mockRejectedValueOnce(SERVER_FAILURE),
    focused: () => screen.getByRole('button', { name: 'Approve' }),
  },
  {
    outcome: 'a success focuses View Report Details',
    arrange: () => undefined,
    focused: () => screen.getByRole('button', { name: 'View Report Details' }),
  },
  {
    outcome: 'a success off-filter focuses Search',
    filter: 'Submited',
    arrange: () =>
      vi
        .mocked(api.listReports)
        .mockResolvedValueOnce(ADMIN_EXPENSE_ROWS.filter((row) => row.status === 'Submitted' && row.id !== 7)),
    focused: () => screen.getByRole('textbox', { name: 'Search by title' }),
  },
  {
    outcome: 'a failure keeps focus moved meanwhile',
    arrange: () => vi.mocked(api.decideReport).mockRejectedValueOnce(SERVER_FAILURE),
    meanwhile: () => screen.getByRole('button', { name: 'View Report Details' }).focus(),
    focused: () => screen.getByRole('button', { name: 'View Report Details' }),
  },
];

// Holds the next report load, so the closing dialog returns focus before the reload settles, as over a network.
function holdNextReport(detail: ReportDetail): () => void {
  let release = () => {};
  const held = new Promise<ReportDetail>((resolve) => {
    release = () => resolve(detail);
  });
  vi.mocked(api.getReport).mockReturnValueOnce(held);
  return release;
}

const SUBMITTED_OWNER_REPORT: ReportDetail = { ...REPORT_DETAILS['expense/12'], status: 'Submitted' };

type DialogFocusCase = {
  outcome: string;
  opener: string;
  prepare: () => Promise<void>;
  send: string;
  endpoint: typeof api.deleteLine | typeof api.deleteReport | typeof api.createLine | typeof api.uploadInvoice;
  rejection?: ApiError;
  reloaded: ReportDetail;
  focus: 'page heading' | 'opener';
};

const DIALOG_FOCUS_CASES: DialogFocusCase[] = [
  {
    outcome: 'a successful line delete',
    opener: 'Delete',
    prepare: () => clickControl('Delete'),
    send: 'Yes, delete it',
    endpoint: api.deleteLine,
    reloaded: { ...REPORT_DETAILS['expense/12'], lines: [] },
    focus: 'page heading',
  },
  {
    outcome: 'a 409 on Delete Report',
    opener: 'Delete Report',
    prepare: () => clickControl('Delete Report'),
    send: 'Yes, delete it',
    endpoint: api.deleteReport,
    rejection: new ApiError(409, 'NOT_DRAFT', MESSAGES.REPORT_CANT_BE_DELETED),
    reloaded: SUBMITTED_OWNER_REPORT,
    focus: 'page heading',
  },
  {
    outcome: 'a 409 on a line delete',
    opener: 'Delete',
    prepare: () => clickControl('Delete'),
    send: 'Yes, delete it',
    endpoint: api.deleteLine,
    rejection: new ApiError(409, 'NOT_DRAFT', MESSAGES.DETAIL_CANT_BE_DELETED),
    reloaded: SUBMITTED_OWNER_REPORT,
    focus: 'page heading',
  },
  {
    outcome: 'a 409 on a line save',
    opener: 'Add Expense',
    prepare: fillNewExpense,
    send: 'Save',
    endpoint: api.createLine,
    rejection: new ApiError(409, 'NOT_DRAFT', MESSAGES.NOT_DRAFT),
    reloaded: SUBMITTED_OWNER_REPORT,
    focus: 'page heading',
  },
  {
    outcome: 'a 409 on an invoice upload',
    opener: 'Add Expense',
    prepare: async () => {
      await fillNewExpense();
      chooseInvoice('invoice.pdf', 'application/pdf');
    },
    send: 'Save',
    endpoint: api.uploadInvoice,
    rejection: new ApiError(409, 'NOT_DRAFT', MESSAGES.NOT_DRAFT),
    reloaded: SUBMITTED_OWNER_REPORT,
    focus: 'page heading',
  },
  {
    outcome: 'a successful line save',
    opener: 'Add Expense',
    prepare: fillNewExpense,
    send: 'Save',
    endpoint: api.createLine,
    reloaded: REPORT_DETAILS['expense/12'],
    focus: 'opener',
  },
];

describe('write guards', () => {
  it.each(DOUBLE_CLICK_CASES)(
    '$action in one task sends one request',
    async ({ path, category, name, prepare, clicks, endpoint, args, done }) => {
      renderRoute(path, category);
      expect(await heading(name)).toBeInTheDocument();
      await prepare?.();
      clickInOneTask(await button(clicks[0]), await button(clicks[1]));

      expect(await screen.findByText(done, {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(endpoint).toHaveBeenCalledTimes(1);
      expect(endpoint).toHaveBeenCalledWith(...args);
    },
    TEST_TIMEOUT,
  );

  it.each([
    new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', MESSAGES.FILE_TYPE_NOT_SUPPORTED),
    new ApiError(422, 'VALIDATION_FAILED', MESSAGES.FILE_NAME_TOO_LONG, [
      { field: 'file', message: MESSAGES.FILE_NAME_TOO_LONG },
    ]),
  ])(
    'an invoice rejected with $status keeps the stored line open for another upload',
    async (rejection) => {
      renderRoute(OWNER_REPORT, 'user');
      expect(await heading(OWNER_HEADING)).toBeInTheDocument();
      await fillNewExpense();
      vi.mocked(api.uploadInvoice).mockRejectedValueOnce(rejection);
      chooseInvoice('notes.txt', 'text/plain');
      fireEvent.click(await button('Save'));

      expect(await screen.findByText('Expense was added', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      const browse = await button(/browse/);
      await waitFor(() => expect(browse).toHaveFocus());
      expect(helperText(screen.getByRole('group', { name: 'Upload Invoice' }))).toBe(rejection.message);
      expect(screen.getByRole('dialog', { name: 'Edit Details' })).toBeInTheDocument();
      await waitFor(() => expect(api.getReport).toHaveBeenCalledTimes(2));

      chooseInvoice('invoice.pdf', 'application/pdf');
      expect(helperText(screen.getByRole('group', { name: 'Upload Invoice' }))).toBeUndefined();
      fireEvent.click(await button('Save'));

      expect(
        await screen.findByText('Your expense detail was successfully edited', {}, { timeout: FIND_TIMEOUT }),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(api.createLine).toHaveBeenCalledTimes(1);
      expect(api.updateLine).toHaveBeenCalledExactlyOnceWith(
        'expense',
        122,
        expect.objectContaining({ title: 'Taxi' }),
      );
      expect(api.uploadInvoice).toHaveBeenCalledTimes(2);
      expect(api.uploadInvoice).toHaveBeenLastCalledWith(
        'expense',
        122,
        expect.objectContaining({ name: 'invoice.pdf' }),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'a rejected save scrolls the message under the focused field into view',
    async () => {
      renderRoute(OWNER_REPORT, 'user');
      expect(await heading(OWNER_HEADING)).toBeInTheDocument();
      await fillNewExpense();
      await fillField(/^Description/, 'Z'.repeat(1501));
      fireEvent.click(await button('Save'));

      const description = screen.getByRole('textbox', { name: 'Description' });
      await waitFor(() => expect(description).toHaveFocus());
      const helper = document.getElementById(description.getAttribute('aria-describedby') ?? '');
      expect(helper).toHaveTextContent(MESSAGES.MAX_LENGTH_1500);
      expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(helper);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(api.createLine).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT,
  );

  it.each(CONFLICT_CASES)(
    'a 409 on $action reloads the report and drops its Draft controls',
    async ({ prepare, send, endpoint, message }) => {
      renderRoute(OWNER_REPORT, 'user');
      expect(await heading(OWNER_HEADING)).toBeInTheDocument();
      await prepare?.();
      vi.mocked(endpoint).mockRejectedValueOnce(new ApiError(409, 'NOT_DRAFT', message));
      vi.mocked(api.getReport).mockResolvedValueOnce({ ...REPORT_DETAILS['expense/12'], status: 'Submitted' });
      fireEvent.click(await button(send));

      expect(await screen.findByText(message, {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Submit Report' })).toBeNull());
      expect(api.getReport).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: 'Add Expense' })).toBeNull();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await expectLocation(OWNER_REPORT);
    },
    TEST_TIMEOUT,
  );

  it.each(ACTION_FOCUS_CASES)(
    'after $outcome, focus is restored',
    async ({ path, category, name, trigger, endpoint, rejection }) => {
      renderRoute(path, category);
      const page = await heading(name);
      if (rejection) {
        vi.mocked(endpoint).mockRejectedValueOnce(rejection);
      }
      const control = await button(trigger);
      clickAndLoseFocus(control);

      await waitFor(() => expect(endpoint).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(rejection ? control : page).toHaveFocus());
      expect(control).toBeEnabled();
    },
    TEST_TIMEOUT,
  );

  it.each(DIALOG_FOCUS_CASES)(
    'after $outcome and its reload, focus ends on the $focus',
    async ({ opener, prepare, send, endpoint, rejection, reloaded, focus }) => {
      renderRoute(OWNER_REPORT, 'user');
      const page = await heading(OWNER_HEADING);
      const control = await button(opener);
      control.focus();
      await prepare();
      if (rejection) {
        vi.mocked(endpoint).mockRejectedValueOnce(rejection);
      }
      const finishReload = holdNextReport(reloaded);
      fireEvent.click(await button(send));

      await waitFor(() => expect(control).toHaveFocus());
      await act(async () => finishReload());
      await waitFor(() => expect(focus === 'opener' ? control : page).toHaveFocus());
      expect(control.isConnected).toBe(focus === 'opener');
    },
    TEST_TIMEOUT,
  );

  it.each(DECISION_FOCUS_CASES)(
    'on the admin list, $outcome',
    async ({ filter, arrange, meanwhile, focused }) => {
      renderRoute(PATHS.admin, 'administrator');
      expect(await heading('Administrator Dashboard')).toBeInTheDocument();
      if (filter) {
        await clickControl(filter);
      }
      fireEvent.click(await screen.findByText('7/2024 EX', {}, { timeout: FIND_TIMEOUT }));
      const approve = await button('Approve');
      await waitFor(() => expect(api.getReport).toHaveBeenCalledWith('expense', 7));
      arrange();
      clickAndLoseFocus(approve);
      meanwhile?.();

      await waitFor(() => expect(api.decideReport).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(focused()).toHaveFocus());
    },
    TEST_TIMEOUT,
  );

  it(
    'on the admin list, a success waits for its own reload past a list load that settled meanwhile',
    async () => {
      renderRoute(PATHS.admin, 'administrator');
      expect(await heading('Administrator Dashboard')).toBeInTheDocument();
      await clickControl('Submited');
      fireEvent.click(await screen.findByText('7/2024 EX', {}, { timeout: FIND_TIMEOUT }));
      const approve = await button('Approve');
      await waitFor(() => expect(api.getReport).toHaveBeenCalledWith('expense', 7));
      const submitted = ADMIN_EXPENSE_ROWS.filter((row) => row.status === 'Submitted');
      let finishDecision = () => {};
      vi.mocked(api.decideReport).mockReturnValueOnce(
        new Promise<ReportSummary>((resolve) => {
          finishDecision = () => resolve({ ...submitted.filter((row) => row.id === 7)[0], status: 'Approved' });
        }),
      );
      clickAndLoseFocus(approve);

      fireEvent.click(screen.getByRole('button', { name: 'Code' }));
      await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
      vi.mocked(api.listReports).mockResolvedValueOnce(submitted.filter((row) => row.id !== 7));
      await act(async () => finishDecision());

      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search by title' })).toHaveFocus());
      expect(screen.queryByText('7/2024 EX')).toBeNull();
    },
    TEST_TIMEOUT,
  );
});

type RetryFocusCase = {
  surface: string;
  outcome: string;
  target: string;
  path: string;
  category: SessionCategory;
  endpoint:
    | typeof api.userDashboard
    | typeof api.adminDashboard
    | typeof api.getReport
    | typeof api.reference
    | typeof api.listReports;
  failures: number;
  meanwhile?: () => HTMLElement;
  focused: () => HTMLElement;
};

const USER_DASHBOARD_RETRY = {
  surface: 'the dashboard',
  path: PATHS.dashboard,
  category: 'user',
  endpoint: api.userDashboard,
} as const;
const ADMIN_DASHBOARD_RETRY = {
  surface: 'the admin counters',
  path: PATHS.admin,
  category: 'administrator',
  endpoint: api.adminDashboard,
} as const;
const REPORT_RETRY = { surface: 'the report', path: OWNER_REPORT, category: 'user', endpoint: api.getReport } as const;
const REFERENCE_RETRY = {
  surface: 'the reference data',
  path: OWNER_REPORT,
  category: 'user',
  endpoint: api.reference,
} as const;
const LIST_RETRY = {
  surface: 'the report list',
  path: PATHS.reports,
  category: 'user',
  endpoint: api.listReports,
} as const;
const SUCCESS = { outcome: 'succeeds', failures: 1 } as const;
const SECOND_FAILURE = { outcome: 'fails again', target: 'the new Retry', failures: 2 } as const;
const MOVED_MEANWHILE = { outcome: 'fails again', target: 'the control focused meanwhile', failures: 2 } as const;
const NEW_RETRY = () => screen.getByRole('button', { name: 'Retry' });
const VIEW_REPORTS = () => screen.getByRole('link', { name: 'View Reports' });
const SEARCH_FIELD = () => screen.getByRole('textbox', { name: 'Search by title' });
const REPORT_HEADING = () => screen.getByRole('heading', { name: OWNER_HEADING });
const SUBMIT_REPORT = () => screen.getByRole('button', { name: 'Submit Report' });
const NEW_REPORT = () => screen.getByRole('button', { name: 'New Report' });

const RETRY_FOCUS_CASES: RetryFocusCase[] = [
  { ...USER_DASHBOARD_RETRY, ...SECOND_FAILURE, focused: NEW_RETRY },
  { ...USER_DASHBOARD_RETRY, ...MOVED_MEANWHILE, meanwhile: VIEW_REPORTS, focused: VIEW_REPORTS },
  { ...ADMIN_DASHBOARD_RETRY, ...SECOND_FAILURE, focused: NEW_RETRY },
  { ...ADMIN_DASHBOARD_RETRY, ...MOVED_MEANWHILE, meanwhile: SEARCH_FIELD, focused: SEARCH_FIELD },
  { ...REPORT_RETRY, ...SUCCESS, target: 'the page heading', focused: REPORT_HEADING },
  { ...REPORT_RETRY, ...SECOND_FAILURE, focused: NEW_RETRY },
  { ...REFERENCE_RETRY, ...SUCCESS, target: 'the page heading', focused: REPORT_HEADING },
  { ...REFERENCE_RETRY, ...SECOND_FAILURE, focused: NEW_RETRY },
  { ...REFERENCE_RETRY, ...MOVED_MEANWHILE, meanwhile: SUBMIT_REPORT, focused: SUBMIT_REPORT },
  { ...LIST_RETRY, ...SUCCESS, target: 'the search field', focused: SEARCH_FIELD },
  { ...LIST_RETRY, ...SECOND_FAILURE, focused: NEW_RETRY },
  { ...LIST_RETRY, ...MOVED_MEANWHILE, meanwhile: NEW_REPORT, focused: NEW_REPORT },
];

describe('focus after a retry', () => {
  it.each(RETRY_FOCUS_CASES)(
    'when a retry of $surface $outcome, focus ends on $target',
    async ({ path, category, endpoint, failures, meanwhile, focused }) => {
      for (let attempt = 0; attempt < failures; attempt += 1) {
        vi.mocked(endpoint).mockRejectedValueOnce(SERVER_FAILURE);
      }
      renderRoute(path, category);
      const retry = await button('Retry');
      retry.focus();
      fireEvent.click(retry);
      expect(retry).not.toBeInTheDocument();
      expect(document.body).toHaveFocus();
      meanwhile?.().focus();

      if (failures > 1) {
        expect(await button('Retry')).not.toBe(retry);
      }
      await waitFor(() => expect(focused()).toHaveFocus());
      expect(endpoint).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT,
  );
});
