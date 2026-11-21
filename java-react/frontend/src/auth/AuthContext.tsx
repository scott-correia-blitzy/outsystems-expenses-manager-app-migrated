import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as api from '../api/api';
import type { LoginRequest, Role, SessionUser } from '../api/types';

export type AuthStatus = 'loading' | 'anonymous' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  // True after a deliberate logout until the next login; boot and session expiry leave it false.
  loggedOut: boolean;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  loggedOut: boolean;
  hasRole(role: Role): boolean;
  login(credentials: LoginRequest): Promise<SessionUser>;
  // False when a newer login or an expiry replaced the session before the logout call settled.
  logout(): Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, loggedOut: false };
const LOGGED_OUT: AuthState = { ...ANONYMOUS, loggedOut: true };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, loggedOut: false });
  const sessionGeneration = useRef(0);
  const pendingLogout = useRef<{ generation: number; ended: Promise<boolean> } | null>(null);

  useEffect(() => {
    let active = true;
    const bootGeneration = sessionGeneration.current;
    // A login or logout that completes first owns the session, so a slower boot answer is dropped.
    const applyBootResult = (next: AuthState) => {
      if (active && sessionGeneration.current === bootGeneration) {
        setState(next);
      }
    };
    api.me().then(
      (user) => applyBootResult({ status: 'signedIn', user, loggedOut: false }),
      () => applyBootResult(ANONYMOUS),
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      api.onSessionExpired(() => {
        sessionGeneration.current += 1;
        setState(ANONYMOUS);
      }),
    [],
  );

  const login = useCallback(async (credentials: LoginRequest): Promise<SessionUser> => {
    const user = await api.login({
      username: credentials.username,
      password: credentials.password,
      rememberMe: credentials.rememberMe,
    });
    sessionGeneration.current += 1;
    setState({ status: 'signedIn', user, loggedOut: false });
    return user;
  }, []);

  const logout = useCallback((): Promise<boolean> => {
    const generation = sessionGeneration.current;
    const pending = pendingLogout.current;
    if (pending !== null && pending.generation === generation) {
      return pending.ended;
    }
    const ended = Promise.allSettled([api.logout()]).then(() => {
      if (pendingLogout.current?.ended === ended) {
        pendingLogout.current = null;
      }
      const ownsSession = sessionGeneration.current === generation;
      if (ownsSession) {
        sessionGeneration.current += 1;
        setState(LOGGED_OUT);
      }
      // Logout deletes the XSRF-TOKEN cookie; any answer to this call, a 401 included, sets a fresh one.
      void Promise.allSettled([api.me()]);
      return ownsSession;
    });
    pendingLogout.current = { generation, ended };
    return ended;
  }, []);

  const hasRole = useCallback(
    (role: Role): boolean => {
      if (state.status !== 'signedIn' || state.user === null) {
        return false;
      }
      return role === 'Registered' || state.user.roles.includes(role);
    },
    [state],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, user: state.user, loggedOut: state.loggedOut, hasRole, login, logout }),
    [state, hasRole, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
