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
}

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  hasRole(role: Role): boolean;
  login(credentials: LoginRequest): Promise<SessionUser>;
  logout(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const ANONYMOUS: AuthState = { status: 'anonymous', user: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const sessionGeneration = useRef(0);

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
      (user) => applyBootResult({ status: 'signedIn', user }),
      () => applyBootResult(ANONYMOUS),
    );
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginRequest): Promise<SessionUser> => {
    const user = await api.login({
      username: credentials.username,
      password: credentials.password,
      rememberMe: credentials.rememberMe,
    });
    sessionGeneration.current += 1;
    setState({ status: 'signedIn', user });
    return user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await Promise.allSettled([api.logout()]);
    sessionGeneration.current += 1;
    setState(ANONYMOUS);
    // Logout deletes the XSRF-TOKEN cookie; the 401 answer to this call carries a fresh one.
    await Promise.allSettled([api.me()]);
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
    () => ({ status: state.status, user: state.user, hasRole, login, logout }),
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
