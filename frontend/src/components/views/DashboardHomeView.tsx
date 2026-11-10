import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  GraduationCap,
  Calendar,
  Users,
  UserCheck,
  BookOpen,
  School,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface ModuleTile {
  title: string;
  desc: string;
  path: string;
  icon: React.ReactNode;
}

const modules: ModuleTile[] = [
  {
    title: 'Departments',
    desc: 'Academic faculties, organizational divisions, and unique department codes.',
    path: '#/departments',
    icon: <Building2 size={22} />,
  },
  {
    title: 'Courses',
    desc: 'Degree programs, academic levels, and total semester configurations.',
    path: '#/courses',
    icon: <GraduationCap size={22} />,
  },
  {
    title: 'Semesters',
    desc: 'Academic terms (ODD/EVEN), academic years, and semester number bindings.',
    path: '#/semesters',
    icon: <Calendar size={22} />,
  },
  {
    title: 'Sections',
    desc: 'Class sections and unique student class codes for master scheduling.',
    path: '#/sections',
    icon: <Users size={22} />,
  },
  {
    title: 'Faculty',
    desc: 'Academic instructors directory, employee codes, and institutional emails.',
    path: '#/faculty',
    icon: <UserCheck size={22} />,
  },
  {
    title: 'Subjects',
    desc: 'Curricular course subjects categorized by Theory, Lab, or Tutorial.',
    path: '#/subjects',
    icon: <BookOpen size={22} />,
  },
  {
    title: 'Classrooms',
    desc: 'Campus buildings, room numbers, lecture halls, and laboratories.',
    path: '#/classrooms',
    icon: <School size={22} />,
  },
  {
    title: 'Curriculum',
    desc: 'Course-to-subject mappings across semester numbers within departments.',
    path: '#/curriculum',
    icon: <Layers size={22} />,
  },
];

export const DashboardHomeView: React.FC = () => {
  const { user } = useAuth();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Data Administration</h1>
          <p className="page-subtitle">
            Institutional scheduling configuration for Smart Campus — signed in as{' '}
            <strong>{user?.username}</strong>
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title">Institutional Launchpad</h2>
        <p className="card-desc" style={{ marginBottom: 0 }}>
          Manage core academic structures, curricular catalogs, faculty directories, and campus
          facilities. Select a module below to view, filter, create, update, or soft-deactivate records.
        </p>
      </div>

      <div className="dashboard-grid">
        {modules.map((m) => (
          <a key={m.path} href={m.path} className="launchpad-card">
            <div className="launchpad-icon">{m.icon}</div>
            <h3 className="launchpad-title">{m.title}</h3>
            <p className="launchpad-desc">{m.desc}</p>
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--color-primary)',
              }}
            >
              <span>Manage {m.title}</span>
              <ArrowRight size={14} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
