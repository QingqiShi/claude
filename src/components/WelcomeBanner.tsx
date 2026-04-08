'use client';

import { useState, useEffect } from 'react';

interface WelcomeBannerProps {
  displayName: string;
  team: string;
  role: string;
}

export function WelcomeBanner({ displayName, team, role }: WelcomeBannerProps) {
  const [greeting, setGreeting] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');

  // Derive time-of-day greeting
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

  // Build the full greeting string from all the scattered pieces
  useEffect(() => {
    const name = displayName || 'User';
    const teamPart = team ? ` from ${team}` : '';
    const rolePart = role ? ` (${role})` : '';
    setGreeting(`${timeOfDay}, ${name}${teamPart}${rolePart}!`);
  }, [displayName, team, role, timeOfDay]);

  if (!greeting) return null;

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
