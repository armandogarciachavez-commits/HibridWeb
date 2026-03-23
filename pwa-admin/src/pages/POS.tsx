import { useState, useEffect } from 'react';
import { CreditCard, Receipt, Search } from 'lucide-react';
import { apiFetch } from '../lib/api';

const POS = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  const [planType, setPlanType] = useState('Mensualidad Base ($350)');
  const [duration, setDuration] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/admin/users')
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching users", err));
  }, []);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return alert("Selecciona un socio primero");
    
    setLoading(true);
    try {
      const res = await apiFetch('/admin/memberships', {
        method: 'POST',
        body: JSON.stringify({
          user_id: selectedUser.id,
          plan_type: planType,
          duration_months: duration
        })
      });

      if (res.ok) {
        alert(`Cobro procesado. Membresía ${planType} activa por ${duration} meses para ${selectedUser.name}.`);
        setSelectedUser(null);
      } else {
        alert('Error procesando el pago en la base de datos.');
      }
    } catch (error) {
      alert('Error de red. Verifica el backend Laravel.');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ color: 'var(--text)', fontSize: '1.8rem', marginBottom: '8px' }}>Punto de Venta (POS)</h1>
        <p style={{ color: 'var(--secondary)' }}>Cobra membresías y otórgales acceso automático al calendario del socio.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(350px, 1.2fr)', gap: '30px' }}>
        
        {/* Lado Izquierdo: Buscador de Socios */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '15px' }}>Seleccionar Socio</h2>
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <Search size={18} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--secondary)' }} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o correo..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }}
            />
          </div>

          <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px' }}>
            {filteredUsers.length === 0 ? <p style={{ color: 'var(--secondary)' }}>No se encontraron socios.</p> : null}
            {filteredUsers.map(u => (
              <div 
                key={u.id}
                onClick={() => setSelectedUser(u)}
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: `1px solid ${selectedUser?.id === u.id ? 'var(--primary)' : '#333'}`,
                  background: selectedUser?.id === u.id ? 'rgba(0,102,255,0.1)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 'bold' }}>{u.name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>{u.email}</div>
                <div style={{ fontSize: '0.8rem', color: u.memberships?.length ? '#00cc66' : '#ff4444', marginTop: '4px' }}>
                  {u.memberships?.length ? 'Membresía Activa' : 'Vencida / Sin Plan'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lado Derecho: Procesador de Pago */}
        <div className="card" style={{ opacity: selectedUser ? 1 : 0.5, pointerEvents: selectedUser ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            Procesar Pago: {selectedUser ? selectedUser.name : 'Nadie seleccionado'}
          </h2>
          
          <form onSubmit={handlePayment} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Plan / Paquete</label>
              <select 
                value={planType}
                onChange={e => setPlanType(e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }}
              >
                <option value="Mensualidad Base ($350)">Mensualidad Base ($350)</option>
                <option value="Hybrid Pro ($500)">Hybrid Pro ($500)</option>
                <option value="Pase de 1 Día ($60)">Pase de 1 Día ($60)</option>
                <option value="Anualidad ($3,500)">Anualidad VIP ($3,500)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Duración (Meses de acceso)</label>
              <input 
                type="number" 
                min="1" 
                max="12"
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value))}
                style={{ width: '100%', padding: '12px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} 
              />
            </div>

            <div style={{ padding: '15px', background: 'rgba(0,102,255,0.05)', border: '1px dashed var(--primary)', borderRadius: '6px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '5px' }}>Resumen:</p>
              <p style={{ fontWeight: 'bold' }}>Se activará acceso en la PWA de Socios para {selectedUser?.name} por los próximos {duration} mes(es).</p>
            </div>

            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', height: '50px', fontSize: '1rem', marginTop: '10px' }}>
              {loading ? 'Procesando en DB...' : <><CreditCard size={20} /> Registrar Pago y Activar</>}
            </button>
            <button type="button" className="btn-secondary" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}>
               <Receipt size={18} /> Solo Imprimir Recibo
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default POS;
