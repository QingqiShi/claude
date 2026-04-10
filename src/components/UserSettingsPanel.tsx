'use client';

import { useUser } from '@/contexts/UserContext';

export function UserSettingsPanel() {
  const { displayName, setDisplayName } = useUser();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
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
