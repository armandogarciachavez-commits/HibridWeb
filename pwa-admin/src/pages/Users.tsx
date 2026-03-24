import { useState, useEffect } from 'react';
import { UserPlus, Fingerprint, Search, Users as UsersIcon, UserCheck, History } from 'lucide-react';
import { useToast } from '../components/ui/ToastContext';
import Spinner from '../components/ui/Spinner';
import ConfirmModal from '../components/ui/ConfirmModal';
import { apiFetch } from '../lib/api';

const Users = () => {
  const { addToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [newUser, setNewUser] = useState<any>({ id: null, name: '', username: '', email: '', phone: '', address: '', password: '', emergencyName: '', emergencyPhone: '', planType: 'none', photo: '' });
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, userId: null as number | null });
  
  // State variables for manual renewal
  const [manualPlan, setManualPlan] = useState('mensual');
  const [manualStart, setManualStart] = useState(new Date().toISOString().split('T')[0]);
  
  // Default end date is (+30 days) from today roughly
  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 30);
  const [manualEnd, setManualEnd] = useState(defaultEnd.toISOString().split('T')[0]);

  // Cargar lista de usuarios desde Laravel
  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/admin/users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      addToast("Error fetching users from database", "error");
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.username || !newUser.phone || !newUser.address || (!newUser.id && !newUser.password)) {
        addToast("Por favor completa todos los campos obligatorios (*).", "warning");
        return;
    }
    setLoading(true);
    try {
      const isEdit = !!newUser.id;
      const url = isEdit ? `/admin/users/${newUser.id}` : '/admin/users';

      const formData = new FormData();
      formData.append('name', newUser.name);
      formData.append('username', newUser.username);
      if (newUser.email) formData.append('email', newUser.email);
      formData.append('phone', newUser.phone);
      formData.append('address', newUser.address);
      if (newUser.emergencyName) formData.append('emergency_contact_name', newUser.emergencyName);
      if (newUser.emergencyPhone) formData.append('emergency_contact_phone', newUser.emergencyPhone);
      
      if (!isEdit) {
          formData.append('password', newUser.password);
          formData.append('plan_type', newUser.planType);
      } else {
          formData.append('_method', 'PUT');
          if (newUser.password) {
              formData.append('password', newUser.password);
          }
      }

      if (newUser.photo instanceof Blob || newUser.photo instanceof File) {
          formData.append('photo', newUser.photo);
      }

      const res = await apiFetch(url, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        addToast(isEdit ? `Información de ${newUser.name} actualizada.` : `Socio ${newUser.name} registrado en Base de Datos.`, "success");
        setShowModal(false);
        setNewUser({ id: null, name: '', username: '', email: '', phone: '', address: '', password: '', emergencyName: '', emergencyPhone: '', planType: 'none', photo: '' });
        fetchUsers();
      } else {
        const errorData = await res.json();
        addToast(`Error al guardar socio: ${errorData.message}`, "error");
      }
    } catch (error) {
      addToast('Error de conexión con el Backend Laravel.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!confirmModal.userId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/users/${confirmModal.userId}`, { method: 'DELETE' });
      if (res.ok) {
        addToast("Socio eliminado del sistema exitosamente.", "success");
        setSelectedUser(null);
        setConfirmModal({ isOpen: false, userId: null });
        fetchUsers();
      } else {
        const d = await res.json();
        addToast("Error al eliminar el socio: " + (d.message || "Contacta soporte."), "error");
      }
    } catch (err) {
      addToast("Error de conexión al eliminar.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setConfirmModal({ isOpen: true, userId: id });
  };

  const handleEditClick = (user: any) => {
      setSelectedUser(null);
      setNewUser({
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email || '',
          phone: user.phone || '',
          address: user.address || '',
          password: '',
          emergencyName: user.emergency_contact_name || '',
          emergencyPhone: user.emergency_contact_phone || '',
          planType: 'none',
          photo: user.photo || user.profile_photo_url || ''
      });
      setShowModal(true);
  };

  const handleManualRenew = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const res = await apiFetch('/admin/memberships', {
        method: 'POST',
        body: JSON.stringify({
           user_id: selectedUser.id,
           plan_type: manualPlan,
           start_date: manualStart,
           end_date: manualEnd
        })
      });
      if (res.ok) {
        addToast("Suscripción renovada exitosamente de forma manual.", "success");
        setSelectedUser(null);
        fetchUsers();
      } else {
        const d = await res.json();
        addToast("Error al renovar: " + (d.message || "Verifica los datos."), "error");
      }
    } catch (err) {
      addToast('Error de conexión con el Backend Laravel.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const currentUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div>
      <header className="d-flex justify-content-between align-items-center mb-4" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="text-white mb-1" style={{ fontSize: '1.8rem' }}>Gestión de Socios</h1>
          <p className="text-muted">Altas, membresías y enrolamiento biométrico conectados al Backend Local</p>
        </div>
        <div className="d-flex align-items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} className="text-muted" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Buscar (Nombre, Login, Correo)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '38px', minWidth: '280px' }}
            />
          </div>
          <button className="btn" onClick={() => { 
            setNewUser({ id: null, name: '', username: '', email: '', phone: '', address: '', password: '', emergencyName: '', emergencyPhone: '', planType: 'none', photo: '' }); 
            setShowModal(true); 
          }}>
            <UserPlus size={18} /> Nuevo Socio
          </button>
        </div>
      </header>

      {initialLoading ? (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
          <div className="d-flex flex-column align-items-center gap-3">
            <Spinner size="40px" />
            <p className="text-muted">Sincronizando con Laravel...</p>
          </div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="empty-state card">
          <UsersIcon size={64} style={{ opacity: 0.2 }} />
          <h3 className="text-white mt-3 mb-2">No se encontraron socios</h3>
          <p className="text-muted">No hay registros que coincidan con los filtros actuales o la base de datos está vacía.</p>
          <button className="btn mt-4" onClick={() => { setSearchTerm(''); setShowModal(true); }}>Agregar el primero</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {currentUsers.map(u => {
              let statusText = 'Sin Plan Activo';
              let badgeClass = 'badge-danger';
              let indicatorColor = 'var(--danger)';

              if (u.memberships?.length > 0) {
                const activePlan = u.memberships.find((m: any) => m.is_active);
                if (activePlan) {
                  const endDate = new Date(activePlan.end_date);
                  statusText = `Vigencia: ${endDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                  badgeClass = 'badge-success';
                  indicatorColor = '#00ff88';
                } else {
                  statusText = 'Membresía Expirada';
                }
              }

              return (
                <div
                  key={u.id}
                  className="card"
                  onClick={() => setSelectedUser(u)}
                  style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', position: 'relative', overflow: 'hidden', padding: '14px 16px', borderLeft: `3px solid ${indicatorColor}` }}
                >
                  <img
                    src={u.photo || u.profile_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=111&color=fff&size=80`}
                    alt={u.name}
                    style={{ width: '52px', height: '52px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${indicatorColor}`, padding: '2px', objectFit: 'cover' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="text-white" style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</h3>
                    <p className="text-muted fs-sm" style={{ marginBottom: '6px' }}>{u.username ? `@${u.username}` : ''}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className={`badge ${badgeClass}`} style={{ alignSelf: 'flex-start', fontSize: '0.75rem' }}>{statusText}</span>
                      <span className="fs-sm d-flex align-items-center gap-2" style={{ color: u.fingerprints?.length ? 'var(--primary)' : 'var(--secondary)', fontSize: '0.75rem' }}>
                        <Fingerprint size={13} /> {u.fingerprints?.length ? 'Huella Guardada' : 'Falta Biométrica'}
                      </span>
                      {u.created_by && (
                        <span style={{ fontSize: '0.72rem', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <UserCheck size={11} /> {u.created_by?.name ?? `#${u.created_by}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <span className="text-muted fs-sm mr-2">Página {currentPage} de {totalPages}</span>
              <button className="pagination-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Anterior</button>
              <button className="pagination-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '30px', position: 'relative' }}>
            <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '1.5rem', cursor: 'pointer', zIndex: 10 }}>&times;</button>
            <h2 style={{ color: 'var(--text)', marginBottom: '25px', fontSize: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '10px' }}>{newUser.id ? 'Editar Información del Socio' : 'Registrar Nuevo Socio'}</h2>
            <form onSubmit={handleSave} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                
                {/* Columna Izquierda: Biometría y Foto */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', borderRight: window.innerWidth > 600 ? '1px solid #222' : 'none', paddingRight: window.innerWidth > 600 ? '20px' : '0' }}>
                   <div style={{ width: '150px', height: '150px', borderRadius: '50%', background: '#222', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px dashed #555', overflow: 'hidden' }}>
                      {newUser.photo ? (
                         <img src={typeof newUser.photo === 'string' ? newUser.photo : URL.createObjectURL(newUser.photo)} alt="Vista previa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                         <span style={{ color: 'var(--secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>Sin foto</span>
                      )}
                   </div>
                   <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                     <button type="button" className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '5px' }} onClick={() => {
                        alert("Iniciando conexión interactiva con la Webcam (En desarrollo)...");
                     }}>
                        <span style={{ fontSize: '1.2rem' }}>📷</span>
                        Tomar Foto
                     </button>
                     <label className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '1.2rem' }}>📁</span>
                        Subir Archivo
                        <input type="file" accept=".jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic" style={{ display: 'none' }} onChange={(e) => {
                           const file = e.target.files?.[0];
                           if(file) {
                               const validTypes = ['image/jpeg', 'image/png', 'image/heic'];
                               const validExts = ['.jpg', '.jpeg', '.png', '.heic'];
                               const fileName = file.name.toLowerCase();
                               // Basic validation
                               if(!validTypes.includes(file.type) && !validExts.some(ext => fileName.endsWith(ext))) {
                                   alert("⚠️ Formato no válido. Solo se permiten imágenes JPG, JPEG, PNG o HEIC de celular.");
                                   e.target.value = '';
                                   return;
                               }
                               // Instead of rejecting large files, compress them automatically using Canvas
                               const img = new Image();
                               img.onload = () => {
                                   const canvas = document.createElement('canvas');
                                   // Max dimensions for profile picture
                                   const MAX_WIDTH = 800;
                                   const MAX_HEIGHT = 800;
                                   let width = img.width;
                                   let height = img.height;

                                   if (width > height) {
                                       if (width > MAX_WIDTH) {
                                           height *= MAX_WIDTH / width;
                                           width = MAX_WIDTH;
                                       }
                                   } else {
                                       if (height > MAX_HEIGHT) {
                                           width *= MAX_HEIGHT / height;
                                           height = MAX_HEIGHT;
                                       }
                                   }

                                   canvas.width = width;
                                   canvas.height = height;
                                   const ctx = canvas.getContext('2d');
                                   if (ctx) {
                                       ctx.drawImage(img, 0, 0, width, height);
                                       // Compress to 70% quality JPEG and convert to Blob File
                                       canvas.toBlob((blob) => {
                                           if (blob) {
                                               const compressedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                                               setNewUser({...newUser, photo: compressedFile});
                                           }
                                       }, 'image/jpeg', 0.7);
                                   }
                               };
                               img.onerror = () => {
                                   alert("Error al procesar la imagen.");
                               };
                               
                               const reader = new FileReader();
                               reader.onloadend = () => {
                                   if (typeof reader.result === 'string') {
                                       img.src = reader.result;
                                   }
                               };
                               reader.readAsDataURL(file);
                           }
                        }} />
                     </label>
                   </div>
                   
                   <div style={{ width: '100%', padding: '20px', background: 'rgba(0,102,255,0.05)', border: '1px solid var(--primary)', borderRadius: '8px', textAlign: 'center', marginTop: 'auto' }}>
                      <Fingerprint size={40} color="var(--primary)" style={{ marginBottom: '10px' }} />
                      <h4 style={{ color: 'var(--primary)', marginBottom: '5px' }}>Huella Digital</h4>
                      <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '15px' }}>Registrar huella para control de acceso.</p>
                      <button type="button" className="btn" style={{ width: '100%' }} onClick={() => {
                         if (!newUser.id) {
                             alert("⚠️ Primero debes guardar los datos del socio para poder asignarle una huella digital.");
                         } else {
                             alert("Iniciando escáner de huellas en Windows... (Módulo biométrico conectando)");
                         }
                      }}>
                         👆 Capturar Huella
                      </button>
                   </div>
                </div>

                {/* Columna Derecha: Formulario de Datos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Nombre Completo</label>
                    <input required type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Usuario (Login)*</label>
                      <input required type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} placeholder="s_juanp" />
                    </div>
                    <div>
                       <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Teléfono Celular*</label>
                       <input required type="tel" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Correo Electrónico (Opcional)</label>
                    <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Dirección Completa*</label>
                    <input required type="text" value={newUser.address} onChange={e => setNewUser({...newUser, address: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>{newUser.id ? 'Cambiar Contraseña (Dejar en blanco para omitir)' : 'Contraseña PWA*'}</label>
                    <input required={!newUser.id} type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} placeholder={newUser.id ? '******' : ''} />
                  </div>
                  {!newUser.id && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.9rem' }}>Plan Inicial (Asignación Inmediata)</label>
                      <select value={newUser.planType} onChange={e => setNewUser({...newUser, planType: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }}>
                        <option value="none">Ninguno (Inscripción Base)</option>
                        <option value="mensual">Mensualidad ($1,100)</option>
                        <option value="bimestre">Bimestre ($2,100)</option>
                        <option value="trimestre">Trimestre ($2,900)</option>
                        <option value="anual">Anualidad Preferencial</option>
                      </select>
                    </div>
                  )}

                  <div style={{ padding: '15px', border: '1px solid #333', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', marginTop: '5px' }}>
                    <h4 style={{ color: '#ff4444', marginBottom: '10px', fontSize: '0.9rem' }}>Contacto de Emergencia</h4>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.85rem' }}>Nombre*</label>
                        <input required type="text" value={newUser.emergencyName} onChange={e => setNewUser({...newUser, emergencyName: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} placeholder="Familiar" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--secondary)', fontSize: '0.85rem' }}>Teléfono*</label>
                        <input required type="tel" value={newUser.emergencyPhone} onChange={e => setNewUser({...newUser, emergencyPhone: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px' }} placeholder="555..." />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #333' }}>
                <button type="button" className="btn-secondary" disabled={loading} style={{ padding: '10px 30px' }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn" disabled={loading} style={{ flex: 1, background: '#00cc66', fontSize: '1.1rem' }}>{loading ? 'Guardando...' : (newUser.id ? 'Guardar Cambios' : 'Registrar Socio')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: '20px' }} onClick={(e) => { if(e.target === e.currentTarget) setSelectedUser(null); }}>
          <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', animation: 'fadeIn 0.3s ease', padding: '30px' }}>
            <button onClick={() => setSelectedUser(null)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '1.5rem', cursor: 'pointer', zIndex: 10 }}>&times;</button>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
              {/* Columna Izquierda: Perfil y Status */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                 <img 
                    src={selectedUser.photo || selectedUser.photo_url || selectedUser.profile_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUser.name)}&background=111&color=fff&size=150`} 
                    alt={selectedUser.name} 
                    style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', marginBottom: '15px', border: '3px solid var(--primary)' }} 
                 />
                 <h2 style={{ color: 'var(--text)', marginBottom: '5px', fontSize: '1.4rem' }}>{selectedUser.name}</h2>
                 <p style={{ color: 'var(--secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>{selectedUser.email || 'Sin correo asociado'}</p>
                 
                 <div style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid #222', marginBottom: '15px' }}>
                    <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '8px' }}>Membresía Activa:</p>
                     {(() => {
                       const activePlan = selectedUser.memberships?.find((m: any) => m.is_active);
                       return activePlan ? (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                           <span style={{ color: '#00cc66', fontWeight: 'bold', fontSize: '1.1rem' }}>{activePlan.plan_type.toUpperCase()}</span>
                           <span style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>Vence el {new Date(activePlan.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                         </div>
                       ) : (
                          <p style={{ color: '#ff4444', fontSize: '0.9rem' }}>Sin plan activo (Expirado)</p>
                       );
                     })()}
                 </div>

                 {selectedUser.emergency_contact_name && (
                   <div style={{ width: '100%', textAlign: 'left', background: 'rgba(255,68,68,0.05)', padding: '15px', borderRadius: '8px', border: '1px solid #331111' }}>
                      <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>Contacto de Emergencia:</p>
                      <p style={{ color: '#ff4444', fontSize: '0.9rem', fontWeight: 'bold' }}>{selectedUser.emergency_contact_name}</p>
                      <p style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{selectedUser.emergency_contact_phone || 'Sin número'}</p>
                   </div>
                 )}
              </div>

              {/* Columna Derecha: Detalles y Renovación */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                 <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '15px', color: 'var(--primary)' }}>Detalles del Socio</h3>
                 
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                    <div>
                       <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>Usuario (Login):</p>
                       <p style={{ color: 'var(--text)', fontSize: '0.95rem' }}>{selectedUser.username || 'No asignado'}</p>
                    </div>
                    <div>
                       <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>Teléfono:</p>
                       <p style={{ color: 'var(--text)', fontSize: '0.95rem' }}>{selectedUser.phone || 'No registrado'}</p>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                       <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>Dirección Completa:</p>
                       <p style={{ color: 'var(--text)', fontSize: '0.95rem' }}>{selectedUser.address || 'Sin dirección'}</p>
                    </div>
                    <div>
                       <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>Fecha de Ingreso:</p>
                       <p style={{ color: 'var(--text)', fontSize: '0.95rem' }}>{new Date(selectedUser.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                       <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                         <UserCheck size={13} /> Registrado por:
                       </p>
                       <p style={{ color: selectedUser.created_by ? 'var(--primary)' : '#555', fontSize: '0.9rem', fontWeight: selectedUser.created_by ? 600 : 400 }}>
                         {selectedUser.created_by ? (selectedUser.created_by?.name ?? `Admin #${selectedUser.created_by}`) : 'Registro propio (web pública)'}
                       </p>
                    </div>
                 </div>

                 {/* Historial de Membresías */}
                 {selectedUser.memberships?.length > 0 && (
                   <div style={{ marginBottom: '15px' }}>
                     <h4 style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <History size={14} /> Historial de Membresías
                     </h4>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                       {[...selectedUser.memberships].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((m: any) => (
                         <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: m.is_active ? 'rgba(0,204,102,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: '6px', border: `1px solid ${m.is_active ? 'rgba(0,204,102,0.2)' : '#222'}` }}>
                           <div>
                             <span style={{ color: m.is_active ? '#00cc66' : 'var(--secondary)', fontSize: '0.82rem', fontWeight: 600 }}>{m.plan_type?.toUpperCase()}</span>
                             <span style={{ color: '#555', fontSize: '0.75rem', marginLeft: '8px' }}>
                               {new Date(m.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} → {new Date(m.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                             </span>
                           </div>
                           <div style={{ textAlign: 'right' }}>
                             {m.created_by ? (
                               <span style={{ fontSize: '0.72rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                 <UserCheck size={11} /> {m.created_by?.name ?? `Admin #${m.created_by}`}
                               </span>
                             ) : (
                               <span style={{ fontSize: '0.72rem', color: '#444' }}>Registro propio</span>
                             )}
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}

                 {/* Sección de Renovación Manual */}
                 <div style={{ background: 'rgba(255,165,0,0.05)', padding: '15px', borderRadius: '8px', border: '1px outset #553300', marginTop: 'auto' }}>
                   <h4 style={{ color: '#ffa500', marginBottom: '15px', fontSize: '1rem' }}>Renovación Manual (Efectivo/Transferencia)</h4>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                         <label style={{ color: 'var(--secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '5px' }}>Tipo de Plan</label>
                         <select value={manualPlan} onChange={e => setManualPlan(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#111', color: 'var(--text)', border: '1px solid #555' }}>
                            <option value="mensual">Mensualidad General</option>
                            <option value="bimestre">Bimestre</option>
                            <option value="trimestre">Trimestre</option>
                            <option value="anual">Anualidad Preferencial</option>
                         </select>
                      </div>
                      <div>
                         <label style={{ color: 'var(--secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '5px' }}>Inicio</label>
                         <input type="date" value={manualStart} onChange={e => setManualStart(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#111', color: 'var(--text)', border: '1px solid #555' }} />
                      </div>
                      <div>
                         <label style={{ color: 'var(--secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '5px' }}>Fin</label>
                         <input type="date" value={manualEnd} onChange={e => setManualEnd(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#111', color: 'var(--text)', border: '1px solid #555' }} />
                      </div>
                   </div>
                   <button className="btn" disabled={loading} style={{ width: '100%', marginTop: '15px', padding: '10px' }} onClick={handleManualRenew}>
                     {loading ? 'Procesando...' : 'Aplicar Pago / Renovación'}
                   </button>
                 </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '15px', marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #333' }}>
               <button className="btn-secondary" disabled={loading} style={{ padding: '8px 20px', background: '#dc3545', color: '#fff', border: 'none', marginRight: 'auto' }} onClick={() => handleDeleteClick(selectedUser.id)}>Eliminar Socio</button>
               <button className="btn-secondary" disabled={loading} style={{ padding: '8px 20px', background: '#e0a800', color: '#000', border: 'none' }} onClick={() => handleEditClick(selectedUser)}>Modificar Datos</button>
               <button className="btn-secondary" disabled={loading} style={{ padding: '8px 30px' }} onClick={() => setSelectedUser(null)}>Cerrar Ventana</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={confirmModal.isOpen} 
        title="Eliminar Socio Definitivamente" 
        message="⚠️ ¡Peligro! ¿Estás seguro de que deseas ELIMINAR este socio permanentemente? Se borrará todo su historial, accesos y pagos. Esta acción no se puede deshacer."
        confirmText="Eliminar Permanentemente"
        onConfirm={executeDelete}
        onCancel={() => setConfirmModal({ isOpen: false, userId: null })}
      />
    </div>
  );
};

export default Users;
