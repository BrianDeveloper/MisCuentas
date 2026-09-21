import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Spinner from '../components/Spinner';
import { api, downloadExport, type ClientSummary, type Rate } from '../lib/api';
import { fmtBs, fmtUsd } from '../lib/format';
import { useToast } from '../lib/toast';

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [rate, setRate] = useState<Rate | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ clients: ClientSummary[]; rate: Rate | null }>(
        'clients',
        { query: { action: 'list' } },
      );
      setClients(data.clients);
      setRate(data.rate);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudieron cargar los clientes.', 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.client.name.toLowerCase().includes(q) ||
        c.client.phone.toLowerCase().includes(q),
    );
  }, [clients, query]);

  const totals = useMemo(() => {
    const bs = clients.reduce((acc, c) => acc + c.saldo_bs, 0);
    const usdHoy = rate && rate.usd_ves > 0 ? bs / rate.usd_ves : 0;
    return { bs, usdHoy };
  }, [clients, rate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api<{ client: { id: number } }>('clients', {
        method: 'POST',
        query: { action: 'create' },
        body: { name, phone, notes },
      });
      setShowForm(false);
      setName('');
      setPhone('');
      setNotes('');
      toast('Cliente creado.', 'ok');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error inesperado', 'err');
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadExport({ action: 'summary' }, 'resumen-cuentas.csv');
      toast('Resumen exportado.', 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo exportar.', 'err');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      {/* Cabecera: en móvil el título va arriba y las acciones debajo, a ancho completo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="shrink-0 text-xl font-bold text-slate-800 sm:text-2xl">
          Clientes
        </h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={doExport}
            disabled={exporting}
            className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 sm:flex-none"
          >
            {exporting && <Spinner />}
            {exporting ? 'Exportando…' : 'Exportar'}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex-1 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-700 sm:flex-none"
          >
            + Nuevo cliente
          </button>
        </div>
      </div>

      {/* Métricas: una columna fluida en móvil */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total a cobrar (Bs)
          </p>
          <p className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">
            {loading ? '…' : fmtBs(totals.bs)}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Equivalente en $ (hoy)
          </p>
          <p className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">
            {loading ? '…' : totals.usdHoy !== null ? fmtUsd(totals.usdHoy) : '—'}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Clientes
          </p>
          <p className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">
            {loading ? '…' : clients.length}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <input
          type="search"
          placeholder="Buscar por nombre o teléfono…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      {loading ? (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white p-8 text-sm text-slate-500 shadow">
          <Spinner /> Cargando clientes…
        </div>
      ) : (
        filtered.length === 0 && (
          <p className="mt-6 text-center text-slate-500">
            No hay clientes todavía.
          </p>
        )
      )}

      {/* Vista móvil: tarjetas */}
      <div className="mt-4 space-y-3 lg:hidden">
        {filtered.map(({ client, saldo_bs, last_activity }) => {
          const usdHoy =
            rate && rate.usd_ves > 0 ? saldo_bs / rate.usd_ves : null;
          return (
            <button
              key={client.id}
              type="button"
              onClick={() => navigate(`/clients/${client.id}`)}
              className="block w-full max-w-full overflow-hidden rounded-xl bg-white p-4 text-left shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-slate-800">
                    {client.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {client.phone || last_activity || 'Sin movimientos'}
                  </p>
                </div>
                <p
                  className={`min-w-0 max-w-[50%] break-words text-right text-lg font-bold leading-tight ${
                    saldo_bs > 0 ? 'text-red-600' : 'text-slate-700'
                  }`}
                >
                  {fmtBs(saldo_bs)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-sm">
                <span className="text-slate-500">En $ hoy</span>
                <span
                  className={`font-semibold ${
                    saldo_bs > 0 ? 'text-red-600' : 'text-slate-700'
                  }`}
                >
                  {usdHoy !== null ? fmtUsd(usdHoy) : '—'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Vista desktop: tabla */}
      <div className="mt-4 hidden overflow-hidden rounded-xl bg-white shadow lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3 text-right">Saldo Bs</th>
              <th className="px-4 py-3 text-right">En $ hoy</th>
              <th className="px-4 py-3 text-right">Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ client, saldo_bs, last_activity }) => {
              const usdHoy =
                rate && rate.usd_ves > 0 ? saldo_bs / rate.usd_ves : null;
              return (
                <tr
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="break-words px-4 py-3 font-medium text-slate-800">
                    {client.name}
                  </td>
                  <td className="break-words px-4 py-3 text-slate-600">
                    {client.phone}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      saldo_bs > 0 ? 'text-red-600' : 'text-slate-700'
                    }`}
                  >
                    {fmtBs(saldo_bs)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      saldo_bs > 0 ? 'text-red-600' : 'text-slate-700'
                    }`}
                  >
                    {usdHoy !== null ? fmtUsd(usdHoy) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {last_activity ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 sm:items-center">
          <form
            onSubmit={onSubmit}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-800">Nuevo cliente</h2>
            <label className="mt-4 block text-sm font-medium">
              Nombre *
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Teléfono
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Notas
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                onClick={(e) => {
                  if (busy) e.preventDefault();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {busy && <Spinner />}
                {busy ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}