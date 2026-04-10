'use client';

import { useUser } from '@/contexts/UserContext';

const ROLES = ['admin', 'editor', 'viewer'] as const;
type Role = (typeof ROLES)[number];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function RoleDisplay() {
  const { role, setRole } = useUser();
  const currentRole: Role = isRole(role) ? role : 'viewer';

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
            onClick={() => setRole(r)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: currentRole === r ? `2px solid ${roleLabels[r].color}` : '1px solid #ddd',
              backgroundColor: currentRole === r ? `${roleLabels[r].color}15` : '#fff',
              color: roleLabels[r].color,
              cursor: 'pointer',
              fontWeight: currentRole === r ? 600 : 400,
            }}
          >
            {roleLabels[r].label}
          </button>
        ))}
      </div>
    </div>
  );
}
