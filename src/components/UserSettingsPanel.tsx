'use client';

import { useUserPreferences } from '@/contexts/UserContext';

export function UserSettingsPanel() {
  const { preferences, setDisplayName } = useUserPreferences();

  return (
    <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h3>Display Settings</h3>
      <label htmlFor="userDisplayName">Display Name</label>
      <input
        id="userDisplayName"
        type="text"
        value={preferences.displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Enter your display name"
        style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
      />
    </div>
  );
}
