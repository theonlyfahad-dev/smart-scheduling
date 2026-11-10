import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  Course,
  Department,
  PaginatedResponse,
  CreateCourseInput,
  UpdateCourseInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const CoursesView: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptMap, setDeptMap] = useState<Record<string, Department>>({});
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formDeptId, setFormDeptId] = useState('');
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formTotalSemesters, setFormTotalSemesters] = useState<number>(8);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivate confirmation state
  const [deactivatingCourse, setDeactivatingCourse] = useState<Course | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Load departments for lookup & dropdown filter
  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await apiClient.get<PaginatedResponse<Department>>('/admin/departments', {
          limit: 100,
          isActive: 'all',
          sortBy: 'name',
          sortOrder: 'asc',
        });
        setDepartments(res.data);
        const map: Record<string, Department> = {};
        res.data.forEach((d) => {
          map[d.id] = d;
        });
        setDeptMap(map);
      } catch {
        // Departments lookup failure will show gracefully in dropdown
      }
    }
    loadDepts();
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const queryParams: Record<string, unknown> = {
        limit,
        offset,
        isActive,
        sortBy: 'name',
        sortOrder: 'asc',
      };
      if (selectedDeptId) {
        queryParams.departmentId = selectedDeptId;
      }

      const res = await apiClient.get<PaginatedResponse<Course>>('/admin/courses', queryParams);
      setCourses(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load courses');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive, selectedDeptId]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const openCreateModal = () => {
    setEditingCourse(null);
    setFormDeptId(selectedDeptId || (departments[0]?.id ?? ''));
    setFormName('');
    setFormCode('');
    setFormTotalSemesters(8);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (c: Course) => {
    setEditingCourse(c);
    setFormDeptId(c.department_id);
    setFormName(c.name);
    setFormCode(c.code);
    setFormTotalSemesters(c.total_semesters);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editingCourse && !formDeptId) {
      errors.departmentId = 'Department is required';
    }
    const trimmedName = formName.trim();
    if (!trimmedName) {
      errors.name = 'Course name is required';
    } else if (trimmedName.length > 150) {
      errors.name = 'Course name cannot exceed 150 characters';
    }
    const trimmedCode = formCode.trim();
    if (!trimmedCode) {
      errors.code = 'Course code is required';
    } else if (trimmedCode.length > 20) {
      errors.code = 'Course code cannot exceed 20 characters';
    }
    if (!formTotalSemesters || formTotalSemesters < 1 || formTotalSemesters > 12) {
      errors.totalSemesters = 'Total semesters must be between 1 and 12';
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
      if (editingCourse) {
        const payload: UpdateCourseInput = {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          totalSemesters: Number(formTotalSemesters),
        };
        await apiClient.patch<SingleResponse<Course>>(
          `/admin/courses/${editingCourse.id}`,
          payload
        );
      } else {
        const payload: CreateCourseInput = {
          departmentId: formDeptId,
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          totalSemesters: Number(formTotalSemesters),
        };
        await apiClient.post<SingleResponse<Course>>('/admin/courses', payload);
      }
      setIsFormOpen(false);
      fetchCourses();
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
        setFormErrors({ general: 'Unexpected error occurred while saving course' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingCourse) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<Course>>(`/admin/courses/${deactivatingCourse.id}`);
      setDeactivatingCourse(null);
      fetchCourses();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (course: Course) => {
    try {
      await apiClient.post<SingleResponse<Course>>(`/admin/courses/${course.id}/activate`);
      fetchCourses();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  const filteredCourses = courses.filter((c) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    const dept = deptMap[c.department_id];
    return (
      c.name.toLowerCase().includes(term) ||
      c.code.toLowerCase().includes(term) ||
      (dept && (dept.name.toLowerCase().includes(term) || dept.code.toLowerCase().includes(term)))
    );
  });

  const columns: Column<Course>[] = [
    {
      header: 'Code',
      accessor: (c) => <strong style={{ fontFamily: 'monospace' }}>{c.code}</strong>,
      width: '120px',
    },
    {
      header: 'Course Name',
      accessor: 'name',
    },
    {
      header: 'Department',
      accessor: (c) => {
        const d = deptMap[c.department_id];
        return d ? `${d.code} — ${d.name}` : c.department_id;
      },
    },
    {
      header: 'Semesters',
      accessor: (c) => `${c.total_semesters} Semesters`,
      width: '120px',
    },
    {
      header: 'Status',
      accessor: (c) => (
        <span className={`status-pill ${c.is_active ? 'success' : 'danger'}`}>
          <span className="status-dot" />
          {c.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '110px',
    },
    {
      header: 'Created At',
      accessor: (c) => new Date(c.created_at).toLocaleDateString(),
      width: '130px',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Courses</h1>
          <p className="page-subtitle">Degree programs and semester curricula</p>
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
        addLabel="Add Course"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="filter-dept" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Department:
          </label>
          <select
            id="filter-dept"
            className="filter-select"
            value={selectedDeptId}
            onChange={(e) => {
              setSelectedDeptId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredCourses}
        keyExtractor={(c) => c.id}
        loading={loading}
        rowClassName={(c) => (!c.is_active ? 'row-inactive' : '')}
        actions={(course) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Course"
              onClick={() => openEditModal(course)}
            >
              <Pencil size={15} />
            </button>
            {course.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Course"
                onClick={() => setDeactivatingCourse(course)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Course"
                onClick={() => handleReactivate(course)}
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
        title={editingCourse ? 'Edit Course' : 'Create Course'}
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
                : editingCourse
                ? 'Save Changes'
                : 'Create Course'}
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
            label="Department"
            htmlFor="course-dept"
            required
            error={formErrors.departmentId}
            helper={editingCourse ? 'Department cannot be modified after creation' : 'Academic department'}
          >
            <select
              id="course-dept"
              className={`form-control ${formErrors.departmentId ? 'is-invalid' : ''}`}
              value={formDeptId}
              onChange={(e) => setFormDeptId(e.target.value)}
              disabled={Boolean(editingCourse) || formSubmitting}
              required
            >
              <option value="">Select Department</option>
              {departments
                .filter((d) => (editingCourse ? true : d.is_active))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name} {!d.is_active ? '(Inactive)' : ''}
                  </option>
                ))}
            </select>
          </FormField>

          <FormField
            label="Course Code"
            htmlFor="course-code"
            required
            error={formErrors.code}
            helper="Unique program code (1-20 characters, e.g. BTECH-CSE)"
          >
            <input
              id="course-code"
              type="text"
              className={`form-control ${formErrors.code ? 'is-invalid' : ''}`}
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              maxLength={20}
              placeholder="e.g. BTECH-CSE"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Course Name"
            htmlFor="course-name"
            required
            error={formErrors.name}
            helper="Full program degree title (1-150 characters)"
          >
            <input
              id="course-name"
              type="text"
              className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={150}
              placeholder="e.g. Bachelor of Technology in Computer Science"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Total Semesters"
            htmlFor="course-semesters"
            required
            error={formErrors.totalSemesters}
            helper="Number of semesters in this degree program (1 to 12)"
          >
            <input
              id="course-semesters"
              type="number"
              className={`form-control ${formErrors.totalSemesters ? 'is-invalid' : ''}`}
              value={formTotalSemesters}
              onChange={(e) => setFormTotalSemesters(parseInt(e.target.value, 10) || 0)}
              min={1}
              max={12}
              required
              disabled={formSubmitting}
            />
          </FormField>
        </form>
      </Modal>

      {/* Soft Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingCourse)}
        onClose={() => setDeactivatingCourse(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Course"
        message={`Are you sure you want to deactivate course "${deactivatingCourse?.name}" (${deactivatingCourse?.code})?`}
        warningNote="Historical semesters and student allocations will remain preserved."
        confirmLabel="Deactivate Course"
        loading={deactivateLoading}
      />
    </div>
  );
};
