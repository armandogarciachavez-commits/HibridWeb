import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Megaphone, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useToast } from '../components/ui/ToastContext';
import ConfirmModal from '../components/ui/ConfirmModal';

interface Announcement {
  id: number;
  title: string;
  body: string | null;
  image: string | null;
  is_active: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const empty = (): Partial<Announcement> => ({ title: '', body: '', image: null, is_active: true, published_at: '', expires_at: '' });

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

    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen no puede superar 2 MB', 'error');
      e.target.value = '';
      return;
    }

    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width > 800 || img.height > 800) {
        showToast(`Imagen demasiado grande (${img.width}×${img.height}px). Máximo 800×800px`, 'error');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => setEditing(prev => ({ ...prev, image: ev.target?.result as string }));
      reader.readAsDataURL(file);
    };
    img.src = url;
  };

  const handleSave = async () => {
    if (!editing.title?.trim()) { showToast('El título es obligatorio', 'error'); return; }
    if (editing.expires_at) {
      const exp = new Date(editing.expires_at);
      const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (exp < minDate) {
        showToast('La fecha de expiración debe ser al menos 24 horas desde ahora', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const res = await apiFetch(
        isNew ? '/admin/announcements' : `/admin/announcements/${editing.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:        editing.title,
            body:         editing.body || null,
            image:        editing.image || null,
            is_active:    editing.is_active,
            published_at: editing.published_at || null,
            expires_at:   editing.expires_at || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.message || JSON.stringify(err?.errors || 'Error al enviar');
        showToast(msg, 'error');
        return;
      }
      showToast(isNew ? 'Anuncio enviado' : 'Anuncio actualizado', 'success');
      setModal(false);
      load();
    } catch (e: any) { showToast(e?.message || 'Error de conexión', 'error'); }
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
        <button className="btn" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Nuevo Anuncio
        </button>
        <div>
          <h1 className="admin-page-title">Anuncios y Promociones</h1>
          <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Envía mensajes y promociones a la app de socios
          </p>
        </div>
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
          {items.map(ann => {
            const isExpired = !!ann.expires_at && new Date(ann.expires_at) < new Date();
            const effectivelyActive = ann.is_active && !isExpired;
            const badgeLabel   = isExpired ? 'Expirado' : ann.is_active ? 'Activo' : 'Inactivo';
            const badgeBg      = isExpired ? 'rgba(255,153,0,0.15)' : effectivelyActive ? 'rgba(0,204,102,0.15)' : 'rgba(255,68,68,0.15)';
            const badgeColor   = isExpired ? '#ff9900' : effectivelyActive ? '#00cc66' : '#ff4444';
            return (
            <div key={ann.id} className="card" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', opacity: effectivelyActive ? 1 : 0.55 }}>
              {ann.image && (
                <img src={ann.image} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 700 }}>{ann.title}</h3>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: badgeBg, color: badgeColor, fontWeight: 600 }}>
                    {badgeLabel}
                  </span>
                </div>
                {ann.body && <p style={{ color: 'var(--secondary)', fontSize: '0.88rem', marginBottom: '4px', whiteSpace: 'pre-wrap' }}>{ann.body}</p>}
                {ann.expires_at && (
                  <p style={{ fontSize: '0.78rem', color: isExpired ? '#ff9900' : 'var(--secondary)' }}>
                    {isExpired ? '⚠ Expiró el' : 'Expira:'} {new Date(ann.expires_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
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
          );
          })}
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

              {/* Título */}
              <div style={{ width: '100%' }}>
                <label className="form-label">Título *</label>
                <input
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 'var(--font-size, 1rem)', height: '2.4rem' }}
                  value={editing.title || ''}
                  onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                  placeholder="Ej: Promo Marzo 2026"
                />
              </div>

              {/* Mensaje */}
              <div style={{ width: '100%' }}>
                <label className="form-label">Mensaje</label>
                <textarea
                  className="form-input"
                  rows={4}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 'var(--font-size, 1rem)', lineHeight: 1.6 }}
                  value={editing.body || ''}
                  onChange={e => setEditing(p => ({ ...p, body: e.target.value }))}
                  placeholder="Texto del anuncio..."
                />
              </div>

              {/* Imagen */}
              <div>
                <label className="form-label">Imagen (opcional)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button type="button" className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px' }}
                    onClick={() => fileRef.current?.click()}>
                    <ImageIcon size={16} /> Subir imagen
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

              {/* Fechas en grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Programar publicación</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    style={{ width: '100%', boxSizing: 'border-box', height: '2.4rem', fontSize: '0.9rem' }}
                    value={editing.published_at?.slice(0, 16) || ''}
                    onChange={e => setEditing(p => ({ ...p, published_at: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">Fecha de expiración</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    style={{ width: '100%', boxSizing: 'border-box', height: '2.4rem', fontSize: '0.9rem' }}
                    value={editing.expires_at?.slice(0, 16) || ''}
                    min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                    onChange={e => setEditing(p => ({ ...p, expires_at: e.target.value }))}
                  />
                </div>
              </div>

              {/* Publicar inmediatamente */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="is_active" checked={!!editing.is_active} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} />
                <label htmlFor="is_active" style={{ color: 'var(--text)', fontSize: '0.9rem', cursor: 'pointer' }}>Publicar inmediatamente</label>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {saving ? <Loader2 className="animate-spin" size={16} /> : null}
                  {saving ? 'Enviando...' : 'Enviar'}
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
