import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { PATHS, landingRouteFor } from '../routes';

export function HomeScreenPage() {
  const { user } = useAuth();
  return <Navigate to={user ? landingRouteFor(user.roles) : PATHS.login} replace />;
}
