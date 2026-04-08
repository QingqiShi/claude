'use client';

import { useUserPreferences } from '@/contexts/UserContext';
import type { Team } from '@/types';

const TEAMS: Team[] = [
  { id: '1', name: 'Engineering', memberCount: 24 },
  { id: '2', name: 'Design', memberCount: 8 },
  { id: '3', name: 'Product', memberCount: 12 },
  { id: '4', name: 'Marketing', memberCount: 15 },
];

export function TeamSelector() {
  const { preferences, setTeam } = useUserPreferences();

  return (
    <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h3>Team</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TEAMS.map((team) => (
          <button
            key={team.id}
            onClick={() => setTeam(team.name)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              border: preferences.team === team.name ? '2px solid #3b82f6' : '1px solid #ddd',
              backgroundColor: preferences.team === team.name ? '#eff6ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            {team.name} ({team.memberCount})
          </button>
        ))}
      </div>
    </div>
  );
}
