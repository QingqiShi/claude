'use client';

import { MetricsGrid } from './MetricsGrid';

export function AnalyticsPanel() {
  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Key Metrics</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Overview of your most important business metrics
        </p>
      </div>
      <MetricsGrid />
    </div>
  );
}
