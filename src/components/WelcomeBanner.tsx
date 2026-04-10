'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';

export function WelcomeBanner() {
  const { displayName, team, role } = useUser();
  const [timeOfDay, setTimeOfDay] = useState('');

  // Derive time-of-day greeting on the client only, to avoid hydration
  // mismatches for the server-rendered markup.
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setTimeOfDay('Good morning');
    } else if (hour < 17) {
      setTimeOfDay('Good afternoon');
    } else {
      setTimeOfDay('Good evening');
    }
  }, []);

  if (!timeOfDay) return null;

  const name = displayName || 'User';
  const teamPart = team ? ` from ${team}` : '';
  const rolePart = role ? ` (${role})` : '';
  const greeting = `${timeOfDay}, ${name}${teamPart}${rolePart}!`;

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
