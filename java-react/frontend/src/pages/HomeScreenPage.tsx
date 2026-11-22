import { useAuth } from '../auth/AuthContext';
import { PATHS, Redirect, landingRouteFor } from '../routes';

export function HomeScreenPage() {
  const { user } = useAuth();
  return <Redirect to={user ? landingRouteFor(user.roles) : PATHS.login} />;
}
