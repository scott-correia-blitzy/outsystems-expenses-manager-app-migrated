import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import type { Kind, Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import { RequireRole } from './auth/RequireRole';
import { VISUALLY_HIDDEN } from './components/Feedback';
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
  title: string;
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
  { path: PATHS.login, page: LoginPage, roles: 'all', screen: 'Login', title: 'Login' },
  {
    path: PATHS.invalidPermissions,
    page: InvalidPermissionsPage,
    roles: 'all',
    screen: 'InvalidPermissions',
    title: 'Invalid Permissions',
  },
  { path: PATHS.dashboard, page: UserDashboardPage, roles: ['User'], screen: 'UserDashboard', title: 'Dashboard' },
  { path: PATHS.reports, page: UserReportsPage, roles: ['User'], screen: 'User_ReportsPage', title: 'Reports' },
  {
    path: '/reports/expense/:id',
    page: UserExpenseReportDetailPage,
    roles: ['User'],
    screen: 'User_ExpenseReportDetail',
    title: 'Expense Report Detail',
  },
  {
    path: '/reports/earning/:id',
    page: UserEarningReportDetailPage,
    roles: ['User'],
    screen: 'User_EarningReportDetail',
    title: 'Earning Report Detail',
  },
  {
    path: PATHS.admin,
    page: AdminDashboardPage,
    roles: ['Administrator'],
    screen: 'AdminDashboard',
    title: 'Administrator Dashboard',
  },
  {
    path: '/admin/reports/expense/:id',
    page: AdminExpenseReportDetailPage,
    roles: ['Administrator'],
    screen: 'Admin_ExpenseReportDetail',
    title: 'Expense Report Detail',
  },
  {
    path: '/admin/reports/earning/:id',
    page: AdminEarningReportDetailPage,
    roles: ['Administrator'],
    screen: 'Admin_EarningReportDetail',
    title: 'Earning Report Detail',
  },
  {
    path: PATHS.blog,
    page: BlogPage,
    roles: ['User', 'Registered', 'Approver', 'Administrator'],
    screen: 'Blog',
    title: 'Blog',
  },
  {
    path: '/blog/posts/:id',
    page: BlogPostDetailPage,
    roles: ['Administrator'],
    screen: 'BlogPostDetail',
    title: 'Blog Post',
  },
  {
    path: PATHS.usdToEur,
    page: UsdToEurConverterPage,
    roles: ['User', 'Approver', 'Administrator'],
    screen: 'TOOLS_UsdToEurConverter',
    title: 'USD/EUR Currency Converter',
  },
  {
    path: PATHS.mileage,
    page: MileageReimbursementPage,
    roles: ['User', 'Approver', 'Administrator'],
    screen: 'TOOLS_MileageReimbursement',
    title: 'Mileage Reimbursement',
  },
  { path: PATHS.home, page: HomeScreenPage, roles: ['Registered'], screen: 'HomeScreen', title: 'Home' },
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
  if (typeof from !== 'string' || !from.startsWith('/')) {
    return null;
  }
  let target: URL;
  try {
    // URL parsing drops tabs and newlines, reads backslashes as slashes and resolves dot segments.
    target = new URL(from, window.location.origin);
  } catch {
    return null;
  }
  const path = target.pathname + target.search + target.hash;
  const isSameOriginPath = target.origin === window.location.origin && !path.startsWith('//');
  return isSameOriginPath ? path : null;
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

const APP_NAME = 'Expenses Manager V2';

const ScreenAnnouncerContext = createContext<(title: string) => boolean>(() => false);

function focusPageHeading(): boolean {
  const main = document.querySelector('main');
  const heading = main?.querySelector('h1') ?? null;
  if (main === null || heading === null) {
    return false;
  }
  const focused = document.activeElement;
  // Focus already inside the page or a dialog, such as Login's autofocused field, is left alone.
  if (focused === null || !(main.contains(focused) || focused.closest('[role="dialog"]') !== null)) {
    heading.focus();
  }
  return true;
}

function RouteScreen({ title, children }: { title: string; children: ReactNode }) {
  const announceScreen = useContext(ScreenAnnouncerContext);
  const { pathname } = useLocation();
  const shown = useRef<{ pathname: string; announced: boolean } | null>(null);

  useEffect(() => {
    document.title = `${title} - ${APP_NAME}`;
    // StrictMode re-runs this effect for the same screen, which must not count as a new one.
    if (shown.current?.pathname !== pathname) {
      shown.current = { pathname, announced: announceScreen(title) };
    }
    if (!shown.current.announced || focusPageHeading()) {
      return undefined;
    }
    const observer = new MutationObserver(() => {
      if (focusPageHeading()) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [announceScreen, title, pathname]);

  return <>{children}</>;
}

function RootRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') {
    return <Loading />;
  }
  return <Navigate to={user === null ? PATHS.login : landingRouteFor(user.roles)} replace />;
}

function LoginRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const { state } = useLocation();
  if (status === 'loading') {
    return <Loading />;
  }
  if (user === null) {
    return <>{children}</>;
  }
  return <Navigate to={returnPathFrom(state) ?? landingRouteFor(user.roles)} replace />;
}

function OpenRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') {
    return <Loading />;
  }
  if (user === null) {
    return <>{children}</>;
  }
  return <AppLayout>{children}</AppLayout>;
}

function routeElement({ path, page: Page, roles, title }: AppRoute): ReactElement {
  const screen = (
    <RouteScreen title={title}>
      <Page />
    </RouteScreen>
  );
  if (path === PATHS.login) {
    return <LoginRoute>{screen}</LoginRoute>;
  }
  if (roles === 'all') {
    return <OpenRoute>{screen}</OpenRoute>;
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
      <AppLayout>{screen}</AppLayout>
    </RequireRole>
  );
}

export function AppRoutes() {
  const liveRegion = useRef<HTMLDivElement>(null);
  const firstScreenShown = useRef(false);
  // The browser already reads the first screen on load, so only later screens are announced.
  const announceScreen = useCallback((title: string): boolean => {
    if (!firstScreenShown.current) {
      firstScreenShown.current = true;
      return false;
    }
    if (liveRegion.current !== null) {
      liveRegion.current.textContent = title;
    }
    return true;
  }, []);

  return (
    <ScreenAnnouncerContext.Provider value={announceScreen}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        {ROUTES.map((route) => (
          <Route key={route.path} path={route.path} element={routeElement(route)} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Box ref={liveRegion} role="status" aria-live="polite" aria-atomic="true" sx={VISUALLY_HIDDEN} />
    </ScreenAnnouncerContext.Provider>
  );
}
