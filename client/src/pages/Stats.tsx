import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Layout from '../components/Layout';
import Spinner from '../components/Spinner';
import { fmtBs } from '../lib/format';
import { useToast } from '../lib/toast';
import { useMetricasStore } from '../lib/store/metricas';

function dayLabel(value: unknown): string {
  return String(value ?? '').slice(-2);
}

function monthDayLabel(value: unknown): string {
  const d = String(value ?? '');
  return `Día ${d.slice(-2)} del ${d.slice(0, 7).split('-').reverse().join('/')}`;
}

function fmtTooltip(value: unknown): string {
  return fmtBs(Number(value ?? 0));
}

function legendName(name: unknown): string {
  return name === 'cobrado' ? 'Cobrado' : 'Deudas';
}

export default function Stats() {
  const { toast } = useToast();
  const { data } = useMetricasStore((err) => {
    toast(
      err instanceof Error ? err.message : 'No se pudieron cargar las métricas.',
      'err',
    );
  });

  const monthLabel = useMemo(
    () => (data ? data.mes.split('-').reverse().join('/') : ''),
    [data],
  );

  return (
    <Layout>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="shrink-0 text-xl font-bold text-slate-800 sm:text-2xl">
          Estadísticas
        </h1>
        {data && (
          <span className="text-sm text-slate-500">
            {monthLabel}
          </span>
        )}
      </div>

      {!data ? (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
          <Spinner /> Calculando métricas…
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label={`Cobrado (Bs) · ${monthLabel}`}
              value={fmtBs(data.total.cobrado_bs)}
              accent="text-emerald-600"
            />
            <StatCard
              label={`Deudas (Bs) · ${monthLabel}`}
              value={fmtBs(data.total.deudas_bs)}
              accent="text-red-600"
            />
            <StatCard
              label="Días promedio de cobro"
              value={
                data.dias_promedio_cobro > 0
                  ? `${data.dias_promedio_cobro} días`
                  : '—'
              }
              accent="text-slate-900"
            />
            <StatCard
              label="Tasa hoy (Bs/USD)"
              value={data.tasa_hoy > 0 ? `Bs ${data.tasa_hoy.toLocaleString('es-VE')}` : '—'}
              accent="text-slate-900"
            />
          </div>

          <section>
            <h2 className="text-base font-bold text-slate-800">
              Movimientos del mes (Bs) por día
            </h2>
            <div className="mt-2 rounded-xl bg-white p-3 shadow">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.serie_diaria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={dayLabel}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={monthDayLabel}
                    formatter={(value, name) => [fmtTooltip(value), legendName(name)]}
                  />
                  <Legend formatter={legendName} />
                  <Bar dataKey="cobrado" fill="#059669" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="deudas" fill="#dc2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800">
              Evolución de la tasa (últimos 30 días)
            </h2>
            <div className="mt-2 rounded-xl bg-white p-3 shadow">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.rate_evolution.length > 0 ? data.rate_evolution : []}>
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => String(d ?? '').slice(5)}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      Math.round(Number(v)).toLocaleString('es-VE')
                    }
                    width={55}
                  />
                  <Tooltip
                    labelFormatter={(d) => `Día ${String(d ?? '')}`}
                    formatter={(value) => [
                      `Bs ${Number(value ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })}`,
                      'Tasa',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="usd_ves"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#rateGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800">
              Evolución cobrado por día
            </h2>
            <div className="mt-2 rounded-xl bg-white p-3 shadow">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.serie_diaria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={dayLabel}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={monthDayLabel}
                    formatter={(value, name) => [fmtTooltip(value), legendName(name)]}
                  />
                  <Legend formatter={legendName} />
                  <Line
                    type="monotone"
                    dataKey="cobrado"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="deudas"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800">Top deudores del mes</h2>
            {data.top_deudores.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Sin deudores pendientes.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.top_deudores.map((d, i) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                      <span className="mr-2 text-slate-400">{i + 1}.</span>
                      {d.name}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-red-600">
                      {fmtBs(d.saldo_bs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Layout>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-4 shadow">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-lg font-bold sm:text-xl ${accent}`}>
        {value}
      </p>
    </div>
  );
}