alter table if exists public.payments
  add column if not exists legacy_payment_id text,
  add column if not exists legacy_order_id text,
  add column if not exists legacy_table_id text;

alter table if exists public.fiscal_documents
  add column if not exists legacy_document_id text,
  add column if not exists legacy_order_id text,
  add column if not exists legacy_table_id text;

alter table if exists public.cash_closures
  add column if not exists legacy_cash_closure_id text,
  add column if not exists legacy_report_date text;

alter table if exists public.daily_reports
  add column if not exists legacy_report_date text,
  add column if not exists legacy_payload jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.payments') is not null then
    execute 'create unique index if not exists idx_payments_restaurant_legacy_payment_id
      on public.payments (restaurant_id, legacy_payment_id)
      where legacy_payment_id is not null';
  end if;

  if to_regclass('public.fiscal_documents') is not null then
    execute 'create unique index if not exists idx_fiscal_documents_restaurant_legacy_document_id
      on public.fiscal_documents (restaurant_id, legacy_document_id)
      where legacy_document_id is not null';
  end if;

  if to_regclass('public.cash_closures') is not null then
    execute 'create unique index if not exists idx_cash_closures_restaurant_legacy_cash_closure_id
      on public.cash_closures (restaurant_id, legacy_cash_closure_id)
      where legacy_cash_closure_id is not null';
  end if;

  if to_regclass('public.daily_reports') is not null then
    execute 'create index if not exists idx_daily_reports_restaurant_legacy_report_date
      on public.daily_reports (restaurant_id, legacy_report_date)';
  end if;
end $$;
