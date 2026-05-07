alter table if exists public.orders
  add column if not exists legacy_order_key text;

alter table if exists public.order_lines
  add column if not exists legacy_order_line_id text;

alter table if exists public.order_transmissions
  add column if not exists legacy_print_job_id text;

do $$
begin
  if to_regclass('public.orders') is not null then
    execute 'create unique index if not exists idx_orders_restaurant_legacy_order_key
      on public.orders (restaurant_id, legacy_order_key)
      where legacy_order_key is not null';
  end if;

  if to_regclass('public.order_lines') is not null then
    execute 'create unique index if not exists idx_order_lines_restaurant_legacy_line_id
      on public.order_lines (restaurant_id, legacy_order_line_id)
      where legacy_order_line_id is not null';
  end if;

  if to_regclass('public.order_transmissions') is not null then
    execute 'create unique index if not exists idx_order_transmissions_restaurant_legacy_job_id
      on public.order_transmissions (restaurant_id, legacy_print_job_id)
      where legacy_print_job_id is not null';
  end if;
end $$;
