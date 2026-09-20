import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN incorrecto');
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
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white hover:bg-slate-700"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}