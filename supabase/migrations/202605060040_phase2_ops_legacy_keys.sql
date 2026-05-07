alter table if exists public.fidelity_profiles
  add column if not exists legacy_fidelity_customer_id text;

alter table if exists public.fidelity_rewards
  add column if not exists legacy_reward_id text;

alter table if exists public.fidelity_points_movements
  add column if not exists legacy_points_movement_id text;

alter table if exists public.fidelity_reward_redemptions
  add column if not exists legacy_redemption_id text;

alter table if exists public.printer_routing_rules
  add column if not exists legacy_rule_key text;

alter table if exists public.fiscal_printer_logs
  add column if not exists legacy_fiscal_log_id text,
  add column if not exists legacy_payload jsonb not null default '{}'::jsonb;

alter table if exists public.void_logs
  add column if not exists legacy_void_log_id text,
  add column if not exists legacy_payload jsonb not null default '{}'::jsonb;

alter table if exists public.audit_logs
  add column if not exists legacy_audit_log_id text,
  add column if not exists legacy_payload jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.fidelity_profiles') is not null then
    execute 'create unique index if not exists idx_fidelity_profiles_legacy_customer
      on public.fidelity_profiles (restaurant_id, legacy_fidelity_customer_id)
      where legacy_fidelity_customer_id is not null';
  end if;

  if to_regclass('public.fidelity_rewards') is not null then
    execute 'create unique index if not exists idx_fidelity_rewards_legacy_reward
      on public.fidelity_rewards (restaurant_id, legacy_reward_id)
      where legacy_reward_id is not null';
  end if;

  if to_regclass('public.fidelity_points_movements') is not null then
    execute 'create unique index if not exists idx_fidelity_points_movements_legacy_id
      on public.fidelity_points_movements (restaurant_id, legacy_points_movement_id)
      where legacy_points_movement_id is not null';
  end if;

  if to_regclass('public.fidelity_reward_redemptions') is not null then
    execute 'create unique index if not exists idx_fidelity_reward_redemptions_legacy_id
      on public.fidelity_reward_redemptions (restaurant_id, legacy_redemption_id)
      where legacy_redemption_id is not null';
  end if;

  if to_regclass('public.printer_routing_rules') is not null then
    execute 'create unique index if not exists idx_printer_routing_rules_legacy_key
      on public.printer_routing_rules (restaurant_id, legacy_rule_key)
      where legacy_rule_key is not null';
  end if;

  if to_regclass('public.fiscal_printer_logs') is not null then
    execute 'create unique index if not exists idx_fiscal_printer_logs_legacy_id
      on public.fiscal_printer_logs (restaurant_id, legacy_fiscal_log_id)
      where legacy_fiscal_log_id is not null';
  end if;

  if to_regclass('public.void_logs') is not null then
    execute 'create unique index if not exists idx_void_logs_legacy_id
      on public.void_logs (restaurant_id, legacy_void_log_id)
      where legacy_void_log_id is not null';
  end if;

  if to_regclass('public.audit_logs') is not null then
    execute 'create unique index if not exists idx_audit_logs_legacy_id
      on public.audit_logs (restaurant_id, legacy_audit_log_id)
      where legacy_audit_log_id is not null';
  end if;
end $$;
