import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './AuthContext';
import { canAccess, PATHS } from '../routes';
import type { Role } from '../api/types';

export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }

  if (status === 'anonymous' || user === null) {
    // The login page sends the visitor back to this path once they sign in.
    return <Navigate to={PATHS.login} replace state={{ from: location.pathname + location.search }} />;
  }

  if (!canAccess(user.roles, roles)) {
    return <Navigate to={PATHS.invalidPermissions} replace />;
  }

  return <>{children}</>;
}
