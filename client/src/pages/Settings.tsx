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
  const [pBaseUrl, setPBaseUrl] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [savingPago, setSavingPago] = useState(false);
  const [pagoMsg, setPagoMsg] = useState('');
  const [pagoMsgType, setPagoMsgType] = useState<'ok' | 'err'>('ok');

  const [wa, setWa] = useState<{ connected: boolean; phone: string | null } | null>(null);
  const [linking, setLinking] = useState(false);
  const [qrTs, setQrTs] = useState(0);
  const [waMsg, setWaMsg] = useState('');

  const notify = (text: string, type: 'ok' | 'err', setter: (v: string) => void, msetter: (t: 'ok' | 'err') => void) => {
    setter(text);
    msetter(type);
  };

  const load = async () => {
    const [r, h, p] = await Promise.all([
      api<{ rate: Rate | null }>('/api/rates/latest'),
      api<{ history: Rate[] }>('/api/rates/history?limit=15'),
      api<{ pago: PagoMovilConfig | null; qrBase: string }>(
        '/api/settings/pago-movil',
      ),
    ]);
    setRate(r.rate);
    setHistory(h.history);
    if (p.pago) {
      setPago({ ...p.pago, baseUrl: p.qrBase });
      setPBanco(p.pago.banco);
      setPTipoDoc(p.pago.tipoDoc);
      setPDocumento(p.pago.documento);
      setPTelefono(p.pago.telefono);
      setPBaseUrl(p.qrBase);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    api<{ connected: boolean; phone: string | null }>('/api/whatsapp/status')
      .then(setWa)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!linking) return;
    const statusId = window.setInterval(async () => {
      try {
        const s = await api<{ connected: boolean; phone: string | null }>(
          '/api/whatsapp/status',
        );
        setWa(s);
        if (s.connected) setLinking(false);
      } catch {
        /* reintenta */
      }
    }, 2000);
    const qrId = window.setInterval(() => setQrTs(Date.now()), 8000);
    return () => {
      window.clearInterval(statusId);
      window.clearInterval(qrId);
    };
  }, [linking]);

  const linkWhatsApp = async () => {
    setWaMsg('');
    setLinking(true);
    try {
      const r = await api<{ connected: boolean; qr: string | null }>(
        '/api/whatsapp/link',
        { method: 'POST' },
      );
      if (r.connected) {
        setWa({ connected: true, phone: null });
        setLinking(false);
      } else {
        setWaMsg('Escanea el QR desde tu teléfono.');
        setQrTs(Date.now());
      }
    } catch (err) {
      setLinking(false);
      setWaMsg(
        err instanceof Error ? err.message : 'No se pudo iniciar la vinculación.',
      );
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setMsg('');
    try {
      const r = await api<{ ok: boolean; rate: Rate | null }>(
        '/api/rates/refresh',
        { method: 'POST' },
      );
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
      const r = await api<{ ok: boolean; rate: Rate | null }>('/api/rates', {
        method: 'POST',
        body: JSON.stringify({ date: mDate, usd_ves }),
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
      await api('/api/auth/change-pin', {
        method: 'POST',
        body: JSON.stringify({ current: curPin, next: newPin }),
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
      const r = await api<{ ok: boolean; pago: PagoMovilConfig; qrBase: string }>(
        '/api/settings/pago-movil',
        {
          method: 'PUT',
          body: JSON.stringify({
            banco: pBanco,
            tipoDoc: pTipoDoc,
            documento: pDocumento,
            telefono: pTelefono,
            baseUrl: pBaseUrl,
          }),
        },
      );
      let pagoUpdated = { ...r.pago, baseUrl: r.qrBase };
      if (qrFile) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
          reader.readAsDataURL(qrFile);
        });
        const q = await api<{ ok: boolean; hasQr: boolean; qrFile: string }>(
          '/api/settings/pago-movil/qr',
          {
            method: 'POST',
            body: JSON.stringify({
              dataBase64: base64,
              mime: qrFile.type,
            }),
          },
        );
        pagoUpdated = { ...pagoUpdated, hasQr: q.hasQr, qrFile: q.qrFile };
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
      const q = await api<{ ok: boolean; hasQr: boolean; qrFile: string }>(
        '/api/settings/pago-movil/qr',
        {
          method: 'POST',
          body: JSON.stringify({ remove: true }),
        },
      );
      setPago((p) => (p ? { ...p, hasQr: false, qrFile: '' } : p));
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
              URL del servidor (para el QR)
              <input
                type="text"
                inputMode="url"
                placeholder="http://192.168.1.20:3001"
                value={pBaseUrl}
                onChange={(e) => setPBaseUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-slate-400">
                La IP y puerto donde corre la app, visible desde tu teléfono en
                la misma red. Sin esto, WhatsApp no puede mostrar el QR como
                imagen.
              </span>
            </label>

            <div className="rounded-lg border border-slate-200 p-3">
              <span className="text-sm font-medium text-slate-700">
                QR de pago
              </span>
              {pago?.hasQr ? (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={`${window.location.origin}/api/pago/${pago.qrFile}`}
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
          <h2 className="text-lg font-bold text-slate-800">WhatsApp vinculado</h2>
          <p className="mt-1 text-sm text-slate-500">
            Al vincular tu WhatsApp, el botón &quot;Pago móvil&quot; envía el mensaje
            y el QR como imagen adjunta, sin depender del enlace wa.me.
          </p>
          {wa === null ? (
            <p className="mt-4 text-sm text-slate-400">Consultando estado…</p>
          ) : wa.connected ? (
            <div className="mt-4">
              <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M19.916 4.626a.75.75 0 011.208.659v11.43a.75.75 0 01-1.28.53L15.5 12.7v1.3a3.25 3.25 0 01-3.25 3.25h-1.5A3.25 3.25 0 017.5 14V10A3.25 3.25 0 0110.75 6.75h1.5A3.25 3.25 0 0115.5 10v1.3l4.344-5.015a.75.75 0 01.072-.063zM12.75 8.25h-1.5a1.75 1.75 0 00-1.75 1.75v4a1.75 1.75 0 001.75 1.75h1.5a1.75 1.75 0 001.75-1.75v-4a1.75 1.75 0 00-1.75-1.75z"
                    clipRule="evenodd"
                  />
                </svg>
                Conectado {wa.phone ? `· ${wa.phone}` : ''}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Los envíos se hacen desde tu número vinculado.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                onClick={linkWhatsApp}
                disabled={linking}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {linking ? 'Esperando escaneo…' : 'Conectar WhatsApp'}
              </button>
              {linking && !wa?.connected && (
                <div className="mt-4">
                  {qrTs > 0 ? (
                    <img
                      src={`/api/whatsapp/qr.png?ts=${qrTs}`}
                      alt="QR de vinculación"
                      className="mx-auto h-56 w-56 rounded-lg border border-slate-200"
                    />
                  ) : (
                    <p className="py-10 text-center text-sm text-slate-400">
                      Generando QR…
                    </p>
                  )}
                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                    <li>Abre WhatsApp en tu celular.</li>
                    <li>
                      Menú → Ajustes → Dispositivos vinculados → Vincular un
                      dispositivo.
                    </li>
                    <li>Escanea este QR con la cámara.</li>
                  </ol>
                </div>
              )}
              {!linking && waMsg && (
                <p className="mt-3 text-sm text-amber-700">{waMsg}</p>
              )}
              <p className="mt-3 text-xs text-slate-400">
                Es una sesión adicional de tu cuenta (dispositivo vinculado).
                Cierra sesión desde el celular cuando no lo uses de forma
                permanente.
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