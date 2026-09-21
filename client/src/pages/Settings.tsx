import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import Layout from '../components/Layout';
import { api, type Rate } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
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
  const [pWorkerUrl, setPWorkerUrl] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [savingPago, setSavingPago] = useState(false);
  const [pagoMsg, setPagoMsg] = useState('');
  const [pagoMsgType, setPagoMsgType] = useState<'ok' | 'err'>('ok');

  const [wa, setWa] = useState<{ connected: boolean; phone: string | null } | null>(null);
  const [checkingWa, setCheckingWa] = useState(false);
  const [waMsg, setWaMsg] = useState('');

  const notify = (text: string, type: 'ok' | 'err', setter: (v: string) => void, msetter: (t: 'ok' | 'err') => void) => {
    setter(text);
    msetter(type);
  };

  const load = async () => {
    const [r, h, p] = await Promise.all([
      api<{ rate: Rate | null }>('rates', { query: { action: 'latest' } }),
      api<{ history: Rate[] }>('rates', { query: { action: 'history', limit: 15 } }),
      api<{ pago: PagoMovilConfig | null }>('settings'),
    ]);
    setRate(r.rate);
    setHistory(h.history);
    if (p.pago) {
      setPago(p.pago);
      setPBanco(p.pago.banco);
      setPTipoDoc(p.pago.tipoDoc);
      setPDocumento(p.pago.documento);
      setPTelefono(p.pago.telefono);
      setPWorkerUrl(p.pago.whatsappBaseUrl);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const checkWorker = async () => {
    setCheckingWa(true);
    setWa(null);
    setWaMsg('');
    try {
      const base = pWorkerUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${base}/status`);
      const data = (await res.json().catch(() => ({}))) as {
        connected?: boolean;
        phone?: string | null;
      };
      setWa({ connected: Boolean(data.connected), phone: data.phone ?? null });
    } catch {
      setWa({ connected: false, phone: null });
      setWaMsg('No se pudo contactar el worker.');
    } finally {
      setCheckingWa(false);
    }
  };

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
    if (pWorkerUrl.trim() && !/^https?:\/\//i.test(pWorkerUrl.trim())) {
      setPagoMsg('La URL del worker debe empezar con http:// o https://');
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
          whatsappBaseUrl: pWorkerUrl.trim(),
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
    } catch (err) {
      setPagoMsg(err instanceof Error ? err.message : 'Error al quitar el QR.');
      setPagoMsgType('err');
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

            <label className="block text-sm font-medium">
              URL del servidor de envío (worker WhatsApp)
              <input
                type="text"
                inputMode="url"
                placeholder="https://tu-worker.tailnet.ts.net"
                value={pWorkerUrl}
                onChange={(e) => setPWorkerUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-slate-400">
                Opcional. Si la dejas vacía, el botón de pago móvil abre WhatsApp
                con el mensaje y el QR precargados. Si la configuras, el mensaje
                se envía automáticamente desde tu número vinculado.
              </span>
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
          <h2 className="text-lg font-bold text-slate-800">Servidor de WhatsApp</h2>
          <p className="mt-1 text-sm text-slate-500">
            El worker vinculado a tu WhatsApp permite enviar el mensaje de pago
            móvil con el QR como imagen adjunta, sin depender del enlace wa.me.
          </p>
          {!pWorkerUrl.trim() ? (
            <p className="mt-4 text-sm text-slate-500">
              Sin worker configurado. Los botones usarán el enlace wa.me;
              configura la &quot;URL del servidor de envío&quot; en la tarjeta de
              pago móvil para habilitar el envío automático.
            </p>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                onClick={checkWorker}
                disabled={checkingWa}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {checkingWa ? 'Comprobando…' : 'Comprobar conexión'}
              </button>
              {wa && (
                <p
                  className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    wa.connected
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {wa.connected
                    ? `Conectado${wa.phone ? ` · ${wa.phone}` : ''}`
                    : 'No conectado'}
                </p>
              )}
              {waMsg && <p className="mt-2 text-sm text-amber-700">{waMsg}</p>}
              <p className="mt-3 text-xs text-slate-400">
                El worker se vincula por separado (sesión adicional de tu
                WhatsApp). Con esta URL activa, el botón &quot;Pago móvil&quot;
                envía directamente en lugar de abrir wa.me.
              </p>
            </div>
          )}
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