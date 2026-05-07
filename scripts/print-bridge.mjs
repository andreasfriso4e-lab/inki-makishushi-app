import net from "node:net";

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const RESTAURANT_ID = (process.env.RESTAURANT_ID || process.env.NEXT_PUBLIC_ACTIVE_RESTAURANT || "default").trim();
const PRINT_BRIDGE_POLL_MS = Number(process.env.PRINT_BRIDGE_POLL_MS || 1500);
const PRINT_BRIDGE_ID = (process.env.PRINT_BRIDGE_ID || `bridge-${process.pid}`).trim();
const BRIDGE_VERSION = "1.0.0";

function ensureEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatori per il print bridge");
  }
}

function nowIso() {
  return new Date().toISOString();
}

function baseRestUrl() {
  return `${SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "")}/rest/v1`;
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest(path, init = {}) {
  const response = await fetch(`${baseRestUrl()}${path}`, {
    ...init,
    headers: headers(init.headers || {}),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    throw new Error(
      typeof parsed === "object" && parsed?.message
        ? parsed.message
        : `Supabase REST ${response.status}`
    );
  }

  return parsed;
}

async function heartbeat(status = "online") {
  await rest("/print_bridge_status?on_conflict=restaurant_id,bridge_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([
      {
        restaurant_id: RESTAURANT_ID,
        bridge_id: PRINT_BRIDGE_ID,
        status,
        version: BRIDGE_VERSION,
        metadata: {
          host: process.env.HOSTNAME || "local-bridge",
          pid: process.pid,
        },
        last_seen_at: nowIso(),
        updated_at: nowIso(),
      },
    ]),
  });
}

async function listQueuedJobs() {
  return (
    (await rest(
      `/print_jobs?select=*&restaurant_id=eq.${encodeURIComponent(RESTAURANT_ID)}&status=eq.queued&order=created_at.asc&limit=20`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      }
    )) || []
  );
}

async function claimJob(jobId) {
  const rows =
    (await rest(
      `/print_jobs?restaurant_id=eq.${encodeURIComponent(RESTAURANT_ID)}&id=eq.${encodeURIComponent(jobId)}&status=eq.queued`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          status: "processing",
          bridge_id: PRINT_BRIDGE_ID,
          claimed_at: nowIso(),
          updated_at: nowIso(),
        }),
      }
    )) || [];

  return rows[0] || null;
}

function renderSimpleTicket(jobPayload) {
  const lines = [];
  lines.push("INKI MAKISUSHI APP");
  lines.push(jobPayload.summary || "STAMPA");
  if (jobPayload.tableLabel) lines.push(`Tavolo: ${jobPayload.tableLabel}`);
  if (jobPayload.roomLabel) lines.push(`Sala: ${jobPayload.roomLabel}`);
  if (jobPayload.operator) lines.push(`Operatore: ${jobPayload.operator}`);
  if (jobPayload.commandNumber) lines.push(`Comanda: ${jobPayload.commandNumber}`);
  if (jobPayload.documentType) lines.push(`Documento: ${jobPayload.documentType}`);
  if (jobPayload.paymentMethod) lines.push(`Pagamento: ${jobPayload.paymentMethod}`);
  lines.push(`Data: ${new Date().toLocaleString("it-IT")}`);
  lines.push("------------------------------------------");

  for (const item of jobPayload.items || []) {
    lines.push(`${item.quantity}x ${item.name}`);
    if (item.guestCode) lines.push(`  Commensale: ${item.guestCode}`);
    if (item.course) lines.push(`  Portata: ${item.course}`);
    if (item.note) lines.push(`  Nota: ${item.note}`);
  }

  lines.push("------------------------------------------");
  if (typeof jobPayload.subtotal === "number") lines.push(`Subtotale: ${jobPayload.subtotal.toFixed(2)}`);
  if (jobPayload.discountLabel) lines.push(jobPayload.discountLabel);
  if (typeof jobPayload.total === "number") lines.push(`Totale: ${jobPayload.total.toFixed(2)}`);
  lines.push("");
  lines.push("");
  return `${lines.join("\n")}\x1dV\x41\x10`;
}

async function printTcp(printer, jobPayload) {
  const message = renderSimpleTicket(jobPayload);

  await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let finished = false;

    const done = (error) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(Number(printer.timeoutMs || 5000));
    socket.once("error", done);
    socket.once("timeout", () => done(new Error("Timeout stampante")));
    socket.connect(Number(printer.port || 9100), printer.ipAddress, () => {
      socket.write(Buffer.from(message, "utf8"), (error) => {
        if (error) {
          done(error);
          return;
        }

        socket.end(() => done());
      });
    });
  });
}

async function updateOrderLinePrintState(jobRow, outcome) {
  const requestPayload = jobRow.request_payload || {};
  const printerJob = requestPayload.job || null;
  const lineItems = Array.isArray(printerJob?.items) ? printerJob.items : [];
  const orderId = jobRow.order_id;

  if (!orderId || lineItems.length === 0) {
    return;
  }

  const ids = lineItems.map((item) => item.id).filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  const lineRows =
    (await rest(
      `/order_lines?select=id,quantity,sent_quantity,queued_quantity,status,legacy_order_line_id,legacy_payload&restaurant_id=eq.${encodeURIComponent(RESTAURANT_ID)}&order_id=eq.${encodeURIComponent(orderId)}&legacy_order_line_id=in.(${ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`,
      { method: "GET", headers: { Accept: "application/json" } }
    )) || [];

  for (const lineRow of lineRows) {
    const matchingItem = lineItems.find((item) => item.id === lineRow.legacy_order_line_id);
    if (!matchingItem) continue;

    const currentPayload =
      lineRow.legacy_payload && typeof lineRow.legacy_payload === "object"
        ? lineRow.legacy_payload
        : {};
    const currentSent = Number(lineRow.sent_quantity || 0);
    const lineQuantity = Number(lineRow.quantity || 0);
    const deltaQuantity = Number(matchingItem.quantity || 0);
    const nextSent =
      outcome === "printed" ? Math.min(lineQuantity, currentSent + deltaQuantity) : currentSent;
    const nextQueued = 0;
    const nextStatus = nextSent > 0 ? "sent" : "draft";

    const nextPayload = {
      ...currentPayload,
      sentQuantity: nextSent,
      queuedQuantity: nextQueued,
      printStatus: outcome === "printed" ? "sent" : "pending",
      lastPrintJobId: jobRow.legacy_client_job_id || jobRow.id,
      sentToKitchenAt: outcome === "printed" ? nowIso() : currentPayload.sentToKitchenAt || null,
    };

    await rest(
      `/order_lines?restaurant_id=eq.${encodeURIComponent(RESTAURANT_ID)}&id=eq.${encodeURIComponent(lineRow.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          sent_quantity: nextSent,
          queued_quantity: nextQueued,
          print_status: outcome === "printed" ? "sent" : "pending",
          status: nextStatus,
          sent_to_kitchen_at: outcome === "printed" ? nowIso() : null,
          last_print_job_id: jobRow.id,
          legacy_payload: nextPayload,
          updated_at: nowIso(),
        }),
      }
    );
  }

  if (jobRow.legacy_client_job_id) {
    await rest(
      `/order_transmissions?restaurant_id=eq.${encodeURIComponent(RESTAURANT_ID)}&legacy_print_job_id=eq.${encodeURIComponent(jobRow.legacy_client_job_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: outcome === "printed" ? "sent" : "failed",
          error_message: outcome === "printed" ? null : "Stampa bridge fallita",
          updated_at: nowIso(),
        }),
      }
    ).catch(() => {});
  }
}

async function finalizeJob(jobRow, status, responsePayload = {}, errorMessage = null) {
  await rest(
    `/print_jobs?restaurant_id=eq.${encodeURIComponent(RESTAURANT_ID)}&id=eq.${encodeURIComponent(jobRow.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status,
        attempts: Number(jobRow.attempts || 0) + 1,
        bridge_id: PRINT_BRIDGE_ID,
        error_message: errorMessage,
        response_payload: responsePayload,
        printed_at: status === "printed" ? nowIso() : null,
        executed_at: status === "printed" ? nowIso() : null,
        updated_at: nowIso(),
      }),
    }
  );

  if (String(jobRow.job_type).startsWith("kitchen_") || jobRow.job_type === "order") {
    await updateOrderLinePrintState(jobRow, status);
  }
}

async function processJob(jobRow) {
  const payload = jobRow.request_payload || {};
  const printer = payload.printer || null;
  const printJob = payload.job || null;

  if (!printer) {
    await finalizeJob(jobRow, "failed", { reason: "missing-printer" }, "Printer payload mancante");
    return;
  }

  if (!printJob && jobRow.job_type !== "test") {
    await finalizeJob(jobRow, "failed", { reason: "missing-job" }, "Job payload mancante");
    return;
  }

  try {
    await printTcp(printer, printJob || {
      summary: `Test stampa ${printer.name}`,
      items: [],
    });
    await finalizeJob(jobRow, "printed", { printedBy: PRINT_BRIDGE_ID }, null);
    console.log(`[print-bridge] printed job=${jobRow.id} type=${jobRow.job_type}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore stampa sconosciuto";
    const status = /timeout/i.test(message) ? "timeout" : "failed";
    await finalizeJob(jobRow, status, { failedBy: PRINT_BRIDGE_ID }, message);
    console.error(`[print-bridge] failed job=${jobRow.id}`, message);
  }
}

let polling = false;

async function pollOnce() {
  if (polling) return;
  polling = true;

  try {
    await heartbeat("online");
    const queuedJobs = await listQueuedJobs();

    for (const queuedJob of queuedJobs) {
      const claimedJob = await claimJob(queuedJob.id);
      if (!claimedJob) continue;
      await processJob(claimedJob);
    }
  } catch (error) {
    console.error("[print-bridge] poll error", error instanceof Error ? error.message : error);
    await heartbeat("degraded").catch(() => {});
  } finally {
    polling = false;
  }
}

ensureEnv();
console.log(`[print-bridge] avviato restaurant=${RESTAURANT_ID} bridge=${PRINT_BRIDGE_ID}`);
await pollOnce();
setInterval(() => {
  void pollOnce();
}, PRINT_BRIDGE_POLL_MS);
