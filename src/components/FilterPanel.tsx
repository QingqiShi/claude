'use client';

import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

const CATEGORIES = ['All', 'Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books'];
const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'price-asc', label: 'Price (Low-High)' },
  { value: 'price-desc', label: 'Price (High-Low)' },
  { value: 'newest', label: 'Newest First' },
];

interface FilterPanelProps {
  onFiltersChange: (filters: { category: string; sort: string; search: string }) => void;
}

export function FilterPanel({ onFiltersChange }: FilterPanelProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeSort, setActiveSort] = useState('newest');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Notify parent when debounced search or immediate filters change
  useEffect(() => {
    onFiltersChange({
      category: activeCategory === 'All' ? '' : activeCategory,
      sort: activeSort,
      search: debouncedSearch,
    });
  }, [activeCategory, activeSort, debouncedSearch, onFiltersChange]);

  return (
    <div style={{ padding: '1rem', borderBottom: '1px solid #e0e0e0' }}>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search products..."
          style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '16px',
                border: activeCategory === cat ? '2px solid #3b82f6' : '1px solid #ddd',
                backgroundColor: activeCategory === cat ? '#eff6ff' : '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <select
          value={activeSort}
          onChange={(e) => setActiveSort(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
