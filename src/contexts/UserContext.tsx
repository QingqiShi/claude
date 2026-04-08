'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface UserPreferences {
  displayName: string;
  team: string;
  role: string;
}

interface UserContextValue {
  preferences: UserPreferences;
  setDisplayName: (name: string) => void;
  setTeam: (team: string) => void;
  setRole: (role: string) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function useUserPreferences() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  return ctx;
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    if (typeof window === 'undefined') return { displayName: '', team: '', role: 'viewer' };
    try {
      return {
        displayName: localStorage.getItem('user-display-name') || '',
        team: localStorage.getItem('user-team') || '',
        role: localStorage.getItem('user-role') || 'viewer',
      };
    } catch {
      return { displayName: '', team: '', role: 'viewer' };
    }
  });

  const setDisplayName = useCallback((name: string) => {
    setPreferences((prev) => ({ ...prev, displayName: name }));
    try {
      localStorage.setItem('user-display-name', name);
    } catch {
      // Gracefully degrade in private browsing
    }
  }, []);

  const setTeam = useCallback((team: string) => {
    setPreferences((prev) => ({ ...prev, team }));
    try {
      localStorage.setItem('user-team', team);
    } catch {
      // Gracefully degrade in private browsing
    }
  }, []);

  const setRole = useCallback((role: string) => {
    setPreferences((prev) => ({ ...prev, role }));
    try {
      localStorage.setItem('user-role', role);
    } catch {
      // Gracefully degrade in private browsing
    }
  }, []);

  return (
    <UserContext.Provider value={{ preferences, setDisplayName, setTeam, setRole }}>
      {children}
    </UserContext.Provider>
  );
}
