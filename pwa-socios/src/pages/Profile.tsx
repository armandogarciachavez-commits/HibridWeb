import { useState, useEffect } from 'react';
import { User, Phone, Mail, MapPin, Loader2, Activity } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface UserData {
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  memberships?: Array<{
    plan_type: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
  }>;
}

const Profile = () => {
  const [userData, setUserData]   = useState<UserData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [weight, setWeight]       = useState('');
  const [height, setHeight]       = useState('');
  const [bmi, setBmi]             = useState<number | null>(null);
  const [bmiStatus, setBmiStatus] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res  = await apiFetch('/user');
        if (!res.ok) return;
        const data = await res.json();
        setUserData(data);
      } catch {
        /* silencioso — ProtectedRoute ya garantiza sesión válida */
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const calculateBMI = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weight);
    const h = parseFloat(height) / 100;
    if (w > 0 && h > 0) {
      const result = w / (h * h);
      setBmi(parseFloat(result.toFixed(1)));
      if      (result < 18.5) setBmiStatus('Peso Bajo');
      else if (result < 25)   setBmiStatus('Normal');
      else if (result < 30)   setBmiStatus('Sobrepeso');
      else                    setBmiStatus('Obesidad');
    }
  };

  const activePlan = userData?.memberships?.find(m => m.is_active);

  const bmiColor = () => {
    if (!bmiStatus) return 'var(--primary)';
    if (bmiStatus === 'Normal')       return '#00cc66';
    if (bmiStatus === 'Peso Bajo')    return '#f59e0b';
    if (bmiStatus === 'Sobrepeso')    return '#f97316';
    return '#ff4444';
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
      <Loader2 className="animate-spin" size={30} color="var(--primary)" />
    </div>
  );

  return (
    <div style={{ padding: '20px', paddingBottom: '100px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--text)', fontSize: '1.5rem' }}>Mi Perfil</h1>
        <p style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>Tu información y progreso físico.</p>
      </header>

      {/* Avatar + nombre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700 }}>
            {(userData?.name ?? '?').charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: '1.15rem', fontWeight: 700, marginBottom: '2px' }}>{userData?.name ?? '—'}</h2>
          <p style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>@{userData?.username ?? '—'}</p>
          {activePlan && (
            <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', background: 'rgba(0,204,102,0.12)', color: '#00cc66', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
              {activePlan.plan_type.toUpperCase()} — ACTIVO
            </span>
          )}
        </div>
      </div>

      {/* Información de contacto */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text)' }}>Información de Contacto</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,102,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={16} color="var(--primary)" />
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '1px' }}>NOMBRE COMPLETO</p>
              <p style={{ fontSize: '0.92rem', color: 'var(--text)' }}>{userData?.name || '—'}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,102,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mail size={16} color="var(--primary)" />
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '1px' }}>EMAIL</p>
              <p style={{ fontSize: '0.92rem', color: userData?.email ? 'var(--text)' : 'var(--secondary)' }}>
                {userData?.email || 'No registrado'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,102,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Phone size={16} color="var(--primary)" />
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '1px' }}>TELÉFONO</p>
              <p style={{ fontSize: '0.92rem', color: userData?.phone ? 'var(--text)' : 'var(--secondary)' }}>
                {userData?.phone || 'No registrado'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,102,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MapPin size={16} color="var(--primary)" />
            </div>
            <div>
              <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '1px' }}>DIRECCIÓN</p>
              <p style={{ fontSize: '0.92rem', color: userData?.address ? 'var(--text)' : 'var(--secondary)' }}>
                {userData?.address || 'No registrada'}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Historial de membresía */}
      {userData?.memberships && userData.memberships.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text)' }}>Historial de Membresía</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {userData.memberships.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--background)', borderRadius: '8px', border: `1px solid ${m.is_active ? 'rgba(0,204,102,0.3)' : '#222'}` }}>
                <div>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{m.plan_type.toUpperCase()}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>
                    {new Date(m.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })} →{' '}
                    {new Date(m.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '10px', fontWeight: 700, background: m.is_active ? 'rgba(0,204,102,0.12)' : 'rgba(255,255,255,0.05)', color: m.is_active ? '#00cc66' : 'var(--secondary)' }}>
                  {m.is_active ? 'Activo' : 'Expirado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calculadora IMC */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Activity size={18} color="var(--primary)" />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Calculadora de IMC</h2>
        </div>
        <form onSubmit={calculateBMI} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '4px' }}>Peso (kg)</label>
              <input
                type="number"
                required
                min="1"
                max="300"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                style={{ width: '100%', padding: '10px', background: 'var(--background)', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                placeholder="Ej. 75"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '4px' }}>Altura (cm)</label>
              <input
                type="number"
                required
                min="50"
                max="250"
                value={height}
                onChange={e => setHeight(e.target.value)}
                style={{ width: '100%', padding: '10px', background: 'var(--background)', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                placeholder="Ej. 175"
              />
            </div>
          </div>
          <button type="submit" className="btn" style={{ width: '100%' }}>Calcular</button>
        </form>

        {bmi !== null && (
          <div style={{ marginTop: '20px', padding: '20px', background: 'var(--background)', border: `1px solid ${bmiColor()}`, borderRadius: '10px', textAlign: 'center' }}>
            <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '6px' }}>Tu Índice de Masa Corporal</p>
            <p style={{ color: bmiColor(), fontSize: '2.4rem', fontWeight: 900, lineHeight: 1 }}>{bmi}</p>
            <p style={{ color: bmiColor(), fontWeight: 700, marginTop: '8px', fontSize: '1rem' }}>{bmiStatus}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '14px' }}>
              {[['< 18.5', 'Bajo', '#f59e0b'], ['18.5–24.9', 'Normal', '#00cc66'], ['25–29.9', 'Sobrepeso', '#f97316'], ['≥ 30', 'Obesidad', '#ff4444']].map(([range, label, color]) => (
                <div key={label} style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: `1px solid ${bmiStatus === label ? color : '#222'}` }}>
                  <p style={{ fontSize: '0.65rem', color, fontWeight: 700 }}>{label}</p>
                  <p style={{ fontSize: '0.6rem', color: 'var(--secondary)' }}>{range}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
