import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (res.ok && data.token) {
        // Guardar token y redirigir
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_name', data.user.name);
        localStorage.setItem('user_id', String(data.user.id ?? ''));
        navigate('/');
      } else {
        setErrorMsg(data.message || 'Credenciales incorrectas');
      }
    } catch (error) {
      setErrorMsg('Error de red. Verifica conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ color: 'var(--primary)', fontSize: '2rem', fontWeight: '900', letterSpacing: 'tight', textTransform: 'uppercase' }}>Hybrid</h1>
        <p style={{ color: 'var(--secondary)', fontSize: '1rem', marginTop: '5px' }}>Portal de Socios</p>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--text)', marginBottom: '20px', fontSize: '1.2rem' }}>INICIA SESIÓN</h2>
        
        {errorMsg && (
          <div style={{ background: 'rgba(255,0,0,0.1)', color: '#ff4444', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '0.9rem' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Usuario</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', padding: '12px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '6px' }} 
              placeholder="tu_usuario_aqui"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Contraseña</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '6px' }} 
              placeholder="********"
            />
          </div>
          
          <button type="submit" className="btn" disabled={loading} style={{ marginTop: '10px', width: '100%', justifyContent: 'center' }}>
            {loading ? 'Conectando...' : 'Entrar'}
          </button>
        </form>
      </div>
      <p style={{ textAlign: 'center', marginTop: '24px', color: 'var(--secondary)', fontSize: '0.85rem' }}>
        ¿No tienes cuenta? <a href="#" style={{ color: 'var(--primary)' }}>Únete al Gimnasio</a>
      </p>
    </div>
  );
};

export default Login;
