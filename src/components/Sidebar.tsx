'use client';

import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/products', label: 'Products', icon: '📦' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <aside
      style={{
        width: '240px',
        height: '100vh',
        backgroundColor: isDark ? '#16213e' : '#f8f9fa',
        borderRight: `1px solid ${isDark ? '#2a2a4a' : '#e0e0e0'}`,
        padding: '1rem 0',
      }}
    >
      <div style={{ padding: '0 1rem', marginBottom: '2rem' }}>
        <h2 style={{ color: isDark ? '#e0e0e0' : '#333', fontSize: '1.25rem' }}>
          Dashboard App
        </h2>
      </div>
      <nav>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              color: isDark ? '#b0b0d0' : '#555',
              textDecoration: 'none',
              transition: 'background-color 0.15s',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
