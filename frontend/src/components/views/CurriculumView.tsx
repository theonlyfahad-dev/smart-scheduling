import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  CourseSubject,
  Department,
  Course,
  Subject,
  PaginatedResponse,
  CreateCourseSubjectInput,
  UpdateCourseSubjectInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const CurriculumView: React.FC = () => {
  const [curriculumList, setCurriculumList] = useState<CourseSubject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptMap, setDeptMap] = useState<Record<string, Department>>({});
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseMap, setCourseMap] = useState<Record<string, Course>>({});
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectMap, setSubjectMap] = useState<Record<string, Subject>>({});

  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedSemNumber, setSelectedSemNumber] = useState<number | ''>('');
  const [quickFilter, setQuickFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<CourseSubject | null>(null);
  const [formDeptId, setFormDeptId] = useState('');
  const [formCourseId, setFormCourseId] = useState('');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formSemesterNumber, setFormSemesterNumber] = useState<number>(1);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivate confirmation state
  const [deactivatingMapping, setDeactivatingMapping] = useState<CourseSubject | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Load departments, courses, subjects for lookups and dynamic dropdowns
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [deptRes, courseRes, subRes] = await Promise.all([
          apiClient.get<PaginatedResponse<Department>>('/admin/departments', {
            limit: 100,
            isActive: 'all',
            sortBy: 'name',
            sortOrder: 'asc',
          }),
          apiClient.get<PaginatedResponse<Course>>('/admin/courses', {
            limit: 100,
            isActive: 'all',
            sortBy: 'name',
            sortOrder: 'asc',
          }),
          apiClient.get<PaginatedResponse<Subject>>('/admin/subjects', {
            limit: 100,
            isActive: 'all',
            sortBy: 'name',
            sortOrder: 'asc',
          }),
        ]);

        setDepartments(deptRes.data);
        const dMap: Record<string, Department> = {};
        deptRes.data.forEach((d) => (dMap[d.id] = d));
        setDeptMap(dMap);

        setCourses(courseRes.data);
        const cMap: Record<string, Course> = {};
        courseRes.data.forEach((c) => (cMap[c.id] = c));
        setCourseMap(cMap);

        setSubjects(subRes.data);
        const sMap: Record<string, Subject> = {};
        subRes.data.forEach((s) => (sMap[s.id] = s));
        setSubjectMap(sMap);
      } catch {
        // Fallback
      }
    }
    loadMetadata();
  }, []);

  const fetchCurriculum = useCallback(async () => {
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
      if (selectedDeptId) queryParams.departmentId = selectedDeptId;
      if (selectedCourseId) queryParams.courseId = selectedCourseId;
      if (selectedSemNumber !== '') queryParams.semesterNumber = selectedSemNumber;

      const res = await apiClient.get<PaginatedResponse<CourseSubject>>(
        '/admin/curriculum',
        queryParams
      );
      setCurriculumList(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load curriculum mappings');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive, selectedDeptId, selectedCourseId, selectedSemNumber]);

  useEffect(() => {
    fetchCurriculum();
  }, [fetchCurriculum]);

  // Handle department change in form to reset course & subject selections
  const handleFormDeptChange = (deptId: string) => {
    setFormDeptId(deptId);
    setFormCourseId('');
    setFormSubjectId('');
  };

  const openCreateModal = () => {
    setEditingMapping(null);
    const initialDeptId = selectedDeptId || (departments[0]?.id ?? '');
    setFormDeptId(initialDeptId);
    setFormCourseId('');
    setFormSubjectId('');
    setFormSemesterNumber(1);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (mapping: CourseSubject) => {
    setEditingMapping(mapping);
    setFormDeptId(mapping.department_id);
    setFormCourseId(mapping.course_id);
    setFormSubjectId(mapping.subject_id);
    setFormSemesterNumber(mapping.semester_number);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editingMapping) {
      if (!formDeptId) errors.departmentId = 'Department is required';
      if (!formCourseId) errors.courseId = 'Course is required';
      if (!formSubjectId) errors.subjectId = 'Subject is required';
    }
    if (!formSemesterNumber || formSemesterNumber < 1 || formSemesterNumber > 12) {
      errors.semesterNumber = 'Semester number must be between 1 and 12';
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
      if (editingMapping) {
        const payload: UpdateCourseSubjectInput = {
          semesterNumber: Number(formSemesterNumber),
        };
        await apiClient.patch<SingleResponse<CourseSubject>>(
          `/admin/curriculum/${editingMapping.id}`,
          payload
        );
      } else {
        const payload: CreateCourseSubjectInput = {
          departmentId: formDeptId,
          courseId: formCourseId,
          subjectId: formSubjectId,
          semesterNumber: Number(formSemesterNumber),
        };
        await apiClient.post<SingleResponse<CourseSubject>>('/admin/curriculum', payload);
      }
      setIsFormOpen(false);
      fetchCurriculum();
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
        setFormErrors({ general: 'Unexpected error occurred while saving curriculum mapping' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingMapping) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<CourseSubject>>(
        `/admin/curriculum/${deactivatingMapping.id}`
      );
      setDeactivatingMapping(null);
      fetchCurriculum();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (mapping: CourseSubject) => {
    try {
      await apiClient.post<SingleResponse<CourseSubject>>(
        `/admin/curriculum/${mapping.id}/activate`
      );
      fetchCurriculum();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  // Filter available courses and subjects by currently chosen form department
  const availableCoursesForDept = courses.filter(
    (c) => c.department_id === formDeptId && (editingMapping ? true : c.is_active)
  );

  const availableSubjectsForDept = subjects.filter(
    (s) => s.department_id === formDeptId && (editingMapping ? true : s.is_active)
  );

  const filteredCurriculum = curriculumList.filter((m) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    const course = courseMap[m.course_id];
    const subject = subjectMap[m.subject_id];
    const dept = deptMap[m.department_id];
    return (
      `sem ${m.semester_number}`.includes(term) ||
      (course && (course.code.toLowerCase().includes(term) || course.name.toLowerCase().includes(term))) ||
      (subject && (subject.code.toLowerCase().includes(term) || subject.name.toLowerCase().includes(term))) ||
      (dept && dept.code.toLowerCase().includes(term))
    );
  });

  const columns: Column<CourseSubject>[] = [
    {
      header: 'Course Program',
      accessor: (m) => {
        const c = courseMap[m.course_id];
        return c ? <strong>{c.code} — {c.name}</strong> : m.course_id;
      },
    },
    {
      header: 'Semester',
      accessor: (m) => `Semester ${m.semester_number}`,
      width: '120px',
    },
    {
      header: 'Subject',
      accessor: (m) => {
        const s = subjectMap[m.subject_id];
        return s ? `${s.code} — ${s.name} (${s.type})` : m.subject_id;
      },
    },
    {
      header: 'Department',
      accessor: (m) => {
        const d = deptMap[m.department_id];
        return d ? d.code : m.department_id;
      },
      width: '110px',
    },
    {
      header: 'Status',
      accessor: (m) => (
        <span className={`status-pill ${m.is_active ? 'success' : 'danger'}`}>
          <span className="status-dot" />
          {m.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '110px',
    },
    {
      header: 'Created At',
      accessor: (m) => new Date(m.created_at).toLocaleDateString(),
      width: '130px',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Curriculum Mappings</h1>
          <p className="page-subtitle">Degree course and subject allocations per semester</p>
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
        addLabel="Add Curriculum Mapping"
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
              setSelectedCourseId('');
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
            {courses
              .filter((c) => !selectedDeptId || c.department_id === selectedDeptId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="filter-sem" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Semester:
          </label>
          <select
            id="filter-sem"
            className="filter-select"
            value={selectedSemNumber}
            onChange={(e) => {
              setSelectedSemNumber(e.target.value ? Number(e.target.value) : '');
              setOffset(0);
            }}
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
              <option key={num} value={num}>
                Semester {num}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredCurriculum}
        keyExtractor={(m) => m.id}
        loading={loading}
        rowClassName={(m) => (!m.is_active ? 'row-inactive' : '')}
        actions={(mapping) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Curriculum Mapping"
              onClick={() => openEditModal(mapping)}
            >
              <Pencil size={15} />
            </button>
            {mapping.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Curriculum Mapping"
                onClick={() => setDeactivatingMapping(mapping)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Curriculum Mapping"
                onClick={() => handleReactivate(mapping)}
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
        title={editingMapping ? 'Edit Curriculum Mapping' : 'Add Curriculum Mapping'}
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
                : editingMapping
                ? 'Save Changes'
                : 'Add Mapping'}
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
            htmlFor="curr-dept"
            required
            error={formErrors.departmentId}
            helper={
              editingMapping
                ? 'Department cannot be changed after creation'
                : 'Select department to filter available courses and subjects'
            }
          >
            <select
              id="curr-dept"
              className={`form-control ${formErrors.departmentId ? 'is-invalid' : ''}`}
              value={formDeptId}
              onChange={(e) => handleFormDeptChange(e.target.value)}
              disabled={Boolean(editingMapping) || formSubmitting}
              required
            >
              <option value="">Select Department</option>
              {departments
                .filter((d) => (editingMapping ? true : d.is_active))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name} {!d.is_active ? '(Inactive)' : ''}
                  </option>
                ))}
            </select>
          </FormField>

          <FormField
            label="Course Program"
            htmlFor="curr-course"
            required
            error={formErrors.courseId}
            helper={editingMapping ? 'Course cannot be changed after creation' : 'Degree course program'}
          >
            <select
              id="curr-course"
              className={`form-control ${formErrors.courseId ? 'is-invalid' : ''}`}
              value={formCourseId}
              onChange={(e) => setFormCourseId(e.target.value)}
              disabled={Boolean(editingMapping) || formSubmitting || !formDeptId}
              required
            >
              <option value="">
                {!formDeptId ? 'Select Department first' : 'Select Course'}
              </option>
              {availableCoursesForDept.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Subject"
            htmlFor="curr-subject"
            required
            error={formErrors.subjectId}
            helper={editingMapping ? 'Subject cannot be changed after creation' : 'Catalog subject to allocate'}
          >
            <select
              id="curr-subject"
              className={`form-control ${formErrors.subjectId ? 'is-invalid' : ''}`}
              value={formSubjectId}
              onChange={(e) => setFormSubjectId(e.target.value)}
              disabled={Boolean(editingMapping) || formSubmitting || !formDeptId}
              required
            >
              <option value="">
                {!formDeptId ? 'Select Department first' : 'Select Subject'}
              </option>
              {availableSubjectsForDept.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name} ({s.type})
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Semester Number"
            htmlFor="curr-sem"
            required
            error={formErrors.semesterNumber}
            helper="Semester in which this subject is taught (1 to 12)"
          >
            <input
              id="curr-sem"
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
        </form>
      </Modal>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingMapping)}
        onClose={() => setDeactivatingMapping(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Curriculum Mapping"
        message="Are you sure you want to deactivate this curriculum allocation?"
        warningNote="Historical scheduling allocations for this course-subject pair will be preserved."
        confirmLabel="Deactivate Mapping"
        loading={deactivateLoading}
      />
    </div>
  );
};
