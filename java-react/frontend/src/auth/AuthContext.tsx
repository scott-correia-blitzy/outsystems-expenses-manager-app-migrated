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
import { ApiError, type LoginRequest, type Role, type SessionUser } from '../api/types';

export type AuthStatus = 'loading' | 'anonymous' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  // True after a logout, or an expiry during one, until the next login; boot and other expiries leave it false.
  loggedOut: boolean;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  loggedOut: boolean;
  hasRole(role: Role): boolean;
  login(credentials: LoginRequest): Promise<SessionUser>;
  // False when a newer login replaced the session before the logout call settled.
  logout(): Promise<boolean>;
  // True from the start of this session's logout until the next session, even before that logout has rendered.
  sessionEndedByLogout(): boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, loggedOut: false };
const LOGGED_OUT: AuthState = { ...ANONYMOUS, loggedOut: true };

function sameIdentity(a: SessionUser, b: SessionUser): boolean {
  return (
    a.username === b.username && a.roles.length === b.roles.length && a.roles.every((role) => b.roles.includes(role))
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, loggedOut: false });
  const shownUser = useRef<SessionUser | null>(null);
  const sessionGeneration = useRef(0);
  const pendingLogout = useRef<{ generation: number; ended: Promise<boolean> } | null>(null);
  const loggedOutGeneration = useRef<number | null>(null);

  const sessionEndedByLogout = useCallback(
    (): boolean =>
      pendingLogout.current?.generation === sessionGeneration.current ||
      loggedOutGeneration.current === sessionGeneration.current,
    [],
  );

  useEffect(() => {
    shownUser.current = state.user;
  }, [state.user]);

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
        // An expiry during or after this session's logout ends it as that logout, leaving no return path.
        if (sessionEndedByLogout()) {
          setState(LOGGED_OUT);
          return;
        }
        sessionGeneration.current += 1;
        setState(ANONYMOUS);
      }),
    [sessionEndedByLogout],
  );

  useEffect(() => {
    let active = true;
    let checkingGeneration: number | null = null;
    // Concurrent 403s of one session share a check, and a login, logout or expiry meanwhile makes its answer stale.
    const unsubscribe = api.onAccessDenied(() => {
      const shown = shownUser.current;
      const generation = sessionGeneration.current;
      if (checkingGeneration === generation || shown === null || pendingLogout.current !== null) {
        return;
      }
      checkingGeneration = generation;
      const endCheck = () => {
        if (checkingGeneration === generation) {
          checkingGeneration = null;
        }
      };
      const stillCurrent = () => active && sessionGeneration.current === generation && pendingLogout.current === null;
      api.me().then(
        (user) => {
          endCheck();
          if (stillCurrent() && !sameIdentity(shown, user)) {
            sessionGeneration.current += 1;
            api.startNewSession();
            setState({ status: 'signedIn', user, loggedOut: false });
          }
        },
        (err: unknown) => {
          endCheck();
          if (stillCurrent() && err instanceof ApiError && err.status === 401) {
            sessionGeneration.current += 1;
            api.startNewSession();
            setState(ANONYMOUS);
          }
        },
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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
        loggedOutGeneration.current = sessionGeneration.current;
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
    () => ({
      status: state.status,
      user: state.user,
      loggedOut: state.loggedOut,
      hasRole,
      login,
      logout,
      sessionEndedByLogout,
    }),
    [state, hasRole, login, logout, sessionEndedByLogout],
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
