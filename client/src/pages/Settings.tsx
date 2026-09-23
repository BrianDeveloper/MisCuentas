import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import Layout from '../components/Layout';
import Spinner from '../components/Spinner';
import { api, ApiError, fetchBackup, restoreBackup, type BackupData, type Rate } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
import { invalidarClientes, invalidarTasa, invalidarAjustes } from '../lib/store/invalidations';
import { getRateHistory, getSettings } from '../lib/store/ajustes';
import { isNative } from '../lib/links';
import { useTasaStore } from '../lib/store/tasa';
import { useToast } from '../lib/toast';
import { isValidPin, normalizePin } from '../lib/validation';
import { hapticSuccess } from '../lib/haptics';
import { useTheme } from '../lib/theme';
import { queueOrRun } from '../lib/offline';
import {
  DEFAULT_BALANCE_TEMPLATE,
  DEFAULT_PAGO_TEMPLATE,
  type PagoMovilConfig,
} from '../lib/whatsapp';

type SectionId = 'theme' | 'rate' | 'pago' | 'messages' | 'backup' | 'pin';
const SECTION_ORDER: SectionId[] = ['theme', 'rate', 'pago', 'messages', 'backup', 'pin'];
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
  const { rate, refresh: refreshRate } = useTasaStore();
  const { pref: themePref, setPref: setThemePref } = useTheme();

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

  const [mReminder, setMReminder] = useState('');
  const [mPago, setMPago] = useState('');
  const [savingMsgs, setSavingMsgs] = useState(false);

  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  const doBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const data = await fetchBackup();
      const text = JSON.stringify(data, null, 2);
      const filename = `mis-cuentas-backup-${data.exported_at.slice(0, 10)}.json`;
      if (isNative()) {
        const saved = await Filesystem.writeFile({
          path: filename,
          data: text,
          directory: Directory.Cache,
          recursive: true,
        });
        await Share.share({
          title: filename,
          files: [saved.uri],
          dialogTitle: 'Respaldo Mis Cuentas',
        });
      } else {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      toast(`Respaldo de ${data.clients.length} clientes creado.`, 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al crear el respaldo', 'err');
    } finally {
      setBackingUp(false);
    }
  };

  const doRestore = async (file: File) => {
    if (restoring) return;
    let data: BackupData;
    try {
      data = JSON.parse(await file.text()) as BackupData;
    } catch {
      toast('El archivo no es un respaldo JSON válido.', 'err');
      return;
    }
    if (data?.version !== 1 || !Array.isArray(data.clients)) {
      toast('El archivo no es un respaldo de Mis Cuentas.', 'err');
      return;
    }
    if (
      !window.confirm(
        `Restaurar eliminará TODOS los datos actuales y los reemplazará por el respaldo (${data.clients.length} clientes). ¿Continuar?`,
      )
    )
      return;
    setRestoring(true);
    try {
      const restored = await restoreBackup(data);
      toast(`Respaldo restaurado: ${restored} clientes.`, 'ok');
      invalidarClientes();
      invalidarTasa();
      invalidarAjustes();
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al restaurar el respaldo', 'err');
    } finally {
      setRestoring(false);
    }
  };

  const load = async (force = false) => {
    const [h, p] = await Promise.all([
      getRateHistory(force),
      getSettings(force),
    ]);
    setHistory(h ?? []);
    const cfg = p ?? { pago: null, msgReminder: '', msgPago: '' };
    setMReminder(cfg.msgReminder?.trim() ? cfg.msgReminder : DEFAULT_BALANCE_TEMPLATE);
    setMPago(cfg.msgPago?.trim() ? cfg.msgPago : DEFAULT_PAGO_TEMPLATE);
    if (cfg.pago) {
      setPago(cfg.pago);
      setPBanco(cfg.pago.banco);
      setPTipoDoc(cfg.pago.tipoDoc);
      setPDocumento(cfg.pago.documento);
      setPTelefono(cfg.pago.telefono);
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
      invalidarClientes();
      invalidarTasa();
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
      const body: Record<string, unknown> = { date: mDate, usd_ves };
      const { queued, result: manualResult } =
        await queueOrRun<{ ok: boolean; rate: Rate | null }>(
          'rate-manual',
          async () => {
            let res: { ok: boolean; rate: Rate | null };
            try {
              res = await api<{ ok: boolean; rate: Rate | null }>('rates', {
                method: 'POST',
                query: { action: 'manual' },
                body,
              });
            } catch (err) {
              if (err instanceof ApiError && err.status === 409) {
                if (
                  window.confirm(
                    'Esta fecha ya tiene movimientos registrados. ¿Forzar el cambio de tasa? (No altera los movimientos ya guardados.)',
                  )
                ) {
                  body.force = true;
                  res = await api<{ ok: boolean; rate: Rate | null }>('rates', {
                    method: 'POST',
                    query: { action: 'manual' },
                    body,
                  });
                } else {
                  const cancel = new Error('cancelado');
                  cancel.name = 'ManualRateCancelled';
                  throw cancel;
                }
              } else {
                throw err;
              }
            }
            return res;
          },
          body,
        );
      if (queued) {
        toast('Tasa guardada sin conexión. Se sincronizará al reconectar.', 'info');
      } else if (manualResult?.rate) {
        toast(
          `Tasa guardada: ${fmtNum(manualResult.rate.usd_ves)} Bs/USD`,
          'ok',
        );
      } else {
        toast('Tasa guardada.', 'ok');
      }
      setMUsdVes('');
      invalidarClientes();
      invalidarTasa();
      if (!queued) await load();
    } catch (err) {
      if (err instanceof Error && err.name === 'ManualRateCancelled') return;
      toast(err instanceof Error ? err.message : 'Error al guardar la tasa.', 'err');
    } finally {
      setBusyManual(false);
    }
  };

  const changePin = async (e: FormEvent) => {
    e.preventDefault();
    if (busyPin) return;
    if (!isValidPin(curPin)) {
      toast('Ingresa tu PIN actual (4 a 6 dígitos).', 'err');
      return;
    }
    if (!isValidPin(newPin)) {
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
      hapticSuccess();
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
      hapticSuccess();
      invalidarAjustes();
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
      invalidarAjustes();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al quitar el QR.', 'err');
    } finally {
      setRemovingQr(false);
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
      hapticSuccess();
      invalidarAjustes();
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
        <SectionCard title="Tema" open={openSections.has('theme')} onToggle={() => toggleSection('theme')}>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-600">
              Elige el aspecto de la app. «Sistema» sigue el tema de tu
              dispositivo automáticamente.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['system', 'Sistema'],
                  ['light', 'Claro'],
                  ['dark', 'Oscuro'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setThemePref(value)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    themePref === value
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

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

        <SectionCard title="Respaldo" open={openSections.has('backup')} onToggle={() => toggleSection('backup')}>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              Descarga tu base de datos completa (clientes, movimientos, tasas y
              configuración) para guardarla o restaurarla en otro dispositivo.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={doBackup}
                disabled={backingUp}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {backingUp && <Spinner />}
                {backingUp ? 'Creando…' : 'Descargar respaldo'}
              </button>
              <label
                className={`inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 ${
                  restoring ? 'pointer-events-none opacity-60' : 'cursor-pointer'
                }`}
              >
                {restoring && <Spinner />}
                {restoring ? 'Restaurando…' : 'Restaurar respaldo'}
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={restoring}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void doRestore(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Restaurar reemplaza todos los datos actuales (no se puede deshacer).
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Cambiar PIN" open={openSections.has('pin')} onToggle={() => toggleSection('pin')}>
          <form onSubmit={changePin} className="mt-4">
            <label className="block text-sm font-medium">
              PIN actual
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={curPin}
                onChange={(e) => setCurPin(normalizePin(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Nuevo PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(normalizePin(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Confirmar nuevo PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={confPin}
                onChange={(e) => setConfPin(normalizePin(e.target.value))}
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