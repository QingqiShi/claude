'use client';

import { useState, useEffect } from 'react';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '@/types';

interface HeaderProps {
  userName: string;
}

export function Header({ userName }: HeaderProps) {
  const [theme, setTheme] = useState<Theme>('light');

  // Read theme from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('app-theme');
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Sync with other components via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'app-theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const isDark = theme === 'dark';

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1.5rem',
        backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
        borderBottom: `1px solid ${isDark ? '#2a2a4a' : '#e0e0e0'}`,
      }}
    >
      <h1 style={{ fontSize: '1.125rem', color: isDark ? '#e0e0e0' : '#333' }}>
        Welcome back
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: isDark ? '#b0b0d0' : '#666' }}>{userName}</span>
        <ThemeToggle />
      </div>
    </header>
  );
}
