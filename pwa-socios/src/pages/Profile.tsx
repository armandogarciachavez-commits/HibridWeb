import { useState, useEffect, useCallback } from 'react';
import { User, Phone, Mail, MapPin, Loader2, Activity, TrendingUp, Plus, Trash2, ChevronUp } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { apiFetch } from '../lib/api';

// ─── Interfaces ───────────────────────────────────────────────────────────────

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

interface ProgressEntry {
  id: number;
  date: string;       // "YYYY-MM-DD"
  reps: number;
  distance: number;   // km
  notes: string | null;
}

// ─── Tooltip personalizado para recharts ─────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #333',
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '0.8rem',
    }}>
      <p style={{ color: 'var(--secondary)', marginBottom: '6px' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color, marginBottom: '2px' }}>
          {p.name === 'reps' ? 'Repeticiones' : 'Distancia (km)'}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const Profile = () => {
  // -- perfil --
  const [userData, setUserData]   = useState<UserData | null>(null);
  const [loading, setLoading]     = useState(true);

  // -- IMC --
  const [weight, setWeight]       = useState('');
  const [height, setHeight]       = useState('');
  const [bmi, setBmi]             = useState<number | null>(null);
  const [bmiStatus, setBmiStatus] = useState('');

  // -- progreso --
  const [entries, setEntries]         = useState<ProgressEntry[]>([]);
  const [progLoading, setProgLoading] = useState(true);
  const [progError, setProgError]     = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formDate, setFormDate]       = useState(new Date().toISOString().split('T')[0]);
  const [formReps, setFormReps]       = useState('');
  const [formDist, setFormDist]       = useState('');
  const [formNotes, setFormNotes]     = useState('');
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  // ── fetch perfil ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiFetch('/user');
        if (!res.ok) return;
        setUserData(await res.json());
      } catch { /* ProtectedRoute garantiza sesión */ }
      finally { setLoading(false); }
    };
    fetchProfile();
  }, []);

  // ── fetch progreso ────────────────────────────────────────────────────────
  const fetchProgress = useCallback(async () => {
    setProgLoading(true);
    setProgError('');
    try {
      const res = await apiFetch('/progress');
      if (!res.ok) throw new Error('Error al cargar datos');
      setEntries(await res.json());
    } catch {
      setProgError('No se pudo cargar el progreso. Intenta de nuevo.');
    } finally {
      setProgLoading(false);
    }
  }, []);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  // ── IMC ───────────────────────────────────────────────────────────────────
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

  // ── guardar entrada ───────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setProgError('');
    try {
      const res = await apiFetch('/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:     formDate,
          reps:     parseInt(formReps)   || 0,
          distance: parseFloat(formDist) || 0,
          notes:    formNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || 'Error al guardar');
      }
      // reset form
      setFormReps(''); setFormDist(''); setFormNotes('');
      setShowForm(false);
      fetchProgress();
    } catch (err: any) {
      setProgError(err.message || 'Error al guardar la entrada.');
    } finally {
      setSaving(false);
    }
  };

  // ── eliminar entrada ──────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/progress/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch {
      setProgError('No se pudo eliminar el registro.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const activePlan = userData?.memberships?.find(m => m.is_active);

  const bmiColor = () => {
    if (!bmiStatus) return 'var(--primary)';
    if (bmiStatus === 'Normal')    return '#00cc66';
    if (bmiStatus === 'Peso Bajo') return '#f59e0b';
    if (bmiStatus === 'Sobrepeso') return '#f97316';
    return '#ff4444';
  };

  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  // últimos 30 días para la gráfica (los entries ya vienen ordenados asc desde el API)
  const chartData = entries.slice(-30).map(e => ({
    fecha:    fmtDate(e.date),
    reps:     e.reps,
    distance: e.distance,
  }));

  // ── render ────────────────────────────────────────────────────────────────
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

      {/* ── Avatar + nombre ── */}
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

      {/* ── Información de contacto ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text)' }}>Información de Contacto</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { icon: <User size={16} color="var(--primary)" />, label: 'NOMBRE COMPLETO', value: userData?.name },
            { icon: <Mail size={16} color="var(--primary)" />, label: 'EMAIL', value: userData?.email },
            { icon: <Phone size={16} color="var(--primary)" />, label: 'TELÉFONO', value: userData?.phone },
            { icon: <MapPin size={16} color="var(--primary)" />, label: 'DIRECCIÓN', value: userData?.address },
          ].map(({ icon, label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,102,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
              </div>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginBottom: '1px' }}>{label}</p>
                <p style={{ fontSize: '0.92rem', color: value ? 'var(--text)' : 'var(--secondary)' }}>{value || 'No registrado'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Historial de membresía ── */}
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

      {/* ── Calculadora IMC ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Activity size={18} color="var(--primary)" />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Calculadora de IMC</h2>
        </div>
        <form onSubmit={calculateBMI} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '4px' }}>Peso (kg)</label>
              <input
                type="number" required min="1" max="300"
                value={weight} onChange={e => setWeight(e.target.value)}
                style={{ width: '100%', padding: '10px', background: 'var(--background)', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                placeholder="Ej. 75"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '4px' }}>Altura (cm)</label>
              <input
                type="number" required min="50" max="250"
                value={height} onChange={e => setHeight(e.target.value)}
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
              {[
                ['< 18.5', 'Peso Bajo', '#f59e0b'],
                ['18.5–24.9', 'Normal', '#00cc66'],
                ['25–29.9', 'Sobrepeso', '#f97316'],
                ['≥ 30', 'Obesidad', '#ff4444'],
              ].map(([range, label, color]) => (
                <div key={label} style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: `1px solid ${bmiStatus === label ? color : '#222'}` }}>
                  <p style={{ fontSize: '0.65rem', color, fontWeight: 700 }}>{label}</p>
                  <p style={{ fontSize: '0.6rem', color: 'var(--secondary)' }}>{range}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PROGRESO DE ENTRENAMIENTO
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="card">
        {/* encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingUp size={18} color="var(--primary)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Progreso de Entrenamiento</h2>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '20px',
              background: showForm ? 'rgba(0,102,255,0.15)' : 'rgba(0,102,255,0.08)',
              border: '1px solid rgba(0,102,255,0.4)',
              color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showForm ? <><ChevronUp size={14} /> Cerrar</> : <><Plus size={14} /> Añadir</>}
          </button>
        </div>

        {/* formulario colapsable */}
        {showForm && (
          <form onSubmit={handleSave} style={{
            marginBottom: '20px', padding: '16px',
            background: 'var(--background)', borderRadius: '10px',
            border: '1px solid rgba(0,102,255,0.2)',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '4px' }}>Fecha</label>
              <input
                type="date" required
                value={formDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormDate(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '4px' }}>Repeticiones</label>
                <input
                  type="number" min="0" max="99999"
                  value={formReps} onChange={e => setFormReps(e.target.value)}
                  placeholder="Ej. 120"
                  style={{ width: '100%', padding: '9px 10px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '4px' }}>Distancia (km)</label>
                <input
                  type="number" min="0" max="9999" step="0.01"
                  value={formDist} onChange={e => setFormDist(e.target.value)}
                  placeholder="Ej. 5.2"
                  style={{ width: '100%', padding: '9px 10px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '4px' }}>Notas <span style={{ opacity: 0.5 }}>(opcional)</span></label>
              <input
                type="text" maxLength={255}
                value={formNotes} onChange={e => setFormNotes(e.target.value)}
                placeholder="Ej. Día de piernas, me sentí fuerte"
                style={{ width: '100%', padding: '9px 10px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
            {progError && (
              <p style={{ fontSize: '0.8rem', color: '#ff4444', textAlign: 'center' }}>{progError}</p>
            )}
            <button
              type="submit" disabled={saving}
              className="btn"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Guardando…' : 'Guardar entrada'}
            </button>
          </form>
        )}

        {/* estado de carga / error */}
        {progLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
            <Loader2 className="animate-spin" size={24} color="var(--primary)" />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--secondary)' }}>
            <TrendingUp size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
            <p style={{ fontSize: '0.9rem' }}>Aún no hay registros.</p>
            <p style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.6 }}>Pulsa "Añadir" para registrar tu primer entrenamiento.</p>
          </div>
        ) : (
          <>
            {/* ── Gráfica ── */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Últimos {Math.min(entries.length, 30)} registros
              </p>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 10, fill: 'var(--secondary)' }}
                      interval="preserveStartEnd"
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="reps"
                      tick={{ fontSize: 10, fill: 'var(--secondary)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="dist"
                      orientation="right"
                      tick={{ fontSize: 10, fill: 'var(--secondary)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '0.75rem', color: 'var(--secondary)' }}
                      formatter={(v: string) => v === 'reps' ? 'Repeticiones' : 'Distancia (km)'}
                    />
                    <Line
                      yAxisId="reps"
                      type="monotone"
                      dataKey="reps"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      yAxisId="dist"
                      type="monotone"
                      dataKey="distance"
                      stroke="#00cc66"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#00cc66', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Lista de entradas recientes ── */}
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Entradas recientes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[...entries].reverse().slice(0, 10).map(entry => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'var(--background)',
                      borderRadius: '8px',
                      border: '1px solid #222',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: entry.notes ? '4px' : 0 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', whiteSpace: 'nowrap' }}>
                          {fmtDate(entry.date)}
                        </span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>
                          {entry.reps} rep
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#00cc66', fontWeight: 600 }}>
                          {entry.distance} km
                        </span>
                      </div>
                      {entry.notes && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.notes}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      style={{
                        marginLeft: '12px', padding: '6px',
                        background: 'transparent',
                        border: 'none', borderRadius: '6px',
                        cursor: 'pointer',
                        color: deletingId === entry.id ? '#555' : '#ff4444',
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center',
                      }}
                      aria-label="Eliminar"
                    >
                      {deletingId === entry.id
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Trash2 size={15} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Profile;
