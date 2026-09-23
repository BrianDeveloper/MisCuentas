import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { App } from '@capacitor/app';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
}

interface ConfirmCtxValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dismiss: () => void;
}

const Ctx = createContext<ConfirmCtxValue | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx.confirm;
}

export function useDismissConfirm(): () => void {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDismissConfirm debe usarse dentro de ConfirmProvider');
  return ctx.dismiss;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    opts: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setPending({ opts, resolve });
      }),
    [],
  );

  const dismiss = useCallback((value = false) => {
    setPending((p) => {
      if (!p) return null;
      p.resolve(value);
      return null;
    });
  }, []);

  const handleRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    App.addListener('backButton', (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      if (pending) dismiss();
    }).then(h => { handleRef.current = h; });
    return () => { handleRef.current?.remove(); };
  }, [pending, dismiss]);

  return (
    <Ctx.Provider value={{ confirm, dismiss }}>
      {children}
      {pending && (
        <ConfirmModal
          open={!!pending}
          title={pending.opts.title ?? 'Confirmar'}
          message={pending.opts.message}
          confirmLabel={pending.opts.confirmLabel ?? 'Confirmar'}
          cancelLabel={pending.opts.cancelLabel ?? 'Cancelar'}
          confirmVariant={pending.opts.confirmVariant ?? 'primary'}
          onConfirm={() => dismiss(true)}
          onCancel={() => dismiss(false)}
        />
      )}
    </Ctx.Provider>
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-conv-in">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              confirmVariant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
