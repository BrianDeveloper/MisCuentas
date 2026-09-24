import { useState } from 'react';
import { fmtDate, fmtNum } from '../lib/format';
import { useTasaStore } from '../lib/store/tasa';

type Cur = 'USD' | 'EUR' | 'BS';

const CURR: Record<Cur, { label: string; symbol: string }> = {
  USD: { label: 'USD', symbol: '$' },
  EUR: { label: 'EUR', symbol: '€' },
  BS: { label: 'Bs', symbol: 'Bs' },
};

const fmtRes = new Intl.NumberFormat('es-VE', {
  maximumFractionDigits: 2,
});

function convertVal(
  amount: number,
  from: Cur,
  to: Cur,
  usd: number,
  eur: number,
): number | null {
  if (amount <= 0) return 0;
  if (usd <= 0) return null;
  const toBs =
    from === 'BS' ? amount : from === 'USD' ? amount * usd : eur > 0 ? amount * eur : null;
  if (toBs === null) return null;
  if (to === 'BS') return toBs;
  if (to === 'USD') return toBs / usd;
  return eur > 0 ? toBs / eur : null;
}

export default function RateConverter() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Cur>('USD');
  const [to, setTo] = useState<Cur>('BS');
  const [amount, setAmount] = useState('100');
  const { rate } = useTasaStore();

  const usd = rate?.usd_ves ?? 0;
  const eur = rate?.eur_ves ?? 0;
  const amountNum = parseFloat(amount.replace(',', '.'));
  const result =
    Number.isFinite(amountNum) && amountNum >= 0
      ? convertVal(amountNum, from, to, usd, eur)
      : null;
  const missingEur = (from === 'EUR' || to === 'EUR') && eur <= 0;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3 md:bottom-4">
      {open && (
        <div className="animate-conv-in w-[290px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-2xl">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.8"
                stroke="currentColor"
                className="h-4 w-4 text-emerald-600"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 6h13M3 12h13m-9 6h9M18.75 4.5 21 6.75l-2.25 2.25M8.25 15l-2.25 2.25L8.25 19.5"
                />
              </svg>
              Convertidor
            </h2>
            <span className="text-xs text-slate-400">
              {rate ? `Tasa del ${fmtDate(rate.date)}` : '—'}
            </span>
          </div>

          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {usd > 0 ? `1 USD = ${fmtNum(usd)} Bs` : 'Sin tasa BCV disponible.'}
            {eur > 0 ? ` · 1 EUR = ${fmtNum(eur)} Bs` : ''}
          </div>

          {usd <= 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              Cargando tasa…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">De</span>
                  <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value as Cur)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                  >
                    {(['USD', 'EUR', 'BS'] as Cur[])
                      .filter((c) => c !== to)
                      .map((c) => (
                        <option key={c} value={c}>
                          {CURR[c].label}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Monto</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="flex items-center justify-center">
                <button
                  onClick={swap}
                  aria-label="Intercambiar divisas"
                  className="rounded-full border border-slate-200 bg-slate-50 p-1.5 text-slate-500 transition-transform hover:scale-110 hover:bg-emerald-50 hover:text-emerald-600 active:rotate-180"
                >
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
                      d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
                    />
                  </svg>
                </button>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Para</span>
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value as Cur)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  {(['USD', 'EUR', 'BS'] as Cur[])
                    .filter((c) => c !== from)
                    .map((c) => (
                      <option key={c} value={c}>
                        {CURR[c].label}
                      </option>
                    ))}
                </select>
              </label>

              {missingEur && (
                <p className="text-xs text-amber-600">
                  La tasa del euro no está disponible; usa la de {fmtNum(usd)} Bs/USD.
                </p>
              )}

              <div className="rounded-xl bg-emerald-50 px-3 py-2.5 transition-colors">
                <p className="text-xs text-emerald-700">Resultado</p>
                <p
                  key={`${result}-${from}-${to}`}
                  className="animate-conv-pop text-lg font-semibold text-emerald-800"
                >
                  {result === null ? '—' : `${CURR[to].symbol} ${fmtRes.format(result)}`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Cerrar convertidor de divisas' : 'Abrir convertidor de divisas'}
        aria-expanded={open}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 transition-all duration-200 hover:scale-110 hover:bg-emerald-500 active:scale-95"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.8"
          stroke="currentColor"
          className={`h-7 w-7 transition-transform duration-300 ${open ? 'rotate-180' : 'animate-conv-float'}`}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          />
        </svg>
      </button>
    </div>
  );
}