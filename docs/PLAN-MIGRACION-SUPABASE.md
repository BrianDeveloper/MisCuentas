# Mis Cuentas — Arquitectura y despliegue

Estado actual de la app: SPA estática en GitHub Pages + Supabase (Postgres + Edge
Functions + Storage) + app Android híbrida con Capacitor. Ya no existe servidor
propio ni worker de WhatsApp.

- Repo GitHub: **`BrianDeveloper/MisCuentas`** (público).
- Pages: `https://briandeveloper.github.io/MisCuentas/` (`client/vite.config.ts` → `base: '/MisCuentas/'`).
- Supabase: proyecto `adelljptewdngtnljohu` → `base` en `client/src/lib/api.ts`.

## Arquitectura

```
[ Navegador / APK Capacitor ] --(SPA estática)--> GitHub Pages  https://<user>.github.io/MisCuentas/
      |  Edge Functions (Deno): auth, clients, rates, settings, qr, export
      v
[ Supabase ]  Postgres (clients, movements, rates, app_settings, app_sessions)  [RLS activo]
              Storage (bucket público "qr")
```

Historial:
- (2026-09, Fases A–C) El backend Express + SQLite se migró a Supabase Edge Functions.
- El worker de WhatsApp (Baileys) fue eliminado: el envío se simplificó a `wa.me`
  nativo (`WhatsAppButton` / `PagoMovilButton`) + copia del QR al portapapeles.
- El directorio `server/` (Express + SQLite legacy) se eliminó del repo; su único
  resto aprovechable (test de PIN) vive ahora en `client/test/pin.test.mjs`.

## Piezas

### Cliente (`client/`)
- React + Vite + Tailwind, `HashRouter` (rutas: `/` Inicio, `/clients`, `/clients/:id`, `/settings`, `/login`, `/setup`).
- Auth por PIN (4–6 dígitos, scrypt en la Edge Function) + sesiones de 30 días;
  token en `localStorage` (`mc_token`).
- `client/src/lib/api.ts`: llamadas a Edge Functions con `Authorization: Bearer <token>`.
- Cache en memoria (TTL 20 s) con invalidación tras crear/borrar clientes, movimientos o tasas.
- WhatsApp: links `wa.me` + copia del QR de pago al portapapeles (`client/src/lib/links.ts`
  abre en el navegador del sistema en el APK nativo).

### Edge Functions (`supabase/functions/`, Deno)
| Función | Se encarga de |
| ------- | ------------- |
| `auth` | status, setup, login, change-pin (sesiones) |
| `clients` | list, home, get, create, delete, movement-create, movement-delete |
| `rates` | latest, history, refresh (BCV), manual |
| `settings` | get, update (pago móvil), messages |
| `qr` | subir/quitar QR (base64 → Storage público) |
| `export` | resumen y estado de cuenta en CSV (`;`, BOM, formato es-VE) |

Lógica compartida en `_shared/` (`helpers.ts`, `auth.ts`, `bcv.ts`, `cors.ts`, `db.ts`).
El orden de tasas BCV consulta `bcv.org.ve` → `/cotizacion` → respaldo DolarAPI; para
fechas históricas usa finanzasdigital.

### Android (Capacitor, `client/android/`)
- `appId com.bridev.miscuentas`; plugins: browser, filesystem, share.
- `npm run build:app` = `vite build --base=./ && cap sync android`.
- `client/android/app/src/main/assets/public/` se genera con `cap sync` y está en `.gitignore`.
- El APK release se firma con el keystore de debug (instalable por sideload).

## Despliegue y CI (`.github/workflows/`)
- `deploy.yml`: en push a `main` → build del cliente → GitHub Pages.
- `android-build.yml`: en push a `main` (si toca `client/**`) o manual → `assembleRelease` → artefacto `mis-cuentas-apk`.
- `keepalive.yml`: cada 5 min ping a las Edge Functions (una por ahora: rates, clients,
  settings, qr, auth, export) para evitar cold starts. (El antiguo ping al worker fue eliminado.)

## Comandos
- `npm install` — instala el workspace (`client`).
- `npm test` — tests de unidad (`node --import tsx --test client/test/pin.test.mjs`).
- `npm run build` — `tsc --noEmit && vite build` del cliente.
- `npm run dev -w client` — servidor de desarrollo Vite.
- Edge Functions: `deno test`/check vía `supabase/deno.json` (`deno check --all`).

## Notas
- GitHub Pages no ejecuta Node: el envío real de WhatsApp es responsabilidad del
  móvil del usuario (wa.me); el QR se muestra/copia desde la app.
- Las cookies no cruzan dominios (github.io -> supabase.co): el token de sesión va en `localStorage`.
- El subir el QR no pasa por ningún servidor propio: va a la Edge Function `qr` → Storage,
  y los botones usan su URL pública.