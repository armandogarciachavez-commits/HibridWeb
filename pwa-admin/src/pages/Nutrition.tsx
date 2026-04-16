import { useState, useEffect, useCallback } from 'react';
import { Plus, Calendar, List, ChevronLeft, ChevronRight, Clock, User, X, Edit2, XCircle, CheckCircle, ClipboardList, Stethoscope } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useToast } from '../components/ui/ToastContext';
import ConfirmModal from '../components/ui/ConfirmModal';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Appointment {
  id: number;
  user_id: number;
  user: { id: number; name: string; email: string; phone?: string };
  date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  admin_notes?: string;
}

interface TimeSlot { start: string; end: string; }
interface UserOption { id: number; name: string; email: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada', confirmed: 'Confirmada',
  completed: 'Completada', cancelled: 'Cancelada',
};
const STATUS_COLOR: Record<string, string> = {
  scheduled: '#ff9900', confirmed: '#00cc66',
  completed: '#0066ff', cancelled: '#666',
};
const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (t: string) => t.substring(0, 5);
const toLocalIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Component ─────────────────────────────────────────────────────────────────
export default function Nutrition() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<'calendar' | 'list'>('calendar');

  // calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear  = currentDate.getFullYear();

  // appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  // list filters
  const [filterDate, setFilterDate]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // modals
  const [showCreate, setShowCreate]       = useState(false);
  const [editAppt, setEditAppt]           = useState<Appointment | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Appointment | null>(null);

  // create form
  const [users, setUsers]         = useState<UserOption[]>([]);
  const [slots, setSlots]         = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const emptyForm = { user_id: '', date: toLocalIso(new Date()), start_time: '', notes: '', admin_notes: '' };
  const [form, setForm] = useState(emptyForm);

  // edit form
  const [editForm, setEditForm] = useState({ status: 'scheduled' as Appointment['status'], date: '', start_time: '', notes: '', admin_notes: '' });
  const [editSlots, setEditSlots] = useState<TimeSlot[]>([]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchMonth = useCallback(async (m: number, y: number) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/nutrition/appointments?month=${m}&year=${y}`);
      if (res.ok) setAppointments(await res.json());
    } finally { setLoading(false); }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/admin/nutrition/appointments?';
      if (filterDate)   url += `date=${filterDate}&`;
      if (filterStatus) url += `status=${filterStatus}&`;
      const res = await apiFetch(url);
      if (res.ok) setAppointments(await res.json());
    } finally { setLoading(false); }
  }, [filterDate, filterStatus]);

  const fetchUsers = useCallback(async () => {
    const res = await apiFetch('/admin/users');
    if (res.ok) {
      const data = await res.json();
      setUsers((Array.isArray(data) ? data : data.data ?? []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
    }
  }, []);

  const fetchSlots = async (date: string, setter: (s: TimeSlot[]) => void) => {
    if (!date) return;
    setLoadingSlots(true);
    try {
      const res = await apiFetch(`/nutrition/available?date=${date}`);
      if (res.ok) setter(await res.json());
    } finally { setLoadingSlots(false); }
  };

  useEffect(() => { fetchMonth(currentMonth, currentYear); }, [currentMonth, currentYear]);
  useEffect(() => { if (tab === 'list') fetchList(); }, [tab, filterDate, filterStatus]);
  useEffect(() => { if (showCreate) fetchUsers(); }, [showCreate]);
  useEffect(() => { if (form.date) fetchSlots(form.date, setSlots); }, [form.date]);

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const getDaysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate();
  const getFirstDay    = (m: number, y: number) => { const d = new Date(y, m - 1, 1).getDay(); return d === 0 ? 6 : d - 1; };
  const calendarDays   = Array.from({ length: getFirstDay(currentMonth, currentYear) }, () => null)
    .concat(Array.from({ length: getDaysInMonth(currentMonth, currentYear) }, (_, i) => i + 1) as any);

  const apptsByDate = (day: number) => {
    const ds = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return appointments.filter(a => a.date === ds && a.status !== 'cancelled');
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.user_id || !form.date || !form.start_time) {
      addToast('Completa usuario, fecha y horario.', 'error'); return;
    }
    const res = await apiFetch('/admin/nutrition/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, user_id: Number(form.user_id) }),
    });
    if (res.ok) {
      addToast('Cita agendada.', 'success');
      setShowCreate(false); setForm(emptyForm);
      fetchMonth(currentMonth, currentYear);
      if (tab === 'list') fetchList();
    } else {
      const err = await res.json();
      addToast(err.message || 'Error al agendar.', 'error');
    }
  };

  const handleUpdate = async () => {
    if (!editAppt) return;
    const payload: any = { status: editForm.status, notes: editForm.notes, admin_notes: editForm.admin_notes };
    if (editForm.date) payload.date = editForm.date;
    if (editForm.start_time) payload.start_time = editForm.start_time;

    const res = await apiFetch(`/admin/nutrition/appointments/${editAppt.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      addToast('Cita actualizada.', 'success');
      setEditAppt(null);
      fetchMonth(currentMonth, currentYear);
      if (tab === 'list') fetchList();
    } else {
      const err = await res.json();
      addToast(err.message || 'Error al actualizar.', 'error');
    }
  };

  const handleCancel = async () => {
    if (!confirmCancel) return;
    const res = await apiFetch(`/admin/nutrition/appointments/${confirmCancel.id}`, { method: 'DELETE' });
    if (res.ok) {
      addToast('Cita cancelada.', 'success');
      setConfirmCancel(null);
      fetchMonth(currentMonth, currentYear);
      if (tab === 'list') fetchList();
    }
  };

  const openEdit = (a: Appointment) => {
    setEditAppt(a);
    setEditForm({ status: a.status, date: a.date, start_time: fmtTime(a.start_time), notes: a.notes || '', admin_notes: a.admin_notes || '' });
    fetchSlots(a.date, setEditSlots);
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '6px', boxSizing: 'border-box', fontSize: '0.9rem' };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', color: 'var(--secondary)', fontSize: '0.82rem' };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
    background: active ? 'var(--primary)' : 'transparent', color: active ? '#000' : 'var(--secondary)', border: 'none', display: 'flex', alignItems: 'center', gap: '6px',
  });

  const StatusBadge = ({ status }: { status: string }) => (
    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: STATUS_COLOR[status] + '22', color: STATUS_COLOR[status], fontWeight: 600 }}>
      {STATUS_LABEL[status]}
    </span>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Stethoscope size={22} color="var(--primary)" /> Agenda Nutriólogo
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--secondary)', fontSize: '0.88rem' }}>Gestión de consultas nutricionales</p>
        </div>
        <button className="btn" onClick={() => { setForm(emptyForm); setShowCreate(true); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Nueva cita
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface)', padding: '6px', borderRadius: '10px', width: 'fit-content' }}>
        <button style={tabStyle(tab === 'calendar')} onClick={() => setTab('calendar')}><Calendar size={15} />Calendario</button>
        <button style={tabStyle(tab === 'list')}     onClick={() => setTab('list')}><List size={15} />Lista</button>
      </div>

      {/* ── TAB CALENDARIO ─────────────────────────────────────────────────── */}
      {tab === 'calendar' && (
        <div>
          {/* Nav mes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <button className="btn-secondary" onClick={() => setCurrentDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd; })}><ChevronLeft size={18} /></button>
            <h2 style={{ margin: 0, fontSize: '1.1rem', minWidth: '180px', textAlign: 'center' }}>{monthNames[currentMonth - 1]} {currentYear}</h2>
            <button className="btn-secondary" onClick={() => setCurrentDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd; })}><ChevronRight size={18} /></button>
            <button className="btn-secondary" onClick={() => setCurrentDate(new Date())} style={{ fontSize: '0.82rem', padding: '6px 12px' }}>Hoy</button>
          </div>

          {/* Grid */}
          <div style={{ border: '1px solid #333', borderRadius: '8px', overflow: 'hidden' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface)' }}>
              {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--secondary)', fontWeight: 600, borderRight: '1px solid #222' }}>{d}</div>
              ))}
            </div>
            {/* Days */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {calendarDays.map((day, i) => {
                if (!day) return <div key={i} style={{ minHeight: '100px', borderRight: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', background: 'rgba(255,255,255,0.01)' }} />;
                const dayAppts = apptsByDate(day as number);
                const isToday  = new Date().getDate() === day && new Date().getMonth() + 1 === currentMonth && new Date().getFullYear() === currentYear;
                return (
                  <div key={i} style={{ minHeight: '100px', padding: '6px', borderRight: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a' }}>
                    <div style={{ textAlign: 'right', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, background: isToday ? 'var(--primary)' : 'transparent', color: isToday ? '#000' : 'var(--secondary)', borderRadius: '50%', width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{day as number}</span>
                    </div>
                    {dayAppts.map(a => (
                      <div key={a.id} onClick={() => openEdit(a)} style={{ background: STATUS_COLOR[a.status] + '22', borderLeft: `3px solid ${STATUS_COLOR[a.status]}`, padding: '3px 6px', borderRadius: '3px', marginBottom: '3px', cursor: 'pointer', fontSize: '0.72rem', lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 600, color: STATUS_COLOR[a.status] }}>{fmtTime(a.start_time)}</div>
                        <div style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.user?.name}</div>
                      </div>
                    ))}
                    {dayAppts.length === 0 && (
                      <div onClick={() => { const ds = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`; setForm({...emptyForm, date: ds}); setShowCreate(true); }}
                        style={{ textAlign: 'center', padding: '20px 0', color: '#333', cursor: 'pointer', fontSize: '1.2rem' }} title="Agendar cita">+</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--secondary)' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: STATUS_COLOR[k] }} />
                {v}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB LISTA ──────────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...inputStyle, width: '170px' }} />
            </div>
            <div>
              <label style={labelStyle}>Estado</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: '150px', height: '42px' }}>
                <option value="">Todos</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {(filterDate || filterStatus) && (
              <button className="btn-secondary" onClick={() => { setFilterDate(''); setFilterStatus(''); }}>Limpiar</button>
            )}
          </div>

          {loading ? <p style={{ color: 'var(--secondary)' }}>Cargando...</p> :
            appointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--secondary)' }}>
                <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>Sin citas registradas.</p>
              </div>
            ) : (
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Fecha</th><th>Hora</th><th>Paciente</th><th>Estado</th><th>Notas</th><th></th></tr></thead>
                <tbody>
                  {appointments.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontSize: '0.85rem' }}>{fmtDate(a.date)}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} /> {fmtTime(a.start_time)} – {fmtTime(a.end_time)}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.user?.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>{a.user?.email}</div>
                      </td>
                      <td><StatusBadge status={a.status} /></td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.notes || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn-icon" onClick={() => openEdit(a)} title="Editar"><Edit2 size={14} /></button>
                          {a.status !== 'cancelled' && a.status !== 'completed' && (
                            <button className="btn-icon" onClick={() => setConfirmCancel(a)} title="Cancelar" style={{ color: '#ff4444' }}><XCircle size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {/* ══ MODAL: NUEVA CITA ════════════════════════════════════════════════ */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Stethoscope size={18} color="var(--primary)" />Nueva consulta</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Paciente *</label>
                <select value={form.user_id} onChange={e => setForm({...form, user_id: e.target.value})} style={{...inputStyle, height: '42px'}}>
                  <option value="">— Seleccionar socio —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Fecha *</label>
                <input type="date" value={form.date} min={toLocalIso(new Date())} onChange={e => setForm({...form, date: e.target.value, start_time: ''})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Horario disponible *</label>
                {loadingSlots ? <p style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>Cargando horarios...</p> :
                  slots.length === 0 ? <p style={{ color: '#ff4444', fontSize: '0.85rem' }}>Sin horarios disponibles para esta fecha.</p> : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {slots.map(s => (
                        <button key={s.start} type="button" onClick={() => setForm({...form, start_time: s.start})}
                          style={{ padding: '8px 14px', borderRadius: '8px', border: `2px solid ${form.start_time === s.start ? 'var(--primary)' : '#333'}`, background: form.start_time === s.start ? 'var(--primary)' : 'transparent', color: form.start_time === s.start ? '#000' : 'var(--text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
                          {s.start} – {s.end}
                        </button>
                      ))}
                    </div>
                  )
                }
              </div>
              <div>
                <label style={labelStyle}>Motivo / Notas del paciente</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} style={{...inputStyle, height: '70px', resize: 'vertical'}} placeholder="Ej: Control de peso, primera consulta..." />
              </div>
              <div>
                <label style={labelStyle}>Notas internas (solo admin)</label>
                <textarea value={form.admin_notes} onChange={e => setForm({...form, admin_notes: e.target.value})} style={{...inputStyle, height: '60px', resize: 'vertical'}} placeholder="Notas privadas..." />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn" onClick={handleCreate}>Agendar cita</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: EDITAR CITA ═══════════════════════════════════════════════ */}
      {editAppt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '520px', border: '1px solid #333', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Editar consulta</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--secondary)' }}>
                  <User size={13} style={{ marginRight: '4px' }} />{editAppt.user?.name} — {fmtDate(editAppt.date)} {fmtTime(editAppt.start_time)}
                </p>
              </div>
              <button onClick={() => setEditAppt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as any})} style={{...inputStyle, height: '42px'}}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Fecha</label>
                  <input type="date" value={editForm.date} min={toLocalIso(new Date())} onChange={e => { setEditForm({...editForm, date: e.target.value, start_time: ''}); fetchSlots(e.target.value, setEditSlots); }} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Horario</label>
                  <select value={editForm.start_time} onChange={e => setEditForm({...editForm, start_time: e.target.value})} style={{...inputStyle, height: '42px'}}>
                    <option value="">Sin cambio</option>
                    {editSlots.map(s => <option key={s.start} value={s.start}>{s.start} – {s.end}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Notas del paciente</label>
                <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} style={{...inputStyle, height: '70px', resize: 'vertical'}} />
              </div>
              <div>
                <label style={labelStyle}>Notas internas (solo admin)</label>
                <textarea value={editForm.admin_notes} onChange={e => setEditForm({...editForm, admin_notes: e.target.value})} style={{...inputStyle, height: '60px', resize: 'vertical'}} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button className="btn-secondary" style={{ color: '#ff4444' }} onClick={() => { setEditAppt(null); setConfirmCancel(editAppt); }}>
                <XCircle size={15} style={{ marginRight: '6px' }} />Cancelar cita
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-secondary" onClick={() => setEditAppt(null)}>Cerrar</button>
                <button className="btn" onClick={handleUpdate}><CheckCircle size={15} style={{ marginRight: '6px' }} />Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm cancel */}
      <ConfirmModal
        isOpen={!!confirmCancel}
        title="Cancelar consulta"
        message={confirmCancel ? `¿Cancelar la cita de ${confirmCancel.user?.name} el ${fmtDate(confirmCancel.date)} a las ${fmtTime(confirmCancel.start_time)}?` : ''}
        confirmText="Sí, cancelar"
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancel(null)}
      />
    </div>
  );
}
