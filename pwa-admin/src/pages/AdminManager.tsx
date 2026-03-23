import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, UserPlus, Trash2 } from 'lucide-react';
import { useToast } from '../components/ui/ToastContext';
import ConfirmModal from '../components/ui/ConfirmModal';
import { apiFetch } from '../lib/api';

const AdminManager = () => {
  const { addToast } = useToast();

  const [admins, setAdmins]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, adminId: null as number | null, adminName: '' });
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: 'admin' });
  const [saving, setSaving]       = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/superadmin/admins');
      const data = await res.json();
      setAdmins(Array.isArray(data) ? data : []);
    } catch {
      addToast('Error al cargar administradores.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.username || !form.password) {
      addToast('Completa todos los campos obligatorios.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/superadmin/admins', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) {
        addToast(`Administrador "${form.name}" creado.`, 'success');
        setShowModal(false);
        setForm({ name: '', username: '', email: '', password: '', role: 'admin' });
        fetchAdmins();
      } else {
        addToast(data.message || 'Error al crear administrador.', 'error');
      }
    } catch {
      addToast('Error de conexión.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmModal.adminId) return;
    try {
      const res = await apiFetch(`/superadmin/admins/${confirmModal.adminId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        addToast('Administrador eliminado.', 'success');
        fetchAdmins();
      } else {
        addToast(data.message || 'Error al eliminar.', 'error');
      }
    } catch {
      addToast('Error de conexión.', 'error');
    } finally {
      setConfirmModal({ isOpen: false, adminId: null, adminName: '' });
    }
  };

  // ID del usuario actual — guardado en localStorage al hacer login
  const currentUserId = Number(localStorage.getItem('user_id')) || null;

  return (
    <div>
      <header className="d-flex justify-content-between align-items-center mb-4" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="text-white mb-1" style={{ fontSize: '1.8rem' }}>Administradores</h1>
          <p className="text-muted">Gestión de acceso al panel de administración</p>
        </div>
        <button className="btn" onClick={() => setShowModal(true)}>
          <UserPlus size={18} /> Nuevo Administrador
        </button>
      </header>

      {loading ? (
        <p className="text-muted" style={{ textAlign: 'center', marginTop: '60px' }}>Cargando...</p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Registrado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map(a => (
                <tr key={a.id}>
                  <td className="text-white" style={{ fontWeight: 500 }}>{a.name}</td>
                  <td className="text-muted">@{a.username}</td>
                  <td className="text-muted">{a.email || '—'}</td>
                  <td>
                    <span className={`badge ${a.role === 'superadmin' ? 'badge-info' : 'badge-warning'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      {a.role === 'superadmin' ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      {a.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td className="text-muted" style={{ fontSize: '0.85rem' }}>
                    {new Date(a.created_at).toLocaleDateString('es-MX')}
                  </td>
                  <td>
                    {a.id !== currentUserId && (
                      <button
                        onClick={() => setConfirmModal({ isOpen: true, adminId: a.id, adminName: a.name })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                        title="Eliminar administrador"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {admins.length === 0 && (
            <p className="text-muted" style={{ textAlign: 'center', padding: '40px' }}>No hay administradores registrados.</p>
          )}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '30px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            <h2 style={{ color: 'var(--text)', marginBottom: '24px', fontSize: '1.3rem' }}>Nuevo Administrador</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label">Usuario *</label>
                <input className="form-control" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label">Email</label>
                <input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label">Contraseña *</label>
                <input type="password" className="form-control" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label">Rol</label>
                <select className="form-control" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="admin">Administrador</option>
                  <option value="superadmin">Super Administrador</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn" style={{ flex: 1, opacity: saving ? 0.7 : 1 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear Administrador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="Eliminar Administrador"
        message={`¿Estás seguro de eliminar a "${confirmModal.adminName}"? Perderá acceso al panel inmediatamente.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmModal({ isOpen: false, adminId: null, adminName: '' })}
      />
    </div>
  );
};

export default AdminManager;
