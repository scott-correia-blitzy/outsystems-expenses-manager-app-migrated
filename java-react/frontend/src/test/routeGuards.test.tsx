import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_CATEGORIES, type SessionCategory } from './fixtures';
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
