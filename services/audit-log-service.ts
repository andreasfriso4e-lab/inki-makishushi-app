"use client";

import { saveStoredAuditLog, getStoredAuditLog } from "@/repositories/audit-log-repository";
import { getCurrentAuditActor } from "@/services/operator-session-service";
import type { AuditLogEntry, NewAuditLogInput } from "@/types/audit";
import { createStableId } from "@/utils/id";

function getNowIso() {
  return new Date().toISOString();
}

export function getAuditLog() {
  return getStoredAuditLog();
}

export function recordAuditEvent(input: Partial<NewAuditLogInput> & Pick<NewAuditLogInput, "eventType">) {
  const actor = getCurrentAuditActor();

  const nextEntry: AuditLogEntry = {
    id: createStableId("audit"),
    timestamp: getNowIso(),
    operatorId: input.operatorId ?? actor.operatorId,
    operatorName: input.operatorName ?? actor.operatorName,
    role: input.role ?? actor.role,
    eventType: input.eventType,
    entityType: input.entityType ?? "unknown",
    entityId: input.entityId ?? "unknown",
    tableId: input.tableId,
    orderId: input.orderId,
    paymentId: input.paymentId,
    previousValue: input.previousValue,
    nextValue: input.nextValue,
    notes: input.notes,
    origin: input.origin ?? "ui_pos",
  };

  saveStoredAuditLog([nextEntry, ...getStoredAuditLog()]);
  return nextEntry;
}
