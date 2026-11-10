import React from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  warningNote?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  warningNote,
  confirmLabel = 'Deactivate',
  cancelLabel = 'Cancel',
  isDestructive = true,
  loading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {isDestructive && (
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '50%',
              backgroundColor: 'var(--color-danger-bg)',
              color: 'var(--color-danger-text)',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={24} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-main)', marginBottom: '0.75rem' }}>
            {message}
          </p>
          {warningNote && (
            <div className="alert alert-warning" style={{ marginBottom: 0 }}>
              <span style={{ fontSize: '0.8125rem' }}>{warningNote}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
