import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  Faculty,
  Department,
  PaginatedResponse,
  CreateFacultyInput,
  UpdateFacultyInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const FacultyView: React.FC = () => {
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
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
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [formDeptId, setFormDeptId] = useState('');
  const [formEmployeeCode, setFormEmployeeCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivate confirmation state
  const [deactivatingFaculty, setDeactivatingFaculty] = useState<Faculty | null>(null);
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

  const fetchFaculty = useCallback(async () => {
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

      const res = await apiClient.get<PaginatedResponse<Faculty>>('/admin/faculty', queryParams);
      setFacultyList(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load faculty directory');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive, selectedDeptId]);

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);

  const openCreateModal = () => {
    setEditingFaculty(null);
    setFormDeptId(selectedDeptId || (departments[0]?.id ?? ''));
    setFormEmployeeCode('');
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (fac: Faculty) => {
    setEditingFaculty(fac);
    setFormDeptId(fac.department_id);
    setFormEmployeeCode(fac.employee_code);
    setFormName(fac.name);
    setFormEmail(fac.email);
    setFormPhone(fac.phone || '');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editingFaculty && !formDeptId) {
      errors.departmentId = 'Department is required';
    }
    const trimmedEmpCode = formEmployeeCode.trim();
    if (!trimmedEmpCode) {
      errors.employeeCode = 'Employee code is required';
    } else if (trimmedEmpCode.length > 30) {
      errors.employeeCode = 'Employee code cannot exceed 30 characters';
    }
    const trimmedName = formName.trim();
    if (!trimmedName) {
      errors.name = 'Faculty name is required';
    } else if (trimmedName.length > 150) {
      errors.name = 'Faculty name cannot exceed 150 characters';
    }
    const trimmedEmail = formEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    } else if (trimmedEmail.length > 255) {
      errors.email = 'Email cannot exceed 255 characters';
    }
    if (formPhone.trim().length > 25) {
      errors.phone = 'Phone cannot exceed 25 characters';
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
      if (editingFaculty) {
        const payload: UpdateFacultyInput = {
          name: formName.trim(),
          employeeCode: formEmployeeCode.trim().toUpperCase(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || null,
        };
        await apiClient.patch<SingleResponse<Faculty>>(
          `/admin/faculty/${editingFaculty.id}`,
          payload
        );
      } else {
        const payload: CreateFacultyInput = {
          departmentId: formDeptId,
          employeeCode: formEmployeeCode.trim().toUpperCase(),
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || undefined,
        };
        await apiClient.post<SingleResponse<Faculty>>('/admin/faculty', payload);
      }
      setIsFormOpen(false);
      fetchFaculty();
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
        setFormErrors({ general: 'Unexpected error occurred while saving faculty' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingFaculty) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<Faculty>>(`/admin/faculty/${deactivatingFaculty.id}`);
      setDeactivatingFaculty(null);
      fetchFaculty();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (fac: Faculty) => {
    try {
      await apiClient.post<SingleResponse<Faculty>>(`/admin/faculty/${fac.id}/activate`);
      fetchFaculty();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  const filteredFaculty = facultyList.filter((f) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    const dept = deptMap[f.department_id];
    return (
      f.name.toLowerCase().includes(term) ||
      f.employee_code.toLowerCase().includes(term) ||
      f.email.toLowerCase().includes(term) ||
      (f.phone && f.phone.includes(term)) ||
      (dept && (dept.name.toLowerCase().includes(term) || dept.code.toLowerCase().includes(term)))
    );
  });

  const columns: Column<Faculty>[] = [
    {
      header: 'Employee Code',
      accessor: (f) => <strong style={{ fontFamily: 'monospace' }}>{f.employee_code}</strong>,
      width: '140px',
    },
    {
      header: 'Faculty Name',
      accessor: 'name',
    },
    {
      header: 'Department',
      accessor: (f) => {
        const d = deptMap[f.department_id];
        return d ? `${d.code} — ${d.name}` : f.department_id;
      },
    },
    {
      header: 'Email Address',
      accessor: 'email',
    },
    {
      header: 'Phone',
      accessor: (f) => f.phone || <span style={{ color: '#94a3b8' }}>—</span>,
      width: '130px',
    },
    {
      header: 'Status',
      accessor: (f) => (
        <span className={`status-pill ${f.is_active ? 'success' : 'danger'}`}>
          <span className="status-dot" />
          {f.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '110px',
    },
    {
      header: 'Created At',
      accessor: (f) => new Date(f.created_at).toLocaleDateString(),
      width: '130px',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Faculty</h1>
          <p className="page-subtitle">Academic instructors and department faculty directory</p>
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
        addLabel="Add Faculty"
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
        data={filteredFaculty}
        keyExtractor={(f) => f.id}
        loading={loading}
        rowClassName={(f) => (!f.is_active ? 'row-inactive' : '')}
        actions={(fac) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Faculty Member"
              onClick={() => openEditModal(fac)}
            >
              <Pencil size={15} />
            </button>
            {fac.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Faculty"
                onClick={() => setDeactivatingFaculty(fac)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Faculty"
                onClick={() => handleReactivate(fac)}
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
        title={editingFaculty ? 'Edit Faculty' : 'Add Faculty'}
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
                : editingFaculty
                ? 'Save Changes'
                : 'Add Faculty'}
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
            htmlFor="fac-dept"
            required
            error={formErrors.departmentId}
            helper={editingFaculty ? 'Department cannot be modified after creation' : 'Primary academic department'}
          >
            <select
              id="fac-dept"
              className={`form-control ${formErrors.departmentId ? 'is-invalid' : ''}`}
              value={formDeptId}
              onChange={(e) => setFormDeptId(e.target.value)}
              disabled={Boolean(editingFaculty) || formSubmitting}
              required
            >
              <option value="">Select Department</option>
              {departments
                .filter((d) => (editingFaculty ? true : d.is_active))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name} {!d.is_active ? '(Inactive)' : ''}
                  </option>
                ))}
            </select>
          </FormField>

          <FormField
            label="Employee Code"
            htmlFor="fac-emp-code"
            required
            error={formErrors.employeeCode}
            helper="Unique institutional payroll or employee ID (1-30 characters, e.g. FAC-CSE-101)"
          >
            <input
              id="fac-emp-code"
              type="text"
              className={`form-control ${formErrors.employeeCode ? 'is-invalid' : ''}`}
              value={formEmployeeCode}
              onChange={(e) => setFormEmployeeCode(e.target.value.toUpperCase())}
              maxLength={30}
              placeholder="e.g. FAC-CSE-101"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Full Name"
            htmlFor="fac-name"
            required
            error={formErrors.name}
            helper="Instructor full name (1-150 characters)"
          >
            <input
              id="fac-name"
              type="text"
              className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={150}
              placeholder="e.g. Dr. Jane Smith"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Institutional Email"
            htmlFor="fac-email"
            required
            error={formErrors.email}
            helper="Unique official email address (up to 255 characters)"
          >
            <input
              id="fac-email"
              type="email"
              className={`form-control ${formErrors.email ? 'is-invalid' : ''}`}
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value.toLowerCase())}
              maxLength={255}
              placeholder="e.g. janesmith@institution.edu"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Phone Number"
            htmlFor="fac-phone"
            error={formErrors.phone}
            helper="Optional contact number (up to 25 characters)"
          >
            <input
              id="fac-phone"
              type="tel"
              className={`form-control ${formErrors.phone ? 'is-invalid' : ''}`}
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              maxLength={25}
              placeholder="e.g. +1 555-019-2834"
              disabled={formSubmitting}
            />
          </FormField>
        </form>
      </Modal>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingFaculty)}
        onClose={() => setDeactivatingFaculty(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Faculty Member"
        message={`Are you sure you want to deactivate faculty member "${deactivatingFaculty?.name}" (${deactivatingFaculty?.employee_code})?`}
        warningNote="SECURITY WARNING: Deactivating an instructor account will automatically deactivate linked system user accounts and immediately revoke all active user sessions."
        confirmLabel="Deactivate Faculty"
        loading={deactivateLoading}
      />
    </div>
  );
};
