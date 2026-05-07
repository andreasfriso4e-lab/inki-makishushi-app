"use client";

import type { AuditLogEntry } from "@/types/audit";

const AUDIT_LOG_STORAGE_KEY = "pos-audit-log";
const OPERATIONAL_LOGS_API_ENDPOINT = "/api/operational-logs";
export const AUDIT_LOG_CHANGED_EVENT = "pos-audit-log-changed";

function dispatchAuditLogChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUDIT_LOG_CHANGED_EVENT));
  }
}

function mergeAuditLogEntries(primary: AuditLogEntry[], secondary: AuditLogEntry[]) {
  const merged = new Map<string, AuditLogEntry>();

  for (const entry of secondary) {
    merged.set(entry.id, entry);
  }

  for (const entry of primary) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function getStoredAuditLog() {
  if (typeof window === "undefined") {
    return [] as AuditLogEntry[];
  }

  const rawValue = window.localStorage.getItem(AUDIT_LOG_STORAGE_KEY);

  if (!rawValue) {
    return [] as AuditLogEntry[];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as AuditLogEntry[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    window.localStorage.removeItem(AUDIT_LOG_STORAGE_KEY);
    return [] as AuditLogEntry[];
  }
}

export function saveStoredAuditLog(entries: AuditLogEntry[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(entries));
  }

  dispatchAuditLogChanged();
  void persistAuditLogToServer(entries);
  return entries;
}

async function persistAuditLogToServer(entries: AuditLogEntry[]) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(OPERATIONAL_LOGS_API_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({
        auditLogs: entries,
      }),
    });

    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export async function hydrateAuditLogFromServer() {
  if (typeof window === "undefined") {
    return [] as AuditLogEntry[];
  }

  try {
    const response = await fetch(OPERATIONAL_LOGS_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return getStoredAuditLog();
    }

    const payload = (await response.json()) as { auditLogs?: AuditLogEntry[] };
    const merged = mergeAuditLogEntries(
      Array.isArray(payload.auditLogs) ? payload.auditLogs : [],
      getStoredAuditLog()
    );
    window.localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(merged));
    dispatchAuditLogChanged();
    return merged;
  } catch {
    return getStoredAuditLog();
  }
}
