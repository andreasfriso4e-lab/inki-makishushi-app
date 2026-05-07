import { isSupabaseConfigured } from "@/lib/server/supabase-json-store";

export type PrintTransportMode = "direct-tcp" | "queue-bridge";

function normalizeOverride(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "direct" || normalized === "direct-tcp") {
    return "direct-tcp" as const;
  }

  if (normalized === "queue" || normalized === "queue-bridge") {
    return "queue-bridge" as const;
  }

  return null;
}

export function getPrintTransportMode(): PrintTransportMode {
  const override = normalizeOverride(process.env.POS_PRINT_TRANSPORT_MODE);
  if (override) {
    if (override === "queue-bridge" && !isSupabaseConfigured()) {
      return "direct-tcp";
    }

    return override;
  }

  if ((process.env.VERCEL === "1" || process.env.VERCEL_ENV) && isSupabaseConfigured()) {
    return "queue-bridge";
  }

  return "direct-tcp";
}

export function isQueueBridgeTransportMode() {
  return getPrintTransportMode() === "queue-bridge";
}

