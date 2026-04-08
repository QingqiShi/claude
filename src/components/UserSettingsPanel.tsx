'use client';

import { useState, useEffect } from 'react';

interface UserSettingsPanelProps {
  onDisplayNameChange?: (name: string) => void;
}

export function UserSettingsPanel({ onDisplayNameChange }: UserSettingsPanelProps) {
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('user-display-name');
      if (saved) setDisplayName(saved);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setDisplayName(name);
    try {
      localStorage.setItem('user-display-name', name);
    } catch {
      // Gracefully degrade in private browsing
    }
    onDisplayNameChange?.(name);
  };

  return (
    <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h3>Display Settings</h3>
      <label htmlFor="userDisplayName">Display Name</label>
      <input
        id="userDisplayName"
        type="text"
        value={displayName}
        onChange={handleChange}
        placeholder="Enter your display name"
        style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
      />
    </div>
  );
}
