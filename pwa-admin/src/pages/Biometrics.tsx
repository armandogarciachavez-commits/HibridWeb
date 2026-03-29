import { useState, useEffect, useRef } from 'react';
import { Fingerprint, MonitorPlay, Database, CheckCircle, XCircle, Wifi, WifiOff } from 'lucide-react';
import { apiFetch } from '../lib/api';

const BRIDGE_URL = 'http://localhost:7071';
const ENROLL_TIMEOUT_MS = 30_000; // 30 segundos para poner el dedo

const Biometrics = () => {
  const [users, setUsers]               = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading]           = useState(false);
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [status, setStatus]             = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg]       = useState('');
  const abortRef                        = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchUsers();
    checkBridge();
    // Verificar bridge cada 10 segundos
    const interval = setInterval(checkBridge, 10_000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsers = async () => {
    try {
      const res  = await apiFetch('/admin/users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error('Error al obtener usuarios:', err);
    }
  };

  const checkBridge = async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      setBridgeOnline(data.ready === true);
    } catch {
      setBridgeOnline(false);
    }
  };

  const handleEnroll = async () => {
    if (!selectedUser) return;
    if (!bridgeOnline) {
      setStatus('error');
      setStatusMsg('El Biometric Bridge no está corriendo en esta PC.');
      return;
    }

    setLoading(true);
    setStatus('waiting');
    setStatusMsg('Pide al socio que coloque el dedo en el lector...');

    abortRef.current = new AbortController();
    const timer = setTimeout(() => abortRef.current?.abort(), ENROLL_TIMEOUT_MS);

    try {
      const res = await fetch(`${BRIDGE_URL}/enroll`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user_id: parseInt(selectedUser) }),
        signal:  abortRef.current.signal,
      });

      clearTimeout(timer);
      const data = await res.json();

      if (data.ok) {
        setStatus('success');
        setStatusMsg('✅ Huella enrolada correctamente.');
        setSelectedUser('');
        fetchUsers(); // refrescar lista
      } else {
        setStatus('error');
        setStatusMsg(data.msg || 'No se pudo enrolar la huella.');
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        setStatus('error');
        setStatusMsg('Tiempo agotado. El socio no colocó el dedo a tiempo.');
      } else {
        setStatus('error');
        setStatusMsg('No se pudo conectar con el Biometric Bridge.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAbort = async () => {
    abortRef.current?.abort();
    try { await fetch(`${BRIDGE_URL}/abort`, { method: 'POST' }); } catch {}
    setLoading(false);
    setStatus('idle');
    setStatusMsg('');
  };

  const selectedUserName = users.find(u => u.id === parseInt(selectedUser))?.name ?? '';

  return (
    <div>
      <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--text)', fontSize: '1.8rem', marginBottom: '8px' }}>Integración Biométrica</h1>
          <p style={{ color: 'var(--secondary)' }}>Gestión de hardware Digital Persona U.are.U 4500.</p>
        </div>

        {/* Indicador de estado del bridge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 16px', borderRadius: '20px',
          background: bridgeOnline === null ? '#1a1a1a'
                    : bridgeOnline         ? 'rgba(74,222,128,0.1)'
                                           : 'rgba(248,113,113,0.1)',
          border: `1px solid ${bridgeOnline === null ? '#333'
                             : bridgeOnline         ? '#4ade80'
                                                    : '#f87171'}`,
        }}>
          {bridgeOnline === null  ? <Wifi size={16} color="#666" /> :
           bridgeOnline           ? <Wifi size={16} color="#4ade80" /> :
                                    <WifiOff size={16} color="#f87171" />}
          <span style={{ fontSize: '0.85rem', fontWeight: 600,
            color: bridgeOnline === null ? '#666' : bridgeOnline ? '#4ade80' : '#f87171' }}>
            {bridgeOnline === null ? 'Verificando...' : bridgeOnline ? 'Bridge Conectado' : 'Bridge Offline'}
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px' }}>

        {/* Info del Bridge */}
        <div className="card" style={{ borderTop: '4px solid var(--primary)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <MonitorPlay size={20} color="var(--primary)" /> Servicio Enlace U.are.U
          </h3>
          <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '15px', lineHeight: '1.5' }}>
            El <strong>Hybrid Biometric Bridge</strong> debe estar corriendo en esta PC para comunicarse con el lector USB.
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <li>Conecta el lector Digital Persona 4500 al puerto USB.</li>
            <li>El bridge inicia automáticamente al encender la PC.</li>
            <li>Selecciona un socio y activa el lector para enrolar su huella.</li>
          </ul>
          <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(0,102,255,0.08)', borderRadius: '8px', border: '1px solid rgba(0,102,255,0.2)', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--secondary)' }}>Bridge local: </span>
            <code style={{ color: 'var(--primary)' }}>{BRIDGE_URL}</code>
          </div>

          <button
            onClick={checkBridge}
            className="btn-secondary"
            style={{ marginTop: '15px', width: '100%', fontSize: '0.85rem' }}
          >
            Verificar Conexión
          </button>
        </div>

        {/* Panel de Enrolamiento */}
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Enrolar Nuevo Socio</h3>

          <div className="form-group">
            <label>1. Selecciona el Socio en Recepción</label>
            <select
              className="input-field"
              value={selectedUser}
              onChange={e => { setSelectedUser(e.target.value); setStatus('idle'); setStatusMsg(''); }}
              style={{ height: '37px', boxSizing: 'border-box', width: '100%' }}
              disabled={loading}
            >
              <option value="">-- Buscar Socio --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.fingerprints?.length ? '✅ Huella registrada' : '❌ Sin huella'}
                </option>
              ))}
            </select>
          </div>

          {/* Área de captura */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px 20px', background: '#0a0a0a', borderRadius: '8px',
            border: `2px dashed ${status === 'success' ? '#4ade80' : status === 'error' ? '#f87171' : '#333'}`,
            marginTop: '20px', transition: 'border-color 0.3s',
          }}>
            {selectedUser ? (
              <>
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  {status === 'success' ? (
                    <CheckCircle size={80} color="#4ade80" />
                  ) : status === 'error' ? (
                    <XCircle size={80} color="#f87171" />
                  ) : (
                    <Fingerprint size={80} color={loading ? 'var(--primary)' : '#555'}
                      style={{ filter: loading ? 'drop-shadow(0 0 12px rgba(0,102,255,0.6))' : 'none', transition: 'all 0.3s' }} />
                  )}
                  {loading && (
                    <div style={{
                      position: 'absolute', top: '-10px', left: '-10px', right: '-10px', bottom: '-10px',
                      border: '2px solid var(--primary)', borderRadius: '50%',
                      animation: 'pulse 1.5s infinite'
                    }} />
                  )}
                </div>

                <h4 style={{
                  color: status === 'success' ? '#4ade80' : status === 'error' ? '#f87171' : loading ? 'var(--primary)' : 'var(--text)',
                  marginBottom: '10px', textAlign: 'center',
                }}>
                  {status === 'success' ? '¡Huella enrolada!' :
                   status === 'error'   ? 'Error en enrolamiento' :
                   loading              ? 'Esperando lectura...' :
                                         `Listo para enrolar a ${selectedUserName}`}
                </h4>

                {statusMsg && (
                  <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', textAlign: 'center', maxWidth: '320px', marginBottom: '10px' }}>
                    {statusMsg}
                  </p>
                )}

                {loading ? (
                  <button onClick={handleAbort} className="btn-secondary" style={{ marginTop: '16px', width: '200px' }}>
                    Cancelar
                  </button>
                ) : (
                  <button
                    onClick={status === 'success' || status === 'error'
                      ? () => { setStatus('idle'); setStatusMsg(''); }
                      : handleEnroll}
                    className="btn"
                    style={{ marginTop: '16px', width: '220px' }}
                    disabled={!bridgeOnline}
                  >
                    {status === 'success' || status === 'error' ? 'Enrolar otro socio' : '👆 Activar Lector USB'}
                  </button>
                )}
              </>
            ) : (
              <>
                <Database size={40} color="#333" style={{ marginBottom: '15px' }} />
                <p style={{ color: 'var(--secondary)' }}>Selecciona un socio para iniciar el vínculo biométrico.</p>
              </>
            )}
          </div>

          <style>{`
            @keyframes pulse {
              0%   { transform: scale(0.9); opacity: 1; }
              100% { transform: scale(1.5); opacity: 0; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
};

export default Biometrics;
