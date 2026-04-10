'use client';

import { createContext, useContext, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface UserContextValue {
  displayName: string;
  team: string;
  role: string;
  setDisplayName: (name: string) => void;
  setTeam: (team: string) => void;
  setRole: (role: string) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayName] = useLocalStorage<string>(
    'user-display-name',
    ''
  );
  const [team, setTeam] = useLocalStorage<string>('user-team', '');
  const [role, setRole] = useLocalStorage<string>('user-role', '');

  const value = useMemo<UserContextValue>(
    () => ({
      displayName,
      team,
      role,
      setDisplayName,
      setTeam,
      setRole,
    }),
    [displayName, team, role, setDisplayName, setTeam, setRole]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
