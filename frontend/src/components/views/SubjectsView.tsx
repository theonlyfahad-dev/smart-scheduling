import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  Subject,
  Department,
  PaginatedResponse,
  CreateSubjectInput,
  UpdateSubjectInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const SubjectsView: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptMap, setDeptMap] = useState<Record<string, Department>>({});
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'THEORY' | 'LAB' | 'TUTORIAL' | ''>('');
  const [quickFilter, setQuickFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [formDeptId, setFormDeptId] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'THEORY' | 'LAB' | 'TUTORIAL'>('THEORY');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivate confirmation state
  const [deactivatingSubject, setDeactivatingSubject] = useState<Subject | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Load departments
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
        // Fallback
      }
    }
    loadDepts();
  }, []);

  const fetchSubjects = useCallback(async () => {
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
      if (selectedDeptId) queryParams.departmentId = selectedDeptId;
      if (selectedType) queryParams.type = selectedType;

      const res = await apiClient.get<PaginatedResponse<Subject>>('/admin/subjects', queryParams);
      setSubjects(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load subjects');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive, selectedDeptId, selectedType]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const openCreateModal = () => {
    setEditingSubject(null);
    setFormDeptId(selectedDeptId || (departments[0]?.id ?? ''));
    setFormCode('');
    setFormName('');
    setFormType('THEORY');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (sub: Subject) => {
    setEditingSubject(sub);
    setFormDeptId(sub.department_id);
    setFormCode(sub.code);
    setFormName(sub.name);
    setFormType(sub.type);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editingSubject && !formDeptId) {
      errors.departmentId = 'Department is required';
    }
    const trimmedCode = formCode.trim();
    if (!trimmedCode) {
      errors.code = 'Subject code is required';
    } else if (trimmedCode.length > 20) {
      errors.code = 'Subject code cannot exceed 20 characters';
    }
    const trimmedName = formName.trim();
    if (!trimmedName) {
      errors.name = 'Subject name is required';
    } else if (trimmedName.length > 150) {
      errors.name = 'Subject name cannot exceed 150 characters';
    }
    if (!['THEORY', 'LAB', 'TUTORIAL'].includes(formType)) {
      errors.type = "Type must be 'THEORY', 'LAB', or 'TUTORIAL'";
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
      if (editingSubject) {
        const payload: UpdateSubjectInput = {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          type: formType,
        };
        await apiClient.patch<SingleResponse<Subject>>(
          `/admin/subjects/${editingSubject.id}`,
          payload
        );
      } else {
        const payload: CreateSubjectInput = {
          departmentId: formDeptId,
          code: formCode.trim().toUpperCase(),
          name: formName.trim(),
          type: formType,
        };
        await apiClient.post<SingleResponse<Subject>>('/admin/subjects', payload);
      }
      setIsFormOpen(false);
      fetchSubjects();
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
        setFormErrors({ general: 'Unexpected error occurred while saving subject' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingSubject) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<Subject>>(`/admin/subjects/${deactivatingSubject.id}`);
      setDeactivatingSubject(null);
      fetchSubjects();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (sub: Subject) => {
    try {
      await apiClient.post<SingleResponse<Subject>>(`/admin/subjects/${sub.id}/activate`);
      fetchSubjects();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  const filteredSubjects = subjects.filter((s) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    const dept = deptMap[s.department_id];
    return (
      s.name.toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term) ||
      s.type.toLowerCase().includes(term) ||
      (dept && (dept.name.toLowerCase().includes(term) || dept.code.toLowerCase().includes(term)))
    );
  });

  const columns: Column<Subject>[] = [
    {
      header: 'Code',
      accessor: (s) => <strong style={{ fontFamily: 'monospace' }}>{s.code}</strong>,
      width: '120px',
    },
    {
      header: 'Subject Name',
      accessor: 'name',
    },
    {
      header: 'Department',
      accessor: (s) => {
        const d = deptMap[s.department_id];
        return d ? `${d.code} — ${d.name}` : s.department_id;
      },
    },
    {
      header: 'Type',
      accessor: (s) => (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            backgroundColor:
              s.type === 'LAB'
                ? '#fef3c7'
                : s.type === 'TUTORIAL'
                ? '#f3e8ff'
                : '#e0f2fe',
            color:
              s.type === 'LAB'
                ? '#92400e'
                : s.type === 'TUTORIAL'
                ? '#6b21a8'
                : '#0369a1',
          }}
        >
          {s.type}
        </span>
      ),
      width: '110px',
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
          <h1 className="page-title">Subjects</h1>
          <p className="page-subtitle">Academic subject catalog and pedagogical categories</p>
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
        addLabel="Add Subject"
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="filter-type" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Type:
          </label>
          <select
            id="filter-type"
            className="filter-select"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as 'THEORY' | 'LAB' | 'TUTORIAL' | '');
              setOffset(0);
            }}
          >
            <option value="">All Types</option>
            <option value="THEORY">Theory</option>
            <option value="LAB">Laboratory</option>
            <option value="TUTORIAL">Tutorial</option>
          </select>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredSubjects}
        keyExtractor={(s) => s.id}
        loading={loading}
        rowClassName={(s) => (!s.is_active ? 'row-inactive' : '')}
        actions={(sub) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Subject"
              onClick={() => openEditModal(sub)}
            >
              <Pencil size={15} />
            </button>
            {sub.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Subject"
                onClick={() => setDeactivatingSubject(sub)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Subject"
                onClick={() => handleReactivate(sub)}
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
        title={editingSubject ? 'Edit Subject' : 'Create Subject'}
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
                : editingSubject
                ? 'Save Changes'
                : 'Create Subject'}
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
            htmlFor="sub-dept"
            required
            error={formErrors.departmentId}
            helper={editingSubject ? 'Department cannot be modified after creation' : 'Offering academic department'}
          >
            <select
              id="sub-dept"
              className={`form-control ${formErrors.departmentId ? 'is-invalid' : ''}`}
              value={formDeptId}
              onChange={(e) => setFormDeptId(e.target.value)}
              disabled={Boolean(editingSubject) || formSubmitting}
              required
            >
              <option value="">Select Department</option>
              {departments
                .filter((d) => (editingSubject ? true : d.is_active))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name} {!d.is_active ? '(Inactive)' : ''}
                  </option>
                ))}
            </select>
          </FormField>

          <FormField
            label="Subject Code"
            htmlFor="sub-code"
            required
            error={formErrors.code}
            helper="Unique course catalog identifier (1-20 characters, e.g. CS301)"
          >
            <input
              id="sub-code"
              type="text"
              className={`form-control ${formErrors.code ? 'is-invalid' : ''}`}
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              maxLength={20}
              placeholder="e.g. CS301"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Subject Name"
            htmlFor="sub-name"
            required
            error={formErrors.name}
            helper="Complete descriptive title (1-150 characters)"
          >
            <input
              id="sub-name"
              type="text"
              className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={150}
              placeholder="e.g. Data Structures and Algorithms"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Subject Type"
            htmlFor="sub-type"
            required
            error={formErrors.type}
            helper="Instructional format category"
          >
            <select
              id="sub-type"
              className={`form-control ${formErrors.type ? 'is-invalid' : ''}`}
              value={formType}
              onChange={(e) => setFormType(e.target.value as 'THEORY' | 'LAB' | 'TUTORIAL')}
              required
              disabled={formSubmitting}
            >
              <option value="THEORY">Theory (Lecture)</option>
              <option value="LAB">Laboratory (Practical)</option>
              <option value="TUTORIAL">Tutorial (Problem Solving)</option>
            </select>
          </FormField>
        </form>
      </Modal>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingSubject)}
        onClose={() => setDeactivatingSubject(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Subject"
        message={`Are you sure you want to deactivate subject "${deactivatingSubject?.name}" (${deactivatingSubject?.code})?`}
        warningNote="Curriculum mappings and timetable slots using this subject will retain historical records."
        confirmLabel="Deactivate Subject"
        loading={deactivateLoading}
      />
    </div>
  );
};
