import { type ReactNode } from 'react';
import Spinner from '../../components/Spinner';

export function SectionCard({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-5 shadow">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
        </svg>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

export function SubmitBtn({
  busy,
  busyLabel,
  label,
  className,
}: {
  busy: boolean;
  busyLabel: string;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={`inline-flex items-center gap-2 disabled:opacity-60 ${
        className ?? 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700'
      }`}
    >
      {busy && <Spinner />}
      {busy ? busyLabel : label}
    </button>
  );
}
