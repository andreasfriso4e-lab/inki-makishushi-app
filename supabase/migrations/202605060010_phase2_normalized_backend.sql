create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.restaurants (
  id text primary key,
  name text not null,
  slug text unique,
  timezone text not null default 'Europe/Rome',
  currency_code text not null default 'EUR',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.restaurants (id, name, slug)
values ('default', 'Inki Makisushi app', 'inki-makisushi')
on conflict (id) do update
set
  name = excluded.name,
  slug = coalesce(public.restaurants.slug, excluded.slug),
  updated_at = timezone('utc', now());

create table if not exists public.operator_roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  code text not null,
  name text not null,
  role_type text not null check (role_type in ('admin', 'operator')),
  description text,
  permissions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, code)
);

create table if not exists public.operator_role_permissions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  role_id uuid not null references public.operator_roles(id) on delete cascade,
  permission_key text not null,
  permission_value boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (role_id, permission_key)
);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  role_id uuid references public.operator_roles(id) on delete set null,
  legacy_role_code text,
  display_name text not null,
  username text,
  pin text,
  password_hash text,
  is_active boolean not null default true,
  is_demo_password_allowed boolean not null default false,
  last_login_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, display_name),
  unique (restaurant_id, username)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  legacy_company_id text,
  vat_number text,
  tax_code text,
  company_name text not null,
  legal_name text,
  address_street text,
  address_number text,
  zip_code text,
  city text,
  province text,
  country text not null default 'IT',
  pec text,
  sdi_code text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, vat_number),
  unique (restaurant_id, tax_code)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  legacy_customer_id text,
  company_id uuid references public.companies(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  tax_code text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fidelity_profiles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  card_code text,
  qr_code text,
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  points_balance integer not null default 0,
  total_spent numeric(12, 2) not null default 0,
  tier_name text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, card_code),
  unique (restaurant_id, qr_code)
);

create table if not exists public.fidelity_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  code text,
  title text not null,
  description text,
  points_cost integer not null default 0,
  monetary_value numeric(12, 2),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, code)
);

create table if not exists public.fidelity_points_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  fidelity_profile_id uuid not null references public.fidelity_profiles(id) on delete cascade,
  order_id uuid,
  document_id uuid,
  movement_type text not null check (movement_type in ('earn', 'redeem', 'refund', 'cancel', 'manual')),
  points integer not null,
  reason text,
  balance_after integer,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fidelity_reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  fidelity_profile_id uuid not null references public.fidelity_profiles(id) on delete cascade,
  reward_id uuid not null references public.fidelity_rewards(id) on delete restrict,
  order_id uuid,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  points_spent integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  legacy_room_id text,
  code text,
  name text not null,
  room_type text not null default 'room' check (room_type in ('room', 'takeaway')),
  sort_order integer not null default 0,
  color text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, name)
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  legacy_table_id text,
  code text,
  name text not null,
  seats integer not null default 0,
  sort_order integer not null default 0,
  status text not null default 'free' check (status in ('free', 'occupied', 'reserved', 'maintenance')),
  operational_status text,
  current_cover_count integer not null default 0,
  assigned_operator_id uuid references public.operators(id) on delete set null,
  last_opened_at timestamptz,
  last_closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, name)
);

create table if not exists public.vat_rates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  code text,
  label text not null,
  rate numeric(7, 4) not null default 0,
  kind text not null default 'taxable' check (kind in ('taxable', 'exempt', 'non_taxable', 'outside_scope')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, code)
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  code text,
  name text not null,
  production_station text,
  printer_role text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, name)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  code text,
  name text not null,
  production_station text,
  printer_role text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  vat_rate_id uuid references public.vat_rates(id) on delete set null,
  legacy_product_id text,
  sku text,
  plu_code text,
  name text not null,
  short_name text,
  description text,
  price numeric(12, 2) not null default 0,
  cost numeric(12, 2),
  production_station text,
  printer_role text,
  track_guest_assignment boolean not null default false,
  is_favorite boolean not null default false,
  is_visible boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, sku),
  unique (restaurant_id, plu_code),
  unique (restaurant_id, name)
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  code text not null,
  name text not null,
  payment_type text,
  requires_change boolean not null default false,
  supports_split boolean not null default true,
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, code)
);

create table if not exists public.printer_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  legacy_printer_id text,
  code text,
  name text not null,
  role text not null check (role in ('fiscal', 'bar', 'kitchen', 'generic')),
  model text,
  connection_mode text not null default 'mock' check (connection_mode in ('mock', 'real')),
  host text,
  port integer,
  device_path text,
  is_default boolean not null default false,
  is_enabled boolean not null default true,
  last_connection_result text,
  last_connection_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, code),
  unique (restaurant_id, name)
);

create table if not exists public.printer_routing_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  printer_id uuid references public.printer_configs(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  target_printer_role text,
  production_station text,
  rule_scope text not null default 'kitchen',
  priority integer not null default 100,
  is_enabled boolean not null default true,
  conditions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  scope text not null check (scope in ('global', 'cassa', 'palmare')),
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, scope, setting_key)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  opened_by_operator_id uuid references public.operators(id) on delete set null,
  assigned_operator_id uuid references public.operators(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  order_number bigint generated by default as identity,
  source_device_mode text check (source_device_mode in ('cassa', 'palmare')),
  table_name_snapshot text,
  room_name_snapshot text,
  status text not null default 'draft' check (status in ('draft', 'in_work', 'sent', 'paid', 'cancelled', 'archived')),
  table_status text not null default 'occupied' check (table_status in ('free', 'occupied', 'reserved', 'maintenance')),
  command_status text not null default 'pending' check (command_status in ('pending', 'partially_sent', 'sent', 'error')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid', 'voided')),
  cover_count integer not null default 0,
  subtotal_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  surcharge_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  prebill_printed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_courses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (order_id, code)
);

create table if not exists public.order_guests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  code text not null,
  label text not null,
  seat_index integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (order_id, code)
);

create table if not exists public.order_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  course_id uuid references public.order_courses(id) on delete set null,
  guest_id uuid references public.order_guests(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  vat_rate_id uuid references public.vat_rates(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  line_number integer not null default 1,
  status text not null default 'draft',
  product_name_snapshot text not null,
  category_name_snapshot text,
  department_name_snapshot text,
  unit_price numeric(12, 2) not null default 0,
  quantity numeric(12, 3) not null default 1,
  sent_quantity numeric(12, 3) not null default 0,
  line_total numeric(12, 2) not null default 0,
  notes text,
  additions jsonb not null default '[]'::jsonb,
  removals jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.table_status_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  previous_status text,
  next_status text not null,
  changed_by_operator_id uuid references public.operators(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_transmissions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  triggered_by_operator_id uuid references public.operators(id) on delete set null,
  triggered_from_device text check (triggered_from_device in ('cassa', 'palmare')),
  course_code text,
  production_station text,
  printer_id uuid references public.printer_configs(id) on delete set null,
  printer_role text,
  transmission_type text not null default 'order',
  status text not null default 'pending' check (status in ('pending', 'simulated', 'sent', 'failed', 'cancelled')),
  command_number bigint,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_transmission_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  transmission_id uuid not null references public.order_transmissions(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  quantity_sent numeric(12, 3) not null default 0,
  guest_code_snapshot text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (transmission_id, order_line_id)
);

create table if not exists public.split_bill_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  mode text not null check (mode in ('people', 'amount', 'items')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.split_bill_quotas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  split_session_id uuid not null references public.split_bill_sessions(id) on delete cascade,
  quota_code text,
  label text not null,
  quota_amount numeric(12, 2) not null default 0,
  person_count integer,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  item_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  operator_id uuid references public.operators(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_method_name_snapshot text,
  document_type text not null default 'Scontrino',
  status text not null default 'pending' check (status in ('pending', 'authorized', 'confirmed', 'cancelled', 'failed', 'refunded')),
  subtotal_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  surcharge_amount numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  tendered_amount numeric(12, 2),
  change_amount numeric(12, 2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  document_type text not null check (document_type in ('Scontrino', 'Scontrino parlante', 'Fattura', 'Preconto')),
  document_number text,
  document_status text not null default 'draft',
  subtotal_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  surcharge_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  issue_date timestamptz,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.prebills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  printer_id uuid references public.printer_configs(id) on delete set null,
  printed_by_operator_id uuid references public.operators(id) on delete set null,
  subtotal_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cash_closures (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  closed_by_operator_id uuid references public.operators(id) on delete set null,
  closure_code text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  cash_total numeric(12, 2) not null default 0,
  card_total numeric(12, 2) not null default 0,
  other_total numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, closure_code)
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  report_date date not null,
  report_type text not null default 'daily-close',
  period_start timestamptz not null,
  period_end timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, report_date, report_type)
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  transmission_id uuid references public.order_transmissions(id) on delete set null,
  prebill_id uuid references public.prebills(id) on delete set null,
  printer_id uuid references public.printer_configs(id) on delete set null,
  job_type text not null check (job_type in ('order', 'prebill', 'fiscal', 'void', 'report', 'test')),
  printer_role text,
  production_station text,
  status text not null default 'pending' check (status in ('pending', 'simulated', 'sent', 'failed', 'cancelled')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  executed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fiscal_printer_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  printer_id uuid references public.printer_configs(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  document_id uuid references public.fiscal_documents(id) on delete set null,
  log_level text not null default 'info',
  event_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.void_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  document_id uuid references public.fiscal_documents(id) on delete set null,
  operator_id uuid references public.operators(id) on delete set null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  actor_operator_id uuid references public.operators(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  origin text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.fidelity_points_movements
  drop constraint if exists fidelity_points_movements_order_id_fkey,
  add constraint fidelity_points_movements_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete set null,
  drop constraint if exists fidelity_points_movements_document_id_fkey,
  add constraint fidelity_points_movements_document_id_fkey
    foreign key (document_id) references public.fiscal_documents(id) on delete set null;

alter table public.fidelity_reward_redemptions
  drop constraint if exists fidelity_reward_redemptions_order_id_fkey,
  add constraint fidelity_reward_redemptions_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete set null;

create index if not exists idx_operator_roles_restaurant on public.operator_roles (restaurant_id);
create index if not exists idx_operators_restaurant on public.operators (restaurant_id);
create index if not exists idx_companies_restaurant on public.companies (restaurant_id);
create index if not exists idx_customers_restaurant on public.customers (restaurant_id);
create index if not exists idx_fidelity_profiles_restaurant on public.fidelity_profiles (restaurant_id);
create index if not exists idx_rooms_restaurant on public.rooms (restaurant_id);
create index if not exists idx_tables_restaurant_room on public.tables (restaurant_id, room_id);
create index if not exists idx_departments_restaurant on public.departments (restaurant_id);
create index if not exists idx_categories_restaurant_department on public.categories (restaurant_id, department_id);
create index if not exists idx_products_restaurant_category on public.products (restaurant_id, category_id);
create index if not exists idx_payment_methods_restaurant on public.payment_methods (restaurant_id);
create index if not exists idx_printer_configs_restaurant on public.printer_configs (restaurant_id);
create index if not exists idx_printer_routing_rules_restaurant on public.printer_routing_rules (restaurant_id);
create index if not exists idx_orders_restaurant_table_status on public.orders (restaurant_id, table_id, status);
create index if not exists idx_order_courses_order on public.order_courses (order_id);
create index if not exists idx_order_guests_order on public.order_guests (order_id);
create index if not exists idx_order_lines_order on public.order_lines (order_id);
create index if not exists idx_order_transmissions_order on public.order_transmissions (order_id);
create index if not exists idx_payments_order on public.payments (order_id);
create index if not exists idx_fiscal_documents_order on public.fiscal_documents (order_id);
create index if not exists idx_prebills_order on public.prebills (order_id);
create index if not exists idx_cash_closures_restaurant_period on public.cash_closures (restaurant_id, period_start, period_end);
create index if not exists idx_daily_reports_restaurant_date on public.daily_reports (restaurant_id, report_date);
create index if not exists idx_print_jobs_restaurant on public.print_jobs (restaurant_id, created_at desc);
create index if not exists idx_fiscal_printer_logs_restaurant on public.fiscal_printer_logs (restaurant_id, created_at desc);
create index if not exists idx_void_logs_restaurant on public.void_logs (restaurant_id, created_at desc);
create index if not exists idx_audit_logs_restaurant on public.audit_logs (restaurant_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'restaurants',
    'operator_roles',
    'operator_role_permissions',
    'operators',
    'companies',
    'customers',
    'fidelity_profiles',
    'fidelity_rewards',
    'fidelity_points_movements',
    'fidelity_reward_redemptions',
    'rooms',
    'tables',
    'vat_rates',
    'departments',
    'categories',
    'products',
    'payment_methods',
    'printer_configs',
    'printer_routing_rules',
    'app_settings',
    'orders',
    'order_courses',
    'order_guests',
    'order_lines',
    'table_status_history',
    'order_transmissions',
    'order_transmission_lines',
    'split_bill_sessions',
    'split_bill_quotas',
    'payments',
    'fiscal_documents',
    'prebills',
    'cash_closures',
    'daily_reports',
    'print_jobs',
    'fiscal_printer_logs',
    'void_logs',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end
$$;
