import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import Layout from '../components/Layout';
import { api, type Rate } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
import { invalidateSettings } from '../lib/settings';
import type { PagoMovilConfig } from '../lib/whatsapp';

export default function Settings() {
  const [rate, setRate] = useState<Rate | null>(null);
  const [history, setHistory] = useState<Rate[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  const [mDate, setMDate] = useState('');
  const [mUsdVes, setMUsdVes] = useState('');
  const [manualMsg, setManualMsg] = useState('');
  const [manualMsgType, setManualMsgType] = useState<'ok' | 'err'>('ok');

  const [curPin, setCurPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confPin, setConfPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  const [pago, setPago] = useState<PagoMovilConfig | null>(null);
  const [pBanco, setPBanco] = useState('');
  const [pTipoDoc, setPTipoDoc] = useState('V');
  const [pDocumento, setPDocumento] = useState('');
  const [pTelefono, setPTelefono] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [savingPago, setSavingPago] = useState(false);
  const [pagoMsg, setPagoMsg] = useState('');
  const [pagoMsgType, setPagoMsgType] = useState<'ok' | 'err'>('ok');

  const [wUrl, setWUrl] = useState('');
  const [wToken, setWToken] = useState('');
  const [savingWorker, setSavingWorker] = useState(false);
  const [checkingWorker, setCheckingWorker] = useState(false);
  const [wMsg, setWMsg] = useState('');
  const [wMsgType, setWMsgType] = useState<'ok' | 'err'>('ok');
  const [workerStatus, setWorkerStatus] = useState<{ connected: boolean; phone: string | null } | null>(null);
  const [workerQr, setWorkerQr] = useState<string | null>(null);
  const [linkingWorker, setLinkingWorker] = useState(false);
  const [unlinkingWorker, setUnlinkingWorker] = useState(false);

  const notify = (text: string, type: 'ok' | 'err', setter: (v: string) => void, msetter: (t: 'ok' | 'err') => void) => {
    setter(text);
    msetter(type);
  };

  const load = async () => {
    const [r, h, p] = await Promise.all([
      api<{ rate: Rate | null }>('rates', { query: { action: 'latest' } }),
      api<{ history: Rate[] }>('rates', { query: { action: 'history', limit: 15 } }),
      api<{ pago: PagoMovilConfig | null; whatsappBaseUrl: string; whatsappToken: string }>('settings'),
    ]);
    setRate(r.rate);
    setHistory(h.history);
    setWUrl(p.whatsappBaseUrl ?? '');
    setWToken(p.whatsappToken ?? '');
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
    setMsg('');
    try {
      const r = await api<{ ok: boolean; rate: Rate | null }>('rates', {
        method: 'POST',
        query: { action: 'refresh' },
      });
      setRate(r.rate);
      notify(
        r.rate
          ? `Tasa actualizada: ${fmtNum(r.rate.usd_ves)} Bs/USD (${r.rate.date})`
          : 'No se encontró una tasa nueva.',
        'ok',
        setMsg,
        setMsgType,
      );
      await load();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error al consultar el BCV.',
        'err',
        setMsg,
        setMsgType,
      );
    } finally {
      setRefreshing(false);
    }
  };

  const saveManual = async (e: FormEvent) => {
    e.preventDefault();
    setManualMsg('');
    try {
      const usd_ves = parseFloat(mUsdVes.replace(',', '.'));
      const r = await api<{ ok: boolean; rate: Rate | null }>('rates', {
        method: 'POST',
        query: { action: 'manual' },
        body: { date: mDate, usd_ves },
      });
      notify(
        r.rate
          ? `Tasa guardada: ${fmtNum(r.rate.usd_ves)} Bs/USD`
          : 'Tasa guardada.',
        'ok',
        setManualMsg,
        setManualMsgType,
      );
      setMUsdVes('');
      await load();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error al guardar la tasa.',
        'err',
        setManualMsg,
        setManualMsgType,
      );
    }
  };

  const changePin = async (e: FormEvent) => {
    e.preventDefault();
    setPinMsg('');
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinMsg('El nuevo PIN debe tener entre 4 y 6 dígitos.');
      return;
    }
    if (newPin !== confPin) {
      setPinMsg('Los PIN no coinciden.');
      return;
    }
    try {
      await api('auth', {
        method: 'POST',
        query: { action: 'change-pin' },
        body: { current: curPin, next: newPin },
      });
      setPinMsg('PIN actualizado correctamente.');
      setCurPin('');
      setNewPin('');
      setConfPin('');
    } catch (err) {
      setPinMsg(err instanceof Error ? err.message : 'Error al cambiar el PIN');
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
    setPagoMsg('');
    if (!pBanco.trim() && !pDocumento.trim() && !pTelefono.trim()) {
      setPagoMsg('Completa al menos el banco, el documento o el teléfono.');
      setPagoMsgType('err');
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
      setPagoMsg('Datos de pago móvil guardados.');
      setPagoMsgType('ok');
      invalidateSettings();
    } catch (err) {
      setPagoMsg(err instanceof Error ? err.message : 'Error al guardar el pago móvil.');
      setPagoMsgType('err');
    } finally {
      setSavingPago(false);
    }
  };

  const removeQr = async () => {
    setPagoMsg('');
    try {
      const q = await api<{ ok: boolean; hasQr: boolean; qrFile: string }>('qr', {
        method: 'POST',
        body: { remove: true },
      });
      setPago((p) => (p ? { ...p, hasQr: false, qrFile: '', qrUrl: '' } : p));
      setQrPreview(null);
      setQrFile(null);
      setPagoMsg(q.hasQr ? 'No se pudo quitar el QR.' : 'QR eliminado.');
      setPagoMsgType('ok');
      invalidateSettings();
    } catch (err) {
      setPagoMsg(err instanceof Error ? err.message : 'Error al quitar el QR.');
      setPagoMsgType('err');
    }
  };

  const saveWorker = async (e: FormEvent) => {
    e.preventDefault();
    setWMsg('');
    setSavingWorker(true);
    try {
      const r = await api<{ ok: boolean; whatsappBaseUrl: string; whatsappToken: string }>('settings', {
        method: 'PUT',
        query: { action: 'worker' },
        body: { whatsappBaseUrl: wUrl, whatsappToken: wToken },
      });
      setWUrl(r.whatsappBaseUrl ?? '');
      setWToken(r.whatsappToken ?? '');
      notify(
        'Servidor de WhatsApp guardado.',
        'ok',
        setWMsg,
        setWMsgType,
      );
      invalidateSettings();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error al guardar el servidor de WhatsApp.',
        'err',
        setWMsg,
        setWMsgType,
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
      notify('Guarda primero la URL del worker.', 'err', setWMsg, setWMsgType);
      return;
    }
    setCheckingWorker(true);
    setWMsg('');
    try {
      const res = await fetch(`${url}/status`);
      const data = (await res.json().catch(() => ({}))) as { connected?: boolean; phone?: string | null };
      if (res.ok) {
        setWorkerStatus({ connected: Boolean(data.connected), phone: data.phone ?? null });
        notify(
          data.connected
            ? `Worker conectado (${data.phone ?? 'WhatsApp vinculado'}). El botón adjunta QR y envía el mensaje.`
            : 'Worker activo, pero WhatsApp aún no está vinculado. Pulsa «Vincular WhatsApp» y escanea el QR.',
          data.connected ? 'ok' : 'err',
          setWMsg,
          setWMsgType,
        );
      } else {
        notify('El worker respondió con un error. Revisa la URL.', 'err', setWMsg, setWMsgType);
      }
    } catch {
      notify('No se pudo conectar con el worker. Revisa la URL.', 'err', setWMsg, setWMsgType);
    } finally {
      setCheckingWorker(false);
    }
  };

  const linkWorker = async () => {
    const url = workerBase();
    if (!/^https?:\/\//.test(url)) {
      notify('Guarda primero la URL del worker.', 'err', setWMsg, setWMsgType);
      return;
    }
    setLinkingWorker(true);
    setWMsg('');
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
          notify('WhatsApp ya está vinculado.', 'ok', setWMsg, setWMsgType);
        } else if (data.hasQr) {
          setWorkerQr(`${url}/qr.png?t=${Date.now()}`);
          notify('Escanea el QR con tu WhatsApp: Ajustes → Dispositivos vinculados.', 'ok', setWMsg, setWMsgType);
        } else {
          notify('El worker no generó un QR ahora. Intenta de nuevo en unos segundos.', 'err', setWMsg, setWMsgType);
        }
      } else {
        notify('El worker respondió con un error al vincular.', 'err', setWMsg, setWMsgType);
      }
    } catch {
      notify('No se pudo conectar con el worker.', 'err', setWMsg, setWMsgType);
    } finally {
      setLinkingWorker(false);
    }
  };

  const unlinkWorker = async () => {
    const url = workerBase();
    setUnlinkingWorker(true);
    setWMsg('');
    try {
      const res = await fetch(`${url}/unlink`, {
        method: 'POST',
        headers: workerHeaders(),
      });
      if (res.ok) {
        setWorkerStatus({ connected: false, phone: null });
        setWorkerQr(null);
        notify('WhatsApp desvinculado del worker.', 'ok', setWMsg, setWMsgType);
      } else {
        notify('No se pudo desvincular.', 'err', setWMsg, setWMsgType);
      }
    } catch {
      notify('No se pudo conectar con el worker.', 'err', setWMsg, setWMsgType);
    } finally {
      setUnlinkingWorker(false);
    }
  };

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-slate-800">Ajustes</h1>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold text-slate-800">Tasa BCV</h2>
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
              onClick={refresh}
              disabled={refreshing}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {refreshing ? 'Consultando…' : 'Actualizar desde BCV'}
            </button>
          </div>
          {msg && (
            <p
              className={`mt-3 text-sm ${
                msgType === 'ok' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {msg}
            </p>
          )}

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
            <button
              type="submit"
              className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Guardar tasa
            </button>
            {manualMsg && (
              <p
                className={`mt-2 text-sm ${
                  manualMsgType === 'ok' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {manualMsg}
              </p>
            )}
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
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold text-slate-800">Pago móvil (WhatsApp)</h2>
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
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Quitar QR
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

            <button
              type="submit"
              disabled={savingPago}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {savingPago ? 'Guardando…' : 'Guardar pago móvil'}
            </button>
            {pagoMsg && (
              <p
                className={`text-sm ${
                  pagoMsgType === 'ok' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {pagoMsg}
              </p>
            )}
          </form>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold text-slate-800">Servidor de WhatsApp (worker)</h2>
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
              <button
                type="submit"
                disabled={savingWorker}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {savingWorker ? 'Guardando…' : 'Guardar worker'}
              </button>
              <button
                type="button"
                onClick={checkWorker}
                disabled={checkingWorker || savingWorker}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {checkingWorker ? 'Comprobando…' : 'Comprobar estado'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={linkWorker}
                disabled={linkingWorker || !workerBase()}
                className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {linkingWorker ? 'Generando QR…' : workerStatus?.connected ? 'Re-vincular' : 'Vincular WhatsApp'}
              </button>
              <button
                type="button"
                onClick={unlinkWorker}
                disabled={unlinkingWorker || !workerBase()}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
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
            {wMsg && (
              <p
                className={`text-sm ${
                  wMsgType === 'ok' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {wMsg}
              </p>
            )}
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Primera vez: crea tu servicio gratis en Render con el archivo
            «render.yaml» del repo, define WA_SECRET, SUPABASE_URL y
            SUPABASE_SERVICE_ROLE_KEY, y vincula WhatsApp escaneando el QR que
            genera el worker. La sesión se respalda en Supabase Storage.
          </p>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold text-slate-800">Cambiar PIN</h2>
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
            {pinMsg && (
              <p className="mt-3 text-sm text-slate-600">{pinMsg}</p>
            )}
            <button
              type="submit"
              className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Cambiar PIN
            </button>
          </form>
        </section>
      </div>
    </Layout>
  );
}