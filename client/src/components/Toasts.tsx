import { useToast } from '../lib/toast';

export function Toasts() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`animate-toast-in pointer-events-auto w-fit max-w-full rounded-lg px-4 py-2.5 text-left text-sm font-medium text-white shadow-lg ${
            t.type === 'ok'
              ? 'bg-emerald-600'
              : t.type === 'err'
                ? 'bg-red-600'
                : 'bg-slate-800'
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}