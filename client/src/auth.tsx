import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from './lib/api';

type AuthStatus = 'loading' | 'setup' | 'loggedOut' | 'loggedIn';

interface AuthCtx {
  status: AuthStatus;
  refresh: () => Promise<void>;
  login: (pin: string) => Promise<void>;
  setup: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      const info = await api<{ configured: boolean }>('/api/auth/status');
      if (!info.configured) {
        setStatus('setup');
        return;
      }
      try {
        await api<{ ok: boolean }>('/api/auth/me');
        setStatus('loggedIn');
      } catch {
        setStatus('loggedOut');
      }
    } catch {
      setStatus('setup');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (pin: string) => {
      await api<{ ok: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      setStatus('loggedIn');
    },
    [],
  );

  const setup = useCallback(
    async (pin: string) => {
      await api<{ ok: boolean }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      setStatus('loggedIn');
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      setStatus('loggedOut');
    }
  }, []);

  return (
    <Ctx.Provider value={{ status, refresh, login, setup, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}