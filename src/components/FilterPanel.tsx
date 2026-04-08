'use client';

import { useState } from 'react';

const CATEGORIES = ['All', 'Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books'];
const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'price-asc', label: 'Price (Low-High)' },
  { value: 'price-desc', label: 'Price (High-Low)' },
  { value: 'newest', label: 'Newest First' },
];

interface FilterPanelProps {
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: string) => void;
  onSearchChange: (search: string) => void;
}

export function FilterPanel({ onCategoryChange, onSortChange, onSearchChange }: FilterPanelProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeSort, setActiveSort] = useState('newest');
  const [searchTerm, setSearchTerm] = useState('');

  const handleCategoryClick = (category: string) => {
    setActiveCategory(category);
    onCategoryChange(category === 'All' ? '' : category);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveSort(e.target.value);
    onSortChange(e.target.value);
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    onSearchChange(e.target.value);
  };

  return (
    <div style={{ padding: '1rem', borderBottom: '1px solid #e0e0e0' }}>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchInput}
          placeholder="Search products..."
          style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
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
          onChange={handleSortChange}
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
