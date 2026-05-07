# Local Print Bridge

Bridge locale per stampanti LAN Ethernet della Inki Makisushi app.

## Scopo

- legge `print_jobs` da Supabase
- marca i job `processing`
- stampa via TCP su `printer_ip:printer_port`
- aggiorna i job a `printed`, `failed` o `timeout`
- aggiorna heartbeat bridge

## Variabili ambiente

Usa un file `.env` locale con almeno:

```env
SUPABASE_URL=SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY
RESTAURANT_ID=default
PRINT_BRIDGE_POLL_MS=1500
PRINT_BRIDGE_ID=bridge-cassa-1
```

## Avvio

```bash
npm install
npm run print-bridge
```

## Test utili

Test stato bridge / code:

```bash
curl http://localhost:3101/api/admin/print-diagnostics
```

Test stampa:

```bash
curl -X POST http://localhost:3101/api/admin/print-diagnostics \
  -H 'Content-Type: application/json' \
  -d '{"action":"test-print","printerId":"printer-bar"}'
```

## Produzione Mini PC

Installazione consigliata:

1. `npm install`
2. `npm run build`
3. configurare `.env`
4. avvio automatico con `pm2` o `systemd`

File inclusi:

- `local-print-bridge/ecosystem.config.cjs`
- `local-print-bridge/inki-print-bridge.service.example`
