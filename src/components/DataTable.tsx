'use client';

import { useState, useMemo, useCallback } from 'react';
import type { SortDirection } from '@/types';

interface Column<T> {
  key: keyof T & string;
  header: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  onRowSelect?: (selectedIds: string[]) => void;
  onRowClick?: (row: T) => void;
  searchable?: boolean;
  exportable?: boolean;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  pageSize = 10,
  onRowSelect,
  onRowClick,
  searchable = true,
  exportable = false,
}: DataTableProps<T>) {
  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchColumn, setSearchColumn] = useState<string>('all');

  // --- Sort state ---
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // --- Pagination state ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(pageSize);

  // --- Selection state ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // --- Column visibility state ---
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // --- Filter/search logic ---
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;

    return data.filter((row) => {
      if (searchColumn === 'all') {
        return columns.some((col) => {
          const value = row[col.key];
          if (value == null) return false;
          return String(value).toLowerCase().includes(searchQuery.toLowerCase());
        });
      }
      const value = row[searchColumn as keyof T];
      if (value == null) return false;
      return String(value).toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [data, searchQuery, searchColumn, columns]);

  // --- Sort logic ---
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn as keyof T];
      const bVal = b[sortColumn as keyof T];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
      if (bVal == null) return sortDirection === 'asc' ? 1 : -1;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection]);

  // --- Pagination logic ---
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  // --- Visible columns ---
  const visibleColumns = useMemo(
    () => columns.filter((col) => !hiddenColumns.has(col.key)),
    [columns, hiddenColumns]
  );

  // --- Handlers ---
  const handleSort = useCallback(
    (columnKey: string) => {
      if (sortColumn === columnKey) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(columnKey);
        setSortDirection('asc');
      }
      setCurrentPage(1);
    },
    [sortColumn]
  );

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set());
      onRowSelect?.([]);
    } else {
      const allIds = new Set(paginatedData.map((row) => row.id));
      setSelectedIds(allIds);
      onRowSelect?.(Array.from(allIds));
    }
  }, [paginatedData, selectedIds.size, onRowSelect]);

  const handleSelectRow = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        onRowSelect?.(Array.from(next));
        return next;
      });
    },
    [onRowSelect]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
      }
    },
    [totalPages]
  );

  const handleItemsPerPageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setItemsPerPage(Number(e.target.value));
      setCurrentPage(1);
    },
    []
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setCurrentPage(1);
    },
    []
  );

  const handleSearchColumnChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSearchColumn(e.target.value);
      setCurrentPage(1);
    },
    []
  );

  const toggleColumnVisibility = useCallback((columnKey: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const headers = visibleColumns.map((col) => col.header).join(',');
    const rows = sortedData.map((row) =>
      visibleColumns
        .map((col) => {
          const value = row[col.key];
          if (value == null) return '';
          const str = String(value);
          return str.includes(',') ? `"${str}"` : str;
        })
        .join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedData, visibleColumns]);

  // --- Pagination range ---
  const getPageNumbers = useCallback(() => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages]);

  // --- Render ---
  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#f9fafb',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        {searchable && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={searchColumn}
              onChange={handleSearchColumnChange}
              style={{
                padding: '0.4rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '0.875rem',
              }}
            >
              <option value="all">All columns</option>
              {columns.map((col) => (
                <option key={col.key} value={col.key}>
                  {col.header}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search..."
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '0.875rem',
                minWidth: '200px',
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Columns
            </button>
            {showColumnPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.25rem',
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  zIndex: 10,
                  minWidth: '180px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}
              >
                {columns.map((col) => (
                  <label
                    key={col.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.key)}
                      onChange={() => toggleColumnVisibility(col.key)}
                    />
                    {col.header}
                  </label>
                ))}
              </div>
            )}
          </div>
          {exportable && (
            <button
              onClick={handleExport}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Export CSV
            </button>
          )}
          {selectedIds.size > 0 && (
            <span style={{ fontSize: '0.875rem', color: '#3b82f6' }}>
              {selectedIds.size} selected
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb' }}>
              {onRowSelect && (
                <th style={{ padding: '0.75rem 1rem', width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={paginatedData.length > 0 && selectedIds.size === paginatedData.length}
                    onChange={handleSelectAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  style={{
                    padding: '0.75rem 1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#6b7280',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    width: col.width,
                    borderBottom: '2px solid #e0e0e0',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    {col.header}
                    {col.sortable && sortColumn === col.key && (
                      <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (onRowSelect ? 1 : 0)}
                  style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}
                >
                  No data found
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderBottom: '1px solid #e0e0e0',
                    backgroundColor: selectedIds.has(row.id)
                      ? '#eff6ff'
                      : rowIndex % 2 === 0
                        ? '#ffffff'
                        : '#f9fafb',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background-color 0.1s',
                  }}
                >
                  {onRowSelect && (
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => handleSelectRow(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select row ${row.id}`}
                      />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: '0.75rem 1rem',
                        fontSize: '0.875rem',
                        color: '#374151',
                      }}
                    >
                      {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#f9fafb',
          fontSize: '0.875rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#6b7280' }}>Rows per page:</span>
          <select
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>
            {(currentPage - 1) * itemsPerPage + 1}–
            {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '4px',
              border: '1px solid #ddd',
              backgroundColor: '#fff',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1,
            }}
          >
            ←
          </button>
          {getPageNumbers().map((page, index) =>
            typeof page === 'string' ? (
              <span
                key={`ellipsis-${index}`}
                style={{ padding: '0.4rem 0.5rem', color: '#6b7280' }}
              >
                {page}
              </span>
            ) : (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  border: page === currentPage ? '2px solid #3b82f6' : '1px solid #ddd',
                  backgroundColor: page === currentPage ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  fontWeight: page === currentPage ? 600 : 400,
                }}
              >
                {page}
              </button>
            )
          )}
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '4px',
              border: '1px solid #ddd',
              backgroundColor: '#fff',
              cursor:
                currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages || totalPages === 0 ? 0.5 : 1,
            }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
