# Inki Makisushi app · Phase 2 Normalized Backend Plan

This document defines the safe migration path from the current mixed local/blob persistence to a normalized Supabase/Postgres backend.

## Scope of the new normalized schema

The migration `supabase/migrations/202605060010_phase2_normalized_backend.sql` adds these table groups:

- `restaurants`
- `operator_roles`
- `operator_role_permissions`
- `operators`
- `companies`
- `customers`
- `fidelity_profiles`
- `fidelity_rewards`
- `fidelity_points_movements`
- `fidelity_reward_redemptions`
- `rooms`
- `tables`
- `vat_rates`
- `departments`
- `categories`
- `products`
- `payment_methods`
- `printer_configs`
- `printer_routing_rules`
- `app_settings`
- `orders`
- `order_courses`
- `order_guests`
- `order_lines`
- `table_status_history`
- `order_transmissions`
- `order_transmission_lines`
- `split_bill_sessions`
- `split_bill_quotas`
- `payments`
- `fiscal_documents`
- `prebills`
- `cash_closures`
- `daily_reports`
- `print_jobs`
- `fiscal_printer_logs`
- `void_logs`
- `audit_logs`

## Current source of truth by domain

These areas are already capable of writing to Supabase, but only as JSON blobs:

- Tables and live order state:
  - `/Users/tanddem/Documents/New project/pos-frontend/app/api/tables/route.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/server/shared-tables-store.ts`
- Operators and roles:
  - `/Users/tanddem/Documents/New project/pos-frontend/app/api/operator-roles/route.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/server/shared-operator-roles-store.ts`
- Rooms / home areas:
  - `/Users/tanddem/Documents/New project/pos-frontend/app/api/home-areas/route.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/server/shared-home-areas-store.ts`
- Business directory:
  - `/Users/tanddem/Documents/New project/pos-frontend/app/api/business-directory/route.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/server/shared-business-directory-store.ts`
- Printing config:
  - `/Users/tanddem/Documents/New project/pos-frontend/app/api/printing-config/route.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/server/shared-printing-config-store.ts`

These areas still keep local fallback active as primary safety net during transition:

- Products, categories, demo seeds:
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/pos-data.ts`
- Departments:
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/department-settings.ts`
- VAT rates:
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/vat-rate-settings.ts`
- Payment method settings:
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/payment-method-settings.ts`
- Fidelity:
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/fidelity-data.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/app/api/fidelity-state/route.ts`
- Fiscal/archive/report/closure:
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/document-archive.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/cash-close.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/sales-reports.ts`
- Print jobs and logs:
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/print-job-service.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/fiscal-printer-log.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/lib/storno-log.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/repositories/audit-log-repository.ts`
  - `/Users/tanddem/Documents/New project/pos-frontend/app/api/operational-logs/route.ts`

## Import order

Use this exact order to reduce broken references during migration:

1. `restaurants`
2. `operator_roles`
3. `operator_role_permissions`
4. `operators`
5. `rooms`
6. `tables`
7. `vat_rates`
8. `departments`
9. `categories`
10. `products`
11. `payment_methods`
12. `printer_configs`
13. `printer_routing_rules`
14. `app_settings`
15. `companies`
16. `customers`
17. `fidelity_profiles`
18. `fidelity_rewards`
19. `orders`
20. `order_courses`
21. `order_guests`
22. `order_lines`
23. `table_status_history`
24. `order_transmissions`
25. `order_transmission_lines`
26. `split_bill_sessions`
27. `split_bill_quotas`
28. `payments`
29. `fiscal_documents`
30. `prebills`
31. `fidelity_points_movements`
32. `fidelity_reward_redemptions`
33. `cash_closures`
34. `daily_reports`
35. `print_jobs`
36. `fiscal_printer_logs`
37. `void_logs`
38. `audit_logs`

## Dual-read strategy

Roll out every domain in this order:

### Phase A
- read normalized Supabase table first
- if no rows exist yet, read current local/blob source
- keep current UI unchanged

### Phase B
- after read validation passes, start dual-write
- write normalized Supabase tables
- keep existing local/blob write active

### Phase C
- compare a representative sample:
  - table states
  - orders
  - companies
  - operators
  - products
  - print configuration

### Phase D
- once parity is verified, switch primary reads fully to normalized Supabase
- keep local write backup for one more release cycle

### Phase E
- remove local primary write only after export + rollback validation

## Dual-write strategy by domain

### Operators / roles
- Continue writing `pos_operator_roles_state`
- Add normalized writes to:
  - `operator_roles`
  - `operator_role_permissions`
  - `operators`

### Rooms / tables / live orders
- Continue writing `pos_tables_state`
- Add normalized writes to:
  - `rooms`
  - `tables`
  - `orders`
  - `order_courses`
  - `order_guests`
  - `order_lines`
  - `table_status_history`
  - `split_bill_sessions`
  - `split_bill_quotas`

### Business directory
- Continue writing `pos_business_directory_state`
- Add normalized writes to:
  - `companies`
  - `customers`

### Printing config
- Continue writing `pos_printing_config_state`
- Add normalized writes to:
  - `printer_configs`
  - `printer_routing_rules`
  - `app_settings`

### Catalog/config
- Keep local source active first
- Introduce normalized writes to:
  - `vat_rates`
  - `departments`
  - `categories`
  - `products`
  - `payment_methods`

### Payments and documents
- Keep local source active first
- Introduce normalized writes to:
  - `payments`
  - `fiscal_documents`
  - `prebills`
  - `cash_closures`
  - `daily_reports`

### Fidelity
- Keep local source active first
- Introduce normalized writes to:
  - `fidelity_profiles`
  - `fidelity_rewards`
  - `fidelity_points_movements`
  - `fidelity_reward_redemptions`

### Logs/audit
- Keep local source active first
- Introduce normalized writes to:
  - `printer_configs`
  - `printer_routing_rules`
  - `fiscal_printer_logs`
  - `void_logs`
  - `audit_logs`

## Phase 2 rollout status

Completed in dual-read + dual-write:
- `rooms`
- `tables`
- `operator_roles`
- `operators`
- `companies`
- `customers`
- `orders`
- `order_courses`
- `order_guests`
- `order_lines`
- `order_transmissions`
- `order_transmission_lines`
- `departments`
- `categories`
- `products`
- `payment_methods`
- `vat_rates`
- `payments`
- `fiscal_documents`
- `cash_closures`
- `daily_reports`
- `fidelity_profiles`
- `fidelity_rewards`
- `fidelity_points_movements`
- `fidelity_reward_redemptions`
- `printer_configs`
- `printer_routing_rules`
- `fiscal_printer_logs`
- `void_logs`
- `audit_logs`

Still intentionally local-first with safe fallback:
- LAN/TCP print execution itself
- some app-level settings still embedded in legacy payloads or blob mirrors
- any remaining historical/demo seeds not yet promoted to first-class relational reads

Estimated backend completion:
- relational schema prepared: `100%`
- dual-read + dual-write operational coverage: `94%`
- remaining work is mainly hardening, parity checks, and final primary-read cutover

## Read mode rollout

Primary-read infrastructure is now prepared domain by domain with these modes:

- `fallback-first`
- `supabase-read-with-fallback`
- `supabase-primary-read`

### Ready for `supabase-read-with-fallback`
- `rooms`
- `tables` metadata only
- `operator_roles`
- `operators`
- `companies`
- `customers`
- `departments`
- `categories`
- `products`
- `payment_methods`
- `vat_rates`

### Promoted to primary relational reads with safe fallback
- `rooms`
- `tables` metadata
- `orders` live
- `order_lines` live
- `order_courses` live
- `order_guests` live
- `order_transmissions`
- `order_transmission_lines`
- `payments` with parity-gated Supabase read and immediate fallback
- `fiscal_documents` with parity-gated Supabase read and immediate fallback
- `cash_closures` with parity-gated Supabase read and immediate fallback
- `daily_reports` with parity-gated Supabase read and immediate fallback
- `companies`
- `customers`
- `departments`
- `categories`
- `products`
- `payment_methods`
- `vat_rates`
- `operator_roles` and `operators` after initial default-role seed parity
- `printer_configs` and `printer_routing_rules` after parity-gated relational config checks
- `fidelity` after parity-gated relational profile/reward/movement checks

### Keep `fallback-first` for now
- printer config as primary operational source
- prebill / print operational flow
- audit / log domains

## Residual risks after live-order cutover

- Relational live orders are now the primary read path only with immediate fallback still active.
- If Supabase returns empty or inconsistent operational overlays, the app continues to use `pos_tables_state` / local fallback without blocking `/cassa` or `/palmare`.
- Payments now use a parity-gated relational read path: if counts, totals, or key payment fields diverge, the archive remains on fallback automatically.
- Fiscal documents now use the same parity-gated relational read path: if counts, totals, status, or document keys diverge, the archive remains on fallback automatically.
- Cash closures and daily reports now use the same parity-gated relational archive path: if counts, totals, or legacy archive keys diverge, the archive remains on fallback automatically.
- Printer configuration and fidelity now support guarded Supabase-first reads with immediate fallback if parity is not clean.
- Printer configuration, fidelity, and operational logs remain intentionally protected outside this cutover.

## Manual checks before final sensitive-domain cutover

- `/cassa`
  - open a free table
  - add products
  - change quantity
  - change course when applicable
  - leave and reopen the same table
  - verify the order is identical
  - send the kitchen command
  - verify print behavior is unchanged
  - open payment and verify the current protected fallback path still behaves the same
  - confirm a cash payment
  - verify the table closes as before
  - verify the archive remains visible as before
  - verify `payments` receives the row in Supabase
  - verify diagnostics reports `payments` source, counts, totals, and parity
  - verify `fiscal_documents` receives the row in Supabase
  - verify diagnostics reports `fiscalDocuments` source, counts, totals, and parity
  - verify `cash_closures` and `daily_reports` receive rows in Supabase when those flows are used
  - verify printer configuration and routing remain visible with identical behavior
  - verify fidelity state remains available with no visible regression
- `/palmare`
  - login operator
  - open table list
  - open a table
  - add products
  - send the command
  - return to `/palmare`
  - reopen the table and verify order consistency
- daily reports
- fidelity
- fiscal printer logs
- void logs
- audit logs

## Final stable-domain cutover status

Stable domains now use Supabase as the effective primary read path whenever relational rows are available, with automatic fallback to blob/file/default state if:

- Supabase is not configured
- Supabase returns an error
- relational tables are empty for that domain

This cutover intentionally excludes:

- live orders and live order lines
- printer configs as operational source of truth
- audit / fiscal / void logs

### Residual risks after stable cutover
- some stable domains can still fall back if relational seed was not completed for that specific restaurant
- operator defaults may come from the built-in fallback set until relational operator seed is populated
- blob mirror tables remain necessary as rollback/safety bridge

### Manual verification after stable cutover
1. open `/cassa`
2. verify table list
3. open a table
4. verify categories and products
5. verify companies and customers
6. send a command
7. print prebill
8. go to payment
9. confirm no visible regressions
10. open `/api/admin/supabase-diagnostics`
11. verify stable-domain `source` is `supabase`

## Parity check coverage

The internal route `/api/admin/parity-check` now supports best-effort comparison for:

- `orders`
- `order_lines`
- `order_courses`
- `order_guests`
- `payments`
- `fiscal_documents`
- `printer_configs`
- `printer_routing_rules`
- `fidelity`
- `operational_logs`

The checker is read-only and reports:
- `checked`
- `matched`
- `mismatched`
- `missingInSupabase`
- `missingInFallback`
- `errors`

## Checklist before final cutover

1. Run parity check on all supported domains with realistic restaurant data.
2. Resolve missing legacy key mismatches first.
3. Validate fallback operation with Supabase unavailable.
4. Validate printer configuration and routing parity without changing LAN print execution.
5. Validate payments and fiscal archive parity after a full service cycle.
6. Promote only low-risk domains to `supabase-read-with-fallback`.
7. Keep operationally sensitive domains in `fallback-first` for at least one more release cycle.

## Safe fallback

During the whole transition:

- never remove current local JSON files
- never remove current `localStorage` readers until parity is proven
- keep current blob tables in Supabase:
  - `pos_tables_state`
  - `pos_operator_roles_state`
  - `pos_home_areas_state`
  - `pos_business_directory_state`
  - `pos_printing_config_state`
  - `pos_catalog_state`
- keep printer TCP execution local:
  - Supabase stores configuration and history
  - LAN print transport stays in the local app/server path

## Residual risks

- Some domains still hydrate into localStorage before relational state becomes the eventual primary read path.
- Printing feature flags and command settings are preserved in the blob mirror and printer metadata during transition, not yet as dedicated primary relational settings reads.
- Final cutover still requires parity checks on production-like data before local/blob sources can be downgraded further.

## Backups

### Daily
- Supabase automatic daily backups
- export JSON backup of local blob state before first dual-write rollout

### Weekly
- external SQL dump:
  - `pg_dump` or Supabase CLI dump when available
- copy local fallback files from:
  - `/Users/tanddem/Documents/New project/pos-frontend/data`

### Before every release
- export normalized tables
- export blob state tables
- export local files still in use

### PITR
- enable Point In Time Recovery if the Supabase plan supports it
- retain at least one external dump outside Supabase

Official references:
- [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase point-in-time recovery](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)
- [Supabase backup via CLI](https://supabase.com/docs/guides/deployment/ci/backups)

## Recommended next implementation step

Implement repositories for the first low-risk domains:

1. `rooms`
2. `tables`
3. `operator_roles`
4. `operators`
5. `companies`
6. `customers`

Keep them in dual-read / dual-write while leaving the current UI and API contracts unchanged.
