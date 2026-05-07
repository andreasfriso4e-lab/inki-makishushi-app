import type { OperatorRoleType } from "@/types/operator";

export type AuditEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "TABLE_OPENED"
  | "TABLE_CLOSED"
  | "TABLE_REOPENED"
  | "TABLE_MERGED"
  | "TABLE_SPLIT"
  | "ORDER_ITEM_ADDED"
  | "ORDER_ITEM_REMOVED"
  | "ORDER_ITEM_QTY_INCREASED"
  | "ORDER_ITEM_QTY_DECREASED"
  | "ORDER_ITEM_MOVED_COURSE"
  | "ORDER_NOTE_CHANGED"
  | "ORDER_SENT_TO_KITCHEN"
  | "ORDER_SENT_TO_BAR"
  | "DISCOUNT_APPLIED"
  | "SURCHARGE_APPLIED"
  | "PAYMENT_STARTED"
  | "PAYMENT_METHOD_SELECTED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_CANCELLED"
  | "RECEIPT_PRINTED"
  | "FISCAL_PRINT_REQUESTED"
  | "ORDER_DELETED"
  | "ITEM_DELETED"
  | "APP_ORDER_STATUS_CHANGED"
  | "APP_ORDER_DETAIL_OPENED"
  | "APP_ORDER_MOVED"
  | "APP_ORDER_PRODUCTION_SENT"
  | "APP_ORDER_REPRINTED"
  | "APP_ORDER_PAYMENT_UPDATED"
  | "APP_ORDER_DOCUMENT_CREATED"
  | "APP_ORDER_DOCUMENT_OPENED"
  | "CONFIG_PAYMENT_METHOD_CHANGED"
  | "CONFIG_HOME_CHANGED"
  | "CONFIG_DEPARTMENT_CHANGED"
  | "CONFIG_VAT_CHANGED"
  | "CONFIG_PRINTER_CHANGED"
  | "CONFIG_COMMAND_PRINT_CHANGED"
  | "FIDELITY_CUSTOMER_CREATED"
  | "FIDELITY_CUSTOMER_UPDATED"
  | "FIDELITY_CODE_SCANNED"
  | "FIDELITY_REWARD_SELECTED"
  | "FIDELITY_REWARD_CANCELLED"
  | "FIDELITY_POINTS_PROCESSED"
  | "OPERATOR_CREATED"
  | "OPERATOR_UPDATED"
  | "OPERATOR_DISABLED"
  | "OPERATOR_ENABLED"
  | "PASSWORD_CHANGED";

export type AuditOrigin =
  | "auth"
  | "ui_pos"
  | "table"
  | "order"
  | "payment"
  | "configuration"
  | "document"
  | "printing"
  | "fidelity";

export type AuditEntityType =
  | "operator"
  | "session"
  | "table"
  | "order"
  | "order-item"
  | "payment"
  | "payment-settings"
  | "home-settings"
  | "department-settings"
  | "vat-settings"
  | "printer-settings"
  | "command-settings"
  | "document"
  | "fidelity-customer"
  | "fidelity-scan"
  | "fidelity-redemption"
  | "fidelity-points"
  | "app-order"
  | "unknown";

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  operatorId: string;
  operatorName: string;
  role: OperatorRoleType;
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId: string;
  tableId?: string;
  orderId?: string;
  paymentId?: string;
  previousValue?: unknown;
  nextValue?: unknown;
  notes?: string;
  origin: AuditOrigin;
};

export type NewAuditLogInput = Omit<AuditLogEntry, "id" | "timestamp">;
