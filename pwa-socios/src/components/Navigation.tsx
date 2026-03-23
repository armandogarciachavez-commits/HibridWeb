import { NavLink } from 'react-router-dom';
import { Home, Calendar, User, LogOut } from 'lucide-react';

interface NavigationProps {
  onLogout: () => void;
}

const Navigation = ({ onLogout }: NavigationProps) => {
  return (
    <nav className="bottom-nav">
      <NavLink
        to="/"
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        end
      >
        <Home size={24} />
        <span>Inicio</span>
      </NavLink>

      <NavLink
        to="/schedule"
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Calendar size={24} />
        <span>Reservas</span>
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <User size={24} />
        <span>Perfil</span>
      </NavLink>

      <button
        onClick={onLogout}
        className="nav-item"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4444' }}
      >
        <LogOut size={24} />
        <span>Salir</span>
      </button>
    </nav>
  );
};

export default Navigation;
