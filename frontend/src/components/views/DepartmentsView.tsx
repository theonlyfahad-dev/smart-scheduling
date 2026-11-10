import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  Department,
  PaginatedResponse,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const DepartmentsView: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [quickFilter, setQuickFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivate confirmation state
  const [deactivatingDept, setDeactivatingDept] = useState<Department | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await apiClient.get<PaginatedResponse<Department>>('/admin/departments', {
        limit,
        offset,
        isActive,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      setDepartments(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load departments');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const openCreateModal = () => {
    setEditingDepartment(null);
    setFormName('');
    setFormCode('');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingDepartment(dept);
    setFormName(dept.name);
    setFormCode(dept.code);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const trimmedName = formName.trim();
    const trimmedCode = formCode.trim();

    if (!trimmedName) {
      errors.name = 'Department name is required';
    } else if (trimmedName.length > 150) {
      errors.name = 'Name cannot exceed 150 characters';
    }

    if (!trimmedCode) {
      errors.code = 'Department code is required';
    } else if (trimmedCode.length > 20) {
      errors.code = 'Code cannot exceed 20 characters';
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
      if (editingDepartment) {
        const payload: UpdateDepartmentInput = {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
        };
        await apiClient.patch<SingleResponse<Department>>(
          `/admin/departments/${editingDepartment.id}`,
          payload
        );
      } else {
        const payload: CreateDepartmentInput = {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
        };
        await apiClient.post<SingleResponse<Department>>('/admin/departments', payload);
      }
      setIsFormOpen(false);
      fetchDepartments();
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
        setFormErrors({ general: 'Unexpected error occurred while saving department' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingDept) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<Department>>(`/admin/departments/${deactivatingDept.id}`);
      setDeactivatingDept(null);
      fetchDepartments();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (dept: Department) => {
    try {
      await apiClient.post<SingleResponse<Department>>(`/admin/departments/${dept.id}/activate`);
      fetchDepartments();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  // Client-side quick filter of currently loaded records
  const filteredDepartments = departments.filter((d) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    return d.name.toLowerCase().includes(term) || d.code.toLowerCase().includes(term);
  });

  const columns: Column<Department>[] = [
    {
      header: 'Code',
      accessor: (d) => <strong style={{ fontFamily: 'monospace' }}>{d.code}</strong>,
      width: '120px',
    },
    {
      header: 'Department Name',
      accessor: 'name',
    },
    {
      header: 'Status',
      accessor: (d) => (
        <span className={`status-pill ${d.is_active ? 'success' : 'danger'}`}>
          <span className="status-dot" />
          {d.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '120px',
    },
    {
      header: 'Created At',
      accessor: (d) => new Date(d.created_at).toLocaleDateString(),
      width: '140px',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle">Manage institutional academic faculties and departments</p>
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
        addLabel="Add Department"
      />

      <DataTable
        columns={columns}
        data={filteredDepartments}
        keyExtractor={(d) => d.id}
        loading={loading}
        rowClassName={(d) => (!d.is_active ? 'row-inactive' : '')}
        actions={(dept) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Department"
              onClick={() => openEditModal(dept)}
            >
              <Pencil size={15} />
            </button>
            {dept.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Department"
                onClick={() => setDeactivatingDept(dept)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Department"
                onClick={() => handleReactivate(dept)}
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
        title={editingDepartment ? 'Edit Department' : 'Create Department'}
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
                : editingDepartment
                ? 'Save Changes'
                : 'Create Department'}
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
            label="Department Code"
            htmlFor="dept-code"
            required
            error={formErrors.code}
            helper="Short unique code (1-20 characters, e.g. CSE, EEE, MECH)"
          >
            <input
              id="dept-code"
              type="text"
              className={`form-control ${formErrors.code ? 'is-invalid' : ''}`}
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              maxLength={20}
              placeholder="e.g. CSE"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Department Name"
            htmlFor="dept-name"
            required
            error={formErrors.name}
            helper="Full institutional name (1-150 characters)"
          >
            <input
              id="dept-name"
              type="text"
              className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={150}
              placeholder="e.g. Computer Science and Engineering"
              required
              disabled={formSubmitting}
            />
          </FormField>
        </form>
      </Modal>

      {/* Soft Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingDept)}
        onClose={() => setDeactivatingDept(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Department"
        message={`Are you sure you want to deactivate department "${deactivatingDept?.name}" (${deactivatingDept?.code})?`}
        warningNote="Historical courses, semesters, and timetable data linked to this department will be preserved, but new allocations will be restricted."
        confirmLabel="Deactivate Department"
        loading={deactivateLoading}
      />
    </div>
  );
};
