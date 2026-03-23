import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  requireSuperAdmin?: boolean;
}

const ProtectedRoute = ({ children, requireSuperAdmin = false }: ProtectedRouteProps) => {
  const token = localStorage.getItem('auth_token');
  const role  = localStorage.getItem('user_role');

  if (!token || !['admin', 'superadmin'].includes(role ?? '')) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && role !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
