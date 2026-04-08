'use client';

import { useState, useCallback } from 'react';
import { FilterPanel } from '@/components/FilterPanel';
import { SearchResults } from '@/components/SearchResults';
import { fetchProducts } from '@/lib/api';
import type { Product } from '@/types';

export default function ProductListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiltersChange = useCallback(
    async (filters: { category: string; sort: string; search: string }) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchProducts({
          category: filters.category || undefined,
          sort: filters.sort,
          search: filters.search || undefined,
        });
        setProducts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch products');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ padding: '1.5rem 1rem 0' }}>Products</h1>
      <FilterPanel onFiltersChange={handleFiltersChange} />
      <SearchResults products={products} loading={loading} error={error} />
    </div>
  );
}
