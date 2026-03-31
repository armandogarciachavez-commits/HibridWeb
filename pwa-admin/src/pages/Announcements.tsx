import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Megaphone, X, Image, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useToast } from '../components/ui/ToastContext';
import ConfirmModal from '../components/ui/ConfirmModal';

interface Announcement {
  id: number;
  title: string;
  body: string | null;
  image: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const empty = (): Partial<Announcement> => ({ title: '', body: '', image: null, is_active: true, expires_at: '' });

const Announcements = () => {
  const [items, setItems]           = useState<Announcement[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [editing, setEditing]       = useState<Partial<Announcement>>(empty());
  const [saving, setSaving]         = useState(false);
  const [confirmId, setConfirmId]   = useState<number | null>(null);
  const fileRef                     = useRef<HTMLInputElement>(null);
  const { addToast: showToast }     = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/announcements');
      const data = await res.json();
      setItems(data);
    } catch { showToast('Error al cargar anuncios', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(empty()); setModal(true); };
  const openEdit   = (a: Announcement) => { setEditing({ ...a }); setModal(true); };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setEditing(prev => ({ ...prev, image: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!editing.title?.trim()) { showToast('El título es obligatorio', 'error'); return; }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const res = await apiFetch(
        isNew ? '/admin/announcements' : `/admin/announcements/${editing.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:      editing.title,
            body:       editing.body || null,
            image:      editing.image || null,
            is_active:  editing.is_active,
            expires_at: editing.expires_at || null,
          }),
        }
      );
      if (!res.ok) throw new Error();
      showToast(isNew ? 'Anuncio creado' : 'Anuncio actualizado', 'success');
      setModal(false);
      load();
    } catch { showToast('Error al guardar', 'error'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (id: number) => {
    try {
      await apiFetch(`/admin/announcements/${id}/toggle`, { method: 'PATCH' });
      setItems(prev => prev.map(a => a.id === id ? { ...a, is_active: !a.is_active } : a));
    } catch { showToast('Error al cambiar estado', 'error'); }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    try {
      await apiFetch(`/admin/announcements/${confirmId}`, { method: 'DELETE' });
      setItems(prev => prev.filter(a => a.id !== confirmId));
      showToast('Anuncio eliminado', 'success');
    } catch { showToast('Error al eliminar', 'error'); }
    finally { setConfirmId(null); }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Anuncios y Promociones</h1>
          <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Envía mensajes y promociones a la app de socios
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Nuevo Anuncio
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 className="animate-spin" size={30} color="var(--primary)" />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--secondary)' }}>
          <Megaphone size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <p>No hay anuncios. Crea el primero.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {items.map(ann => (
            <div key={ann.id} className="card" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', opacity: ann.is_active ? 1 : 0.5 }}>
              {ann.image && (
                <img src={ann.image} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 700 }}>{ann.title}</h3>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: ann.is_active ? 'rgba(0,204,102,0.15)' : 'rgba(255,68,68,0.15)', color: ann.is_active ? '#00cc66' : '#ff4444', fontWeight: 600 }}>
                    {ann.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                {ann.body && <p style={{ color: 'var(--secondary)', fontSize: '0.88rem', marginBottom: '4px', whiteSpace: 'pre-wrap' }}>{ann.body}</p>}
                {ann.expires_at && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--secondary)' }}>
                    Expira: {new Date(ann.expires_at).toLocaleDateString('es-MX')}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button title={ann.is_active ? 'Desactivar' : 'Activar'} onClick={() => handleToggle(ann.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: ann.is_active ? '#00cc66' : 'var(--secondary)', padding: '6px' }}>
                  {ann.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <button title="Editar" onClick={() => openEdit(ann)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)', padding: '6px' }}>
                  <Pencil size={18} />
                </button>
                <button title="Eliminar" onClick={() => setConfirmId(ann.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4444', padding: '6px' }}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'var(--text)', fontSize: '1.1rem' }}>{editing.id ? 'Editar Anuncio' : 'Nuevo Anuncio'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)' }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label">Título *</label>
                <input className="form-input" value={editing.title || ''} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Promo Marzo 2026" />
              </div>

              <div>
                <label className="form-label">Mensaje</label>
                <textarea className="form-input" rows={4} value={editing.body || ''} onChange={e => setEditing(p => ({ ...p, body: e.target.value }))} placeholder="Texto del anuncio..." style={{ resize: 'vertical' }} />
              </div>

              <div>
                <label className="form-label">Imagen (opcional)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button type="button" className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px' }}
                    onClick={() => fileRef.current?.click()}>
                    <Image size={16} /> Subir imagen
                  </button>
                  {editing.image && (
                    <>
                      <img src={editing.image} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
                      <button onClick={() => setEditing(p => ({ ...p, image: null }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4444' }}>
                        <X size={16} />
                      </button>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImage} />
              </div>

              <div>
                <label className="form-label">Fecha de expiración (opcional)</label>
                <input className="form-input" type="date" value={editing.expires_at?.split('T')[0] || ''} onChange={e => setEditing(p => ({ ...p, expires_at: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="is_active" checked={!!editing.is_active} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} />
                <label htmlFor="is_active" style={{ color: 'var(--text)', fontSize: '0.9rem', cursor: 'pointer' }}>Publicar inmediatamente</label>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {saving ? <Loader2 className="animate-spin" size={16} /> : null}
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmId}
        title="Eliminar anuncio"
        message="¿Eliminar este anuncio? Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
};

export default Announcements;
