import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  Semester,
  Course,
  PaginatedResponse,
  CreateSemesterInput,
  UpdateSemesterInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const SemestersView: React.FC = () => {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseMap, setCourseMap] = useState<Record<string, Course>>({});
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<'ODD' | 'EVEN' | ''>('');
  const [quickFilter, setQuickFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSemester, setEditingSemester] = useState<Semester | null>(null);
  const [formCourseId, setFormCourseId] = useState('');
  const [formSemesterNumber, setFormSemesterNumber] = useState<number>(1);
  const [formAcademicYear, setFormAcademicYear] = useState('2026-2027');
  const [formTerm, setFormTerm] = useState<'ODD' | 'EVEN'>('ODD');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivation confirmation state
  const [deactivatingSemester, setDeactivatingSemester] = useState<Semester | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Load courses for dropdown and lookup
  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await apiClient.get<PaginatedResponse<Course>>('/admin/courses', {
          limit: 100,
          isActive: 'all',
          sortBy: 'name',
          sortOrder: 'asc',
        });
        setCourses(res.data);
        const map: Record<string, Course> = {};
        res.data.forEach((c) => {
          map[c.id] = c;
        });
        setCourseMap(map);
      } catch {
        // Fallback handled gracefully
      }
    }
    loadCourses();
  }, []);

  const fetchSemesters = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const queryParams: Record<string, unknown> = {
        limit,
        offset,
        isActive,
        sortBy: 'semester_number',
        sortOrder: 'asc',
      };
      if (selectedCourseId) queryParams.courseId = selectedCourseId;
      if (selectedTerm) queryParams.term = selectedTerm;

      const res = await apiClient.get<PaginatedResponse<Semester>>('/admin/semesters', queryParams);
      setSemesters(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load semesters');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive, selectedCourseId, selectedTerm]);

  useEffect(() => {
    fetchSemesters();
  }, [fetchSemesters]);

  const openCreateModal = () => {
    setEditingSemester(null);
    setFormCourseId(selectedCourseId || (courses[0]?.id ?? ''));
    setFormSemesterNumber(1);
    setFormAcademicYear('2026-2027');
    setFormTerm('ODD');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (sem: Semester) => {
    setEditingSemester(sem);
    setFormCourseId(sem.course_id);
    setFormSemesterNumber(sem.semester_number);
    setFormAcademicYear(sem.academic_year);
    setFormTerm(sem.term);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editingSemester && !formCourseId) {
      errors.courseId = 'Course is required';
    }
    if (!formSemesterNumber || formSemesterNumber < 1 || formSemesterNumber > 12) {
      errors.semesterNumber = 'Semester number must be between 1 and 12';
    }
    const yearRegex = /^\d{4}-\d{4}$/;
    if (!formAcademicYear.trim() || !yearRegex.test(formAcademicYear.trim())) {
      errors.academicYear = 'Academic year must match format YYYY-YYYY (e.g. 2026-2027)';
    }
    if (formTerm !== 'ODD' && formTerm !== 'EVEN') {
      errors.term = "Term must be 'ODD' or 'EVEN'";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setFormSubmitting(true);
    setFormErrors({});
    try {
      if (editingSemester) {
        const payload: UpdateSemesterInput = {
          semesterNumber: Number(formSemesterNumber),
          academicYear: formAcademicYear.trim(),
          term: formTerm,
        };
        await apiClient.patch<SingleResponse<Semester>>(
          `/admin/semesters/${editingSemester.id}`,
          payload
        );
      } else {
        const payload: CreateSemesterInput = {
          courseId: formCourseId,
          semesterNumber: Number(formSemesterNumber),
          academicYear: formAcademicYear.trim(),
          term: formTerm,
        };
        await apiClient.post<SingleResponse<Semester>>('/admin/semesters', payload);
      }
      setIsFormOpen(false);
      fetchSemesters();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.details && err.details.length > 0) {
          const fieldErrs: Record<string, string> = {};
          err.details.forEach((d) => {
            fieldErrs[d.path] = d.message;
          });
          setFormErrors(fieldErrs);
        } else {
          setFormErrors({ general: err.message });
        }
      } else {
        setFormErrors({ general: 'Unexpected error occurred while saving semester' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingSemester) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<Semester>>(`/admin/semesters/${deactivatingSemester.id}`);
      setDeactivatingSemester(null);
      fetchSemesters();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (sem: Semester) => {
    try {
      await apiClient.post<SingleResponse<Semester>>(`/admin/semesters/${sem.id}/activate`);
      fetchSemesters();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  const filteredSemesters = semesters.filter((s) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    const course = courseMap[s.course_id];
    return (
      s.academic_year.toLowerCase().includes(term) ||
      s.term.toLowerCase().includes(term) ||
      `semester ${s.semester_number}`.includes(term) ||
      (course && (course.name.toLowerCase().includes(term) || course.code.toLowerCase().includes(term)))
    );
  });

  const columns: Column<Semester>[] = [
    {
      header: 'Course',
      accessor: (s) => {
        const c = courseMap[s.course_id];
        return c ? `${c.code} — ${c.name}` : s.course_id;
      },
    },
    {
      header: 'Semester',
      accessor: (s) => <strong>Semester {s.semester_number}</strong>,
      width: '120px',
    },
    {
      header: 'Academic Year',
      accessor: 'academic_year',
      width: '130px',
    },
    {
      header: 'Term',
      accessor: (s) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 600,
            color: s.term === 'ODD' ? '#0369a1' : '#b45309',
          }}
        >
          {s.term}
        </span>
      ),
      width: '100px',
    },
    {
      header: 'Status',
      accessor: (s) => (
        <span className={`status-pill ${s.is_active ? 'success' : 'danger'}`}>
          <span className="status-dot" />
          {s.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '110px',
    },
    {
      header: 'Created At',
      accessor: (s) => new Date(s.created_at).toLocaleDateString(),
      width: '130px',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Semesters</h1>
          <p className="page-subtitle">Academic years, terms and semester milestones</p>
        </div>
      </div>

      {apiError && (
        <div className="alert alert-danger" role="alert">
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>{apiError}</span>
        </div>
      )}

      <FilterBar
        isActive={isActive}
        onIsActiveChange={(val) => {
          setIsActive(val);
          setOffset(0);
        }}
        quickFilterText={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onAddClick={openCreateModal}
        addLabel="Add Semester"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="filter-course" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Course:
          </label>
          <select
            id="filter-course"
            className="filter-select"
            value={selectedCourseId}
            onChange={(e) => {
              setSelectedCourseId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="filter-term" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Term:
          </label>
          <select
            id="filter-term"
            className="filter-select"
            value={selectedTerm}
            onChange={(e) => {
              setSelectedTerm(e.target.value as 'ODD' | 'EVEN' | '');
              setOffset(0);
            }}
          >
            <option value="">All Terms</option>
            <option value="ODD">ODD</option>
            <option value="EVEN">EVEN</option>
          </select>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredSemesters}
        keyExtractor={(s) => s.id}
        loading={loading}
        rowClassName={(s) => (!s.is_active ? 'row-inactive' : '')}
        actions={(sem) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Semester"
              onClick={() => openEditModal(sem)}
            >
              <Pencil size={15} />
            </button>
            {sem.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Semester"
                onClick={() => setDeactivatingSemester(sem)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Semester"
                onClick={() => handleReactivate(sem)}
              >
                <RotateCw size={15} />
              </button>
            )}
          </>
        )}
      />

      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        onPageChange={setOffset}
        onLimitChange={setLimit}
        disabled={loading}
      />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingSemester ? 'Edit Semester' : 'Create Semester'}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsFormOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFormSubmit}
              disabled={formSubmitting}
            >
              {formSubmitting
                ? 'Saving...'
                : editingSemester
                ? 'Save Changes'
                : 'Create Semester'}
            </button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit} noValidate>
          {formErrors.general && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <span>{formErrors.general}</span>
            </div>
          )}

          <FormField
            label="Course"
            htmlFor="sem-course"
            required
            error={formErrors.courseId}
            helper={editingSemester ? 'Course cannot be changed after creation' : 'Degree course program'}
          >
            <select
              id="sem-course"
              className={`form-control ${formErrors.courseId ? 'is-invalid' : ''}`}
              value={formCourseId}
              onChange={(e) => setFormCourseId(e.target.value)}
              disabled={Boolean(editingSemester) || formSubmitting}
              required
            >
              <option value="">Select Course</option>
              {courses
                .filter((c) => (editingSemester ? true : c.is_active))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} {!c.is_active ? '(Inactive)' : ''}
                  </option>
                ))}
            </select>
          </FormField>

          <FormField
            label="Semester Number"
            htmlFor="sem-number"
            required
            error={formErrors.semesterNumber}
            helper="Semester sequence number (1 to 12)"
          >
            <input
              id="sem-number"
              type="number"
              className={`form-control ${formErrors.semesterNumber ? 'is-invalid' : ''}`}
              value={formSemesterNumber}
              onChange={(e) => setFormSemesterNumber(parseInt(e.target.value, 10) || 1)}
              min={1}
              max={12}
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Academic Year"
            htmlFor="sem-year"
            required
            error={formErrors.academicYear}
            helper="Format YYYY-YYYY (e.g. 2026-2027)"
          >
            <input
              id="sem-year"
              type="text"
              className={`form-control ${formErrors.academicYear ? 'is-invalid' : ''}`}
              value={formAcademicYear}
              onChange={(e) => setFormAcademicYear(e.target.value)}
              placeholder="2026-2027"
              pattern="\d{4}-\d{4}"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Term"
            htmlFor="sem-term"
            required
            error={formErrors.term}
            helper="Academic half-year term"
          >
            <select
              id="sem-term"
              className={`form-control ${formErrors.term ? 'is-invalid' : ''}`}
              value={formTerm}
              onChange={(e) => setFormTerm(e.target.value as 'ODD' | 'EVEN')}
              required
              disabled={formSubmitting}
            >
              <option value="ODD">ODD Term</option>
              <option value="EVEN">EVEN Term</option>
            </select>
          </FormField>
        </form>
      </Modal>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingSemester)}
        onClose={() => setDeactivatingSemester(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Semester"
        message={`Are you sure you want to deactivate Semester ${deactivatingSemester?.semester_number} (${deactivatingSemester?.academic_year} ${deactivatingSemester?.term})?`}
        warningNote="Sections and timetable schedules associated with this semester will be archived."
        confirmLabel="Deactivate Semester"
        loading={deactivateLoading}
      />
    </div>
  );
};
