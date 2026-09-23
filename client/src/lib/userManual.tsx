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

interface UserManualCtxValue {
  open: () => void;
}

const Ctx = createContext<UserManualCtxValue | null>(null);

export function useUserManual(): (() => void) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUserManual debe usarse dentro de UserManualProvider');
  return ctx.open;
}

export function UserManualProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {visible && <UserManualModal onClose={close} />}
    </Ctx.Provider>
  );
}

const SLIDES = [
  {
    title: '¡Bienvenido a Mis Cuentas!',
    icon: '🏠',
    content: [
      'Esta app te permite llevar el control completo de tus cobranzas.',
      '',
      'Principales secciones:',
      '• Totales en Bs$ y USD con conversión automática',
      '• Tasa BCV en tiempo real con convertidor flotante',
      '• Dashboard con resumen de tu situación financiera',
    ],
  },
  {
    title: 'Clientes',
    icon: '👥',
    content: [
      'Registra tus clientes desde la pantalla principal.',
      '',
      'Puedes:',
      '• Agregar nuevos clientes con nombre y teléfono',
      '• Ver el saldo pendiente de cada uno',
      '• Llevar el control de deudas actualizadas en tiempo real',
    ],
  },
  {
    title: 'Movimientos',
    icon: '💰',
    content: [
      'Registra abonos y cargos a cada cliente.',
      '',
      'Desde la ficha de cada cliente:',
      '• Agrega abonos para reducir la deuda',
      '• Registra cargos adicionales si es necesario',
      '• Cada movimiento se guarda y sincroniza automáticamente',
    ],
  },
  {
    title: 'WhatsApp y QR',
    icon: '📱',
    content: [
      'Envía recordatorios y datos de pago por WhatsApp.',
      '',
      'Funcionalidades:',
      '• Mensajes personalizables con plantillas',
      '• Copia automática del QR al portapapeles',
      '• Enlace directo a wa.me para enviar pedidos',
    ],
  },
  {
    title: 'Estadísticas',
    icon: '📊',
    content: [
      'Visualiza el rendimiento de tus cobranzas.',
      '',
      'La pantalla de Estadísticas te muestra:',
      '• Métricas del mes (cobrado, pendiente, total)',
      '• Gráficos de evolución de tus deudas',
      '• Datos actualizados en tiempo real',
    ],
  },
];

function UserManualModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const total = SLIDES.length;

  const handleRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    App.addListener('backButton', (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }).then(h => { handleRef.current = h; });
    return () => { handleRef.current?.remove(); };
  }, [onClose]);

  const scrollTo = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const card = el.children[index] as HTMLElement;
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    },
    [],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    const scrollLeft = el.scrollLeft;
    const index = Math.round(scrollLeft / containerWidth);
    if (index >= 0 && index < total) setCurrent(index);
  }, [total]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const goNext = useCallback(() => {
    if (current < total - 1) {
      const next = current + 1;
      setCurrent(next);
      scrollTo(next);
    }
  }, [current, total, scrollTo]);

  const goPrev = useCallback(() => {
    if (current > 0) {
      const prev = current - 1;
      setCurrent(prev);
      scrollTo(prev);
    }
  }, [current, scrollTo]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Manual de usuario"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-2xl animate-conv-in text-white">
                <div
          ref={scrollRef}
          className="mb-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scroll-smooth"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {SLIDES.map((slide, _i) => (
            <div
              key={slide.title}
              className="min-w-[85vw] snap-center rounded-xl bg-slate-800 p-5"
            >
              <div className="text-4xl mb-3">{slide.icon}</div>
              <h3 className="text-lg font-bold">{slide.title}</h3>
              <div className="mt-3 space-y-1.5 text-sm text-slate-300">
                {slide.content.map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setCurrent(i);
                  scrollTo(i);
                }}
                className={`h-2 rounded-full transition-colors ${
                  i === current ? 'w-6 bg-emerald-400' : 'w-2 bg-slate-600'
                }`}
                aria-label={`Ir a tarjeta ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={current === 0}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600 disabled:opacity-40"
            >
              Anterior
            </button>
            {current === total - 1 ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
              >
                ¡Entendido!
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
              >
                Siguiente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
