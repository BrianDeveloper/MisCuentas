# Worker WhatsApp

Servicio local (Node + Baileys) que usa tu sesión de WhatsApp para enviar el
mensaje de pago móvil con el QR como imagen adjunta, sin depender del enlace
`wa.me`. Se expone a Internet con **Tailscale Funnel** para que la app (GitHub
Pages) pueda llamarlo.

## Puesta en marcha

```sh
cd worker
npm install
npm run build
npm start
```

- Escucha en `http://0.0.0.0:3100` por defecto (configurable con `PORT`).
- Si copiaste una sesión previa en `worker/data/wa`, el worker intenta
  reconectarse sin volver a escanear el QR. Si no hay sesión, vincula desde la
  app: **Ajustes → Servidor de WhatsApp → Vincular WhatsApp** y escanea el QR.
- Al primer arranque puede tardar unos segundos en quedar `connected`.

## Exponer con Tailscale Funnel

```sh
tailscale up          # si aún no estás conectado a tu tailnet
tailscale serve funnel 3100
```

Quedará disponible en `https://<maquina>.<tailnet>.ts.net` (HTTPS automático).
Revisa el estado con `tailscale status`. Para detener: `tailscale serve funnel off`.

> Necesitas habilitar Funnel una vez en https://login.tailscale.com/admin/dns →
> HTTPS Certificates → Enable Funnel (plan Personal permite 1 servicio funnel).

## Proteger con token (opcional pero recomendado)

Copia `worker/.env.example` a `worker/.env` y define un `WA_SECRET` largo.
Cualquiera con acceso a la URL del funnel podrá enviar mensajes desde tu
WhatsApp, así que usa el token cuando puedas.

```env
PORT=3100
WA_SECRET=cambia-este-valor
```

Luego guarda el mismo valor en la app: **Ajustes → Pago móvil → Token del
worker**. El cliente lo enviará como `Authorization: Bearer <token>` en `/send`
y `/unlink`.

## Endpoints

| Ruta       | Método | Protegido (*) | Descripción                                  |
| ---------- | ------ | ------------- | -------------------------------------------- |
| `/status`  | GET    | no            | `{ connected, phone }`                       |
| `/link`    | POST   | no            | Inicia/regenera el QR de vinculación         |
| `/qr.png`  | GET    | no            | PNG del QR actual (404 si no hay QR)         |
| `/send`    | POST   | sí            | `{ to, text, imageUrl }` envía el mensaje    |
| `/unlink`  | POST   | sí            | Cierra sesión y borra `data/wa`              |

(*) Con `WA_SECRET` definido; sin token, `/send` y `/unlink` quedan abiertos.

`/send` acepta `imageUrl` opcional: si se indica, descarga la imagen (el QR
público de Storage) y la adjunta con el texto como pie de foto.

## Archivos

- `src/whatsapp.ts` — socket Baileys, QR, reconexión, envío con adjunto.
- `src/index.ts` — servidor Express con CORS abierto (GitHub Pages).
- `data/wa/` — sesión de WhatsApp (gitignored, no subir al repo).