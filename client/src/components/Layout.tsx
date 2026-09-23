import { type ReactNode, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { fmtNum } from '../lib/format';
import { useTasaStore } from '../lib/store/tasa';
import { useOnline, usePendingCount, syncPending } from '../lib/offline';
import { useConfirm } from '../lib/confirm';
import { useUserManual } from '../lib/userManual';
import RateConverter from './RateConverter';

function RatePill() {
  const { rate } = useTasaStore();
  if (!rate) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-emerald-300">
      1 USD = {fmtNum(rate.usd_ves)} Bs
    </span>
  );
}

function DesktopNavLink({
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
    pathname === to || (to === '/clients' && pathname.startsWith('/clients/'));
  return (
    <Link
      to={to}
      aria-label={isActive ? undefined : label}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm sm:px-3 ${
        isActive ? 'bg-slate-700' : 'hover:bg-slate-700'
      }`}
    >
      {children}
      <span className={isActive ? 'inline' : 'hidden md:inline'}>{label}</span>
    </Link>
  );
}

const NAV_ITEMS = [
  { to: '/clients', label: 'Clientes' },
  { to: '/stats', label: 'Estadísticas' },
  { to: '/', label: 'Inicio' },
  { to: '/settings', label: 'Ajustes' },
];

function getIcon(label: string) {
  switch (label) {
    case 'Clientes':
      return (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
        />
      );
    case 'Inicio':
      return (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
        />
      );
    case 'Estadísticas':
      return (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
        />
      );
    case 'Ajustes':
      return (
        <>
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
        </>
      );
    default:
      return null;
  }
}

function BottomNav({ onLogout }: { onLogout: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-700 bg-slate-900 px-2 py-2.5 md:hidden">
      {NAV_ITEMS.map(({ to, label }) => {
        const isHome = to === '/';
        const isActive =
          pathname === to || (to === '/clients' && pathname.startsWith('/clients/'));
        const isCenter = isHome;
        return (
          <Link
            key={label}
            to={to}
            aria-label={label}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs transition-all duration-200 ${
              isHome
                ? 'text-emerald-400'
                : isActive
                  ? 'text-white'
                  : 'text-slate-400'
            }`}
          >
            <span
              className={`rounded-full p-1.5 transition-all duration-200 ${
                isHome
                  ? 'bg-emerald-500/20 scale-110 ring-2 ring-emerald-400/50'
                  : isActive
                    ? 'bg-slate-700 scale-110 ring-2 ring-white/30'
                    : 'scale-100'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={isCenter ? 2 : 1.8}
                stroke="currentColor"
                className={`${isCenter ? 'h-6 w-6' : 'h-5 w-5'}`}
                aria-hidden="true"
              >
                {getIcon(label)}
              </svg>
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
      <button
        onClick={onLogout}
        aria-label="Cerrar sesión"
        className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs text-slate-400 transition-all duration-200 hover:text-red-400"
      >
        <span className="rounded-full p-1.5 hover:bg-red-500/10 transition-colors duration-200">
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
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
        </span>
        <span className="truncate">Salir</span>
      </button>
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const online = useOnline();
  const pending = usePendingCount();
  const syncingRef = useRef(false);
  const confirm = useConfirm();
  const openManual = useUserManual();

  useEffect(() => {
    if (!online || syncingRef.current || pending === 0) return;
    syncingRef.current = true;
    void syncPending().finally(() => {
      syncingRef.current = false;
    });
  }, [online, pending]);

  const handleLogout = async () => {
    const ok = await confirm({
      message: '¿Estás seguro de que deseas cerrar sesión?',
      confirmLabel: 'Cerrar sesión',
      cancelLabel: 'Cancelar',
      confirmVariant: 'danger',
    });
    if (ok) {
      await logout();
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-5xl flex-nowrap items-center justify-between gap-x-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">
              Mis Cuentas
            </span>
            <nav className="hidden md:flex gap-1 text-sm">
              <DesktopNavLink to="/clients" label="Clientes" pathname={pathname}>
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
              </DesktopNavLink>
              <DesktopNavLink to="/settings" label="Ajustes" pathname={pathname}>
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
              </DesktopNavLink>
              <DesktopNavLink to="/stats" label="Estadísticas" pathname={pathname}>
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
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                  />
                </svg>
              </DesktopNavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {!online && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-slate-900">
                Sin conexión
              </span>
            )}
            {pending > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-3 py-1 text-xs font-medium text-white">
                {pending} pendiente{pending === 1 ? '' : 's'}
              </span>
            )}
            <button
              type="button"
              onClick={openManual}
              aria-label="Manual de usuario"
              className="inline-flex items-center justify-center rounded-full bg-slate-700 px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-600"
            >
              ?
            </button>
            <RatePill />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-6 pb-16 md:pb-0">
        {children}
      </main>
      <RateConverter />
      <BottomNav onLogout={handleLogout} />
    </div>
  );
}
