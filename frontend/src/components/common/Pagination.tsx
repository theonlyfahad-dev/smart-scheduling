import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
  onLimitChange: (newLimit: number) => void;
  disabled?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  total,
  limit,
  offset,
  onPageChange,
  onLimitChange,
  disabled = false,
}) => {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const startRecord = total === 0 ? 0 : offset + 1;
  const endRecord = Math.min(offset + limit, total);

  const canGoPrevious = offset > 0 && !disabled;
  const canGoNext = offset + limit < total && !disabled;

  const handlePrevious = () => {
    if (canGoPrevious) {
      onPageChange(Math.max(0, offset - limit));
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      onPageChange(offset + limit);
    }
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLimit = parseInt(e.target.value, 10);
    onLimitChange(newLimit);
    onPageChange(0); // Reset to first page
  };

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing <strong>{startRecord}</strong>–<strong>{endRecord}</strong> of{' '}
        <strong>{total}</strong> records
      </div>

      <div className="pagination-controls">
        <label htmlFor="pagination-limit" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          Per page:
        </label>
        <select
          id="pagination-limit"
          className="filter-select"
          style={{ height: '32px', padding: '0 0.5rem' }}
          value={limit}
          onChange={handleLimitChange}
          disabled={disabled}
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>

        <span style={{ fontSize: '0.8125rem', margin: '0 0.5rem' }}>
          Page {currentPage} of {totalPages}
        </span>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handlePrevious}
          disabled={!canGoPrevious}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleNext}
          disabled={!canGoNext}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
