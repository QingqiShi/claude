'use client';

import { useState } from 'react';
import { FilterPanel } from '@/components/FilterPanel';
import { SearchResults } from '@/components/SearchResults';

export default function ProductListPage() {
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ padding: '1.5rem 1rem 0' }}>Products</h1>
      <FilterPanel
        onCategoryChange={setCategory}
        onSortChange={setSort}
        onSearchChange={setSearch}
      />
      <SearchResults category={category} sort={sort} search={search} />
    </div>
  );
}
