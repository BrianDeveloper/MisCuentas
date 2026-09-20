# Plan de migración: Supabase + GitHub Pages

Objetivo: dejar de depender de un servidor propio (Express + SQLite) y publicar la
app como sitio estático en GitHub Pages, con los datos en Supabase (Postgres) y el
trabajo de "servidor" resuelto con Supabase (RLS, Storage, Edge Functions) y un
pequeño worker Node para WhatsApp.

## 1. Arquitectura actual (lo que se va a transformar)

```
[ Navegador ] --/api/*--> [ Express (Node 24) ]
                              |-- SQLite (cuentas.db): clients, movements, rates, settings, sessions
                              |-- Crawl BCV (cheerio) + cron 8:30
                              |-- Baileys (socket WhatsApp) + QR de pareo
                              |-- Uploads QR estático (server/data/uploads)
```

## 2. Arquitectura objetivo

```
[ Navegador ] --(SPA estática)--> GitHub Pages  https://<user>.github.io/cuentas/
      |  supabase-js (RLS, auth propio, Storage)
      |  Edge Functions (Deno): /bcv-refresh, /bcv-ensure, /auth-* , /qr-*
      v
[ Supabase ]  Postgres (clients, movements, rates, app_settings, app_sessions)
              Storage (bucket publico "qr")
              pg_cron: tasa BCV diaria 8:30 America/Caracas

[ Navegador ] --(URL estable https)--> [ Worker WhatsApp (Node + Baileys), en tu PC
                                         expuesto via Tailscale Funnel, sin costo ]
      rutas del worker: /status /link /qr.png /send  + CORS hacia GitHub Pages
```

## 3. Qué va a dónde

| Funcionalidad hoy (server)          | Destino |
| ----------------------------------- | ------- |
| clients CRUD, movements, sumarización | Postgres + RLS (supabase-js desde el cliente) |
| rates (latest/history/manual)        | tabla `rates` + RLS |
| crawl BCV (bcv.org.ve + histórico)   | Edge Function `bcv-refresh` (bajo demanda) + `bcv-ensure` (al registrar movimiento) + pg_cron diario |
| auth PIN + sesiones cookie            | Edge Functions `auth-*` + tabla `app_sessions`, token en localStorage (no cookie cross-domain) |
| settings pago móvil                   | tabla `app_settings` (JSON) + Edge Function `settings-*` |
| QR upload (base64)                    | Supabase Storage bucket público `qr`, URL pública estable en lugar de `/api/pago/...` |
| WhatsApp (Baileys, QR, send)          | Worker Node independiente (Baileys + rutas /status /link /qr.png /send). URL estable via Tailscale Funnel. CORS `Access-Control-Allow-Origin` = origen de Pages |

## 4. Fases

### Fase A — Supabase: proyecto, schema y seguridad
1. Crear proyecto en supabase.com (free tier: 500 MB Postgres, 1 GB Storage, PG cron, Edge).
2. Script `supabase/migrations/0001_init.sql`: tablas
   - `clients (id bigint id, name, phone, notes, created_at)`
   - `movements (id bigint, client_id -> clients, type, currency, amount, rate_bs, amount_usd, amount_bs, concept, date, created_at)`
   - `rates (date pk, usd_ves, eur_ves)`
   - `app_settings (key pk, value)`
   - `app_sessions (token pk, created_at, expires_at)`
3. RLS: una sola "app owner". Dos modalidades a decidir:
   - **A1 (recomendada): mantener PIN** — `pin_hash` (scrypt) en `app_settings`; Edge `auth-login` verifica y crea `app_sessions`; políticas RLS comprueban que el token enviado tenga sesión válida.
   - **A2: Supabase Auth email+password** — más estándar (SDK oficial), pero cambia la UX de PIN.
4. Storage: bucket `qr` público; subida base64 desde Edge Function (evita CORS/CLO 413 del cliente), URL `https://<proj>.supabase.co/storage/v1/object/public/qr/qr.png`.
5. (Opcional) migrar datos actuales: exportar SQLite y cargar; como iremos "en limpio", solo se definen las tablas y se configura el QR nuevo en Storage.

### Fase B — Cliente sobre Supabase (GitHub Pages)
1. `client/vite.config.ts`: `base: '/cuentas/'` y `outDir` mantiene `dist`.
2. `react-router-dom` → **HashRouter** (evita 404 en rutas profundas de Pages sin reescritura).
3. Reemplazar `lib/api.ts` por:
   - `@supabase/supabase-js`: CRUD clients/movements/rates con RLS (token del PIN en localStorage).
   - Llamadas a Edge Functions con `Authorization: Bearer <token>` para auth/settings/bcv.
   - El QR del pago móvil se lee de la URL pública de Storage.
4. `auth.tsx`: login/setup/logout contra `auth-*` (mantiene flujo setup/PIN/loggedOut).
5. Botones WhatsApp:
   - `WhatsAppButton` (recordatorio): sin cambios, sigue siendo link `wa.me`.
   - `PagoMovilButton`: consulta `/status` del worker; si conectado → POST `/send` del worker con `imageUrl` (Storage) y caption; si no → fallback link.
6. Ajustes: tasa manual/refresh (Edge), pago móvil (Storage), sección WhatsApp apuntando al worker (URL configurable, config guardada en `app_settings`).

### Fase C — Edge Functions (Deno)
- `auth-status`, `auth-login`, `auth-setup`, `auth-logout` (verificar/crear/borrar `app_sessions`; scrypt vía `npm:scrypt-js` en Deno).
- `bcv-refresh`: reutilizar lógica de `server/src/bcv.ts` (parseBcvNumber/parseBcvHtml) portada a Deno; upsert en `rates`.
- `bcv-ensure`: para movimientos con fecha pasada (consulta `rates`, si falta busca histórico en finanzasdigital y guarda).
- `settings-get`, `settings-put`, `qr-upload`.
- `settings` clave extra: `whatsappBaseUrl` = URL del worker.
- pg_cron: `30 8 * * *` -> `select net.http_post(...)` al Edge `bcv-refresh` (o equivalente).

### Fase D — Worker WhatsApp (Node + Baileys)
1. Extraer de `server/src/whatsapp.ts` + `routes/whatsapp.ts` un servicio mínimo: `worker/` con rutas `/status`, `/link` (QR), `/qr.png`, `/send` (acepta `{to, text, imageUrl}` y adjunta descargando la imagen desde Storage).
2. Su estado y credenciales de sesión viven en su propio filesystem (`worker/data/wa`), **nunca en el repo** (`.gitignore`).
3. Endpoint público estable y HTTPS: **Tailscale Funnel** (gratis, Personal, sin tarjeta) → `https://<maquina>.<tailnet>.ts.net` → localhost:3001. Requiere PC encendida (igual que hoy).
4. CORS: permitir el origen `https://<user>.github.io`.

### Fase E — Deploy GitHub Pages
- Repo en GitHub. **Importante:** Pages en plan free solo publica repos **públicos**; con repo privado se necesita GitHub Pro. El código del cliente es público (datos reales quedan en Supabase detrás de auth). Alternativa si se quiere repo privado: Netlify Drop/Deploy (free, estático).
- GitHub Actions (workflow `pages.yml`): `npm ci`, `npm run build -w client`, `actions/upload-pages-artifact` + `actions/deploy-pages`.
- Dominio final: `https://<user>.github.io/cuentas/`.

### Fase F — Pruebas y cierre
- E2E real: login, alta de cliente, movimiento con tasa automática, export CSV, envío de imagen QR por WhatsApp, QR público de Storage.
- Reproducir en móvil (fuera de la LAN) vía la URL pública de Pages.
- Cerrar túnel cloudflared actual; documentar en README cómo levantar worker + funnel.
- Commit de respaldo/rama y limpieza de artefactos locales.

## 5. Decisiones a confirmar antes de ejecutar
1. **Auth**: ¿mantener PIN (A1, recomendada) o pasar a Supabase Auth email+password (A2)?
2. **Worker WhatsApp**: ¿Tailscale Funnel en tu PC (recomendada, $0) o un VPS gratuito (Oracle Always Free, setup manual)?
3. **Éxito de Pages en repo público**: ¿aceptas repo público? Si quieres privado, ¿prefieres Netlify para el estático?
4. **Datos**: ¿"en limpio" (sin migrar) o migrar los clientes/movimientos actuales de SQLite?

## 6. Fuera de alcance / notas
- GitHub Pages no puede ejecutar Node: por eso el worker WhatsApp existe aparte.
- Las cookies no cruzan dominios (github.io -> supabase.co): el token de sesión va en `localStorage` del navegador.
- Subir el QR base64 ya no pasa por el servidor Express: va a `qr-upload` (Edge) -> Storage, y `PagoMovilButton`/worker usan su URL pública.