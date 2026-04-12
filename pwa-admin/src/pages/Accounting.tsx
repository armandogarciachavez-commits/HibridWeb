import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Activity, Plus, Trash2, Edit2, Package, BookOpen, BarChart2, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch } from '../lib/api';
import ConfirmModal from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastContext';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

const UNITS = ['pieza', 'kg', 'litro', 'dosis', 'paquete', 'caja', 'otro'];

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Concept  { id: number; name: string; type: 'ingreso' | 'egreso'; description?: string; is_active: boolean; }
interface Product  { id: number; name: string; description?: string; price: number; stock: number; unit: string; is_active: boolean; }
interface Entry    { id: number; type: 'ingreso' | 'egreso'; concept: Concept; amount: number; entry_type: 'manual' | 'product_sale'; product?: Product; product_qty?: number; notes?: string; entry_date: string; created_at: string; }
interface DayData  { entries: Entry[]; total_ingresos: number; total_egresos: number; balance: number; date: string; }
interface Report   { period: string; from: string; to: string; total_ingresos: number; total_egresos: number; balance: number; by_concept: { concept: string; type: string; total: number; count: number }[]; entries: Entry[]; }

// ── Tarjeta resumen ───────────────────────────────────────────────────────────
const SummaryCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => (
  <div style={{ background: 'var(--surface)', border: `1px solid ${color}33`, borderRadius: '12px', padding: '20px 24px', flex: 1, minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <span style={{ color: 'var(--secondary)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</span>
      <span style={{ color }}>{icon}</span>
    </div>
    <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color }}>{fmt(value)}</p>
  </div>
);

// ── Barra SVG para reportes ───────────────────────────────────────────────────
const BarChart = ({ items }: { items: { label: string; ingreso: number; egreso: number }[] }) => {
  if (!items.length) return null;
  const max = Math.max(...items.flatMap(i => [i.ingreso, i.egreso]), 1);
  const H = 120, barW = 20, gap = 8, groupW = barW * 2 + gap + 16;
  const W = items.length * groupW + 40;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 40}`} style={{ display: 'block' }}>
      {items.map((item, i) => {
        const x = 20 + i * groupW;
        const hI = (item.ingreso / max) * H;
        const hE = (item.egreso / max) * H;
        return (
          <g key={i}>
            <rect x={x} y={H - hI} width={barW} height={hI} fill="#00cc6699" rx={3} />
            <rect x={x + barW + gap} y={H - hE} width={barW} height={hE} fill="#ff444499" rx={3} />
            <text x={x + barW} y={H + 16} textAnchor="middle" fill="#666" fontSize="9" fontFamily="sans-serif">
              {item.label.length > 8 ? item.label.substring(0, 8) + '…' : item.label}
            </text>
          </g>
        );
      })}
      <line x1={20} y1={0} x2={20} y2={H} stroke="#333" strokeWidth={1} />
      <line x1={20} y1={H} x2={W - 20} y2={H} stroke="#333" strokeWidth={1} />
      <circle cx={W - 50} cy={H + 32} r={5} fill="#00cc6699" />
      <text x={W - 42} y={H + 36} fill="#aaa" fontSize="9" fontFamily="sans-serif">Ingreso</text>
      <circle cx={W - 10} cy={H + 32} r={5} fill="#ff444499" />
      <text x={W - 2} y={H + 36} fill="#aaa" fontSize="9" fontFamily="sans-serif" textAnchor="end">Egreso</text>
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function Accounting() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<'hoy' | 'inventario' | 'reportes' | 'conceptos'>('hoy');

  // ── Estado Hoy ──
  const [dayData, setDayData]           = useState<DayData | null>(null);
  const [loadingDay, setLoadingDay]     = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [deleteEntry, setDeleteEntry]   = useState<Entry | null>(null);

  // ── Estado Inventario ──
  const [products, setProducts]           = useState<Product[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editProduct, setEditProduct]     = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [showStockModal, setShowStockModal] = useState<Product | null>(null);

  // ── Estado Reportes ──
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [reportDate, setReportDate]     = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport]             = useState<Report | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showReportEntries, setShowReportEntries] = useState(false);

  // ── Estado Conceptos ──
  const [concepts, setConcepts]           = useState<Concept[]>([]);
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [editConcept, setEditConcept]     = useState<Concept | null>(null);
  const [deleteConcept, setDeleteConcept] = useState<Concept | null>(null);

  // ── Form de nueva entrada ──
  const emptyEntry = { type: 'ingreso' as const, concept_id: '', entry_type: 'manual' as const, amount: '', product_id: '', product_qty: '1', notes: '', entry_date: new Date().toISOString().split('T')[0] };
  const [entryForm, setEntryForm] = useState(emptyEntry);

  // ── Form producto ──
  const emptyProduct = { name: '', description: '', price: '', stock: '0', unit: 'pieza' };
  const [productForm, setProductForm] = useState(emptyProduct);

  // ── Form concepto ──
  const emptyConcept = { name: '', type: 'ingreso' as const, description: '' };
  const [conceptForm, setConceptForm] = useState(emptyConcept);

  // ── Form ajuste de stock ──
  const [stockAdj, setStockAdj] = useState('');

  // ─────────────────────────────────────────────────────────────────────────────
  const fetchDay = useCallback(async () => {
    setLoadingDay(true);
    try {
      const res = await apiFetch('/admin/accounting/today');
      if (res.ok) setDayData(await res.json());
    } finally { setLoadingDay(false); }
  }, []);

  const fetchProducts = useCallback(async () => {
    const res = await apiFetch('/admin/products');
    if (res.ok) setProducts(await res.json());
  }, []);

  const fetchConcepts = useCallback(async () => {
    const res = await apiFetch('/admin/accounting/concepts');
    if (res.ok) setConcepts(await res.json());
  }, []);

  useEffect(() => { fetchDay(); fetchProducts(); fetchConcepts(); }, []);

  // ── Producto seleccionado en el form de entrada ──
  const selectedProduct = products.find(p => String(p.id) === entryForm.product_id);
  const computedAmount  = selectedProduct && entryForm.entry_type === 'product_sale'
    ? (selectedProduct.price * Number(entryForm.product_qty)).toFixed(2)
    : entryForm.amount;

  // ── Conceptos filtrados por tipo ──
  const filteredConcepts = concepts.filter(c => c.type === entryForm.type && c.is_active);

  // ─────────────────────────────────────────────────────────────────────────────
  // CRUD Entradas
  const handleSaveEntry = async () => {
    const body: any = {
      type:       entryForm.type,
      concept_id: Number(entryForm.concept_id),
      entry_type: entryForm.entry_type,
      notes:      entryForm.notes || null,
      entry_date: entryForm.entry_date,
    };
    if (entryForm.entry_type === 'product_sale') {
      body.product_id  = Number(entryForm.product_id);
      body.product_qty = Number(entryForm.product_qty);
    } else {
      body.amount = Number(entryForm.amount);
    }
    const res = await apiFetch('/admin/accounting/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      addToast('Movimiento registrado.', 'success');
      setShowEntryModal(false);
      setEntryForm(emptyEntry);
      fetchDay();
      fetchProducts();
    } else {
      const err = await res.json();
      addToast(err.message || 'Error al guardar.', 'error');
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntry) return;
    const res = await apiFetch(`/admin/accounting/entries/${deleteEntry.id}`, { method: 'DELETE' });
    if (res.ok) {
      addToast('Movimiento eliminado.', 'success');
      setDeleteEntry(null);
      fetchDay();
      fetchProducts();
    }
  };

  // CRUD Productos
  const handleSaveProduct = async () => {
    const isEdit = !!editProduct;
    const url    = isEdit ? `/admin/products/${editProduct!.id}` : '/admin/products';
    const method = isEdit ? 'PUT' : 'POST';
    const body   = { name: productForm.name, description: productForm.description || null, price: Number(productForm.price), stock: Number(productForm.stock), unit: productForm.unit };
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      addToast(isEdit ? 'Producto actualizado.' : 'Producto creado.', 'success');
      setShowProductModal(false);
      setEditProduct(null);
      setProductForm(emptyProduct);
      fetchProducts();
    } else {
      const err = await res.json();
      addToast(err.message || 'Error al guardar.', 'error');
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteProduct) return;
    const res = await apiFetch(`/admin/products/${deleteProduct.id}`, { method: 'DELETE' });
    if (res.ok) { addToast('Producto desactivado.', 'success'); setDeleteProduct(null); fetchProducts(); }
  };

  const handleAdjustStock = async () => {
    if (!showStockModal) return;
    const res = await apiFetch(`/admin/products/${showStockModal.id}/stock`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adjustment: Number(stockAdj) }) });
    if (res.ok) {
      addToast('Stock ajustado.', 'success');
      setShowStockModal(null);
      setStockAdj('');
      fetchProducts();
    } else {
      const err = await res.json();
      addToast(err.message || 'Error al ajustar stock.', 'error');
    }
  };

  // CRUD Conceptos
  const handleSaveConcept = async () => {
    const isEdit = !!editConcept;
    const url    = isEdit ? `/admin/accounting/concepts/${editConcept!.id}` : '/admin/accounting/concepts';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conceptForm) });
    if (res.ok) {
      addToast(isEdit ? 'Concepto actualizado.' : 'Concepto creado.', 'success');
      setShowConceptModal(false);
      setEditConcept(null);
      setConceptForm(emptyConcept);
      fetchConcepts();
    } else {
      const err = await res.json();
      addToast(err.message || 'Error al guardar.', 'error');
    }
  };

  const handleDeleteConcept = async () => {
    if (!deleteConcept) return;
    const res = await apiFetch(`/admin/accounting/concepts/${deleteConcept.id}`, { method: 'DELETE' });
    if (res.ok) {
      addToast('Concepto eliminado.', 'success');
      setDeleteConcept(null);
      fetchConcepts();
    } else {
      const err = await res.json();
      addToast(err.message || 'Error.', 'error');
    }
  };

  const handleToggleConcept = async (c: Concept) => {
    await apiFetch(`/admin/accounting/concepts/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !c.is_active }) });
    fetchConcepts();
  };

  // Reporte
  const handleReport = async () => {
    setLoadingReport(true);
    try {
      const res = await apiFetch(`/admin/accounting/report?period=${reportPeriod}&date=${reportDate}`);
      if (res.ok) setReport(await res.json());
    } finally { setLoadingReport(false); }
  };

  useEffect(() => { if (tab === 'reportes' && !report) handleReport(); }, [tab]);

  // ─────────────────────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean) => ({
    padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#000' : 'var(--secondary)',
    border: 'none', display: 'flex', alignItems: 'center', gap: '6px',
  } as React.CSSProperties);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px', background: 'var(--background)', color: 'var(--text)',
    border: '1px solid #333', borderRadius: '6px', boxSizing: 'border-box', fontSize: '0.9rem',
  };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', color: 'var(--secondary)', fontSize: '0.82rem' };
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0' };

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      {/* Título */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Contabilidad</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--secondary)', fontSize: '0.88rem' }}>Ingresos, egresos, inventario y reportes</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface)', padding: '6px', borderRadius: '10px', width: 'fit-content' }}>
        <button style={tabStyle(tab === 'hoy')}        onClick={() => setTab('hoy')}><Activity size={15} />Hoy</button>
        <button style={tabStyle(tab === 'inventario')} onClick={() => setTab('inventario')}><Package size={15} />Inventario</button>
        <button style={tabStyle(tab === 'reportes')}   onClick={() => setTab('reportes')}><BarChart2 size={15} />Reportes</button>
        <button style={tabStyle(tab === 'conceptos')}  onClick={() => setTab('conceptos')}><Tag size={15} />Conceptos</button>
      </div>

      {/* ── TAB HOY ─────────────────────────────────────────────────────────── */}
      {tab === 'hoy' && (
        <div>
          {loadingDay ? <p style={{ color: 'var(--secondary)' }}>Cargando...</p> : dayData && (
            <>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <SummaryCard label="Ingresos del día"  value={dayData.total_ingresos} icon={<TrendingUp size={18} />}  color="#00cc66" />
                <SummaryCard label="Egresos del día"   value={dayData.total_egresos}  icon={<TrendingDown size={18} />} color="#ff4444" />
                <SummaryCard label="Balance"           value={dayData.balance}        icon={<Activity size={18} />}    color={dayData.balance >= 0 ? '#00cc66' : '#ff4444'} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Movimientos — {fmtDate(dayData.date)}</h3>
                <button className="btn" onClick={() => { setEntryForm(emptyEntry); setShowEntryModal(true); }}>
                  <Plus size={16} /> Registrar movimiento
                </button>
              </div>
              {dayData.entries.length === 0 ? (
                <p style={{ color: 'var(--secondary)', fontStyle: 'italic' }}>Sin movimientos registrados hoy.</p>
              ) : (
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr>
                    <th>Hora</th><th>Tipo</th><th>Concepto</th><th>Detalle</th><th>Monto</th><th></th>
                  </tr></thead>
                  <tbody>
                    {dayData.entries.map(e => (
                      <tr key={e.id}>
                        <td style={{ color: 'var(--secondary)', fontSize: '0.82rem' }}>
                          {new Date(e.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <span className={`badge-${e.type === 'ingreso' ? 'active' : 'inactive'}`} style={{ fontSize: '0.75rem' }}>
                            {e.type.toUpperCase()}
                          </span>
                        </td>
                        <td>{e.concept?.name}</td>
                        <td style={{ color: 'var(--secondary)', fontSize: '0.82rem' }}>
                          {e.entry_type === 'product_sale' && e.product
                            ? `${e.product.name} × ${e.product_qty}`
                            : '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: e.type === 'ingreso' ? '#00cc66' : '#ff4444' }}>
                          {fmt(e.amount)}
                        </td>
                        <td>
                          <button className="btn-icon" onClick={() => setDeleteEntry(e)} title="Eliminar">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB INVENTARIO ──────────────────────────────────────────────────── */}
      {tab === 'inventario' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Productos en inventario</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={async () => {
                const res = await apiFetch('/admin/products/generate', { method: 'POST' });
                const data = await res.json();
                addToast(data.message, res.ok ? 'success' : 'error');
                if (res.ok && data.created > 0) fetchProducts();
              }}>
                <BookOpen size={15} /> Generar catálogo base
              </button>
              <button className="btn" onClick={() => { setEditProduct(null); setProductForm(emptyProduct); setShowProductModal(true); }}>
                <Plus size={16} /> Agregar producto
              </button>
            </div>
          </div>
          {products.filter(p => p.is_active).length === 0 ? (
            <p style={{ color: 'var(--secondary)', fontStyle: 'italic' }}>Sin productos registrados.</p>
          ) : (
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <th>Producto</th><th>Precio</th><th>Stock</th><th>Unidad</th><th>Acciones</th>
              </tr></thead>
              <tbody>
                {products.filter(p => p.is_active).map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.description && <div style={{ color: 'var(--secondary)', fontSize: '0.78rem' }}>{p.description}</div>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.price)}</td>
                    <td>
                      <span style={{
                        background: p.stock === 0 ? 'rgba(255,68,68,0.15)' : p.stock < 5 ? 'rgba(255,153,0,0.15)' : 'rgba(0,204,102,0.15)',
                        color: p.stock === 0 ? '#ff4444' : p.stock < 5 ? '#ff9900' : '#00cc66',
                        padding: '2px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem',
                      }}>
                        {p.stock}
                      </span>
                    </td>
                    <td style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>{p.unit}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-icon" title="Ajustar stock" onClick={() => { setShowStockModal(p); setStockAdj(''); }}>
                          <Package size={15} />
                        </button>
                        <button className="btn-icon" title="Editar" onClick={() => {
                          setEditProduct(p);
                          setProductForm({ name: p.name, description: p.description || '', price: String(p.price), stock: String(p.stock), unit: p.unit });
                          setShowProductModal(true);
                        }}><Edit2 size={15} /></button>
                        <button className="btn-icon" title="Desactivar" onClick={() => setDeleteProduct(p)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB REPORTES ────────────────────────────────────────────────────── */}
      {tab === 'reportes' && (
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Período</label>
              <select value={reportPeriod} onChange={e => setReportPeriod(e.target.value as any)} style={{ ...inputStyle, width: '140px', height: '42px' }}>
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Fecha de referencia</label>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={{ ...inputStyle, width: '170px' }} />
            </div>
            <button className="btn" onClick={handleReport} style={{ marginBottom: '0' }}>
              {loadingReport ? 'Generando...' : 'Generar reporte'}
            </button>
          </div>

          {report && (
            <>
              <p style={{ color: 'var(--secondary)', fontSize: '0.82rem', marginBottom: '16px' }}>
                {fmtDate(report.from)} — {fmtDate(report.to)}
              </p>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <SummaryCard label="Ingresos"  value={report.total_ingresos} icon={<TrendingUp size={18} />}  color="#00cc66" />
                <SummaryCard label="Egresos"   value={report.total_egresos}  icon={<TrendingDown size={18} />} color="#ff4444" />
                <SummaryCard label="Balance"   value={report.balance}        icon={<Activity size={18} />}    color={report.balance >= 0 ? '#00cc66' : '#ff4444'} />
              </div>

              {/* Gráfica */}
              {report.by_concept.length > 0 && (() => {
                const conceptNames = [...new Set(report.by_concept.map(c => c.concept))];
                const chartData = conceptNames.map(name => ({
                  label: name,
                  ingreso: report.by_concept.find(c => c.concept === name && c.type === 'ingreso')?.total ?? 0,
                  egreso:  report.by_concept.find(c => c.concept === name && c.type === 'egreso')?.total  ?? 0,
                }));
                return (
                  <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #222' }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Por concepto</h4>
                    <BarChart items={chartData} />
                  </div>
                );
              })()}

              {/* Tabla por concepto */}
              <table className="table" style={{ width: '100%', marginBottom: '20px' }}>
                <thead><tr><th>Concepto</th><th>Tipo</th><th>Movimientos</th><th>Total</th></tr></thead>
                <tbody>
                  {report.by_concept.map((c, i) => (
                    <tr key={i}>
                      <td>{c.concept}</td>
                      <td><span className={`badge-${c.type === 'ingreso' ? 'active' : 'inactive'}`} style={{ fontSize: '0.75rem' }}>{c.type.toUpperCase()}</span></td>
                      <td style={{ color: 'var(--secondary)' }}>{c.count}</td>
                      <td style={{ fontWeight: 600, color: c.type === 'ingreso' ? '#00cc66' : '#ff4444' }}>{fmt(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Detalle completo */}
              <button style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', marginBottom: '12px', padding: 0 }}
                onClick={() => setShowReportEntries(!showReportEntries)}>
                {showReportEntries ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showReportEntries ? 'Ocultar detalle' : `Ver todas las entradas (${report.entries.length})`}
              </button>
              {showReportEntries && (
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Detalle</th><th>Monto</th></tr></thead>
                  <tbody>
                    {report.entries.map(e => (
                      <tr key={e.id}>
                        <td style={{ color: 'var(--secondary)', fontSize: '0.82rem' }}>{fmtDate(e.entry_date)}</td>
                        <td><span className={`badge-${e.type === 'ingreso' ? 'active' : 'inactive'}`} style={{ fontSize: '0.75rem' }}>{e.type.toUpperCase()}</span></td>
                        <td>{e.concept?.name}</td>
                        <td style={{ color: 'var(--secondary)', fontSize: '0.82rem' }}>
                          {e.entry_type === 'product_sale' && e.product ? `${e.product.name} × ${e.product_qty}` : e.notes || '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: e.type === 'ingreso' ? '#00cc66' : '#ff4444' }}>{fmt(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB CONCEPTOS ───────────────────────────────────────────────────── */}
      {tab === 'conceptos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Catálogo de conceptos</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={async () => {
                const res = await apiFetch('/admin/accounting/concepts/generate', { method: 'POST' });
                const data = await res.json();
                addToast(data.message, res.ok ? 'success' : 'error');
                if (res.ok && data.created > 0) fetchConcepts();
              }}>
                <BookOpen size={15} /> Generar catálogo base
              </button>
              <button className="btn" onClick={() => { setEditConcept(null); setConceptForm(emptyConcept); setShowConceptModal(true); }}>
                <Plus size={16} /> Agregar concepto
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {(['ingreso', 'egreso'] as const).map(type => (
              <div key={type} style={{ background: 'var(--surface)', borderRadius: '12px', padding: '16px', border: `1px solid ${type === 'ingreso' ? '#00cc6633' : '#ff444433'}` }}>
                <h4 style={{ margin: '0 0 12px', color: type === 'ingreso' ? '#00cc66' : '#ff4444', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {type === 'ingreso' ? '▲ Ingresos' : '▼ Egresos'}
                </h4>
                {concepts.filter(c => c.type === type).length === 0
                  ? <p style={{ color: '#555', fontStyle: 'italic', fontSize: '0.85rem' }}>Sin conceptos.</p>
                  : concepts.filter(c => c.type === type).map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a1a' }}>
                      <div>
                        <span style={{ fontSize: '0.9rem', color: c.is_active ? 'var(--text)' : '#555', textDecoration: c.is_active ? 'none' : 'line-through' }}>{c.name}</span>
                        {c.description && <div style={{ color: '#555', fontSize: '0.75rem' }}>{c.description}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-icon" title={c.is_active ? 'Desactivar' : 'Activar'} onClick={() => handleToggleConcept(c)} style={{ fontSize: '0.7rem', color: c.is_active ? '#aaa' : '#555' }}>
                          {c.is_active ? 'ON' : 'OFF'}
                        </button>
                        <button className="btn-icon" onClick={() => { setEditConcept(c); setConceptForm({ name: c.name, type: c.type, description: c.description || '' }); setShowConceptModal(true); }}><Edit2 size={13} /></button>
                        <button className="btn-icon" onClick={() => setDeleteConcept(c)}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════ MODALES ════════════════════════════════════════ */}

      {/* Modal: Registrar movimiento */}
      {showEntryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 20px' }}>Registrar movimiento</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Tipo */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Tipo</label>
                <select value={entryForm.type} onChange={e => setEntryForm({ ...emptyEntry, type: e.target.value as any })} style={{ ...inputStyle, height: '42px' }}>
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                </select>
              </div>

              {/* Concepto */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Concepto *</label>
                <select value={entryForm.concept_id} onChange={e => setEntryForm({ ...entryForm, concept_id: e.target.value })} style={{ ...inputStyle, height: '42px' }}>
                  <option value="">— Selecciona un concepto —</option>
                  {filteredConcepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Tipo de entrada (solo para ingresos) */}
              {entryForm.type === 'ingreso' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Tipo de entrada</label>
                  <select value={entryForm.entry_type} onChange={e => setEntryForm({ ...entryForm, entry_type: e.target.value as any, product_id: '', product_qty: '1', amount: '' })} style={{ ...inputStyle, height: '42px' }}>
                    <option value="manual">Manual</option>
                    <option value="product_sale">Venta de producto</option>
                  </select>
                </div>
              )}

              {/* Venta de producto */}
              {entryForm.entry_type === 'product_sale' && (
                <>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Producto *</label>
                    <select value={entryForm.product_id} onChange={e => setEntryForm({ ...entryForm, product_id: e.target.value })} style={{ ...inputStyle, height: '42px' }}>
                      <option value="">— Selecciona un producto —</option>
                      {products.filter(p => p.is_active).map(p => (
                        <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} — Stock: {p.stock}</option>
                      ))}
                    </select>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Cantidad *</label>
                    <input type="number" min="1" value={entryForm.product_qty} onChange={e => setEntryForm({ ...entryForm, product_qty: e.target.value })} style={inputStyle} />
                  </div>
                  {selectedProduct && (
                    <div style={{ background: 'rgba(0,204,102,0.08)', border: '1px solid #00cc6633', borderRadius: '8px', padding: '10px 14px', fontSize: '0.88rem', color: '#00cc66' }}>
                      Total calculado: <strong>{fmt(selectedProduct.price * Number(entryForm.product_qty))}</strong>
                    </div>
                  )}
                </>
              )}

              {/* Monto manual */}
              {(entryForm.entry_type === 'manual' || entryForm.type === 'egreso') && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Monto *</label>
                  <input type="number" min="0.01" step="0.01" value={entryForm.amount} onChange={e => setEntryForm({ ...entryForm, amount: e.target.value })} style={inputStyle} placeholder="0.00" />
                </div>
              )}

              {/* Fecha */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Fecha</label>
                <input type="date" value={entryForm.entry_date} onChange={e => setEntryForm({ ...entryForm, entry_date: e.target.value })} style={inputStyle} />
              </div>

              {/* Notas */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Notas (opcional)</label>
                <textarea value={entryForm.notes} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} style={{ ...inputStyle, height: '70px', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setShowEntryModal(false)}>Cancelar</button>
              <button className="btn" onClick={handleSaveEntry}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar producto */}
      {showProductModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 20px' }}>{editProduct ? 'Editar producto' : 'Nuevo producto'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={fieldStyle}><label style={labelStyle}>Nombre *</label><input value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} style={inputStyle} /></div>
              <div style={fieldStyle}><label style={labelStyle}>Descripción</label><input value={productForm.description} onChange={e => setProductForm({ ...productForm, description: e.target.value })} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={fieldStyle}><label style={labelStyle}>Precio *</label><input type="number" min="0" step="0.01" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>Stock inicial</label><input type="number" min="0" value={productForm.stock} onChange={e => setProductForm({ ...productForm, stock: e.target.value })} style={inputStyle} /></div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Unidad</label>
                <select value={productForm.unit} onChange={e => setProductForm({ ...productForm, unit: e.target.value })} style={{ ...inputStyle, height: '42px' }}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => { setShowProductModal(false); setEditProduct(null); }}>Cancelar</button>
              <button className="btn" onClick={handleSaveProduct}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ajuste de stock */}
      {showStockModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '380px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 8px' }}>Ajuste de stock</h3>
            <p style={{ color: 'var(--secondary)', margin: '0 0 20px', fontSize: '0.88rem' }}>
              {showStockModal.name} — Stock actual: <strong style={{ color: 'var(--text)' }}>{showStockModal.stock}</strong>
            </p>
            <div style={fieldStyle}>
              <label style={labelStyle}>Cantidad (positivo = entrada, negativo = merma)</label>
              <input type="number" value={stockAdj} onChange={e => setStockAdj(e.target.value)} style={inputStyle} placeholder="ej: 10 ó -3" />
            </div>
            {stockAdj && (
              <p style={{ color: 'var(--secondary)', fontSize: '0.82rem', marginTop: '8px' }}>
                Nuevo stock: <strong style={{ color: 'var(--text)' }}>{showStockModal.stock + Number(stockAdj)}</strong>
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setShowStockModal(null)}>Cancelar</button>
              <button className="btn" onClick={handleAdjustStock}>Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar concepto */}
      {showConceptModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '400px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 20px' }}>{editConcept ? 'Editar concepto' : 'Nuevo concepto'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={fieldStyle}><label style={labelStyle}>Nombre *</label><input value={conceptForm.name} onChange={e => setConceptForm({ ...conceptForm, name: e.target.value })} style={inputStyle} /></div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Tipo *</label>
                <select value={conceptForm.type} onChange={e => setConceptForm({ ...conceptForm, type: e.target.value as any })} style={{ ...inputStyle, height: '42px' }}>
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                </select>
              </div>
              <div style={fieldStyle}><label style={labelStyle}>Descripción</label><input value={conceptForm.description} onChange={e => setConceptForm({ ...conceptForm, description: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => { setShowConceptModal(false); setEditConcept(null); }}>Cancelar</button>
              <button className="btn" onClick={handleSaveConcept}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modales */}
      {deleteEntry && (
        <ConfirmModal
          message={`¿Eliminar el movimiento de ${fmt(deleteEntry.amount)}? ${deleteEntry.entry_type === 'product_sale' ? 'Se devolverá el stock al inventario.' : ''}`}
          onConfirm={handleDeleteEntry}
          onCancel={() => setDeleteEntry(null)}
        />
      )}
      {deleteProduct && (
        <ConfirmModal
          message={`¿Desactivar el producto "${deleteProduct.name}"?`}
          onConfirm={handleDeleteProduct}
          onCancel={() => setDeleteProduct(null)}
        />
      )}
      {deleteConcept && (
        <ConfirmModal
          message={`¿Eliminar el concepto "${deleteConcept.name}"? Solo se puede eliminar si no tiene movimientos registrados.`}
          onConfirm={handleDeleteConcept}
          onCancel={() => setDeleteConcept(null)}
        />
      )}
    </div>
  );
}
