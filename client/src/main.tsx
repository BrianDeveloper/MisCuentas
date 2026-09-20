import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import './index.css';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import ClientDetail from './pages/ClientDetail';
import Settings from './pages/Settings';

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
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/clients" element={<Dashboard />} />
      <Route path="/clients/:id" element={<ClientDetail />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);