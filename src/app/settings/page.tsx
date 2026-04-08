'use client';

import { useState } from 'react';
import { updateUserSettings } from '@/lib/api';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [locale, setLocale] = useState('en-US');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await updateUserSettings({ displayName, locale });
      setMessage('Settings saved successfully.');
    } catch {
      setMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1>Settings</h1>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="displayName">Display Name</label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="locale">Locale</label>
        <select
          id="locale"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
        >
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="de-DE">German</option>
          <option value="ja-JP">Japanese</option>
        </select>
      </div>
      <button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
    </div>
  );
}
