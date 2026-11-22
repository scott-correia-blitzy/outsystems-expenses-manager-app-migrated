export type Kind = 'expense' | 'earning';

export type StatusLabel = 'Draft' | 'Submitted' | 'Approved' | 'Declined';

export type Role = 'Administrator' | 'Approver' | 'User' | 'Registered';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'BAD_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_DRAFT'
  | 'CODE_CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_FAILED'
  | 'NO_LINES'
  | 'SERVICE_UNAVAILABLE';

// submitedOn is the server's field name, legacy misspelling included.
export type ReportSortColumn =
  | 'id'
  | 'code'
  | 'title'
  | 'createdOn'
  | 'submitedOn'
  | 'totalEur'
  | 'status'
  | 'submittedBy';

export type SortDir = 'asc' | 'desc';

export interface SessionUser {
  username: string;
  displayName: string;
  roles: Role[];
  landingRoute: string;
}

export interface RefItem {
  id: number;
  label: string;
  order: number;
  isActive: boolean;
}

export interface ReferenceData {
  currencies: RefItem[];
  statuses: RefItem[];
  expenseTypes: RefItem[];
  earningTypes: RefItem[];
  mileageReimbursement: number;
  dollarsToEuros: number;
  vatRate: number;
}

export interface ReportSummary {
  id: number;
  code: string;
  title: string;
  status: StatusLabel;
  createdOn: string;
  submitedOn: string | null;
  totalEur: number;
  submittedBy: string | null;
}

export interface InvoiceInfo {
  filename: string;
  contentType: string;
  uploadedOn: string;
}

export interface LineView {
  id: number;
  reportId: number;
  date: string;
  title: string;
  description: string;
  typeId: number;
  typeLabel: string;
  currencyId: number;
  amount: number;
  kilometers: number | null;
  amountInEuros: number;
  vat: number;
  invoice: InvoiceInfo | null;
}

export interface ReportDetail {
  id: number;
  kind: Kind;
  code: string;
  title: string;
  status: StatusLabel;
  createdOn: string;
  createdByName: string | null;
  submitedOn: string | null;
  processedOn: string | null;
  submittedBy: string | null;
  totalEur: number;
  vatTotal: number;
  lines: LineView[];
}

export interface Period {
  from: string;
  to: string;
}

export interface TypeShare {
  typeId: number;
  label: string;
  count: number;
  sum: number;
  sharePercent: number;
}

export interface DatedAmount {
  kind: Kind;
  date: string;
  amountInEuros: number;
}

export interface StatusCounts {
  draft: number;
  submitted: number;
  approved: number;
  declined: number;
}

export interface UserDashboard {
  balance: number;
  currentMonthSpent: number;
  lastMonthSpent: number;
  monthChangePercent: number | null;
  currentMonthEarnings: number;
  currentMonth: Period;
  lastMonth: Period;
  expenseTypeShares: TypeShare[];
  // The server leaves sharePercent out of earning shares.
  earningTypeShares: Omit<TypeShare, 'sharePercent'>[];
  perDate: DatedAmount[];
  statusCounts: StatusCounts;
  draftBanner: boolean;
}

export interface AdminDashboard {
  totalReports: number;
  waiting: number;
  approvedRate: number;
}

export interface BlogPostView {
  id: number;
  title: string;
  description: string;
  createdOn: string;
  createdByName: string | null;
  updatedOn: string | null;
  updatedByName: string | null;
}

export interface UsdToEurResult {
  eur: number;
  rate: number;
}

export interface MileageResult {
  eur: number;
  rate: number;
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface CreateReportBody {
  kind: Kind;
  title: string;
}

export interface ReportListQuery {
  kind: Kind;
  status?: StatusLabel;
  q?: string;
  sort?: `${ReportSortColumn},${SortDir}`;
  from?: string;
  to?: string;
}

export interface ExpenseLineBody {
  expenseTypeId: number;
  currencyId: number | null;
  amount: number | null;
  kilometers?: number | null;
  title: string;
  description: string;
  date: string;
}

export interface EarningLineBody {
  earningTypeId: number;
  currencyId: number | null;
  amount: number | null;
  title: string;
  description: string;
  date: string;
}

export type LineBody = ExpenseLineBody | EarningLineBody;

export interface BlogPostBody {
  title: string;
  description: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ErrorBody {
  status: number;
  code: string;
  message: string;
  fieldErrors?: FieldError[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];

  constructor(status: number, code: string, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// Legacy message wording and spelling are part of the API contract.
export const MESSAGES = {
  REPORT_CANT_BE_DELETED: 'This report cant be deleted',
  DETAIL_CANT_BE_DELETED: 'This detail cant be deleted',
  CANNOT_SUBMIT: 'It is not possible to submit the expense report',
  NO_LINES: 'There are no expenses associated to the report',
  NO_PERMISSIONS: 'The user does not have permissions',
  INSERT_TITLE: 'Please insert a title',
  SELECT_REPORT_TYPE: 'Select a report type',
  GENERIC_ERROR: 'An error occurred, please try later',
  BLOG_POST_PUBLISHED: 'Blog post successfuly published',
  DATE_PAST_OR_CURRENT: 'Date must be set to past or current',
  DISTANCE_POSITIVE: 'Distance must be a positive number',
  MUST_SET_AMOUNT: 'Must set an amount',
  USD_AMOUNT_ABOVE_ZERO: 'Please insert a USD amount above 0',
  RATE_ABOVE_ZERO: 'Please insert an exchange rate above 0',
  NO_INVOICE: 'No invoice available',
  NO_FILE_SELECTED: 'No file selected',
  NO_FILE_UPLOADED: 'No file uploaded',
  FILE_TYPE_NOT_SUPPORTED: 'File type is not supported',
  FIELD_REQUIRED: 'This field is required.',
  FORBIDDEN: "You don't have permissions to view this screen.",
  BAD_CREDENTIALS: 'Invalid username or password.',
  NOT_DRAFT: 'The report is no longer in Draft',
  FILE_TOO_LARGE: 'The file exceeds the 5 MB limit',
  MAX_LENGTH_50: 'Maximum length is 50 characters',
  MAX_LENGTH_1500: 'Maximum length is 1500 characters',
  MAX_LENGTH_10000: 'Maximum length is 10000 characters',
  FILE_NAME_TOO_LONG: 'File name must be 50 characters or fewer',
  UNAUTHENTICATED: 'Please log in to continue.',
  NOT_FOUND: 'The requested resource was not found',
  INVALID_VALUE: 'Invalid value',
  STARTING: 'The application is starting, please try again in a moment.',
  INTERNAL_ERROR: 'An error occurred, please try later',
  INVALID_REPORT: 'Invalid expense report',
} as const;

export type MessageKey = keyof typeof MESSAGES;
