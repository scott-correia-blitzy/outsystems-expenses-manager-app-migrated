import { Fragment, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './AuthContext';
import { canAccess, PATHS, Redirect } from '../routes';
import type { Role } from '../api/types';

export function RequireRole({
  roles,
  layout: Layout = Fragment,
  children,
}: {
  roles: readonly Role[];
  layout?: ComponentType<{ children: ReactNode }>;
  children: ReactNode;
}) {
  const { status, user, loggedOut } = useAuth();
  const { pathname, search, hash } = useLocation();
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
    const returnState = loggedOut && shownSignedIn ? undefined : { from: pathname + search + hash };
    return <Redirect to={PATHS.login} state={returnState} />;
  }

  if (!canAccess(user.roles, roles)) {
    // Same layout as the allowed page, so React keeps the shell mounted until the redirect lands.
    return (
      <Layout>
        <Redirect to={PATHS.invalidPermissions} />
      </Layout>
    );
  }

  return <Layout>{children}</Layout>;
}
