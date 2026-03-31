import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar as CalendarIcon, Fingerprint, ShieldCheck, LogOut, Megaphone } from 'lucide-react';

interface NavigationProps {
  onLogout: () => void;
}

const Navigation = ({ onLogout }: NavigationProps) => {
  const role = localStorage.getItem('user_role');
  const name = localStorage.getItem('user_name');
  const isSuperAdmin = role === 'superadmin';

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-header">
        <h2 style={{ fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 'bold' }}>HYBRID ADMIN</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--secondary)' }}>Gestión de Gimnasio</span>
      </div>

      <nav className="nav-menu" style={{ flex: 1 }}>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <LayoutDashboard size={20} />
          <span>Panel Principal</span>
        </NavLink>

        <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Users size={20} />
          <span>Gestión de Socios</span>
        </NavLink>

        <NavLink to="/calendar" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <CalendarIcon size={20} />
          <span>Calendario y Reservas</span>
        </NavLink>

        <NavLink to="/biometrics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Fingerprint size={20} />
          <span>Ajustes Biométricos</span>
        </NavLink>

        <NavLink to="/announcements" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Megaphone size={20} />
          <span>Anuncios y Promociones</span>
        </NavLink>

        {isSuperAdmin && (
          <NavLink to="/admins" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <ShieldCheck size={20} />
            <span>Administradores</span>
          </NavLink>
        )}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid #222' }}>
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, marginBottom: '2px' }}>{name}</p>
          <p style={{ fontSize: '0.75rem', color: isSuperAdmin ? 'var(--primary)' : 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {isSuperAdmin ? 'Super Admin' : 'Administrador'}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="btn-secondary"
          style={{ width: '100%', padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};

export default Navigation;
