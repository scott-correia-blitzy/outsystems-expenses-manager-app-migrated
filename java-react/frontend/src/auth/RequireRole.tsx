import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './AuthContext';
import { canAccess, PATHS } from '../routes';
import type { Role } from '../api/types';

export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { status, user, loggedOut } = useAuth();
  const location = useLocation();
  const [shownSignedIn, setShownSignedIn] = useState(false);
  if (status === 'signedIn' && !shownSignedIn) {
    setShownSignedIn(true);
  }

  if (status === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }

  if (status === 'anonymous' || user === null) {
    // The page a logout leaves is not a return path, so the next user starts at their own landing route.
    const returnState = loggedOut && shownSignedIn ? undefined : { from: location.pathname + location.search };
    return <Navigate to={PATHS.login} replace state={returnState} />;
  }

  if (!canAccess(user.roles, roles)) {
    return <Navigate to={PATHS.invalidPermissions} replace />;
  }

  return <>{children}</>;
}
