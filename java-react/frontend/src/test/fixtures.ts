import { vi } from 'vitest';
import * as api from '../api/api';
import {
  ApiError,
  MESSAGES,
  type AdminDashboard,
  type BlogPostView,
  type Kind,
  type LineBody,
  type LineView,
  type MileageResult,
  type ReferenceData,
  type RefItem,
  type ReportDetail,
  type ReportSummary,
  type SessionUser,
  type StatusLabel,
  type UsdToEurResult,
  type UserDashboard,
} from '../api/types';

export type SessionCategory = 'anonymous' | 'registered' | 'user' | 'approver' | 'administrator';

export const SESSION_CATEGORIES: readonly SessionCategory[] = [
  'anonymous',
  'registered',
  'user',
  'approver',
  'administrator',
];

export const SESSIONS: Record<Exclude<SessionCategory, 'anonymous'>, SessionUser> = {
  registered: {
    username: 'em_registered',
    displayName: 'Registered User',
    roles: ['Registered'],
    landingRoute: '/blog',
  },
  user: {
    username: 'em_user1',
    displayName: 'John Smith',
    roles: ['User', 'Registered'],
    landingRoute: '/dashboard',
  },
  approver: {
    username: 'em_approver',
    displayName: 'Approver User',
    roles: ['Approver', 'Registered'],
    landingRoute: '/blog',
  },
  administrator: {
    username: 'em_admin',
    displayName: 'EM_Admin',
    roles: ['Administrator', 'Registered'],
    landingRoute: '/admin',
  },
};

const JOHN = 'John Smith';
const MICHAEL = 'Michael Davis';
const SARAH = 'Sarah Lee';
const ADMIN = 'EM_Admin';
const NOW = '2024-05-23T16:00:00';
const EURO = 1;
const DOLLAR = 2;
const KILOMETERS = 3;

function refItem(id: number, label: string, order: number = id): RefItem {
  return { id, label, order, isActive: true };
}

function byId<T extends { id: number }>(items: readonly T[], id: number): T {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`No fixture item with id ${id}`);
  }
  return item;
}

export const REFERENCE: ReferenceData = {
  currencies: [refItem(1, 'Euro'), refItem(2, 'Dollar')],
  statuses: [
    refItem(1, 'Draft', 2),
    refItem(2, 'Submitted', 2),
    refItem(3, 'Approved'),
    refItem(4, 'Declined'),
  ],
  expenseTypes: [
    refItem(1, 'Restaurant'),
    refItem(2, 'Travel'),
    refItem(3, 'Kilometers'),
    refItem(4, 'Other'),
  ],
  earningTypes: [
    refItem(2, 'Investment'),
    refItem(4, 'Other'),
    refItem(1, 'Salary'),
    refItem(3, 'Service'),
  ],
  // Not the production rates (0.37, 0.93), so tests can tell the preview takes its rates from here.
  mileageReimbursement: 0.5,
  dollarsToEuros: 0.9,
  vatRate: 0.23,
};

export const USER_DASHBOARD: UserDashboard = {
  balance: 3412.95,
  currentMonthSpent: 0,
  lastMonthSpent: 500,
  monthChangePercent: 100,
  currentMonthEarnings: 0,
  currentMonth: { from: '2024-05-01', to: '2024-05-31' },
  lastMonth: { from: '2024-04-01', to: '2024-04-30' },
  expenseTypeShares: [
    { typeId: 2, label: 'Travel', count: 3, sum: 900, sharePercent: 69.93 },
    { typeId: 1, label: 'Restaurant', count: 3, sum: 330, sharePercent: 25.64 },
    { typeId: 4, label: 'Other', count: 2, sum: 50, sharePercent: 3.88 },
    { typeId: 3, label: 'Kilometers', count: 1, sum: 7.05, sharePercent: 0.55 },
  ],
  earningTypeShares: [
    { typeId: 1, label: 'Salary', count: 2, sum: 4000 },
    { typeId: 3, label: 'Service', count: 1, sum: 500 },
    { typeId: 2, label: 'Investment', count: 1, sum: 200 },
  ],
  perDate: [{ kind: 'expense', date: '2024-05-21', amountInEuros: 42 }],
  statusCounts: { draft: 5, submitted: 7, approved: 1, declined: 1 },
  draftBanner: true,
};

export const ADMIN_DASHBOARD: AdminDashboard = { totalReports: 17, waiting: 15, approvedRate: 5.88 };

function plusOneDay(timestamp: string): string {
  const next = new Date(`${timestamp}Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 19);
}

function summary(
  id: number,
  code: string,
  title: string,
  status: StatusLabel,
  created: string,
  totalEur: number,
  submittedBy: string = JOHN,
): ReportSummary {
  const createdOn = created.includes('T') ? created : `${created}T09:00:00`;
  const submitedOn = status === 'Draft' ? null : plusOneDay(createdOn);
  return { id, code, title, status, createdOn, submitedOn, totalEur, submittedBy };
}

export const EXPENSE_ROWS: ReportSummary[] = [
  summary(12, '12/2024 EX', 'London Trip', 'Draft', '2024-05-23T15:18:38', 42),
  summary(11, '11/2024 EX', 'Hotel', 'Draft', '2024-04-15', 0),
  summary(10, '10/2024 EX', 'Home Office', 'Draft', '2024-04-10', 0),
  summary(9, '9/2024 EX', 'Business Trip Expenses', 'Approved', '2024-04-01', 500),
  summary(8, '8/2024 EX', 'Office Supplies Purchase', 'Declined', '2024-03-28', 80),
  summary(3, '3/2024 EX', 'Transportation Expenses', 'Submitted', '2024-03-09', 50),
  summary(2, '2/2024 EX', 'Business Travel Expenses', 'Submitted', '2024-03-05', 600),
  summary(1, '1/2024 EX', 'Client Meetings Expenses', 'Submitted', '2024-03-02', 137.05),
];

export const EARNING_ROWS: ReportSummary[] = [
  summary(10, '10/2024 EA', 'Sales Commission', 'Submitted', '2024-04-05', 1000),
  summary(9, '9/2024 EA', 'Consulting Fees', 'Submitted', '2024-04-01', 500),
  summary(4, '4/2024 EA', 'Miscellaneous Income', 'Draft', '2024-03-09', 900),
  summary(3, '3/2024 EA', 'Service Income', 'Draft', '2024-03-05', 0),
  summary(2, '2/2024 EA', 'Investment Income', 'Submitted', '2024-03-03', 200),
  summary(1, '1/2024 EA', 'Salary Payments', 'Submitted', '2024-03-01', 3000),
];

export const ADMIN_EXPENSE_ROWS: ReportSummary[] = [
  byId(EXPENSE_ROWS, 9),
  byId(EXPENSE_ROWS, 8),
  summary(7, '7/2024 EX', 'Household Expenses', 'Submitted', '2024-04-01', 250, MICHAEL),
  summary(6, '6/2024 EX', 'Educational Expenses', 'Submitted', '2024-03-23', 200, SARAH),
  summary(5, '5/2024 EX', 'Training Materials', 'Submitted', '2024-03-16', 75, SARAH),
  summary(4, '4/2024 EX', 'Conference Registration', 'Submitted', '2024-03-12', 120, MICHAEL),
  byId(EXPENSE_ROWS, 3),
  byId(EXPENSE_ROWS, 2),
  byId(EXPENSE_ROWS, 1),
];

export const ADMIN_EARNING_ROWS: ReportSummary[] = [
  byId(EARNING_ROWS, 10),
  byId(EARNING_ROWS, 9),
  summary(8, '8/2024 EA', 'Bonus Payment', 'Submitted', '2024-03-29', 300, SARAH),
  summary(7, '7/2024 EA', 'Monthly Salary', 'Submitted', '2024-03-25', 2500, MICHAEL),
  summary(6, '6/2024 EA', 'Stock Dividends', 'Submitted', '2024-03-18', 150, SARAH),
  summary(5, '5/2024 EA', 'Freelance Project', 'Submitted', '2024-03-14', 400, MICHAEL),
  byId(EARNING_ROWS, 2),
  byId(EARNING_ROWS, 1),
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function vatOf(amountInEuros: number): number {
  return round2(amountInEuros * REFERENCE.vatRate);
}

function line(
  id: number,
  reportId: number,
  date: string,
  title: string,
  description: string,
  type: RefItem,
  amount: number,
): LineView {
  return {
    id,
    reportId,
    date,
    title,
    description,
    typeId: type.id,
    typeLabel: type.label,
    currencyId: EURO,
    amount,
    kilometers: null,
    amountInEuros: amount,
    vat: vatOf(amount),
    invoice: null,
  };
}

function detail(kind: Kind, row: ReportSummary, lines: LineView[], processedOn: string | null = null): ReportDetail {
  return {
    ...row,
    kind,
    createdByName: row.submittedBy ?? '',
    processedOn,
    vatTotal: vatOf(row.totalEur),
    lines,
  };
}

const RESTAURANT = byId(REFERENCE.expenseTypes, 1);
const TRAVEL = byId(REFERENCE.expenseTypes, 2);
const SALARY = byId(REFERENCE.earningTypes, 1);
const SERVICE = byId(REFERENCE.earningTypes, 3);

const FLIGHT_TICKETS = line(121, 12, '2024-05-21', 'Flight tickets', 'Tickets for flight to London', TRAVEL, 42);

export const REPORT_DETAILS: Record<string, ReportDetail> = {
  'expense/12': detail('expense', byId(EXPENSE_ROWS, 12), [FLIGHT_TICKETS]),
  'expense/9': detail(
    'expense',
    byId(EXPENSE_ROWS, 9),
    [
      line(91, 9, '2024-04-02', 'Dining Expenses', 'Meals during the business trip.', RESTAURANT, 200),
      line(92, 9, '2024-04-02', 'Hotel Accommodation', 'Stay at a business hotel during a trip.', TRAVEL, 300),
    ],
    '2024-04-03T09:00:00',
  ),
  'earning/10': detail('earning', byId(EARNING_ROWS, 10), [
    line(101, 10, '2024-03-29', 'Sales commission', '', SALARY, 1000),
  ]),
  'earning/9': detail('earning', byId(EARNING_ROWS, 9), [
    line(
      95,
      9,
      '2024-03-28',
      'Consulting Service for Client A',
      'Fee earned for providing consulting services to Client A.',
      SERVICE,
      500,
    ),
  ]),
};

export const BLOG_POSTS: BlogPostView[] = [
  {
    id: 2,
    title: 'Mileage reimbursement rate',
    description: 'Kilometers expenses are reimbursed at 0.37 EUR per km.',
    createdOn: '2024-03-20T10:00:00',
    createdByName: ADMIN,
    updatedOn: '2024-03-20T10:00:00',
    updatedByName: ADMIN,
  },
  {
    id: 1,
    title: 'Welcome to Expenses Manager',
    description: 'Record your expenses and earnings in reports, then submit them for approval.',
    createdOn: '2024-03-16T10:00:00',
    createdByName: ADMIN,
    updatedOn: '2024-03-16T10:00:00',
    updatedByName: ADMIN,
  },
];

export const USD_TO_EUR_RESULT: UsdToEurResult = { eur: 90, rate: 0.9 };

export const MILEAGE_RESULT: MileageResult = { eur: 5, rate: 0.5 };

let currentSession: SessionUser | null = null;
const sessionListeners = new Set<() => void>();

export function expireSession(): void {
  currentSession = null;
}

// A protected call without a session answers 401 and reports the expiry, as api.ts does.
function signedIn<A extends unknown[], R>(impl: (...args: A) => R | Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (currentSession === null) {
      for (const listener of [...sessionListeners]) {
        listener();
      }
      throw new ApiError(401, 'UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED);
    }
    return impl(...args);
  };
}

function orNotFound<T>(item: T | undefined): T {
  if (item === undefined) {
    throw new ApiError(404, 'NOT_FOUND', MESSAGES.NOT_FOUND);
  }
  return item;
}

function rowsFor(kind: Kind, administrator: boolean): ReportSummary[] {
  if (kind === 'expense') {
    return administrator ? ADMIN_EXPENSE_ROWS : EXPENSE_ROWS;
  }
  return administrator ? ADMIN_EARNING_ROWS : EARNING_ROWS;
}

function findRow(kind: Kind, id: number): ReportSummary {
  const rows = [...rowsFor(kind, false), ...rowsFor(kind, true)];
  return orNotFound(rows.find((row) => row.id === Number(id)));
}

function findLine(kind: Kind, lineId: number): LineView | undefined {
  return Object.values(REPORT_DETAILS)
    .filter((report) => report.kind === kind)
    .flatMap((report) => report.lines)
    .find((candidate) => candidate.id === Number(lineId));
}

function findPost(id: number): BlogPostView {
  return orNotFound(BLOG_POSTS.find((post) => post.id === Number(id)));
}

function matches(keyword: string | undefined, ...texts: string[]): boolean {
  const needle = keyword?.trim().toLowerCase() ?? '';
  return needle === '' || texts.some((text) => text.toLowerCase().includes(needle));
}

function lineFromBody(kind: Kind, base: LineView, body: LineBody): LineView {
  const typeId = 'expenseTypeId' in body ? body.expenseTypeId : body.earningTypeId;
  const types = kind === 'expense' ? REFERENCE.expenseTypes : REFERENCE.earningTypes;
  const fields: LineView = {
    ...base,
    date: body.date,
    title: body.title,
    description: body.description,
    typeId,
    typeLabel: types.find((type) => type.id === typeId)?.label ?? base.typeLabel,
  };
  if ('expenseTypeId' in body && typeId === KILOMETERS) {
    const kilometers = body.kilometers ?? 0;
    const euros = round2(kilometers * REFERENCE.mileageReimbursement);
    return { ...fields, currencyId: EURO, amount: euros, kilometers, amountInEuros: euros, vat: vatOf(euros) };
  }
  const currencyId = body.currencyId ?? base.currencyId;
  const amount = body.amount ?? base.amount;
  const euros = round2(currencyId === DOLLAR ? amount * REFERENCE.dollarsToEuros : amount);
  return { ...fields, currencyId, amount, kilometers: null, amountInEuros: euros, vat: vatOf(euros) };
}

export function installApiMocks(category: SessionCategory): void {
  currentSession = category === 'anonymous' ? null : SESSIONS[category];

  vi.mocked(api.me).mockImplementation(async () => {
    const session = currentSession;
    if (session === null) {
      throw new ApiError(401, 'UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED);
    }
    return session;
  });
  vi.mocked(api.login).mockImplementation(async (credentials) => {
    const session =
      Object.values(SESSIONS).find((candidate) => candidate.username === credentials.username) ?? SESSIONS.user;
    currentSession = session;
    return session;
  });
  vi.mocked(api.logout).mockImplementation(async () => {
    currentSession = null;
  });
  sessionListeners.clear();
  vi.mocked(api.onSessionExpired).mockImplementation((listener) => {
    sessionListeners.add(listener);
    return () => {
      sessionListeners.delete(listener);
    };
  });

  vi.mocked(api.reference).mockImplementation(signedIn(() => REFERENCE));
  vi.mocked(api.userDashboard).mockImplementation(signedIn(() => USER_DASHBOARD));
  vi.mocked(api.adminDashboard).mockImplementation(signedIn(() => ADMIN_DASHBOARD));
  vi.mocked(api.usdToEur).mockImplementation(signedIn(() => USD_TO_EUR_RESULT));
  vi.mocked(api.mileage).mockImplementation(signedIn(() => MILEAGE_RESULT));

  vi.mocked(api.listReports).mockImplementation(
    signedIn(async (query) => {
      const administrator = currentSession?.roles.includes('Administrator') ?? false;
      return rowsFor(query.kind, administrator).filter(
        (row) =>
          (query.status === undefined || row.status === query.status) && matches(query.q, row.code, row.title),
      );
    }),
  );
  vi.mocked(api.getReport).mockImplementation(
    signedIn(async (kind, id) => {
      const known: ReportDetail | undefined = REPORT_DETAILS[`${kind}/${Number(id)}`];
      return known ?? detail(kind, findRow(kind, id), []);
    }),
  );
  vi.mocked(api.createReport).mockImplementation(
    signedIn(async (body) => {
      const code = body.kind === 'expense' ? '13/2024 EX' : '11/2024 EA';
      return summary(Number.parseInt(code, 10), code, body.title, 'Draft', NOW, 0);
    }),
  );
  vi.mocked(api.renameReport).mockImplementation(
    signedIn(async (kind, id, title) => ({ ...findRow(kind, id), title })),
  );
  vi.mocked(api.submitReport).mockImplementation(
    signedIn(async (kind, id) => ({
      ...findRow(kind, id),
      status: 'Submitted',
      submitedOn: NOW,
    })),
  );
  vi.mocked(api.decideReport).mockImplementation(
    signedIn(async (kind, id, accept) => ({
      ...findRow(kind, id),
      status: accept ? 'Approved' : 'Declined',
    })),
  );
  vi.mocked(api.deleteReport).mockImplementation(signedIn(() => undefined));

  vi.mocked(api.createLine).mockImplementation(
    signedIn(async (kind, reportId, body) => lineFromBody(kind, { ...FLIGHT_TICKETS, id: 122, reportId }, body)),
  );
  vi.mocked(api.updateLine).mockImplementation(
    signedIn(async (kind, lineId, body) =>
      lineFromBody(kind, findLine(kind, lineId) ?? { ...FLIGHT_TICKETS, id: lineId }, body),
    ),
  );
  vi.mocked(api.deleteLine).mockImplementation(signedIn(() => undefined));
  vi.mocked(api.uploadInvoice).mockImplementation(signedIn(() => undefined));
  vi.mocked(api.invoiceDownloadUrl).mockImplementation((kind, lineId) => `/api/lines/${kind}/${lineId}/invoice`);

  vi.mocked(api.listBlogPosts).mockImplementation(
    signedIn(async (q) => BLOG_POSTS.filter((post) => matches(q, post.title, post.description))),
  );
  vi.mocked(api.getBlogPost).mockImplementation(signedIn(async (id) => findPost(id)));
  vi.mocked(api.createBlogPost).mockImplementation(
    signedIn(async (body) => ({
      id: 3,
      title: body.title,
      description: body.description,
      createdOn: NOW,
      createdByName: ADMIN,
      updatedOn: NOW,
      updatedByName: ADMIN,
    })),
  );
  vi.mocked(api.updateBlogPost).mockImplementation(
    signedIn(async (id, body) => ({
      ...findPost(id),
      title: body.title,
      description: body.description,
      updatedOn: NOW,
      updatedByName: ADMIN,
    })),
  );
}

