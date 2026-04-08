'use client';

import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  userName: string;
}

export function Header({ userName }: HeaderProps) {
  const { theme } = useTheme();
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
