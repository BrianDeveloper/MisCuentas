-- Migración 0002: índices para acelerar las consultas más usadas.

-- Orden por fecha en "movimientos recientes" (Home) sin ordenar toda la tabla.
create index if not exists idx_movements_date on public.movements(date desc);

-- Detalle de cliente: filtra por client_id y ordena por fecha (+ id como desempate).
create index if not exists idx_movements_client_date on public.movements(client_id, date desc, id desc);