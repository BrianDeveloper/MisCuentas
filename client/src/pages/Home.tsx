import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Spinner from '../components/Spinner';
import { api, type ClientSummary, type Rate, type RecentMovement } from '../lib/api';
import { fmtBs, fmtDate, fmtNum, fmtUsd } from '../lib/format';
import { useToast } from '../lib/toast';
import { useCachedData } from '../lib/useCachedData';

interface HomeData {
  clients: ClientSummary[];
  rate: Rate | null;
  movements: RecentMovement[];
}

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data } = useCachedData<HomeData>(
    'home',
    () => api<HomeData>('clients', { query: { action: 'home', limit: 10 } }),
    {
      onError: (err) => {
        toast(
          err instanceof Error ? err.message : 'No se pudieron cargar los datos.',
          'err',
        );
      },
    },
  );

  const clients = useMemo(() => (data?.clients ?? []), [data]);

  const totals = useMemo(() => {
    const bs = clients.reduce((acc, c) => acc + c.saldo_bs, 0);
    const usdHoy = data?.rate && data.rate.usd_ves > 0 ? bs / data.rate.usd_ves : 0;
    return { bs, usdHoy };
  }, [clients, data]);

  const recent = data?.movements ?? [];

  return (
    <Layout>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="shrink-0 text-xl font-bold text-slate-800 sm:text-2xl">
          Inicio
        </h1>
        <Link
          to="/clients"
          className="flex w-full items-center justify-center whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-700 sm:w-auto"
        >
          Ver clientes
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total a cobrar (Bs)
          </p>
          <p className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">
            {!data ? '…' : fmtBs(totals.bs)}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Equivalente en $ (hoy)
          </p>
          <p className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">
            {!data ? '…' : totals.usdHoy > 0 ? fmtUsd(totals.usdHoy) : '—'}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Clientes
          </p>
          <p className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">
            {!data ? '…' : clients.length}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            Últimos movimientos
          </h2>
          {recent.length > 0 && (
            <span className="text-xs text-slate-400">
              Tasa: {fmtNum(data?.rate?.usd_ves ?? 0)} Bs/USD
            </span>
          )}
        </div>

        {!data ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            <Spinner /> Cargando…
          </div>
        ) : recent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Sin movimientos todavía.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {recent.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/clients/${m.client_id}`)}
                className="block w-full rounded-xl bg-white p-4 text-left shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          m.type === 'deuda'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {m.type === 'deuda' ? 'Deuda' : 'Abono'}
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-800">
                        {m.client_name}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {m.concept || m.client_phone || 'Sin concepto'} ·{' '}
                      {fmtDate(m.date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-base font-bold ${
                        m.type === 'deuda' ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {m.type === 'deuda' ? '+' : '−'}
                      {fmtBs(m.amount_bs)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.currency === 'USD'
                        ? fmtUsd(m.amount)
                        : `${fmtNum(m.amount)} Bs`}
                    </p>
                  </div>
                </div>
              </button>
            ))}
            <p className="text-center text-sm text-slate-500">
              <Link to="/clients" className="font-medium text-slate-700 underline">
                Ver todos los clientes
              </Link>
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}