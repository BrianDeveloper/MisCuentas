import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Spinner from '../components/Spinner';
import WhatsAppButton from '../components/WhatsAppButton';
import PagoMovilButton from '../components/PagoMovilButton';
import {
  api,
  type Client,
  type Currency,
  type Movement,
  type Rate,
} from '../lib/api';
import {
  fmtBs,
  fmtDate,
  fmtNum,
  fmtUsd,
  todayInput,
} from '../lib/format';
import { invalidateClientData } from '../lib/cache';
import { useToast } from '../lib/toast';
import { useCachedData } from '../lib/useCachedData';

interface Detail {
  client: Client;
  movements: Movement[];
}

export default function ClientDetail() {
  const { id } = useParams();
  const clientId = Number(id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data, refresh } = useCachedData<Detail & { rate: Rate | null }>(
    `client:${clientId}`,
    () =>
      api<Detail & { rate: Rate | null }>('clients', {
        query: { action: 'get', id: clientId },
      }),
    {
      onError: (err) => {
        toast(
          err instanceof Error ? err.message : 'No se pudo cargar el cliente.',
          'err',
        );
      },
    },
  );
  const [error, setError] = useState('');

  const [mType, setMType] = useState<'deuda' | 'abono'>('deuda');
  const [mCurrency, setMCurrency] = useState<Currency>('Bs');
  const [mAmount, setMAmount] = useState('');
  const [mDate, setMDate] = useState(todayInput());
  const [mConcept, setMConcept] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingMovId, setDeletingMovId] = useState<number | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  if (!data) {
    return (
      <Layout>
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Cargando…
        </div>
      </Layout>
    );
  }

  const { client, movements } = data;
  const rate = data.rate;
  const balanceBs = movements.reduce(
    (acc, m) => acc + (m.type === 'deuda' ? m.amount_bs : -m.amount_bs),
    0,
  );
  const balanceUsdHist = movements.reduce(
    (acc, m) => acc + (m.type === 'deuda' ? m.amount_usd : -m.amount_usd),
    0,
  );
  const usdHoy =
    rate && rate.usd_ves > 0 ? balanceBs / rate.usd_ves : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const amount = parseFloat(mAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresa un monto mayor a 0.');
      return;
    }
    setBusy(true);
    try {
      await api('clients', {
        method: 'POST',
        query: { action: 'movement-create' },
        body: {
          client_id: clientId,
          type: mType,
          currency: mCurrency,
          amount,
          date: mDate,
          concept: mConcept,
        },
      });
      setMAmount('');
      setMConcept('');
      toast('Movimiento guardado.', 'ok');
      invalidateClientData();
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error inesperado', 'err');
    } finally {
      setBusy(false);
    }
  };

  const removeMovement = async (movementId: number) => {
    if (deletingMovId !== null) return;
    if (!window.confirm('¿Eliminar este movimiento?')) return;
    setDeletingMovId(movementId);
    try {
      await api('clients', {
        method: 'DELETE',
        query: { action: 'movement-delete', id: movementId },
      });
      toast('Movimiento eliminado.', 'ok');
      invalidateClientData();
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error inesperado', 'err');
    } finally {
      setDeletingMovId(null);
    }
  };

  const deleteClient = async () => {
    if (deletingClient) return;
    if (
      !window.confirm(
        `¿Eliminar a "${client.name}" y todo su historial? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setDeletingClient(true);
    try {
      await api('clients', {
        method: 'DELETE',
        query: { action: 'delete', id: clientId },
      });
      toast('Cliente eliminado.', 'ok');
      invalidateClientData();
      navigate('/clients');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error inesperado', 'err');
      setDeletingClient(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/clients')}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Clientes
          </button>
          <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">
            {client.name}
          </h1>
          <p className="text-sm text-slate-500">
            {client.phone}
            {client.phone && client.notes ? ' · ' : ''}
            {client.notes}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WhatsAppButton
            phone={client.phone}
            name={client.name}
            balanceBs={balanceBs}
            usdHoy={usdHoy ?? balanceUsdHist}
            rate={rate?.usd_ves ?? null}
          />
          <PagoMovilButton
            phone={client.phone}
            name={client.name}
            balanceBs={balanceBs}
            usdHoy={usdHoy ?? balanceUsdHist}
          />
          <button
            onClick={deleteClient}
            disabled={deletingClient}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {deletingClient && <Spinner />}
            {deletingClient ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Saldo Bs (fijo)
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              balanceBs > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {fmtBs(balanceBs)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Equivalente $ (hoy)
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              balanceBs > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {usdHoy !== null ? fmtUsd(usdHoy) : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Equivalente $ (histórico)
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              balanceUsdHist > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {fmtUsd(balanceUsdHist)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        <form
          onSubmit={onSubmit}
          className="rounded-xl bg-white p-5 shadow lg:max-w-md"
        >
          <h2 className="text-lg font-bold text-slate-800">
            Registrar deuda o abono
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMType('deuda')}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                mType === 'deuda'
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              + Deuda
            </button>
            <button
              type="button"
              onClick={() => setMType('abono')}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                mType === 'abono'
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              − Abono
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {(['USD', 'Bs'] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setMCurrency(c)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  mCurrency === c
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-sm font-medium">
            Monto
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={mAmount}
              onChange={(e) => setMAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="mt-3 block text-sm font-medium">
            Fecha
            <input
              type="date"
              value={mDate}
              onChange={(e) => setMDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="mt-3 block text-sm font-medium">
            Concepto (opcional)
            <input
              value={mConcept}
              onChange={(e) => setMConcept(e.target.value)}
              placeholder="Ej: compra de mercancía"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            onClick={(e) => {
              if (busy) e.preventDefault();
            }}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {busy && <Spinner />}
            {busy ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </form>

        <div className="min-w-0">
          {movements.length === 0 && (
            <p className="rounded-xl bg-white p-8 text-center text-slate-500 shadow">
              Sin movimientos todavía.
            </p>
          )}

          {/* Vista móvil: tarjetas */}
          <div className="space-y-3 lg:hidden">
            {movements.map((m) => (
              <div key={m.id} className="rounded-xl bg-white p-4 shadow">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      m.type === 'deuda'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {m.type === 'deuda' ? 'Deuda' : 'Abono'}
                  </span>
                  <span
                    className={`font-bold ${
                      m.saldo_bs > 0 ? 'text-red-600' : 'text-slate-700'
                    }`}
                  >
                    {fmtBs(m.saldo_bs)}
                  </span>
                </div>

                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {fmtDate(m.date)}
                    </p>
                    {m.concept && (
                      <p className="truncate text-sm text-slate-500">
                        {m.concept}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-800">
                      {fmtNum(m.amount)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        {m.currency === 'USD' ? 'USD' : 'Bs'}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Bs {fmtNum(m.amount_bs)}
                    </p>
                    <p className="text-xs text-slate-400">
                      = USD {fmtNum(m.amount_usd)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>tasa {fmtNum(m.rate_bs)} Bs/USD</span>
                  <button
                    onClick={() => removeMovement(m.id)}
                    disabled={deletingMovId !== null}
                    className="font-medium text-slate-400 hover:text-red-600 disabled:opacity-60"
                  >
                    {deletingMovId === m.id ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Vista desktop: tabla */}
          <div className="hidden overflow-hidden rounded-xl bg-white shadow lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Concepto</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-right">Bs (cada día)</th>
                  <th className="px-4 py-3 text-right">= USD (cada día)</th>
                  <th className="px-4 py-3 text-right">Saldo Bs</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2 text-slate-600">
                      {fmtDate(m.date)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          m.type === 'deuda'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {m.type === 'deuda' ? 'Deuda' : 'Abono'}
                      </span>
                    </td>
                    <td className="break-words px-4 py-2 text-slate-600">
                      {m.concept}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmtNum(m.amount)}{' '}
                      <span className="text-xs text-slate-400">
                        {m.currency === 'USD' ? 'USD' : 'Bs'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {fmtBs(m.amount_bs)}
                      <div className="text-xs text-slate-400">
                        tasa {fmtNum(m.rate_bs)} Bs/USD
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {fmtUsd(m.amount_usd)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        m.saldo_bs > 0 ? 'text-red-600' : 'text-slate-700'
                      }`}
                    >
                      {fmtBs(m.saldo_bs)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => removeMovement(m.id)}
                        disabled={deletingMovId !== null}
                        className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
                        title="Eliminar movimiento"
                      >
                        {deletingMovId === m.id ? '…' : '✕'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}