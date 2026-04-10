'use client';

import { UserSettingsPanel } from '@/components/UserSettingsPanel';
import { TeamSelector } from '@/components/TeamSelector';
import { RoleDisplay } from '@/components/RoleDisplay';

export default function SettingsPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1>Settings</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
        <UserSettingsPanel />
        <TeamSelector />
        <RoleDisplay />
      </div>
    </div>
  );
}
