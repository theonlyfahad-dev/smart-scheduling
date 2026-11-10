import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  Section,
  Semester,
  Course,
  PaginatedResponse,
  CreateSectionInput,
  UpdateSectionInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const SectionsView: React.FC = () => {
  const [sections, setSections] = useState<Section[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semMap, setSemMap] = useState<Record<string, Semester>>({});
  const [courseMap, setCourseMap] = useState<Record<string, Course>>({});
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [formSemesterId, setFormSemesterId] = useState('');
  const [formName, setFormName] = useState('');
  const [formClassCode, setFormClassCode] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivate confirmation state
  const [deactivatingSection, setDeactivatingSection] = useState<Section | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Load courses and semesters for dropdown formatting
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [courseRes, semRes] = await Promise.all([
          apiClient.get<PaginatedResponse<Course>>('/admin/courses', {
            limit: 100,
            isActive: 'all',
            sortBy: 'name',
            sortOrder: 'asc',
          }),
          apiClient.get<PaginatedResponse<Semester>>('/admin/semesters', {
            limit: 100,
            isActive: 'all',
            sortBy: 'semester_number',
            sortOrder: 'asc',
          }),
        ]);

        const cMap: Record<string, Course> = {};
        courseRes.data.forEach((c) => {
          cMap[c.id] = c;
        });
        setCourseMap(cMap);

        setSemesters(semRes.data);
        const sMap: Record<string, Semester> = {};
        semRes.data.forEach((s) => {
          sMap[s.id] = s;
        });
        setSemMap(sMap);
      } catch {
        // Fallback
      }
    }
    loadMetadata();
  }, []);

  const fetchSections = useCallback(async () => {
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
      if (selectedSemesterId) queryParams.semesterId = selectedSemesterId;

      const res = await apiClient.get<PaginatedResponse<Section>>('/admin/sections', queryParams);
      setSections(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load sections');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive, selectedSemesterId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const openCreateModal = () => {
    setEditingSection(null);
    setFormSemesterId(selectedSemesterId || (semesters[0]?.id ?? ''));
    setFormName('');
    setFormClassCode('');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (sec: Section) => {
    setEditingSection(sec);
    setFormSemesterId(sec.semester_id);
    setFormName(sec.name);
    setFormClassCode(sec.class_code);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editingSection && !formSemesterId) {
      errors.semesterId = 'Semester is required';
    }
    const trimmedName = formName.trim();
    if (!trimmedName) {
      errors.name = 'Section name is required';
    } else if (trimmedName.length > 10) {
      errors.name = 'Section name cannot exceed 10 characters';
    }
    const trimmedCode = formClassCode.trim();
    if (!trimmedCode) {
      errors.classCode = 'Class code is required';
    } else if (trimmedCode.length > 30) {
      errors.classCode = 'Class code cannot exceed 30 characters';
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
      if (editingSection) {
        const payload: UpdateSectionInput = {
          name: formName.trim(),
          classCode: formClassCode.trim(),
        };
        await apiClient.patch<SingleResponse<Section>>(
          `/admin/sections/${editingSection.id}`,
          payload
        );
      } else {
        const payload: CreateSectionInput = {
          semesterId: formSemesterId,
          name: formName.trim(),
          classCode: formClassCode.trim(),
        };
        await apiClient.post<SingleResponse<Section>>('/admin/sections', payload);
      }
      setIsFormOpen(false);
      fetchSections();
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
        setFormErrors({ general: 'Unexpected error occurred while saving section' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingSection) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<Section>>(`/admin/sections/${deactivatingSection.id}`);
      setDeactivatingSection(null);
      fetchSections();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (sec: Section) => {
    try {
      await apiClient.post<SingleResponse<Section>>(`/admin/sections/${sec.id}/activate`);
      fetchSections();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  const getSemesterDescription = (semId: string) => {
    const sem = semMap[semId];
    if (!sem) return semId;
    const course = courseMap[sem.course_id];
    const courseLabel = course ? course.code : 'Course';
    return `${courseLabel} - Sem ${sem.semester_number} (${sem.academic_year} ${sem.term})`;
  };

  const filteredSections = sections.filter((s) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    const semDesc = getSemesterDescription(s.semester_id);
    return (
      s.name.toLowerCase().includes(term) ||
      s.class_code.toLowerCase().includes(term) ||
      semDesc.toLowerCase().includes(term)
    );
  });

  const columns: Column<Section>[] = [
    {
      header: 'Class Code',
      accessor: (s) => <strong style={{ fontFamily: 'monospace' }}>{s.class_code}</strong>,
      width: '140px',
    },
    {
      header: 'Section Name',
      accessor: (s) => `Section ${s.name}`,
      width: '130px',
    },
    {
      header: 'Semester Program',
      accessor: (s) => getSemesterDescription(s.semester_id),
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
          <h1 className="page-title">Sections</h1>
          <p className="page-subtitle">Class cohorts and student section schedules</p>
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
        addLabel="Add Section"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="filter-semester" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Semester:
          </label>
          <select
            id="filter-semester"
            className="filter-select"
            value={selectedSemesterId}
            onChange={(e) => {
              setSelectedSemesterId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All Semesters</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {getSemesterDescription(s.id)}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredSections}
        keyExtractor={(s) => s.id}
        loading={loading}
        rowClassName={(s) => (!s.is_active ? 'row-inactive' : '')}
        actions={(sec) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Section"
              onClick={() => openEditModal(sec)}
            >
              <Pencil size={15} />
            </button>
            {sec.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Section"
                onClick={() => setDeactivatingSection(sec)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Section"
                onClick={() => handleReactivate(sec)}
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
        title={editingSection ? 'Edit Section' : 'Create Section'}
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
                : editingSection
                ? 'Save Changes'
                : 'Create Section'}
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
            label="Semester"
            htmlFor="sec-sem"
            required
            error={formErrors.semesterId}
            helper={editingSection ? 'Semester cannot be changed after creation' : 'Target academic semester'}
          >
            <select
              id="sec-sem"
              className={`form-control ${formErrors.semesterId ? 'is-invalid' : ''}`}
              value={formSemesterId}
              onChange={(e) => setFormSemesterId(e.target.value)}
              disabled={Boolean(editingSection) || formSubmitting}
              required
            >
              <option value="">Select Semester</option>
              {semesters
                .filter((s) => (editingSection ? true : s.is_active))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {getSemesterDescription(s.id)} {!s.is_active ? '(Inactive)' : ''}
                  </option>
                ))}
            </select>
          </FormField>

          <FormField
            label="Section Name"
            htmlFor="sec-name"
            required
            error={formErrors.name}
            helper="Cohort letter or short name (1-10 characters, e.g. A, B, C)"
          >
            <input
              id="sec-name"
              type="text"
              className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={10}
              placeholder="e.g. A"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Class Code"
            htmlFor="sec-code"
            required
            error={formErrors.classCode}
            helper="Globally unique student schedule identifier (1-30 characters, e.g. CSE-3A)"
          >
            <input
              id="sec-code"
              type="text"
              className={`form-control ${formErrors.classCode ? 'is-invalid' : ''}`}
              value={formClassCode}
              onChange={(e) => setFormClassCode(e.target.value)}
              maxLength={30}
              placeholder="e.g. CSE-3A"
              required
              disabled={formSubmitting}
            />
          </FormField>
        </form>
      </Modal>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingSection)}
        onClose={() => setDeactivatingSection(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Section"
        message={`Are you sure you want to deactivate section "${deactivatingSection?.name}" (${deactivatingSection?.class_code})?`}
        warningNote="Timetable entries for this section will become inactive for student schedule lookups."
        confirmLabel="Deactivate Section"
        loading={deactivateLoading}
      />
    </div>
  );
};
