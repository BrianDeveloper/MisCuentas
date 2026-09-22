import { useState, type FormEvent } from 'react';
import Spinner from '../components/Spinner';
import { useAuth } from '../auth';
import { useToast } from '../lib/toast';

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const clean = pin.trim();
    if (!/^\d{4,6}$/.test(clean)) {
      toast('El PIN debe tener entre 4 y 6 dígitos.', 'err');
      return;
    }
    setBusy(true);
    try {
      await login(clean);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'PIN incorrecto', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-2xl font-bold">Mis Cuentas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ingresa tu PIN para entrar.
        </p>
        <label className="mt-5 block text-sm font-medium">
          PIN
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          onClick={(e) => {
            if (busy) e.preventDefault();
          }}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {busy && <Spinner />}
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}