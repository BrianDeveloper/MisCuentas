import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setToken } from './lib/api';

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
      const info = await api<{ configured: boolean }>('auth', {
        query: { action: 'status' },
      });
      if (!info.configured) {
        setToken(null);
        setStatus('setup');
        return;
      }
      try {
        await api<{ ok: boolean }>('auth', { query: { action: 'me' } });
        setStatus('loggedIn');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setToken(null);
        setStatus('loggedOut');
      }
    } catch {
      setToken(null);
      setStatus('setup');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (pin: string) => {
    const r = await api<{ ok: boolean; token: string }>('auth', {
      method: 'POST',
      query: { action: 'login' },
      body: { pin },
    });
    setToken(r.token);
    setStatus('loggedIn');
  }, []);

  const setup = useCallback(async (pin: string) => {
    const r = await api<{ ok: boolean; token: string }>('auth', {
      method: 'POST',
      query: { action: 'setup' },
      body: { pin },
    });
    setToken(r.token);
    setStatus('loggedIn');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api<{ ok: boolean }>('auth', {
        method: 'POST',
        query: { action: 'logout' },
      });
    } finally {
      setToken(null);
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