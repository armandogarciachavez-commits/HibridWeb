import { useState, useEffect } from 'react';
import { Dumbbell, Flame, Target, Zap, Activity } from 'lucide-react';
import { apiFetch } from '../lib/api';

const ScannerDisplay = () => {
  const [recentScan, setRecentScan] = useState<any>(null);

  const getClassIcon = (name: string, color: string, size = 16) => {
    const n = name.toUpperCase();
    if (n.includes('STRENGTH')) return <Dumbbell size={size} color={color} />;
    if (n.includes('UPPER BURN')) return <Flame size={size} color={color} />;
    if (n.includes('TEST')) return <Target size={size} color={color} />;
    if (n.includes('ATHLETE')) return <Zap size={size} color={color} />;
    return <Activity size={size} color={color} />;
  };

  const fmtTime = (ts: string) =>
    new Date(ts.replace(' ', 'T') + 'Z').toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });

  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  useEffect(() => {
    const fetchRecentScan = async () => {
      try {
        const res = await apiFetch('/admin/scans/recent');
        if (res.ok) {
          const data = await res.json();
          setRecentScan(data && data.id ? data : null);
        }
      } catch { /* silent */ }
    };
    fetchRecentScan();
    const interval = setInterval(fetchRecentScan, 2000);
    return () => clearInterval(interval);
  }, []);

  const accent = recentScan?.status === 'granted' ? '#00cc66' : '#ff4444';

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#050505',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {!recentScan || !recentScan.user ? (
        /* ── Estado inactivo ── */
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#3a3a3a', fontSize: 'clamp(1.8rem, 4vw, 3.5rem)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '4px', margin: 0 }}>
            Bienvenido a HybridTraining
          </h1>
          <p style={{ color: '#2a2a2a', fontSize: 'clamp(0.9rem, 1.8vw, 1.4rem)', marginTop: '16px' }}>
            Por favor, coloque su huella en el lector
          </p>
        </div>
      ) : (
        /* ── Tarjeta de acceso ── */
        <div style={{
          width: '80vw', maxHeight: '80vh',
          animation: 'fadeIn 0.4s ease-out',
          border: `3px solid ${accent}`,
          background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(0,0,0,0.85))',
          borderRadius: '20px',
          padding: 'clamp(16px, 3vh, 32px) clamp(20px, 3vw, 40px)',
          boxShadow: recentScan.status === 'granted'
            ? '0 8px 40px rgba(0,204,102,0.18)'
            : '0 8px 40px rgba(255,68,68,0.18)',
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 2vh, 20px)',
          overflow: 'hidden',
        }}>

          {/* ── Header ── */}
          <div style={{ textAlign: 'center', paddingBottom: 'clamp(8px, 1.5vh, 16px)', borderBottom: '1px solid #222' }}>
            <h2 style={{
              fontSize: 'clamp(1.6rem, 4vw, 3.2rem)',
              color: accent, margin: 0, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.1,
            }}>
              {recentScan.status === 'granted'
                ? `¡BIENVENIDO, ${recentScan.user.name.split(' ')[0]}!`
                : 'ACCESO DENEGADO'}
            </h2>
            <p style={{ color: '#666', fontSize: 'clamp(0.8rem, 1.4vw, 1.1rem)', marginTop: '6px' }}>
              {recentScan.scanned_at ? fmtTime(recentScan.scanned_at) : ''}
            </p>
          </div>

          {/* ── Body: foto + info ── */}
          <div style={{ display: 'flex', gap: 'clamp(16px, 3vw, 36px)', alignItems: 'flex-start', flex: 1, minHeight: 0 }}>

            {/* Columna izquierda: foto + nombre */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(8px, 1.5vh, 14px)' }}>
              <img
                src={recentScan.user.photo_url || recentScan.user.photo ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(recentScan.user.name)}&background=random&color=fff&size=400`}
                alt={recentScan.user.name}
                style={{
                  width: 'clamp(90px, 13vh, 160px)', height: 'clamp(90px, 13vh, 160px)',
                  borderRadius: '50%', border: `4px solid ${accent}`, objectFit: 'cover',
                }}
              />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.5rem)', color: '#fff', margin: '0 0 4px 0', fontWeight: 700 }}>
                  {recentScan.user.name}
                </h3>
                <p style={{ color: '#888', fontSize: 'clamp(0.7rem, 1.1vw, 0.9rem)', margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>
                  {recentScan.user.role}
                </p>
              </div>
            </div>

            {/* Columna derecha: membresía + agenda */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 1.5vh, 14px)', minWidth: 0 }}>

              {/* Membresía */}
              {(() => {
                const activePlan = recentScan.user.memberships?.find((m: any) => m.is_active);
                const daysLeft = activePlan
                  ? Math.ceil((new Date(activePlan.end_date).getTime() - Date.now()) / 86400000)
                  : 0;
                return (
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'clamp(10px, 2vh, 18px) clamp(12px, 2vw, 20px)', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                    <p style={{ color: '#666', fontSize: 'clamp(0.65rem, 1vw, 0.8rem)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700, margin: '0 0 8px 0' }}>Membresía</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      {activePlan ? (
                        <>
                          <span style={{ background: 'rgba(0,204,102,0.15)', color: '#00cc66', padding: '4px 16px', borderRadius: '20px', fontWeight: 700, fontSize: 'clamp(0.8rem, 1.4vw, 1.1rem)' }}>ACTIVO</span>
                          <span style={{ color: '#ccc', fontSize: 'clamp(0.75rem, 1.3vw, 1rem)' }}>
                            Renueva en <strong style={{ color: daysLeft <= 7 ? '#ff9900' : '#00cc66' }}>{daysLeft} días</strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={{ background: 'rgba(255,68,68,0.15)', color: '#ff4444', padding: '4px 16px', borderRadius: '20px', fontWeight: 700, fontSize: 'clamp(0.8rem, 1.4vw, 1.1rem)' }}>INACTIVO</span>
                          <span style={{ color: '#ccc', fontSize: 'clamp(0.75rem, 1.3vw, 1rem)' }}>Sin plan vigente.</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Agenda */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'clamp(10px, 2vh, 18px) clamp(12px, 2vw, 20px)', borderRadius: '12px', border: '1px solid #2a2a2a', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <p style={{ color: '#666', fontSize: 'clamp(0.65rem, 1vw, 0.8rem)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700, margin: '0 0 8px 0' }}>Agenda del Día</p>
                {recentScan.user.reservations && recentScan.user.reservations.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentScan.user.reservations.map((res: any) => (
                      <div key={res.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: '#111', padding: 'clamp(8px, 1.2vh, 12px) clamp(10px, 1.5vw, 16px)',
                        borderRadius: '8px', borderLeft: `4px solid ${res.class_session?.gym_class?.color || '#00cc66'}`,
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            {getClassIcon(res.class_session?.gym_class?.name || '', res.class_session?.gym_class?.color || '#fff', 14)}
                            <strong style={{ color: '#fff', fontSize: 'clamp(0.75rem, 1.3vw, 1rem)' }}>
                              {res.class_session?.gym_class?.name || 'Clase'}
                            </strong>
                          </div>
                          <span style={{ color: '#777', fontSize: 'clamp(0.65rem, 1vw, 0.8rem)' }}>
                            Instructor: {res.class_session?.instructor || 'Gimnasio'}
                          </span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: '6px', fontSize: 'clamp(0.75rem, 1.2vw, 0.95rem)', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                          {res.class_session?.start_time?.substring(0, 5)} - {res.class_session?.end_time?.substring(0, 5)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#555', margin: 0, fontStyle: 'italic', fontSize: 'clamp(0.75rem, 1.2vw, 0.95rem)' }}>
                    No hay clases separadas para hoy.
                  </p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScannerDisplay;
