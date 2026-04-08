'use client';

import { useState, useEffect } from 'react';

const ROLES = ['admin', 'editor', 'viewer'] as const;
type Role = (typeof ROLES)[number];

interface RoleDisplayProps {
  onRoleChange?: (role: string) => void;
}

export function RoleDisplay({ onRoleChange }: RoleDisplayProps) {
  const [role, setRole] = useState<Role>('viewer');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('user-role') as Role | null;
      if (saved && ROLES.includes(saved)) {
        setRole(saved);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    try {
      localStorage.setItem('user-role', newRole);
    } catch {
      // Gracefully degrade in private browsing
    }
    onRoleChange?.(newRole);
  };

  const roleLabels: Record<Role, { label: string; color: string }> = {
    admin: { label: 'Administrator', color: '#dc2626' },
    editor: { label: 'Editor', color: '#2563eb' },
    viewer: { label: 'Viewer', color: '#6b7280' },
  };

  return (
    <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h3>Role</h3>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => handleRoleChange(r)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: role === r ? `2px solid ${roleLabels[r].color}` : '1px solid #ddd',
              backgroundColor: role === r ? `${roleLabels[r].color}15` : '#fff',
              color: roleLabels[r].color,
              cursor: 'pointer',
              fontWeight: role === r ? 600 : 400,
            }}
          >
            {roleLabels[r].label}
          </button>
        ))}
      </div>
    </div>
  );
}
