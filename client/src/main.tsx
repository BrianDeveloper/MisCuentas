import { lazy, StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister, PERSIST_MAX_AGE, PERSIST_BUSTER } from './lib/queryClient';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './lib/toast';
import { initTheme } from './lib/theme';
import { keys, TTL } from './lib/store/keys';
import { api } from './lib/api';
import './index.css';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import ClientDetail from './pages/ClientDetail';
import Settings from './pages/Settings';
import Spinner from './components/Spinner';

const Stats = lazy(() => import('./pages/Stats'));

/** Precarga tasa + ajustes al entrar en sesión (cache-first para todas las vistas). */
function SessionLoader() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loggedIn') return;
    void queryClient.fetchQuery({
      queryKey: [keys.rate],
      queryFn: () => api<{ rate: unknown | null }>('rates', { query: { action: 'latest' } }),
      staleTime: TTL.rate,
    });
    void queryClient.fetchQuery({
      queryKey: [keys.settings],
      queryFn: () => api<unknown>('settings'),
      staleTime: TTL.settings,
    });
  }, [status]);

  return null;
}

function Shell() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Cargando…
      </div>
    );
  }
  if (status === 'setup') return <Setup />;
  if (status === 'loggedOut') return <Login />;

  return (
    <>
      <SessionLoader />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/clients" element={<Dashboard />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/stats" element={<Suspense fallback={<Spinner />}><Stats /></Suspense>} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: PERSIST_BUSTER }}
    >
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <Shell />
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </PersistQueryClientProvider>
  );
}

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);