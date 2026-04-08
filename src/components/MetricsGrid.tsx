'use client';

import { useState, useEffect } from 'react';
import { MetricCard } from './MetricCard';
import { fetchMetrics } from '@/lib/api';
import type { MetricData, DateRange, Currency, Locale } from '@/types';

interface MetricsGridProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  currency: Currency;
  locale: Locale;
}

export function MetricsGrid({
  dateRange,
  onDateRangeChange,
  currency,
  locale,
}: MetricsGridProps) {
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMetrics({
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })
      .then((data) => {
        if (!cancelled) {
          setMetrics(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metrics');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  if (loading) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: '120px',
              borderRadius: '8px',
              backgroundColor: '#f3f4f6',
              animation: 'pulse 2s infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
        {error}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1rem',
      }}
    >
      {metrics.map((metric) => (
        <MetricCard
          key={metric.label}
          metric={metric}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          currency={currency}
          locale={locale}
        />
      ))}
    </div>
  );
}
