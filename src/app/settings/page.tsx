'use client';

import { useState } from 'react';
import { UserSettingsPanel } from '@/components/UserSettingsPanel';
import { TeamSelector } from '@/components/TeamSelector';
import { RoleDisplay } from '@/components/RoleDisplay';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1>Settings</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
        <UserSettingsPanel onDisplayNameChange={setDisplayName} />
        <TeamSelector onTeamChange={setTeam} />
        <RoleDisplay onRoleChange={setRole} />
      </div>
    </div>
  );
}
