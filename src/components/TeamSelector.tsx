'use client';

import { useState, useEffect } from 'react';
import type { Team } from '@/types';

const TEAMS: Team[] = [
  { id: '1', name: 'Engineering', memberCount: 24 },
  { id: '2', name: 'Design', memberCount: 8 },
  { id: '3', name: 'Product', memberCount: 12 },
  { id: '4', name: 'Marketing', memberCount: 15 },
];

interface TeamSelectorProps {
  onTeamChange?: (team: string) => void;
}

export function TeamSelector({ onTeamChange }: TeamSelectorProps) {
  const [selectedTeam, setSelectedTeam] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('user-team');
      if (saved) setSelectedTeam(saved);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleSelect = (teamName: string) => {
    setSelectedTeam(teamName);
    try {
      localStorage.setItem('user-team', teamName);
    } catch {
      // Gracefully degrade in private browsing
    }
    onTeamChange?.(teamName);
  };

  return (
    <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h3>Team</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TEAMS.map((team) => (
          <button
            key={team.id}
            onClick={() => handleSelect(team.name)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              border: selectedTeam === team.name ? '2px solid #3b82f6' : '1px solid #ddd',
              backgroundColor: selectedTeam === team.name ? '#eff6ff' : '#fff',
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
