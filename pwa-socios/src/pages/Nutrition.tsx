import { useState, useEffect } from 'react';
import { Stethoscope, Calendar, Clock, Plus, X, CheckCircle, XCircle, ClipboardList } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface Appointment {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
}

interface TimeSlot { start: string; end: string; }

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada', confirmed: 'Confirmada',
  completed: 'Completada', cancelled: 'Cancelada',
};
const STATUS_COLOR: Record<string, string> = {
  scheduled: '#ff9900', confirmed: '#00cc66',
  completed: '#0066ff', cancelled: '#555',
};

const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (t: string) => t.substring(0, 5);
const toLocalIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

// Get next 14 days for date picker
const getNextDays = () => {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(toLocalIso(d));
  }
  return days;
};

export default function Nutrition() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showBook, setShowBook]         = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // booking form
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots]               = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [notes, setNotes]               = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving]             = useState(false);

  const nextDays = getNextDays();

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3500);
  };

  const fetchMine = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/nutrition/my');
      if (res.ok) setAppointments(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchMine(); }, []);

  const fetchSlots = async (date: string) => {
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot('');
    try {
      const res = await apiFetch(`/nutrition/available?date=${date}`);
      if (res.ok) setSlots(await res.json());
    } finally { setLoadingSlots(false); }
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    fetchSlots(date);
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedSlot) {
      showMsg('Selecciona fecha y horario.', 'error'); return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/nutrition/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, start_time: selectedSlot, notes }),
      });
      if (res.ok) {
        showMsg('¡Cita agendada exitosamente!', 'success');
        setShowBook(false);
        setSelectedDate(''); setSelectedSlot(''); setNotes(''); setSlots([]);
        fetchMine();
      } else {
        const err = await res.json();
        showMsg(err.message || 'Error al agendar.', 'error');
      }
    } finally { setSaving(false); }
  };

  const handleCancel = async () => {
    if (!confirmCancelId) return;
    const res = await apiFetch(`/nutrition/appointments/${confirmCancelId}/cancel`, { method: 'PATCH' });
    if (res.ok) {
      showMsg('Cita cancelada.', 'success');
      setConfirmCancelId(null);
      fetchMine();
    }
  };

  const upcoming = appointments.filter(a => a.status !== 'cancelled' && a.status !== 'completed');
  const past      = appointments.filter(a => a.status === 'completed' || a.status === 'cancelled');

  return (
    <div style={{ padding: '20px 16px', paddingBottom: '90px', maxWidth: '500px', margin: '0 auto' }}>

      {/* Toast */}
      {msg && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: msg.type === 'success' ? '#00cc66' : '#ff4444', color: '#fff', padding: '12px 24px', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: '90vw', textAlign: 'center' }}>
          {msg.text}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Stethoscope size={22} color="var(--primary)" /> Nutriólogo
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--secondary)', fontSize: '0.82rem' }}>Agenda tu consulta nutricional</p>
        </div>
        <button onClick={() => setShowBook(true)}
          style={{ background: 'var(--primary)', color: '#000', border: 'none', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,204,102,0.4)' }}>
          <Plus size={22} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--secondary)' }}>Cargando...</div>
      ) : (
        <>
          {/* Próximas */}
          <section style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '0.82rem', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Próximas consultas</h2>
            {upcoming.length === 0 ? (
              <div style={{ background: 'var(--surface)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
                <ClipboardList size={36} style={{ opacity: 0.3, marginBottom: '10px', color: 'var(--secondary)' }} />
                <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', margin: 0 }}>Sin consultas próximas</p>
                <button onClick={() => setShowBook(true)} style={{ marginTop: '14px', background: 'var(--primary)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                  Agendar ahora
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {upcoming.map(a => (
                  <div key={a.id} style={{ background: 'var(--surface)', borderRadius: '14px', padding: '16px', borderLeft: `4px solid ${STATUS_COLOR[a.status]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <Calendar size={14} color="var(--secondary)" />
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{fmtDate(a.date)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          <Clock size={14} color="var(--secondary)" />
                          <span style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>{fmtTime(a.start_time)} – {fmtTime(a.end_time)}</span>
                        </div>
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: STATUS_COLOR[a.status] + '22', color: STATUS_COLOR[a.status], fontWeight: 600 }}>
                          {STATUS_LABEL[a.status]}
                        </span>
                        {a.notes && <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: 'var(--secondary)' }}>{a.notes}</p>}
                      </div>
                      {(a.status === 'scheduled' || a.status === 'confirmed') && (
                        <button onClick={() => setConfirmCancelId(a.id)}
                          style={{ background: 'rgba(255,68,68,0.12)', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#ff4444' }}>
                          <XCircle size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Historial */}
          {past.length > 0 && (
            <section>
              <h2 style={{ fontSize: '0.82rem', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Historial</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {past.map(a => (
                  <div key={a.id} style={{ background: 'var(--surface)', borderRadius: '12px', padding: '12px 16px', opacity: 0.6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{fmtDate(a.date)}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--secondary)' }}>{fmtTime(a.start_time)} – {fmtTime(a.end_time)}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: STATUS_COLOR[a.status] + '22', color: STATUS_COLOR[a.status], fontWeight: 600 }}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* MODAL: AGENDAR CITA */}
      {showBook && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: '500px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Stethoscope size={18} color="var(--primary)" /> Agendar consulta
              </h3>
              <button onClick={() => setShowBook(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)', padding: '4px' }}><X size={22} /></button>
            </div>

            {/* Selector de fecha */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: 'var(--secondary)', fontSize: '0.82rem', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selecciona el día</p>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
                {nextDays.map(d => {
                  const date = new Date(d + 'T12:00:00');
                  const isSelected = d === selectedDate;
                  const dayName = date.toLocaleDateString('es-MX', { weekday: 'short' });
                  const dayNum  = date.getDate();
                  return (
                    <button key={d} onClick={() => handleSelectDate(d)}
                      style={{ minWidth: '56px', padding: '10px 6px', borderRadius: '12px', border: `2px solid ${isSelected ? 'var(--primary)' : '#333'}`, background: isSelected ? 'var(--primary)' : 'var(--background)', color: isSelected ? '#000' : 'var(--text)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>{dayName}</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{dayNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Horarios disponibles */}
            {selectedDate && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ color: 'var(--secondary)', fontSize: '0.82rem', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Horarios disponibles</p>
                {loadingSlots ? (
                  <p style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>Cargando...</p>
                ) : slots.length === 0 ? (
                  <div style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '10px', padding: '16px', textAlign: 'center', color: '#ff4444', fontSize: '0.85rem' }}>
                    Sin horarios disponibles para este día
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {slots.map(s => {
                      const isSel = s.start === selectedSlot;
                      return (
                        <button key={s.start} onClick={() => setSelectedSlot(s.start)}
                          style={{ padding: '12px 6px', borderRadius: '10px', border: `2px solid ${isSel ? 'var(--primary)' : '#333'}`, background: isSel ? 'var(--primary)' : 'var(--background)', color: isSel ? '#000' : 'var(--text)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: isSel ? 700 : 400 }}>
                          {s.start}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Notas */}
            {selectedSlot && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ color: 'var(--secondary)', fontSize: '0.82rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Motivo (opcional)</p>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Control de peso, primera consulta, nutrición deportiva..." rows={3}
                  style={{ width: '100%', padding: '12px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '10px', resize: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
            )}

            {/* Resumen */}
            {selectedDate && selectedSlot && (
              <div style={{ background: 'rgba(0,204,102,0.08)', border: '1px solid rgba(0,204,102,0.2)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00cc66', fontWeight: 600, marginBottom: '4px' }}>
                  <CheckCircle size={16} /> Resumen de tu cita
                </div>
                <div style={{ color: 'var(--text)', fontSize: '0.88rem' }}>
                  <div>📅 {fmtDate(selectedDate)}</div>
                  <div>🕐 {selectedSlot} – {slots.find(s => s.start === selectedSlot)?.end}</div>
                </div>
              </div>
            )}

            <button onClick={handleBook} disabled={saving || !selectedDate || !selectedSlot}
              style={{ width: '100%', padding: '16px', background: (!selectedDate || !selectedSlot) ? '#333' : 'var(--primary)', color: (!selectedDate || !selectedSlot) ? '#666' : '#000', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', cursor: (!selectedDate || !selectedSlot) ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Agendando...' : 'Confirmar cita'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR CANCELACION */}
      {confirmCancelId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '360px', textAlign: 'center' }}>
            <XCircle size={40} color="#ff4444" style={{ marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 8px' }}>¿Cancelar cita?</h3>
            <p style={{ color: 'var(--secondary)', fontSize: '0.88rem', marginBottom: '20px' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmCancelId(null)} style={{ flex: 1, padding: '12px', background: 'var(--background)', border: '1px solid #333', borderRadius: '10px', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
                Volver
              </button>
              <button onClick={handleCancel} style={{ flex: 1, padding: '12px', background: '#ff4444', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
