import type { OrderCommandSettings } from "@/lib/order-command-settings";

export type TcpPrinterTarget = {
  id: string;
  name: string;
  model: "ESC/POS" | "Epson RT v.10 XML7";
  role: "fiscal" | "bar" | "kitchen" | "generic";
  ipAddress: string;
  port: number | null;
  timeoutMs: number;
  paperColumns: number | null;
};

export type TcpPrintItemPayload = {
  id: string;
  name: string;
  quantity: number;
  guestCode?: string | null;
  course?: string;
  note?: string;
};

export type TcpPrintJobPayload = {
  id: string;
  type:
    | "order"
    | "fiscal-document"
    | "connection-test"
    | "prebill"
    | "table-move"
    | "void"
    | "test-print";
  summary: string;
  tableLabel?: string;
  sourceTableLabel?: string;
  destinationTableLabel?: string;
  roomLabel?: string;
  destinationRoomLabel?: string;
  operator?: string;
  commandNumber?: string;
  guests?: number;
  customerLabel?: string;
  companyLabel?: string;
  commandSettingsSnapshot?: OrderCommandSettings;
  documentType?: string;
  paymentMethod?: string;
  subtotal?: number;
  discountLabel?: string;
  total?: number;
  createdAt: string;
  items: TcpPrintItemPayload[];
};

export type PrinterTestRequest = {
  printer: TcpPrinterTarget;
  mode?: "connection" | "print";
};

export type PrinterPrintRequest = {
  printer: TcpPrinterTarget;
  job: TcpPrintJobPayload;
};

export type PrinterTransportResponse = {
  ok: boolean;
  message: string;
  openedSocket: boolean;
  printed: boolean;
  at: string;
  errorCode?: string;
};
