'use client';

import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

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
