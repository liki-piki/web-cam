import { Navigate, useLocation } from 'react-router-dom';
import { getCurrentCreator } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiresCreator?: boolean;
}

export const ProtectedRoute = ({ children, requiresCreator = false }: ProtectedRouteProps) => {
  const location = useLocation();
  const currentCreator = getCurrentCreator();

  if (requiresCreator && !currentCreator) {
    // Redirect to login if trying to access creator-only routes
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};