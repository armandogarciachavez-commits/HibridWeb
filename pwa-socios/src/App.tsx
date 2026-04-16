import { Routes, Route, HashRouter, Navigate, useNavigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Nutrition from './pages/Nutrition';
import { apiFetch, clearAuth } from './lib/api';

const MainLayout = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await apiFetch('/logout', { method: 'POST' }).catch(() => {});
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-container">
      <Routes>
        <Route path="/"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
        <Route path="/profile"   element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/nutrition" element={<ProtectedRoute><Nutrition /></ProtectedRoute>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
      <Navigation onLogout={handleLogout} />
    </div>
  );
};

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*"      element={<MainLayout />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
