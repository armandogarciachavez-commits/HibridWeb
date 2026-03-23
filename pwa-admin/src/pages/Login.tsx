import { useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: (token: string, role: string, name: string) => void;
}

const Login = ({ onLogin }: LoginProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Credenciales incorrectas.');
        return;
      }

      const role: string = data.user?.role ?? '';

      if (!['admin', 'superadmin'].includes(role)) {
        setError('No tienes permisos para acceder al panel de administración.');
        return;
      }

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_role', role);
      localStorage.setItem('user_name', data.user?.name ?? '');
      localStorage.setItem('user_id', String(data.user?.id ?? ''));

      onLogin(data.token, role, data.user?.name ?? '');
    } catch {
      setError('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--background)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      zIndex: 50,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '12px',
            background: 'var(--primary)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: '16px',
          }}>
            <LogIn size={28} color="#fff" />
          </div>
          <h1 style={{ color: 'var(--text)', fontSize: '1.5rem', marginBottom: '6px' }}>Panel de Administración</h1>
          <p style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>Acceso restringido a administradores</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input
              type="text"
              className="form-control"
              placeholder="Nombre de usuario"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div style={{
              marginTop: '16px', padding: '10px 14px',
              background: 'rgba(255,68,68,0.1)', color: '#ff4444',
              borderRadius: '6px', border: '1px solid rgba(255,68,68,0.3)',
              fontSize: '0.88rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn"
            disabled={loading}
            style={{ width: '100%', marginTop: '24px', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
