alter table if exists public.order_lines
  add column if not exists queued_quantity numeric(12, 2) not null default 0,
  add column if not exists print_status text not null default 'pending',
  add column if not exists sent_to_kitchen_at timestamptz,
  add column if not exists last_print_job_id uuid;

alter table if exists public.print_jobs
  add column if not exists legacy_client_job_id text,
  add column if not exists legacy_table_id text,
  add column if not exists destination text,
  add column if not exists printer_type text,
  add column if not exists printer_name text,
  add column if not exists printer_ip text,
  add column if not exists printer_port integer,
  add column if not exists payload_format text not null default 'json',
  add column if not exists idempotency_key text,
  add column if not exists attempts integer not null default 0,
  add column if not exists bridge_id text,
  add column if not exists claimed_at timestamptz,
  add column if not exists printed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists payload_version integer not null default 1;

alter table if exists public.print_jobs
  drop constraint if exists print_jobs_job_type_check,
  drop constraint if exists print_jobs_status_check;

alter table if exists public.print_jobs
  add constraint print_jobs_job_type_check
  check (
    job_type in (
      'order',
      'prebill',
      'fiscal',
      'void',
      'report',
      'test',
      'connection-test',
      'test-print',
      'table-move',
      'fiscal-document',
      'kitchen_order',
      'kitchen_delta',
      'kitchen_cancel',
      'bill',
      'fiscal_document',
      'cash_closure',
      'daily_report'
    )
  ),
  add constraint print_jobs_status_check
  check (
    status in (
      'pending',
      'queued',
      'processing',
      'simulated',
      'sent',
      'printed',
      'failed',
      'timeout',
      'cancelled'
    )
  );

create table if not exists public.print_bridge_status (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  bridge_id text not null,
  status text not null default 'online',
  version text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, bridge_id)
);

create table if not exists public.print_bridge_heartbeats (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  bridge_id text not null,
  hostname text,
  local_ip text,
  version text,
  status text not null default 'online',
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, bridge_id)
);

drop trigger if exists trg_print_bridge_status_updated_at on public.print_bridge_status;
create trigger trg_print_bridge_status_updated_at
before update on public.print_bridge_status
for each row execute function public.set_updated_at();

drop trigger if exists trg_print_bridge_heartbeats_updated_at on public.print_bridge_heartbeats;
create trigger trg_print_bridge_heartbeats_updated_at
before update on public.print_bridge_heartbeats
for each row execute function public.set_updated_at();

create index if not exists idx_print_jobs_restaurant_status_created
on public.print_jobs (restaurant_id, status, created_at desc);

create index if not exists idx_print_jobs_restaurant_legacy_table
on public.print_jobs (restaurant_id, legacy_table_id, created_at desc);

create index if not exists idx_print_jobs_restaurant_legacy_client_job
on public.print_jobs (restaurant_id, legacy_client_job_id);

create unique index if not exists idx_print_jobs_restaurant_idempotency_key
on public.print_jobs (restaurant_id, idempotency_key)
where idempotency_key is not null;

create index if not exists idx_print_bridge_status_restaurant_last_seen
on public.print_bridge_status (restaurant_id, last_seen_at desc);

create index if not exists idx_print_bridge_heartbeats_restaurant_last_seen
on public.print_bridge_heartbeats (restaurant_id, last_seen_at desc);
