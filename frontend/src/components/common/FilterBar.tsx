import React from 'react';
import { Plus, Search } from 'lucide-react';

interface FilterBarProps {
  isActive: 'all' | 'true' | 'false';
  onIsActiveChange: (val: 'all' | 'true' | 'false') => void;
  quickFilterText: string;
  onQuickFilterChange: (val: string) => void;
  onAddClick?: () => void;
  addLabel?: string;
  children?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  isActive,
  onIsActiveChange,
  quickFilterText,
  onQuickFilterChange,
  onAddClick,
  addLabel = 'Add Record',
  children,
}) => {
  return (
    <div className="filter-bar">
      <div className="filter-row">
        <div className="filter-controls">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <label htmlFor="filter-status" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              Status:
            </label>
            <select
              id="filter-status"
              className="filter-select"
              value={isActive}
              onChange={(e) => onIsActiveChange(e.target.value as 'all' | 'true' | 'false')}
            >
              <option value="all">All Records</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>

          {children}

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: '0.625rem', color: '#94a3b8' }}
            />
            <input
              type="text"
              className="filter-input"
              style={{ paddingLeft: '2rem', width: '200px' }}
              placeholder="Filter page rows..."
              value={quickFilterText}
              onChange={(e) => onQuickFilterChange(e.target.value)}
              title="Quick client-side filter of loaded page records"
            />
          </div>
        </div>

        {onAddClick && (
          <button type="button" className="btn btn-primary" onClick={onAddClick}>
            <Plus size={16} />
            <span>{addLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};
