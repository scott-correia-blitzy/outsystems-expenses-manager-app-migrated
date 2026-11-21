import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/api';
import {
  ApiError,
  MESSAGES,
  type FieldError,
  type Kind,
  type LineBody,
  type LineView,
  type ReportDetail,
  type ReportListQuery,
  type ReportSummary,
  type StatusLabel,
  type UsdToEurResult,
} from '../api/types';
import { theme } from '../theme/theme';
import {
  ADMIN_EXPENSE_ROWS,
  EXPENSE_ROWS,
  REFERENCE,
  REPORT_DETAILS,
  USD_TO_EUR_RESULT,
  USER_DASHBOARD,
  type SessionCategory,
} from './fixtures';
import { expectLocation, renderRoute } from './renderRoute';

vi.mock('../api/api');

// Each case starts from fresh mocks, so its call assertions and overrides are its own.
beforeEach(() => {
  vi.resetAllMocks();
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

async function fillField(label: string | RegExp, value: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText(label, {}, { timeout: FIND_TIMEOUT }), { target: { value } });
}

type ServerErrorCase = {
  path: string;
  category: SessionCategory;
  name: string;
  fill: () => Promise<void>;
  submit: string;
  endpoint: typeof api.createBlogPost | typeof api.usdToEur | typeof api.mileage;
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
      expect(document.getElementById(helperId)?.textContent).toBe(messages.join('\n'));
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
  { outcome: 'accepted', failure: null, message: 'Expense was added' },
  {
    outcome: 'rejected',
    failure: new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', MESSAGES.FILE_TYPE_NOT_SUPPORTED),
    message: MESSAGES.FILE_TYPE_NOT_SUPPORTED,
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
    async ({ failure, message }) => {
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

      await toast(message);
      expect(alertTexts()).toEqual([message]);
      expect(api.uploadInvoice).toHaveBeenCalledExactlyOnceWith('expense', 777, invoice);
      await dialogClosed();
      await waitFor(() => expect(api.getReport).toHaveBeenCalledTimes(2), { timeout: FIND_TIMEOUT });
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
      expect(lineRow(table, 'Flight tickets')).toHaveTextContent('€ 42,00');
      expect(api.getReport).toHaveBeenCalledTimes(1);
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
      expect(api.listReports).toHaveBeenLastCalledWith(DEFAULT_LIST_QUERY);
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
    calls: 3,
    codes: ['11/2024 EX', '10/2024 EX', '9/2024 EX'],
  },
];

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

describe('browsing reports and lines', () => {
  it(
    'lists expense reports created from 2023-01-01 up to now by default',
    async () => {
      renderRoute('/reports', 'user');
      expect(await screen.findByText('1 to 8 of 8 items', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
      expect(shownCodes()).toEqual(ALL_EXPENSE_CODES);
      expect(api.listReports).toHaveBeenCalledExactlyOnceWith(DEFAULT_LIST_QUERY);
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
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, ...query });
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
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, sort: 'title,asc' });

      await sortBy('descending');
      await waitFor(() => expect(shownCodes()[0]).toBe('3/2024 EX'), { timeout: FIND_TIMEOUT });
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, sort: 'title,desc' });
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
      expect(api.listReports).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, status: 'Submitted' });
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
      expect(await screen.findByText('Total Reports', {}, { timeout: FIND_TIMEOUT })).toBeInTheDocument();
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
});
