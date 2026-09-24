# Plan: Módulo de Pedidos + Ingesta WhatsApp

> **Estado**: Pospuesto. Guardado para retomar cuando se indique.

## Respuestas del usuario
1. `/orders` tendrá vista propia separada con pestaña interna para gestión de productos (CRUD) + pestaña de pedidos
2. Botón flotante "📋 Enviar Catálogo" en `/orders` que usa `openWhatsApp` para enviar lista de productos por WhatsApp
3. `keywords: string[]` en products para match fuzzy del parser

---

## Estructura de `/orders`

| Sección | Contenido |
|---|---|
| **Pestaña: Catálogo** | CRUD productos (nombre, precio USD, categoría, keywords), botón "Enviar Catálogo por WhatsApp" |
| **Pestaña: Pedidos** | Lista con tabs Pendientes/Completados/Cancelados, botón `+ Nuevo Pedido` → carrito, botón "📋 Pegar Pedido de WhatsApp" |
| **Carrito flotante** | Buscar producto, agregar, calcular total USD→Bs con `useTasaStore` |
| **ImportOrderModal** | Modal de revisión de pedido parseado desde clipboard |
| **Botón "Fiado"** | En cada pedido pendiente → auto-crea cliente + registra deuda |

---

## Backend — Archivos a crear/modificar

### `supabase/migrations/0005_orders.sql`
- Tabla `products`: id, name, price_usd, category, keywords (text[]), is_active, created_at
- Tabla `orders`: id, client_id (FK), client_name, client_phone, items (jsonb), total_usd, total_bs, status, payment_type, created_at
- RLS habilitado, service_role acceso

### `supabase/functions/orders/index.ts`
Edge Function siguiendo patrón de `clients/index.ts`:
- `products` GET → lista productos activos
- `product` GET/POST → crear/actualizar
- `product/delete` DELETE → eliminar
- `orders` GET → lista pedidos (filtro status)
- `orders` POST → crear pedido
- `orders/:id/status` PUT → cambiar estado
- `orders/:id/fiado` POST → **marcar como fiado**: auto-crea cliente + registra deuda en movements

### `supabase/deno.json`
Añadir `functions/orders/index.ts` a task `check`

---

## Frontend — Archivos a crear/modificar

### Nuevos (5)
| Archivo | Contenido |
|---|---|
| `lib/whatsappParser.ts` | `parsePhoneNumber`, `parseName`, `matchProducts`, `parseWhatsAppMessage` |
| `lib/store/products.ts` | `useProductsStore`, `useUpsertProduct`, `useDeleteProduct` |
| `lib/store/orders.ts` | `useOrdersStore`, `useCreateOrder`, `useUpdateOrderStatus`, `useMarkOrderFiado` |
| `components/ImportOrderModal.tsx` | Modal de revisión de pedido parseado |
| `pages/Orders.tsx` | Vista completa: pestañas Catálogo + Pedidos + carrito flotante |

### Modificados (5)
| Archivo | Cambio |
|---|---|
| `lib/api.ts` | `EdgeFn` + `'orders'`, nuevas funciones |
| `lib/store/keys.ts` | Claves nuevas |
| `lib/offline.ts` | PendingKind extendido |
| `components/Layout.tsx` | Nav item "Pedidos" |
| `main.tsx` | Lazy load + ruta `/orders` |

---

## Flujo "Fiado"

```
Usuario hace clic en "Fiado" sobre pedido pendiente
  → useMarkOrderFiado.mutate(orderId)
  → Normalizar teléfono con toWhatsAppNumber()
  → Buscar cliente en useClientesStore por teléfono
  → Si no existe → useCreateCliente().mutate({ name, phone })
  → rate = useTasaStore.getState().rate
  → total_bs = total_usd * rate
  → useCreateMovimiento().mutate({ clientId, type: 'deuda', amount_bs: total_bs, amount_usd: total_usd })
  → updateOrderStatus(orderId, { status: 'completed', payment_type: 'debt' })
  → El pedido aparece en "Completados" con etiqueta "Fiado"
  → El cliente aparece en lista con deuda actualizada
  → El movimiento aparece en la ficha del cliente
```

---

## Orden de implementación
1. Backend: Migración + Edge Function `orders`
2. Cliente stores: `products.ts` + `orders.ts`
3. Cliente vista: `Orders.tsx` + carrito POS
4. WhatsApp Parser + `ImportOrderModal`
5. Botón "Fiado" + integración con accounts
