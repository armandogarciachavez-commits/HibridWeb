import { useState, useEffect } from 'react';
import { Clock, CheckCircle, Dumbbell, Loader2, XCircle, Flame, Target, Zap, Activity } from 'lucide-react';
import { apiFetch } from '../lib/api';

const getWeekDays = (mondayBase: Date): Date[] => {
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(mondayBase);
    d.setDate(mondayBase.getDate() + i);
    days.push(d);
  }
  return days;
};

interface BookMsg {
  text: string;
  type: 'success' | 'error';
}

const Schedule = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentWeek, setCurrentWeek]   = useState<Date[]>([]);
  const [nextWeek, setNextWeek]         = useState<Date[]>([]);
  const [weekOffset, setWeekOffset]     = useState(0);
  const [isSunday, setIsSunday]         = useState(false);
  const [classes, setClasses]           = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [bookingId, setBookingId]       = useState<number | null>(null); // ID en proceso de reserva
  const [cancelingId, setCancelingId]   = useState<number | null>(null); // ID en proceso de cancelación
  const [bookMsg, setBookMsg]           = useState<BookMsg | null>(null);  // Mensaje inline
  const [bookedIds, setBookedIds]       = useState<Set<number>>(new Set());
  const isActiveUser = localStorage.getItem('user_status') === 'Activo';

  useEffect(() => {
    const now = new Date();
    const day = now.getDay();
    const sunday = day === 0;
    setIsSunday(sunday);

    const diffToMonday = now.getDate() - day + (sunday ? -6 : 1);
    const mondayCurrent = new Date(now);
    mondayCurrent.setDate(diffToMonday);
    mondayCurrent.setHours(0, 0, 0, 0);

    const mondayNext = new Date(mondayCurrent);
    mondayNext.setDate(mondayCurrent.getDate() + 7);

    setCurrentWeek(getWeekDays(mondayCurrent));
    setNextWeek(getWeekDays(mondayNext));

    const targetDate = sunday ? new Date(mondayCurrent) : new Date(now);
    targetDate.setHours(0, 0, 0, 0);
    setSelectedDate(targetDate);
    setWeekOffset(0);
  }, []);

  useEffect(() => {
    fetchClasses(selectedDate);
  }, [selectedDate]);

  // Auto-ocultar mensaje tras 3 segundos
  useEffect(() => {
    if (!bookMsg) return;
    const t = setTimeout(() => setBookMsg(null), 3000);
    return () => clearTimeout(t);
  }, [bookMsg]);

  const fetchClasses = async (date: Date) => {
    setLoading(true);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    try {
      const res  = await apiFetch(`/classes?date=${dateStr}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setClasses(data);
        // Actualizar bookedIds desde backend sin perder las marcadas en esta sesión
        const backendBooked = new Set<number>(data.filter((s: any) => s.user_booked).map((s: any) => s.id as number));
        setBookedIds(prev => new Set([...prev, ...backendBooked]));
      }
    } catch {
      setBookMsg({ text: 'Error al cargar clases. Verifica tu conexión.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (session: any) => {
    // Previene doble clic o reserva ya hecha
    if (bookedIds.has(session.id) || bookingId !== null) return;

    setBookingId(session.id);
    setBookMsg(null);
    try {
      const res  = await apiFetch('/reservations/book', {
        method: 'POST',
        body: JSON.stringify({ class_session_id: session.id }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
      if (res.ok) {
        setBookedIds(prev => new Set(prev).add(session.id));
        setBookMsg({ text: '¡Reserva confirmada! Te esperamos en clase.', type: 'success' });
        fetchClasses(selectedDate); // Actualiza cupos sin resetear bookedIds
      } else {
        setBookMsg({ text: data.message || 'No se pudo completar la reserva.', type: 'error' });
      }
    } catch {
      setBookMsg({ text: 'Error de conexión. Intenta de nuevo.', type: 'error' });
    } finally {
      setBookingId(null);
    }
  };

  const handleCancel = async (session: any) => {
    if (cancelingId !== null) return;
    setCancelingId(session.id);
    setBookMsg(null);
    try {
      const res  = await apiFetch(`/reservations/cancel/${session.id}`, { method: 'DELETE' });
      let data: any = {};
      try { data = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
      if (res.ok) {
        setBookedIds(prev => { const s = new Set(prev); s.delete(session.id); return s; });
        setBookMsg({ text: 'Reserva cancelada correctamente.', type: 'error' });
        fetchClasses(selectedDate);
      } else {
        setBookMsg({ text: data.message || 'No se pudo cancelar la reserva.', type: 'error' });
      }
    } catch {
      setBookMsg({ text: 'Error de conexión. Intenta de nuevo.', type: 'error' });
    } finally {
      setCancelingId(null);
    }
  };

  const getTrainerColor = (trainer: string) => {
    if (trainer.includes('Alex')) return 'var(--primary)';
    if (trainer.includes('Sofia')) return '#ff4b4b';
    if (trainer.includes('Carlos')) return '#00cc66';
    return 'var(--secondary)';
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
    <div style={{ padding: '20px', paddingBottom: '80px' }}>
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ color: 'var(--text)', fontSize: '1.8rem', marginBottom: '8px' }}>Reservar Sesión</h1>
        <p style={{ color: 'var(--secondary)' }}>Cupo máximo de 15 personas por bloque.</p>
        {!isActiveUser && (
          <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,68,68,0.1)', color: '#ff4444', borderRadius: '8px', border: '1px solid rgba(255,68,68,0.3)', fontSize: '0.9rem' }}>
            <strong>Atención:</strong> Tu membresía ha vencido. Renueva tu plan para poder agendar clases.
          </div>
        )}
      </header>

      {/* Mensaje inline (reemplaza alert) */}
      {bookMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '0.9rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: bookMsg.type === 'success' ? 'rgba(0,204,102,0.12)' : 'rgba(255,68,68,0.12)',
          border: `1px solid ${bookMsg.type === 'success' ? '#00cc66' : '#ff4444'}`,
          color: bookMsg.type === 'success' ? '#00cc66' : '#ff4444',
        }}>
          {bookMsg.type === 'success' ? <CheckCircle size={16} /> : '⚠️'}
          {bookMsg.text}
        </div>
      )}

      {/* Selector semana (solo domingo) */}
      {isSunday && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => { setWeekOffset(0); setSelectedDate(new Date(currentWeek[0])); }}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: weekOffset === 0 ? 'none' : '1px solid #333', background: weekOffset === 0 ? 'var(--primary)' : 'var(--background)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Esta semana
          </button>
          <button
            onClick={() => { setWeekOffset(1); setSelectedDate(new Date(nextWeek[0])); }}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: weekOffset === 1 ? 'none' : '1px solid #333', background: weekOffset === 1 ? 'var(--primary)' : 'var(--background)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Siguiente semana
          </button>
        </div>
      )}

      {/* Selector de días */}
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px', scrollbarWidth: 'none' }}>
        {(weekOffset === 0 ? currentWeek : nextWeek).map((date, idx) => {
          const isSelected = date.getDate() === selectedDate.getDate() && date.getMonth() === selectedDate.getMonth();
          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(date)}
              style={{ minWidth: '60px', padding: '10px 0', borderRadius: '8px', background: isSelected ? 'var(--primary)' : 'var(--background)', border: isSelected ? 'none' : '1px solid #333', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}
            >
              <span style={{ fontSize: '0.8rem', color: isSelected ? '#fff' : 'var(--secondary)' }}>
                {date.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase()}
              </span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{date.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Lista de clases */}
      <div style={{ marginTop: '20px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '40px 0', color: 'var(--secondary)' }}>
            <Loader2 size={20} className="animate-spin" /> Cargando clases...
          </div>
        ) : classes.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--secondary)', padding: '40px 0' }}>No hay clases publicadas para este día.</p>
        ) : (
          classes.map((session) => {
            const template       = session.gym_class || session.gymClass || { name: 'Clase', color: '#4CAF50' };
            const currentBookings = session.current_bookings || 0;
            const isFull         = currentBookings >= (session.capacity || 15);
            const isBooked       = bookedIds.has(session.id);
            const isBookingThis  = bookingId === session.id;

            return (
              <div key={session.id} className="card" style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '15px', borderLeft: `6px solid ${template.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {getClassIcon(template.name, template.color, 16)}
                      <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{template.name}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                      <Clock size={14} /> {session.start_time.substring(0,5)} - {session.end_time.substring(0,5)} hrs
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '2px' }}>Entrenador</div>
                    <div style={{ fontSize: '0.9rem', color: getTrainerColor(session.instructor), fontWeight: 'bold' }}>{session.instructor}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '10px', borderRadius: '4px', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Dumbbell size={16} color="var(--secondary)" />
                    <span style={{ fontSize: '0.9rem', color: isFull ? '#ff4444' : 'var(--text)' }}>
                      Cupos: <strong>{currentBookings}</strong> / {session.capacity || 15}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Botón cancelar — solo visible si ya está reservado */}
                    {isBooked && (
                      <button
                        onClick={() => handleCancel(session)}
                        disabled={cancelingId !== null}
                        title="Cancelar reserva"
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,68,68,0.4)',
                          background: 'rgba(255,68,68,0.08)',
                          color: '#ff4444',
                          cursor: cancelingId !== null ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        {cancelingId === session.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <XCircle size={14} />}
                      </button>
                    )}

                    {/* Botón reservar / estado */}
                    <button
                      onClick={() => handleBook(session)}
                      disabled={isFull || isBooked || !isActiveUser || bookingId !== null}
                      style={{
                        margin: 0,
                        padding: '8px 16px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: (isBooked || !isActiveUser || isFull || bookingId !== null) ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: (!isActiveUser || (isFull && !isBooked)) ? 0.5 : 1,
                        background: isBooked
                          ? '#00cc66'
                          : isFull
                            ? '#333'
                            : !isActiveUser
                              ? '#444'
                              : 'var(--primary)',
                        color: '#fff',
                        transition: 'background 0.2s',
                        minWidth: '110px',
                        justifyContent: 'center',
                      }}
                    >
                      {isBookingThis
                        ? <><Loader2 size={14} className="animate-spin" /> Reservando...</>
                        : isBooked
                          ? <><CheckCircle size={14} /> Reservada</>
                          : !isActiveUser
                            ? 'Bloqueado'
                            : isFull
                              ? 'Sin cupo'
                              : 'Reservar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Schedule;
