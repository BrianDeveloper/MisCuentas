# Worker WhatsApp

Servicio gratuito (Node + Baileys) que usa tu sesión de WhatsApp para enviar el
mensaje de pago móvil con el QR como imagen adjunta, sin depender del enlace
`wa.me`. Corre en **Render (plan free)** y la app (GitHub Pages) lo llama por
HTTPS.

El disco de Render es efímero (se borra al reiniciar/dormir), así que la sesión
de WhatsApp se respalda en **Supabase Storage** (bucket `wa`) y se restaura a
cada arranque. Un workflow de GitHub Actions hace ping cada 10 min para que el
servicio nunca duerma.

## Desplegar en Render

El repositorio incluye `render.yaml` (blueprint) en la raíz:

1. En Render: **New → Blueprint** y elige el repo.
2. Cuando pida los env vars (todos `sync: false`), define:
   - `WA_SECRET`: token largo (opcional; exige `Authorization: Bearer` en `/send` y `/unlink`).
   - `SUPABASE_URL` = `https://adelljptewdngtnljohu.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = clave de servicio del proyecto (se reemplaza si se rota).
3. Guarda. Render crea el web service, compila (`npm ci && npm run build`) y
   arranca (`npm start`). Escucha en el puerto que Render inyecta en `PORT`.
4. Copia la URL `https://<nombre>.onrender.com` y pégala en
   **Ajustes → Servidor de WhatsApp (worker)** de la app, junto al token.
5. Pulsa **Comprobar estado** y luego vincula WhatsApp escaneando el QR que
   genera el worker (solo la primera vez).

El keepalive se activa solo: en GitHub → repo → Settings → Secrets and
variables → Actions → **Variables** → añade:
`WORKER_URL` = `https://<nombre>.onrender.com`

## Probar en local

```sh
cd worker
npm install
npm run build
npm start
```

Escucha en `http://0.0.0.0:3100` por defecto (configurable con `PORT`).

Para activar el respaldo de sesión en local, define las mismas `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` (por ejemplo en `worker/.env` copiando
`.env.example`). Sin estas variables, el worker funciona igual pero sin
persistencia remota.

## Endpoints

| Ruta       | Método | Protegido (*) | Descripción                                  |
| ---------- | ------ | ------------- | -------------------------------------------- |
| `/status`  | GET    | no            | `{ connected, phone }`                       |
| `/link`    | POST   | no            | Inicia/regenera el QR de vinculación         |
| `/qr.png`  | GET    | no            | PNG del QR actual (404 si no hay QR)         |
| `/send`    | POST   | sí            | `{ to, text, imageUrl }` envía el mensaje    |
| `/unlink`  | POST   | sí            | Cierra sesión y borra sesión local y remota  |

(*) Con `WA_SECRET` definido; sin token, `/send` y `/unlink` quedan abiertos.

`/send` acepta `imageUrl` opcional: si se indica, descarga la imagen (el QR
público de Storage) y la adjunta con el texto como pie de foto.

## Archivos

- `src/whatsapp.ts` — socket Baileys, QR, reconexión, envío con adjunto y
  respaldo periódico de la sesión.
- `src/storage.ts` — sesión en Supabase Storage (zip con nombre por timestamp;
  restaura la más reciente al arrancar; conserva las 3 últimas).
- `src/index.ts` — servidor Express con CORS abierto (GitHub Pages).
- `data/wa/` — sesión de WhatsApp local (gitignored, no subir al repo).