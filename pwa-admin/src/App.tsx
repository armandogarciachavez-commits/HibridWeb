import { useState } from 'react';
import { Routes, Route, HashRouter, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/ToastContext';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Reservations from './pages/Reservations';
import Biometrics from './pages/Biometrics';
import AdminManager from './pages/AdminManager';
import ScannerDisplay from './pages/ScannerDisplay';
import Announcements from './pages/Announcements';
import Accounting from './pages/Accounting';
import Nutrition from './pages/Nutrition';
import { apiFetch, isTokenValid } from './lib/api';
import { useLocation } from 'react-router-dom';

function AppContent({ handleLogout }: { handleLogout: () => void }) {
  const location = useLocation();
  const isScannerDisplay = location.pathname === '/scanner-display';

  return (
    <>
      {!isScannerDisplay && <Navigation onLogout={handleLogout} />}
      <div className={!isScannerDisplay ? "admin-content" : ""}>
        <Routes>
          <Route path="/"           element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/users"      element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/calendar"   element={<ProtectedRoute><Reservations /></ProtectedRoute>} />
          <Route path="/biometrics"    element={<ProtectedRoute><Biometrics /></ProtectedRoute>} />
          <Route path="/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
          <Route path="/accounting"    element={<ProtectedRoute><Accounting /></ProtectedRoute>} />
          <Route path="/nutrition"     element={<ProtectedRoute><Nutrition /></ProtectedRoute>} />
          <Route path="/admins"        element={<ProtectedRoute requireSuperAdmin><AdminManager /></ProtectedRoute>} />
          <Route path="/scanner-display" element={<ProtectedRoute><ScannerDisplay /></ProtectedRoute>} />
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  const [authed, setAuthed] = useState(() => {
    const role = localStorage.getItem('user_role');
    // Verifica que el token exista, sea válido (no expirado) y tenga rol permitido
    return isTokenValid() && ['admin', 'superadmin'].includes(role ?? '');
  });

  const handleLogin = (token: string, role: string, name: string) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_role', role);
    localStorage.setItem('user_name', name);
    setAuthed(true);
  };

  const handleLogout = async () => {
    // Llama al endpoint de logout usando apiFetch centralizado
    await apiFetch('/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_id');
    setAuthed(false);
  };

  return (
    <ToastProvider>
      <HashRouter>
        {!authed ? (
          <Routes>
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <AppContent handleLogout={handleLogout} />
        )}
      </HashRouter>
    </ToastProvider>
  );
}

export default App;
