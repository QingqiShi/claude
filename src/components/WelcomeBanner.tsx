'use client';

import { useUserPreferences } from '@/contexts/UserContext';

export function WelcomeBanner() {
  const { preferences } = useUserPreferences();

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = preferences.displayName || 'User';
  const teamPart = preferences.team ? ` from ${preferences.team}` : '';
  const rolePart = preferences.role ? ` (${preferences.role})` : '';
  const greeting = `${timeGreeting}, ${name}${teamPart}${rolePart}!`;

  return (
    <div
      style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        color: 'white',
        marginBottom: '1.5rem',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{greeting}</h2>
      <p style={{ margin: '0.5rem 0 0', opacity: 0.9 }}>
        Here&apos;s what&apos;s happening in your workspace today.
      </p>
    </div>
  );
}
