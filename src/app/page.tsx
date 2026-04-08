'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { WelcomeBanner } from '@/components/WelcomeBanner';

export default function HomePage() {
  const [displayName, setDisplayName] = useState('');
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    try {
      setDisplayName(localStorage.getItem('user-display-name') || '');
      setTeam(localStorage.getItem('user-team') || '');
      setRole(localStorage.getItem('user-role') || '');
    } catch {
      // Ignore storage errors
    }
  }, []);

  return (
    <main style={{ padding: '2rem' }}>
      <WelcomeBanner displayName={displayName} team={team} role={role} />
      <h1>Dashboard</h1>
      <nav>
        <ul>
          <li><Link href="/dashboard">Analytics Dashboard</Link></li>
          <li><Link href="/products">Product Catalog</Link></li>
          <li><Link href="/settings">Settings</Link></li>
        </ul>
      </nav>
    </main>
  );
}
