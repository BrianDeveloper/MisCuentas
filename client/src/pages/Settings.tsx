import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import Layout from '../components/Layout';
import Spinner from '../components/Spinner';
import { api, type Rate } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
import { invalidateClientData, invalidateRate } from '../lib/cache';
import { invalidateSettings } from '../lib/settings';
import { useRate } from '../lib/useRate';
import { useToast } from '../lib/toast';
import {
  DEFAULT_BALANCE_TEMPLATE,
  DEFAULT_PAGO_TEMPLATE,
  type PagoMovilConfig,
} from '../lib/whatsapp';

type SectionId = 'rate' | 'pago' | 'worker' | 'messages' | 'pin';
const SECTION_ORDER: SectionId[] = ['rate', 'pago', 'worker', 'messages', 'pin'];
const OPEN_KEY = 'mc_settings_open';

function loadOpenSections(): Set<SectionId> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as SectionId[];
      const valid = arr.filter((id): id is SectionId =>
        (SECTION_ORDER as string[]).includes(id),
      );
      if (valid.length > 0) return new Set(valid);
    }
  } catch { /* estado por defecto */ }
  return new Set([SECTION_ORDER[0]]);
}

function SectionCard({
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

function SubmitBtn({
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

export default function Settings() {
  const { toast } = useToast();
  const { rate, refresh: refreshRate } = useRate();

  const [history, setHistory] = useState<Rate[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [mDate, setMDate] = useState('');
  const [mUsdVes, setMUsdVes] = useState('');
  const [busyManual, setBusyManual] = useState(false);

  const [curPin, setCurPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confPin, setConfPin] = useState('');
  const [busyPin, setBusyPin] = useState(false);

  const [pago, setPago] = useState<PagoMovilConfig | null>(null);
  const [pBanco, setPBanco] = useState('');
  const [pTipoDoc, setPTipoDoc] = useState('V');
  const [pDocumento, setPDocumento] = useState('');
  const [pTelefono, setPTelefono] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [savingPago, setSavingPago] = useState(false);
  const [removingQr, setRemovingQr] = useState(false);

  const [wUrl, setWUrl] = useState('');
  const [wToken, setWToken] = useState('');
  const [savingWorker, setSavingWorker] = useState(false);
  const [checkingWorker, setCheckingWorker] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<{ connected: boolean; phone: string | null } | null>(null);
  const [workerQr, setWorkerQr] = useState<string | null>(null);
  const [linkingWorker, setLinkingWorker] = useState(false);
  const [unlinkingWorker, setUnlinkingWorker] = useState(false);

  const [mReminder, setMReminder] = useState('');
  const [mPago, setMPago] = useState('');
  const [savingMsgs, setSavingMsgs] = useState(false);

  const [openSections, setOpenSections] = useState<Set<SectionId>>(loadOpenSections);

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch { /* noop */ }
      return next;
    });
  };

  const load = async () => {
    const [h, p] = await Promise.all([
      api<{ history: Rate[] }>('rates', { query: { action: 'history', limit: 15 } }),
      api<{ pago: PagoMovilConfig | null; whatsappBaseUrl: string; whatsappToken: string; msgReminder: string; msgPago: string }>('settings'),
    ]);
    setHistory(h.history);
    setWUrl(p.whatsappBaseUrl ?? '');
    setWToken(p.whatsappToken ?? '');
    setMReminder(p.msgReminder?.trim() ? p.msgReminder : DEFAULT_BALANCE_TEMPLATE);
    setMPago(p.msgPago?.trim() ? p.msgPago : DEFAULT_PAGO_TEMPLATE);
    if (p.pago) {
      setPago(p.pago);
      setPBanco(p.pago.banco);
      setPTipoDoc(p.pago.tipoDoc);
      setPDocumento(p.pago.documento);
      setPTelefono(p.pago.telefono);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await api<{ ok: boolean; rate: Rate | null }>('rates', {
        method: 'POST',
        query: { action: 'refresh' },
      });
      await refreshRate();
      toast(
        r.rate
          ? `Tasa actualizada: ${fmtNum(r.rate.usd_ves)} Bs/USD (${r.rate.date})`
          : 'No se encontró una tasa nueva.',
        'ok',
      );
      invalidateClientData();
      invalidateRate();
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al consultar el BCV.', 'err');
    } finally {
      setRefreshing(false);
    }
  };

  const saveManual = async (e: FormEvent) => {
    e.preventDefault();
    if (busyManual) return;
    setBusyManual(true);
    try {
      const usd_ves = parseFloat(mUsdVes.replace(',', '.'));
      const r = await api<{ ok: boolean; rate: Rate | null }>('rates', {
        method: 'POST',
        query: { action: 'manual' },
        body: { date: mDate, usd_ves },
      });
      toast(
        r.rate
          ? `Tasa guardada: ${fmtNum(r.rate.usd_ves)} Bs/USD`
          : 'Tasa guardada.',
        'ok',
      );
      invalidateClientData();
      invalidateRate();
      setMUsdVes('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar la tasa.', 'err');
    } finally {
      setBusyManual(false);
    }
  };

  const changePin = async (e: FormEvent) => {
    e.preventDefault();
    if (busyPin) return;
    if (!/^\d{4,6}$/.test(newPin)) {
      toast('El nuevo PIN debe tener entre 4 y 6 dígitos.', 'err');
      return;
    }
    if (newPin !== confPin) {
      toast('Los PIN no coinciden.', 'err');
      return;
    }
    setBusyPin(true);
    try {
      await api('auth', {
        method: 'POST',
        query: { action: 'change-pin' },
        body: { current: curPin, next: newPin },
      });
      toast('PIN actualizado correctamente.', 'ok');
      setCurPin('');
      setNewPin('');
      setConfPin('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al cambiar el PIN', 'err');
    } finally {
      setBusyPin(false);
    }
  };

  const onQrSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setQrFile(file);
    if (!file) {
      setQrPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setQrPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const savePagoMovil = async (e: FormEvent) => {
    e.preventDefault();
    if (savingPago) return;
    if (!pBanco.trim() && !pDocumento.trim() && !pTelefono.trim()) {
      toast('Completa al menos el banco, el documento o el teléfono.', 'err');
      return;
    }
    setSavingPago(true);
    try {
      const r = await api<{ ok: boolean; pago: PagoMovilConfig }>('settings', {
        method: 'PUT',
        query: { action: 'update' },
        body: {
          banco: pBanco,
          tipoDoc: pTipoDoc,
          documento: pDocumento,
          telefono: pTelefono,
        },
      });
      let pagoUpdated = r.pago;
      if (qrFile) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
          reader.readAsDataURL(qrFile);
        });
        const q = await api<{ ok: boolean; hasQr: boolean; qrFile: string; qrUrl?: string }>(
          'qr',
          {
            method: 'POST',
            body: { dataBase64: base64, mime: qrFile.type },
          },
        );
        pagoUpdated = {
          ...pagoUpdated,
          hasQr: q.hasQr,
          qrFile: q.qrFile,
          qrUrl: q.qrUrl ?? '',
        };
      }
      setPago(pagoUpdated);
      setQrFile(null);
      setQrPreview(null);
      toast('Datos de pago móvil guardados.', 'ok');
      invalidateSettings();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el pago móvil.', 'err');
    } finally {
      setSavingPago(false);
    }
  };

  const removeQr = async () => {
    if (removingQr) return;
    setRemovingQr(true);
    try {
      const q = await api<{ ok: boolean; hasQr: boolean; qrFile: string }>('qr', {
        method: 'POST',
        body: { remove: true },
      });
      setPago((p) => (p ? { ...p, hasQr: false, qrFile: '', qrUrl: '' } : p));
      setQrPreview(null);
      setQrFile(null);
      toast(q.hasQr ? 'No se pudo quitar el QR.' : 'QR eliminado.', q.hasQr ? 'err' : 'ok');
      invalidateSettings();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al quitar el QR.', 'err');
    } finally {
      setRemovingQr(false);
    }
  };

  const saveWorker = async (e: FormEvent) => {
    e.preventDefault();
    if (savingWorker) return;
    setSavingWorker(true);
    try {
      const r = await api<{ ok: boolean; whatsappBaseUrl: string; whatsappToken: string }>('settings', {
        method: 'PUT',
        query: { action: 'worker' },
        body: { whatsappBaseUrl: wUrl, whatsappToken: wToken },
      });
      setWUrl(r.whatsappBaseUrl ?? '');
      setWToken(r.whatsappToken ?? '');
      toast('Servidor de WhatsApp guardado.', 'ok');
      invalidateSettings();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Error al guardar el servidor de WhatsApp.',
        'err',
      );
    } finally {
      setSavingWorker(false);
    }
  };

  const workerBase = (): string => wUrl.trim().replace(/\/+$/, '');
  const workerToken = (): string => wToken.trim();
  const workerHeaders = (): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(workerToken() ? { Authorization: `Bearer ${workerToken()}` } : {}),
  });

  const checkWorker = async () => {
    const url = workerBase();
    if (!/^https?:\/\//.test(url)) {
      toast('Guarda primero la URL del worker.', 'err');
      return;
    }
    if (checkingWorker) return;
    setCheckingWorker(true);
    try {
      const res = await fetch(`${url}/status`);
      const data = (await res.json().catch(() => ({}))) as { connected?: boolean; phone?: string | null };
      if (res.ok) {
        setWorkerStatus({ connected: Boolean(data.connected), phone: data.phone ?? null });
        toast(
          data.connected
            ? `Worker conectado (${data.phone ?? 'WhatsApp vinculado'}). El botón adjunta QR y envía el mensaje.`
            : 'Worker activo, pero WhatsApp aún no está vinculado. Pulsa «Vincular WhatsApp» y escanea el QR.',
          data.connected ? 'ok' : 'err',
        );
      } else {
        toast('El worker respondió con un error. Revisa la URL.', 'err');
      }
    } catch {
      toast('No se pudo conectar con el worker. Revisa la URL.', 'err');
    } finally {
      setCheckingWorker(false);
    }
  };

  const linkWorker = async () => {
    const url = workerBase();
    if (!/^https?:\/\//.test(url)) {
      toast('Guarda primero la URL del worker.', 'err');
      return;
    }
    if (linkingWorker) return;
    setLinkingWorker(true);
    setWorkerQr(null);
    try {
      const res = await fetch(`${url}/link`, {
        method: 'POST',
        headers: workerHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { connected?: boolean; hasQr?: boolean };
      if (res.ok) {
        if (data.connected) {
          setWorkerStatus({ connected: true, phone: null });
          toast('WhatsApp ya está vinculado.', 'ok');
        } else if (data.hasQr) {
          setWorkerQr(`${url}/qr.png?t=${Date.now()}`);
          toast('Escanea el QR con tu WhatsApp: Ajustes → Dispositivos vinculados.', 'ok');
        } else {
          toast('El worker no generó un QR ahora. Intenta de nuevo en unos segundos.', 'err');
        }
      } else {
        toast('El worker respondió con un error al vincular.', 'err');
      }
    } catch {
      toast('No se pudo conectar con el worker.', 'err');
    } finally {
      setLinkingWorker(false);
    }
  };

  const unlinkWorker = async () => {
    const url = workerBase();
    if (unlinkingWorker) return;
    setUnlinkingWorker(true);
    try {
      const res = await fetch(`${url}/unlink`, {
        method: 'POST',
        headers: workerHeaders(),
      });
      if (res.ok) {
        setWorkerStatus({ connected: false, phone: null });
        setWorkerQr(null);
        toast('WhatsApp desvinculado del worker.', 'ok');
      } else {
        toast('No se pudo desvincular.', 'err');
      }
    } catch {
      toast('No se pudo conectar con el worker.', 'err');
    } finally {
      setUnlinkingWorker(false);
    }
  };

  const saveMessages = async (e: FormEvent) => {
    e.preventDefault();
    if (savingMsgs) return;
    setSavingMsgs(true);
    try {
      const r = await api<{ ok: boolean; msgReminder: string; msgPago: string }>('settings', {
        method: 'PUT',
        query: { action: 'messages' },
        body: { msgReminder: mReminder, msgPago: mPago },
      });
      setMReminder(r.msgReminder ?? '');
      setMPago(r.msgPago ?? '');
      toast('Mensajes guardados.', 'ok');
      invalidateSettings();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Error al guardar los mensajes.',
        'err',
      );
    } finally {
      setSavingMsgs(false);
    }
  };

  const restoreMessages = () => {
    setMReminder(DEFAULT_BALANCE_TEMPLATE);
    setMPago(DEFAULT_PAGO_TEMPLATE);
    toast('Plantillas por defecto cargadas. Pulsa «Guardar mensajes» para aplicarlas.', 'info');
  };

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-slate-800">Ajustes</h1>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Tasa BCV" open={openSections.has('rate')} onToggle={() => toggleSection('rate')}>
          {rate ? (
            <div className="mt-3 rounded-lg bg-slate-900 p-4 text-white">
              <p className="text-3xl font-bold">
                {fmtNum(rate.usd_ves)}{' '}
                <span className="text-base font-medium text-slate-400">
                  Bs por USD
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Fecha: {fmtDate(rate.date)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Aún no hay tasa registrada. Actualízala o ingrésala manualmente.
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {refreshing && <Spinner />}
              {refreshing ? 'Consultando…' : 'Actualizar desde BCV'}
            </button>
          </div>

          <form onSubmit={saveManual} className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700">
              Ingresar tasa manualmente
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="date"
                required
                value={mDate}
                onChange={(e) => setMDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="0.0001"
                min="0"
                required
                placeholder="Bs por USD"
                value={mUsdVes}
                onChange={(e) => setMUsdVes(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <SubmitBtn
              busy={busyManual}
              busyLabel="Guardando…"
              label="Guardar tasa"
              className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            />
          </form>

          {history.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700">
                Últimas tasas
              </h3>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {history.map((h) => (
                  <li
                    key={h.date}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-slate-600">{fmtDate(h.date)}</span>
                    <span className="font-medium text-slate-900">
                      {fmtNum(h.usd_ves)} Bs
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Pago móvil (WhatsApp)" open={openSections.has('pago')} onToggle={() => toggleSection('pago')}>
          <p className="mt-1 text-sm text-slate-500">
            Estos datos se incluyen en el mensaje de WhatsApp que envías a tus
            clientes para cobrar.
          </p>
          <form onSubmit={savePagoMovil} className="mt-4 space-y-3">
            <label className="block text-sm font-medium">
              Banco
              <input
                type="text"
                placeholder="Ej: Banesco"
                value={pBanco}
                onChange={(e) => setPBanco(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-medium">
                Tipo
                <select
                  value={pTipoDoc}
                  onChange={(e) => setPTipoDoc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="V">V - Venezolano</option>
                  <option value="J">J - Jurídico</option>
                  <option value="E">E - Extranjero</option>
                  <option value="P">P - Pasaporte</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Cédula / RIF
                <input
                  type="text"
                  placeholder="Ej: 12.345.678"
                  value={pDocumento}
                  onChange={(e) => setPDocumento(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Teléfono de pago móvil
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 04120000000"
                value={pTelefono}
                onChange={(e) => setPTelefono(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <div className="rounded-lg border border-slate-200 p-3">
              <span className="text-sm font-medium text-slate-700">
                QR de pago
              </span>
              {pago?.hasQr ? (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={pago.qrUrl}
                    alt="QR de pago"
                    className="h-24 w-24 rounded-lg border border-slate-200 object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeQr}
                    disabled={removingQr}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {removingQr && <Spinner />}
                    {removingQr ? 'Quitando…' : 'Quitar QR'}
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400">
                  Aún no tienes un QR configurado.
                </p>
              )}
              <label className="mt-3 block text-sm">
                <span className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  {qrPreview ? 'Cambiar imagen' : 'Subir imagen QR'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={onQrSelected}
                  className="hidden"
                />
              </label>
              {qrPreview && (
                <img
                  src={qrPreview}
                  alt="Vista previa del QR a subir"
                  className="mt-2 h-24 w-24 rounded-lg border border-slate-200 object-contain"
                />
              )}
            </div>

            <SubmitBtn
              busy={savingPago}
              busyLabel="Guardando…"
              label="Guardar pago móvil"
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            />
          </form>
        </SectionCard>

        <SectionCard title="Servidor de WhatsApp (worker)" open={openSections.has('worker')} onToggle={() => toggleSection('worker')}>
          <p className="mt-1 text-sm text-slate-500">
            Con esto, el botón «Pago móvil» adjunta el QR como imagen y envía el
            mensaje automáticamente, sin abrir WhatsApp ni la PC. Si el worker no
            responde, la app cae a wa.me (solo texto).
          </p>
          <form onSubmit={saveWorker} className="mt-4 space-y-3">
            <label className="block text-sm font-medium">
              URL del worker
              <input
                type="url"
                placeholder="https://mis-cuentas-wa-worker.onrender.com"
                value={wUrl}
                onChange={(e) => setWUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              Token (opcional)
              <input
                type="text"
                placeholder="Dejalo vacío si el worker no lo exige"
                value={wToken}
                onChange={(e) => setWToken(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="flex items-center gap-2">
              <SubmitBtn
                busy={savingWorker}
                busyLabel="Guardando…"
                label="Guardar worker"
              />
              <button
                type="button"
                onClick={checkWorker}
                disabled={checkingWorker || savingWorker}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {checkingWorker && <Spinner />}
                {checkingWorker ? 'Comprobando…' : 'Comprobar estado'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={linkWorker}
                disabled={linkingWorker || !workerBase()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {linkingWorker && <Spinner />}
                {linkingWorker ? 'Generando QR…' : workerStatus?.connected ? 'Re-vincular' : 'Vincular WhatsApp'}
              </button>
              <button
                type="button"
                onClick={unlinkWorker}
                disabled={unlinkingWorker || !workerBase()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {unlinkingWorker && <Spinner />}
                {unlinkingWorker ? 'Desvinculando…' : 'Desvincular'}
              </button>
            </div>

            {workerStatus?.connected && (
              <p className="text-sm text-emerald-700">
                WhatsApp conectado{workerStatus.phone ? ` (${workerStatus.phone})` : ''}.
              </p>
            )}
            {workerQr && (
              <div className="rounded-lg border border-slate-200 p-3 text-center">
                <img
                  src={workerQr}
                  alt="QR para vincular WhatsApp"
                  className="mx-auto h-48 w-48"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Escanéalo con WhatsApp: Ajustes → Dispositivos vinculados → Vincular dispositivo.
                </p>
              </div>
            )}
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Primera vez: crea tu servicio gratis en Render con el archivo
            «render.yaml» del repo, define WA_SECRET, SUPABASE_URL y
            SUPABASE_SERVICE_ROLE_KEY, y vincula WhatsApp escaneando el QR que
            genera el worker. La sesión se respalda en Supabase Storage.
          </p>
        </SectionCard>

        <SectionCard title="Mensajes de WhatsApp" open={openSections.has('messages')} onToggle={() => toggleSection('messages')}>
          <p className="mt-1 text-sm text-slate-500">
            Edita el texto de los mensajes que se envían a tus clientes. Al
            guardar se aplican al instante; si borras todo el texto y guardas,
            se restaura la plantilla por defecto.
          </p>
          <form onSubmit={saveMessages} className="mt-4 space-y-4">
            <label className="block text-sm font-medium">
              Recordatorio de saldo
              <textarea
                rows={6}
                value={mReminder}
                onChange={(e) => setMReminder(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </label>
            <label className="block text-sm font-medium">
              Pago móvil
              <textarea
                rows={6}
                value={mPago}
                onChange={(e) => setMPago(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </label>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Variables:</span>
              <span className="block pt-1">
                Recordatorio: {'{nombre} {fecha} {monto} {usd} {tasa}'}
              </span>
              <span className="block">
                Pago móvil: {'{banco} {tipo} {documento} {telefono} {monto} {usd} {qr}'}
              </span>
              <p className="pt-1 text-slate-400">
                Las líneas con variables vacías se omiten. {`{qr}`} solo se
                inserta cuando hay un QR cargado.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SubmitBtn
                busy={savingMsgs}
                busyLabel="Guardando…"
                label="Guardar mensajes"
              />
              <button
                type="button"
                onClick={restoreMessages}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Restaurar por defecto
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Cambiar PIN" open={openSections.has('pin')} onToggle={() => toggleSection('pin')}>
          <form onSubmit={changePin} className="mt-4">
            <label className="block text-sm font-medium">
              PIN actual
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={curPin}
                onChange={(e) => setCurPin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Nuevo PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Confirmar nuevo PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={confPin}
                onChange={(e) => setConfPin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <SubmitBtn
              busy={busyPin}
              busyLabel="Guardando…"
              label="Cambiar PIN"
              className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            />
          </form>
        </SectionCard>
      </div>
    </Layout>
  );
}