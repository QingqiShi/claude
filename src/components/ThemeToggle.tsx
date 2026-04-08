'use client';

import { useState, useEffect } from 'react';
import type { Theme } from '@/types';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  // Read theme from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('app-theme');
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
      }
    } catch {
      // Ignore storage errors (private browsing, etc.)
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

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem('app-theme', next);
    } catch {
      // Gracefully degrade in private browsing
    }
  };

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      style={{
        padding: '0.5rem',
        borderRadius: '6px',
        border: '1px solid #ddd',
        backgroundColor: theme === 'dark' ? '#1a1a2e' : '#ffffff',
        color: theme === 'dark' ? '#e0e0e0' : '#333333',
        cursor: 'pointer',
      }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
