import { useState, useEffect } from 'react';
import { Fingerprint, MonitorPlay, Database } from 'lucide-react';
import { apiFetch } from '../lib/api';

const Biometrics = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/admin/users');
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error("Error al obtener usuarios:", error);
    }
  };

  return (
    <div>
      <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--text)', fontSize: '1.8rem', marginBottom: '8px' }}>Integración Biométrica</h1>
          <p style={{ color: 'var(--secondary)' }}>Gestión de hardware Digital Persona U.are.U 4500.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px' }}>
        
        {/* Instrucciones del Middleware */}
        <div className="card" style={{ borderTop: '4px solid var(--primary)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <MonitorPlay size={20} color="var(--primary)"/> Servicio Enlace U.are.U
          </h3>
          <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '15px', lineHeight: '1.5' }}>
            Para que este navegador web se comunique con el lector USB, debes tener ejecutando el programa <strong>"Hybrid Biometric Bridge" (C# / Node.js)</strong> en esta computadora.
          </p>
          
          <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <li>Conecta el lector Digital Persona 4500 al puerto USB.</li>
            <li>Inicia el <span style={{color: 'var(--primary)', fontWeight: 'bold'}}>Biometric Bridge</span> en segundo plano.</li>
            <li>El bridge leerá la huella, generará el Hash Base64, y lo enviará automáticamente a nuestra API.</li>
          </ul>

          <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,102,255,0.1)', borderRadius: '8px', border: '1px solid rgba(0,102,255,0.2)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '5px' }}>Endpoint de Integración:</div>
            <code style={{ color: 'var(--primary)', fontWeight: 'bold' }}>POST /api/biometric/enroll</code>
            <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginTop: '5px' }}>Body: &#123; user_id, template_data &#125;</div>
          </div>
        </div>

        {/* Panel de Enrolamiento UI */}
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Enrolar Nuevo Socio</h3>
          
          <div className="form-group">
            <label>1. Selecciona el Socio en Recepción</label>
            <select
              className="input-field"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ height: '37px', boxSizing: 'border-box', width: '100%' }}
            >
              <option value="">-- Buscar Socio --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: '#0a0a0a', borderRadius: '8px', border: '2px dashed #333', marginTop: '20px' }}>
            {selectedUser ? (
              <>
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <Fingerprint size={80} color={loading ? "var(--primary)" : "#333"} style={{ filter: loading ? 'drop-shadow(0 0 10px rgba(0,102,255,0.5))' : 'none', transition: 'all 0.3s' }} />
                  {loading && <div className="pulse-ring" style={{ position: 'absolute', top: '-10px', left: '-10px', right: '-10px', bottom: '-10px', border: '2px solid var(--primary)', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></div>}
                </div>
                
                <h4 style={{ color: loading ? 'var(--primary)' : 'var(--text)', marginBottom: '10px' }}>
                  {loading ? 'Esperando lectura de hardware...' : 'Listo para enrolar'}
                </h4>
                
                <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', textAlign: 'center', maxWidth: '300px' }}>
                  {loading 
                    ? `Pide a ${users.find(u=>u.id === parseInt(selectedUser))?.name} que coloque su dedo en el lector USB 4 veces.`
                    : 'Haz clic en el botón de abajo para activar el lector en el puente local puente local.'}
                </p>

                <button 
                  className={loading ? "btn-secondary" : "btn"} 
                  style={{ marginTop: '20px', width: '200px' }}
                  onClick={() => setLoading(!loading)}
                >
                  {loading ? 'Cancelar Conexión' : 'Activar Lector USB'}
                </button>
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
              0% { transform: scale(0.9); opacity: 1; }
              100% { transform: scale(1.5); opacity: 0; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
};

export default Biometrics;
