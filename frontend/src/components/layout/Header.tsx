import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Menu, LogOut } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} />
        </button>
        <span className="brand-title" style={{ fontSize: '1rem' }}>
          Smart Campus
        </span>
      </div>

      <div className="header-right">
        {user && (
          <div className="user-badge">
            <span>{user.username}</span>
            <span className="role-tag">{user.role}</span>
          </div>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign out of administrative session"
        >
          <LogOut size={16} />
          <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
        </button>
      </div>
    </header>
  );
};
