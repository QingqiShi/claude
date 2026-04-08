'use client';

import { useState } from 'react';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import type { DateRange, Currency, Locale } from '@/types';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  });
  const [currency, setCurrency] = useState<Currency>('USD');
  const [locale, setLocale] = useState<Locale>('en-US');

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1>Analytics Dashboard</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="JPY">JPY (¥)</option>
          </select>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="de-DE">German</option>
            <option value="ja-JP">Japanese</option>
          </select>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="date"
              value={dateRange.start.toISOString().split('T')[0]}
              onChange={(e) =>
                handleDateRangeChange({ ...dateRange, start: new Date(e.target.value) })
              }
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
            <span>to</span>
            <input
              type="date"
              value={dateRange.end.toISOString().split('T')[0]}
              onChange={(e) =>
                handleDateRangeChange({ ...dateRange, end: new Date(e.target.value) })
              }
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
            />
          </div>
        </div>
      </div>
      <AnalyticsPanel
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
