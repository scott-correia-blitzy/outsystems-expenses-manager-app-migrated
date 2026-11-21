import { request } from './client';
import type {
  AdminDashboard,
  BlogPostBody,
  BlogPostView,
  CreateReportBody,
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

export function me(): Promise<SessionUser> {
  return request<SessionUser>('GET', '/api/auth/me');
}

export function login(req: LoginRequest): Promise<SessionUser> {
  return request<SessionUser>('POST', '/api/auth/login', req);
}

export function logout(): Promise<void> {
  return request<void>('POST', '/api/auth/logout');
}

export function reference(): Promise<ReferenceData> {
  return request<ReferenceData>('GET', '/api/reference');
}

export function listReports(query: ReportListQuery): Promise<ReportSummary[]> {
  const url = withQuery('/api/reports', {
    kind: query.kind,
    status: query.status,
    q: query.q,
    sort: query.sort,
    from: query.from,
    to: query.to,
  });
  return request<ReportSummary[]>('GET', url);
}

export function createReport(body: CreateReportBody): Promise<ReportSummary> {
  return request<ReportSummary>('POST', '/api/reports', body);
}

export function getReport(kind: Kind, id: number): Promise<ReportDetail> {
  return request<ReportDetail>('GET', `/api/reports/${seg(kind)}/${seg(id)}`);
}

export function renameReport(kind: Kind, id: number, title: string): Promise<ReportSummary> {
  return request<ReportSummary>('PUT', `/api/reports/${seg(kind)}/${seg(id)}`, { title });
}

export function deleteReport(kind: Kind, id: number): Promise<void> {
  return request<void>('DELETE', `/api/reports/${seg(kind)}/${seg(id)}`);
}

export function submitReport(kind: Kind, id: number): Promise<ReportSummary> {
  return request<ReportSummary>('POST', `/api/reports/${seg(kind)}/${seg(id)}/submit`);
}

export function decideReport(kind: Kind, id: number, accept: boolean): Promise<ReportSummary> {
  return request<ReportSummary>('POST', `/api/reports/${seg(kind)}/${seg(id)}/decision`, { accept });
}

export function createLine(kind: Kind, reportId: number, body: LineBody): Promise<LineView> {
  return request<LineView>('POST', `/api/reports/${seg(kind)}/${seg(reportId)}/lines`, body);
}

export function updateLine(kind: Kind, lineId: number, body: LineBody): Promise<LineView> {
  return request<LineView>('PUT', `/api/lines/${seg(kind)}/${seg(lineId)}`, body);
}

export function deleteLine(kind: Kind, lineId: number): Promise<void> {
  return request<void>('DELETE', `/api/lines/${seg(kind)}/${seg(lineId)}`);
}

export function uploadInvoice(kind: Kind, lineId: number, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  return request<void>('PUT', `/api/lines/${seg(kind)}/${seg(lineId)}/invoice`, form);
}

// A link target rather than a fetch, so the browser saves the attachment itself.
export function invoiceDownloadUrl(kind: Kind, lineId: number): string {
  return `/api/lines/${seg(kind)}/${seg(lineId)}/invoice`;
}

export function userDashboard(): Promise<UserDashboard> {
  return request<UserDashboard>('GET', '/api/dashboard/user');
}

export function adminDashboard(): Promise<AdminDashboard> {
  return request<AdminDashboard>('GET', '/api/dashboard/admin');
}

export function listBlogPosts(q?: string): Promise<BlogPostView[]> {
  return request<BlogPostView[]>('GET', withQuery('/api/blog', { q }));
}

export function getBlogPost(id: number): Promise<BlogPostView> {
  return request<BlogPostView>('GET', `/api/blog/${seg(id)}`);
}

export function createBlogPost(body: BlogPostBody): Promise<BlogPostView> {
  return request<BlogPostView>('POST', '/api/blog', body);
}

export function updateBlogPost(id: number, body: BlogPostBody): Promise<BlogPostView> {
  return request<BlogPostView>('PUT', `/api/blog/${seg(id)}`, body);
}

export function usdToEur(amount: number, rate?: number): Promise<UsdToEurResult> {
  return request<UsdToEurResult>('GET', withQuery('/api/tools/usd-to-eur', { amount, rate }));
}

export function mileage(km: number): Promise<MileageResult> {
  return request<MileageResult>('GET', withQuery('/api/tools/mileage', { km }));
}
