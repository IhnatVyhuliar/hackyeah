import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@unbox/shared';
import { api, setUnauthorizedHandler } from './api';

interface Session {
  user: User | null;
  restoring: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    // Przywrócenie sesji: jeśli jest zapisany token, pobieramy użytkownika z backendu.
    (async () => {
      try {
        if (await api.auth.isLoggedIn()) setUser(await api.auth.me());
      } catch {
        await api.auth.logout();
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await api.auth.login({ email, password }));
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, restoring, login, logout }), [user, restoring, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession poza SessionProvider');
  return s;
}
