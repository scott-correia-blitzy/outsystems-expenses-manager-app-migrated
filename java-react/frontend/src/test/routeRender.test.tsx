import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../api/api';
import { ApiError, type FieldError } from '../api/types';
import { REFERENCE, type SessionCategory } from './fixtures';
import { expectLocation, renderRoute } from './renderRoute';

vi.mock('../api/api');

const FIND_TIMEOUT = 3000;
const TEST_TIMEOUT = 15_000;
const CONTROL_ROLES = ['button', 'link', 'menuitem'] as const;

const PERMISSIONS_HEADING = "You don't have permissions to view this screen.";

async function heading(name: string | RegExp): Promise<HTMLElement> {
  return screen.findByRole('heading', { name }, { timeout: FIND_TIMEOUT });
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

type RenderCase = { path: string; category: SessionCategory; name: string | RegExp };

const RENDER_CASES: RenderCase[] = [
  { path: '/login', category: 'anonymous', name: 'Login' },
  { path: '/invalid-permissions', category: 'anonymous', name: PERMISSIONS_HEADING },
  { path: '/dashboard', category: 'user', name: 'Dashboard' },
  { path: '/reports', category: 'user', name: 'Reports' },
  { path: '/reports/expense/12', category: 'user', name: /^12\/2024 EX: London Trip/ },
  { path: '/reports/earning/10', category: 'user', name: /^10\/2024 EA: Sales Commission/ },
  { path: '/admin', category: 'administrator', name: 'Administrator Dashboard' },
  { path: '/admin/reports/expense/9', category: 'administrator', name: /^9\/2024 EX: Business Trip Expenses/ },
  { path: '/admin/reports/earning/9', category: 'administrator', name: /^9\/2024 EA: Consulting Fees/ },
  { path: '/blog', category: 'user', name: 'Blog' },
  { path: '/blog/posts/new', category: 'administrator', name: 'New Blog Post' },
  { path: '/tools/usd-to-eur', category: 'user', name: 'USD/EUR Currency Converter' },
  { path: '/tools/mileage', category: 'user', name: 'Mileage Reimbursement' },
];

describe('route renders', () => {
  it.each(RENDER_CASES)(
    '$path renders its page for $category',
    async ({ path, category, name }) => {
      renderRoute(path, category);
      expect(await heading(name)).toBeInTheDocument();
      await expectLocation(path);
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
    'logging out returns to /login',
    async () => {
      await startAt('user', '/dashboard');
      await clickControl(/log ?out/i);
      await arriveAt('/login', 'Login');
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
      expect(toast).toHaveTextContent(`${unknown.field}: ${unknown.message}`);
      expect(toast).not.toHaveTextContent(`${field}: ${messages[1]}`);
      const helperId = screen.getByLabelText(label).getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(helperId)?.textContent).toBe(messages.join('\n'));
    },
    TEST_TIMEOUT,
  );
});
