import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Toasts } from '../components/Toasts';

type ToastType = 'ok' | 'err' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtxValue {
  toasts: ToastItem[];
  toast: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
}

const TOAST_TTL_MS = 4000;
const MAX_TOASTS = 3;

const Ctx = createContext<ToastCtxValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, type, message }]);
      window.setTimeout(() => dismiss(id), TOAST_TTL_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toasts />
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtxValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}