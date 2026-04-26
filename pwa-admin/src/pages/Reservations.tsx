import { useState, useEffect, useRef } from 'react';
import { Clock, Users, ChevronLeft, ChevronRight, Plus, Settings, Trash, Calendar, List, BookOpen, RefreshCw, Edit2, X } from 'lucide-react';
import { getClassIcon } from '../lib/classIcons';
import { useToast } from '../components/ui/ToastContext';
import Spinner from '../components/ui/Spinner';
import ConfirmModal from '../components/ui/ConfirmModal';
import { apiFetch } from '../lib/api';

const Reservations = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'calendar'|'daily'|'catalog'>('calendar');
  const [calendarView, setCalendarView] = useState<'month'|'week'|'day'>('month');
  
  // -- ESTADO GLOBAL --
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [catalog, setCatalog] = useState<any[]>([]);

  // Modal Confirms
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '', id: null as number | null, text: '' });
  
  // -- ESTADO FECHA CALENDARIO --
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  // Para los inputs por defecto, forzar la zona horaria local correcta
  const localIsoDate = new Date(currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  // -- ESTADO PESTAÑA: CATÁLOGO --
  const [newClassTemplate, setNewClassTemplate] = useState({ name: '', description: '', color: '#4CAF50', default_capacity: 15, default_duration_minutes: 60 });
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // -- ESTADO SESIONES --
  const [sessions, setSessions] = useState<any[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genParams, setGenParams] = useState({ gym_class_id: '', instructor: '', days_of_week: [] as number[], start_time: '08:00', end_time: '09:00', capacity: 15, target_month: new Date().getMonth() + 1, target_year: new Date().getFullYear() });
  const [showSingleSessionModal, setShowSingleSessionModal] = useState(false);
  const [singleSession, setSingleSession] = useState({ date: localIsoDate, gym_class_id: '', instructor: '', start_time: '08:00', end_time: '09:00', capacity: 15 });

  // -- ESTADO EDICIÓN DE SESIÓN --
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [editSessionForm, setEditSessionForm] = useState({ instructor: '', start_time: '08:00', end_time: '09:00', capacity: 15, date: '' });

  // -- ESTADO PESTAÑA: RESERVACIONES --
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [filterDate, setFilterDate]           = useState<string>('');
  const [attendeesModal, setAttendeesModal]   = useState<{ open: boolean; session: any; attendees: any[] }>({ open: false, session: null, attendees: [] });
  const [lastUpdated, setLastUpdated]         = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh]         = useState(true);
  const [spinning, setSpinning]               = useState(false);
  const INTERVAL_MS = 30_000; // 30 segundos
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchCatalog();
    if (activeTab === 'calendar') fetchSessions(currentMonth, currentYear);
    if (activeTab === 'daily') fetchAllReservations();
  }, [activeTab, currentMonth, currentYear]);

  // Polling automático solo cuando el tab "Reservas del Día" está activo
  useEffect(() => {
    if (activeTab !== 'daily' || !autoRefresh) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    // Arrancar inmediatamente y luego repetir cada INTERVAL_MS
    fetchAllReservations(true);
    intervalRef.current = setInterval(() => fetchAllReservations(true), INTERVAL_MS);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, autoRefresh]);

  // -- API CALLS --
  const fetchCatalog = async () => {
    try {
      const res = await apiFetch('/admin/classes/catalog');
      setCatalog(await res.json());
    } catch (e) {
      addToast("Error al cargar el catálogo base.", "error");
    } finally {
      if(activeTab === 'catalog') setInitialLoading(false);
    }
  };

  const fetchSessions = async (m: number, y: number) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/calendar/sessions?month=${m}&year=${y}`);
      setSessions(await res.json());
    } catch (e) {
      addToast("Error al sincronizar el calendario.", "error");
    } finally {
      setLoading(false);
      if(activeTab === 'calendar') setInitialLoading(false);
    }
  };

  const fetchAllReservations = async (silent = false) => {
    if (!silent) setLoading(true);
    setSpinning(true);
    try {
      const res = await apiFetch('/admin/reservations');
      const data = await res.json();
      setAllReservations(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (e) {
      if (!silent) addToast("Error al cargar reservaciones.", "error");
    } finally {
      if (!silent) setLoading(false);
      setInitialLoading(false);
      setSpinning(false);
    }
  };

  // -- HANDLERS: CATALOG --
  const handleSaveCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        const res = await apiFetch('/admin/classes/catalog', {
            method: 'POST',
            body: JSON.stringify(newClassTemplate)
        });
        if(res.ok) {
            addToast("Clase agregada al catálogo base.", "success");
            setShowCatalogModal(false);
            fetchCatalog();
            setNewClassTemplate({ name: '', description: '', color: '#4CAF50', default_capacity: 15, default_duration_minutes: 60 });
        } else {
            addToast("Hubo un error al guardar.", "error");
        }
    } catch(e) {
        addToast("Error de conexión.", "error");
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteCatalog = async (id: number) => {
    setConfirmModal({ isOpen: true, type: 'catalog', id, text: "Esto cancelará permanentemente las sesiones vinculadas." });
  };

  // -- HANDLERS: SESSIONS --
  const handleGenerateMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        const payload = { ...genParams, month: genParams.target_month, year: genParams.target_year };
        const res = await apiFetch('/admin/calendar/generate', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(res.ok) {
            addToast(data.message || "Mes generado con éxito.", "success");
            setShowGenerateModal(false);
            fetchSessions(currentMonth, currentYear);
        } else {
            addToast("Error: " + data.message, "error");
        }
    } catch(e){
        addToast("Error iterando las fechas.", "error");
    } finally {
        setLoading(false);
    }
  };

  const handleCreateSingleSession = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          const res = await apiFetch('/admin/calendar/sessions', {
              method: 'POST',
              body: JSON.stringify(singleSession)
          });
          if(res.ok) {
              addToast("Sesión individual programada.", "success");
              setShowSingleSessionModal(false);
              fetchSessions(currentMonth, currentYear);
          } else {
              addToast("No se pudo agendar la sesión.", "error");
          }
      } catch(e){
          addToast("Fallo de red.", "error");
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteSession = async (id: number) => {
      setConfirmModal({ isOpen: true, type: 'session', id, text: "Se cancelarán las reservaciones atadas a ella. Los tokens no se reembolsan automáticamente en admin." });
  };

  const openEditSession = (ss: any) => {
    setEditingSession(ss);
    setEditSessionForm({
      instructor: ss.instructor || '',
      start_time: (ss.start_time || '08:00').substring(0, 5),
      end_time:   (ss.end_time   || '09:00').substring(0, 5),
      capacity:   ss.capacity   || 15,
      date:       (ss.date || '').split('T')[0],
    });
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/calendar/sessions/${editingSession.id}`, {
        method: 'PUT',
        body: JSON.stringify(editSessionForm),
      });
      if (res.ok) {
        addToast('Sesión actualizada.', 'success');
        setEditingSession(null);
        fetchSessions(currentMonth, currentYear);
      } else {
        addToast('Error al actualizar la sesión.', 'error');
      }
    } catch {
      addToast('Error de conexión.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClearMonth = () => {
      setConfirmModal({ isOpen: true, type: 'month', id: null, text: `¿Completamente seguro de borrar TODO el mes de ${monthNames[currentMonth-1]} ${currentYear}?` });
  };

  const processConfirmExecution = async () => {
    setLoading(true);
    const { type, id } = confirmModal;

    try {
        if (type === 'catalog' && id !== null) {
            const res = await apiFetch(`/admin/classes/catalog/${id}`, { method: 'DELETE' });
            if(res.ok) { addToast("Catálogo eliminado.", "success"); fetchCatalog(); }
        } else if (type === 'session' && id !== null) {
            const res = await apiFetch(`/admin/calendar/sessions/${id}`, { method: 'DELETE' });
            if(res.ok) { addToast("Sesión fulminada.", "success"); fetchSessions(currentMonth, currentYear); }
        } else if (type === 'month') {
            const res = await apiFetch(`/admin/calendar/month?month=${currentMonth}&year=${currentYear}`, { method: 'DELETE' });
            if(res.ok) { addToast("Mes reseteado por completo.", "success"); fetchSessions(currentMonth, currentYear); }
        }
    } catch (e) {
        addToast("La operación de borrado falló.", "error");
    } finally {
        setLoading(false);
        setConfirmModal({ isOpen: false, type: '', id: null, text: '' });
    }
  };

  // -- RENDER HELPERS --
  const toggleDayOfWeek = (d: number) => {
      if (genParams.days_of_week.includes(d)) {
          setGenParams({...genParams, days_of_week: genParams.days_of_week.filter(day => day !== d)});
      } else {
          setGenParams({...genParams, days_of_week: [...genParams.days_of_week, d]});
      }
  };

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // FECHAS NAVEGACION
  const navigatePrev = () => {
   const d = new Date(currentDate);
   if(calendarView === 'month') d.setMonth(d.getMonth() - 1);
   else if(calendarView === 'week') d.setDate(d.getDate() - 7);
   else if(calendarView === 'day') d.setDate(d.getDate() - 1);
   setCurrentDate(d);
  };
  const navigateNext = () => {
   const d = new Date(currentDate);
   if(calendarView === 'month') d.setMonth(d.getMonth() + 1);
   else if(calendarView === 'week') d.setDate(d.getDate() + 7);
   else if(calendarView === 'day') d.setDate(d.getDate() + 1);
   setCurrentDate(d);
  };

  // CALENDARIO MENSAL
  const getDaysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => {
      const day = new Date(year, month - 1, 1).getDay();
      return day === 0 ? 6 : day - 1; // Lunes = 0
  };
  const calendarDays = Array.from({length: getFirstDayOfMonth(currentMonth, currentYear)}, () => null)
         .concat(Array.from({length: getDaysInMonth(currentMonth, currentYear)}, (_, i) => (i + 1) as any));

  // CALENDARIO SEMANAL
  const getWeekDates = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
      const start = new Date(date.setDate(diff));
      return Array.from({length: 7}).map((_, i) => {
          const d2 = new Date(start);
          d2.setDate(d2.getDate() + i);
          return d2;
      });
  };
  const weekDates = getWeekDates(currentDate);

  // Formato Local para agrupar
  const getLocalIso = (d: Date) => {
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  }


  // Agrupar reservas: opcionalmente filtrar por fecha seleccionada
  const visibleReservations = filterDate
    ? allReservations.filter(r => {
        const d = (r.class_session || r.classSession)?.date;
        return d && d.split('T')[0] === filterDate;
      })
    : allReservations;

  // Agrupar por session_id
  const groupedBySession: Record<number, { session: any; date: string; attendees: any[] }> = {};
  visibleReservations.forEach(res => {
    const session = res.class_session || res.classSession;
    if (!session) return;
    const sid = session.id;
    if (!groupedBySession[sid]) groupedBySession[sid] = { session, date: (session.date || '').split('T')[0], attendees: [] };
    groupedBySession[sid].attendees.push(res.user);
  });
  // Ordenar grupos por fecha asc → hora asc
  const groupedList = Object.values(groupedBySession).sort((a, b) =>
    (a.date + (a.session.start_time || '')).localeCompare(b.date + (b.session.start_time || ''))
  );

  // Render Session Card mini
  const renderSessionPill = (ss: any) => (
      <div key={ss.id} onClick={() => openEditSession(ss)} style={{ position: 'relative', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '4px', border: '1px solid #333', borderLeft: `6px solid ${ss.gym_class?.color || '#333'}`, marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {getClassIcon(ss.gym_class?.name || '', ss.gym_class?.color || 'var(--secondary)', 14)}
            <div style={{ fontWeight: 'bold', fontSize: '0.85rem', paddingRight: '44px' }}>{ss.gym_class?.name || 'Clase Borrada'}</div>
          </div>
          <div style={{ color: 'var(--secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}><Clock size={12} style={{marginRight: '4px'}}/> {ss.start_time.substring(0,5)} - {ss.end_time.substring(0,5)}</div>
          <div style={{ color: 'var(--secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}><Users size={12} style={{marginRight: '4px'}}/> {ss.instructor}</div>
          <div style={{ position:'absolute', top:'6px', right:'6px', display: 'flex', gap: '2px' }}>
            <button style={{ background: 'transparent', border:'none', color:'var(--secondary)', cursor:'pointer', padding: '2px' }} onClick={e => { e.stopPropagation(); openEditSession(ss); }} title="Editar clase">
                <Edit2 size={13}/>
            </button>
            <button style={{ background: 'transparent', border:'none', color:'#ff4444', cursor:'pointer', padding: '2px' }} onClick={e => { e.stopPropagation(); handleDeleteSession(ss.id); }} title="Eliminar clase">
                <Trash size={13}/>
            </button>
          </div>
      </div>
  );

  return (
    <div>
      <header className="d-flex justify-content-between align-items-center mb-4" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="text-white mb-1" style={{ fontSize: '1.8rem' }}>Gestión de Clases</h1>
          <p className="text-muted">Administra el catálogo, programa turnos y monitorea check-ins.</p>
        </div>
      </header>

      {/* Tabs PWA-Style */}
      <div className="d-flex gap-3 mb-4 border-bottom border-dark pb-3">
         <button onClick={() => setActiveTab('calendar')} className={`btn ${activeTab === 'calendar' ? '' : 'btn-secondary'} rounded-pill fw-bold`}>
           <Calendar size={18} className="me-2 d-inline-block align-middle" style={{ marginTop: '-3px' }}/> Calendario
         </button>
         <button onClick={() => setActiveTab('daily')} className={`btn ${activeTab === 'daily' ? '' : 'btn-secondary'} rounded-pill fw-bold`}>
           <List size={18} className="me-2 d-inline-block align-middle" style={{ marginTop: '-3px' }}/> Reservas del Día
         </button>
         <button onClick={() => setActiveTab('catalog')} className={`btn ${activeTab === 'catalog' ? '' : 'btn-secondary'} rounded-pill fw-bold`}>
           <BookOpen size={18} className="me-2 d-inline-block align-middle" style={{ marginTop: '-3px' }}/> Catálogo Base
         </button>
      </div>

      {/* TAB: CALENDARIO */}
      {activeTab === 'calendar' && (
          <div>
            <div className="card d-flex justify-content-between align-items-center mb-4 flex-wrap" style={{ gap: '15px' }}>
                <div className="d-flex align-items-center gap-2">
                    <button className="btn-secondary" onClick={navigatePrev}><ChevronLeft size={20}/></button>
                    <h2 className="text-white text-center m-0" style={{ fontSize: '1.2rem', minWidth: '220px' }}>
                       {calendarView === 'month' && `${monthNames[currentMonth-1]} ${currentYear}`}
                       {calendarView === 'week' && `Semana ${weekDates[0].getDate()} ${monthNames[weekDates[0].getMonth()].substring(0,3)} - ${weekDates[6].getDate()} ${monthNames[weekDates[6].getMonth()].substring(0,3)}`}
                       {calendarView === 'day' && `${currentDate.getDate()} ${monthNames[currentMonth-1]} ${currentYear}`}
                    </h2>
                    <button className="btn-secondary" onClick={navigateNext}><ChevronRight size={20}/></button>
                    <button className="btn-secondary px-3 ms-2" onClick={() => setCurrentDate(new Date())} style={{fontSize:'0.85rem'}}>Hoy</button>
                </div>
                
                {/* Switcher de Vistas */}
                <div className="d-flex gap-1 bg-dark p-1 rounded border border-dark">
                   <button onClick={()=>setCalendarView('month')} className={`btn ${calendarView==='month'?'':'btn-secondary'} m-0`} style={{padding:'6px 12px', fontSize:'0.85rem'}}>Mes</button>
                   <button onClick={()=>setCalendarView('week')} className={`btn ${calendarView==='week'?'':'btn-secondary'} m-0`} style={{padding:'6px 12px', fontSize:'0.85rem'}}>Semana</button>
                   <button onClick={()=>setCalendarView('day')} className={`btn ${calendarView==='day'?'':'btn-secondary'} m-0`} style={{padding:'6px 12px', fontSize:'0.85rem'}}>Día</button>
                </div>

                <div className="d-flex gap-2">
                    <button className="btn btn-secondary border-danger text-danger px-3" onClick={handleClearMonth} title="Vaciar todo el mes mostrado"><Trash size={18}/></button>
                    <button className="btn btn-secondary px-3" onClick={() => setShowGenerateModal(true)}><Settings size={18} className="me-2"/> Generar Serie</button>
                    <button className="btn px-3" onClick={() => setShowSingleSessionModal(true)}><Plus size={18} className="me-2"/> Turno Único</button>
                </div>
            </div>

             {loading && sessions.length === 0 ? (
                <div className="d-flex justify-content-center align-items-center my-5 py-5">
                    <Spinner size="40px" />
                </div>
             ) : (
                <div style={{ border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', background: '#0a0a0a' }}>
                    
                    {/* VISTA MES */}
                    {calendarView === 'month' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#111', borderBottom: '1px solid #333' }}>
                                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                                    <div key={d} style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--secondary)', borderRight: '1px solid #333' }}>{d}</div>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                                {calendarDays.map((dayNum, i) => {
                                    if (!dayNum) return <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRight: '1px solid #333', borderBottom: '1px solid #333', minHeight: '120px' }}></div>;
                                    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                    const daySessions = sessions.filter(s => s.date.split('T')[0] === dateStr).sort((a,b) => a.start_time.localeCompare(b.start_time));
                                    return (
                                        <div key={i} style={{ padding: '6px', borderRight: '1px solid #333', borderBottom: '1px solid #333', minHeight: '120px', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ textAlign: 'right', fontWeight: 'bold', marginBottom: '8px', color: 'var(--secondary)' }}>{dayNum as number}</div>
                                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                                {daySessions.map(ss => renderSessionPill(ss))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* VISTA SEMANA */}
                    {calendarView === 'week' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: '600px' }}>
                            {weekDates.map((d, index) => {
                                const dStr = getLocalIso(d);
                                const daySessions = sessions.filter(s => s.date.split('T')[0] === dStr).sort((a,b) => a.start_time.localeCompare(b.start_time));
                                const isToday = d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth();
                                return (
                                    <div key={index} style={{ borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '15px 10px', textAlign: 'center', background: isToday ? 'rgba(0,102,255,0.1)' : '#111', borderBottom: '1px solid #333' }}>
                                            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--secondary)' }}>{dayNamesShort[d.getDay()]}</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isToday ? '#fff' : 'inherit' }}>{d.getDate()}</div>
                                        </div>
                                        <div style={{ padding: '10px', flex: 1, background: 'var(--background)' }}>
                                            {daySessions.map(ss => renderSessionPill(ss))}
                                            {daySessions.length === 0 && <p style={{textAlign:'center', color:'var(--secondary)', fontSize:'0.8rem', marginTop:'20px'}}>Sin clases</p>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* VISTA DIA */}
                    {calendarView === 'day' && (
                        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '600px' }}>
                            <div style={{ padding: '20px', textAlign: 'center', background: 'rgba(0,102,255,0.1)', borderBottom: '1px solid #333' }}>
                                <div style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--secondary)' }}>{currentDate.toLocaleDateString('es-ES', {weekday: 'long'})}</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{currentDate.getDate()} {monthNames[currentMonth-1]}</div>
                            </div>
                            <div style={{ padding: '20px', flex: 1, background: 'var(--background)' }}>
                                {(() => {
                                    const dStr = getLocalIso(currentDate);
                                    const daySessions = sessions.filter(s => s.date.split('T')[0] === dStr).sort((a,b) => a.start_time.localeCompare(b.start_time));
                                    if(daySessions.length === 0) return <p style={{textAlign:'center', color:'var(--secondary)', gridColumn:'1/-1', marginTop:'40px', fontSize: '1.1rem'}}>Sin clases programadas para este día.</p>;
                                    return (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px', alignContent: 'start' }}>
                                            {daySessions.map(ss => renderSessionPill(ss))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}
          </div>
      )}

      {/* TAB: RESERVAS DE HOY (Daily Roster) */}
      {activeTab === 'daily' && (
        <div>
          {/* Barra de filtro y totales */}
          <div className="card mb-4" style={{ padding: '14px 20px' }}>
            {/* Fila superior: conteo + controles de refresco */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <BookOpen size={18} color="var(--primary)" />
                <span className="text-white" style={{ fontWeight: 600 }}>
                  {allReservations.length} reserva{allReservations.length !== 1 ? 's' : ''} en total
                </span>
                {filterDate && (
                  <span style={{ fontSize: '0.82rem', color: 'var(--secondary)' }}>
                    · {visibleReservations.length} para el {new Date(filterDate + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>

              {/* Última actualización */}
              {lastUpdated && (
                <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', whiteSpace: 'nowrap' }}>
                  Actualizado: {lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}

              {/* Botón manual refresh */}
              <button
                className="btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => fetchAllReservations(false)}
                title="Actualizar ahora"
              >
                <RefreshCw size={14} style={{ animation: spinning ? 'spin 0.8s linear infinite' : 'none' }} />
                Actualizar
              </button>

              {/* Toggle auto-refresh */}
              <button
                className={`btn-secondary`}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                  border: autoRefresh ? '1px solid #00cc66' : '1px solid #555',
                  color: autoRefresh ? '#00cc66' : 'var(--secondary)',
                  display: 'flex', alignItems: 'center', gap: '5px'
                }}
                onClick={() => setAutoRefresh(prev => !prev)}
                title={autoRefresh ? 'Desactivar auto-refresco' : 'Activar auto-refresco'}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: autoRefresh ? '#00cc66' : '#555', display: 'inline-block', boxShadow: autoRefresh ? '0 0 6px #00cc66' : 'none' }} />
                {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
              </button>
            </div>

            {/* Fila inferior: filtro de fecha */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--secondary)', whiteSpace: 'nowrap' }}>Filtrar por día:</label>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                style={{ background: 'var(--background)', color: 'var(--text)', border: '1px solid #333', borderRadius: '6px', padding: '5px 8px', fontSize: '0.85rem' }}
              />
              {filterDate && (
                <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap' }} onClick={() => setFilterDate('')}>
                  Ver todas
                </button>
              )}
            </div>
          </div>

          {initialLoading || loading ? (
            <div className="d-flex justify-content-center align-items-center my-5 py-5"><Spinner size="40px" /></div>
          ) : groupedList.length === 0 ? (
            <div className="card text-center text-muted py-5">
              <List size={48} className="mx-auto mb-3 opacity-50" />
              <p className="m-0 fs-5">
                {allReservations.length === 0
                  ? 'Aún no hay reservas registradas en el sistema.'
                  : `No hay reservas para el ${new Date(filterDate + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.`}
              </p>
              {filterDate && allReservations.length > 0 && (
                <button className="btn mt-3" style={{ display: 'inline-flex', margin: '12px auto 0' }} onClick={() => setFilterDate('')}>Ver todas las reservas</button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Agrupar por fecha para mostrar separadores */}
              {(() => {
                const byDate: Record<string, typeof groupedList> = {};
                groupedList.forEach(g => {
                  if (!byDate[g.date]) byDate[g.date] = [];
                  byDate[g.date].push(g);
                });
                return Object.entries(byDate).map(([date, groups]) => (
                  <div key={date}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ height: '1px', flex: 1, background: '#333' }} />
                      <span style={{ background: 'var(--primary)', color: '#fff', padding: '3px 12px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                        {new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      <div style={{ height: '1px', flex: 1, background: '#333' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                      {groups.map((group, idx) => {
                        const isFull = group.attendees.length >= group.session?.capacity;
                        const accentColor = group.session?.gym_class?.color || 'var(--primary)';
                        return (
                          <div
                            key={idx}
                            className="card"
                            onClick={() => setAttendeesModal({ open: true, session: group.session, attendees: group.attendees })}
                            style={{ borderTop: `4px solid ${accentColor}`, padding: '16px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {group.session?.gym_class?.name || 'Clase'}
                                </h3>
                                <div style={{ color: 'var(--secondary)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Clock size={12} /> {group.session?.start_time?.substring(0,5)} – {group.session?.end_time?.substring(0,5)}
                                </div>
                                <div style={{ color: 'var(--secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
                                  {group.session?.instructor}
                                </div>
                              </div>
                              <div style={{ textAlign: 'center', marginLeft: '12px', flexShrink: 0 }}>
                                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: isFull ? 'rgba(255,68,68,0.15)' : 'rgba(0,102,255,0.12)', border: `2px solid ${isFull ? '#ff4444' : accentColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: isFull ? '#ff4444' : accentColor, lineHeight: 1 }}>{group.attendees.length}</span>
                                  <span style={{ fontSize: '0.6rem', color: 'var(--secondary)', lineHeight: 1 }}>/ {group.session?.capacity}</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--secondary)', fontSize: '0.78rem' }}>
                              <Users size={12} />
                              <span>Ver lista de asistentes</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* MODAL: LISTA DE ASISTENTES */}
      {attendeesModal.open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}
          onClick={() => setAttendeesModal({ open: false, session: null, attendees: [] })}
        >
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '28px', position: 'relative', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setAttendeesModal({ open: false, session: null, attendees: [] })} style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>

            {/* Header */}
            <div style={{ borderLeft: `4px solid ${attendeesModal.session?.gym_class?.color || 'var(--primary)'}`, paddingLeft: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {getClassIcon(attendeesModal.session?.gym_class?.name || '', attendeesModal.session?.gym_class?.color || 'var(--primary)', 20)}
                <h2 style={{ fontSize: '1.15rem', color: 'var(--text)', margin: 0 }}>
                  {attendeesModal.session?.gym_class?.name || 'Clase'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--secondary)', fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} /> {attendeesModal.session?.start_time?.substring(0,5)} – {attendeesModal.session?.end_time?.substring(0,5)}
                </span>
                <span style={{ color: 'var(--secondary)', fontSize: '0.83rem' }}>
                  Instructor: <strong style={{ color: 'var(--text)' }}>{attendeesModal.session?.instructor}</strong>
                </span>
                <span style={{ color: attendeesModal.attendees.length >= attendeesModal.session?.capacity ? '#ff4444' : '#00cc66', fontSize: '0.83rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={13} /> {attendeesModal.attendees.length} / {attendeesModal.session?.capacity} cupos
                </span>
              </div>
            </div>

            {/* Lista */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {attendeesModal.attendees.length === 0 ? (
                <p style={{ color: 'var(--secondary)', textAlign: 'center', padding: '20px 0' }}>Sin inscritos aún.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attendeesModal.attendees.map((u: any, i: number) => (
                    <li key={i} style={{ background: 'var(--background)', padding: '10px 14px', borderRadius: '8px', border: '1px solid #222', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                        {(u?.name || 'S').charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: '0.92rem' }}>{u?.name || 'Socio'}</div>
                        {u?.username && <div style={{ color: '#555', fontSize: '0.78rem' }}>@{u.username}</div>}
                      </div>
                      <span style={{ marginLeft: 'auto', background: 'rgba(0,204,102,0.12)', color: '#00cc66', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>Confirmado</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: CATALOGO */}
      {activeTab === 'catalog' && (
          <div>
            <div className="card d-flex justify-content-between align-items-center mb-4 flex-wrap" style={{ gap: '15px' }}>
                <div>
                  <h2 className="text-white mb-1" style={{ fontSize: '1.2rem' }}>Tipos de Clases Base</h2>
                  <p className="text-muted m-0" style={{ fontSize: '0.9rem' }}>Plantillas para generar el calendario rápidamente.</p>
                </div>
                <button className="btn" onClick={() => setShowCatalogModal(true)}><Plus size={18} className="me-2"/> Nuevo Tipo</button>
            </div>
            
            {initialLoading ? (
               <div className="d-flex justify-content-center align-items-center my-5 py-5"><Spinner size="40px" /></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                  {catalog.map(c => (
                      <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: c.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {getClassIcon(c.name, '#fff', 20)}
                          </div>
                          <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <h3 style={{ fontSize: '1.1rem', marginBottom: '5px' }}>{c.name}</h3>
                                  <button style={{ background: 'transparent', border:'none', color:'#ff4444', cursor:'pointer', padding: '5px' }} onClick={() => handleDeleteCatalog(c.id)}>
                                      <Trash size={16}/>
                                  </button>
                              </div>
                              <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '5px' }}>{c.description}</p>
                              <p style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 'bold' }}>{c.default_duration_minutes} min | Cupo Defecto: {c.default_capacity}</p>
                          </div>
                      </div>
                  ))}
                  {catalog.length === 0 && <p style={{ color: 'var(--secondary)', padding: '20px' }}>El catálogo está vacío. Crea tu primer tipo de clase.</p>}
              </div>
            )}
          </div>
      )}

      {/* MODAL: NUEVO CATALOGO */}
      {showCatalogModal && (
          <div className="modal-overlay">
             <div className="card" style={{ width: '100%', maxWidth: '450px' }}>
                 <h2 className="mb-4 text-white" style={{ fontSize: '1.3rem' }}>Nuevo Tipo de Clase</h2>
                 <form onSubmit={handleSaveCatalog} className="d-flex flex-column gap-3" style={{ flexDirection: 'column' }}>
                     <input required type="text" className="form-control" placeholder="Nombre (ej. Spinning)" value={newClassTemplate.name} onChange={e => setNewClassTemplate({...newClassTemplate, name: e.target.value})} />
                     <textarea className="form-control" placeholder="Descripción detallada (opcional)" value={newClassTemplate.description} onChange={e => setNewClassTemplate({...newClassTemplate, description: e.target.value})} style={{ resize: 'vertical' }}/>
                     
                     <div className="d-flex gap-3">
                       <div className="flex-grow-1">
                         <label className="form-label">Cupo Defecto</label>
                         <input required type="number" className="form-control" placeholder="Cupo por defecto" value={newClassTemplate.default_capacity} onChange={e => setNewClassTemplate({...newClassTemplate, default_capacity: parseInt(e.target.value)})} />
                       </div>
                       <div className="flex-grow-1">
                         <label className="form-label">Duración (min)</label>
                         <input required type="number" className="form-control" placeholder="Duración" value={newClassTemplate.default_duration_minutes} onChange={e => setNewClassTemplate({...newClassTemplate, default_duration_minutes: parseInt(e.target.value)})} />
                       </div>
                     </div>
                     
                     <div className="d-flex align-items-center gap-3 bg-dark p-2 rounded border border-dark">
                         <label className="text-muted flex-grow-1 m-0 ps-2">Color Identificador:</label>
                         <input type="color" value={newClassTemplate.color} onChange={e => setNewClassTemplate({...newClassTemplate, color: e.target.value})} style={{ width: '40px', height: '40px', border: 'none', background:'none', cursor: 'pointer' }}/>
                     </div>
                     
                     <div className="d-flex gap-2 mt-2">
                        <button type="button" className="btn-secondary flex-grow-1" onClick={() => setShowCatalogModal(false)}>Cancelar</button>
                        <button type="submit" className="btn flex-grow-1" disabled={loading}>
                            {loading ? <Spinner size="18px" /> : 'Guardar Ficha'}
                        </button>
                     </div>
                 </form>
             </div>
          </div>
      )}

      {/* MODAL: GENERAR MES COMPLETO */}
      {showGenerateModal && (
          <div className="modal-overlay">
             <div className="card" style={{ width: '100%', maxWidth: '500px' }}>
                 <h2 className="mb-4 text-white d-flex align-items-center flex-wrap gap-2" style={{ fontSize: '1.3rem', fontWeight: 600 }}>
                     Generar mes :
                     <select value={genParams.target_month} onChange={e => setGenParams({...genParams, target_month: parseInt(e.target.value)})} style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff', fontSize: '1rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', outline: 'none' }}>
                        {monthNames.map((name, i) => <option key={i+1} value={i+1}>{name}</option>)}
                     </select>
                     <select value={genParams.target_year} onChange={e => setGenParams({...genParams, target_year: parseInt(e.target.value)})} style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff', fontSize: '1rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', outline: 'none' }}>
                        {[currentYear, currentYear+1].map(y => <option key={y} value={y}>{y}</option>)}
                     </select>
                 </h2>
                 <form onSubmit={handleGenerateMonth} className="d-flex flex-column gap-3" style={{ flexDirection: 'column' }}>
                     <div>
                         <label className="form-label mb-2" style={{color: '#888', fontSize: '0.9rem'}}>Plantilla de Clases (Catálogo)</label>
                         <select required value={genParams.gym_class_id} className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff', fontSize: '0.9rem', padding: '10px 12px', height: 'auto' }} onChange={e => {
                                 const cId = e.target.value;
                                 const template = catalog.find(c => c.id === parseInt(cId));
                                 if (template) {
                                     setGenParams({...genParams, gym_class_id: cId, capacity: template.default_capacity});
                                 } else {
                                     setGenParams({...genParams, gym_class_id: cId});
                                 }
                             }}>
                             <option value="" disabled>Seleccione una clase...</option>
                             {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                         <input required type="text" className="form-control mt-2" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff', fontSize: '0.9rem' }} placeholder="Nombre del entrenador a cargo" value={genParams.instructor} onChange={e => setGenParams({...genParams, instructor: e.target.value})} />
                     </div>
                     
                     <div>
                         <label className="form-label mb-2" style={{color: '#888', fontSize: '0.9rem'}}>Días que se impartira en la semana</label>
                         <div className="d-flex w-100" style={{ gap: '6px', flexWrap: 'wrap' }}>
                             {[{i:1, n:'Lun'},{i:2, n:'Mar'},{i:3, n:'Mié'},{i:4, n:'Jue'},{i:5, n:'Vie'},{i:6, n:'Sáb'},{i:0, n:'Dom'}].map(day => (
                                 <button type="button" key={day.i} onClick={() => toggleDayOfWeek(day.i)} 
                                     className="btn m-0 rounded-pill p-0" 
                                     style={{ 
                                         flex: '1 0 12%',
                                         minWidth: '40px',
                                         fontSize: '0.8rem', 
                                         height: '32px',
                                         border: '1px solid #0066ff', 
                                         color: '#fff',
                                         background: genParams.days_of_week.includes(day.i) ? '#0066ff' : 'transparent' 
                                     }}>
                                     {day.n}
                                 </button>
                             ))}
                         </div>
                     </div>
                     
                     <div className="d-flex" style={{ gap: '15px' }}>
                         <div style={{ flex: 1 }}>
                             <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Hora de inicio</label>
                             <input required type="time" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={genParams.start_time} onChange={e => setGenParams({...genParams, start_time: e.target.value})} />
                         </div>
                         <div style={{ flex: 1 }}>
                             <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Hora de Fin</label>
                             <input required type="time" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={genParams.end_time} onChange={e => setGenParams({...genParams, end_time: e.target.value})} />
                         </div>
                         <div style={{ flex: 1 }}>
                             <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Max. Asistentes</label>
                             <input required type="number" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={genParams.capacity} onChange={e => setGenParams({...genParams, capacity: parseInt(e.target.value)})} />
                         </div>
                     </div>
                     
                     <div className="d-flex mt-2" style={{ gap: '10px' }}>
                        <button type="button" className="btn flex-grow-1" style={{ background: 'transparent', border: '1px solid #444', color: '#fff' }} onClick={() => setShowGenerateModal(false)}>Cancelar</button>
                        <button type="submit" className="btn flex-grow-1" style={{ background: '#0066ff', border: 'none', color: '#fff' }} disabled={loading}>
                            {loading ? <Spinner size="18px" /> : 'Automatizar mes'}
                        </button>
                     </div>
                 </form>
             </div>
          </div>
      )}

      {/* MODAL: SESION UNICA */}
      {showSingleSessionModal && (
          <div className="modal-overlay">
             <div className="card" style={{ width: '100%', maxWidth: '500px' }}>
                 <h2 className="mb-4 text-white" style={{ fontSize: '1.3rem', fontWeight: 600 }}>Agregar Sesión Individual</h2>
                 <form onSubmit={handleCreateSingleSession} className="d-flex flex-column gap-3" style={{ flexDirection: 'column' }}>
                     <div>
                         <label className="form-label mb-2" style={{color: '#888', fontSize: '0.9rem'}}>Plantilla de Clase (Catálogo)</label>
                         <select required className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={singleSession.gym_class_id} onChange={e => {
                             const cId = e.target.value;
                             const template = catalog.find(c => c.id === parseInt(cId));
                             if (template) {
                                 setSingleSession({...singleSession, gym_class_id: cId, capacity: template.default_capacity});
                             } else {
                                 setSingleSession({...singleSession, gym_class_id: cId});
                             }
                         }}>
                             <option value="" disabled>Seleccione la clase del Catálogo...</option>
                             {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                         <input required type="text" className="form-control mt-2" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff', fontSize: '0.9rem' }} placeholder="Nombre del entrenador a cargo" value={singleSession.instructor} onChange={e => setSingleSession({...singleSession, instructor: e.target.value})} />
                     </div>
                     
                     <div className="d-flex" style={{ gap: '15px' }}>
                       <div style={{ flex: 1 }}>
                           <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Entrenador a cargo</label>
                           <input required type="text" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} placeholder="Nombre completo" value={singleSession.instructor} onChange={e => setSingleSession({...singleSession, instructor: e.target.value})} />
                       </div>
                       <div style={{ flex: 1 }}>
                           <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Fecha de Sesión</label>
                           <input required type="date" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={singleSession.date} onChange={e => setSingleSession({...singleSession, date: e.target.value})} />
                       </div>
                     </div>

                     <div className="d-flex" style={{ gap: '15px' }}>
                         <div style={{ flex: 1 }}>
                             <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Hora Apertura</label>
                             <input required type="time" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={singleSession.start_time} onChange={e => setSingleSession({...singleSession, start_time: e.target.value})}/>
                         </div>
                         <div style={{ flex: 1 }}>
                             <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Hora Clausura</label>
                             <input required type="time" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={singleSession.end_time} onChange={e => setSingleSession({...singleSession, end_time: e.target.value})} />
                         </div>
                         <div style={{ flex: 1 }}>
                             <label className="form-label mb-2" style={{color: '#888', fontSize: '0.85rem'}}>Capacidad Máxima</label>
                             <input required type="number" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }} value={singleSession.capacity} onChange={e => setSingleSession({...singleSession, capacity: parseInt(e.target.value)})} />
                         </div>
                     </div>
                     
                     <div className="d-flex mt-2" style={{ gap: '10px' }}>
                        <button type="button" className="btn flex-grow-1" style={{ background: 'transparent', border: '1px solid #444', color: '#fff' }} onClick={() => setShowSingleSessionModal(false)}>Cancelar</button>
                        <button type="submit" className="btn flex-grow-1" style={{ background: '#0066ff', border: 'none', color: '#fff' }} disabled={loading}>
                            {loading ? <Spinner size="18px" /> : 'Guardar Sesión Única'}
                        </button>
                     </div>
                 </form>
             </div>
          </div>
      )}

      {/* MODAL: EDITAR SESIÓN */}
      {editingSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ color: 'var(--text)', fontSize: '1.1rem', margin: 0 }}>Editar Sesión</h2>
                <p style={{ color: 'var(--secondary)', fontSize: '0.82rem', margin: '4px 0 0' }}>
                  {editingSession.gym_class?.name || 'Clase'} — {editSessionForm.date}
                </p>
              </div>
              <button onClick={() => setEditingSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--secondary)' }}>
                <X size={22} />
              </button>
            </div>
            <form onSubmit={handleUpdateSession} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label">Instructor</label>
                <input required type="text" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }}
                  value={editSessionForm.instructor}
                  onChange={e => setEditSessionForm({ ...editSessionForm, instructor: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Fecha</label>
                <input required type="date" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }}
                  value={editSessionForm.date}
                  onChange={e => setEditSessionForm({ ...editSessionForm, date: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Inicio</label>
                  <input required type="time" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }}
                    value={editSessionForm.start_time}
                    onChange={e => setEditSessionForm({ ...editSessionForm, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Fin</label>
                  <input required type="time" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }}
                    value={editSessionForm.end_time}
                    onChange={e => setEditSessionForm({ ...editSessionForm, end_time: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Capacidad</label>
                  <input required type="number" min="1" className="form-control" style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff' }}
                    value={editSessionForm.capacity}
                    onChange={e => setEditSessionForm({ ...editSessionForm, capacity: parseInt(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditingSession(null)}>Cancelar</button>
                <button type="submit" className="btn" style={{ flex: 1 }} disabled={loading}>
                  {loading ? <Spinner size="16px" /> : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GLOBAL CONFIRMACION */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.type === 'month' ? "Limpiar Mes" : confirmModal.type === 'catalog' ? 'Eliminar del Catálogo' : 'Eliminar Sesión'}
        message={confirmModal.text}
        confirmText={confirmModal.type === 'month' ? 'Si, Borrar Todo' : 'Eliminar'}
        onConfirm={processConfirmExecution}
        onCancel={() => setConfirmModal({ isOpen: false, type: '', id: null, text: '' })}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Reservations;
