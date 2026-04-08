'use client';

import { createContext, useContext, useState } from 'react';
import type { DateRange, Currency, Locale } from '@/types';

interface DashboardContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  });
  const [currency, setCurrency] = useState<Currency>('USD');
  const [locale, setLocale] = useState<Locale>('en-US');

  return (
    <DashboardContext.Provider
      value={{ dateRange, setDateRange, currency, setCurrency, locale, setLocale }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
