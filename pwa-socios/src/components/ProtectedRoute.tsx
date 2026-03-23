import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isTokenValid } from '../lib/api';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Envuelve rutas que requieren sesión activa.
 * Si el token no existe o está expirado, redirige a /login.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  if (!isTokenValid()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export default ProtectedRoute;
