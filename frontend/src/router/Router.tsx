import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminLayout } from '../components/layout/AdminLayout';
import { LoginView } from '../components/views/LoginView';
import { DashboardHomeView } from '../components/views/DashboardHomeView';
import { DepartmentsView } from '../components/views/DepartmentsView';
import { CoursesView } from '../components/views/CoursesView';
import { SemestersView } from '../components/views/SemestersView';
import { SectionsView } from '../components/views/SectionsView';
import { FacultyView } from '../components/views/FacultyView';
import { SubjectsView } from '../components/views/SubjectsView';
import { ClassroomsView } from '../components/views/ClassroomsView';
import { CurriculumView } from '../components/views/CurriculumView';
import { ShieldAlert, AlertCircle, LogOut } from 'lucide-react';

export const Router: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const [currentHash, setCurrentHash] = useState<string>(
    window.location.hash || '#/dashboard'
  );

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/dashboard');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 1. Initial authentication loading state
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-primary)' }}>
          Smart Campus
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Verifying security session...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated state
  if (!user) {
    if (currentHash !== '#/login') {
      window.location.hash = '#/login';
    }
    return <LoginView />;
  }

  // 3. Authenticated but on login route -> redirect to dashboard
  if (currentHash === '#/login') {
    window.location.hash = '#/dashboard';
    return null;
  }

  // 4. Role Guard: Default-deny if role is not ADMIN
  if (user.role !== 'ADMIN') {
    return (
      <div className="login-container">
        <div className="login-card" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-danger-bg)',
              color: 'var(--color-danger-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <h1 className="login-title" style={{ color: 'var(--color-text-main)' }}>
            403 Forbidden
          </h1>
          <p className="login-subtitle" style={{ marginBottom: '1.25rem' }}>
            Administrative Privilege Required
          </p>
          <div className="alert alert-warning" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <span>
              You are signed in as <strong>{user.username}</strong> with role{' '}
              <strong>{user.role}</strong>. This administrative portal requires an{' '}
              <strong>ADMIN</strong> role account.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={logout}
            style={{ width: '100%' }}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. Active route matching
  const normalizedHash = currentHash === '#/' || !currentHash ? '#/dashboard' : currentHash;

  let viewContent: React.ReactNode = null;
  switch (normalizedHash) {
    case '#/dashboard':
      viewContent = <DashboardHomeView />;
      break;
    case '#/departments':
      viewContent = <DepartmentsView />;
      break;
    case '#/courses':
      viewContent = <CoursesView />;
      break;
    case '#/semesters':
      viewContent = <SemestersView />;
      break;
    case '#/sections':
      viewContent = <SectionsView />;
      break;
    case '#/faculty':
      viewContent = <FacultyView />;
      break;
    case '#/subjects':
      viewContent = <SubjectsView />;
      break;
    case '#/classrooms':
      viewContent = <ClassroomsView />;
      break;
    case '#/curriculum':
      viewContent = <CurriculumView />;
      break;
    default:
      viewContent = (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <AlertCircle size={36} style={{ color: '#94a3b8', margin: '0 auto 1rem' }} />
          <h2 className="card-title">Page Not Found</h2>
          <p className="card-desc">The requested administrative view does not exist.</p>
          <a href="#/dashboard" className="btn btn-primary" style={{ display: 'inline-flex' }}>
            Return to Dashboard
          </a>
        </div>
      );
      break;
  }

  return <AdminLayout currentPath={normalizedHash}>{viewContent}</AdminLayout>;
};
