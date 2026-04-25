import { useState, useEffect } from 'react';
import { Users, AlertTriangle, CalendarRange, Dumbbell, Flame, Target, Zap, Activity } from 'lucide-react';
import { apiFetch } from '../lib/api';

const Dashboard = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpiring, setShowExpiring] = useState(false);
  const [recentScan, setRecentScan] = useState<any>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/admin/users');
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching admin stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();

    // Polling recent scans every 3 seconds
    // Si el VPS no responde (sin internet) → fallback al bridge local
    const fetchRecentScan = async () => {
      try {
        const res = await apiFetch('/admin/scans/recent');
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) { setRecentScan(data); return; }
        }
      } catch (e) { /* VPS sin respuesta — intentar bridge local */ }

      // Fallback: bridge local (funciona 100% offline)
      try {
        const res = await fetch('http://localhost:7072/recent-scan',
          { signal: AbortSignal.timeout(800) });
        if (res.ok) {
          const data = await res.json();
          setRecentScan(data && data.id ? data : null);
        }
      } catch (e) { /* sin bridge tampoco — ignorar */ }
    };
    fetchRecentScan();
    const scanInterval = setInterval(fetchRecentScan, 3000);

    return () => clearInterval(scanInterval);
  }, []);

  const now = new Date();
  const next7Days = new Date();
  next7Days.setDate(now.getDate() + 7);

  // Calcular Socios Activos
  const activeUsers = users.filter(u => u.memberships?.some((m: any) => m.is_active));

  // Calcular Socios Próximos a Vencer (dentro de 7 días y que el plan siga activo)
  const expiringUsers = users.filter(u => {
    const activePlan = u.memberships?.find((m: any) => m.is_active);
    if (!activePlan) return false;
    const endDate = new Date(activePlan.end_date);
    return endDate >= now && endDate <= next7Days;
  }).map(u => {
    const activePlan = u.memberships?.find((m: any) => m.is_active);
    return {
      ...u,
      endDate: new Date(activePlan.end_date)
    };
  });

  const getClassIcon = (name: string, color: string, size = 18) => {
    const n = name.toUpperCase();
    if (n.includes('STRENGTH')) return <Dumbbell size={size} color={color} />;
    if (n.includes('UPPER BURN')) return <Flame size={size} color={color} />;
    if (n.includes('TEST')) return <Target size={size} color={color} />;
    if (n.includes('ATHLETE')) return <Zap size={size} color={color} />;
    return <Activity size={size} color={color} />;
  };

  return (
    <div>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ color: 'var(--text)', fontSize: '1.8rem', marginBottom: '8px' }}>Dashboard Administrativo</h1>
        <p style={{ color: 'var(--secondary)' }}>Resumen general del gimnasio</p>
      </header>

      {loading ? (
        <p style={{ color: 'var(--secondary)' }}>Cargando estadísticas...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
             {/* Card Socios Activos */}
             <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'linear-gradient(145deg, rgba(0,204,102,0.1), rgba(0,0,0,0.5))', border: '1px solid rgba(0,204,102,0.2)' }}>
                <div style={{ padding: '20px', background: 'rgba(0,204,102,0.2)', borderRadius: '12px' }}>
                  <Users size={35} color="#00cc66" />
                </div>
                <div>
                  <p style={{ color: 'var(--secondary)', fontSize: '1rem', marginBottom: '5px' }}>Socios Activos</p>
                  <h2 style={{ fontSize: '2.5rem', color: 'var(--text)', margin: 0 }}>{activeUsers.length}</h2>
                </div>
             </div>

             {/* Card Vencimientos Próximos */}
             <div 
                className="card" 
                onClick={() => setShowExpiring(!showExpiring)}
                style={{ display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer', background: 'linear-gradient(145deg, rgba(255,153,0,0.1), rgba(0,0,0,0.5))', border: '1px solid rgba(255,153,0,0.2)', transition: 'all 0.3s ease' }}
              >
                <div style={{ padding: '20px', background: 'rgba(255,153,0,0.2)', borderRadius: '12px' }}>
                  <AlertTriangle size={35} color="#ff9900" />
                </div>
                <div>
                  <p style={{ color: 'var(--secondary)', fontSize: '1rem', marginBottom: '5px' }}>Vencen en 7 Días</p>
                  <h2 style={{ fontSize: '2.5rem', color: 'var(--text)', margin: 0 }}>{expiringUsers.length}</h2>
                  <p style={{ color: '#ff9900', fontSize: '0.8rem', marginTop: '5px' }}>Ver detalles ↗</p>
                </div>
             </div>
          </div>

          {/* Ficha de Socio de Acceso Reciente (Escáner Biométrico) */}
          <div className="card" style={{ marginBottom: '30px', animation: 'fadeIn 0.5s ease', border: recentScan && recentScan.user ? (recentScan.status === 'granted' ? '2px solid #00cc66' : '2px solid #ff4444') : '1px solid #333', background: recentScan && recentScan.user ? 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.6))' : 'rgba(255,255,255,0.02)' }}>
            
            {/* Header/Banner Welcome */}
            <div style={{ textAlign: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #333' }}>
              <h2 style={{ fontSize: '1.8rem', color: recentScan && recentScan.user ? (recentScan.status === 'granted' ? '#00cc66' : '#ff4444') : 'var(--secondary)', margin: 0, fontWeight: 'bold', letterSpacing: !recentScan || !recentScan.user ? '2px' : 'normal' }}>
                {recentScan && recentScan.user ? (recentScan.status === 'granted' ? `¡Bienvenido, ${recentScan.user.name.split(' ')[0]}!` : 'Acceso Denegado') : 'ESPERANDO ACCESO'}
              </h2>
              <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginTop: '5px' }}>
                {recentScan && recentScan.user ? `Escaneo detectado a las ${recentScan.scanned_at ? new Date(recentScan.scanned_at.replace(' ', 'T') + 'Z').toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : ''}` : 'Acerca tu huella al lector para registrar tu entrada'}
              </p>
            </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', alignItems: 'flex-start' }}>
                {/* Left: Photo & Basic Info */}
                <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', minWidth: '150px' }}>
                  {recentScan && recentScan.user ? (
                    <img 
                      src={recentScan.user.photo_url || recentScan.user.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(recentScan.user.name)}&background=random&color=fff&size=150`}
                      alt={recentScan.user.name} 
                      style={{ width: '120px', height: '120px', borderRadius: '50%', border: '3px solid #444', objectFit: 'cover' }} 
                    />
                  ) : (
                    <div style={{ width: '120px', height: '120px', borderRadius: '50%', border: '3px dashed #444', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                      <Activity size={40} color="#555" />
                    </div>
                  )}
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ fontSize: '1.2rem', color: recentScan && recentScan.user ? 'var(--text)' : '#555', margin: '0 0 5px 0' }}>
                      {recentScan && recentScan.user ? recentScan.user.name : 'Nombre del Socio'}
                    </h3>
                    <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', margin: 0 }}>
                      Rol: <span style={{ textTransform: 'capitalize' }}>{recentScan && recentScan.user ? recentScan.user.role : '---'}</span>
                    </p>
                  </div>
                </div>

                {/* Right: Status & Classes */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Status Block */}
                  {(() => {
                     if (!recentScan || !recentScan.user) {
                       return (
                         <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                           <h4 style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Estado de Membresía</h4>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                              <span style={{ background: 'rgba(255,255,255,0.05)', color: '#555', padding: '5px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '1rem' }}>Esperando Escaneo</span>
                           </div>
                         </div>
                       );
                     }

                     const activePlan = recentScan.user.memberships?.find((m: any) => m.is_active);
                     let daysLeft = 0;
                     if (activePlan) {
                       const end = new Date(activePlan.end_date);
                       daysLeft = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                     }

                     return (
                       <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                         <h4 style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Estado de Membresía</h4>
                         {activePlan ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                              <span style={{ background: 'rgba(0,204,102,0.2)', color: '#00cc66', padding: '5px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '1rem' }}>Socio Activo</span>
                              <span style={{ color: 'var(--text)', fontSize: '1rem' }}>Le quedan <strong style={{color: daysLeft <= 7 ? '#ff9900' : '#00cc66'}}>{daysLeft} días</strong> para renovar</span>
                            </div>
                         ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                              <span style={{ background: 'rgba(255,68,68,0.2)', color: '#ff4444', padding: '5px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '1rem' }}>Socio Inactivo</span>
                              <span style={{ color: 'var(--text)', fontSize: '1rem' }}>No tiene ningún plan activo o vigente.</span>
                            </div>
                         )}
                       </div>
                     );
                  })()}

                  {/* Classes Block */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                     <h4 style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Clases Agendadas Hoy</h4>
                     {!recentScan || !recentScan.user ? (
                        <p style={{ color: '#555', margin: 0, fontStyle: 'italic', fontSize: '0.9rem' }}>Esperando lectura biométrica...</p>
                     ) : recentScan.user.reservations && recentScan.user.reservations.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                           {recentScan.user.reservations.map((res: any) => (
                              <div key={res.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '10px 15px', borderRadius: '8px', borderLeft: `4px solid ${res.class_session?.gym_class?.color || '#00cc66'}` }}>
                                 <div>
                                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                     {getClassIcon(res.class_session?.gym_class?.name || '', res.class_session?.gym_class?.color || 'var(--text)', 16)}
                                     <strong style={{ display: 'block', color: 'var(--text)' }}>{res.class_session?.gym_class?.name || 'Clase'}</strong>
                                   </div>
                                   <span style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>Instructor: {res.class_session?.instructor || 'Gimnasio'}</span>
                                 </div>
                                 <div style={{ background: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>
                                   {res.class_session?.start_time?.substring(0,5)} - {res.class_session?.end_time?.substring(0,5)}
                                 </div>
                              </div>
                           ))}
                        </div>
                     ) : (
                        <p style={{ color: 'var(--secondary)', margin: 0, fontStyle: 'italic', fontSize: '0.9rem' }}>Ninguna clase agendada para hoy.</p>
                     )}
                  </div>

                </div>
              </div>
            </div>

          {/* Lista Desplegable de Vencimientos */}
          {showExpiring && (
            <div className="card" style={{ marginBottom: '30px', animation: 'fadeIn 0.3s ease' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ff9900', marginBottom: '20px' }}>
                <CalendarRange size={20} /> Lista de Próximos Vencimientos
              </h3>
              {expiringUsers.length === 0 ? (
                <p style={{ color: 'var(--secondary)' }}>No hay membresías que venzan en los próximos 7 días.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {expiringUsers.map(user => (
                    <div key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid #333' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <img 
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&color=fff`} 
                          alt={user.name} 
                          style={{ width: '40px', height: '40px', borderRadius: '50%' }} 
                        />
                        <div>
                          <p style={{ color: 'var(--text)', fontWeight: 'bold' }}>{user.name}</p>
                          <p style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>{user.email}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ background: 'rgba(255,153,0,0.2)', color: '#ff9900', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          Vence el {user.endDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
