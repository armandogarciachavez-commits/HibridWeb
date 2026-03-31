import { QrCode, Dumbbell, CreditCard, Loader2, Clock, Users, X, Calendar, Flame, Target, Zap, Activity, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

const Dashboard = () => {
  const [loading, setLoading]             = useState(true);
  const [paying, setPaying]               = useState(false);
  const [user, setUser]                   = useState<any>(null);
  const [catalog, setCatalog]             = useState<any[]>([]);
  const [selected, setSelected]           = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [annIdx, setAnnIdx]               = useState(0);
  const [annImage, setAnnImage]           = useState<string | null>(null);
  const annTimer                          = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await apiFetch('/user');
        if (!res.ok) { navigate('/login'); return; }
        const data = await res.json();
        const activePlan = data.memberships?.find((m: any) => m.is_active);

        let planName = 'Sin Plan Activo', statusText = 'Expirado', endDate = 'N/A', daysLeft = -1;
        let isExpiringSoon = false;
        if (activePlan) {
          planName   = activePlan.plan_type.toUpperCase();
          statusText = 'Activo';
          const endD = new Date(activePlan.end_date);
          endD.setHours(23, 59, 59, 999);
          daysLeft = Math.ceil((endD.getTime() - Date.now()) / 86400000);
          endDate  = endD.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
          if (daysLeft <= 7 && daysLeft >= 0) isExpiringSoon = true;
        }
        localStorage.setItem('user_status', statusText);
        setUser({ name: data.name, photo: data.photo_url || data.photo, plan: planName, status: statusText, membershipEnd: endDate, daysLeft, isExpiringSoon: isExpiringSoon || !activePlan });
      } catch { navigate('/login'); }
      finally  { setLoading(false); }
    };

    const fetchCatalog = async () => {
      try {
        const res = await apiFetch('/catalog');
        const data = await res.json();
        setCatalog(Array.isArray(data) ? data : []);
      } catch { /* catálogo silencioso — no bloquea la pantalla */ }
    };

    const fetchAnnouncements = async () => {
      try {
        const res = await apiFetch('/announcements');
        if (res.ok) setAnnouncements(await res.json());
      } catch { /* silencioso */ }
    };

    fetchUser();
    fetchCatalog();
    fetchAnnouncements();
  }, [navigate]);

  // Auto-avance del carrusel cada 5s
  useEffect(() => {
    if (announcements.length <= 1) return;
    annTimer.current = setInterval(() => setAnnIdx(i => (i + 1) % announcements.length), 5000);
    return () => { if (annTimer.current) clearInterval(annTimer.current); };
  }, [announcements]);

  const handleRenew = async () => {
    setPaying(true);
    try {
      const res  = await apiFetch('/payments/create-preference', { method: 'POST' });
      const data = await res.json();
      if (data.sandbox_init_point) window.location.href = data.sandbox_init_point;
      else alert('Error al generar enlace de pago');
    } catch { alert('No se pudo conectar con Mercado Pago'); }
    finally  { setPaying(false); }
  };

  if (loading || !user) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
      <Loader2 className="animate-spin" size={30} color="var(--primary)" />
    </div>
  );

  const daysMap: Record<number, string> = { 0:'Dom', 1:'Lun', 2:'Mar', 3:'Mié', 4:'Jue', 5:'Vie', 6:'Sáb' };
  const parseDays = (raw: any): string => {
    try {
      const arr: number[] = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr.map(d => daysMap[d] ?? d).join(' · ') : '';
    } catch { return ''; }
  };

  const getClassIcon = (name: string, color: string, size = 18) => {
    const n = name.toUpperCase();
    if (n.includes('STRENGTH')) return <Dumbbell size={size} color={color} />;
    if (n.includes('UPPER BURN')) return <Flame size={size} color={color} />;
    if (n.includes('TEST')) return <Target size={size} color={color} />;
    if (n.includes('ATHLETE')) return <Zap size={size} color={color} />;
    return <Activity size={size} color={color} />;
  };

  return (
    <div style={{ padding: '20px', paddingBottom: '100px' }}>

      {/* Anuncios / Promociones */}
      {announcements.length > 0 && (
        <section style={{ marginBottom: '24px', position: 'relative' }}>
          <div style={{
            borderRadius: '14px', overflow: 'hidden',
            background: 'var(--surface)', border: '1px solid #222',
            position: 'relative', minHeight: '100px',
          }}>
            {/* Slide activo */}
            {announcements[annIdx].image && (
              <img
                src={announcements[annIdx].image}
                alt=""
                onClick={() => setAnnImage(announcements[annIdx].image)}
                style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
              />
            )}
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Megaphone size={14} color="#ff2222" />
                <span style={{ fontSize: '0.72rem', color: '#ff2222', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Anuncio</span>
              </div>
              <h3 style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
                {announcements[annIdx].title}
              </h3>
              {announcements[annIdx].body && (
                <p style={{ color: 'var(--secondary)', fontSize: '0.88rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {announcements[annIdx].body}
                </p>
              )}
            </div>

            {/* Navegación si hay más de 1 */}
            {announcements.length > 1 && (
              <>
                <button onClick={() => { setAnnIdx(i => (i - 1 + announcements.length) % announcements.length); }}
                  style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => { setAnnIdx(i => (i + 1) % announcements.length); }}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                  <ChevronRight size={16} />
                </button>
                {/* Dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', padding: '8px 0 4px' }}>
                  {announcements.map((_, i) => (
                    <div key={i} onClick={() => setAnnIdx(i)} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === annIdx ? 'var(--primary)' : '#444', cursor: 'pointer', transition: 'background 0.3s' }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Header */}
      <header style={{ marginBottom: '24px', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--text)', fontSize: '1.5rem', marginBottom: '4px' }}>Hola, {user.name}</h1>
        <p style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>Bienvenido de nuevo a Hybrid Training</p>
      </header>

      {/* Tarjeta membresía */}
      <section className="card" style={{ marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', background: 'var(--primary)', opacity: 0.1, borderRadius: '0 0 0 100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text)', marginBottom: '4px' }}>{user.plan}</h2>
            <span style={{ display: 'inline-block', padding: '4px 8px', background: user.status === 'Activo' ? 'rgba(0,204,102,0.12)' : 'rgba(255,68,68,0.12)', color: user.status === 'Activo' ? '#00cc66' : '#ff4444', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
              {user.status}
            </span>
          </div>
          <Dumbbell size={32} color="var(--primary)" />
        </div>
        <div style={{ borderTop: '1px solid #333', paddingTop: '16px', fontSize: '0.85rem' }}>
          <p style={{ color: 'var(--secondary)' }}>Vigencia</p>
          <p style={{ color: 'var(--text)', fontWeight: 'bold', fontSize: '1.1rem' }}>Hasta {user.membershipEnd}</p>
          {user.daysLeft <= 7 && user.daysLeft >= 0 && user.status === 'Activo' && (
            <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444', borderRadius: '6px', color: '#fff', display: 'inline-block', fontSize: '0.85rem' }}>
              ⚠️ <strong>Aviso:</strong> Te quedan <strong>{user.daysLeft}</strong> días para vencer
            </div>
          )}
          {user.status !== 'Activo' && <div style={{ marginTop: '10px', color: '#ff4444', fontWeight: 'bold', fontSize: '0.9rem' }}>Membresía sin vigencia.</div>}
        </div>
        {user.isExpiringSoon && (
          <div style={{ marginTop: '20px' }}>
            <button className="btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg,#ff4444 0%,#cc0000 100%)', border: 'none', color: '#fff' }} onClick={handleRenew} disabled={paying}>
              {paying ? <Loader2 className="animate-spin" size={18} /> : <CreditCard size={18} />}
              {paying ? 'Procesando...' : 'Renovar con Mercado Pago'}
            </button>
          </div>
        )}
      </section>

      {/* Acceso */}
      <section className="card" style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', padding: user?.photo ? '0' : '16px', borderRadius: '50%', background: user?.photo ? 'transparent' : 'rgba(0,102,255,0.1)', marginBottom: '12px' }}>
          {user?.photo ? (
            <img src={user.photo} alt={user.name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary)' }} />
          ) : (
            <QrCode size={36} color="var(--primary)" />
          )}
        </div>
        <h3 style={{ marginBottom: '6px', color: 'var(--text)' }}>Acceso Confirmado</h3>
        <p style={{ color: 'var(--secondary)', fontSize: '0.88rem' }}>Usa tu huella digital en los torniquetes para ingresar.</p>
      </section>

      {/* Clases disponibles */}
      {catalog.length > 0 && (
        <section>
          <h2 style={{ color: 'var(--text)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '14px' }}>Clases disponibles</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {catalog.map(cls => (
              <div
                key={cls.id}
                onClick={() => setSelected(cls)}
                style={{ borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', background: 'var(--surface)', border: '1px solid #222', transition: 'transform 0.15s, box-shadow 0.15s', position: 'relative' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
              >
                <div style={{ height: '6px', background: cls.color || 'var(--primary)' }} />
                <div style={{ padding: '14px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {getClassIcon(cls.name, cls.color || 'var(--primary)')}
                    <h3 style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{cls.name}</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <Clock size={11} /> {cls.default_duration_minutes} min
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <Users size={11} /> Cupo: {cls.default_capacity}
                  </div>
                  {parseDays(cls.days_of_week) && (
                    <div style={{ fontSize: '0.7rem', color: cls.color || 'var(--primary)', fontWeight: 600, marginTop: '6px' }}>
                      {parseDays(cls.days_of_week)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal detalle clase */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300, padding: '0' }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ background: 'var(--surface)', width: '100%', maxWidth: '480px', borderRadius: '20px 20px 0 0', padding: '0 0 24px', overflow: 'hidden', animation: 'slideUp 0.25s ease' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: '8px', background: selected.color || 'var(--primary)' }} />
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.2rem', color: 'var(--text)', fontWeight: 700, lineHeight: 1.2, flex: 1, paddingRight: '12px' }}>{selected.name}</h2>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                  <X size={22} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'var(--background)', padding: '12px', borderRadius: '10px' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '3px' }}>ENTRENADOR</p>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 600 }}>{selected.trainer || '—'}</p>
                </div>
                <div style={{ background: 'var(--background)', padding: '12px', borderRadius: '10px' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '3px' }}>DURACIÓN</p>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 600 }}>{selected.default_duration_minutes} min</p>
                </div>
                <div style={{ background: 'var(--background)', padding: '12px', borderRadius: '10px' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '3px' }}>CUPO MÁX.</p>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 600 }}>{selected.default_capacity} personas</p>
                </div>
                <div style={{ background: 'var(--background)', padding: '12px', borderRadius: '10px' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '3px' }}>DÍAS</p>
                  <p style={{ fontSize: '0.88rem', color: selected.color || 'var(--primary)', fontWeight: 600 }}>{parseDays(selected.days_of_week) || '—'}</p>
                </div>
              </div>

              {selected.description && (
                <div style={{ background: 'var(--background)', padding: '14px', borderRadius: '10px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '5px' }}>DESCRIPCIÓN</p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.5 }}>{selected.description}</p>
                </div>
              )}

              <button
                className="btn"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: selected.color || 'var(--primary)', border: 'none', fontSize: '1rem', padding: '14px' }}
                onClick={() => { setSelected(null); navigate('/schedule'); }}
              >
                <Calendar size={18} /> Agendar esta clase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox imagen anuncio */}
      {annImage && (
        <div
          onClick={() => setAnnImage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '16px' }}
        >
          <button onClick={() => setAnnImage(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={20} />
          </button>
          <img
            src={annImage}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
          />
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
