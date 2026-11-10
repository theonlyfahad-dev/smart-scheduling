import React from 'react';

export interface Column<T> {
  header: string;
  accessor?: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  actions?: (row: T) => React.ReactNode;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = 'No records found matching the current criteria.',
  actions,
  rowClassName,
}: DataTableProps<T>): React.ReactElement {
  if (loading) {
    return (
      <div className="table-container">
        <div className="empty-state">
          <p className="empty-title">Loading data...</p>
          <p className="empty-desc">Fetching institutional records from the server</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="table-container">
        <div className="empty-state">
          <p className="empty-title">No Records</p>
          <p className="empty-desc">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} style={{ width: col.width }} className={col.className}>
                  {col.header}
                </th>
              ))}
              {actions && <th style={{ width: '120px' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const rowKey = keyExtractor(row);
              const customClass = rowClassName ? rowClassName(row) : '';
              return (
                <tr key={rowKey} className={customClass}>
                  {columns.map((col, idx) => {
                    let cellContent: React.ReactNode = null;
                    if (typeof col.accessor === 'function') {
                      cellContent = col.accessor(row);
                    } else if (col.accessor) {
                      cellContent = String(row[col.accessor] ?? '');
                    }
                    return (
                      <td key={idx} className={col.className}>
                        {cellContent}
                      </td>
                    );
                  })}
                  {actions && (
                    <td>
                      <div className="table-actions">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
