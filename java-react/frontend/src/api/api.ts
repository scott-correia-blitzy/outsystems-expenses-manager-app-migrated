import { download, request, type HttpMethod } from './client';
import { ApiError } from './types';
import type {
  AdminDashboard,
  BlogPostBody,
  BlogPostView,
  CreateReportBody,
  DownloadedFile,
  Kind,
  LineBody,
  LineView,
  LoginRequest,
  MileageResult,
  ReferenceData,
  ReportDetail,
  ReportListQuery,
  ReportSummary,
  SessionUser,
  UsdToEurResult,
  UserDashboard,
} from './types';

type QueryValue = string | number | undefined | null;

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  }
  const encoded = query.toString();
  return encoded === '' ? path : `${path}?${encoded}`;
}

function seg(value: string | number): string {
  return encodeURIComponent(String(value));
}

type SessionListener = () => void;

const sessionListeners = new Set<SessionListener>();
const accessDeniedListeners = new Set<SessionListener>();
// Advances at login, logout, expiry and startNewSession, so a 401 or 403 from an earlier session's request is ignored.
let sessionEpoch = 0;

// For a session change seen outside this module, such as me() naming a caller other than the one shown.
export function startNewSession(): void {
  sessionEpoch += 1;
}

export function onSessionExpired(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

// Tabs share one session cookie, so a 403 can mean another tab signed in as a different user.
export function onAccessDenied(listener: SessionListener): () => void {
  accessDeniedListeners.add(listener);
  return () => {
    accessDeniedListeners.delete(listener);
  };
}

function notify(listeners: Set<SessionListener>): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function signedIn<T>(call: () => Promise<T>): Promise<T> {
  const startedIn = sessionEpoch;
  return call().catch((err: unknown) => {
    if (err instanceof ApiError && startedIn === sessionEpoch) {
      if (err.status === 401) {
        sessionEpoch += 1;
        notify(sessionListeners);
      } else if (err.status === 403) {
        notify(accessDeniedListeners);
      }
    }
    throw err;
  });
}

function signedInRequest<T>(method: HttpMethod, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return signedIn(() => request<T>(method, url, body, signal));
}

export function me(): Promise<SessionUser> {
  return request<SessionUser>('GET', '/api/auth/me');
}

export function login(req: LoginRequest): Promise<SessionUser> {
  return request<SessionUser>('POST', '/api/auth/login', req).then((user) => {
    sessionEpoch += 1;
    return user;
  });
}

export function logout(): Promise<void> {
  sessionEpoch += 1;
  return request<void>('POST', '/api/auth/logout');
}

// Reference rows and rates are fixed for a session, so every caller shares one load and only a failure is retried.
let referenceLoad: { epoch: number; data: Promise<ReferenceData> } | null = null;

export function reference(): Promise<ReferenceData> {
  if (referenceLoad === null || referenceLoad.epoch !== sessionEpoch) {
    const load = { epoch: sessionEpoch, data: signedInRequest<ReferenceData>('GET', '/api/reference') };
    referenceLoad = load;
    load.data.catch(() => {
      if (referenceLoad === load) {
        referenceLoad = null;
      }
    });
  }
  return referenceLoad.data;
}

export function listReports(query: ReportListQuery, signal?: AbortSignal): Promise<ReportSummary[]> {
  const url = withQuery('/api/reports', {
    kind: query.kind,
    status: query.status,
    q: query.q,
    sort: query.sort,
    from: query.from,
    to: query.to,
  });
  return signedInRequest<ReportSummary[]>('GET', url, undefined, signal);
}

export function createReport(body: CreateReportBody): Promise<ReportSummary> {
  return signedInRequest<ReportSummary>('POST', '/api/reports', body);
}

export function getReport(kind: Kind, id: number): Promise<ReportDetail> {
  return signedInRequest<ReportDetail>('GET', `/api/reports/${seg(kind)}/${seg(id)}`);
}

export function renameReport(kind: Kind, id: number, title: string): Promise<ReportSummary> {
  return signedInRequest<ReportSummary>('PUT', `/api/reports/${seg(kind)}/${seg(id)}`, { title });
}

export function deleteReport(kind: Kind, id: number): Promise<void> {
  return signedInRequest<void>('DELETE', `/api/reports/${seg(kind)}/${seg(id)}`);
}

export function submitReport(kind: Kind, id: number): Promise<ReportSummary> {
  return signedInRequest<ReportSummary>('POST', `/api/reports/${seg(kind)}/${seg(id)}/submit`);
}

export function decideReport(kind: Kind, id: number, accept: boolean): Promise<ReportSummary> {
  return signedInRequest<ReportSummary>('POST', `/api/reports/${seg(kind)}/${seg(id)}/decision`, { accept });
}

export function createLine(kind: Kind, reportId: number, body: LineBody): Promise<LineView> {
  return signedInRequest<LineView>('POST', `/api/reports/${seg(kind)}/${seg(reportId)}/lines`, body);
}

export function updateLine(kind: Kind, lineId: number, body: LineBody): Promise<LineView> {
  return signedInRequest<LineView>('PUT', `/api/lines/${seg(kind)}/${seg(lineId)}`, body);
}

export function deleteLine(kind: Kind, lineId: number): Promise<void> {
  return signedInRequest<void>('DELETE', `/api/lines/${seg(kind)}/${seg(lineId)}`);
}

export function uploadInvoice(kind: Kind, lineId: number, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  return signedInRequest<void>('PUT', `/api/lines/${seg(kind)}/${seg(lineId)}/invoice`, form);
}

// For an image preview's src; saving goes through downloadInvoice so a failure is reported in the app.
export function invoiceDownloadUrl(kind: Kind, lineId: number): string {
  return `/api/lines/${seg(kind)}/${seg(lineId)}/invoice`;
}

export function downloadInvoice(kind: Kind, lineId: number): Promise<DownloadedFile> {
  return signedIn(() => download(invoiceDownloadUrl(kind, lineId)));
}

export function userDashboard(): Promise<UserDashboard> {
  return signedInRequest<UserDashboard>('GET', '/api/dashboard/user');
}

export function adminDashboard(): Promise<AdminDashboard> {
  return signedInRequest<AdminDashboard>('GET', '/api/dashboard/admin');
}

export function listBlogPosts(q?: string): Promise<BlogPostView[]> {
  return signedInRequest<BlogPostView[]>('GET', withQuery('/api/blog', { q }));
}

export function getBlogPost(id: number): Promise<BlogPostView> {
  return signedInRequest<BlogPostView>('GET', `/api/blog/${seg(id)}`);
}

export function createBlogPost(body: BlogPostBody): Promise<BlogPostView> {
  return signedInRequest<BlogPostView>('POST', '/api/blog', body);
}

export function updateBlogPost(id: number, body: BlogPostBody): Promise<BlogPostView> {
  return signedInRequest<BlogPostView>('PUT', `/api/blog/${seg(id)}`, body);
}

export function usdToEur(amount: number, rate?: number): Promise<UsdToEurResult> {
  return signedInRequest<UsdToEurResult>('GET', withQuery('/api/tools/usd-to-eur', { amount, rate }));
}

export function mileage(km: number): Promise<MileageResult> {
  return signedInRequest<MileageResult>('GET', withQuery('/api/tools/mileage', { km }));
}
