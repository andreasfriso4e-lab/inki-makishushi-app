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

create table if not exists public.pos_tables_state (
  restaurant_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_operator_roles_state (
  restaurant_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_home_areas_state (
  restaurant_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_business_directory_state (
  restaurant_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_printing_config_state (
  restaurant_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_catalog_state (
  restaurant_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists pos_tables_state_set_updated_at on public.pos_tables_state;
create trigger pos_tables_state_set_updated_at
before update on public.pos_tables_state
for each row execute function public.set_updated_at();

drop trigger if exists pos_operator_roles_state_set_updated_at on public.pos_operator_roles_state;
create trigger pos_operator_roles_state_set_updated_at
before update on public.pos_operator_roles_state
for each row execute function public.set_updated_at();

drop trigger if exists pos_home_areas_state_set_updated_at on public.pos_home_areas_state;
create trigger pos_home_areas_state_set_updated_at
before update on public.pos_home_areas_state
for each row execute function public.set_updated_at();

drop trigger if exists pos_business_directory_state_set_updated_at on public.pos_business_directory_state;
create trigger pos_business_directory_state_set_updated_at
before update on public.pos_business_directory_state
for each row execute function public.set_updated_at();

drop trigger if exists pos_printing_config_state_set_updated_at on public.pos_printing_config_state;
create trigger pos_printing_config_state_set_updated_at
before update on public.pos_printing_config_state
for each row execute function public.set_updated_at();

drop trigger if exists pos_catalog_state_set_updated_at on public.pos_catalog_state;
create trigger pos_catalog_state_set_updated_at
before update on public.pos_catalog_state
for each row execute function public.set_updated_at();
