import React from 'react';
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Calendar,
  Users,
  UserCheck,
  BookOpen,
  School,
  Layers,
  X,
} from 'lucide-react';

interface SidebarProps {
  currentPath: string;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '#/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Departments', path: '#/departments', icon: <Building2 size={18} /> },
  { label: 'Courses', path: '#/courses', icon: <GraduationCap size={18} /> },
  { label: 'Semesters', path: '#/semesters', icon: <Calendar size={18} /> },
  { label: 'Sections', path: '#/sections', icon: <Users size={18} /> },
  { label: 'Faculty', path: '#/faculty', icon: <UserCheck size={18} /> },
  { label: 'Subjects', path: '#/subjects', icon: <BookOpen size={18} /> },
  { label: 'Classrooms', path: '#/classrooms', icon: <School size={18} /> },
  { label: 'Curriculum', path: '#/curriculum', icon: <Layers size={18} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPath, isOpen, onClose }) => {
  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-title">SmartTT Admin</span>
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = currentPath === item.path || (item.path === '#/dashboard' && currentPath === '#/');
            return (
              <a
                key={item.path}
                href={item.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
