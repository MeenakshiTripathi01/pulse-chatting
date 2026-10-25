import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../context/authContext.js';
import { FullPageStatus } from '../ui/FullPageStatus.jsx';

/** Renders children only for logged-in users; otherwise redirects to /login. */
export function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageStatus message="Loading your session…" />;
  if (status !== 'authenticated') {
    // Remember where the user was going so login can send them back there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** Login/register pages: logged-in users are sent to the app instead. */
export function PublicOnlyRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageStatus message="Loading…" />;
  if (status === 'authenticated') {
    return <Navigate to={location.state?.from ?? '/'} replace />;
  }
  return children;
}
