-- Restauración atómica de backup JSON (wipe + reinsertar, preservando el PIN).
-- Se ejecuta con service_role (bypasa RLS como el resto de la app).
create or replace function public.restore_backup(
  p_clients jsonb,
  p_movements jsonb,
  p_rates jsonb,
  p_settings jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.rates;
  delete from public.clients;
  delete from public.app_settings where key <> 'pin_hash';

  insert into public.clients
    select * from jsonb_populate_recordset(null::public.clients, p_clients);
  insert into public.movements
    select * from jsonb_populate_recordset(null::public.movements, p_movements);
  insert into public.rates
    select * from jsonb_populate_recordset(null::public.rates, p_rates);
  insert into public.app_settings (key, value)
    select key, value from jsonb_to_recordset(p_settings) as x(key text, value text)
    where key <> 'pin_hash';

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.restore_backup(jsonb, jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.restore_backup(jsonb, jsonb, jsonb, jsonb) to service_role;