import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type {
  Classroom,
  PaginatedResponse,
  CreateClassroomInput,
  UpdateClassroomInput,
  SingleResponse,
} from '../../api/types';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { FilterBar } from '../common/FilterBar';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormField } from '../common/FormField';
import { Pencil, Trash2, RotateCw, AlertTriangle } from 'lucide-react';

export const ClassroomsView: React.FC = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all');
  const [selectedType, setSelectedType] = useState<'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM' | ''>('');
  const [quickFilter, setQuickFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [formBuildingBlock, setFormBuildingBlock] = useState('');
  const [formRoomNumber, setFormRoomNumber] = useState('');
  const [formType, setFormType] = useState<'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM'>('LECTURE_HALL');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Deactivate confirmation state
  const [deactivatingRoom, setDeactivatingRoom] = useState<Classroom | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const fetchClassrooms = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const queryParams: Record<string, unknown> = {
        limit,
        offset,
        isActive,
        sortBy: 'building_block',
        sortOrder: 'asc',
      };
      if (selectedType) queryParams.type = selectedType;

      const res = await apiClient.get<PaginatedResponse<Classroom>>('/admin/classrooms', queryParams);
      setClassrooms(res.data);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to load classrooms');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, isActive, selectedType]);

  useEffect(() => {
    fetchClassrooms();
  }, [fetchClassrooms]);

  const openCreateModal = () => {
    setEditingClassroom(null);
    setFormBuildingBlock('');
    setFormRoomNumber('');
    setFormType('LECTURE_HALL');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (room: Classroom) => {
    setEditingClassroom(room);
    setFormBuildingBlock(room.building_block);
    setFormRoomNumber(room.room_number);
    setFormType(room.type);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const trimmedBlock = formBuildingBlock.trim();
    if (!trimmedBlock) {
      errors.buildingBlock = 'Building block is required';
    } else if (trimmedBlock.length > 50) {
      errors.buildingBlock = 'Building block cannot exceed 50 characters';
    }

    const trimmedNumber = formRoomNumber.trim();
    if (!trimmedNumber) {
      errors.roomNumber = 'Room number is required';
    } else if (trimmedNumber.length > 30) {
      errors.roomNumber = 'Room number cannot exceed 30 characters';
    }

    if (!['LECTURE_HALL', 'LAB', 'SEMINAR_ROOM'].includes(formType)) {
      errors.type = "Type must be 'LECTURE_HALL', 'LAB', or 'SEMINAR_ROOM'";
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
      if (editingClassroom) {
        const payload: UpdateClassroomInput = {
          buildingBlock: formBuildingBlock.trim(),
          roomNumber: formRoomNumber.trim(),
          type: formType,
        };
        await apiClient.patch<SingleResponse<Classroom>>(
          `/admin/classrooms/${editingClassroom.id}`,
          payload
        );
      } else {
        const payload: CreateClassroomInput = {
          buildingBlock: formBuildingBlock.trim(),
          roomNumber: formRoomNumber.trim(),
          type: formType,
        };
        await apiClient.post<SingleResponse<Classroom>>('/admin/classrooms', payload);
      }
      setIsFormOpen(false);
      fetchClassrooms();
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
        setFormErrors({ general: 'Unexpected error occurred while saving classroom' });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingRoom) return;
    setDeactivateLoading(true);
    try {
      await apiClient.delete<SingleResponse<Classroom>>(`/admin/classrooms/${deactivatingRoom.id}`);
      setDeactivatingRoom(null);
      fetchClassrooms();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleReactivate = async (room: Classroom) => {
    try {
      await apiClient.post<SingleResponse<Classroom>>(`/admin/classrooms/${room.id}/activate`);
      fetchClassrooms();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      }
    }
  };

  const filteredClassrooms = classrooms.filter((r) => {
    if (!quickFilter.trim()) return true;
    const term = quickFilter.toLowerCase();
    return (
      r.building_block.toLowerCase().includes(term) ||
      r.room_number.toLowerCase().includes(term) ||
      r.type.toLowerCase().includes(term)
    );
  });

  const columns: Column<Classroom>[] = [
    {
      header: 'Building Block',
      accessor: 'building_block',
    },
    {
      header: 'Room Number',
      accessor: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.room_number}</strong>,
      width: '130px',
    },
    {
      header: 'Facility Type',
      accessor: (r) => (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            backgroundColor:
              r.type === 'LAB'
                ? '#fef3c7'
                : r.type === 'SEMINAR_ROOM'
                ? '#f3e8ff'
                : '#e0f2fe',
            color:
              r.type === 'LAB'
                ? '#92400e'
                : r.type === 'SEMINAR_ROOM'
                ? '#6b21a8'
                : '#0369a1',
          }}
        >
          {r.type.replace('_', ' ')}
        </span>
      ),
      width: '140px',
    },
    {
      header: 'Status',
      accessor: (r) => (
        <span className={`status-pill ${r.is_active ? 'success' : 'danger'}`}>
          <span className="status-dot" />
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '110px',
    },
    {
      header: 'Created At',
      accessor: (r) => new Date(r.created_at).toLocaleDateString(),
      width: '130px',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Classrooms</h1>
          <p className="page-subtitle">Campus facilities, physical lecture halls, and laboratories</p>
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
        addLabel="Add Classroom"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="filter-type" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Facility Type:
          </label>
          <select
            id="filter-type"
            className="filter-select"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM' | '');
              setOffset(0);
            }}
          >
            <option value="">All Types</option>
            <option value="LECTURE_HALL">Lecture Hall</option>
            <option value="LAB">Laboratory</option>
            <option value="SEMINAR_ROOM">Seminar Room</option>
          </select>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredClassrooms}
        keyExtractor={(r) => r.id}
        loading={loading}
        rowClassName={(r) => (!r.is_active ? 'row-inactive' : '')}
        actions={(room) => (
          <>
            <button
              type="button"
              className="btn-icon"
              title="Edit Classroom"
              onClick={() => openEditModal(room)}
            >
              <Pencil size={15} />
            </button>
            {room.is_active ? (
              <button
                type="button"
                className="btn-icon danger"
                title="Deactivate Classroom"
                onClick={() => setDeactivatingRoom(room)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon success"
                title="Reactivate Classroom"
                onClick={() => handleReactivate(room)}
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
        title={editingClassroom ? 'Edit Classroom' : 'Add Classroom'}
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
                : editingClassroom
                ? 'Save Changes'
                : 'Add Classroom'}
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
            label="Building / Block"
            htmlFor="room-block"
            required
            error={formErrors.buildingBlock}
            helper="Campus complex or academic block (1-50 characters, e.g. Block A, Main Wing)"
          >
            <input
              id="room-block"
              type="text"
              className={`form-control ${formErrors.buildingBlock ? 'is-invalid' : ''}`}
              value={formBuildingBlock}
              onChange={(e) => setFormBuildingBlock(e.target.value)}
              maxLength={50}
              placeholder="e.g. Science Block"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Room Number / Designation"
            htmlFor="room-num"
            required
            error={formErrors.roomNumber}
            helper="Physical door or room number (1-30 characters, e.g. 101, Lab-2B)"
          >
            <input
              id="room-num"
              type="text"
              className={`form-control ${formErrors.roomNumber ? 'is-invalid' : ''}`}
              value={formRoomNumber}
              onChange={(e) => setFormRoomNumber(e.target.value)}
              maxLength={30}
              placeholder="e.g. 304"
              required
              disabled={formSubmitting}
            />
          </FormField>

          <FormField
            label="Facility Type"
            htmlFor="room-type"
            required
            error={formErrors.type}
            helper="Room purpose and layout configuration"
          >
            <select
              id="room-type"
              className={`form-control ${formErrors.type ? 'is-invalid' : ''}`}
              value={formType}
              onChange={(e) => setFormType(e.target.value as 'LECTURE_HALL' | 'LAB' | 'SEMINAR_ROOM')}
              required
              disabled={formSubmitting}
            >
              <option value="LECTURE_HALL">Lecture Hall</option>
              <option value="LAB">Laboratory</option>
              <option value="SEMINAR_ROOM">Seminar Room</option>
            </select>
          </FormField>
        </form>
      </Modal>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingRoom)}
        onClose={() => setDeactivatingRoom(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Classroom"
        message={`Are you sure you want to deactivate room "${deactivatingRoom?.building_block} - ${deactivatingRoom?.room_number}"?`}
        warningNote="Room allocations in existing timetable periods will be preserved in historical records."
        confirmLabel="Deactivate Classroom"
        loading={deactivateLoading}
      />
    </div>
  );
};
