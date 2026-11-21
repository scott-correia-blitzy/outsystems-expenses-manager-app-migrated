import type { ComponentType, ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import type { Kind, Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import { RequireRole } from './auth/RequireRole';
import { AppLayout } from './layout/AppLayout';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminEarningReportDetailPage } from './pages/AdminEarningReportDetailPage';
import { AdminExpenseReportDetailPage } from './pages/AdminExpenseReportDetailPage';
import { BlogPage } from './pages/BlogPage';
import { BlogPostDetailPage } from './pages/BlogPostDetailPage';
import { HomeScreenPage } from './pages/HomeScreenPage';
import { InvalidPermissionsPage } from './pages/InvalidPermissionsPage';
import { LoginPage } from './pages/LoginPage';
import { MileageReimbursementPage } from './pages/MileageReimbursementPage';
import { UsdToEurConverterPage } from './pages/UsdToEurConverterPage';
import { UserDashboardPage } from './pages/UserDashboardPage';
import { UserEarningReportDetailPage } from './pages/UserEarningReportDetailPage';
import { UserExpenseReportDetailPage } from './pages/UserExpenseReportDetailPage';
import { UserReportsPage } from './pages/UserReportsPage';

export type RouteRoles = 'all' | readonly Role[];

export interface AppRoute {
  path: string;
  page: ComponentType;
  roles: RouteRoles;
  screen: string;
}

export interface MenuItem {
  label: string;
  path?: string;
  children?: readonly MenuItem[];
}

export const PATHS = {
  login: '/login',
  invalidPermissions: '/invalid-permissions',
  dashboard: '/dashboard',
  reports: '/reports',
  admin: '/admin',
  blog: '/blog',
  usdToEur: '/tools/usd-to-eur',
  mileage: '/tools/mileage',
  home: '/home',
} as const;

export const ROUTES: readonly AppRoute[] = [
  { path: PATHS.login, page: LoginPage, roles: 'all', screen: 'Login' },
  { path: PATHS.invalidPermissions, page: InvalidPermissionsPage, roles: 'all', screen: 'InvalidPermissions' },
  { path: PATHS.dashboard, page: UserDashboardPage, roles: ['User'], screen: 'UserDashboard' },
  { path: PATHS.reports, page: UserReportsPage, roles: ['User'], screen: 'User_ReportsPage' },
  {
    path: '/reports/expense/:id',
    page: UserExpenseReportDetailPage,
    roles: ['User'],
    screen: 'User_ExpenseReportDetail',
  },
  {
    path: '/reports/earning/:id',
    page: UserEarningReportDetailPage,
    roles: ['User'],
    screen: 'User_EarningReportDetail',
  },
  { path: PATHS.admin, page: AdminDashboardPage, roles: ['Administrator'], screen: 'AdminDashboard' },
  {
    path: '/admin/reports/expense/:id',
    page: AdminExpenseReportDetailPage,
    roles: ['Administrator'],
    screen: 'Admin_ExpenseReportDetail',
  },
  {
    path: '/admin/reports/earning/:id',
    page: AdminEarningReportDetailPage,
    roles: ['Administrator'],
    screen: 'Admin_EarningReportDetail',
  },
  {
    path: PATHS.blog,
    page: BlogPage,
    roles: ['User', 'Registered', 'Approver', 'Administrator'],
    screen: 'Blog',
  },
  { path: '/blog/posts/:id', page: BlogPostDetailPage, roles: ['Administrator'], screen: 'BlogPostDetail' },
  {
    path: PATHS.usdToEur,
    page: UsdToEurConverterPage,
    roles: ['User', 'Approver', 'Administrator'],
    screen: 'TOOLS_UsdToEurConverter',
  },
  {
    path: PATHS.mileage,
    page: MileageReimbursementPage,
    roles: ['User', 'Approver', 'Administrator'],
    screen: 'TOOLS_MileageReimbursement',
  },
  { path: PATHS.home, page: HomeScreenPage, roles: ['Registered'], screen: 'HomeScreen' },
];

// Kept as hoisted function declarations: pages and the layout import them through a cycle with this module.
export function reportPath(kind: Kind, id: number | string): string {
  return `${PATHS.reports}/${kind}/${id}`;
}

export function adminReportPath(kind: Kind, id: number | string): string {
  return `${PATHS.admin}/reports/${kind}/${id}`;
}

export function blogPostPath(id: number | 'new'): string {
  return `${PATHS.blog}/posts/${id}`;
}

export function landingRouteFor(roles: readonly Role[]): string {
  if (roles.includes('Administrator')) {
    return PATHS.admin;
  }
  if (roles.includes('User')) {
    return PATHS.dashboard;
  }
  return PATHS.blog;
}

export function canAccess(userRoles: readonly Role[], routeRoles: RouteRoles): boolean {
  if (routeRoles === 'all') {
    return true;
  }
  return routeRoles.some((role) => role === 'Registered' || userRoles.includes(role));
}

export function menuFor(roles: readonly Role[]): MenuItem[] {
  const blog: MenuItem = { label: 'Blog', path: PATHS.blog };
  const tools: MenuItem = {
    label: 'Tools',
    children: [
      { label: 'USD to EUR Converter', path: PATHS.usdToEur },
      { label: 'Reimbursement Calculator', path: PATHS.mileage },
    ],
  };
  if (roles.includes('Administrator')) {
    return [{ label: 'Dashboard', path: PATHS.admin }, blog, tools];
  }
  if (roles.includes('User')) {
    return [{ label: 'Dashboard', path: PATHS.dashboard }, { label: 'Reports', path: PATHS.reports }, blog, tools];
  }
  const dashboard: MenuItem = { label: 'Dashboard', path: PATHS.invalidPermissions };
  return roles.includes('Approver') ? [dashboard, blog, tools] : [dashboard, blog];
}

export function safeRedirectTarget(from: unknown): string | null {
  const isSameOriginPath =
    typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\');
  return isSameOriginPath ? from : null;
}

function returnPathFrom(state: unknown): string | null {
  return typeof state === 'object' && state !== null && 'from' in state ? safeRedirectTarget(state.from) : null;
}

function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}

function RootRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') {
    return <Loading />;
  }
  return <Navigate to={user === null ? PATHS.login : landingRouteFor(user.roles)} replace />;
}

function LoginRoute({ page: Page }: { page: ComponentType }) {
  const { status, user } = useAuth();
  const { state } = useLocation();
  if (status === 'loading') {
    return <Loading />;
  }
  if (user === null) {
    return <Page />;
  }
  return <Navigate to={returnPathFrom(state) ?? landingRouteFor(user.roles)} replace />;
}

function OpenRoute({ page: Page }: { page: ComponentType }) {
  const { status, user } = useAuth();
  if (status === 'loading') {
    return <Loading />;
  }
  if (user === null) {
    return <Page />;
  }
  return (
    <AppLayout>
      <Page />
    </AppLayout>
  );
}

function routeElement({ path, page: Page, roles }: AppRoute): ReactElement {
  if (path === PATHS.login) {
    return <LoginRoute page={Page} />;
  }
  if (roles === 'all') {
    return <OpenRoute page={Page} />;
  }
  if (path === PATHS.home) {
    return (
      <RequireRole roles={roles}>
        <Page />
      </RequireRole>
    );
  }
  return (
    <RequireRole roles={roles}>
      <AppLayout>
        <Page />
      </AppLayout>
    </RequireRole>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      {ROUTES.map((route) => (
        <Route key={route.path} path={route.path} element={routeElement(route)} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
