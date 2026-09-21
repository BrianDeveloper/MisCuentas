import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useEffect, useState } from 'react';
import { api, type Rate } from '../lib/api';
import { fmtNum } from '../lib/format';
import RateConverter from './RateConverter';

function RatePill() {
  const [rate, setRate] = useState<Rate | null>(null);
  useEffect(() => {
    api<{ rate: Rate | null }>('rates', { query: { action: 'latest' } })
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, []);
  if (!rate) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-emerald-300">
      1 USD = {fmtNum(rate.usd_ves)} Bs
    </span>
  );
}

function NavLink({
  to,
  label,
  pathname,
  children,
}: {
  to: string;
  label: string;
  pathname: string;
  children: ReactNode;
}) {
  const isActive =
    pathname === to ||
    (to === '/clients' && pathname.startsWith('/clients/'));
  return (
    <Link
      to={to}
      aria-label={isActive ? undefined : label}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm sm:px-3 ${
        isActive ? 'bg-slate-700' : 'hover:bg-slate-700'
      }`}
    >
      {children}
      <span className={`${isActive ? 'inline' : 'hidden'} md:inline`}>
        {label}
      </span>
    </Link>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-6">
            <Link
              to="/"
              className="mr-1 flex items-center text-base font-bold tracking-tight sm:mr-0 sm:text-lg"
              aria-label="Ir al inicio"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.8"
                stroke="currentColor"
                className="h-6 w-6 md:hidden"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
                />
              </svg>
              <span className="hidden md:inline">Mis Cuentas</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              <NavLink to="/clients" label="Clientes" pathname={pathname}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.8"
                  stroke="currentColor"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  />
                </svg>
              </NavLink>
              <NavLink to="/settings" label="Ajustes" pathname={pathname}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.8"
                  stroke="currentColor"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <RatePill />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-md border border-slate-600 px-2.5 py-1.5 text-sm hover:bg-slate-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.8"
                stroke="currentColor"
                className="h-5 w-5 md:hidden"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                />
              </svg>
              <span className="hidden md:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-6">
        {children}
      </main>
      <RateConverter />
    </div>
  );
}