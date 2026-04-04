import { useState, useEffect } from 'react';
import { Dumbbell, Flame, Target, Zap, Activity } from 'lucide-react';
import { apiFetch } from '../lib/api';

const ScannerDisplay = () => {
  const [recentScan, setRecentScan] = useState<any>(null);

  const getClassIcon = (name: string, color: string, size = 18) => {
    const n = name.toUpperCase();
    if (n.includes('STRENGTH')) return <Dumbbell size={size} color={color} />;
    if (n.includes('UPPER BURN')) return <Flame size={size} color={color} />;
    if (n.includes('TEST')) return <Target size={size} color={color} />;
    if (n.includes('ATHLETE')) return <Zap size={size} color={color} />;
    return <Activity size={size} color={color} />;
  };

  useEffect(() => {
    const fetchRecentScan = async () => {
      try {
        const res = await apiFetch('/admin/scans/recent');
        if (res.ok) {
          const data = await res.json();
          // Solo actualizamos si hay un cambio real
          if (data && data.id) {
            setRecentScan(data);
          } else {
             setRecentScan(null);
          }
        }
      } catch (e) {
        // Silent error
      }
    };
    fetchRecentScan();
    const interval = setInterval(fetchRecentScan, 2000); // 2 segundos para máxima velocidad
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {!recentScan || !recentScan.user ? (
        <div style={{ textAlign: 'center', animation: 'fadeIn 1s ease' }}>
           <h1 style={{ color: '#444', fontSize: '4rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '5px' }}>ESPERANDO LECTURA</h1>
           <p style={{ color: '#333', fontSize: '1.5rem', marginTop: '20px' }}>Por favor, coloque su huella en el lector</p>
        </div>
      ) : (
        <div style={{ 
          width: '100%', 
          maxWidth: '1200px', 
          animation: 'fadeIn 0.4s ease-out', 
          border: recentScan.status === 'granted' ? '4px solid #00cc66' : '4px solid #ff4444', 
          background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(0,0,0,0.8))',
          borderRadius: '24px',
          padding: '50px',
          boxShadow: recentScan.status === 'granted' ? '0 10px 50px rgba(0,204,102,0.2)' : '0 10px 50px rgba(255,68,68,0.2)'
        }}>
          {/* Header/Banner Welcome */}
          <div style={{ textAlign: 'center', marginBottom: '40px', paddingBottom: '30px', borderBottom: '2px solid #222' }}>
            <h2 style={{ fontSize: '4.5rem', color: recentScan.status === 'granted' ? '#00cc66' : '#ff4444', margin: 0, fontWeight: 900, textTransform: 'uppercase' }}>
              {recentScan.status === 'granted' ? `¡BIENVENIDO, ${recentScan.user.name.split(' ')[0]}!` : 'ACCESO DENEGADO'}
            </h2>
            <p style={{ color: '#888', fontSize: '1.5rem', marginTop: '10px' }}>
              {new Date(recentScan.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '50px', alignItems: 'stretch' }}>
            {/* Left: Photo & Basic Info */}
            <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <img 
                src={recentScan.user.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(recentScan.user.name)}&background=random&color=fff&size=500`} 
                alt={recentScan.user.name} 
                style={{ width: '250px', height: '250px', borderRadius: '50%', border: '6px solid #444', objectFit: 'cover' }} 
              />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '2.5rem', color: '#fff', margin: '0 0 10px 0', fontWeight: 'bold' }}>{recentScan.user.name}</h3>
                <p style={{ color: '#aaa', fontSize: '1.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>{recentScan.user.role}</p>
              </div>
            </div>

            {/* Right: Status & Classes */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '30px' }}>
              
              {/* Status Block */}
              {(() => {
                 const activePlan = recentScan.user.memberships?.find((m: any) => m.is_active);
                 let daysLeft = 0;
                 if (activePlan) {
                   const end = new Date(activePlan.end_date);
                   daysLeft = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                 }

                 return (
                   <div style={{ background: 'rgba(255,255,255,0.03)', padding: '30px', borderRadius: '16px', border: '1px solid #333' }}>
                     <h4 style={{ color: '#888', fontSize: '1.4rem', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}>Membresía</h4>
                     {activePlan ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '25px', flexWrap: 'wrap' }}>
                          <span style={{ background: 'rgba(0,204,102,0.2)', color: '#00cc66', padding: '10px 24px', borderRadius: '30px', fontWeight: 'bold', fontSize: '1.8rem' }}>ACTIVO</span>
                          <span style={{ color: '#fff', fontSize: '1.6rem' }}>Renueva en <strong style={{color: daysLeft <= 7 ? '#ff9900' : '#00cc66'}}>{daysLeft} días</strong></span>
                        </div>
                     ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '25px', flexWrap: 'wrap' }}>
                          <span style={{ background: 'rgba(255,68,68,0.2)', color: '#ff4444', padding: '10px 24px', borderRadius: '30px', fontWeight: 'bold', fontSize: '1.8rem' }}>INACTIVO</span>
                          <span style={{ color: '#fff', fontSize: '1.6rem' }}>Sin plan vigente.</span>
                        </div>
                     )}
                   </div>
                 );
              })()}

              {/* Classes Block */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '30px', borderRadius: '16px', border: '1px solid #333', flex: 1 }}>
                 <h4 style={{ color: '#888', fontSize: '1.4rem', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}>Agenda del Día</h4>
                 {recentScan.user.reservations && recentScan.user.reservations.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                       {recentScan.user.reservations.map((res: any) => (
                          <div key={res.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '20px', borderRadius: '12px', borderLeft: `6px solid ${res.class_session?.gym_class?.color || '#00cc66'}` }}>
                             <div>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                 {getClassIcon(res.class_session?.gym_class?.name || '', res.class_session?.gym_class?.color || '#fff', 20)}
                                 <strong style={{ display: 'block', color: '#fff', fontSize: '1.5rem', margin: 0 }}>{res.class_session?.gym_class?.name || 'Clase'}</strong>
                               </div>
                               <span style={{ color: '#aaa', fontSize: '1.1rem' }}>Instructor: {res.class_session?.instructor || 'Gimnasio'}</span>
                             </div>
                             <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '8px', fontSize: '1.4rem', fontWeight: 'bold', color: '#fff', letterSpacing: '1px' }}>
                               {res.class_session?.start_time?.substring(0,5)} - {res.class_session?.end_time?.substring(0,5)}
                             </div>
                          </div>
                       ))}
                    </div>
                 ) : (
                    <p style={{ color: '#666', margin: 0, fontStyle: 'italic', fontSize: '1.4rem' }}>No hay clases separadas para hoy.</p>
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
