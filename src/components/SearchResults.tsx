'use client';

import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface SearchResultsProps {
  products: Product[];
  loading: boolean;
  error: string | null;
}

export function SearchResults({ products, loading, error }: SearchResultsProps) {
  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading products...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>;
  }

  if (products.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No products found.</div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{products.length} products found</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '1rem',
        }}
      >
        {products.map((product) => (
          <div
            key={product.id}
            style={{
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '1rem',
              transition: 'box-shadow 0.15s',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>{product.name}</h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>
              {product.category}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>{formatCurrency(product.price)}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '12px',
                  backgroundColor: product.status === 'active' ? '#dcfce7' : '#f3f4f6',
                  color: product.status === 'active' ? '#166534' : '#6b7280',
                }}
              >
                {product.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
