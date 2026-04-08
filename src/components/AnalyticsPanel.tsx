'use client';

import { MetricsGrid } from './MetricsGrid';
import type { DateRange, Currency, Locale } from '@/types';

interface AnalyticsPanelProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  currency: Currency;
  locale: Locale;
}

export function AnalyticsPanel({
  dateRange,
  onDateRangeChange,
  currency,
  locale,
}: AnalyticsPanelProps) {
  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Key Metrics</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Overview of your most important business metrics
        </p>
      </div>
      <MetricsGrid
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
