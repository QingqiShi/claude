'use client';

import { formatPercent } from '@/lib/utils';
import type { MetricData, DateRange, Currency, Locale } from '@/types';

interface MetricCardProps {
  metric: MetricData;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  currency: Currency;
  locale: Locale;
}

export function MetricCard({
  metric,
  dateRange,
  onDateRangeChange,
  currency,
  locale,
}: MetricCardProps) {
  const formatValue = (value: number, unit: string) => {
    if (unit === 'currency') {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
      }).format(value);
    }
    if (unit === 'percent') {
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: 1,
      }).format(value / 100);
    }
    return new Intl.NumberFormat(locale).format(value);
  };

  const isPositive = metric.change >= 0;

  const handleQuickRange = (days: number) => {
    onDateRangeChange({
      start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      end: new Date(),
    });
  };

  return (
    <div
      style={{
        padding: '1.25rem',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>{metric.label}</p>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.5rem',
            borderRadius: '12px',
            backgroundColor: isPositive ? '#dcfce7' : '#fee2e2',
            color: isPositive ? '#166534' : '#991b1b',
          }}
        >
          {formatPercent(metric.change)}
        </span>
      </div>
      <p style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0' }}>
        {formatValue(metric.value, metric.unit)}
      </p>
      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem' }}>
        {[7, 30, 90].map((days) => (
          <button
            key={days}
            onClick={() => handleQuickRange(days)}
            style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
              border: '1px solid #e0e0e0',
              backgroundColor:
                Math.round(
                  (dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000)
                ) === days
                  ? '#eff6ff'
                  : '#fff',
              cursor: 'pointer',
            }}
          >
            {days}d
          </button>
        ))}
      </div>
    </div>
  );
}
