"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

import { buildOrderRoute, getAppHomePath } from "@/lib/app-mode";
import { FinalPaymentPanel } from "@/components/final-payment-panel";
import { CompanyFormFields } from "@/components/company-form-fields";
import { PalmareOrderScreen } from "@/components/palmare-order-screen";
import { PokeConfigurator } from "@/components/poke-configurator";
import { PosSidebar } from "@/components/pos-sidebar";
import { CodeScannerModal } from "@/components/code-scanner-modal";
import { createEmptyCompanyRecord, normalizeCompanyRecord } from "@/lib/company-records";
import { lookupCompanyByVatNumber } from "@/lib/company-vat-lookup";
import { addArchivedMovement } from "@/lib/document-archive";
import { getDepartmentDisplayName } from "@/lib/department-settings";
import { getActiveRestaurantId } from "@/lib/restaurant-config";
import {
  appendFidelityScanLog,
  cancelPendingFidelityReward,
  calculateEarnedPoints,
  createPendingRewardRedemption,
  finalizeFidelityPayment,
  FIDELITY_DATA_CHANGED_EVENT,
  findFidelityCustomerByCode,
  getAvailableFidelityRewards,
  getFidelityCustomers,
  getFidelityRewards,
  type FidelityCustomer,
  type FidelityReward,
  type FidelityScanType,
} from "@/lib/fidelity-data";
import {
  getPaymentMethodSettings,
  type ConfigurablePaymentMethodId,
  type PaymentMethodSetting,
} from "@/lib/payment-method-settings";
import { PrintJobService } from "@/lib/print-job-service";
import {
  getDepartmentForOrderItem,
  getPrinterRoleForDepartment,
} from "@/lib/printer-routing";
import { getTableOperationalModeLabel, getTableOperationalState } from "@/lib/table-operational-status";
import { appendStornoRecord, type StornoRecordType } from "@/lib/storno-log";
import { recordAuditEvent } from "@/services/audit-log-service";
import {
  getDefaultOperationalVatRate,
  getVatRateByKey,
} from "@/lib/vat-rate-settings";
import type {
  CompanyRecord,
  CourseGroup,
  CustomerRecord,
  OrderItem,
  PokeConfiguratorSection,
  PosTableState,
  Product,
  ProductCategory,
  SplitBillMode,
  SplitBillQuota,
  SplitBillState,
} from "@/lib/pos-data";
import type { OperatorActorSnapshot } from "@/types/operator";
import {
  hydrateBusinessDirectoryFromServer,
  findTableById,
  getCompanies,
  getCustomers,
  getProducts,
  persistBusinessDirectoryToServer,
  saveCompanies,
  saveCustomers,
} from "@/lib/pos-data";
import { useAuth } from "@/store/auth-context";
import { useTables } from "@/store/table-context";

type OrderMode = CourseGroup | "RIEPILOGO";
type PaymentMethod =
  | "CONTANTI"
  | "CARTA"
  | "BANCOMAT"
  | "FIDELITY"
  | "ASSEGNO"
  | null;
type DocumentMode = "FATTURA" | "SCONTRINO_PARLANTE" | "SCONTRINO" | null;
type PanelMode = "draft" | "sent-summary" | "detail" | "payment" | "edit-order";
type DetailPickerMode = "customer" | "company" | null;
type DetailEditorMode = "customer" | "company" | null;
type QuantityPickerOverlay = {
  itemId: string;
  top: number;
  left: number;
};
type SizeSelectorOverlay = {
  product: Product;
  top: number;
  left: number;
};
type WagyuPriceMode = "per-kg" | "manual";
type TartareChoice = "Naturale" | "Condita";
type PaymentCalculationBase = "SUB" | "TOT";
type PaymentAdjustmentType = "fixed-discount" | "percent-discount" | "percent-surcharge";
type PaymentAdjustment = {
  id: string;
  type: PaymentAdjustmentType;
  base: PaymentCalculationBase;
  inputValue: number;
  amount: number;
  resultTotal: number;
  scope?: "calculator" | "quick-discount";
  label?: string;
};
type FidelityScannerContext = "payment-method" | "payment-panel";
type FidelityPanelStep = "choice" | "rewards";
type QuickDiscountMode = "euro" | "percent";
type SplitPaymentMode = SplitBillMode | "none";
type VoidPrintableItem = {
  itemId?: string;
  productId: string;
  name: string;
  quantity: number;
  department: string;
  printerRole: string;
  note?: string;
  course?: CourseGroup;
};
type PendingVoidAction = {
  kind: StornoRecordType;
  title: string;
  message: string;
  items: VoidPrintableItem[];
  nextOrders: OrderItem[];
  allowPrint: boolean;
};
type DraftOrderClearReason =
  | "payment_completed"
  | "empty_table_reset"
  | "user_cancel_confirmed"
  | "table_closed"
  | "logout";
type LocalDraftOrderSnapshot = {
  tableId: string;
  restaurantId: string;
  orderId: string | null;
  covers: number;
  operatorId: string | null;
  customerId: string | null;
  orderLines: OrderItem[];
  updatedAt: string;
  hasUnsavedChanges: boolean;
};
type SafeOrderMutationReason =
  | "PAYMENT_COMPLETED"
  | "CONFIRMED_EMPTY_TABLE"
  | "CONFIRMED_CANCEL_ORDER"
  | "OPEN_DIFFERENT_EMPTY_TABLE"
  | "ORDER_RESTORE"
  | "AUTO_COVER_SYNC"
  | "ADD_PRODUCT"
  | "ADD_TARTARE_VARIANT"
  | "ADD_PASTO"
  | "ADD_SIZED_PRODUCT"
  | "ADD_WAGYU"
  | "ADD_CONFIGURED_POKE"
  | "MOVE_ITEM_WITHIN_COURSE"
  | "ASSIGN_GUEST_GROUP"
  | "UPDATE_ITEM_QUANTITY"
  | "SAVE_ITEM_NOTE"
  | "DELETE_ITEM_CONFIRMED"
  | "VOID_ACTION_APPLIED"
  | "SEND_ORDER_RESULT"
  | "CANCEL_CHANGES_RESTORE"
  | "PAYMENT_SPLIT_QUOTA_SAVE"
  | "PAYMENT_PARTIAL_SAVE"
  | "SPLIT_PAYMENT_SAVE";
const AUTO_COVER_PRODUCT_ID = "auto-cover-charge";
const COVER_CHARGE_UNIT_PRICE = 3;
const guestGroupOptions = ["C1", "C2", "C3", "C4", "C5", "C6"] as const;
const serviceProductIds = new Set([
  AUTO_COVER_PRODUCT_ID,
  "servizio-pranzo",
  "servizio-cena",
  "servizio-torta",
  "pasto",
]);
const uramakiSelectorCategories = new Set<ProductCategory>(["Uramaki Deluxe", "Uramaki classici"]);

const tartareChoiceMap: Record<
  string,
  Array<{
    id: "naturale" | "condita";
    label: TartareChoice;
    price: number;
  }>
> = {
  "tartare-salmone": [
    { id: "naturale", label: "Naturale", price: 11 },
    { id: "condita", label: "Condita", price: 12 },
  ],
  "tartare-tonno": [
    { id: "naturale", label: "Naturale", price: 12 },
    { id: "condita", label: "Condita", price: 13 },
  ],
  "tartare-ombrina": [
    { id: "naturale", label: "Naturale", price: 11 },
    { id: "condita", label: "Condita", price: 12 },
  ],
};

type TableOrderScreenProps = {
  tableId: string;
  initialPanelMode: PanelMode;
  deviceMode?: "cassa" | "palmare";
  products: Product[];
  categories: ProductCategory[];
  pokeSections: PokeConfiguratorSection[];
};

const courseModes: OrderMode[] = ["PRIMA PORTATA", "SECONDA PORTATA", "TERZA PORTATA", "RIEPILOGO"];
const operatorOptions = ["Admin", "Operatore 1", "Operatore 2", "Operatore 3"];
const servicePriceOptions = ["Servizio pranzo", "Servizio cena"];
const palmareQuickNotes = [
  "senza glutine",
  "senza sale",
  "ben cotto",
  "poco cotto",
  "senza cipolla",
  "allergia",
  "da dividere",
] as const;
const palmareCourseQuickOptions: Array<{
  label: string;
  mode: CourseGroup;
}> = [
  { label: "Antipasto", mode: "PRIMA PORTATA" },
  { label: "Bevanda", mode: "PRIMA PORTATA" },
  { label: "Primo", mode: "SECONDA PORTATA" },
  { label: "Secondo", mode: "SECONDA PORTATA" },
  { label: "Dolce", mode: "TERZA PORTATA" },
  { label: "Altro", mode: "TERZA PORTATA" },
];

function formatEuro(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function clampCurrency(value: number) {
  return Math.max(0, roundCurrency(value));
}

function buildSplitQuotaId(prefix: string) {
  return `split-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSplitQuotaTotal(quotas: SplitBillQuota[]) {
  return roundCurrency(quotas.reduce((total, quota) => total + quota.amount, 0));
}

function buildOrderItemId(baseId: string) {
  return `${baseId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function hasItemCustomizations(item: OrderItem) {
  return Boolean(
    item.note?.trim() ||
      (item.additions && item.additions.length > 0) ||
      (item.removals && item.removals.length > 0)
  );
}

function calculateAdjustedPaymentTotal(
  baseSubtotal: number,
  rewardDiscount: number,
  adjustments: PaymentAdjustment[]
) {
  const baseAfterReward = clampCurrency(baseSubtotal - Math.min(rewardDiscount, baseSubtotal));

  return adjustments.reduce((currentTotal, adjustment) => {
    const adjustmentBaseTotal =
      adjustment.base === "SUB" ? baseAfterReward : currentTotal;

    if (adjustment.type === "fixed-discount") {
      return clampCurrency(adjustmentBaseTotal - adjustment.inputValue);
    }

    const percentageAmount = adjustmentBaseTotal * (adjustment.inputValue / 100);
    return adjustment.type === "percent-discount"
      ? clampCurrency(currentTotal - percentageAmount)
      : clampCurrency(currentTotal + percentageAmount);
  }, baseAfterReward);
}

function buildVatSnapshot(vatRateKey?: string | null) {
  const fallbackRate = getDefaultOperationalVatRate();
  const vatRate = getVatRateByKey(vatRateKey) ?? fallbackRate;

  return {
    vatRateKey: vatRate.key,
    vatRateLabel: vatRate.label,
    vatRateValue: vatRate.value,
  };
}

function buildOrderItem(
  product: Product,
  actor: OperatorActorSnapshot,
  course: CourseGroup
): OrderItem {
  const now = new Date().toISOString();

  return {
    id: buildOrderItemId(product.id),
    productId: product.id,
    name: product.name,
    quantity: 1,
    commensaleCode: null,
    sentQuantity: 0,
    unitPrice: product.price,
    originalUnitPrice: product.price,
    course,
    status: "draft",
    paymentState: "unpaid",
    operatorLabel: actor.operatorName,
    operatorId: actor.operatorId,
    orderId: `${product.id}-${course.toLowerCase().replace(/\s+/g, "-")}`,
    createdAt: now,
    updatedAt: now,
    createdByOperatorId: actor.operatorId,
    updatedByOperatorId: actor.operatorId,
    ...buildVatSnapshot(product.vatRateKey),
  };
}

function buildSizedOrderItem(
  product: Product,
  actor: OperatorActorSnapshot,
  course: CourseGroup,
  sizeVariant: NonNullable<Product["sizeVariants"]>[number]
): OrderItem {
  const now = new Date().toISOString();

  return {
    id: buildOrderItemId(`${product.id}-${sizeVariant.id}`),
    productId: `${product.id}-${sizeVariant.id}`,
    name: `${product.name} - ${sizeVariant.label}`,
    quantity: 1,
    commensaleCode: null,
    sentQuantity: 0,
    unitPrice: sizeVariant.price,
    originalUnitPrice: sizeVariant.price,
    course,
    status: "draft",
    paymentState: "unpaid",
    operatorLabel: actor.operatorName,
    operatorId: actor.operatorId,
    orderId: `${product.id}-${sizeVariant.id}-${course.toLowerCase().replace(/\s+/g, "-")}`,
    createdAt: now,
    updatedAt: now,
    createdByOperatorId: actor.operatorId,
    updatedByOperatorId: actor.operatorId,
    ...buildVatSnapshot(product.vatRateKey),
  };
}

function getCourseTitle(mode: CourseGroup) {
  switch (mode) {
    case "PRIMA PORTATA":
      return "Modifica Prima Portata";
    case "SECONDA PORTATA":
      return "Modifica Seconda Portata";
    case "TERZA PORTATA":
      return "Modifica Terza Portata";
  }
}

function getPalmareCourseLabel(mode: CourseGroup) {
  switch (mode) {
    case "PRIMA PORTATA":
      return "Antipasto / Bevanda";
    case "SECONDA PORTATA":
      return "Primo / Secondo";
    case "TERZA PORTATA":
      return "Dolce / Altro";
  }
}

function getCustomerLabel(customer: CustomerRecord | null, fallbackName: string) {
  if (customer) {
    return `${customer.name} · ${customer.taxCode}`;
  }

  return fallbackName;
}

function getCompanyLabel(company: CompanyRecord | null, fallbackName: string) {
  if (company) {
    return `${company.name} · ${company.vatNumber}`;
  }

  return fallbackName;
}

function getValidOperator(value: string | undefined) {
  return value && operatorOptions.includes(value) ? value : operatorOptions[0];
}

function getValidServicePrice(value: string | undefined) {
  return value && servicePriceOptions.includes(value) ? value : servicePriceOptions[0];
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getDraftSnapshotStorageKey(restaurantId: string, tableId: string) {
  return `inki:draft-order:${restaurantId}:${tableId}`;
}

function getActiveDraftStorageKey(tableId: string) {
  return `inki:active-order-draft:${tableId}`;
}

function slugify(value: string) {
  return normalizeSearchValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function GearIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 8.92 4.6H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c0 .66.39 1.26 1 1.51H21a2 2 0 0 1 0 4h-.09c-.66.25-1.25.85-1.51 1.49Z" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ScanIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 7V4h3" />
      <path d="M17 4h3v3" />
      <path d="M20 17v3h-3" />
      <path d="M7 20H4v-3" />
      <path d="M7 12h10" />
      <path d="M7 9h1" />
      <path d="M10 9h1" />
      <path d="M13 9h1" />
      <path d="M16 9h1" />
      <path d="M7 15h1" />
      <path d="M10 15h1" />
      <path d="M13 15h1" />
      <path d="M16 15h1" />
    </svg>
  );
}

export function TableOrderScreen({
  tableId,
  initialPanelMode,
  deviceMode = "cassa",
  products,
  categories,
  pokeSections,
}: TableOrderScreenProps) {
  const router = useRouter();
  const { getTableById, rooms, setTableOrders, updateTable } = useTables();
  const { hasPermission, currentUser, currentActor } = useAuth();
  const isPalmareMode = deviceMode === "palmare";
  const returnHomePath = getAppHomePath(deviceMode);
  const fallbackTable = findTableById(tableId);
  const initialTableSnapshot =
    getTableById(tableId) ??
    (fallbackTable
      ? {
          ...fallbackTable,
          orders: [],
        }
      : undefined);
  const mountedTableSnapshotRef = useRef(initialTableSnapshot);
  const didRunInitialEmptyTableCleanupRef = useRef(false);
  const [activeCategory, setActiveCategory] = useState<ProductCategory>(categories[0]);
  const [palmareCatalogView, setPalmareCatalogView] = useState<"departments" | "products">(
    "departments"
  );
  const [isPalmareSearchOpen, setIsPalmareSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSendingOrder, setIsSendingOrder] = useState(false);
  const [activeMode, setActiveMode] = useState<OrderMode>("RIEPILOGO");
  const [configuringPoke, setConfiguringPoke] = useState<Product | null>(null);
  const [pendingSizeProduct, setPendingSizeProduct] = useState<Product | null>(null);
  const [sizeSelectorOverlay, setSizeSelectorOverlay] = useState<SizeSelectorOverlay | null>(null);
  const [pendingTartareProduct, setPendingTartareProduct] = useState<Product | null>(null);
  const [pastoPricingProduct, setPastoPricingProduct] = useState<Product | null>(null);
  const [pastoCustomPrice, setPastoCustomPrice] = useState("");
  const [wagyuPricingProduct, setWagyuPricingProduct] = useState<Product | null>(null);
  const [wagyuPriceMode, setWagyuPriceMode] = useState<WagyuPriceMode>("per-kg");
  const [wagyuPricePerKg, setWagyuPricePerKg] = useState("");
  const [wagyuWeight, setWagyuWeight] = useState("");
  const [wagyuManualPrice, setWagyuManualPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [paymentMethodSettings, setPaymentMethodSettings] = useState<PaymentMethodSetting[]>(() =>
    getPaymentMethodSettings()
  );
  const [documentMode, setDocumentMode] = useState<DocumentMode>(null);
  const [romanSplitGuests, setRomanSplitGuests] = useState("2");
  const [splitMode, setSplitMode] = useState<SplitPaymentMode>("none");
  const [splitCustomAmount, setSplitCustomAmount] = useState("");
  const [activeSplitQuotaId, setActiveSplitQuotaId] = useState<string | null>(null);
  const [paymentCalculatorValue, setPaymentCalculatorValue] = useState("0");
  const [paymentCalculationBase, setPaymentCalculationBase] =
    useState<PaymentCalculationBase>("TOT");
  const [paymentStep, setPaymentStep] = useState<"calculator" | "confirm">("calculator");
  const [paymentAdjustments, setPaymentAdjustments] = useState<PaymentAdjustment[]>([]);
  const [paymentChangeDue, setPaymentChangeDue] = useState<number | null>(null);
  const [isQuickDiscountPanelOpen, setIsQuickDiscountPanelOpen] = useState(false);
  const [quickDiscountValue, setQuickDiscountValue] = useState("");
  const [quickDiscountMode, setQuickDiscountMode] = useState<QuickDiscountMode>("euro");
  const [isFidelityScannerOpen, setIsFidelityScannerOpen] = useState(false);
  const [fidelityScannerContext, setFidelityScannerContext] =
    useState<FidelityScannerContext>("payment-panel");
  const [isFidelityPanelOpen, setIsFidelityPanelOpen] = useState(false);
  const [fidelityPanelStep, setFidelityPanelStep] = useState<FidelityPanelStep>("choice");
  const [scannedFidelityCustomer, setScannedFidelityCustomer] = useState<FidelityCustomer | null>(null);
  const [selectedSplitItemIds, setSelectedSplitItemIds] = useState<string[]>([]);
  const [savedOrderItems, setSavedOrderItems] = useState<OrderItem[]>([]);
  const [localDraftLines, setLocalDraftLines] = useState<OrderItem[]>([]);
  const [panelMode, setPanelMode] = useState<PanelMode>(initialPanelMode);
  const [detailName, setDetailName] = useState("");
  const [detailGuests, setDetailGuests] = useState("0");
  const [detailNote, setDetailNote] = useState("");
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
  const [isRistampaOpen, setIsRistampaOpen] = useState(false);
  const [isPrebillConfirmOpen, setIsPrebillConfirmOpen] = useState(false);
  const [isVoidSelectionMode, setIsVoidSelectionMode] = useState(false);
  const [selectedVoidItemIds, setSelectedVoidItemIds] = useState<string[]>([]);
  const [pendingVoidAction, setPendingVoidAction] = useState<PendingVoidAction | null>(null);
  const [isPalmareSummaryOpen, setIsPalmareSummaryOpen] = useState(false);
  const [palmareSheetTab, setPalmareSheetTab] = useState<"summary" | "table" | "split">("summary");
  const [activeMiniRoomId, setActiveMiniRoomId] = useState<string>(rooms[0]?.roomId ?? "");
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [revealedDeleteItemId, setRevealedDeleteItemId] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<OrderItem | null>(null);
  const [quantityPickerOverlay, setQuantityPickerOverlay] = useState<QuantityPickerOverlay | null>(null);
  const [noteEditorItem, setNoteEditorItem] = useState<OrderItem | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState("");
  const [noteEditorPrice, setNoteEditorPrice] = useState("");
  const [noteEditorAdditions, setNoteEditorAdditions] = useState<string[]>([]);
  const [noteEditorRemovals, setNoteEditorRemovals] = useState<string[]>([]);
  const [isAdditionsOpen, setIsAdditionsOpen] = useState(false);
  const [isRemovalsOpen, setIsRemovalsOpen] = useState(false);
  const [suppressCardClick, setSuppressCardClick] = useState(false);
  const [isPreOrderDetailOpen, setIsPreOrderDetailOpen] = useState(
    initialTableSnapshot?.status === "free"
  );
  const [preOrderCustomer, setPreOrderCustomer] = useState("");
  const [preOrderCompany, setPreOrderCompany] = useState("");
  const [preOrderOperator, setPreOrderOperator] = useState(getValidOperator(initialTableSnapshot?.operator));
  const [preOrderServicePrice, setPreOrderServicePrice] = useState(
    getValidServicePrice(initialTableSnapshot?.servicePriceLabel)
  );
  const [preOrderGuests, setPreOrderGuests] = useState(
    String(Math.max(initialTableSnapshot?.guests ?? 0, 1))
  );
  const [preOrderNote, setPreOrderNote] = useState("");
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  const [detailPickerMode, setDetailPickerMode] = useState<DetailPickerMode>(null);
  const [detailPickerSearch, setDetailPickerSearch] = useState("");
  const [detailEditorMode, setDetailEditorMode] = useState<DetailEditorMode>(null);
  const [customerDraft, setCustomerDraft] = useState<CustomerRecord>({
    id: "",
    name: "",
    taxCode: "",
    phone: "",
    email: "",
    note: "",
  });
  const [companyDraft, setCompanyDraft] = useState<CompanyRecord>({
    id: "",
    name: "",
    vatNumber: "",
    taxCode: "",
    sdiCode: "",
    pec: "",
    address: "",
    addressStreet: "",
    addressNumber: "",
    postalCode: "",
    city: "",
    province: "",
    country: "Italia",
    contactPerson: "",
    phone: "",
    email: "",
    note: "",
    isActive: true,
  });
  const [companyLookupLoading, setCompanyLookupLoading] = useState(false);
  const [companyLookupMessage, setCompanyLookupMessage] = useState("");
  const [companyLookupError, setCompanyLookupError] = useState("");
  const defaultVatRate = getDefaultOperationalVatRate();
  const isDevelopment = process.env.NODE_ENV !== "production";

  const devPaymentLog = (message: string, payload?: Record<string, unknown>) => {
    if (!isDevelopment) {
      return;
    }

    console.info(`[CASSA][PAYMENT] ${message}`, payload ?? {});
  };
  const devOrderLog = (message: string, payload?: Record<string, unknown>) => {
    if (!isDevelopment) {
      return;
    }

    console.info(`[CASSA][ORDER] ${message}`, payload ?? {});
  };
  const debugOrderMutation = (
    source: string,
    beforeItems: OrderItem[],
    afterItems: OrderItem[],
    extra?: Record<string, unknown>
  ) => {
    if (!isDevelopment) {
      return;
    }

    console.groupCollapsed("[ORDER MUTATION]", source);
    console.log({
      beforeLength: beforeItems.length,
      afterLength: afterItems.length,
      tableId,
      selectedTableId: currentTable?.id ?? null,
      currentOrderId: afterItems[0]?.orderId ?? beforeItems[0]?.orderId ?? null,
      extra: extra ?? {},
    });
    console.trace();
    console.groupEnd();
  };

  const currentTable =
    getTableById(tableId) ??
    (fallbackTable
      ? {
          ...fallbackTable,
          orders: [],
        }
      : undefined);
  const currentTableStatus = currentTable?.status ?? initialTableSnapshot?.status ?? "free";
  const currentTableOrderItems = currentTable?.orders ?? [];
  const orderItems = currentTableOrderItems.length > 0 ? currentTableOrderItems : localDraftLines;
  const hasUnsavedChanges =
    orderItems.length !== savedOrderItems.length ||
    JSON.stringify(orderItems) !== JSON.stringify(savedOrderItems);
  const splitBillState = currentTable?.splitBillState ?? null;
  const splitQuotas = splitBillState?.quotas ?? [];
  const currentOperationalState = currentTable
    ? getTableOperationalState(currentTable)
    : {
        key: "free" as const,
        label: "Libero",
        shortLabel: "Libero",
        total: 0,
        covers: 0,
        hasPendingChanges: false,
        hasPrintedPrebill: false,
      };
  const getRealOrderItems = (items: OrderItem[]) =>
    items.filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID && item.quantity > 0);
  const hasAnyItems = getRealOrderItems(orderItems).length > 0;
  const snapshotOrderState = (label: string, meta?: Record<string, unknown>) => {
    if (!isDevelopment) {
      return;
    }

    console.log("[ORDER SNAPSHOT]", {
      label,
      tableId,
      orderLinesLength: orderItems.length,
      selectedTableLinesLength: currentTableOrderItems.length,
      currentOrderLinesLength: currentTableOrderItems.length,
      draftLinesLength: localDraftLines.length,
      renderedLinesLength: orderItems.length,
      mode: panelMode,
      selectedCategory: activeCategory,
      selectedCourse: activeMode,
      paymentMode: panelMode === "payment",
      activeTableId: currentTable?.id ?? null,
      meta: meta ?? {},
    });
  };
  const applyIncomingOrderFromBackend = (
    incomingOrder: OrderItem[],
    reason: "current-table-sync" | "detail-reinit"
  ) => {
    const incomingRealCount = getRealOrderItems(incomingOrder).length;
    const currentRealCount = getRealOrderItems(orderItems).length;
    const shouldRejectIncomingEmptyDraft =
      (panelMode === "draft" || panelMode === "edit-order" || hasUnsavedChanges) &&
      currentRealCount > 0 &&
      incomingRealCount === 0;

    if (shouldRejectIncomingEmptyDraft) {
      devOrderLog("applyIncomingOrderFromBackend rifiuta ordine vuoto", {
        reason,
        tableId,
        incomingRealCount,
        currentRealCount,
        hasUnsavedChanges,
        panelMode,
      });
      return false;
    }

    debugOrderMutation(`applyIncomingOrderFromBackend:${reason}`, savedOrderItems, incomingOrder, {
      hasUnsavedChanges,
      panelMode,
    });
    setSavedOrderItems(incomingOrder);
    return true;
  };
  const [customers, setCustomers] = useState<CustomerRecord[]>(() => getCustomers());
  const [companies, setCompanies] = useState<CompanyRecord[]>(() => getCompanies());
  const [fidelityCustomers, setFidelityCustomers] = useState<FidelityCustomer[]>(() =>
    getFidelityCustomers()
  );
  useEffect(() => {
    void hydrateBusinessDirectoryFromServer().then((directory) => {
      setCustomers(directory.customers);
      setCompanies(directory.companies);
    });
  }, []);

  const latestTableLifecycleRef = useRef<{
    table: PosTableState | undefined;
    items: OrderItem[];
  }>({
    table: currentTable,
    items: orderItems,
  });
  const intentionalOrderClearReasonRef = useRef<DraftOrderClearReason | null>(null);
  const lastRecoveredDraftSignatureRef = useRef<string | null>(null);

  const readDraftOrderSnapshot = () => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const restaurantId = getActiveRestaurantId();
      const snapshotKey = getDraftSnapshotStorageKey(restaurantId, tableId);
      const activeDraftKey = getActiveDraftStorageKey(tableId);
      const rawSnapshot =
        window.localStorage.getItem(activeDraftKey) ?? window.localStorage.getItem(snapshotKey);
      if (!rawSnapshot) {
        return null;
      }

      const parsedSnapshot = JSON.parse(rawSnapshot) as LocalDraftOrderSnapshot;
      return Array.isArray(parsedSnapshot.orderLines) ? parsedSnapshot : null;
    } catch (error) {
      devOrderLog("Impossibile leggere snapshot draft locale", {
        tableId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  const clearDraftOrderSnapshot = (reason: DraftOrderClearReason) => {
    if (typeof window === "undefined") {
      return;
    }

    const snapshotKey = getDraftSnapshotStorageKey(getActiveRestaurantId(), tableId);
    const activeDraftKey = getActiveDraftStorageKey(tableId);
    window.localStorage.removeItem(snapshotKey);
    window.localStorage.removeItem(activeDraftKey);
    setLocalDraftLines([]);
    lastRecoveredDraftSignatureRef.current = null;
    devOrderLog("INTENTIONAL_CLEAR", { tableId, reason, snapshotKey, activeDraftKey });
  };

  const saveDraftOrderSnapshot = (nextItems: OrderItem[] = orderItems) => {
    if (typeof window === "undefined") {
      return;
    }

    if (!currentTable) {
      return;
    }

    if (intentionalOrderClearReasonRef.current) {
      return;
    }

    const restaurantId = getActiveRestaurantId();
    const orderId = nextItems[0]?.orderId ?? null;
    const snapshot: LocalDraftOrderSnapshot = {
      tableId,
      restaurantId,
      orderId,
      covers: currentTable.guests ?? 0,
      operatorId: currentActor.operatorId ?? null,
      customerId: currentTable.fidelityCustomerId ?? null,
      orderLines: nextItems,
      updatedAt: new Date().toISOString(),
      hasUnsavedChanges: true,
    };
    const snapshotKey = getDraftSnapshotStorageKey(restaurantId, tableId);
    const activeDraftKey = getActiveDraftStorageKey(tableId);
    window.localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
    window.localStorage.setItem(activeDraftKey, JSON.stringify(snapshot));
    setLocalDraftLines(nextItems);
    devOrderLog("SAVE_DRAFT_SNAPSHOT", {
      tableId,
      restaurantId,
      snapshotKey,
      activeDraftKey,
      orderLinesCount: nextItems.length,
      realOrderLinesCount: getRealOrderItems(nextItems).length,
    });
  };

  const intentionalClearReasons = new Set<SafeOrderMutationReason>([
    "PAYMENT_COMPLETED",
    "CONFIRMED_EMPTY_TABLE",
    "CONFIRMED_CANCEL_ORDER",
    "OPEN_DIFFERENT_EMPTY_TABLE",
  ]);

  const allowedShrinkingReasons = new Set<SafeOrderMutationReason>([
    "PAYMENT_COMPLETED",
    "CONFIRMED_EMPTY_TABLE",
    "CONFIRMED_CANCEL_ORDER",
    "OPEN_DIFFERENT_EMPTY_TABLE",
    "DELETE_ITEM_CONFIRMED",
    "VOID_ACTION_APPLIED",
    "UPDATE_ITEM_QUANTITY",
    "CANCEL_CHANGES_RESTORE",
    "ORDER_RESTORE",
  ]);

  const safeSetOrderLines = (
    nextLinesOrUpdater: OrderItem[] | ((current: OrderItem[]) => OrderItem[]),
    reason: SafeOrderMutationReason,
    meta?: Record<string, unknown>,
    targetTableId = tableId
  ) => {
    setTableOrders(targetTableId, (previousLines) => {
      const nextLines =
        typeof nextLinesOrUpdater === "function" ? nextLinesOrUpdater(previousLines) : nextLinesOrUpdater;

      if (previousLines.length > 0 && nextLines.length === 0 && !intentionalClearReasons.has(reason)) {
        console.error("[ORDER RESET BLOCKED]", {
          reason,
          tableId: targetTableId,
          previousLines,
          nextLines,
          meta: meta ?? {},
        });
        return previousLines;
      }

      if (previousLines.length > nextLines.length && !allowedShrinkingReasons.has(reason)) {
        console.warn("[ORDER SHRINK BLOCKED]", {
          reason,
          tableId: targetTableId,
          previousLines,
          nextLines,
          meta: meta ?? {},
        });
        return previousLines;
      }

      debugOrderMutation(`safeSetOrderLines:${reason}`, previousLines, nextLines, meta);
      return nextLines;
    });
  };

  const clearOrderIntentionally = (reason: DraftOrderClearReason) => {
    intentionalOrderClearReasonRef.current = reason;
    clearDraftOrderSnapshot(reason);
    const safeReason: SafeOrderMutationReason =
      reason === "payment_completed"
        ? "PAYMENT_COMPLETED"
        : reason === "empty_table_reset"
          ? "CONFIRMED_EMPTY_TABLE"
          : reason === "user_cancel_confirmed"
            ? "CONFIRMED_CANCEL_ORDER"
            : "OPEN_DIFFERENT_EMPTY_TABLE";
    safeSetOrderLines([], safeReason, { clearReason: reason });
    setSavedOrderItems([]);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (intentionalOrderClearReasonRef.current === reason) {
          intentionalOrderClearReasonRef.current = null;
        }
      }, 0);
    }
  };

  const restoreDraftOrderIfAccidentallyCleared = () => {
    if (intentionalOrderClearReasonRef.current) {
      return false;
    }

    const snapshot = readDraftOrderSnapshot();
    if (!snapshot || snapshot.tableId !== tableId || snapshot.orderLines.length === 0) {
      return false;
    }

    const snapshotSignature = JSON.stringify(
      snapshot.orderLines.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        course: item.course,
        updatedAt: item.updatedAt,
      }))
    );

    if (lastRecoveredDraftSignatureRef.current === snapshotSignature) {
      return false;
    }

    const snapshotRealLines = getRealOrderItems(snapshot.orderLines);
    if (snapshotRealLines.length === 0) {
      return false;
    }

    devOrderLog("RESTORE_DRAFT_SNAPSHOT", {
      tableId,
      orderLinesCount: snapshot.orderLines.length,
      realOrderLinesCount: snapshotRealLines.length,
    });
    if (isDevelopment) {
      console.info("[ORDER DRAFT RESTORED_FROM_LOCAL_STORAGE]", {
        tableId,
        orderLinesCount: snapshot.orderLines.length,
      });
    }
    lastRecoveredDraftSignatureRef.current = snapshotSignature;
    setLocalDraftLines(snapshot.orderLines);
    safeSetOrderLines(snapshot.orderLines, "ORDER_RESTORE", { source: "local-storage-restore" });
    updateTable(tableId, {
      status: "occupied",
      guests: snapshot.covers,
      operator: getValidOperator(currentTable?.operator ?? currentUser.displayName),
      paymentStatus: currentTable?.paymentStatus ?? "idle",
    });
    setStatusMessage("Bozza ordine recuperata");
    return true;
  };

  const shouldAutoReleaseEmptyTable = (
    table: PosTableState | undefined,
    items: OrderItem[]
  ) => {
    if (!table) {
      return false;
    }

    if (getRealOrderItems(items).length > 0) {
      return false;
    }

    const hasCoverOnlyItems = items.some(
      (item) => item.productId === AUTO_COVER_PRODUCT_ID && item.quantity > 0
    );

    return (
      table.status === "occupied" ||
      hasCoverOnlyItems ||
      table.guests > 0 ||
      Boolean(table.note?.trim()) ||
      Boolean(table.customerName?.trim()) ||
      Boolean(table.companyName?.trim()) ||
      (table.paymentStatus ?? "idle") !== "idle"
    );
  };

  useEffect(() => {
    const snapshot = readDraftOrderSnapshot();
    const nextLocalDraftLines =
      currentTableOrderItems.length > 0
        ? currentTableOrderItems
        : snapshot?.orderLines?.length
          ? snapshot.orderLines
          : [];
    setLocalDraftLines(nextLocalDraftLines);
    snapshotOrderState("MOUNT_OR_TABLE_CHANGE", {
      currentTableOrderItemsCount: currentTableOrderItems.length,
      restoredDraftCount: snapshot?.orderLines?.length ?? 0,
    });

    return () => {
      snapshotOrderState("UNMOUNT_TABLE_ORDER_SCREEN", {
        currentTableOrderItemsCount: currentTableOrderItems.length,
        localDraftLinesCount: nextLocalDraftLines.length,
      });
    };
  }, [tableId]);

  const resetEmptyTableState = (
    table: PosTableState | undefined,
    { clearLocalDraft }: { clearLocalDraft: boolean }
  ) => {
    if (!table) {
      return false;
    }

    if (!shouldAutoReleaseEmptyTable(table, table.orders ?? [])) {
      return false;
    }

    const protectedDraftSnapshot = readDraftOrderSnapshot();
    if (
      !intentionalOrderClearReasonRef.current &&
      protectedDraftSnapshot &&
      protectedDraftSnapshot.tableId === table.id &&
      getRealOrderItems(protectedDraftSnapshot.orderLines).length > 0
    ) {
      devOrderLog("ANTI RESET BLOCKED", {
        tableId: table.id,
        reason: "empty-table-cleanup-guard",
        snapshotOrderItemsCount: protectedDraftSnapshot.orderLines.length,
      });
      return false;
    }

    intentionalOrderClearReasonRef.current = "empty_table_reset";
    safeSetOrderLines([], "CONFIRMED_EMPTY_TABLE", { source: "resetEmptyTableState" }, table.id);
    updateTable(table.id, {
      status: "free",
      guests: 0,
      customerName: "",
      companyName: "",
      note: "",
      paymentStatus: "idle",
      operator: getValidOperator(currentUser.displayName),
      servicePriceLabel: getValidServicePrice(undefined),
      fidelityCustomerId: null,
      fidelityCustomerLabel: "",
      fidelityCardCode: "",
      fidelityQrCodeValue: "",
      fidelityScannedBeforePayment: false,
      pointsEligible: false,
      pointsProcessed: false,
      pendingPoints: 0,
      lastFidelityScanAt: null,
      selectedRewardId: null,
      selectedRewardName: "",
      selectedRewardDiscount: 0,
      selectedRewardPoints: 0,
      rewardRedemptionId: null,
      earnedPoints: 0,
      finalPointsBalanceSnapshot: null,
      pointsBeforePayment: null,
    });

    if (clearLocalDraft) {
      setSavedOrderItems([]);
      clearDraftOrderSnapshot("empty_table_reset");
      setDetailGuests("0");
      setDetailNote("");
      setPreOrderCustomer("");
      setPreOrderCompany("");
      setPreOrderOperator(getValidOperator(currentUser.displayName));
      setPreOrderServicePrice(getValidServicePrice(undefined));
      setPreOrderGuests("1");
      setPreOrderNote("");
    }

    return true;
  };

  useEffect(() => {
    if ((panelMode === "draft" || panelMode === "edit-order") && hasUnsavedChanges) {
      devOrderLog("Ignoro sync savedOrderItems da currentTable perche ci sono modifiche non salvate", {
        tableId,
        panelMode,
        currentOrderItemsCount: currentTable?.orders?.length ?? 0,
        draftOrderItemsCount: orderItems.length,
      });
      return;
    }

    devOrderLog("Sync savedOrderItems da currentTable", {
      tableId,
      panelMode,
      nextSavedCount: currentTable?.orders?.length ?? 0,
    });
    applyIncomingOrderFromBackend(currentTable?.orders ?? [], "current-table-sync");
  }, [applyIncomingOrderFromBackend, currentTable, devOrderLog, hasUnsavedChanges, orderItems.length, panelMode, tableId]);

  useEffect(() => {
    latestTableLifecycleRef.current = {
      table: currentTable,
      items: orderItems,
    };
  }, [currentTable, orderItems]);

  useEffect(() => {
    if (didRunInitialEmptyTableCleanupRef.current) {
      return;
    }

    didRunInitialEmptyTableCleanupRef.current = true;
    const mountedSnapshot = mountedTableSnapshotRef.current;

    if (!mountedSnapshot) {
      return;
    }

    resetEmptyTableState(
      {
        ...mountedSnapshot,
        orders: mountedSnapshot.orders ?? [],
      },
      { clearLocalDraft: true }
    );
  }, [currentUser.displayName, setTableOrders, updateTable]);

  useEffect(() => {
    return () => {
      const { table, items } = latestTableLifecycleRef.current;

      if (!table) {
        return;
      }

      resetEmptyTableState(
        {
          ...table,
          orders: items,
        },
        { clearLocalDraft: false }
      );
    };
  }, []);

  useEffect(() => {
    const refreshFidelityCustomers = () => {
      setFidelityCustomers(getFidelityCustomers());
    };

    window.addEventListener(FIDELITY_DATA_CHANGED_EVENT, refreshFidelityCustomers);

    return () => {
      window.removeEventListener(FIDELITY_DATA_CHANGED_EVENT, refreshFidelityCustomers);
    };
  }, []);

  useEffect(() => {
    if (panelMode !== "payment") {
      return;
    }

    setPaymentAdjustments([]);
    setPaymentCalculatorValue("0");
    setPaymentChangeDue(null);
    setPaymentCalculationBase("TOT");
  }, [panelMode, paymentMethod, romanSplitGuests, selectedSplitItemIds.join("|")]);

  useEffect(() => {
    if (panelMode !== "payment" || !paymentMethod) {
      return;
    }

    recordAuditEvent({
      eventType: "PAYMENT_METHOD_SELECTED",
      entityType: "payment",
      entityId: `${tableId}-payment`,
      tableId,
      nextValue: { paymentMethod },
      origin: "payment",
    });
  }, [panelMode, paymentMethod, tableId]);

  useEffect(() => {
    setPanelMode(initialPanelMode);
    setIsFinalizingPayment(false);
    intentionalOrderClearReasonRef.current = null;
    lastRecoveredDraftSignatureRef.current = null;
  }, [initialPanelMode, tableId]);

  useEffect(() => {
    setIsPreOrderDetailOpen((initialTableSnapshot?.status ?? "free") === "free");
    setDetailPickerMode(null);
    setDetailPickerSearch("");
  }, [initialPanelMode, initialTableSnapshot?.status, tableId]);

  useEffect(() => {
    if ((panelMode === "draft" || panelMode === "edit-order") && hasUnsavedChanges) {
      devOrderLog("Ignoro reinizializzazione dettaglio tavolo per proteggere il draft locale", {
        tableId,
        panelMode,
        currentOrderItemsCount: currentTable?.orders?.length ?? 0,
        draftOrderItemsCount: orderItems.length,
      });
      return;
    }

    devOrderLog("Reinizializzo dettagli tavolo da currentTable", {
      tableId,
      panelMode,
      tableStatus: currentTable?.status ?? "free",
      currentOrderItemsCount: currentTable?.orders?.length ?? 0,
    });
    setDetailName(currentTable?.name ?? "");
    setDetailGuests(String(currentTable?.guests ?? 0));
    setDetailNote(currentTable?.note ?? "");
    setPreOrderCustomer(currentTable?.customerName ?? "");
    setPreOrderCompany(currentTable?.companyName ?? "");
    setPreOrderOperator(getValidOperator(currentTable?.operator));
    setPreOrderServicePrice(getValidServicePrice(currentTable?.servicePriceLabel));
    setPreOrderGuests(String(Math.max(currentTable?.guests ?? 0, 1)));
    setPreOrderNote(currentTable?.note ?? "");
  }, [currentTable, devOrderLog, hasUnsavedChanges, orderItems.length, panelMode, tableId]);

  const currentOperator = currentTable?.operator || currentUser.displayName;
  const currentTableName = currentTable?.name ?? "";
  const currentTableGuests = currentTable?.guests ?? 0;
  const currentTableNote = currentTable?.note ?? "";
  const currentTableRoom = currentTable?.room ?? "";

  useEffect(() => {
    devOrderLog("ORDER_LINES_CHANGED count", {
      tableId,
      count: orderItems.length,
      realCount: getRealOrderItems(orderItems).length,
      hasUnsavedChanges,
      panelMode,
      selectedTableId: currentTable?.id ?? null,
    });

    if (
      intentionalOrderClearReasonRef.current ||
      !currentTable ||
      isFinalizingPayment ||
      getRealOrderItems(orderItems).length === 0
    ) {
      return;
    }

    saveDraftOrderSnapshot(orderItems);
  }, [
    currentTable,
    devOrderLog,
    hasUnsavedChanges,
    isFinalizingPayment,
    orderItems,
    panelMode,
    tableId,
  ]);

  useEffect(() => {
    if (intentionalOrderClearReasonRef.current || isFinalizingPayment) {
      return;
    }

    if (!currentTable || currentTable.id !== tableId) {
      return;
    }

    if (orderItems.length > 0) {
      return;
    }

    const restored = restoreDraftOrderIfAccidentallyCleared();
    if (restored) {
      return;
    }

    const snapshot = readDraftOrderSnapshot();
    if (snapshot?.orderLines?.length) {
      devOrderLog("ANTI RESET BLOCKED", {
        tableId,
        currentOrderItemsCount: orderItems.length,
        snapshotOrderItemsCount: snapshot.orderLines.length,
      });
    }
  }, [
    currentTable,
    currentTableStatus,
    devOrderLog,
    isFinalizingPayment,
    orderItems.length,
    panelMode,
    tableId,
  ]);

  const hasTransmittedItems = orderItems.some(
    (item) =>
      item.productId !== AUTO_COVER_PRODUCT_ID &&
      ((item.sentQuantity ?? 0) > 0 || (item.queuedQuantity ?? 0) > 0)
  );
  const canResetEmptyTable =
    Boolean(currentTable) &&
    !hasTransmittedItems &&
    shouldAutoReleaseEmptyTable(
      currentTable
        ? {
            ...currentTable,
            orders: orderItems,
          }
        : undefined,
      orderItems
    );
  const canAccessPayments = hasPermission("canAccessPayments");
  const canConfirmPayments = hasPermission("canConfirmPayments");
  const canSendOrders = hasPermission("canSendOrders");
  const canSaveOrderChanges = hasPermission("canSaveOrderChanges");
  const canEditOrders = hasPermission("canEditOrders");
  const canDeleteOrderLines = hasPermission("canDeleteOrderLines");
  const canInsertProducts = hasPermission("canInsertProducts");
  const canEditTables = hasPermission("canEditTables");
  const canManageCustomersBilling = hasPermission("canManageCustomersBilling");
  const canEditPaymentCalculator =
    hasPermission("canEditPaymentCalculator") ||
    hasPermission("canApplyDiscounts") ||
    hasPermission("canApplySurcharges");
  const linkedFidelityCustomer =
    fidelityCustomers.find((customer) => customer.id === currentTable?.fidelityCustomerId) ??
    (currentTable?.fidelityCardCode || currentTable?.fidelityQrCodeValue
      ? findFidelityCustomerByCode(
          currentTable?.fidelityQrCodeValue || currentTable?.fidelityCardCode || ""
        )
      : null);
  const fidelityRewards = getFidelityRewards();
  const activeFidelityCustomer = scannedFidelityCustomer ?? linkedFidelityCustomer;
  const availableFidelityRewards = activeFidelityCustomer
    ? getAvailableFidelityRewards(activeFidelityCustomer.currentPoints)
    : [];
  const canAssignCustomer = hasPermission("canAssignCustomer");
  const canAssignCompany = hasPermission("canAssignCompany");
  const productsCatalog = useMemo(() => getProducts(), []);
  const palmareGuestGroupOptions = useMemo(() => {
    const normalizedGuests = Number.isFinite(currentTableGuests) ? Math.max(0, currentTableGuests) : 0;
    const visibleGuestCount = normalizedGuests > 0 ? normalizedGuests : 1;

    return Array.from({ length: Math.min(visibleGuestCount, 12) }, (_, index) => ({
      code: `C${index + 1}`,
      label: `Comm. ${index + 1}`,
    }));
  }, [currentTableGuests]);
  const guestAssignmentOptions = isPalmareMode
    ? palmareGuestGroupOptions
    : guestGroupOptions.map((guestCode, index) => ({
        code: guestCode,
        label: `Comm. ${index + 1}`,
      }));

  useEffect(() => {
    setSplitMode(splitBillState?.mode ?? "none");
  }, [splitBillState?.mode]);

  useEffect(() => {
    const firstPendingQuota = splitQuotas.find((quota) => quota.status === "pending") ?? null;

    if (!firstPendingQuota) {
      if (activeSplitQuotaId !== null) {
        setActiveSplitQuotaId(null);
      }
      return;
    }

    const activeQuotaStillPending = splitQuotas.some(
      (quota) => quota.id === activeSplitQuotaId && quota.status === "pending"
    );

    if (!activeQuotaStillPending) {
      setActiveSplitQuotaId(firstPendingQuota.id);
    }
  }, [activeSplitQuotaId, splitQuotas]);

  const isPaymentMethodSelectionAllowed = (methodId: ConfigurablePaymentMethodId) => {
    if (methodId === "CONTANTI") {
      return hasPermission("canUseCashPayments");
    }

    if (methodId === "CARTA" || methodId === "BANCOMAT") {
      return hasPermission("canUseCardPayments");
    }

    return hasPermission("canUseOtherPaymentMethods");
  };

  useEffect(() => {
    const nextGuests = Math.max(currentTableGuests, 0);

    safeSetOrderLines((currentItems) => {
      const existingCoverItem = currentItems.find(
        (item) => item.productId === AUTO_COVER_PRODUCT_ID
      );

      if (nextGuests <= 0) {
        return existingCoverItem
          ? currentItems.filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID)
          : currentItems;
      }

      if (
        existingCoverItem &&
        existingCoverItem.quantity === nextGuests &&
        existingCoverItem.unitPrice === COVER_CHARGE_UNIT_PRICE
      ) {
        return currentItems;
      }

      const itemsWithoutCover = currentItems.filter(
        (item) => item.productId !== AUTO_COVER_PRODUCT_ID
      );

      return [
        ...itemsWithoutCover,
        {
          id: existingCoverItem?.id ?? `${AUTO_COVER_PRODUCT_ID}-${tableId}`,
          productId: AUTO_COVER_PRODUCT_ID,
          name: "Coperti",
          quantity: nextGuests,
          sentQuantity: 0,
          unitPrice: COVER_CHARGE_UNIT_PRICE,
          originalUnitPrice: COVER_CHARGE_UNIT_PRICE,
          course: "PRIMA PORTATA",
          status: "draft",
          paymentState: existingCoverItem?.paymentState ?? "unpaid",
          operatorLabel: currentOperator,
          vatRateKey: existingCoverItem?.vatRateKey ?? defaultVatRate.key,
          vatRateLabel: existingCoverItem?.vatRateLabel ?? defaultVatRate.label,
          vatRateValue: existingCoverItem?.vatRateValue ?? defaultVatRate.value,
        },
      ];
    }, "AUTO_COVER_SYNC", { guests: nextGuests, operator: currentOperator });
  }, [currentOperator, currentTableGuests, defaultVatRate.key, defaultVatRate.label, defaultVatRate.value, tableId]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const normalizedCatalogSearch = normalizeSearchValue(searchValue.trim());
  const filteredProducts = products.filter((product) => {
    const matchesCategory = product.category === activeCategory;
    const matchesSearch = !normalizedSearch || product.name.toLowerCase().includes(normalizedSearch);

    return matchesCategory && matchesSearch;
  });
  const palmareSearchResults = useMemo(
    () =>
      products.filter((product) => {
        if (!normalizedCatalogSearch) {
          return true;
        }

        return (
          normalizeSearchValue(product.name).includes(normalizedCatalogSearch) ||
          normalizeSearchValue(product.category).includes(normalizedCatalogSearch)
        );
      }),
    [normalizedCatalogSearch, products]
  );

  useEffect(() => {
    console.log("selectedCategory", activeCategory);
    console.log("filteredProductsCount", filteredProducts.length);
    console.log(
      "filteredProducts",
      filteredProducts.map((product) => product.name)
    );
  }, [activeCategory, filteredProducts]);

  useEffect(() => {
    setPaymentMethodSettings(getPaymentMethodSettings());
  }, []);

  const enabledPaymentMethods = useMemo(
    () => [...paymentMethodSettings].sort((left, right) => left.sortOrder - right.sortOrder).filter((method) => method.enabled),
    [paymentMethodSettings]
  );

  const getDefaultConfiguredPaymentMethod = () =>
    (enabledPaymentMethods[0]?.id ?? null) as ConfigurablePaymentMethodId | null;

  const getPreferredDefaultPaymentMethod = () =>
    (enabledPaymentMethods.find((method) => method.id === "CONTANTI")?.id ??
      getDefaultConfiguredPaymentMethod()) as ConfigurablePaymentMethodId | null;

  useEffect(() => {
    if (panelMode !== "payment") {
      return;
    }

    if (!paymentMethod) {
      setPaymentMethod(getPreferredDefaultPaymentMethod());
      return;
    }

    const stillEnabled = enabledPaymentMethods.some((method) => method.id === paymentMethod);

    if (!stillEnabled) {
      setPaymentMethod(getPreferredDefaultPaymentMethod());
    }
  }, [enabledPaymentMethods, panelMode, paymentMethod]);

  const serviceItems = useMemo(
    () => orderItems.filter((item) => serviceProductIds.has(item.productId)),
    [orderItems]
  );
  const groupedItems = useMemo(
    () =>
      (["PRIMA PORTATA", "SECONDA PORTATA", "TERZA PORTATA"] as CourseGroup[]).map((course) => ({
        course,
        items: orderItems.filter(
          (item) => item.course === course && !serviceProductIds.has(item.productId)
        ),
      })),
    [orderItems]
  );
  const orderTotal = orderItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const payableItems = orderItems.filter((item) => item.paymentState !== "paid");
  const remainingItemsTotal = payableItems.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0
  );
  const selectedSplitItems = payableItems.filter((item) => selectedSplitItemIds.includes(item.id));
  const selectedSplitTotal = selectedSplitItems.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0
  );
  const paidSplitTotal = roundCurrency(
    splitQuotas
      .filter((quota) => quota.status === "paid")
      .reduce((total, quota) => total + quota.amount, 0)
  );
  const pendingSplitTotal = roundCurrency(
    splitQuotas
      .filter((quota) => quota.status === "pending")
      .reduce((total, quota) => total + quota.amount, 0)
  );
  const pendingItemQuotaIds = new Set(
    splitQuotas
      .filter((quota) => quota.mode === "items" && quota.status === "pending")
      .flatMap((quota) => quota.itemIds ?? [])
  );
  const unassignedPayableItems = payableItems.filter((item) => !pendingItemQuotaIds.has(item.id));
  const unassignedPayableTotal = roundCurrency(
    unassignedPayableItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
  );
  const remainingTotal =
    splitBillState?.mode === "people" || splitBillState?.mode === "amount"
      ? clampCurrency(remainingItemsTotal - paidSplitTotal)
      : remainingItemsTotal;
  const splitCreationAvailableAmount =
    splitBillState?.mode === "items"
      ? unassignedPayableTotal
      : clampCurrency(remainingTotal - pendingSplitTotal);
  const activeSplitQuota =
    splitQuotas.find((quota) => quota.id === activeSplitQuotaId && quota.status === "pending") ?? null;
  const shouldPayUnassignedItemsDirectly =
    splitBillState?.mode === "items" && !activeSplitQuota && unassignedPayableTotal > 0;
  const activeCourseItems =
    activeMode === "RIEPILOGO"
      ? []
      : orderItems.filter(
          (item) => item.course === activeMode && !serviceProductIds.has(item.productId)
        );
  const isEditingMode = panelMode === "draft" || panelMode === "edit-order";
  const showProductSelection = isEditingMode;
  const showPaymentLeftPanel = currentTableStatus === "occupied" && panelMode === "payment";
  const showOccupiedMiniMap =
    currentTableStatus === "occupied" &&
    panelMode === "sent-summary";
  const showPreOrderDetail =
    !isFinalizingPayment &&
    currentTableStatus === "free" &&
    panelMode === "draft" &&
    isPreOrderDetailOpen;
  const activeMiniRoom = rooms.find((room) => room.roomId === activeMiniRoomId) ?? rooms[0];
  const miniMapTables = activeMiniRoom?.tables ?? [];

  useEffect(() => {
    if (!isPalmareMode) {
      return;
    }

    if (showProductSelection && activeMode === "RIEPILOGO") {
      setActiveMode("PRIMA PORTATA");
    }
  }, [activeMode, isPalmareMode, showProductSelection]);
  const modifierOptions = useMemo(
    () =>
      pokeSections
        .filter((section) => section.id === "proteine" || section.id === "vitamine")
        .flatMap((section) => section.items),
    [pokeSections]
  );
  const normalizedDetailPickerSearch = normalizeSearchValue(detailPickerSearch.trim());
  const palmareVisibleCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (!normalizedCatalogSearch) {
          return true;
        }

        return normalizeSearchValue(category).includes(normalizedCatalogSearch);
      }),
    [categories, normalizedCatalogSearch]
  );
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        if (!normalizedDetailPickerSearch) {
          return true;
        }

        return (
          normalizeSearchValue(customer.name).includes(normalizedDetailPickerSearch) ||
          normalizeSearchValue(customer.taxCode).includes(normalizedDetailPickerSearch)
        );
      }),
    [customers, normalizedDetailPickerSearch]
  );
  const filteredCompanies = useMemo(
    () => {
      const numericSearch = /^\d+$/.test(normalizedDetailPickerSearch);

      return companies
        .filter((company) => {
          if (!normalizedDetailPickerSearch) {
            return true;
          }

          return (
            normalizeSearchValue(company.name).includes(normalizedDetailPickerSearch) ||
            normalizeSearchValue(company.vatNumber).includes(normalizedDetailPickerSearch) ||
            normalizeSearchValue(company.city ?? "").includes(normalizedDetailPickerSearch)
          );
        })
        .sort((firstCompany, secondCompany) => {
          if (!normalizedDetailPickerSearch) {
            return firstCompany.name.localeCompare(secondCompany.name, "it");
          }

          const getPriority = (company: CompanyRecord) => {
            const normalizedName = normalizeSearchValue(company.name);
            const normalizedVat = normalizeSearchValue(company.vatNumber);

            if (numericSearch && normalizedVat.startsWith(normalizedDetailPickerSearch)) {
              return 0;
            }

            if (numericSearch && normalizedVat.includes(normalizedDetailPickerSearch)) {
              return 1;
            }

            if (normalizedName.startsWith(normalizedDetailPickerSearch)) {
              return 2;
            }

            if (normalizedName.includes(normalizedDetailPickerSearch)) {
              return 3;
            }

            return 4;
          };

          const priorityDifference = getPriority(firstCompany) - getPriority(secondCompany);

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          return firstCompany.name.localeCompare(secondCompany.name, "it");
        });
    },
    [companies, normalizedDetailPickerSearch]
  );
  const selectedCustomer =
    customers.find((customer) => customer.name === preOrderCustomer) ?? null;
  const selectedCompany =
    companies.find((company) => company.name === preOrderCompany) ?? null;
  const wagyuCalculatedPrice =
    wagyuPriceMode === "per-kg"
      ? (Number.parseFloat(wagyuPricePerKg) || 0) * (Number.parseFloat(wagyuWeight) || 0)
      : Number.parseFloat(wagyuManualPrice) || 0;
  const paymentBaseSubtotal = activeSplitQuota
    ? activeSplitQuota.amount
    : shouldPayUnassignedItemsDirectly
      ? unassignedPayableTotal
      : remainingTotal;
  const paymentBaseAfterFidelityReward = clampCurrency(
    paymentBaseSubtotal - Math.min(currentTable?.selectedRewardDiscount ?? 0, paymentBaseSubtotal)
  );
  const paymentAdjustedTotal = calculateAdjustedPaymentTotal(
    paymentBaseSubtotal,
    currentTable?.selectedRewardDiscount ?? 0,
    paymentAdjustments
  );
  const paymentAdjustmentTotalDelta = roundCurrency(
    paymentAdjustedTotal - paymentBaseAfterFidelityReward
  );
  const appliedQuickDiscount = paymentAdjustments.find(
    (adjustment) => adjustment.scope === "quick-discount"
  );
  const previewQuickDiscountValue = Number.parseFloat(quickDiscountValue);
  const isQuickDiscountDraftValid =
    Number.isFinite(previewQuickDiscountValue) && previewQuickDiscountValue > 0;
  const previewQuickDiscountAmount = isQuickDiscountDraftValid
    ? quickDiscountMode === "percent"
      ? roundCurrency(paymentBaseSubtotal * (previewQuickDiscountValue / 100))
      : roundCurrency(previewQuickDiscountValue)
    : 0;
  const quickDiscountPreviewAmount = Math.min(previewQuickDiscountAmount, paymentBaseSubtotal);
  const paymentAdjustmentsWithoutQuickDiscount = paymentAdjustments.filter(
    (adjustment) => adjustment.scope !== "quick-discount"
  );
  const quickDiscountPreviewTotal = isQuickDiscountDraftValid
    ? calculateAdjustedPaymentTotal(paymentBaseSubtotal, currentTable?.selectedRewardDiscount ?? 0, [
        ...paymentAdjustmentsWithoutQuickDiscount,
        {
          id: "quick-discount-preview",
          type: quickDiscountMode === "percent" ? "percent-discount" : "fixed-discount",
          base: "TOT",
          inputValue: previewQuickDiscountValue,
          amount: quickDiscountPreviewAmount,
          resultTotal: clampCurrency(paymentBaseSubtotal - quickDiscountPreviewAmount),
          scope: "quick-discount",
          label:
            quickDiscountMode === "percent"
              ? `Sconto ${previewQuickDiscountValue}%`
              : `Sconto ${formatEuro(quickDiscountPreviewAmount)}`,
        },
      ])
    : paymentAdjustedTotal;
  const estimatedEarnedPoints = currentTable?.fidelityCustomerId
    ? calculateEarnedPoints(paymentAdjustedTotal)
    : 0;
  const estimatedFinalPointsBalance = linkedFidelityCustomer
    ? Math.max(
        0,
        linkedFidelityCustomer.currentPoints -
          (currentTable?.selectedRewardPoints ?? 0) +
          estimatedEarnedPoints
      )
    : null;

  const resetSwipeState = () => {
    setDragItemId(null);
    setDragStartX(null);
    setDragOffset(0);
  };

  const getVisibleSentQuantity = (item: OrderItem) =>
    Math.min(item.sentQuantity ?? 0, item.quantity);

  const getVisibleQueuedQuantity = (item: OrderItem) =>
    Math.min(item.queuedQuantity ?? 0, item.quantity);

  const getPendingItemQuantity = (item: OrderItem) =>
    Math.max(item.quantity - Math.max(getVisibleSentQuantity(item), getVisibleQueuedQuantity(item)), 0);

  const isSentHistoryItem = (item: OrderItem) =>
    getVisibleSentQuantity(item) > 0 && getPendingItemQuantity(item) === 0;

  const findMergeablePendingItem = (
    items: OrderItem[],
    matcher: (item: OrderItem) => boolean
  ) =>
    items.find(
      (item) =>
        matcher(item) &&
        getVisibleSentQuantity(item) === 0 &&
        getPendingItemQuantity(item) > 0
    );

  const canEditQuantitiesInCurrentPanel =
    panelMode === "draft" || panelMode === "edit-order";

  const findIncrementTargetItem = (
    items: OrderItem[],
    matcher: (item: OrderItem) => boolean
  ) => {
    if (panelMode === "edit-order") {
      return (
        items.find(
          (item) =>
            matcher(item) &&
            item.productId !== AUTO_COVER_PRODUCT_ID &&
            item.quantity > 0
        ) ?? null
      );
    }

    return findMergeablePendingItem(items, matcher) ?? null;
  };

  const updateSingleItem = (
    itemId: string,
    updater: (item: OrderItem) => OrderItem
  ) => {
    safeSetOrderLines((currentItems) =>
      currentItems.map((item) => (item.id === itemId ? updater(item) : item))
    , "ASSIGN_GUEST_GROUP", { itemId });
  };

  const handleAssignGuestGroup = (
    item: OrderItem,
    nextGuestGroup: string | null,
    event?: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (!canEditOrders) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    event?.stopPropagation();

    updateSingleItem(item.id, (currentItem) => ({
      ...currentItem,
      commensaleCode: nextGuestGroup,
      updatedAt: new Date().toISOString(),
      updatedByOperatorId: currentActor.operatorId,
      operatorLabel: currentActor.operatorName,
      operatorId: currentActor.operatorId,
    }));
    setStatusMessage(
      nextGuestGroup
        ? `${item.name} assegnato a ${nextGuestGroup}`
        : `Assegnazione commensale rimossa per ${item.name}`
    );
  };

  const handleMoveItemWithinCourse = (
    item: OrderItem,
    direction: "up" | "down",
    event?: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (!canEditOrders) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    event?.stopPropagation();

    safeSetOrderLines((currentItems) => {
      const candidateIndexes = currentItems
        .map((entry, index) => ({ entry, index }))
        .filter(
          ({ entry }) =>
            entry.course === item.course &&
            serviceProductIds.has(entry.productId) === serviceProductIds.has(item.productId)
        );
      const currentCourseIndex = candidateIndexes.findIndex(({ entry }) => entry.id === item.id);

      if (currentCourseIndex < 0) {
        return currentItems;
      }

      const targetCandidate =
        direction === "up"
          ? candidateIndexes[currentCourseIndex - 1]
          : candidateIndexes[currentCourseIndex + 1];

      if (!targetCandidate) {
        return currentItems;
      }

      const sourceGlobalIndex = candidateIndexes[currentCourseIndex].index;
      const targetGlobalIndex = targetCandidate.index;
      const nextItems = [...currentItems];
      [nextItems[sourceGlobalIndex], nextItems[targetGlobalIndex]] = [
        nextItems[targetGlobalIndex],
        nextItems[sourceGlobalIndex],
      ];
      return nextItems;
    }, "MOVE_ITEM_WITHIN_COURSE", { itemId: item.id, direction });
    setStatusMessage(direction === "up" ? "Prodotto spostato in alto" : "Prodotto spostato in basso");
  };

  const getItemDisplayQuantities = (item: OrderItem) => ({
    sent: getVisibleSentQuantity(item),
    pending: getPendingItemQuantity(item),
    total: item.quantity,
  });
  const palmareTotalItemsCount = getRealOrderItems(orderItems).reduce(
    (total, item) => total + item.quantity,
    0
  );
  const hasPendingOrderItems = orderItems.some(
    (item) => item.productId !== AUTO_COVER_PRODUCT_ID && getPendingItemQuantity(item) > 0
  );
  const isOrderDirty = hasUnsavedChanges;
  const canOpenPayment =
    canAccessPayments &&
    getRealOrderItems(orderItems).some((item) => item.quantity > 0) &&
    orderTotal > 0;

  const getCurrentTableLabel = () =>
    currentTable?.saleMode === "Take Away" ? `Takeaway ${currentTableName}` : `Tavolo ${currentTableName}`;

  const buildVoidPrintableItem = (item: OrderItem, quantity: number): VoidPrintableItem => {
    const department = getDepartmentForOrderItem(item.productId, productsCatalog);

    return {
      itemId: item.id,
      productId: item.productId,
      name: item.name,
      quantity,
      department,
      printerRole: getPrinterRoleForDepartment(department),
      note: item.note,
      course: item.course,
    };
  };

  const applyOrderStateAfterVoid = (nextOrders: OrderItem[], message: string) => {
    safeSetOrderLines(nextOrders, "VOID_ACTION_APPLIED", { message });
    setSavedOrderItems(nextOrders);
    setSelectedVoidItemIds([]);
    setIsVoidSelectionMode(false);

    if (nextOrders.length === 0) {
      updateTable(tableId, {
        status: "free",
        guests: 0,
        note: "",
        paymentStatus: "idle",
      });
      setPaymentMethod(null);
      setDocumentMode(null);
      setActiveMode("RIEPILOGO");
      setPanelMode("draft");
    }

    setStatusMessage(message);
  };

  const persistOrderWithoutSending = (source: "save" | "payment") => {
    const hasPayableOrder = getRealOrderItems(orderItems).some((item) => item.quantity > 0);

    if (isDevelopment) {
      devPaymentLog(source === "payment" ? "Autosave ordine prima del pagamento" : "Salva modifiche", {
        tableId,
        panelMode,
        hasPayableOrder,
        orderItemsCount: orderItems.length,
      });
    }

    setSavedOrderItems(orderItems);
    updateTable(tableId, {
      status: hasPayableOrder ? "occupied" : "free",
      paymentStatus: source === "payment" && hasPayableOrder ? "pending" : "idle",
    });

    return hasPayableOrder;
  };

  const finalizeVoidAction = async (printStorno: boolean) => {
    if (!pendingVoidAction) {
      return;
    }

    const currentTableLabel = getCurrentTableLabel();
    const printableItems = pendingVoidAction.items.filter((item) => item.quantity > 0);
    const dispatchedJobs =
      printStorno && printableItems.length > 0
        ? await new PrintJobService().dispatchVoidPrintJobs({
            tableId,
            tableLabel: currentTableLabel,
            roomLabel: currentTableRoom,
            operator: currentOperator || preOrderOperator || "Admin",
            items: printableItems.map((item) => ({
              id: item.itemId ?? `${item.productId}-${item.quantity}`,
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              course: item.course ?? "PRIMA PORTATA",
              note: item.note,
            })),
            products: productsCatalog,
          })
        : [];
    const printerNames = Array.from(
      new Set(
        dispatchedJobs
          .filter((job) => job.status !== "failed")
          .map((job) => job.printerName)
          .filter(Boolean)
      )
    );
    const failedReasons = dispatchedJobs
      .filter((job) => job.status === "failed")
      .map((job) => job.errorMessage)
      .filter(Boolean);

    appendStornoRecord({
      id: `storno-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: pendingVoidAction.kind,
      tableId,
      tableLabel: currentTableLabel,
      operator: currentOperator || preOrderOperator || "Admin",
      operatorId: currentActor.operatorId,
      createdAt: new Date().toISOString(),
      printed: printStorno && printableItems.length > 0 && printerNames.length > 0,
      printerNames,
      items: pendingVoidAction.items.map((item) => ({
        ...item,
        department: getDepartmentDisplayName(item.department),
      })),
    });

    applyOrderStateAfterVoid(
      pendingVoidAction.nextOrders,
      printStorno
        ? failedReasons.length > 0
          ? `Storno registrato. ${failedReasons[0]}`
          : printerNames.length > 0
            ? `Storno registrato e inviato a ${printerNames.join(", ")}`
            : "Storno registrato senza stampanti di reparto disponibili"
        : "Storno registrato senza stampa"
    );
    setPendingVoidAction(null);
  };

  const openPendingVoidAction = (
    kind: StornoRecordType,
    title: string,
    message: string,
    items: VoidPrintableItem[],
    nextOrders: OrderItem[]
  ) => {
    setPendingVoidAction({
      kind,
      title,
      message,
      items,
      nextOrders,
      allowPrint: items.some((item) => item.quantity > 0),
    });
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setQuantityPickerOverlay(null);
    setDeleteConfirmItem(null);
  };

  const updateItemQuantity = (itemId: string, nextQuantity: number) => {
    safeSetOrderLines((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: nextQuantity,
              sentQuantity: Math.min(item.sentQuantity ?? 0, nextQuantity),
              queuedQuantity: Math.min(item.queuedQuantity ?? 0, nextQuantity),
              status:
                nextQuantity > 0 && Math.min(item.sentQuantity ?? 0, nextQuantity) > 0
                  ? ("sent" as const)
                  : item.status,
            }
          : item
      )
    , "UPDATE_ITEM_QUANTITY", { itemId, nextQuantity });
    setSavedOrderItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: nextQuantity,
              sentQuantity: Math.min(item.sentQuantity ?? 0, nextQuantity),
              queuedQuantity: Math.min(item.queuedQuantity ?? 0, nextQuantity),
              status:
                nextQuantity > 0 && Math.min(item.sentQuantity ?? 0, nextQuantity) > 0
                  ? ("sent" as const)
                  : item.status,
            }
          : item
      )
    );
  };

  const handleIncreaseItemQuantity = (
    item: OrderItem,
    event?: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (!canEditOrders || !canEditQuantitiesInCurrentPanel) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    event?.stopPropagation();

    if (isSentHistoryItem(item)) {
      updateItemQuantity(item.id, item.quantity + 1);
      setQuantityPickerOverlay(null);
      setStatusMessage(`${item.name} aumentato e pronto per il nuovo invio comanda`);
      return;
    }

    updateItemQuantity(item.id, item.quantity + 1);
    setQuantityPickerOverlay(null);
    setStatusMessage("Quantita aggiornata");
  };

  const handleDecreaseItemQuantity = (
    item: OrderItem,
    event?: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (
      (!canEditOrders && !(canDeleteOrderLines && item.quantity <= 1)) ||
      !canEditQuantitiesInCurrentPanel
    ) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    event?.stopPropagation();

    if (item.quantity <= 1) {
      handleDeleteItem(item);
      return;
    }

    const nextQuantity = item.quantity - 1;
    const sentReduction = Math.max(getVisibleSentQuantity(item) - nextQuantity, 0);

    if (sentReduction > 0) {
      openPendingVoidAction(
        "product",
        "Storno prodotto",
        `Vuoi eliminare / stornare ${sentReduction}x ${item.name}?`,
        [buildVoidPrintableItem(item, sentReduction)],
        orderItems.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                quantity: nextQuantity,
                sentQuantity: Math.min(entry.sentQuantity ?? 0, nextQuantity),
                queuedQuantity: Math.min(entry.queuedQuantity ?? 0, nextQuantity),
              }
            : entry
        )
      );
      return;
    }

    updateItemQuantity(item.id, nextQuantity);
    setQuantityPickerOverlay(null);
    setStatusMessage("Quantita aggiornata");
  };

  const handlePointerStart = (itemId: string, clientX: number) => {
    setDragItemId(itemId);
    setDragStartX(clientX);
    setDragOffset(0);
  };

  const handlePointerMove = (clientX: number) => {
    if (!dragItemId || dragStartX === null) {
      return;
    }

    const delta = Math.min(0, clientX - dragStartX);
    setDragOffset(Math.max(delta, -96));
  };

  const handlePointerEnd = () => {
    if (!dragItemId) {
      return;
    }

    if (dragOffset <= -56) {
      setRevealedDeleteItemId(dragItemId);
      setSuppressCardClick(true);
    } else if (revealedDeleteItemId === dragItemId) {
      setRevealedDeleteItemId(null);
      setSuppressCardClick(true);
    }

    resetSwipeState();
  };

  const handleDeleteItem = (item: OrderItem) => {
    if (item.productId === AUTO_COVER_PRODUCT_ID) {
      return;
    }

    if (!canDeleteOrderLines) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    setQuantityPickerOverlay(null);
    const sentQuantity = getVisibleSentQuantity(item);

    if (sentQuantity > 0) {
      openPendingVoidAction(
        "product",
        "Storno prodotto",
        `Vuoi eliminare / stornare il prodotto '${item.name}'?`,
        [buildVoidPrintableItem(item, sentQuantity)],
        orderItems.filter((entry) => entry.id !== item.id)
      );
      return;
    }

    setDeleteConfirmItem(item);
  };

  const handleOpenNoteEditor = (item: OrderItem) => {
    if (item.productId === AUTO_COVER_PRODUCT_ID) {
      return;
    }

    if (!canEditOrders) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (suppressCardClick) {
      setSuppressCardClick(false);
      return;
    }

    if (revealedDeleteItemId && revealedDeleteItemId !== item.id) {
      setRevealedDeleteItemId(null);
    }

    if (revealedDeleteItemId === item.id) {
      return;
    }

    setNoteEditorItem(item);
    setQuantityPickerOverlay(null);
    setNoteEditorValue(item.note ?? "");
    setNoteEditorPrice(item.unitPrice.toFixed(2));
    setNoteEditorAdditions(item.additions ?? []);
    setNoteEditorRemovals(item.removals ?? []);
    setIsAdditionsOpen(false);
    setIsRemovalsOpen(false);
  };

  const toggleModifierSelection = (
    value: string,
    setter: Dispatch<SetStateAction<string[]>>
  ) => {
    setter((currentValues) =>
      currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value]
    );
  };

  const handleSaveItemNote = () => {
    if (!noteEditorItem) {
      return;
    }

    const trimmedNote = noteEditorValue.trim();
    const parsedPrice = Number(noteEditorPrice.replace(",", "."));
    const nextUnitPrice =
      Number.isFinite(parsedPrice) && parsedPrice >= 0
        ? parsedPrice
        : noteEditorItem.unitPrice;

    safeSetOrderLines((currentItems) =>
      currentItems.map((item) =>
        item.id === noteEditorItem.id
          ? {
              ...item,
              note: trimmedNote,
              unitPrice: nextUnitPrice,
              originalUnitPrice: item.originalUnitPrice ?? noteEditorItem.originalUnitPrice ?? item.unitPrice,
              additions: noteEditorAdditions,
              removals: noteEditorRemovals,
            }
          : item
      )
    , "SAVE_ITEM_NOTE", { itemId: noteEditorItem.id });
    setSavedOrderItems((currentItems) =>
      currentItems.map((item) =>
        item.id === noteEditorItem.id
          ? {
              ...item,
              note: trimmedNote,
              unitPrice: nextUnitPrice,
              originalUnitPrice: item.originalUnitPrice ?? noteEditorItem.originalUnitPrice ?? item.unitPrice,
              additions: noteEditorAdditions,
              removals: noteEditorRemovals,
            }
          : item
      )
    );
    setNoteEditorItem(null);
    setNoteEditorValue("");
    setNoteEditorPrice("");
    setNoteEditorAdditions([]);
    setNoteEditorRemovals([]);
    setStatusMessage("Nota piatto salvata");
  };

  const handleApplyPalmareQuickNote = (note: string) => {
    setNoteEditorValue((currentValue) => {
      const normalizedCurrent = currentValue.trim();

      if (!normalizedCurrent) {
        return note;
      }

      const existingNotes = normalizedCurrent
        .split(",")
        .map((entry) => entry.trim().toLowerCase());

      if (existingNotes.includes(note.toLowerCase())) {
        return currentValue;
      }

      return `${normalizedCurrent}, ${note}`;
    });
  };

  const confirmDeleteItem = () => {
    if (!deleteConfirmItem) {
      return;
    }

    safeSetOrderLines((currentItems) =>
      currentItems.filter((item) => item.id !== deleteConfirmItem.id)
    , "DELETE_ITEM_CONFIRMED", { itemId: deleteConfirmItem.id });
    setSavedOrderItems((currentItems) =>
      currentItems.filter((item) => item.id !== deleteConfirmItem.id)
    );
    setRevealedDeleteItemId(null);
    setDeleteConfirmItem(null);
    setNoteEditorItem(null);
    setNoteEditorValue("");
    setNoteEditorPrice("");
    setNoteEditorAdditions([]);
    setNoteEditorRemovals([]);
    setStatusMessage("Piatto eliminato");
  };

  const handleQuantitySelect = (item: OrderItem, nextQuantity: number) => {
    if (!canEditOrders || !canEditQuantitiesInCurrentPanel) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    const sentReduction = Math.max(getVisibleSentQuantity(item) - nextQuantity, 0);

    if (sentReduction > 0) {
      openPendingVoidAction(
        "product",
        "Storno prodotto",
        `Vuoi aggiornare ${item.name} a ${nextQuantity} con storno di ${sentReduction} unità?`,
        [buildVoidPrintableItem(item, sentReduction)],
        orderItems.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                quantity: nextQuantity,
                sentQuantity: Math.min(entry.sentQuantity ?? 0, nextQuantity),
                queuedQuantity: Math.min(entry.queuedQuantity ?? 0, nextQuantity),
              }
            : entry
        )
      );
      return;
    }

    updateItemQuantity(item.id, nextQuantity);
    setQuantityPickerOverlay(null);
    setStatusMessage("Quantita aggiornata");
  };

  const handleToggleQuantityPicker = (
    item: OrderItem,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (!canEditOrders || !canEditQuantitiesInCurrentPanel) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    event.stopPropagation();

    if (quantityPickerOverlay?.itemId === item.id) {
      setQuantityPickerOverlay(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const pickerWidth = 120;
    const pickerHeight = 156;
    const spacing = 4;
    const openAbove =
      rect.bottom + pickerHeight + spacing > window.innerHeight && rect.top - pickerHeight - spacing >= 8;
    const nextTop = openAbove ? rect.top - pickerHeight - spacing : rect.bottom + spacing;
    const nextLeft = Math.min(rect.left, window.innerWidth - pickerWidth - 8);

    setQuantityPickerOverlay({
      itemId: item.id,
      left: Math.max(8, nextLeft),
      top: Math.max(8, nextTop),
    });
  };

  const renderDishCard = (item: OrderItem) => {
    const isAutoCoverItem = item.productId === AUTO_COVER_PRODUCT_ID;
    const currentOffset =
      dragItemId === item.id ? dragOffset : revealedDeleteItemId === item.id ? -88 : 0;
    const hasFreeNote = Boolean(item.note?.trim());
    const hasAdditions = Boolean(item.additions && item.additions.length > 0);
    const hasRemovals = Boolean(item.removals && item.removals.length > 0);
    const hasPriceOverride =
      item.originalUnitPrice !== undefined && item.unitPrice !== item.originalUnitPrice;
    const modifierGroupCount = [hasFreeNote, hasAdditions, hasRemovals, hasPriceOverride].filter(Boolean).length;
    const itemQuantities = getItemDisplayQuantities(item);
    const hasSentQuantity = itemQuantities.sent > 0;
    const hasPendingQuantity = itemQuantities.pending > 0;
    const isHistoricalRow = hasSentQuantity && !hasPendingQuantity;
    const isReadOnlySummaryPanel = panelMode === "sent-summary" || panelMode === "detail";
    const canDecreaseDirectly =
      canEditQuantitiesInCurrentPanel &&
      (canEditOrders || (canDeleteOrderLines && item.quantity <= 1));
    const canOpenQuantityPicker = canEditQuantitiesInCurrentPanel && canEditOrders;
    const showGuestControls = panelMode === "draft" || panelMode === "edit-order";

    if (isAutoCoverItem) {
      return (
        <div key={item.id} className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
          <div className="grid grid-cols-[56px_minmax(0,1fr)_88px] items-start gap-3 px-3 py-3 text-sm">
            <div className="rounded-[4px] border border-[#ddd9d0] bg-white px-2 py-1 text-center font-semibold text-[#433d36]">
              {`${item.quantity}x`}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-[#2e2a25]">{item.name}</div>
            </div>
            <div className="text-right font-semibold text-[#433d36]">
              {formatEuro(item.unitPrice * item.quantity)}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className={[
          "relative overflow-visible rounded-[4px] border bg-[#ffffff]",
          hasPendingQuantity
            ? "border-[#b9d3ee] bg-[#f8fbff]"
            : isHistoricalRow
              ? "border-[#cfd6dc]"
              : "border-[#d8d5cc]",
        ].join(" ")}
      >
        <div className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-[#d97070] text-xs font-bold uppercase tracking-[0.04em] text-white">
          <button
            type="button"
            onClick={() => handleDeleteItem(item)}
            disabled={!canDeleteOrderLines}
            className="flex h-full w-full items-center justify-center gap-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <TrashIcon className="h-4 w-4" />
            <span>Elimina</span>
          </button>
        </div>

        <div
          className="relative bg-[#ffffff] transition-transform duration-150 ease-out"
          style={{ transform: `translateX(${currentOffset}px)` }}
          onPointerDown={(event) => handlePointerStart(item.id, event.clientX)}
          onPointerMove={(event) => handlePointerMove(event.clientX)}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClick={() => handleOpenNoteEditor(item)}
        >
          <div
            className={[
              "grid items-start gap-3 px-3 py-3 text-sm",
              isVoidSelectionMode && panelMode === "edit-order"
                ? "grid-cols-[28px_92px_minmax(0,1fr)_88px]"
                : "grid-cols-[92px_minmax(0,1fr)_88px]",
            ].join(" ")}
          >
            {isVoidSelectionMode && panelMode === "edit-order" ? (
              <div className="flex justify-center pt-1">
                <input
                  type="checkbox"
                  checked={selectedVoidItemIds.includes(item.id)}
                  onChange={(event) => {
                    event.stopPropagation();
                    setSelectedVoidItemIds((currentIds) =>
                      event.target.checked
                        ? [...currentIds, item.id]
                        : currentIds.filter((entry) => entry !== item.id)
                    );
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="h-4 w-4 accent-[#0b3c5d]"
                />
              </div>
            ) : null}
            {isReadOnlySummaryPanel ? (
              <div className="rounded-[4px] border border-[#ddd9d0] bg-white px-3 py-1 text-center font-semibold text-[#433d36]">
                {`${item.quantity}x`}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => handleDecreaseItemQuantity(item, event)}
                  onPointerDown={(event) => event.stopPropagation()}
                  disabled={!canDecreaseDirectly}
                  className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#ddd9d0] bg-white text-base font-bold text-[#433d36] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={(event) => handleToggleQuantityPicker(item, event)}
                  onPointerDown={(event) => event.stopPropagation()}
                  disabled={!canOpenQuantityPicker}
                  className="min-w-[42px] rounded-[4px] border border-[#ddd9d0] bg-white px-2 py-1 text-center font-semibold text-[#433d36] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {`${item.quantity}x`}
                </button>
                <button
                  type="button"
                  onClick={(event) => handleIncreaseItemQuantity(item, event)}
                  onPointerDown={(event) => event.stopPropagation()}
                  disabled={!canEditOrders || !canEditQuantitiesInCurrentPanel}
                  className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#bdd8ef] bg-[#eef6fd] text-base font-bold text-[#24557e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </button>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <div
                  className={[
                    "min-w-0 flex-1 truncate font-semibold",
                    item.status === "sent" ? "text-[#6e675f]" : "text-[#2e2a25]",
                  ].join(" ")}
                >
                  {item.name}
                </div>
                {item.commensaleCode ? (
                  <div className="rounded-[999px] border border-[#b9d3ee] bg-[#e8f2fd] px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-[#24557e]">
                    {item.commensaleCode}
                  </div>
                ) : null}
                {modifierGroupCount > 0 ? (
                  <div className="rounded-[4px] border border-[#d7d3ca] bg-[#fbf8f2] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#5c564f]">
                    {modifierGroupCount}
                  </div>
                ) : null}
              </div>
              {hasSentQuantity || hasPendingQuantity ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {hasSentQuantity ? (
                    <div className="rounded-[999px] border border-[#d8d5cc] bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#6d665e]">
                      {isHistoricalRow
                        ? `${itemQuantities.sent} gia inviati`
                        : `${itemQuantities.sent} inviati`}
                    </div>
                  ) : null}
                  {hasPendingQuantity ? (
                    <div className="rounded-[999px] border border-[#b9d3ee] bg-[#e8f2fd] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#24557e]">
                      {`+${itemQuantities.pending} da inviare`}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showGuestControls ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {guestAssignmentOptions.map((guestOption) => {
                    const isActiveGuest = item.commensaleCode === guestOption.code;

                    return (
                      <button
                        key={`${item.id}-${guestOption.code}`}
                        type="button"
                        onClick={(event) => handleAssignGuestGroup(item, guestOption.code, event)}
                        onPointerDown={(event) => event.stopPropagation()}
                        className={[
                          "rounded-[999px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]",
                          isActiveGuest
                            ? "border-[#0b3c5d] bg-[#0b3c5d] text-white"
                            : "border-[#d8d5cc] bg-white text-[#5f5952]",
                        ].join(" ")}
                      >
                        {guestOption.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={(event) => handleAssignGuestGroup(item, null, event)}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={[
                      "rounded-[999px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]",
                      item.commensaleCode
                        ? "border-[#d8d5cc] bg-white text-[#5f5952]"
                        : "border-[#b9d3ee] bg-[#e8f2fd] text-[#24557e]",
                    ].join(" ")}
                  >
                    Nessuno
                  </button>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => handleMoveItemWithinCourse(item, "up", event)}
                      onPointerDown={(event) => event.stopPropagation()}
                      disabled={!canEditOrders}
                      className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-[#ddd9d0] bg-white text-[11px] font-bold text-[#433d36] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Sposta ${item.name} in alto`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={(event) => handleMoveItemWithinCourse(item, "down", event)}
                      onPointerDown={(event) => event.stopPropagation()}
                      disabled={!canEditOrders}
                      className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-[#ddd9d0] bg-white text-[11px] font-bold text-[#433d36] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Sposta ${item.name} in basso`}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ) : null}
              {hasFreeNote ? (
                <div className="mt-1 text-[11px] leading-snug text-[#5f5950]">
                  {`Note: ${item.note}`}
                </div>
              ) : null}
              {hasAdditions ? (
                <div className="mt-1 text-[11px] leading-snug text-[#5f5950]">
                  {`+ ${item.additions?.join(", ")}`}
                </div>
              ) : null}
              {hasRemovals ? (
                <div className="mt-1 text-[11px] leading-snug text-[#5f5950]">
                  {`- ${item.removals?.join(", ")}`}
                </div>
              ) : null}
              {hasPriceOverride ? (
                <div className="mt-1 text-[11px] leading-snug text-[#5f5950]">
                  {`Prezzo modificato: ${formatEuro(item.unitPrice)}`}
                </div>
              ) : null}
            </div>
            <div className="text-right font-semibold text-[#433d36]">
              {formatEuro(item.unitPrice * item.quantity)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQuantityPickerOverlay = () => {
    if (!quantityPickerOverlay || typeof document === "undefined") {
      return null;
    }

    const selectedItem = orderItems.find((item) => item.id === quantityPickerOverlay.itemId);

    if (!selectedItem) {
      return null;
    }

    return createPortal(
      <>
        <button
          type="button"
          aria-label="Chiudi selettore quantita"
          className="fixed inset-0 z-[190] bg-transparent"
          onClick={() => setQuantityPickerOverlay(null)}
        />
        <div
          className="fixed z-[200] grid w-[120px] grid-cols-2 gap-1 rounded-[4px] border border-[#d8d5cc] bg-white p-1 shadow-sm"
          style={{
            left: quantityPickerOverlay.left,
            top: quantityPickerOverlay.top,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleQuantitySelect(selectedItem, value)}
              className={[
                "rounded-[4px] border px-2 py-1 text-xs font-semibold",
                value === selectedItem.quantity
                  ? "border-[#7fb4e5] bg-[#cfe8ff] text-[#24557e]"
                  : "border-[#ddd9d0] bg-[#ffffff] text-[#433d36]",
              ].join(" ")}
            >
              {value}
            </button>
          ))}
        </div>
      </>,
      document.body
    );
  };

  const renderSizeSelectorOverlay = () => {
    if (!sizeSelectorOverlay || typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <>
        <button
          type="button"
          aria-label="Chiudi selettore formato"
          className="fixed inset-0 z-[190] bg-transparent"
          onClick={() => setSizeSelectorOverlay(null)}
        />
        <div
          className="fixed z-[210] grid w-[156px] grid-cols-1 gap-1 rounded-[4px] border border-[#d8d5cc] bg-white p-1 shadow-sm"
          style={{
            left: sizeSelectorOverlay.left,
            top: sizeSelectorOverlay.top,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {sizeSelectorOverlay.product.sizeVariants?.map((sizeVariant) => (
            <button
              key={`${sizeSelectorOverlay.product.id}-${sizeVariant.id}`}
              type="button"
              onClick={() => handleAddSizedProduct(sizeSelectorOverlay.product, sizeVariant)}
              disabled={!canInsertProducts}
              className="rounded-[4px] border border-[#ddd9d0] bg-[#ffffff] px-3 py-2 text-left text-xs font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {`${sizeVariant.label} · ${formatEuro(sizeVariant.price)}`}
            </button>
          ))}
        </div>
      </>,
      document.body
    );
  };

  const renderCourseSection = (
    title: string,
    items: OrderItem[],
    emptyLabel = "Nessun piatto inserito"
  ) => (
    <section key={title} className="space-y-2">
      <div className="rounded-[4px] border border-[#cfd4da] bg-[#dfe4e8] px-3 py-2 text-xs font-bold uppercase tracking-[0.04em] text-[#384047]">
        {title}
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">{items.map((item) => renderDishCard(item))}</div>
      ) : (
        <div className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 py-3 text-sm text-[#7a736a]">
          {emptyLabel}
        </div>
      )}
    </section>
  );

  const renderPalmareSplitContent = () => (
    <div className="space-y-3">
      <div className="rounded-[12px] border border-[#d8d5cc] bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase text-[#5d564e]">Divisione conto</div>
          {splitBillState ? (
            <button
              type="button"
              onClick={clearSplitBillState}
              className="h-8 rounded-[8px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-[11px] font-semibold text-[#2e2a25]"
            >
              Reset
            </button>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {([
            { id: "people", label: "Per persone" },
            { id: "amount", label: "Per importo" },
            { id: "items", label: "Per prodotti" },
          ] as const).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => activateSplitMode(mode.id)}
              className={[
                "h-10 rounded-[8px] border px-3 text-sm font-semibold",
                splitMode === mode.id
                  ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                  : "border-[#c7c1b6] bg-white text-[#2e2a25]",
              ].join(" ")}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {splitMode === "people" ? (
          <div className="mt-3 space-y-2">
            <label className="block">
              <div className="mb-1 text-[11px] font-semibold uppercase text-[#5d564e]">Persone</div>
              <select
                value={romanSplitGuests}
                onChange={(event) => setRomanSplitGuests(event.target.value)}
                className="h-10 w-full rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleGeneratePeopleQuotas}
              className="h-10 w-full rounded-[8px] border border-[#a9c9e6] bg-[#eef7ff] px-3 text-sm font-semibold text-[#0b3c5d]"
            >
              Genera quote
            </button>
          </div>
        ) : null}

        {splitMode === "amount" ? (
          <div className="mt-3 space-y-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={splitCustomAmount}
              onChange={(event) => setSplitCustomAmount(event.target.value)}
              placeholder="Importo quota"
              className="h-10 w-full rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleAddAmountQuota(false)}
                className="h-10 rounded-[8px] border border-[#a9c9e6] bg-[#eef7ff] px-3 text-sm font-semibold text-[#0b3c5d]"
              >
                Aggiungi
              </button>
              <button
                type="button"
                onClick={() => handleAddAmountQuota(true)}
                disabled={splitCreationAvailableAmount <= 0}
                className="h-10 rounded-[8px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tutto il residuo
              </button>
            </div>
          </div>
        ) : null}

        {splitMode === "items" ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-[8px] border border-[#d8d5cc] bg-[#fffefb] px-3 py-2 text-sm text-[#5d564e]">
              <div>Prodotti selezionati: <span className="font-bold text-[#0b3c5d]">{formatEuro(selectedSplitTotal)}</span></div>
              <div className="mt-1">Residuo: <span className="font-bold text-[#2e2a25]">{formatEuro(unassignedPayableTotal)}</span></div>
            </div>
            <button
              type="button"
              onClick={handleCreateItemSplitQuota}
              disabled={selectedSplitItemIds.length === 0}
              className="h-10 w-full rounded-[8px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Crea sotto-conto
            </button>
          </div>
        ) : null}
      </div>

      {splitQuotas.length > 0 ? (
        <div className="rounded-[12px] border border-[#d8d5cc] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase text-[#5d564e]">Quote create</div>
            <div className="text-[11px] font-semibold text-[#6a645b]">{formatEuro(remainingTotal)} residuo</div>
          </div>
          <div className="mt-3 space-y-2">
            {splitQuotas.map((quota) => (
              <div
                key={quota.id}
                className={[
                  "rounded-[8px] border px-3 py-2.5",
                  quota.status === "paid"
                    ? "border-[#cfe5cf] bg-[#f1fbf1]"
                    : "border-[#e1ddd4] bg-[#fffefb]",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#2e2a25]">{quota.label}</div>
                    <div className="mt-1 text-[11px] text-[#6a645b]">
                      {quota.mode === "items"
                        ? `${quota.itemIds?.length ?? 0} prodotti`
                        : quota.mode === "people"
                          ? "Quota persona"
                          : "Quota importo"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#0b3c5d]">{formatEuro(quota.amount)}</div>
                    {quota.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveSplitQuota(quota.id)}
                        className="mt-2 h-8 rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-[11px] font-semibold text-[#2e2a25]"
                      >
                        Rimuovi
                      </button>
                    ) : (
                      <span className="mt-2 inline-flex h-8 items-center rounded-[8px] border border-[#b9d8b9] bg-white px-3 text-[11px] font-semibold text-[#2f6c2f]">
                        Pagata
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderPalmareSummarySheet = () => {
    if (!isPalmareMode || !isPalmareSummaryOpen) {
      return null;
    }

    return (
      <div className="absolute inset-0 z-30 flex items-end bg-black/25">
        <div className="max-h-[78vh] w-full overflow-hidden rounded-t-[20px] border border-[#d8d5cc] bg-white shadow-[0_-20px_48px_rgba(31,26,21,0.16)]">
          <div className="flex items-center justify-between border-b border-[#e7e1d7] px-4 py-3">
            <div>
              <div className="text-sm font-bold text-[#2e2a25]">Tavolo e commensali</div>
              <div className="text-xs text-[#6a645b]">
                {`${palmareTotalItemsCount} articoli · ${formatEuro(orderTotal)}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPalmareSummaryOpen(false)}
              className="h-10 rounded-[10px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm font-semibold text-[#2e2a25]"
            >
              Chiudi
            </button>
          </div>
          <div className="border-b border-[#efe8dc] px-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "summary" as const, label: "Riepilogo" },
                { id: "table" as const, label: "Tavolo" },
                { id: "split" as const, label: "Divisione" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPalmareSheetTab(tab.id)}
                  className={[
                    "h-9 rounded-[8px] border px-3 text-xs font-semibold",
                    palmareSheetTab === tab.id
                      ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                      : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[calc(78vh-126px)] overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <div className="rounded-[12px] border border-[#e7e1d7] bg-[#fbf8f2] px-3 py-2.5 text-xs text-[#5d564e]">
                <div className="font-semibold text-[#2e2a25]">
                  {currentTableGuests > 0
                    ? `Coperti impostati: ${currentTableGuests}`
                    : "Coperti non impostati"}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-[#6a645b]">
                  {currentTableGuests > 0
                    ? "Assegna ogni riga al commensale corretto prima di inviare la comanda."
                    : "Mostro almeno Comm. 1 per permettere una divisione rapida. Se vuoi, imposta prima i coperti nel tavolo."}
                </div>
              </div>
              {palmareSheetTab === "summary"
                ? (
                    <>
                      {groupedItems.map((group) => renderCourseSection(group.course, group.items))}
                      {serviceItems.length > 0 ? renderCourseSection("SERVIZI", serviceItems) : null}
                    </>
                  )
                : palmareSheetTab === "table"
                  ? renderPalmareDetailContent()
                  : renderPalmareSplitContent()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPalmareSearchSheet = () => {
    if (!isPalmareMode || !isPalmareSearchOpen) {
      return null;
    }

    return (
      <div className="absolute inset-0 z-40 flex items-end bg-black/25">
        <div className="max-h-[82vh] w-full overflow-hidden rounded-t-[20px] border border-[#d8d5cc] bg-white shadow-[0_-20px_48px_rgba(31,26,21,0.16)]">
          <div className="flex items-center justify-between border-b border-[#e7e1d7] px-4 py-3">
            <div className="text-sm font-bold text-[#2e2a25]">Cerca prodotti</div>
            <button
              type="button"
              onClick={() => setIsPalmareSearchOpen(false)}
              className="h-10 rounded-[10px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm font-semibold text-[#2e2a25]"
            >
              Chiudi
            </button>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div className="flex h-11 items-center rounded-[10px] border border-[#d8d5cc] bg-white px-3">
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Nome prodotto o reparto"
                className="h-full w-full bg-transparent text-sm outline-none placeholder:text-[#9c9488]"
              />
            </div>
            <div className="max-h-[56vh] overflow-y-auto rounded-[12px] border border-[#d8d5cc] bg-[#fbf8f2] p-2">
              <div className="space-y-2">
                {palmareSearchResults.length > 0 ? (
                  palmareSearchResults.map((product) => {
                    const visibleProductPrice =
                      uramakiSelectorCategories.has(product.category) && product.sizeVariants?.length
                        ? product.sizeVariants.find((variant) => variant.id === "8pz")?.price ?? product.price
                        : product.price;
                    const isPricePending = Boolean(product.pricePending);

                    return (
                      <button
                        key={`search-${product.id}`}
                        type="button"
                        onClick={() => {
                          setActiveCategory(product.category);
                          setPalmareCatalogView("products");
                          void addProductToOrder(product);
                          setIsPalmareSearchOpen(false);
                        }}
                        disabled={isPricePending || !canInsertProducts}
                        className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[10px] border border-[#d8d5cc] bg-white px-3 py-3 text-left disabled:opacity-60"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[#2e2a25]">
                            {product.name}
                          </div>
                          <div className="mt-1 text-xs text-[#6a645b]">{product.category}</div>
                        </div>
                        <div className="shrink-0 text-sm font-bold text-[#2e2a25]">
                          {isPricePending ? "Da definire" : formatEuro(visibleProductPrice)}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-[#7a736a]">
                    Nessun prodotto trovato.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  function renderPalmareCourseSelector() {
    return panelMode === "draft" || panelMode === "edit-order" ? (
      <div>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: "PRIMA PORTATA" as CourseGroup, label: "1ª" },
            { key: "SECONDA PORTATA" as CourseGroup, label: "2ª" },
            { key: "TERZA PORTATA" as CourseGroup, label: "3ª" },
          ].map((course) => (
            <button
              key={course.key}
              type="button"
              onClick={() => {
                setActiveMode(course.key);
                setStatusMessage("");
              }}
              className={[
                "h-8 rounded-[999px] border px-2.5 text-[11px] font-semibold",
                activeMode === course.key
                  ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                  : "border-[#d8d5cc] bg-white text-[#2e2a25]",
              ].join(" ")}
            >
              {course.label}
            </button>
          ))}
          <button
            type="button"
            disabled
            className="h-8 rounded-[999px] border border-[#d8d5cc] bg-[#f7f4ee] px-2.5 text-[11px] font-semibold text-[#8a8379] opacity-70"
            title="Portate aggiuntive disponibili in un passaggio successivo"
          >
            +
          </button>
        </div>
      </div>
    ) : null;
  }

  function renderPalmareDraftContent() {
    return (
    <div className="space-y-2.5">
      {palmareCatalogView === "departments" ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d564e]">
                Reparti
              </div>
              <div className="mt-0.5 text-xs text-[#6a645b]">
                Seleziona un reparto per vedere i prodotti
              </div>
            </div>
            <div className="rounded-[999px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 py-1 text-[11px] font-semibold text-[#6a645b]">
              {palmareVisibleCategories.length}
            </div>
          </div>
          {palmareVisibleCategories.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {palmareVisibleCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category);
                    setPalmareCatalogView("products");
                    setSearchValue("");
                    setStatusMessage("");
                  }}
                  className={[
                    "min-h-[64px] rounded-[10px] border px-2.5 py-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)]",
                    category === activeCategory
                      ? "border-[#a9c9e6] bg-[#eef7ff] text-[#0b3c5d]"
                      : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                  ].join(" ")}
                >
                  <div className="text-[13px] font-semibold leading-snug">{category}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] border border-[#d8d5cc] bg-white px-4 py-5 text-center text-sm text-[#7a736a]">
              Nessun reparto trovato.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setPalmareCatalogView("departments");
                setSearchValue("");
              }}
              className="h-8 rounded-[8px] border border-[#d8d5cc] bg-white px-2.5 text-[11px] font-semibold text-[#2e2a25]"
            >
              Reparti
            </button>
            <div className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold text-[#2e2a25]">
              {activeCategory}
            </div>
          </div>

          {pendingSizeProduct && pendingSizeProduct.category === activeCategory ? (
            <div className="rounded-[12px] border border-[#d8d5cc] bg-white p-3">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">Scegli formato</div>
              <div className="mt-1 text-sm font-semibold text-[#2e2a25]">{pendingSizeProduct.name}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {pendingSizeProduct.sizeVariants?.map((sizeVariant) => (
                  <button
                    key={`${pendingSizeProduct.id}-${sizeVariant.id}`}
                    type="button"
                    onClick={() => handleAddSizedProduct(pendingSizeProduct, sizeVariant)}
                    disabled={!canInsertProducts}
                    className="min-h-[48px] rounded-[10px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {`${sizeVariant.label} · ${formatEuro(sizeVariant.price)}`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPendingSizeProduct(null)}
                className="mt-2 h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-[#fffefb] px-3 text-xs font-semibold text-[#5d564e]"
              >
                Annulla
              </button>
            </div>
          ) : null}

          {pendingTartareProduct && pendingTartareProduct.category === activeCategory ? (
            <div className="rounded-[12px] border border-[#d8d5cc] bg-white p-3">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">Scegli preparazione</div>
              <div className="mt-1 text-sm font-semibold text-[#2e2a25]">{pendingTartareProduct.name}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {tartareChoiceMap[pendingTartareProduct.id]?.map((variant) => (
                  <button
                    key={`${pendingTartareProduct.id}-${variant.id}`}
                    type="button"
                    onClick={() => handleAddTartareVariant(pendingTartareProduct, variant)}
                    disabled={!canInsertProducts}
                    className="min-h-[48px] rounded-[10px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {`${variant.label} · ${formatEuro(variant.price)}`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPendingTartareProduct(null)}
                className="mt-2 h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-[#fffefb] px-3 text-xs font-semibold text-[#5d564e]"
              >
                Annulla
              </button>
            </div>
          ) : null}

          {pastoPricingProduct && pastoPricingProduct.category === activeCategory ? (
            <div className="rounded-[12px] border border-[#d8d5cc] bg-white p-3">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">Inserisci prezzo</div>
              <div className="mt-1 text-sm font-semibold text-[#2e2a25]">{pastoPricingProduct.name}</div>
              <label className="mt-3 block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Prezzo</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pastoCustomPrice}
                  onChange={(event) => setPastoCustomPrice(event.target.value)}
                  disabled={!canInsertProducts}
                  className="h-11 w-full rounded-[10px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={resetPastoPricing}
                  className="h-11 rounded-[10px] border border-[#d8d5cc] bg-[#fffefb] px-3 text-xs font-semibold text-[#5d564e]"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleAddPasto}
                  disabled={!canInsertProducts}
                  className="h-11 rounded-[10px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-xs font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Conferma
                </button>
              </div>
            </div>
          ) : null}

          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {filteredProducts.map((product) => {
                const visibleProductPrice =
                  uramakiSelectorCategories.has(product.category) && product.sizeVariants?.length
                    ? product.sizeVariants.find((variant) => variant.id === "8pz")?.price ?? product.price
                    : product.price;
                const isPricePending = Boolean(product.pricePending);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={(event) => addProductToOrder(product, event)}
                    disabled={isPricePending || !canInsertProducts}
                    className={[
                      "flex min-h-[72px] flex-col justify-between rounded-[10px] border bg-white px-2.5 py-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)]",
                      isPricePending || !canInsertProducts ? "opacity-60" : "",
                      "border-[#d8d5cc] text-[#2e2a25]",
                    ].join(" ")}
                  >
                    <span className="line-clamp-3 text-[13px] font-semibold leading-snug">{product.name}</span>
                    <span className="mt-1.5 text-[13px] font-bold">
                      {isPricePending ? "Da definire" : formatEuro(visibleProductPrice)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[12px] border border-[#d8d5cc] bg-white px-4 py-5 text-center text-sm text-[#7a736a]">
              Nessun prodotto nel reparto selezionato.
            </div>
          )}
        </div>
      )}
    </div>
    );
  }

  function renderPalmareSummaryContent() {
    return (
    <div className="space-y-5">
      {groupedItems.map((group) => renderCourseSection(group.course, group.items))}
      {serviceItems.length > 0 ? renderCourseSection("SERVIZI", serviceItems) : null}
      {currentTable?.selectedRewardDiscount ? (
        <div className="rounded-[12px] border border-[#d8d5cc] bg-white p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div>
              <div className="font-semibold text-[#2e2a25]">Premio Fidelity</div>
              <div className="mt-1 text-xs text-[#6a645b]">
                {currentTable.selectedRewardName || "Premio applicato"}
              </div>
            </div>
            <div className="font-bold text-[#8a3434]">
              -{formatEuro(currentTable.selectedRewardDiscount)}
            </div>
          </div>
        </div>
      ) : null}
      {linkedFidelityCustomer ? (
        <div className="rounded-[12px] border border-[#d8d5cc] bg-white p-4">
          <div className="text-xs font-semibold uppercase text-[#5d564e]">Riepilogo fidelity</div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#5d564e]">
            <div>
              <div className="text-[11px] uppercase text-[#7b7369]">Cliente fidelity</div>
              <div className="mt-1 font-semibold text-[#2e2a25]">
                {linkedFidelityCustomer.firstName} {linkedFidelityCustomer.lastName}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-[#7b7369]">Punti disponibili</div>
              <div className="mt-1 font-semibold text-[#0b3c5d]">
                {currentTable?.pointsBeforePayment ?? linkedFidelityCustomer.currentPoints}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-[#7b7369]">Premio applicato</div>
              <div className="mt-1 font-semibold text-[#2e2a25]">
                {currentTable?.selectedRewardName || "nessuno"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-[#7b7369]">Punti residui stimati</div>
              <div className="mt-1 font-semibold text-[#0b3c5d]">
                {estimatedFinalPointsBalance ?? linkedFidelityCustomer.currentPoints}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    );
  }

  function renderPalmareLiveSummaryPanel() {
    const liveSummaryItems = groupedItems.flatMap((group) =>
      group.items.map((item) => ({ course: group.course, item }))
    );
    const liveServiceItems = serviceItems.map((item) => ({ course: "SERVIZI", item }));
    const allLiveItems = [...liveSummaryItems, ...liveServiceItems];

    if (allLiveItems.length === 0) {
      return <div className="px-2 py-3 text-sm text-[#7a736a]">Nessun articolo selezionato</div>;
    }

    return (
      <div className="space-y-2">
        {([...groupedItems, ...(serviceItems.length > 0 ? [{ course: "SERVIZI", items: serviceItems }] : [])] as Array<{
          course: string;
          items: OrderItem[];
        }>).map((group) => (
          <section key={`palmare-live-${group.course}`} className="space-y-1.5">
            <div className="rounded-[8px] border border-[#e2ddd3] bg-[#f7f3eb] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-[#4e473f]">
              {group.course}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const itemQuantities = getItemDisplayQuantities(item);
                const hasPendingQuantity = itemQuantities.pending > 0;
                const hasSentQuantity = itemQuantities.sent > 0;
                const lineNotes = [
                  item.note?.trim(),
                  item.additions?.length ? `+ ${item.additions.join(", ")}` : "",
                  item.removals?.length ? `- ${item.removals.join(", ")}` : "",
                ].filter(Boolean);

                return (
                  <div
                    key={`palmare-live-item-${item.id}`}
                    className="rounded-[8px] border border-[#ece6da] bg-white px-2 py-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-[#2e2a25]">
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-[#6a645b]">
                          <span className="font-semibold">{`${item.quantity}x`}</span>
                          {item.commensaleCode ? (
                            <span className="rounded-[999px] border border-[#b9d3ee] bg-[#e8f2fd] px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-[#24557e]">
                              {item.commensaleCode}
                            </span>
                          ) : null}
                          {hasSentQuantity ? <span>{`${itemQuantities.sent} inviati`}</span> : null}
                          {hasPendingQuantity ? (
                            <span className="font-semibold text-[#24557e]">{`+${itemQuantities.pending} da inviare`}</span>
                          ) : null}
                        </div>
                        {lineNotes.length > 0 ? (
                          <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-[#5f5950]">
                            {lineNotes.map((entry, index) => (
                              <div key={`${item.id}-note-${index}`}>{entry}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-[11px] font-bold text-[#433d36]">
                        {formatEuro(item.unitPrice * item.quantity)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  function renderPalmareDetailContent() {
    return (
    <div className="space-y-3 rounded-[12px] border border-[#d8d5cc] bg-white p-3">
      <div className="text-xs font-semibold uppercase text-[#5d564e]">Dettaglio tavolo</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Sala</div>
          <input
            value={currentTableRoom}
            readOnly
            className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
          />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Operatore</div>
          <input
            value={currentOperator}
            readOnly
            className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Cliente</div>
          <input
            value={preOrderCustomer}
            readOnly
            className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
          />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Azienda</div>
          <input
            value={preOrderCompany}
            readOnly
            className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
          />
        </label>
      </div>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Tavolo</div>
        <input
          value={detailName}
          onChange={(event) => setDetailName(event.target.value)}
          className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Prezzo coperto</div>
          <select
            value={preOrderServicePrice}
            onChange={(event) => setPreOrderServicePrice(event.target.value)}
            className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
          >
            {servicePriceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Coperti</div>
          <select
            value={detailGuests}
            onChange={(event) => setDetailGuests(event.target.value)}
            className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
          >
            {Array.from({ length: 9 }, (_, index) => index).map((guestCount) => (
              <option key={guestCount} value={guestCount}>
                {guestCount}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Note ordine</div>
        <textarea
          value={detailNote}
          onChange={(event) => setDetailNote(event.target.value)}
          className="min-h-[140px] w-full rounded-[10px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
        />
      </label>
    </div>
    );
  }

  function renderPalmarePaymentContent() {
    return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-[#d8d5cc] pb-2 text-sm font-semibold uppercase text-[#5d564e]">
        Riepilogo pagamento
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-hidden">{renderPaymentSummaryPanel()}</div>
      {renderPaymentCalculatorPanel()}
    </div>
    );
  }

  function renderPalmareBottomBar() {
    const palmareStatusVariant = statusMessage
      ? /non riuscita|errore|permesso|impossibile/i.test(statusMessage)
        ? "error"
        : /inviata|stampata|registrata|salvate|salvato/i.test(statusMessage)
          ? "success"
          : "info"
      : null;

    return panelMode === "payment" ? null : (
      <div>
        {statusMessage ? (
          <div
            className={[
              "mb-1.5 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold uppercase",
              palmareStatusVariant === "error"
                ? "border border-[#e1b3b3] bg-[#fff0f0] text-[#8a3434]"
                : palmareStatusVariant === "success"
                  ? "border border-[#b9d8b9] bg-[#eef9ef] text-[#2f6c2f]"
                  : "border border-[#d7cfbf] bg-[#fff7de] text-[#7b5b12]",
            ].join(" ")}
          >
            {statusMessage}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <div
            className={[
              "grid gap-2",
              panelMode === "draft" || panelMode === "edit-order"
                ? "grid-cols-3"
                : "grid-cols-2",
            ].join(" ")}
          >
          {panelMode === "draft" ? (
            <button
              type="button"
              onClick={() => router.push(returnHomePath)}
              className="min-h-[44px] rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-xs font-semibold text-[#2e2a25]"
            >
              Annulla comanda
            </button>
          ) : panelMode === "edit-order" ? (
            <button
              type="button"
              onClick={() => {
                handleCancelChanges();
                handleOpenSentSummary();
              }}
              className="min-h-[44px] rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-xs font-semibold text-[#2e2a25]"
            >
              Annulla modifiche
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPalmareSheetTab("summary");
                setIsPalmareSummaryOpen(true);
              }}
              className="min-h-[44px] rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-xs font-semibold text-[#2e2a25]"
            >
              Riepilogo
            </button>
          )}
          {panelMode === "draft" || panelMode === "edit-order" ? (
            <button
              type="button"
              onClick={() => {
                setPalmareSheetTab("summary");
                setIsPalmareSummaryOpen(true);
              }}
              className="min-h-[44px] rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-xs font-semibold text-[#2e2a25]"
            >
              Riepilogo tavolo
            </button>
          ) : null}
          {panelMode === "draft" || panelMode === "edit-order" ? (
            <button
              type="button"
              onClick={() => void handleSendOrder()}
              disabled={!hasPendingOrderItems || !canSendOrders || isSendingOrder}
              className="min-h-[44px] rounded-[8px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-xs font-bold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingOrder
                ? "Invio..."
                : hasPendingOrderItems
                  ? "Invia comanda"
                  : "Nessuna nuova comanda"}
            </button>
          ) : panelMode === "detail" ? (
            <button
              type="button"
              onClick={handleSaveDetail}
              disabled={!canEditTables}
              className="min-h-[44px] rounded-[8px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-xs font-bold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Salva dettaglio
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenSentEdit}
              disabled={!canEditOrders}
              className="min-h-[44px] rounded-[8px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-xs font-bold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Modifica ordine
            </button>
          )}
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    console.log("OPEN TABLE", currentTable?.id ?? tableId, currentTableStatus, panelMode);
    console.log("SELECTED ROUTE", `/order/${tableId}`);
    console.log("SELECTED TABLE", currentTable ?? null);
    console.log("ORDER ITEMS", orderItems.length);
    console.log(
      "COURSES DATA",
      groupedItems.map((group) => ({
        course: group.course,
        count: group.items.length,
      }))
    );
  }, [currentTable, currentTableStatus, groupedItems, orderItems.length, panelMode, tableId]);

  useEffect(() => {
    if (!quantityPickerOverlay) {
      return;
    }

    const handleCloseQuantityPicker = () => {
      setQuantityPickerOverlay(null);
    };

    window.addEventListener("resize", handleCloseQuantityPicker);
    window.addEventListener("scroll", handleCloseQuantityPicker, true);

    return () => {
      window.removeEventListener("resize", handleCloseQuantityPicker);
      window.removeEventListener("scroll", handleCloseQuantityPicker, true);
    };
  }, [quantityPickerOverlay]);

  useEffect(() => {
    if (!sizeSelectorOverlay) {
      return;
    }

    const handleCloseSizeSelector = () => {
      setSizeSelectorOverlay(null);
    };

    window.addEventListener("resize", handleCloseSizeSelector);
    window.addEventListener("scroll", handleCloseSizeSelector, true);

    return () => {
      window.removeEventListener("resize", handleCloseSizeSelector);
      window.removeEventListener("scroll", handleCloseSizeSelector, true);
    };
  }, [sizeSelectorOverlay]);

  const addProductToOrder = (
    product: Product,
    event?: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (!canInsertProducts) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!isEditingMode || activeMode === "RIEPILOGO") {
      setStatusMessage("Seleziona una portata per inserire i prodotti");
      return;
    }

    if (product.pricePending) {
      setStatusMessage("Prezzo da definire: completa il prodotto da Impostazioni > Prodotti");
      return;
    }

    if (product.sizeVariants?.length) {
      if (uramakiSelectorCategories.has(product.category) && event) {
        const rect = event.currentTarget.getBoundingClientRect();
        const selectorWidth = 156;
        const selectorHeight = 92;
        const spacing = 8;
        const canOpenRight = rect.right + selectorWidth + spacing <= window.innerWidth - 8;
        const nextLeft = canOpenRight
          ? rect.right + spacing
          : Math.max(8, rect.left - selectorWidth - spacing);
        const nextTop = Math.min(
          Math.max(8, rect.top),
          Math.max(8, window.innerHeight - selectorHeight - 8)
        );

        setSizeSelectorOverlay({
          product,
          left: nextLeft,
          top: nextTop,
        });
        setPendingSizeProduct(null);
      } else {
        setPendingSizeProduct(product);
      }
      setPendingTartareProduct(null);
      setPastoPricingProduct(null);
      setStatusMessage("");
      return;
    }

    if (tartareChoiceMap[product.id]) {
      setPendingTartareProduct(product);
      setPendingSizeProduct(null);
      setPastoPricingProduct(null);
      setStatusMessage("");
      return;
    }

    if (product.id === "pasto") {
      setPastoPricingProduct(product);
      setPastoCustomPrice("");
      setPendingSizeProduct(null);
      setPendingTartareProduct(null);
      setStatusMessage("");
      return;
    }

    if (product.id === "wagyu-tataki") {
      setWagyuPricingProduct(product);
      setWagyuPriceMode("per-kg");
      setWagyuPricePerKg("");
      setWagyuWeight("");
      setWagyuManualPrice("");
      setStatusMessage("");
      return;
    }

    if (product.id === "poke-medium" || product.id === "poke-large") {
      setConfiguringPoke(product);
      setStatusMessage("");
      return;
    }

    safeSetOrderLines((currentItems) => {
      const existingItem = findIncrementTargetItem(
        currentItems,
        (item) =>
          item.productId === product.id &&
          item.course === activeMode &&
          !item.commensaleCode &&
          !hasItemCustomizations(item)
      );

      const nextItems = !existingItem
        ? [...currentItems, buildOrderItem(product, currentActor, activeMode)]
        : currentItems.map((item) =>
          item.id === existingItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );

      devOrderLog("Aggiunta prodotto al draft ordine", {
        tableId,
        productId: product.id,
        productName: product.name,
        course: activeMode,
        previousCount: currentItems.length,
        nextCount: nextItems.length,
        nextRealItemsCount: nextItems.filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID).length,
      });

      return nextItems;
    }, "ADD_PRODUCT", { productId: product.id, course: activeMode });
    setStatusMessage("");
  };

  const handleAddTartareVariant = (
    product: Product,
    variant: { id: "naturale" | "condita"; label: TartareChoice; price: number }
  ) => {
    if (!canInsertProducts) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!isEditingMode || activeMode === "RIEPILOGO") {
      setStatusMessage("Seleziona una portata per inserire i prodotti");
      return;
    }

    safeSetOrderLines((currentItems) => {
      const variantProductId = `${product.id}-${variant.id}`;
      const existingItem = findIncrementTargetItem(
        currentItems,
        (item) =>
          item.productId === variantProductId &&
          item.course === activeMode &&
          !item.commensaleCode &&
          !hasItemCustomizations(item)
      );

      if (!existingItem) {
        const now = new Date().toISOString();
        return [
          ...currentItems,
          {
            id: buildOrderItemId(variantProductId),
            productId: variantProductId,
            name: `${product.name} - ${variant.label}`,
            quantity: 1,
            commensaleCode: null,
            sentQuantity: 0,
              unitPrice: variant.price,
              originalUnitPrice: variant.price,
              course: activeMode,
              status: "draft",
              paymentState: "unpaid",
              operatorLabel: currentActor.operatorName,
              operatorId: currentActor.operatorId,
              orderId: `${variantProductId}-${activeMode.toLowerCase().replace(/\s+/g, "-")}`,
              createdAt: now,
              updatedAt: now,
              createdByOperatorId: currentActor.operatorId,
              updatedByOperatorId: currentActor.operatorId,
              ...buildVatSnapshot(product.vatRateKey),
            },
          ];
      }

      return currentItems.map((item) =>
        item.id === existingItem.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    }, "ADD_TARTARE_VARIANT", { productId: product.id, variantId: variant.id, course: activeMode });

    setPendingTartareProduct(null);
    setStatusMessage(`${product.name} aggiunto`);
  };

  const resetPastoPricing = () => {
    setPastoPricingProduct(null);
    setPastoCustomPrice("");
  };

  const handleAddPasto = () => {
    if (!canInsertProducts) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!pastoPricingProduct || !isEditingMode || activeMode === "RIEPILOGO") {
      return;
    }

    const nextUnitPrice = Number.parseFloat(pastoCustomPrice.replace(",", "."));

    if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) {
      setStatusMessage("Inserisci un prezzo valido per Pasto");
      return;
    }

    safeSetOrderLines((currentItems) => [
      ...currentItems,
      {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: `${pastoPricingProduct.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: `pasto-${Date.now()}`,
        name: pastoPricingProduct.name,
        quantity: 1,
        commensaleCode: null,
        sentQuantity: 0,
        unitPrice: Number(nextUnitPrice.toFixed(2)),
        originalUnitPrice: pastoPricingProduct.price,
        course: activeMode,
        status: "draft",
        paymentState: "unpaid",
        operatorLabel: currentActor.operatorName,
        operatorId: currentActor.operatorId,
        orderId: `pasto-${activeMode.toLowerCase().replace(/\s+/g, "-")}`,
        createdByOperatorId: currentActor.operatorId,
        updatedByOperatorId: currentActor.operatorId,
        ...buildVatSnapshot(pastoPricingProduct.vatRateKey),
      },
    ], "ADD_PASTO", { productId: pastoPricingProduct.id, course: activeMode });

    resetPastoPricing();
    setStatusMessage("Pasto aggiunto");
  };

  const handleAddSizedProduct = (
    product: Product,
    sizeVariant: NonNullable<Product["sizeVariants"]>[number]
  ) => {
    if (!canInsertProducts) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!isEditingMode || activeMode === "RIEPILOGO") {
      setStatusMessage("Seleziona una portata per inserire i prodotti");
      return;
    }

    safeSetOrderLines((currentItems) => {
      const existingItem = findIncrementTargetItem(
        currentItems,
        (item) =>
          item.productId === `${product.id}-${sizeVariant.id}` &&
          item.course === activeMode &&
          !item.commensaleCode &&
          !hasItemCustomizations(item)
      );

      if (!existingItem) {
        return [...currentItems, buildSizedOrderItem(product, currentActor, activeMode, sizeVariant)];
      }

      return currentItems.map((item) =>
        item.id === existingItem.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    }, "ADD_SIZED_PRODUCT", { productId: product.id, variantId: sizeVariant.id, course: activeMode });

    setPendingSizeProduct(null);
    setSizeSelectorOverlay(null);
    setStatusMessage(`${product.name} aggiunto`);
  };

  const resetWagyuPricing = () => {
    setWagyuPricingProduct(null);
    setWagyuPriceMode("per-kg");
    setWagyuPricePerKg("");
    setWagyuWeight("");
    setWagyuManualPrice("");
  };

  const handleAddWagyuTataki = () => {
    if (!canInsertProducts) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!wagyuPricingProduct || !isEditingMode || activeMode === "RIEPILOGO") {
      setStatusMessage("Seleziona una portata per inserire i prodotti");
      return;
    }

    const nextUnitPrice = Number(wagyuCalculatedPrice.toFixed(2));

    if (nextUnitPrice <= 0) {
      setStatusMessage("Inserisci un prezzo valido per Wagyu Tataki");
      return;
    }

    const pricingNote =
      wagyuPriceMode === "per-kg"
        ? `Prezzo al chilo: ${formatEuro(Number.parseFloat(wagyuPricePerKg) || 0)} x ${Number.parseFloat(wagyuWeight) || 0} kg`
        : "Prezzo manuale";

    safeSetOrderLines((currentItems) => [
      ...currentItems,
      {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: `${wagyuPricingProduct.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: wagyuPricingProduct.id,
        name: wagyuPricingProduct.name,
        quantity: 1,
        commensaleCode: null,
        sentQuantity: 0,
        unitPrice: nextUnitPrice,
        originalUnitPrice: wagyuPricingProduct.price,
        course: activeMode,
        status: "draft",
        paymentState: "unpaid",
        note: pricingNote,
        operatorLabel: currentActor.operatorName,
        operatorId: currentActor.operatorId,
        orderId: `wagyu-tataki-${activeMode.toLowerCase().replace(/\s+/g, "-")}`,
        createdByOperatorId: currentActor.operatorId,
        updatedByOperatorId: currentActor.operatorId,
        ...buildVatSnapshot(wagyuPricingProduct.vatRateKey),
      },
    ], "ADD_WAGYU", { productId: wagyuPricingProduct.id, course: activeMode });

    resetWagyuPricing();
    setStatusMessage("Wagyu Tataki aggiunto");
  };

  const handleAddConfiguredPoke = (payload: {
    name: string;
    unitPrice: number;
    note: string;
  }) => {
    if (!canInsertProducts) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!isEditingMode || activeMode === "RIEPILOGO") {
      setStatusMessage("Seleziona una portata per inserire i prodotti");
      return;
    }

    safeSetOrderLines((currentItems) => [
      ...currentItems,
      {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: `poke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: configuringPoke?.id ?? "poke-custom",
        name: payload.name,
        quantity: 1,
        commensaleCode: null,
        sentQuantity: 0,
        unitPrice: payload.unitPrice,
        course: activeMode,
        status: "draft",
        paymentState: "unpaid",
        note: payload.note,
        operatorLabel: currentActor.operatorName,
        operatorId: currentActor.operatorId,
        orderId: `poke-${activeMode.toLowerCase().replace(/\s+/g, "-")}`,
        createdByOperatorId: currentActor.operatorId,
        updatedByOperatorId: currentActor.operatorId,
        ...buildVatSnapshot(configuringPoke?.vatRateKey),
      },
    ], "ADD_CONFIGURED_POKE", { productId: configuringPoke?.id ?? "poke-custom", course: activeMode });
    setConfiguringPoke(null);
    setStatusMessage("Poke aggiunta alla portata");
  };

  const handleGuestChange = (guestValue: string) => {
    const guests = Number(guestValue);
    updateTable(tableId, { guests });
  };

  const handleOpenDetailPicker = (mode: DetailPickerMode) => {
    if (
      (mode === "customer" && !canAssignCustomer) ||
      (mode === "company" && !canAssignCompany)
    ) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    setDetailPickerMode(mode);
    setDetailPickerSearch("");
  };

  const handleCloseDetailPicker = () => {
    setDetailPickerMode(null);
    setDetailPickerSearch("");
  };

  const openDetailEditor = (mode: DetailEditorMode) => {
    if (!canManageCustomersBilling) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    setDetailEditorMode(mode);

    if (mode === "customer") {
      setCustomerDraft({
        id: `customer-${Date.now()}`,
        name: "",
        taxCode: "",
        phone: "",
        email: "",
        note: "",
      });
      return;
    }

    if (mode === "company") {
      setCompanyDraft(createEmptyCompanyRecord());
      setCompanyLookupError("");
      setCompanyLookupMessage("");
      setCompanyLookupLoading(false);
    }
  };

  const closeDetailEditor = () => {
    setDetailEditorMode(null);
    setCompanyLookupError("");
    setCompanyLookupMessage("");
    setCompanyLookupLoading(false);
  };

  const handleLookupCompanyDraft = async () => {
    setCompanyLookupLoading(true);
    setCompanyLookupError("");
    setCompanyLookupMessage("");

    const result = await lookupCompanyByVatNumber(companyDraft.vatNumber, companies);
    setCompanyLookupLoading(false);

    if (!result.ok) {
      setCompanyLookupError(result.message);
      setStatusMessage(result.message);
      return;
    }

    setCompanyDraft((currentDraft) =>
      normalizeCompanyRecord({
        ...currentDraft,
        name: result.data.companyName || currentDraft.name,
        vatNumber: result.data.vatNumber || currentDraft.vatNumber,
        taxCode: result.data.taxCode || currentDraft.taxCode,
        sdiCode: result.data.sdiCode || currentDraft.sdiCode,
        pec: result.data.pec || currentDraft.pec,
        addressStreet: result.data.addressStreet || currentDraft.addressStreet,
        addressNumber: result.data.addressNumber || currentDraft.addressNumber,
        postalCode: result.data.postalCode || currentDraft.postalCode,
        city: result.data.city || currentDraft.city,
        province: result.data.province || currentDraft.province,
        country: result.data.country || currentDraft.country,
        phone: result.data.phone || currentDraft.phone,
        email: result.data.email || currentDraft.email,
        contactPerson: result.data.contactPerson || currentDraft.contactPerson,
        note: result.data.note || currentDraft.note,
        isActive: result.data.isActive ?? currentDraft.isActive,
      })
    );
    setCompanyLookupMessage(result.message || "Dati azienda recuperati.");
    setStatusMessage(result.message || "Dati azienda recuperati.");
  };

  const updateCompanyDraftField = <Key extends keyof CompanyRecord>(
    field: Key,
    value: CompanyRecord[Key]
  ) => {
    setCompanyLookupError("");
    setCompanyLookupMessage("");
    setCompanyDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSelectCustomer = (customer: CustomerRecord) => {
    setPreOrderCustomer(customer.name);
    updateTable(tableId, { customerName: customer.name });
    handleCloseDetailPicker();
  };

  const handleSelectCompany = (company: CompanyRecord) => {
    setPreOrderCompany(company.name);
    updateTable(tableId, { companyName: company.name });
    handleCloseDetailPicker();
  };

  const handleClearDetailSelection = (mode: DetailPickerMode) => {
    if (mode === "customer") {
      setPreOrderCustomer("");
      updateTable(tableId, { customerName: "" });
      handleCloseDetailPicker();
      return;
    }

    if (mode === "company") {
      setPreOrderCompany("");
      updateTable(tableId, { companyName: "" });
      handleCloseDetailPicker();
    }
  };

  const handleSaveCustomerDraft = () => {
    if (!canManageCustomersBilling) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    const trimmedName = customerDraft.name.trim();
    const trimmedTaxCode = customerDraft.taxCode.trim();

    if (!trimmedName || !trimmedTaxCode) {
      setStatusMessage("Inserisci nome e codice fiscale del cliente");
      return;
    }

    const nextCustomers = saveCustomers([
      ...customers,
      {
        ...customerDraft,
        id: customerDraft.id || `customer-${slugify(trimmedName) || Date.now().toString()}`,
        name: trimmedName,
        taxCode: trimmedTaxCode,
        phone: customerDraft.phone?.trim() ?? "",
        email: customerDraft.email?.trim() ?? "",
        note: customerDraft.note?.trim() ?? "",
      },
    ]);

    setCustomers(nextCustomers);
    void persistBusinessDirectoryToServer(nextCustomers, companies).then((directory) => {
      setCustomers(directory.customers);
      setCompanies(directory.companies);
    });
    const createdCustomer = nextCustomers[nextCustomers.length - 1];
    setPreOrderCustomer(createdCustomer.name);
    updateTable(tableId, { customerName: createdCustomer.name });
    setStatusMessage("Cliente salvato");
    closeDetailEditor();
    handleCloseDetailPicker();
  };

  const handleSaveCompanyDraft = () => {
    if (!canManageCustomersBilling) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    const trimmedName = companyDraft.name.trim();
    const trimmedVatNumber = companyDraft.vatNumber.trim();

    if (!trimmedName || !trimmedVatNumber) {
      setStatusMessage("Inserisci ragione sociale e partita IVA dell'azienda");
      return;
    }

    const nextCompanies = saveCompanies([
      ...companies,
      {
        ...normalizeCompanyRecord(companyDraft),
        id: companyDraft.id || `company-${slugify(trimmedName) || Date.now().toString()}`,
        name: trimmedName,
        vatNumber: trimmedVatNumber,
      },
    ]);

    setCompanies(nextCompanies);
    void persistBusinessDirectoryToServer(customers, nextCompanies).then((directory) => {
      setCustomers(directory.customers);
      setCompanies(directory.companies);
    });
    const createdCompany = nextCompanies[nextCompanies.length - 1];
    setPreOrderCompany(createdCompany.name);
    updateTable(tableId, { companyName: createdCompany.name });
    setStatusMessage("Azienda salvata");
    closeDetailEditor();
    handleCloseDetailPicker();
  };

  const handleCancelPreOrderDetail = () => {
    setIsFinalizingPayment(false);
    resetEmptyTableState(
      currentTable
        ? {
            ...currentTable,
            orders: orderItems,
          }
        : undefined,
      { clearLocalDraft: false }
    );
    setIsPreOrderDetailOpen(false);
    router.push(returnHomePath);
  };

  const handleContinuePreOrderDetail = () => {
    setIsFinalizingPayment(false);
    if (!canEditTables) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    updateTable(tableId, {
      customerName: preOrderCustomer,
      companyName: preOrderCompany,
      operator: preOrderOperator,
      servicePriceLabel: preOrderServicePrice,
      guests: Number(preOrderGuests),
      note: preOrderNote,
    });
    setDetailGuests(preOrderGuests);
    setDetailNote(preOrderNote);
    setStatusMessage("Dettaglio tavolo salvato");
    setIsPreOrderDetailOpen(false);
  };

  const handleResetEmptyTable = () => {
    if (!currentTable || !canResetEmptyTable) {
      return;
    }

    setIsFinalizingPayment(false);
    resetEmptyTableState(
      {
        ...currentTable,
        orders: orderItems,
      },
      { clearLocalDraft: true }
    );
    setIsPreOrderDetailOpen(false);
    setActiveMode("RIEPILOGO");
    setPanelMode("draft");
    setStatusMessage("Tavolo svuotato");
    router.push(returnHomePath);
  };

  const handleSendOrder = async () => {
    snapshotOrderState("SEND_ORDER_CLICK", {
      hasPendingOrderItems,
    });
    setIsFinalizingPayment(false);
    if (!canSendOrders) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (isSendingOrder) {
      return;
    }

    const pendingPrintItems: Array<{
      id: string;
      productId: string;
      name: string;
      quantity: number;
      commensaleCode?: string | null;
      course: CourseGroup;
      note?: string;
    }> = [];

    orderItems
      .filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID)
      .forEach((item) => {
        const sentQuantity = item.sentQuantity ?? 0;
        const queuedQuantity = item.queuedQuantity ?? 0;
        const pendingQuantity = Math.max(item.quantity - Math.max(sentQuantity, queuedQuantity), 0);

        if (pendingQuantity <= 0) {
          return;
        }

        pendingPrintItems.push({
          id: item.id,
          productId: item.productId,
          name: item.name,
          quantity: pendingQuantity,
          commensaleCode: item.commensaleCode ?? null,
          course: item.course,
          note: item.note,
        });
      });

    if (pendingPrintItems.length === 0) {
      if (isPalmareMode) {
        console.info("[PALMARE][SEND_ORDER] Nessuna riga nuova da stampare", {
          tableId,
          deviceMode,
          orderItemsCount: orderItems.length,
          pendingPrintItemsCount: 0,
        });
      }
      setStatusMessage("Nessuna nuova aggiunta da inviare");
      return;
    }

    setIsSendingOrder(true);
    setStatusMessage(isPalmareMode ? "Invio comanda in corso..." : "Invio in corso...");

    if (isPalmareMode) {
      console.info("[PALMARE][SEND_ORDER] Click Invio comanda", {
        tableId,
        deviceMode,
        tableLabel: currentTableName,
        roomLabel: currentTableRoom,
        operator: currentOperator || preOrderOperator || "Admin",
        orderItemsCount: orderItems.length,
        pendingPrintItemsCount: pendingPrintItems.length,
        pendingPrintItems,
      });
    }

    updateTable(tableId, {
      status: "occupied",
      paymentStatus: "idle",
    });

    try {
      const dispatchedJobs = await new PrintJobService().dispatchOrderPrintJobs({
        tableId,
        tableLabel:
          currentTable?.saleMode === "Take Away" ? `Takeaway ${currentTableName}` : `Tavolo ${currentTableName}`,
        roomLabel: currentTableRoom,
        operator: currentOperator || preOrderOperator || "Admin",
        operatorId: currentActor.operatorId ?? null,
        deviceMode,
        guests: currentTable?.guests ?? Number(preOrderGuests || 0),
        customerLabel: currentTable?.customerName || preOrderCustomer || "",
        companyLabel: currentTable?.companyName || preOrderCompany || "",
        items: pendingPrintItems,
        products: productsCatalog,
      });

      if (isPalmareMode) {
        console.info("[PALMARE][SEND_ORDER] Risultato dispatch stampa", {
          tableId,
          deviceMode,
          printerJobsCount: dispatchedJobs.length,
          printerJobs: dispatchedJobs.map((job) => ({
            id: job.id,
            printerName: job.printerName,
            printerRole: job.printerRole,
            status: job.status,
            errorMessage: job.errorMessage ?? "",
            itemsCount: job.items.length,
          })),
        });
      }

      const dispatchedPrinters = Array.from(
        new Set(dispatchedJobs.map((job) => job.printerName).filter(Boolean))
      );
      const successfulPrints = dispatchedJobs.filter(
        (job) => job.status === "sent" || job.status === "simulated"
      );
      const acceptedPrints = dispatchedJobs.filter((job) => job.status !== "failed");
      const failedPrints = dispatchedJobs.filter((job) => job.status === "failed");
      const printedItemIds = new Set(
        successfulPrints.flatMap((job) => job.items.map((item) => item.id))
      );
      const acceptedItemIds = new Set(
        acceptedPrints.flatMap((job) => job.items.map((item) => item.id))
      );
      const latestAcceptedJobIdByItemId = new Map<string, string>();
      acceptedPrints.forEach((job) => {
        job.items.forEach((item) => {
          latestAcceptedJobIdByItemId.set(item.id, job.id);
        });
      });
      const allPendingPrinted =
        pendingPrintItems.length > 0 &&
        pendingPrintItems.every((item) => printedItemIds.has(item.id));

      const nextItems = orderItems.map((item) => {
        if (item.productId === AUTO_COVER_PRODUCT_ID) {
          return item;
        }

        const previousSentQuantity = item.sentQuantity ?? 0;
        const previousQueuedQuantity = item.queuedQuantity ?? 0;
        const wasPendingForPrint = pendingPrintItems.some((pendingItem) => pendingItem.id === item.id);

        if (printedItemIds.has(item.id)) {
          return {
            ...item,
            status: "sent" as const,
            sentQuantity: item.quantity,
            queuedQuantity: 0,
            printStatus: "sent" as const,
            lastPrintJobId: latestAcceptedJobIdByItemId.get(item.id) ?? item.lastPrintJobId ?? null,
            sentToKitchenAt: new Date().toISOString(),
          };
        }

        if (!wasPendingForPrint) {
          return item.status === "sent" || previousSentQuantity > 0
            ? {
                ...item,
                status: "sent" as const,
                sentQuantity: previousSentQuantity,
                queuedQuantity: previousQueuedQuantity,
              }
            : item;
        }

        if (acceptedItemIds.has(item.id)) {
          return {
            ...item,
            status: previousSentQuantity > 0 ? ("sent" as const) : ("draft" as const),
            sentQuantity: previousSentQuantity,
            queuedQuantity: item.quantity,
            printStatus: "queued" as const,
            lastPrintJobId: latestAcceptedJobIdByItemId.get(item.id) ?? item.lastPrintJobId ?? null,
          };
        }

        return {
          ...item,
          status: previousSentQuantity > 0 ? ("sent" as const) : ("draft" as const),
          sentQuantity: previousSentQuantity,
          queuedQuantity: previousQueuedQuantity,
          printStatus: previousSentQuantity > 0 ? ("sent" as const) : ("pending" as const),
        };
      });

      safeSetOrderLines(nextItems, "SEND_ORDER_RESULT", {
        acceptedPrints: acceptedPrints.length,
        failedPrints: failedPrints.length,
      });
      setSavedOrderItems(nextItems);
      updateTable(tableId, {
        status: nextItems.some((item) => item.status === "sent") ? "occupied" : (currentTable?.status ?? "occupied"),
        paymentStatus: "idle",
      });

      if (dispatchedPrinters.some((printer) => printer.toLowerCase().includes("bar"))) {
        recordAuditEvent({
          eventType: "ORDER_SENT_TO_BAR",
          entityType: "order",
          entityId: tableId,
          tableId,
          nextValue: pendingPrintItems,
          origin: "printing",
        });
      }

      if (
        dispatchedPrinters.some(
          (printer) =>
            printer.toLowerCase().includes("cucina") || printer.toLowerCase().includes("sushi")
        )
      ) {
        recordAuditEvent({
          eventType: "ORDER_SENT_TO_KITCHEN",
          entityType: "order",
          entityId: tableId,
          tableId,
          nextValue: pendingPrintItems,
          origin: "printing",
        });
      }

      if (allPendingPrinted) {
        setActiveMode("RIEPILOGO");
        setPanelMode("sent-summary");
      }

      setStatusMessage(
        failedPrints.length > 0
          ? successfulPrints.length > 0
            ? `Comanda salvata. Stampa riuscita su ${successfulPrints
                .map((job) => job.printerName)
                .filter(Boolean)
                .join(", ")}, ma con errori su ${failedPrints
                .map((job) => job.printerName)
                .filter(Boolean)
                .join(", ")}. Le righe non stampate restano da inviare.`
            : `Comanda salvata ma stampa non riuscita: ${failedPrints
                .map((job) => job.errorMessage || `errore ${job.printerName}`)
                .join(" · ")}`
          : acceptedPrints.some((job) => job.status === "pending")
            ? "Comanda salvata. Stampa in coda: bridge locale non connesso oppure in attesa."
          : dispatchedPrinters.length > 0
            ? `Comanda inviata e stampata su ${dispatchedPrinters.join(", ")}`
            : "Comanda registrata senza stampante configurata"
      );
    } catch (error) {
      if (isPalmareMode) {
        console.error("[PALMARE][SEND_ORDER] Errore durante dispatch stampa", {
          tableId,
          deviceMode,
          orderItemsCount: orderItems.length,
          pendingPrintItemsCount: pendingPrintItems.length,
          pendingPrintItems,
          error,
        });
      }

      setSavedOrderItems(orderItems);
      setStatusMessage(
        `Comanda salvata ma stampa non riuscita: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`
      );
    } finally {
      setIsSendingOrder(false);
    }
  };

  const handleSaveChanges = () => {
    snapshotOrderState("SAVE_CHANGES_CLICK", {
      hasUnsavedChanges,
    });
    if (!canSaveOrderChanges) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    const hasPayableOrder = persistOrderWithoutSending("save");
    setActiveMode("RIEPILOGO");
    setPanelMode(hasPayableOrder ? "sent-summary" : "draft");
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setIsVoidSelectionMode(false);
    setSelectedVoidItemIds([]);
    setStatusMessage("Modifiche salvate senza invio comanda");
  };

  const handleCancelChanges = () => {
    if (savedOrderItems.length === 0) {
      intentionalOrderClearReasonRef.current = "user_cancel_confirmed";
      clearDraftOrderSnapshot("user_cancel_confirmed");
    } else {
      saveDraftOrderSnapshot(savedOrderItems);
    }
    safeSetOrderLines(
      savedOrderItems,
      savedOrderItems.length === 0 ? "CONFIRMED_CANCEL_ORDER" : "CANCEL_CHANGES_RESTORE",
      { savedOrderItemsCount: savedOrderItems.length }
    );
    setStatusMessage("Modifiche annullate");
  };

  const handleOpenSentSummary = () => {
    setActiveMode("RIEPILOGO");
    setPanelMode("sent-summary");
    setIsPaymentDefaults();
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setIsVoidSelectionMode(false);
    setSelectedVoidItemIds([]);
    setStatusMessage("");
  };

  const handleOpenSentEdit = () => {
    if (!canEditOrders) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    setPanelMode("edit-order");
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setIsVoidSelectionMode(false);
    setSelectedVoidItemIds([]);
    setStatusMessage("");
  };

  const handleOpenDetail = () => {
    if (!canEditTables) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    setDetailName(currentTableName);
    setDetailGuests(String(currentTableGuests));
    setDetailNote(currentTableNote);
    setPreOrderCustomer(currentTable?.customerName ?? "");
    setPreOrderCompany(currentTable?.companyName ?? "");
    setPreOrderOperator(getValidOperator(currentTable?.operator));
    setPreOrderServicePrice(getValidServicePrice(currentTable?.servicePriceLabel));
    setPanelMode("detail");
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setIsVoidSelectionMode(false);
    setSelectedVoidItemIds([]);
    setStatusMessage("");
  };

  const handleSaveDetail = () => {
    if (!canEditTables) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    updateTable(tableId, {
      name: detailName || currentTableName,
      customerName: preOrderCustomer,
      companyName: preOrderCompany,
      operator: preOrderOperator,
      servicePriceLabel: preOrderServicePrice,
      guests: Number(detailGuests),
      note: detailNote,
    });
    setStatusMessage("Dettaglio ordine salvato");
  };

  const setIsPaymentDefaults = () => {
    setPaymentMethod(null);
    setDocumentMode(null);
    setPaymentStep("calculator");
    setRomanSplitGuests("2");
    setIsQuickDiscountPanelOpen(false);
    setQuickDiscountValue("");
    setQuickDiscountMode("euro");
    setIsFidelityScannerOpen(false);
    setIsFidelityPanelOpen(false);
    setScannedFidelityCustomer(null);
    setFidelityPanelStep("choice");
    setSelectedSplitItemIds([]);
    setIsVoidSelectionMode(false);
    setSelectedVoidItemIds([]);
    setPendingVoidAction(null);
    setIsPrebillConfirmOpen(false);
  };

  const handleReturnToHomeAfterPayment = () => {
    setIsFinalizingPayment(true);
    intentionalOrderClearReasonRef.current = "payment_completed";
    clearDraftOrderSnapshot("payment_completed");
    setIsPreOrderDetailOpen(false);
    setSavedOrderItems([]);
    setDetailGuests("0");
    setDetailNote("");
    setPreOrderCustomer("");
    setPreOrderCompany("");
    setPreOrderOperator(getValidOperator(currentUser.displayName));
    setPreOrderServicePrice(getValidServicePrice(undefined));
    setPreOrderGuests("1");
    setPreOrderNote("");
    setActiveMode("RIEPILOGO");
    setPanelMode("draft");
    setIsPaymentDefaults();
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setStatusMessage("");
    router.replace(returnHomePath);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (window.location.pathname.startsWith("/order/")) {
          window.location.replace(returnHomePath);
        }
      }, 120);
    }
  };

  const handleOpenPayment = () => {
    snapshotOrderState("OPEN_PAYMENT_CLICK", {
      isOrderDirty,
    });
    setIsFinalizingPayment(false);
    if (!canAccessPayments) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!canOpenPayment) {
      return;
    }

    if (isDevelopment) {
      devPaymentLog("Click Pagamento", {
        tableId,
        panelMode,
        isOrderDirty,
        orderItemsCount: orderItems.length,
        total: orderTotal,
      });
    }

    if (isOrderDirty || panelMode === "draft" || panelMode === "edit-order") {
      persistOrderWithoutSending("payment");
    } else {
      updateTable(tableId, { status: "occupied", paymentStatus: "pending" });
    }

    setPaymentMethod(payableItems.length > 0 ? getPreferredDefaultPaymentMethod() : null);
    setDocumentMode("SCONTRINO");
    setPaymentStep("calculator");
    setRomanSplitGuests("2");
    setPaymentCalculatorValue("0");
    setPaymentCalculationBase("TOT");
    setPaymentAdjustments([]);
    setPaymentChangeDue(null);
    setIsQuickDiscountPanelOpen(false);
    setQuickDiscountValue("");
    setQuickDiscountMode("euro");
    setIsFidelityScannerOpen(false);
    setSelectedSplitItemIds([]);
    setActiveMode("RIEPILOGO");
    setPanelMode("payment");
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setStatusMessage("");

    if (isDevelopment) {
      devPaymentLog("Ingresso payment mode", {
        tableId,
        panelMode: "payment",
        paymentMethod: payableItems.length > 0 ? getPreferredDefaultPaymentMethod() : null,
        documentMode: "SCONTRINO",
      });
    }
  };

  const handleCancelPayment = () => {
    setIsFinalizingPayment(false);
    clearFidelitySelection({ keepCustomer: true, cancelReward: true });
    updateTable(tableId, { paymentStatus: "idle" });
    setPanelMode("sent-summary");
    setPaymentMethod(null);
    setDocumentMode(null);
    setPaymentStep("calculator");
    setRomanSplitGuests("2");
    setPaymentCalculatorValue("0");
    setPaymentCalculationBase("TOT");
    setPaymentAdjustments([]);
    setPaymentChangeDue(null);
    setIsQuickDiscountPanelOpen(false);
    setQuickDiscountValue("");
    setQuickDiscountMode("euro");
    setIsFidelityScannerOpen(false);
    setIsFidelityPanelOpen(false);
    setScannedFidelityCustomer(null);
    setFidelityPanelStep("choice");
    setSelectedSplitItemIds([]);
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setStatusMessage("");
  };

  useEffect(() => {
    if (panelMode !== "payment") {
      return;
    }

    devPaymentLog("Render pannello pagamento finale", {
      component: "FinalPaymentPanel",
      paymentStep,
      tableId,
      total: paymentAdjustedTotal,
    });
  }, [devPaymentLog, panelMode, paymentAdjustedTotal, paymentStep, tableId]);

  const resetPaymentAdjustments = () => {
    setPaymentAdjustments([]);
    setPaymentCalculatorValue("0");
    setPaymentChangeDue(null);
    setPaymentCalculationBase("TOT");
    setQuickDiscountValue("");
    setQuickDiscountMode("euro");
  };

  const syncQuickDiscountDraftFromApplied = () => {
    if (!appliedQuickDiscount) {
      setQuickDiscountValue("");
      setQuickDiscountMode("euro");
      return;
    }

    setQuickDiscountMode(
      appliedQuickDiscount.type === "percent-discount" ? "percent" : "euro"
    );
    setQuickDiscountValue(String(appliedQuickDiscount.inputValue));
  };

  const appendCalculatorValue = (nextChunk: string) => {
    if (!canEditPaymentCalculator) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    setPaymentCalculatorValue((currentValue) => {
      const baseValue = currentValue === "0" && nextChunk !== "." && nextChunk !== "00" ? "" : currentValue;

      if (nextChunk === ".") {
        return baseValue.includes(".") ? baseValue || "0" : `${baseValue || "0"}.`;
      }

      if (nextChunk === "00") {
        return `${baseValue === "0" ? "" : baseValue}00` || "0";
      }

      return `${baseValue}${nextChunk}` || "0";
    });
  };

  const getPaymentCalculatorNumericValue = () => {
    const parsedValue = Number.parseFloat(paymentCalculatorValue);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  };

  const applyPaymentAdjustmentWithValue = (
    type: PaymentAdjustmentType,
    numericValue: number,
    base: PaymentCalculationBase = paymentCalculationBase,
    options?: {
      scope?: PaymentAdjustment["scope"];
      replaceScope?: PaymentAdjustment["scope"];
      label?: string;
      statusMessage?: string;
    }
  ) => {
    if (
      (type === "fixed-discount" || type === "percent-discount") &&
      !hasPermission("canApplyDiscounts")
    ) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (type === "percent-surcharge" && !hasPermission("canApplySurcharges")) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (numericValue <= 0) {
      setStatusMessage("Inserisci un importo valido");
      return;
    }

    setPaymentAdjustments((currentAdjustments) => {
      const baseAdjustments = options?.replaceScope
        ? currentAdjustments.filter((adjustment) => adjustment.scope !== options.replaceScope)
        : currentAdjustments;
      const currentTotal = calculateAdjustedPaymentTotal(
        paymentBaseSubtotal,
        currentTable?.selectedRewardDiscount ?? 0,
        baseAdjustments
      );

      const sourceAmount = base === "SUB" ? paymentBaseAfterFidelityReward : currentTotal;
      const amount =
        type === "fixed-discount"
          ? Math.min(numericValue, sourceAmount)
          : roundCurrency(sourceAmount * (numericValue / 100));
      const resultTotal =
        type === "fixed-discount" || type === "percent-discount"
          ? clampCurrency(currentTotal - amount)
          : clampCurrency(currentTotal + amount);

      return [
        ...currentAdjustments,
        {
          id: `payment-adjustment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          base,
          inputValue: numericValue,
          amount: roundCurrency(amount),
          resultTotal,
          scope: options?.scope ?? "calculator",
          label: options?.label,
        },
      ];
    });

    setPaymentCalculatorValue("0");
    setPaymentChangeDue(null);
    recordAuditEvent({
      eventType:
        type === "percent-surcharge" ? "SURCHARGE_APPLIED" : "DISCOUNT_APPLIED",
      entityType: "payment",
      entityId: `${tableId}-payment-adjustment`,
      tableId,
      nextValue: {
        type,
        base,
        inputValue: numericValue,
      },
      origin: "payment",
    });
    setStatusMessage(options?.statusMessage ?? "Modifica economica applicata");
  };

  const applyPaymentAdjustment = (type: PaymentAdjustmentType) => {
    applyPaymentAdjustmentWithValue(type, getPaymentCalculatorNumericValue(), paymentCalculationBase);
    setPaymentCalculatorValue("0");
    setPaymentChangeDue(null);
  };

  const applyQuickDiscount = (type: "fixed-discount" | "percent-discount", value: number) => {
    setQuickDiscountMode(type === "percent-discount" ? "percent" : "euro");
    setQuickDiscountValue(String(value));
    setPaymentChangeDue(null);
  };

  const applyCustomQuickDiscount = () => {
    const numericValue = Number.parseFloat(quickDiscountValue);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setStatusMessage("Inserisci uno sconto valido");
      return;
    }

    applyPaymentAdjustmentWithValue(
      quickDiscountMode === "percent" ? "percent-discount" : "fixed-discount",
      numericValue,
      "TOT",
      {
        scope: "quick-discount",
        replaceScope: "quick-discount",
        label:
          quickDiscountMode === "percent"
            ? `Sconto ${numericValue}%`
            : `Sconto ${formatEuro(Math.min(numericValue, paymentBaseSubtotal))}`,
        statusMessage: "Sconto tavolo applicato",
      }
    );
    setIsQuickDiscountPanelOpen(false);
  };

  const handleCancelQuickDiscountPanel = () => {
    syncQuickDiscountDraftFromApplied();
    setIsQuickDiscountPanelOpen(false);
  };

  const handleResetQuickDiscount = () => {
    setPaymentAdjustments((currentAdjustments) =>
      currentAdjustments.filter((adjustment) => adjustment.scope !== "quick-discount")
    );
    setQuickDiscountValue("");
    setQuickDiscountMode("euro");
    setPaymentChangeDue(null);
    setStatusMessage("Sconto tavolo azzerato");
  };

  const handleLoadPaymentSubtotal = () => {
    if (!canEditPaymentCalculator) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    setPaymentCalculationBase("TOT");
    setPaymentCalculatorValue(String(roundCurrency(paymentBaseSubtotal)));
    setPaymentChangeDue(null);
    setStatusMessage("Subtotale caricato nel display");
  };

  const getPaymentAdjustmentsSummary = () =>
    paymentAdjustments
      .map((adjustment) => {
        if (adjustment.label) {
          return `${adjustment.label}: ${
            adjustment.type === "percent-surcharge" ? "+" : "-"
          }${formatEuro(adjustment.amount)}`;
        }

        if (adjustment.type === "fixed-discount") {
          return `Sconto fisso ${adjustment.base}: -${formatEuro(adjustment.amount)}`;
        }

        if (adjustment.type === "percent-discount") {
          return `Sconto ${adjustment.inputValue}% ${adjustment.base}: -${formatEuro(adjustment.amount)}`;
        }

        return `Maggiorazione ${adjustment.inputValue}% ${adjustment.base}: +${formatEuro(adjustment.amount)}`;
      })
      .join(" · ");

  const getDocumentDiscountSnapshot = () => {
    const totalDiscountFromAdjustments = paymentAdjustments.reduce((total, adjustment) => {
      if (adjustment.type === "percent-surcharge") {
        return total;
      }

      return total + adjustment.amount;
    }, 0);
    const rewardDiscount = currentTable?.selectedRewardDiscount ?? 0;
    const totalDiscountValue = roundCurrency(totalDiscountFromAdjustments + rewardDiscount);
    const percentDiscounts = paymentAdjustments.filter(
      (adjustment) => adjustment.type === "percent-discount"
    );
    const fixedDiscounts = paymentAdjustments.filter(
      (adjustment) => adjustment.type === "fixed-discount"
    );

    let discountType: "none" | "fixed" | "percent" | "fidelity" | "mixed" = "none";
    let discountPercentage: number | null = null;
    let discountFixedAmount: number | null = null;
    let discountLabel = "";

    if (rewardDiscount > 0 && percentDiscounts.length === 0 && fixedDiscounts.length === 0) {
      discountType = "fidelity";
      discountLabel = currentTable?.selectedRewardName
        ? `Premio fidelity ${currentTable.selectedRewardName}`
        : "Premio fidelity";
    } else if (rewardDiscount > 0 || (percentDiscounts.length > 0 && fixedDiscounts.length > 0)) {
      discountType = "mixed";
      discountLabel = "Sconto misto";
    } else if (percentDiscounts.length > 0) {
      discountType = percentDiscounts.length === 1 ? "percent" : "mixed";
      discountPercentage =
        percentDiscounts.length === 1 ? percentDiscounts[0].inputValue : null;
      discountLabel =
        percentDiscounts.length === 1
          ? `Sconto ${percentDiscounts[0].inputValue}%`
          : "Sconto percentuale multiplo";
    } else if (fixedDiscounts.length > 0) {
      discountType = fixedDiscounts.length === 1 ? "fixed" : "mixed";
      discountFixedAmount =
        fixedDiscounts.length === 1 ? fixedDiscounts[0].amount : totalDiscountFromAdjustments;
      discountLabel =
        fixedDiscounts.length === 1
          ? `Sconto fisso ${formatEuro(fixedDiscounts[0].amount)}`
          : "Sconto fisso multiplo";
    }

    if (rewardDiscount > 0 && fixedDiscounts.length === 0 && percentDiscounts.length === 0) {
      discountFixedAmount = rewardDiscount;
    } else if (fixedDiscounts.length > 0) {
      discountFixedAmount = roundCurrency(
        (discountFixedAmount ?? 0) + rewardDiscount
      );
    }

    return {
      originalTotal: paymentBaseSubtotal,
      finalTotal: paymentAdjustedTotal,
      discountType,
      discountPercentage,
      discountFixedAmount,
      discountValue: totalDiscountValue,
      discountLabel,
      discountSummary: getPaymentAdjustmentsSummary(),
    };
  };

  const getFidelitySummaryText = () => {
    if (!currentTable?.fidelityCustomerId || !linkedFidelityCustomer) {
      return "";
    }

    return [
      `Cliente fidelity: ${linkedFidelityCustomer.firstName} ${linkedFidelityCustomer.lastName}`.trim(),
      `Punti iniziali: ${currentTable.pointsBeforePayment ?? linkedFidelityCustomer.currentPoints}`,
      currentTable.selectedRewardName
        ? `Premio applicato: ${currentTable.selectedRewardName} (-${formatEuro(
            currentTable.selectedRewardDiscount ?? 0
          )})`
        : "Premio applicato: nessuno",
      `Punti usati: ${currentTable.selectedRewardPoints ?? 0}`,
      `Punti maturati: ${estimatedEarnedPoints}`,
      `Saldo stimato: ${estimatedFinalPointsBalance ?? linkedFidelityCustomer.currentPoints}`,
    ].join(" · ");
  };

  const getResolvedDocumentType = () =>
    documentMode === "FATTURA"
      ? "Fattura"
      : documentMode === "SCONTRINO"
        ? "Scontrino"
        : "Scontrino parlante";

  const archiveCompletedMovement = (itemsToArchive: OrderItem[]) => {
    const resolvedDocumentType = getResolvedDocumentType();
    const paymentAdjustmentSummary = getPaymentAdjustmentsSummary();
    const fidelitySummary = getFidelitySummaryText();
    const discountSnapshot = getDocumentDiscountSnapshot();
    const serviceAmount = roundCurrency(
      itemsToArchive
        .filter((item) => serviceProductIds.has(item.productId))
        .reduce((total, item) => total + item.unitPrice * item.quantity, 0)
    );
    const subtotalAmount = roundCurrency(
      itemsToArchive
        .filter((item) => !serviceProductIds.has(item.productId))
        .reduce((total, item) => total + item.unitPrice * item.quantity, 0)
    );

    return addArchivedMovement({
      tableId,
      tableLabel:
        currentTable?.saleMode === "Take Away" ? `Takeaway ${currentTableName}` : `Tavolo ${currentTableName}`,
      roomLabel: currentTableRoom,
      saleMode: currentTable?.saleMode ?? "",
      customerName: preOrderCustomer || currentTable?.customerName || "",
      companyName: preOrderCompany || currentTable?.companyName || "",
      operator: currentOperator || preOrderOperator || "Admin",
      documentType: resolvedDocumentType,
      paymentMethod: paymentMethod ?? getDefaultConfiguredPaymentMethod() ?? "CONTANTI",
      total: paymentAdjustedTotal,
      originalTotal: discountSnapshot.originalTotal,
      finalTotal: discountSnapshot.finalTotal,
      subtotalAmount,
      serviceAmount,
      discountType: discountSnapshot.discountType,
      discountPercentage: discountSnapshot.discountPercentage,
      discountFixedAmount: discountSnapshot.discountFixedAmount,
      discountValue: discountSnapshot.discountValue,
      discountLabel: discountSnapshot.discountLabel,
      discountSummary: discountSnapshot.discountSummary,
      operatorId: currentActor.operatorId,
      note: [currentTableNote, paymentAdjustmentSummary, fidelitySummary].filter(Boolean).join(" · "),
      guests: currentTableGuests,
      sourceType: currentTable?.saleMode === "Take Away" ? "takeaway" : "tavolo",
      lines: itemsToArchive.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        sentQuantity: item.sentQuantity,
        unitPrice: item.unitPrice,
        originalUnitPrice: item.originalUnitPrice,
        course: item.course,
        status: item.status,
        paymentState: "paid",
        operatorLabel: item.operatorLabel,
        note: item.note,
        additions: item.additions,
        removals: item.removals,
        vatRateKey: item.vatRateKey,
        vatRateLabel: item.vatRateLabel,
        vatRateValue: item.vatRateValue,
      })),
    });
  };

  const handleLinkFidelityCustomer = (
    customer: FidelityCustomer,
    codeValue: string,
    scanType: FidelityScanType,
    sourceScreen: "payment_screen" | "payment_method"
  ) => {
    const now = new Date().toISOString();

    updateTable(tableId, {
      fidelityCustomerId: customer.id,
      fidelityCustomerLabel: `${customer.firstName} ${customer.lastName}`.trim(),
      fidelityCardCode:
        scanType === "barcode" ? codeValue : customer.cardCode || currentTable?.fidelityCardCode || "",
      fidelityQrCodeValue:
        scanType === "qr" ? codeValue : customer.qrCodeValue || currentTable?.fidelityQrCodeValue || "",
      fidelityScannedBeforePayment: true,
      pointsEligible: true,
      pointsProcessed: false,
      pendingPoints: 0,
      lastFidelityScanAt: now,
      selectedRewardId: null,
      selectedRewardName: "",
      selectedRewardDiscount: 0,
      selectedRewardPoints: 0,
      rewardRedemptionId: null,
      earnedPoints: 0,
      finalPointsBalanceSnapshot: null,
      pointsBeforePayment: customer.currentPoints,
    });

    appendFidelityScanLog({
      customerId: customer.id,
      scanType,
      codeValue,
      sourceScreen,
      tableId,
      operatorId: currentActor.operatorId,
    });

    recordAuditEvent({
      eventType: "FIDELITY_CUSTOMER_UPDATED",
      entityType: "fidelity-customer",
      entityId: customer.id,
      tableId,
      nextValue: {
        fidelityCustomerId: customer.id,
        codeValue,
        scanType,
        pointsEligible: true,
      },
      origin: "payment",
      notes: "Cliente fidelity collegato al conto corrente",
    });

    if (sourceScreen === "payment_method") {
      setPaymentMethod("FIDELITY");
    }

    setScannedFidelityCustomer(customer);
    setFidelityPanelStep("choice");
    setIsFidelityPanelOpen(true);
    setStatusMessage("Cliente riconosciuto");
  };

  const clearFidelitySelection = (options?: { keepCustomer?: boolean; cancelReward?: boolean }) => {
    if (options?.cancelReward !== false && currentTable?.rewardRedemptionId) {
      cancelPendingFidelityReward(currentTable.rewardRedemptionId);
      recordAuditEvent({
        eventType: "FIDELITY_REWARD_CANCELLED",
        entityType: "fidelity-redemption",
        entityId: currentTable.rewardRedemptionId,
        tableId,
        origin: "payment",
      });
    }

    updateTable(tableId, {
      fidelityCustomerId: options?.keepCustomer ? currentTable?.fidelityCustomerId ?? null : null,
      fidelityCustomerLabel: options?.keepCustomer ? currentTable?.fidelityCustomerLabel ?? "" : "",
      fidelityCardCode: options?.keepCustomer ? currentTable?.fidelityCardCode ?? "" : "",
      fidelityQrCodeValue: options?.keepCustomer ? currentTable?.fidelityQrCodeValue ?? "" : "",
      fidelityScannedBeforePayment: options?.keepCustomer ? currentTable?.fidelityScannedBeforePayment ?? false : false,
      pointsEligible: options?.keepCustomer ? true : false,
      pointsProcessed: false,
      pendingPoints: 0,
      selectedRewardId: null,
      selectedRewardName: "",
      selectedRewardDiscount: 0,
      selectedRewardPoints: 0,
      rewardRedemptionId: null,
      earnedPoints: 0,
      finalPointsBalanceSnapshot: null,
      pointsBeforePayment: options?.keepCustomer ? currentTable?.pointsBeforePayment ?? linkedFidelityCustomer?.currentPoints ?? null : null,
    });
  };

  const handleKeepAccumulatingPoints = () => {
    if (!activeFidelityCustomer) {
      return;
    }

    clearFidelitySelection({ keepCustomer: true, cancelReward: true });
    setScannedFidelityCustomer(null);
    setIsFidelityPanelOpen(false);
    setStatusMessage("I punti verranno aggiornati al termine del pagamento");
  };

  const handleSelectFidelityReward = (reward: FidelityReward) => {
    if (!activeFidelityCustomer) {
      return;
    }

    if (activeFidelityCustomer.currentPoints < reward.pointsRequired) {
      setStatusMessage("Nessun premio disponibile");
      return;
    }

    if (paymentBaseSubtotal <= 0) {
      setStatusMessage("Totale non valido per applicare il premio");
      return;
    }

    const appliedDiscount = Math.min(reward.discountAmount, paymentBaseSubtotal);

    if (appliedDiscount <= 0) {
      setStatusMessage("Premio non applicabile su questo totale");
      return;
    }

    if (currentTable?.rewardRedemptionId) {
      cancelPendingFidelityReward(currentTable.rewardRedemptionId);
    }

    const pendingRedemption = createPendingRewardRedemption({
      customerId: activeFidelityCustomer.id,
      orderId: tableId,
      paymentId: `${tableId}-payment`,
      rewardId: reward.id,
      rewardName: reward.name,
      pointsUsed: reward.pointsRequired,
      discountApplied: appliedDiscount,
      operatorId: currentActor.operatorId,
    });

    updateTable(tableId, {
      fidelityCustomerId: activeFidelityCustomer.id,
      fidelityCustomerLabel: `${activeFidelityCustomer.firstName} ${activeFidelityCustomer.lastName}`.trim(),
      pointsEligible: true,
      selectedRewardId: reward.id,
      selectedRewardName: reward.name,
      selectedRewardDiscount: appliedDiscount,
      selectedRewardPoints: reward.pointsRequired,
      rewardRedemptionId: pendingRedemption.id,
      pointsBeforePayment: activeFidelityCustomer.currentPoints,
    });

    recordAuditEvent({
      eventType: "FIDELITY_REWARD_SELECTED",
      entityType: "fidelity-redemption",
      entityId: pendingRedemption.id,
      tableId,
      nextValue: pendingRedemption,
      origin: "payment",
    });

    setScannedFidelityCustomer(null);
    setIsFidelityPanelOpen(false);
    setStatusMessage(`Premio da ${reward.discountAmount}€ applicato correttamente`);
  };

  const handleFidelityScannerDetected = (codeValue: string, scanType: FidelityScanType) => {
    const matchedCustomer = findFidelityCustomerByCode(codeValue);

    if (!matchedCustomer) {
      setStatusMessage("Nessun cliente fidelity associato a questo codice");
      return;
    }

    clearFidelitySelection();
    handleLinkFidelityCustomer(
      matchedCustomer,
      codeValue,
      scanType,
      fidelityScannerContext === "payment-method" ? "payment_method" : "payment_screen"
    );
  };

  const persistSplitBillState = (nextState: SplitBillState | null) => {
    updateTable(tableId, {
      splitBillState: nextState
        ? {
            ...nextState,
            updatedAt: new Date().toISOString(),
          }
        : null,
    });
  };

  const clearSplitBillState = () => {
    persistSplitBillState(null);
    setSplitMode("none");
    setSelectedSplitItemIds([]);
    setActiveSplitQuotaId(null);
    setSplitCustomAmount("");
  };

  const activateSplitMode = (mode: SplitBillMode) => {
    const hasPaidQuotas = splitQuotas.some((quota) => quota.status === "paid");

    if (hasPaidQuotas && splitBillState?.mode !== mode) {
      setStatusMessage("Completa le quote esistenti prima di cambiare tipo di divisione");
      return;
    }

    if (splitBillState?.mode === mode) {
      setSplitMode(mode);
      return;
    }

    const now = new Date().toISOString();
    persistSplitBillState({
      mode,
      quotas: [],
      peopleCount: mode === "people" ? Number(romanSplitGuests) || 2 : null,
      createdAt: splitBillState?.createdAt ?? now,
      updatedAt: now,
    });
    setSplitMode(mode);
    setActiveSplitQuotaId(null);
    setSelectedSplitItemIds([]);
    setStatusMessage(
      mode === "people"
        ? "Divisione per persone attiva"
        : mode === "amount"
          ? "Divisione per importo attiva"
          : "Separazione prodotti attiva"
    );
  };

  const handleGeneratePeopleQuotas = () => {
    const peopleCount = Math.max(2, Number.parseInt(romanSplitGuests, 10) || 0);

    if (remainingTotal <= 0) {
      setStatusMessage("Nessun residuo da dividere");
      return;
    }

    if (peopleCount < 2) {
      setStatusMessage("Inserisci almeno 2 persone");
      return;
    }

    if (splitQuotas.some((quota) => quota.status === "paid")) {
      setStatusMessage("Le quote già pagate non possono essere rigenerate");
      return;
    }

    activateSplitMode("people");

    const baseQuota = Math.floor(((remainingTotal / peopleCount) * 100)) / 100;
    const quotas = Array.from({ length: peopleCount }, (_, index) => {
      const amount =
        index === peopleCount - 1
          ? clampCurrency(remainingTotal - baseQuota * (peopleCount - 1))
          : roundCurrency(baseQuota);

      return {
        id: buildSplitQuotaId(`people-${index + 1}`),
        label: `Quota ${index + 1}`,
        mode: "people" as const,
        amount,
        status: "pending" as const,
        paymentMethod: null,
        paidAt: null,
        itemIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    persistSplitBillState({
      mode: "people",
      quotas,
      peopleCount,
      createdAt: splitBillState?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setStatusMessage(`${peopleCount} quote create correttamente`);
  };

  const handleAddAmountQuota = (useFullResidual = false) => {
    const numericAmount = useFullResidual
      ? splitCreationAvailableAmount
      : Number.parseFloat(splitCustomAmount.replace(",", "."));

    if (splitMode !== "amount") {
      activateSplitMode("amount");
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setStatusMessage("Inserisci un importo valido");
      return;
    }

    if (numericAmount > splitCreationAvailableAmount) {
      setStatusMessage("L'importo supera il residuo disponibile");
      return;
    }

    const nextQuota: SplitBillQuota = {
      id: buildSplitQuotaId("amount"),
      label: `Quota ${splitQuotas.length + 1}`,
      mode: "amount",
      amount: roundCurrency(numericAmount),
      status: "pending",
      paymentMethod: null,
      paidAt: null,
      itemIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    persistSplitBillState({
      mode: "amount",
      quotas: [...splitQuotas, nextQuota],
      peopleCount: null,
      createdAt: splitBillState?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setSplitCustomAmount("");
    setStatusMessage(`${nextQuota.label} aggiunta correttamente`);
  };

  const handleCreateItemSplitQuota = () => {
    if (splitMode !== "items") {
      activateSplitMode("items");
    }

    if (selectedSplitItemIds.length === 0) {
      setStatusMessage("Seleziona almeno un prodotto");
      return;
    }

    const eligibleItems = unassignedPayableItems.filter((item) => selectedSplitItemIds.includes(item.id));
    const quotaAmount = roundCurrency(
      eligibleItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
    );

    if (eligibleItems.length === 0 || quotaAmount <= 0) {
      setStatusMessage("I prodotti selezionati non sono disponibili");
      return;
    }

    const nextQuota: SplitBillQuota = {
      id: buildSplitQuotaId("items"),
      label: `Sotto-conto ${splitQuotas.length + 1}`,
      mode: "items",
      amount: quotaAmount,
      status: "pending",
      paymentMethod: null,
      paidAt: null,
      itemIds: eligibleItems.map((item) => item.id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    persistSplitBillState({
      mode: "items",
      quotas: [...splitQuotas, nextQuota],
      peopleCount: null,
      createdAt: splitBillState?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setSelectedSplitItemIds([]);
    setStatusMessage(`${nextQuota.label} creato con ${eligibleItems.length} prodotti`);
  };

  const handleRemoveSplitQuota = (quotaId: string) => {
    const nextQuotas = splitQuotas.filter((quota) => quota.id !== quotaId);

    if (nextQuotas.length === 0) {
      clearSplitBillState();
      setStatusMessage("Divisione conto rimossa");
      return;
    }

    persistSplitBillState({
      mode: splitBillState?.mode ?? "amount",
      quotas: nextQuotas,
      peopleCount: splitBillState?.peopleCount ?? null,
      createdAt: splitBillState?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (activeSplitQuotaId === quotaId) {
      setActiveSplitQuotaId(null);
    }
    setStatusMessage("Quota rimossa");
  };

  const buildQuotaArchiveLines = (quota: SplitBillQuota, paidItems: OrderItem[]) => {
    if (quota.mode === "items" && paidItems.length > 0) {
      return paidItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        sentQuantity: item.sentQuantity,
        unitPrice: item.unitPrice,
        originalUnitPrice: item.originalUnitPrice,
        course: item.course,
        status: item.status,
        paymentState: "paid" as const,
        operatorLabel: item.operatorLabel,
        note: item.note,
        additions: item.additions,
        removals: item.removals,
        vatRateKey: item.vatRateKey,
        vatRateLabel: item.vatRateLabel,
        vatRateValue: item.vatRateValue,
      }));
    }

    return [
      {
        id: quota.id,
        productId: `split-quota-${quota.id}`,
        name: quota.label,
        quantity: 1,
        sentQuantity: 1,
        unitPrice: quota.amount,
        originalUnitPrice: quota.amount,
        course: "PRIMA PORTATA" as const,
        status: "sent" as const,
        paymentState: "paid" as const,
        operatorLabel: currentOperator || preOrderOperator || "Admin",
        note: `Divisione conto ${splitBillState?.mode ?? quota.mode}`,
      },
    ];
  };

  const archiveSplitQuotaPayment = (quota: SplitBillQuota, paidItems: OrderItem[]) => {
    const lines = buildQuotaArchiveLines(quota, paidItems);

    return addArchivedMovement({
      tableId,
      tableLabel:
        currentTable?.saleMode === "Take Away" ? `Takeaway ${currentTableName}` : `Tavolo ${currentTableName}`,
      roomLabel: currentTableRoom,
      saleMode: currentTable?.saleMode ?? "",
      customerName: preOrderCustomer || currentTable?.customerName || "",
      companyName: preOrderCompany || currentTable?.companyName || "",
      operator: currentOperator || preOrderOperator || "Admin",
      documentType: getResolvedDocumentType(),
      paymentMethod: paymentMethod ?? getDefaultConfiguredPaymentMethod() ?? "CONTANTI",
      total: quota.amount,
      originalTotal: quota.amount,
      finalTotal: quota.amount,
      subtotalAmount: quota.amount,
      serviceAmount: 0,
      discountType: "none",
      discountPercentage: null,
      discountFixedAmount: null,
      discountValue: 0,
      discountLabel: "",
      discountSummary: "",
      operatorId: currentActor.operatorId,
      note: `${quota.label} · Divisione conto ${splitBillState?.mode ?? quota.mode}`,
      guests: currentTableGuests,
      sourceType: currentTable?.saleMode === "Take Away" ? "takeaway" : "tavolo",
      lines,
    });
  };

  const handleConfirmPayment = async () => {
    setIsFinalizingPayment(false);
    if (!canConfirmPayments) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (!paymentMethod) {
      setStatusMessage("Seleziona un metodo di pagamento");
      return;
    }

    if (activeSplitQuota) {
      const quotaItems =
        activeSplitQuota.mode === "items"
          ? payableItems.filter((item) => (activeSplitQuota.itemIds ?? []).includes(item.id))
          : [];
      const fiscalItems =
        quotaItems.length > 0
          ? quotaItems
          : [
              {
                id: activeSplitQuota.id,
                productId: `split-quota-${activeSplitQuota.id}`,
                name: activeSplitQuota.label,
                quantity: 1,
                commensaleCode: null,
                course: "PRIMA PORTATA" as const,
                note: "Divisione conto",
              },
            ];

      const fiscalPrintJobs = await new PrintJobService().dispatchFiscalPrintJob({
        tableId,
        tableLabel:
          currentTable?.saleMode === "Take Away" ? `Takeaway ${currentTableName}` : `Tavolo ${currentTableName}`,
        roomLabel: currentTableRoom,
        operator: currentOperator || preOrderOperator || "Admin",
        documentType: getResolvedDocumentType(),
        paymentMethod,
        total: activeSplitQuota.amount,
        items: fiscalItems.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          commensaleCode: "commensaleCode" in item ? item.commensaleCode ?? null : null,
          course: item.course,
          note: item.note,
        })),
        products: productsCatalog,
      });

      const updatedQuotas = splitQuotas.map((quota) =>
        quota.id === activeSplitQuota.id
          ? {
              ...quota,
              status: "paid" as const,
              paymentMethod,
              paidAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : quota
      );
      const nextItems =
        activeSplitQuota.mode === "items"
          ? orderItems.map((item) =>
              (activeSplitQuota.itemIds ?? []).includes(item.id)
                ? { ...item, paymentState: "paid" as const }
                : item
            )
          : orderItems;
      const nextRemainingTotal =
        splitBillState?.mode === "items"
          ? roundCurrency(
              nextItems
                .filter((item) => item.paymentState !== "paid")
                .reduce((total, item) => total + item.unitPrice * item.quantity, 0)
            )
          : clampCurrency(
              remainingItemsTotal -
                updatedQuotas
                  .filter((quota) => quota.status === "paid")
                  .reduce((total, quota) => total + quota.amount, 0)
            );
      const hasPendingQuotas = updatedQuotas.some((quota) => quota.status === "pending");
      const shouldCloseTable = nextRemainingTotal <= 0 && !hasPendingQuotas;

      archiveSplitQuotaPayment(activeSplitQuota, quotaItems);
      recordAuditEvent({
        eventType: "PAYMENT_CONFIRMED",
        entityType: "payment",
        entityId: `${tableId}-${activeSplitQuota.id}`,
        tableId,
        nextValue: {
          splitQuotaId: activeSplitQuota.id,
          paymentMethod,
          total: activeSplitQuota.amount,
        },
        origin: "payment",
      });

      if (activeSplitQuota.mode === "items") {
        safeSetOrderLines(nextItems, "PAYMENT_SPLIT_QUOTA_SAVE", {
          splitQuotaId: activeSplitQuota.id,
        });
        setSavedOrderItems(nextItems);
      }

      if (shouldCloseTable) {
        clearOrderIntentionally("payment_completed");
        updateTable(tableId, {
          status: "free",
          guests: 0,
          note: "",
          paymentStatus: "paid",
          splitBillState: null,
          fidelityCustomerId: null,
          fidelityCustomerLabel: "",
          fidelityCardCode: "",
          fidelityQrCodeValue: "",
          fidelityScannedBeforePayment: false,
          pointsEligible: false,
          pointsProcessed: false,
          pendingPoints: 0,
          lastFidelityScanAt: null,
          selectedRewardId: null,
          selectedRewardName: "",
          selectedRewardDiscount: 0,
          selectedRewardPoints: 0,
          rewardRedemptionId: null,
          earnedPoints: 0,
          finalPointsBalanceSnapshot: null,
          pointsBeforePayment: null,
        });
        handleReturnToHomeAfterPayment();
        setStatusMessage(
          fiscalPrintJobs.length > 0
            ? `Quota registrata · Documento fiscale pronto per ${fiscalPrintJobs[0]?.printerName}`
            : "Quota registrata"
        );
      } else {
        persistSplitBillState({
          mode: splitBillState?.mode ?? activeSplitQuota.mode,
          quotas: updatedQuotas,
          peopleCount: splitBillState?.peopleCount ?? null,
          createdAt: splitBillState?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        updateTable(tableId, {
          status: "occupied",
          paymentStatus: "pending",
        });
        setPanelMode("payment");
        setStatusMessage(
          fiscalPrintJobs.length > 0
            ? `Quota registrata · Documento fiscale pronto per ${fiscalPrintJobs[0]?.printerName}`
            : "Quota registrata"
        );
      }

      setPaymentMethod(null);
      setDocumentMode(null);
      setPaymentCalculatorValue("0");
      setPaymentCalculationBase("TOT");
      setPaymentAdjustments([]);
      setPaymentChangeDue(null);
      setIsQuickDiscountPanelOpen(false);
      setQuickDiscountValue("");
      setQuickDiscountMode("euro");
      setIsFidelityScannerOpen(false);
      setIsUtilityMenuOpen(false);
      setIsRistampaOpen(false);
      return;
    }

    const nextItems = orderItems.map((item) =>
      item.paymentState === "paid" ? item : { ...item, paymentState: "paid" as const }
    );
    const fiscalPrintJobs = await new PrintJobService().dispatchFiscalPrintJob({
      tableId,
      tableLabel:
        currentTable?.saleMode === "Take Away" ? `Takeaway ${currentTableName}` : `Tavolo ${currentTableName}`,
      roomLabel: currentTableRoom,
      operator: currentOperator || preOrderOperator || "Admin",
      documentType: getResolvedDocumentType(),
      paymentMethod,
      total: paymentAdjustedTotal,
      items: nextItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        commensaleCode: item.commensaleCode ?? null,
        course: item.course,
        note: item.note,
      })),
      products: productsCatalog,
    });

    recordAuditEvent({
      eventType: "FISCAL_PRINT_REQUESTED",
      entityType: "payment",
      entityId: `${tableId}-payment`,
      tableId,
      nextValue: {
        paymentMethod,
        documentType: getResolvedDocumentType(),
        total: paymentAdjustedTotal,
      },
      origin: "printing",
    });

    if (documentMode === "SCONTRINO" || documentMode === "SCONTRINO_PARLANTE") {
      recordAuditEvent({
        eventType: "RECEIPT_PRINTED",
        entityType: "document",
        entityId: `${tableId}-${documentMode.toLowerCase()}`,
        tableId,
        nextValue: {
          documentType: getResolvedDocumentType(),
          total: paymentAdjustedTotal,
        },
        origin: "printing",
      });
    }

    if (nextItems.every((item) => item.paymentState === "paid")) {
      const archivedMovement = archiveCompletedMovement(nextItems);

      const finalizedFidelityPayment =
        currentTable?.fidelityCustomerId && currentTable.pointsEligible
          ? finalizeFidelityPayment({
              customerId: currentTable.fidelityCustomerId,
              orderId: tableId,
              paymentId: archivedMovement?.id ?? `${tableId}-payment`,
              operatorId: currentActor.operatorId,
              paidEuroAmount: paymentAdjustedTotal,
              rewardRedemptionId: currentTable.rewardRedemptionId ?? undefined,
              rewardId: currentTable.selectedRewardId ?? undefined,
              rewardName: currentTable.selectedRewardName || undefined,
              rewardPointsUsed: currentTable.selectedRewardPoints ?? 0,
              rewardDiscountApplied: currentTable.selectedRewardDiscount ?? 0,
              lastScanAt: currentTable.lastFidelityScanAt ?? new Date().toISOString(),
            })
          : null;

      if (finalizedFidelityPayment) {
        recordAuditEvent({
          eventType: "FIDELITY_POINTS_PROCESSED",
          entityType: "fidelity-points",
          entityId: archivedMovement?.id ?? `${tableId}-payment`,
          tableId,
          nextValue: finalizedFidelityPayment,
          origin: "payment",
        });
      }

      clearOrderIntentionally("payment_completed");
      updateTable(tableId, {
        status: "free",
        guests: 0,
        note: "",
        paymentStatus: "paid",
        splitBillState: null,
        fidelityCustomerId: null,
        fidelityCustomerLabel: "",
        fidelityCardCode: "",
        fidelityQrCodeValue: "",
        fidelityScannedBeforePayment: false,
        pointsEligible: false,
        pointsProcessed: currentTable?.pointsEligible ?? false,
        pendingPoints: 0,
        lastFidelityScanAt: null,
        selectedRewardId: null,
        selectedRewardName: "",
        selectedRewardDiscount: 0,
        selectedRewardPoints: 0,
        rewardRedemptionId: null,
        earnedPoints: finalizedFidelityPayment?.earnedPoints ?? 0,
        finalPointsBalanceSnapshot: finalizedFidelityPayment?.finalPointsBalance ?? null,
        pointsBeforePayment: null,
      });
      handleReturnToHomeAfterPayment();
    } else {
      const finalizedFidelityPayment =
        currentTable?.fidelityCustomerId && currentTable.pointsEligible
          ? finalizeFidelityPayment({
              customerId: currentTable.fidelityCustomerId,
              orderId: tableId,
              paymentId: `${tableId}-split-payment-partial`,
              operatorId: currentActor.operatorId,
              paidEuroAmount: paymentAdjustedTotal,
              rewardRedemptionId: currentTable.rewardRedemptionId ?? undefined,
              rewardId: currentTable.selectedRewardId ?? undefined,
              rewardName: currentTable.selectedRewardName || undefined,
              rewardPointsUsed: currentTable.selectedRewardPoints ?? 0,
              rewardDiscountApplied: currentTable.selectedRewardDiscount ?? 0,
              lastScanAt: currentTable.lastFidelityScanAt ?? new Date().toISOString(),
            })
          : null;
      safeSetOrderLines(nextItems, "PAYMENT_PARTIAL_SAVE", {
        paymentMethod,
      });
      setSavedOrderItems(nextItems);
      updateTable(tableId, {
        status: "occupied",
        paymentStatus: "pending",
        splitBillState: splitBillState,
        fidelityCustomerId: finalizedFidelityPayment ? null : currentTable?.fidelityCustomerId ?? null,
        fidelityCustomerLabel: finalizedFidelityPayment ? "" : currentTable?.fidelityCustomerLabel ?? "",
        fidelityCardCode: finalizedFidelityPayment ? "" : currentTable?.fidelityCardCode ?? "",
        fidelityQrCodeValue: finalizedFidelityPayment ? "" : currentTable?.fidelityQrCodeValue ?? "",
        fidelityScannedBeforePayment: currentTable?.fidelityScannedBeforePayment ?? false,
        pointsEligible: false,
        pointsProcessed: false,
        pendingPoints: 0,
        lastFidelityScanAt: finalizedFidelityPayment ? null : currentTable?.lastFidelityScanAt ?? null,
        selectedRewardId: null,
        selectedRewardName: "",
        selectedRewardDiscount: 0,
        selectedRewardPoints: 0,
        rewardRedemptionId: null,
        earnedPoints: finalizedFidelityPayment?.earnedPoints ?? 0,
        finalPointsBalanceSnapshot: finalizedFidelityPayment?.finalPointsBalance ?? null,
        pointsBeforePayment: null,
      });
      setPanelMode("sent-summary");
    }

    setPaymentMethod(null);
    setDocumentMode(null);
    setRomanSplitGuests("2");
    setIsFidelityScannerOpen(false);
    setSelectedSplitItemIds([]);
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
    setStatusMessage(
      fiscalPrintJobs.length > 0
        ? `Pagamento registrato · Documento fiscale simulato pronto per stampante ${fiscalPrintJobs[0]?.printerName}`
        : "Pagamento registrato"
    );
  };

  const handleToggleSplitItem = (itemId: string) => {
    setSelectedSplitItemIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((currentId) => currentId !== itemId)
        : [...currentIds, itemId]
    );
  };

  const handleConfirmSplitPayment = async () => {
    setIsFinalizingPayment(false);
    if (!canConfirmPayments) {
      setStatusMessage("Permesso non disponibile per questo utente");
      return;
    }

    if (selectedSplitItemIds.length === 0) {
      setStatusMessage("Seleziona almeno un prodotto");
      return;
    }

    if (!paymentMethod) {
      setStatusMessage("Seleziona un metodo di pagamento");
      return;
    }

    const nextItems = orderItems.map((item) =>
      selectedSplitItemIds.includes(item.id)
        ? { ...item, paymentState: "paid" as const }
        : item
    );
    const paidItems = nextItems.filter((item) => selectedSplitItemIds.includes(item.id));
    const fiscalPrintJobs = await new PrintJobService().dispatchFiscalPrintJob({
      tableId,
      tableLabel:
        currentTable?.saleMode === "Take Away" ? `Takeaway ${currentTableName}` : `Tavolo ${currentTableName}`,
      roomLabel: currentTableRoom,
      operator: currentOperator || preOrderOperator || "Admin",
      documentType: getResolvedDocumentType(),
      paymentMethod,
      total: paymentAdjustedTotal,
      items: paidItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        commensaleCode: item.commensaleCode ?? null,
        course: item.course,
        note: item.note,
      })),
      products: productsCatalog,
    });

    recordAuditEvent({
      eventType: "FISCAL_PRINT_REQUESTED",
      entityType: "payment",
      entityId: `${tableId}-split-payment`,
      tableId,
      nextValue: {
        paymentMethod,
        documentType: getResolvedDocumentType(),
        total: paymentAdjustedTotal,
        itemIds: selectedSplitItemIds,
      },
      origin: "printing",
    });

    const remainingItems = nextItems.filter((item) => item.paymentState !== "paid");

    if (remainingItems.length === 0) {
      const archivedMovement = archiveCompletedMovement(nextItems);
      const finalizedFidelityPayment =
        currentTable?.fidelityCustomerId && currentTable.pointsEligible
          ? finalizeFidelityPayment({
              customerId: currentTable.fidelityCustomerId,
              orderId: tableId,
              paymentId: archivedMovement?.id ?? `${tableId}-split-payment`,
              operatorId: currentActor.operatorId,
              paidEuroAmount: paymentAdjustedTotal,
              rewardRedemptionId: currentTable.rewardRedemptionId ?? undefined,
              rewardId: currentTable.selectedRewardId ?? undefined,
              rewardName: currentTable.selectedRewardName || undefined,
              rewardPointsUsed: currentTable.selectedRewardPoints ?? 0,
              rewardDiscountApplied: currentTable.selectedRewardDiscount ?? 0,
              lastScanAt: currentTable.lastFidelityScanAt ?? new Date().toISOString(),
            })
          : null;
      clearOrderIntentionally("payment_completed");
      updateTable(tableId, {
        status: "free",
        guests: 0,
        note: "",
        paymentStatus: "paid",
        splitBillState: null,
        fidelityCustomerId: null,
        fidelityCustomerLabel: "",
        fidelityCardCode: "",
        fidelityQrCodeValue: "",
        fidelityScannedBeforePayment: false,
        pointsEligible: false,
        pointsProcessed: currentTable?.pointsEligible ?? false,
        pendingPoints: 0,
        lastFidelityScanAt: null,
        selectedRewardId: null,
        selectedRewardName: "",
        selectedRewardDiscount: 0,
        selectedRewardPoints: 0,
        rewardRedemptionId: null,
        earnedPoints: finalizedFidelityPayment?.earnedPoints ?? 0,
        finalPointsBalanceSnapshot: finalizedFidelityPayment?.finalPointsBalance ?? null,
        pointsBeforePayment: null,
      });
      handleReturnToHomeAfterPayment();
      setStatusMessage("Conto selezionato pagato");
    } else {
      safeSetOrderLines(nextItems, "SPLIT_PAYMENT_SAVE", {
        paymentMethod,
        selectedSplitItemIds,
      });
      setSavedOrderItems(nextItems);
      updateTable(tableId, {
        status: "occupied",
        paymentStatus: "pending",
      });
      setStatusMessage("Conto selezionato pagato");
    }

    setSelectedSplitItemIds([]);
    setPaymentMethod(null);
    setDocumentMode(null);
    setRomanSplitGuests("2");
    setIsFidelityScannerOpen(false);
    setStatusMessage(
      fiscalPrintJobs.length > 0
        ? `Conto selezionato pagato · Documento fiscale simulato pronto per stampante ${fiscalPrintJobs[0]?.printerName}`
        : "Conto selezionato pagato"
    );
  };

  const handleUtilityAction = async (
    action:
      | "stampa-preconto"
      | "sposta"
      | "ristampa-reparti"
      | "storno-multiplo"
      | "storno-tavolo"
  ) => {
    if (action === "stampa-preconto") {
      setIsPrebillConfirmOpen(true);
      setIsUtilityMenuOpen(false);
      setIsRistampaOpen(false);
      return;
    }

    if (action === "sposta") {
      console.log("Sposta ordine");
    }

    if (action === "ristampa-reparti") {
      const sentItems = orderItems.filter(
        (item) => item.productId !== AUTO_COVER_PRODUCT_ID && getVisibleSentQuantity(item) > 0
      );

      if (sentItems.length === 0) {
        setStatusMessage("Nessun prodotto inviato da ristampare");
      } else {
        const jobs = await new PrintJobService().dispatchOrderPrintJobs({
          tableId,
          tableLabel: getCurrentTableLabel(),
          roomLabel: currentTableRoom,
          operator: currentOperator || preOrderOperator || "Admin",
          operatorId: currentActor.operatorId ?? null,
          deviceMode,
          guests: currentTable?.guests ?? Number(preOrderGuests || 0),
          customerLabel: currentTable?.customerName || preOrderCustomer || "",
          companyLabel: currentTable?.companyName || preOrderCompany || "",
          transmissionType: "reprint",
          items: sentItems.map((item) => ({
            id: item.id,
            productId: item.productId,
            name: item.name,
            quantity: getVisibleSentQuantity(item),
            commensaleCode: item.commensaleCode ?? null,
            course: item.course,
            note: item.note,
          })),
          products: productsCatalog,
        });
        const printerNames = Array.from(new Set(jobs.map((job) => job.printerName).filter(Boolean)));
        const failedJobs = jobs.filter((job) => job.status === "failed");

        setStatusMessage(
          failedJobs.length > 0
            ? failedJobs[0].errorMessage || "Ristampa registrata con errori"
            : printerNames.length > 0
              ? `Ristampa inviata a ${printerNames.join(", ")}`
              : "Ristampa registrata"
        );
      }
    }

    if (action === "storno-multiplo") {
      if (!canDeleteOrderLines) {
        setStatusMessage("Permesso non disponibile per questo utente");
      } else {
        setPanelMode("edit-order");
        setIsVoidSelectionMode(true);
        setSelectedVoidItemIds([]);
        setStatusMessage("Seleziona i prodotti da stornare");
      }
    }

    if (action === "storno-tavolo") {
      if (!orderItems.length) {
        setStatusMessage("Nessun prodotto da stornare");
      } else {
        openPendingVoidAction(
          "table",
          "Storno intero tavolo",
          `Vuoi stornare l'intero ${getCurrentTableLabel()}?`,
          orderItems
            .filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID && getVisibleSentQuantity(item) > 0)
            .map((item) => buildVoidPrintableItem(item, getVisibleSentQuantity(item))),
          []
        );
      }
    }

    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
  };

  const handleDeleteOrder = () => {
    if (!orderItems.length) {
      setStatusMessage("Nessun ordine da cancellare");
      return;
    }

    const printableItems = orderItems
      .filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID && getVisibleSentQuantity(item) > 0)
      .map((item) => buildVoidPrintableItem(item, getVisibleSentQuantity(item)));

    if (printableItems.length > 0) {
      openPendingVoidAction(
        "table",
        "Storno intero tavolo",
        `Vuoi stornare l'intero ${getCurrentTableLabel()}?`,
        printableItems,
        []
      );
      return;
    }

    if (!window.confirm("Vuoi cancellare l'ordine?")) {
      return;
    }

    recordAuditEvent({
      eventType: "ORDER_DELETED",
      entityType: "order",
      entityId: tableId,
      tableId,
      previousValue: orderItems,
      origin: "order",
    });

    applyOrderStateAfterVoid([], "Ordine cancellato");
    setPaymentMethod(null);
    setActiveMode("RIEPILOGO");
    setIsUtilityMenuOpen(false);
    setIsRistampaOpen(false);
  };

  const handleConfirmPrebillPrint = async () => {
    const prebillItems = orderItems
      .filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID)
      .map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        commensaleCode: item.commensaleCode ?? null,
        course: item.course,
        note: item.note,
      }));

    const jobs = await new PrintJobService().dispatchPrebillPrintJob({
      tableId,
      tableLabel: getCurrentTableLabel(),
      roomLabel: currentTableRoom,
      operator: currentOperator || preOrderOperator || "Admin",
      items: prebillItems,
      products: productsCatalog,
      subtotal: paymentBaseSubtotal,
      total: paymentAdjustedTotal,
      discountLabel: paymentAdjustments.length > 0 ? getPaymentAdjustmentsSummary() : undefined,
    });
    const printerNames = Array.from(new Set(jobs.map((job) => job.printerName).filter(Boolean)));
    const failedJob = jobs.find((job) => job.status === "failed");
    const queuedJob = jobs.find((job) => job.status === "pending");

    recordAuditEvent({
      eventType: "RECEIPT_PRINTED",
      entityType: "document",
      entityId: `${tableId}-prebill`,
      tableId,
      nextValue: {
        table: getCurrentTableLabel(),
        total: paymentAdjustedTotal,
        printerNames,
      },
      origin: "printing",
    });

    setIsPrebillConfirmOpen(false);
    if (!failedJob) {
      updateTable(tableId, {
        prebillPrintedAt: new Date().toISOString(),
      });
    }
    setStatusMessage(
      failedJob
        ? failedJob.errorMessage || "Preconto registrato con errore di stampa"
        : queuedJob
          ? "Preconto salvato. Stampa in coda al bridge locale."
        : printerNames.length > 0
          ? `Preconto inviato a ${printerNames.join(", ")}`
          : "Preconto registrato"
    );
  };

  const handleVoidSelectedItems = () => {
    const selectedItems = orderItems.filter((item) => selectedVoidItemIds.includes(item.id));

    if (selectedItems.length === 0) {
      setStatusMessage("Seleziona almeno un prodotto da stornare");
      return;
    }

    openPendingVoidAction(
      "multiple",
      "Storno multiplo prodotti",
      "Vuoi stampare lo storno dei prodotti selezionati?",
      selectedItems
        .filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID && getVisibleSentQuantity(item) > 0)
        .map((item) => buildVoidPrintableItem(item, getVisibleSentQuantity(item))),
      orderItems.filter((item) => !selectedVoidItemIds.includes(item.id))
    );
  };

  const renderPaymentSummaryPanel = () => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
      <div className="border-b border-[#ddd9d0] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[#2e2a25]">{`Tavolo ${currentTableName}`}</div>
            <div className="mt-1 text-xs text-[#6a645b]">{`${currentTableRoom} · ${currentOperator}`}</div>
          </div>
          <button
            type="button"
            onClick={() => setIsQuickDiscountPanelOpen((current) => !current)}
            className="rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 py-2 text-sm font-bold text-[#2e2a25]"
          >
            {formatEuro(paymentAdjustedTotal)}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-4">
          {groupedItems.map((group) => (
            <div key={`payment-${group.course}`} className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">{group.course}</div>
              <div className="rounded-[4px] border border-[#ddd9d0] bg-white">
                {group.items.length > 0 ? (
                  group.items.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={
                        item.paymentState === "paid" ||
                        splitMode !== "items" ||
                        pendingItemQuotaIds.has(item.id)
                      }
                      onClick={() => handleToggleSplitItem(item.id)}
                      className={[
                        "grid w-full grid-cols-[52px_minmax(0,1fr)_88px] items-start gap-3 px-3 py-2 text-left text-sm",
                        splitMode === "items" && item.paymentState !== "paid" && !pendingItemQuotaIds.has(item.id)
                          ? "cursor-pointer"
                          : "cursor-default",
                        selectedSplitItemIds.includes(item.id)
                          ? "bg-[#cfe8ff]"
                          : item.paymentState === "paid"
                            ? "bg-[#eef0eb]"
                            : pendingItemQuotaIds.has(item.id)
                              ? "bg-[#f6efe1]"
                            : "",
                        index !== group.items.length - 1 ? "border-b border-[#e1ddd4]" : "",
                      ].join(" ")}
                    >
                      <div className="font-semibold text-[#433d36]">{`${item.quantity}x`}</div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[#2e2a25]">{item.name}</div>
                        {item.originalUnitPrice !== undefined &&
                        item.unitPrice !== item.originalUnitPrice ? (
                          <div className="mt-1 text-[11px] text-[#6a645b]">Prezzo modificato</div>
                        ) : null}
                        <div className="mt-1 text-[11px] text-[#6a645b]">
                          {item.paymentState === "paid"
                            ? "Pagato"
                            : pendingItemQuotaIds.has(item.id)
                              ? "Gia assegnato a un sotto-conto"
                              : splitMode === "items"
                              ? selectedSplitItemIds.includes(item.id)
                                ? "Selezionato"
                                : "Disponibile"
                              : "Da pagare"}
                        </div>
                        {item.note ? (
                          <div className="mt-1 text-[11px] text-[#6a645b]">{`Note: ${item.note}`}</div>
                        ) : null}
                      </div>
                      <div className="text-right font-semibold text-[#433d36]">
                        {formatEuro(item.unitPrice * item.quantity)}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm text-[#7a736a]">Nessun elemento</div>
                )}
              </div>
            </div>
          ))}
          {serviceItems.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">Servizi</div>
              <div className="rounded-[4px] border border-[#ddd9d0] bg-white">
                {serviceItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={
                      item.paymentState === "paid" ||
                      splitMode !== "items" ||
                      pendingItemQuotaIds.has(item.id)
                    }
                    onClick={() => handleToggleSplitItem(item.id)}
                    className={[
                      "grid w-full grid-cols-[52px_minmax(0,1fr)_88px] items-start gap-3 px-3 py-2 text-left text-sm",
                      splitMode === "items" && item.paymentState !== "paid" && !pendingItemQuotaIds.has(item.id)
                        ? "cursor-pointer"
                        : "cursor-default",
                      selectedSplitItemIds.includes(item.id)
                        ? "bg-[#cfe8ff]"
                        : item.paymentState === "paid"
                          ? "bg-[#eef0eb]"
                          : pendingItemQuotaIds.has(item.id)
                            ? "bg-[#f6efe1]"
                          : "",
                      index !== serviceItems.length - 1 ? "border-b border-[#e1ddd4]" : "",
                    ].join(" ")}
                  >
                    <div className="font-semibold text-[#433d36]">{`${item.quantity}x`}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#2e2a25]">{item.name}</div>
                      <div className="mt-1 text-[11px] text-[#6a645b]">
                        {item.paymentState === "paid"
                          ? "Pagato"
                          : pendingItemQuotaIds.has(item.id)
                            ? "Gia assegnato a un sotto-conto"
                            : splitMode === "items"
                            ? selectedSplitItemIds.includes(item.id)
                              ? "Selezionato"
                              : "Disponibile"
                            : "Da pagare"}
                      </div>
                    </div>
                    <div className="text-right font-semibold text-[#433d36]">
                      {formatEuro(item.unitPrice * item.quantity)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="rounded-[4px] border border-[#d8d5cc] bg-white p-3">
            <div className="text-xs font-semibold uppercase text-[#5d564e]">Riepilogo pagamento</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6a645b]">Totale originale</span>
                <span className="font-semibold text-[#2e2a25]">{formatEuro(paymentBaseSubtotal)}</span>
              </div>
              {currentTable?.selectedRewardDiscount ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">
                    Premio fidelity {currentTable.selectedRewardName || ""}
                  </span>
                  <span className="font-semibold text-[#8a3434]">
                    -{formatEuro(currentTable.selectedRewardDiscount)}
                  </span>
                </div>
              ) : null}
              {paymentAdjustments.map((adjustment) => (
                <div key={adjustment.id} className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">
                    {adjustment.type === "fixed-discount"
                      ? `Sconto fisso ${adjustment.base}`
                      : adjustment.type === "percent-discount"
                        ? `Sconto ${adjustment.inputValue}% ${adjustment.base}`
                        : `Maggiorazione ${adjustment.inputValue}% ${adjustment.base}`}
                  </span>
                  <span
                    className={[
                      "font-semibold",
                      adjustment.type === "percent-surcharge" ? "text-[#0b3c5d]" : "text-[#8a3434]",
                    ].join(" ")}
                  >
                    {adjustment.type === "percent-surcharge" ? "+" : "-"}
                    {formatEuro(adjustment.amount)}
                  </span>
                </div>
              ))}
              <div className="border-t border-dashed border-[#d8d5cc] pt-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[#2e2a25]">Totale finale</span>
                  <span className="text-base font-bold text-[#0b3c5d]">
                    {formatEuro(paymentAdjustedTotal)}
                  </span>
                </div>
              </div>
              {paymentChangeDue !== null ? (
                <div className="border-t border-dashed border-[#d8d5cc] pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-[#2e2a25]">Resto</span>
                    <span className="text-base font-bold text-[#2e7d32]">
                      {formatEuro(paymentChangeDue)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {linkedFidelityCustomer ? (
            <div className="rounded-[4px] border border-[#d8d5cc] bg-white p-3">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">Riepilogo fidelity</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">Cliente fidelity</span>
                  <span className="font-semibold text-[#2e2a25]">
                    {linkedFidelityCustomer.firstName} {linkedFidelityCustomer.lastName}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">Punti disponibili prima del pagamento</span>
                  <span className="font-semibold text-[#2e2a25]">
                    {currentTable?.pointsBeforePayment ?? linkedFidelityCustomer.currentPoints}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">Premio applicato</span>
                  <span className="font-semibold text-[#2e2a25]">
                    {currentTable?.selectedRewardName || "nessuno"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">Punti usati</span>
                  <span className="font-semibold text-[#8a3434]">
                    {currentTable?.selectedRewardPoints ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">Totale sconto applicato</span>
                  <span className="font-semibold text-[#8a3434]">
                    {formatEuro(currentTable?.selectedRewardDiscount ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">Punti che verranno caricati</span>
                  <span className="font-semibold text-[#0b3c5d]">{estimatedEarnedPoints}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6a645b]">Punti residui stimati</span>
                  <span className="font-semibold text-[#0b3c5d]">
                    {estimatedFinalPointsBalance ?? linkedFidelityCustomer.currentPoints}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderPaymentFinalSummaryPanel = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        <div className="rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] px-3 py-3">
          <div className="text-[11px] font-semibold uppercase text-[#6a645b]">Subtotale iniziale</div>
          <div className="mt-1 text-lg font-bold text-[#2e2a25]">{formatEuro(paymentBaseSubtotal)}</div>
        </div>
        <div className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 py-3">
          <div className="text-[11px] font-semibold uppercase text-[#6a645b]">Sconti / maggiorazioni</div>
          <div className="mt-1 text-sm font-semibold text-[#2e2a25]">
            {paymentAdjustments.length > 0
              ? paymentAdjustments
                  .map((adjustment) =>
                    adjustment.type === "percent-surcharge"
                      ? `+${formatEuro(adjustment.amount)}`
                      : `-${formatEuro(adjustment.amount)}`
                  )
                  .join(" · ")
              : "Nessuna modifica"}
          </div>
        </div>
        <div className="rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] px-3 py-3">
          <div className="text-[11px] font-semibold uppercase text-[#5b6f83]">Totale finale da pagare</div>
          <div className="mt-1 text-lg font-bold text-[#0b3c5d]">{formatEuro(paymentAdjustedTotal)}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{renderPaymentSummaryPanel()}</div>
    </div>
  );

  const renderPaymentCalculatorPanel = () => (
    <div className="flex min-h-0 flex-1 flex-col rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-3">
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-[#6a645b]">Subtotale ordine</div>
          <div className="mt-1 font-bold text-[#2e2a25]">{formatEuro(paymentBaseSubtotal)}</div>
        </div>
        <div className="rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-[#5b6f83]">Totale finale</div>
          <div className="mt-1 font-bold text-[#0b3c5d]">{formatEuro(paymentAdjustedTotal)}</div>
        </div>
      </div>
      <div className="rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-3">
        <div className="text-[11px] font-semibold uppercase text-[#6a645b]">Display</div>
        <div className="mt-2 text-right text-2xl font-bold text-[#2e2a25]">
          {paymentCalculatorValue}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleLoadPaymentSubtotal}
          disabled={!canEditPaymentCalculator}
          className={[
            "h-10 rounded-[4px] border text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50",
            paymentCalculationBase === "TOT"
              ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
              : "border-[#c7c1b6] bg-white text-[#2e2a25]",
          ].join(" ")}
        >
          SUBTOTALE
        </button>
        <button
          type="button"
          onClick={() => {
            setPaymentCalculationBase("TOT");
            setPaymentCalculatorValue(String(roundCurrency(paymentAdjustedTotal)));
            setPaymentChangeDue(null);
            setStatusMessage("Totale finale caricato nel display");
          }}
          disabled={!canEditPaymentCalculator}
          className={[
            "h-10 rounded-[4px] border text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50",
            paymentCalculationBase === "TOT"
              ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
              : "border-[#c7c1b6] bg-white text-[#2e2a25]",
          ].join(" ")}
        >
          TOT
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_110px] gap-2">
        <div className="grid grid-cols-3 gap-2">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "00", "."].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => appendCalculatorValue(key)}
              disabled={!canEditPaymentCalculator}
              className="h-12 rounded-[4px] border border-[#c7c1b6] bg-white text-base font-bold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setPaymentCalculatorValue("0")}
            disabled={!canEditPaymentCalculator}
            className="h-12 rounded-[4px] border border-[#e5c8c8] bg-[#fff5f5] text-sm font-bold text-[#8a3434] disabled:cursor-not-allowed disabled:opacity-50"
          >
            C
          </button>
          <button
            type="button"
            onClick={() => setPaymentCalculatorValue(String(getPaymentCalculatorNumericValue()))}
            disabled={!canEditPaymentCalculator}
            className="h-12 rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] text-sm font-bold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
          >
            x
          </button>
          <button
            type="button"
            onClick={() => applyPaymentAdjustment("fixed-discount")}
            disabled={!hasPermission("canApplyDiscounts")}
            className="h-12 rounded-[4px] border border-[#d8d5cc] bg-white text-sm font-bold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => applyPaymentAdjustment("percent-discount")}
            disabled={!hasPermission("canApplyDiscounts")}
            className="h-12 rounded-[4px] border border-[#d8d5cc] bg-white text-sm font-bold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
          >
            %-
          </button>
          <button
            type="button"
            onClick={() => applyPaymentAdjustment("percent-surcharge")}
            disabled={!hasPermission("canApplySurcharges")}
            className="h-12 rounded-[4px] border border-[#d8d5cc] bg-white text-sm font-bold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
          >
            %+
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={resetPaymentAdjustments}
          disabled={!canEditPaymentCalculator}
          className="h-11 rounded-[4px] border border-[#d8d5cc] bg-white text-xs font-bold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset modifiche
        </button>
        <button
          type="button"
          onClick={() => {
            setPaymentCalculatorValue(String(roundCurrency(paymentAdjustedTotal)));
            setPaymentChangeDue(null);
            setPaymentStep("confirm");
            setStatusMessage("Totale finale pronto per il pagamento");
          }}
          disabled={!canConfirmPayments}
          className="h-11 rounded-[4px] border border-[#a9c9e6] bg-[#eef6ff] text-xs font-bold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Vai al pagamento
        </button>
      </div>
    </div>
  );

  const renderPaymentControlsPanel = () => {
    const paymentControlsContent = (
      <div className="space-y-4">
          <div className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">Intestatario fattura</div>
              <button
                type="button"
                onClick={() => {
                  setFidelityScannerContext("payment-panel");
                  setIsFidelityScannerOpen(true);
                }}
                className="flex h-9 items-center justify-center gap-2 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-xs font-semibold text-[#2e2a25]"
                aria-label="Scansiona tessera fidelity"
              >
                <ScanIcon className="h-4 w-4" />
                Fidelity
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Cliente</div>
                <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                  <input
                    value={getCustomerLabel(selectedCustomer, preOrderCustomer)}
                    readOnly
                    placeholder="Seleziona cliente"
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none placeholder:text-[#9b9489]"
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenDetailPicker("customer")}
                    disabled={!canAssignCustomer}
                    className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-lg font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Apri selezione cliente"
                  >
                    +
                  </button>
                </div>
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Azienda</div>
                <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                  <input
                    value={getCompanyLabel(selectedCompany, preOrderCompany)}
                    readOnly
                    placeholder="Seleziona azienda"
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none placeholder:text-[#9b9489]"
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenDetailPicker("company")}
                    disabled={!canAssignCompany}
                    className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-lg font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Apri selezione azienda"
                  >
                    +
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-[#5d564e]">Cliente fidelity</div>
                  <div className="mt-1 text-sm text-[#2e2a25]">
                    {linkedFidelityCustomer
                      ? `${linkedFidelityCustomer.firstName} ${linkedFidelityCustomer.lastName}`.trim()
                      : "Nessuna tessera associata"}
                  </div>
                </div>
                {currentTable?.fidelityScannedBeforePayment ? (
                  <span className="inline-flex rounded-full bg-[#e6f5e8] px-2 py-1 text-[11px] font-semibold text-[#25613a]">
                    cliente fidelity collegato
                  </span>
                ) : null}
              </div>

              {linkedFidelityCustomer ? (
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#5d564e] sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase text-[#7b7369]">Codice riconosciuto</div>
                    <div className="mt-1 font-medium text-[#2e2a25]">
                      {currentTable?.fidelityQrCodeValue ||
                        currentTable?.fidelityCardCode ||
                        linkedFidelityCustomer.qrCodeValue ||
                        linkedFidelityCustomer.cardCode ||
                        "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-[#7b7369]">Punti disponibili</div>
                    <div className="mt-1 font-medium text-[#0b3c5d]">
                      {currentTable?.pointsBeforePayment ?? linkedFidelityCustomer.currentPoints}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-[#7b7369]">Premio selezionato</div>
                    <div className="mt-1 font-medium text-[#2e2a25]">
                      {currentTable?.selectedRewardName || "Nessuno"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-[#7b7369]">Punti che verranno caricati</div>
                    <div className="mt-1 font-medium text-[#0b3c5d]">{estimatedEarnedPoints}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-[#7b7369]">
                  Scansiona barcode o QR prima del pagamento per marcare il conto come idoneo ai punti.
                </div>
              )}

              {linkedFidelityCustomer ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScannedFidelityCustomer(linkedFidelityCustomer);
                      setFidelityPanelStep("choice");
                      setIsFidelityPanelOpen(true);
                    }}
                    className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                  >
                    Gestisci fidelity
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearFidelitySelection();
                      setScannedFidelityCustomer(null);
                      setStatusMessage("Associazione fidelity rimossa");
                    }}
                    className="h-10 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                  >
                    Rimuovi
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-3">
            <div className="text-xs font-semibold uppercase text-[#5d564e]">Documento fiscale</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { id: "SCONTRINO", label: "Scontrino" },
                { id: "SCONTRINO_PARLANTE", label: "Scontrino parlante" },
                { id: "FATTURA", label: "Fattura" },
              ] as const).map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setDocumentMode(document.id)}
                  className={[
                    "h-10 rounded-[4px] border px-3 text-xs font-semibold",
                    documentMode === document.id
                      ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                      : "border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25]",
                  ].join(" ")}
                >
                  {document.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-3">
            <div className="text-xs font-semibold uppercase text-[#5d564e]">Metodo di pagamento</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {enabledPaymentMethods.length > 0 ? (
                enabledPaymentMethods.map((method) =>
                  method.id === "FIDELITY" ? (
                    <div key={method.id} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod(method.id)}
                        disabled={!isPaymentMethodSelectionAllowed(method.id)}
                        className={[
                          "h-10 rounded-[4px] border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                          paymentMethod === method.id
                            ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                            : "border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25]",
                        ].join(" ")}
                      >
                        {method.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFidelityScannerContext("payment-method");
                          setPaymentMethod(method.id);
                          setIsFidelityScannerOpen(true);
                        }}
                        disabled={!isPaymentMethodSelectionAllowed(method.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Apri scanner QR fidelity"
                      >
                        <ScanIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      disabled={!isPaymentMethodSelectionAllowed(method.id)}
                      className={[
                        "h-10 rounded-[4px] border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                        paymentMethod === method.id
                          ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                          : "border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25]",
                      ].join(" ")}
                    >
                      {method.label}
                    </button>
                  )
                )
              ) : (
                <div className="rounded-[4px] border border-dashed border-[#d8d5cc] bg-white px-3 py-3 text-sm text-[#7a736a] sm:col-span-2">
                  Nessun metodo di pagamento attivo. Abilita almeno un metodo da Impostazioni &gt; Pagamenti.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase text-[#5d564e]">Divisione conto</div>
              {splitBillState ? (
                <button
                  type="button"
                  onClick={clearSplitBillState}
                  className="h-8 rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-[11px] font-semibold text-[#2e2a25]"
                >
                  Reset divisione
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { id: "people", label: "Dividi per persone" },
                { id: "amount", label: "Dividi per importo" },
                { id: "items", label: "Separa prodotti" },
              ] as const).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => activateSplitMode(mode.id)}
                  className={[
                    "h-10 rounded-[4px] border px-3 text-xs font-semibold",
                    splitMode === mode.id
                      ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                      : "border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25]",
                  ].join(" ")}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {splitMode === "people" ? (
              <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                <div className="grid grid-cols-[120px_minmax(0,1fr)_140px] items-center gap-3">
                  <div className="text-xs font-semibold uppercase text-[#5d564e]">Persone</div>
                  <select
                    value={romanSplitGuests}
                    onChange={(event) => setRomanSplitGuests(event.target.value)}
                    className="h-10 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleGeneratePeopleQuotas}
                    className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                  >
                    Genera quote
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] px-3 py-2">
                    <div className="text-[11px] uppercase text-[#6a645b]">Totale da dividere</div>
                    <div className="mt-1 font-bold text-[#2e2a25]">{formatEuro(remainingTotal)}</div>
                  </div>
                  <div className="rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] px-3 py-2">
                    <div className="text-[11px] uppercase text-[#5b6f83]">Residuo ancora da pagare</div>
                    <div className="mt-1 font-bold text-[#0b3c5d]">{formatEuro(remainingTotal)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {splitMode === "amount" ? (
              <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={splitCustomAmount}
                    onChange={(event) => setSplitCustomAmount(event.target.value)}
                    placeholder="Importo quota"
                    className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddAmountQuota(false)}
                    className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                  >
                    Aggiungi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddAmountQuota(true)}
                    disabled={splitCreationAvailableAmount <= 0}
                    className="h-10 rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Tutto il residuo
                  </button>
                </div>
                <div className="mt-3 text-sm text-[#6a645b]">
                  Disponibile da assegnare: <span className="font-bold text-[#2e2a25]">{formatEuro(splitCreationAvailableAmount)}</span>
                </div>
              </div>
            ) : null}

            {splitMode === "items" ? (
              <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-[#5d564e]">Prodotti selezionati</div>
                    <div className="mt-1 text-sm font-bold text-[#0b3c5d]">{formatEuro(selectedSplitTotal)}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-[11px] uppercase text-[#6a645b]">Residuo principale</div>
                    <div className="mt-1 font-bold text-[#2e2a25]">{formatEuro(unassignedPayableTotal)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateItemSplitQuota}
                  disabled={selectedSplitItemIds.length === 0}
                  className="mt-3 h-10 w-full rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Crea sotto-conto dai prodotti selezionati
                </button>
              </div>
            ) : null}

            {splitQuotas.length > 0 ? (
              <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase text-[#5d564e]">Quote create</div>
                  <div className="text-xs font-semibold text-[#6a645b]">
                    Residuo: {formatEuro(remainingTotal)}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {splitQuotas.map((quota) => (
                    <div
                      key={quota.id}
                      className={[
                        "rounded-[4px] border px-3 py-3",
                        quota.status === "paid"
                          ? "border-[#cfe5cf] bg-[#f1fbf1]"
                          : activeSplitQuotaId === quota.id
                            ? "border-[#a9c9e6] bg-[#eef7ff]"
                            : "border-[#e1ddd4] bg-[#fffefb]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#2e2a25]">{quota.label}</div>
                          <div className="mt-1 text-xs text-[#6a645b]">
                            {quota.mode === "items"
                              ? `${quota.itemIds?.length ?? 0} prodotti`
                              : quota.mode === "people"
                                ? "Quota persona"
                                : "Quota importo"}
                          </div>
                          <div className="mt-1 text-xs text-[#6a645b]">
                            {quota.status === "paid"
                              ? `Pagata con ${quota.paymentMethod || "metodo non specificato"}`
                              : "Da pagare"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-[#0b3c5d]">{formatEuro(quota.amount)}</div>
                          <div className="mt-2 flex gap-2">
                            {quota.status === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setActiveSplitQuotaId(quota.id)}
                                  className="h-8 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-[11px] font-semibold text-[#0b3c5d]"
                                >
                                  Paga quota
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSplitQuota(quota.id)}
                                  className="h-8 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-[11px] font-semibold text-[#2e2a25]"
                                >
                                  Rimuovi
                                </button>
                              </>
                            ) : (
                              <span className="inline-flex h-8 items-center rounded-[4px] border border-[#b9d8b9] bg-white px-3 text-[11px] font-semibold text-[#2f6c2f]">
                                Pagata
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {isQuickDiscountPanelOpen ? (
            <div className="mb-3 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-3">
              <div className="text-[11px] font-semibold uppercase text-[#5d564e]">
                Modifica rapida totale tavolo
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-[4px] border border-[#d8d5cc] bg-white p-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-[11px] uppercase text-[#6a645b]">Totale iniziale</div>
                  <div className="mt-1 font-bold text-[#2e2a25]">{formatEuro(paymentBaseSubtotal)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-[#6a645b]">Sconto applicato</div>
                  <div className="mt-1 font-bold text-[#8a3434]">
                    -{formatEuro(appliedQuickDiscount?.amount ?? 0)}
                  </div>
                  <div className="text-[11px] text-[#7b7369]">
                    {appliedQuickDiscount?.label || "Nessuno"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-[#6a645b]">Totale finale</div>
                  <div className="mt-1 font-bold text-[#0b3c5d]">
                    {formatEuro(isQuickDiscountDraftValid ? quickDiscountPreviewTotal : paymentAdjustedTotal)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                <button
                  type="button"
                  onClick={() => applyQuickDiscount("fixed-discount", 1)}
                  disabled={!hasPermission("canApplyDiscounts")}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -1 €
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDiscount("percent-discount", 10)}
                  disabled={!hasPermission("canApplyDiscounts")}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -10%
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDiscount("percent-discount", 5)}
                  disabled={!hasPermission("canApplyDiscounts")}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -5%
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDiscount("fixed-discount", 5)}
                  disabled={!hasPermission("canApplyDiscounts")}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -5 €
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDiscount("fixed-discount", 8)}
                  disabled={!hasPermission("canApplyDiscounts")}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -8 €
                </button>
                <button
                  type="button"
                  onClick={handleResetQuickDiscount}
                  disabled={!appliedQuickDiscount}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset sconto
                </button>
              </div>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_130px] gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quickDiscountValue}
                  onChange={(event) => setQuickDiscountValue(event.target.value)}
                  placeholder="Sconto personalizzato"
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
                <select
                  value={quickDiscountMode}
                  onChange={(event) => setQuickDiscountMode(event.target.value as QuickDiscountMode)}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                >
                  <option value="euro">Euro</option>
                  <option value="percent">Percentuale</option>
                </select>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={applyCustomQuickDiscount}
                  disabled={!hasPermission("canApplyDiscounts") || !isQuickDiscountDraftValid}
                  className="col-span-2 h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Applica
                </button>
                <button
                  type="button"
                  onClick={handleCancelQuickDiscountPanel}
                  className="h-10 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25]"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : null}
      </div>
    );

    return (
      <FinalPaymentPanel
        totalLabel={formatEuro(paymentAdjustedTotal)}
        paymentMethodLabel={
          enabledPaymentMethods.find((method) => method.id === paymentMethod)?.label ||
          paymentMethod ||
          "Contanti"
        }
        documentLabel={
          documentMode === "FATTURA"
            ? "Fattura"
            : documentMode === "SCONTRINO_PARLANTE"
              ? "Scontrino parlante"
              : "Scontrino"
        }
        canConfirm={Boolean(paymentMethod) && canConfirmPayments}
        showBackToCalculator={paymentStep === "confirm"}
        onBackToCalculator={() => setPaymentStep("calculator")}
        onConfirmPayment={handleConfirmPayment}
        onReturnToTable={handleCancelPayment}
      >
        {paymentControlsContent}
      </FinalPaymentPanel>
    );
  };

  return (
    <main className="min-h-screen bg-[#fffdfa] text-[#2e2a25]">
      <div
        className={[
          "w-full border border-[#d8d5cc] bg-[#fffdfa]",
          isPalmareMode ? "flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden" : "flex h-screen min-h-screen overflow-hidden",
        ].join(" ")}
      >
        {!isPalmareMode ? <PosSidebar activeItemId="tables" /> : null}

        <div
          className={[
            "relative min-w-0 flex-1 overflow-hidden",
            isPalmareMode
              ? "flex flex-col"
              : panelMode === "payment"
                ? "grid grid-cols-1"
                : "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
          ].join(" ")}
        >
          {isPalmareMode ? (
            <PalmareOrderScreen
              tableLabel={`T.${currentTableName}`}
              totalLabel={formatEuro(panelMode === "payment" ? paymentAdjustedTotal : orderTotal)}
              operatorLabel={currentUser.displayName}
              roomLabel={currentTableRoom || "Sala"}
              statusLabel={getTableOperationalModeLabel(currentOperationalState.key, "palmare")}
              onHome={() => router.push(returnHomePath)}
              onTableToolsOpen={() => {
                setPalmareSheetTab("table");
                setIsPalmareSummaryOpen(true);
              }}
              onSearchOpen={() => setIsPalmareSearchOpen(true)}
              onBack={() => {
                if (isPalmareSearchOpen) {
                  setIsPalmareSearchOpen(false);
                  return;
                }

                if (isPalmareSummaryOpen) {
                  setIsPalmareSummaryOpen(false);
                  return;
                }

                if (showProductSelection && palmareCatalogView === "products") {
                  setPalmareCatalogView("departments");
                  setSearchValue("");
                  return;
                }

                router.push(returnHomePath);
              }}
              content={
                panelMode === "payment"
                  ? renderPalmarePaymentContent()
                  : panelMode === "detail"
                    ? renderPalmareDetailContent()
                    : panelMode === "sent-summary"
                      ? renderPalmareSummaryContent()
                      : renderPalmareDraftContent()
              }
              summaryPanel={
                panelMode === "draft" || panelMode === "edit-order"
                  ? renderPalmareLiveSummaryPanel()
                  : undefined
              }
              courseSelector={renderPalmareCourseSelector()}
              bottomBar={renderPalmareBottomBar()}
            />
          ) : (
            <>
          {panelMode === "payment" && !isPalmareMode ? null : (
          <aside
            className={[
              "relative min-h-0 bg-[#fbf8f2]",
              isPalmareMode
                ? showProductSelection
                  ? "flex min-h-[44vh] shrink-0 flex-col border-b border-[#d8d5cc] bg-[#fffefb]"
                  : showPaymentLeftPanel
                    ? "flex min-h-[38vh] shrink-0 flex-col border-b border-[#d8d5cc] bg-[#fffefb]"
                    : showOccupiedMiniMap
                      ? "flex min-h-[34vh] shrink-0 border-b border-[#d8d5cc]"
                      : "hidden"
                : showProductSelection
                  ? "grid grid-rows-[auto_minmax(0,1fr)] border-r border-[#d8d5cc]"
                  : showPaymentLeftPanel
                    ? "flex min-h-0 flex-col border-r border-[#d8d5cc] bg-[#fffefb]"
                    : "grid grid-rows-[1fr] border-r border-[#d8d5cc]",
            ].join(" ")}
          >
            {showProductSelection ? (
              <>
              <div className={isPalmareMode ? "shrink-0 border-b border-[#d8d5cc] bg-[#fbf8f2] px-3 py-2" : "border-b border-[#d8d5cc] px-3 py-2"}>
                <div className="flex h-10 w-full items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3">
                    <span className="mr-2 text-[10px] font-bold text-[#6d665e]">SRC</span>
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Cerca prodotto"
                      className="h-full w-full bg-transparent text-sm outline-none placeholder:text-[#9c9488]"
                    />
                  </div>
                </div>

                <div
                  className={[
                    "grid min-h-0",
                    isPalmareMode
                      ? "flex min-h-0 flex-1 flex-col"
                      : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "flex min-h-0 flex-col bg-[#f7f4ee]",
                      isPalmareMode ? "shrink-0 border-b border-[#d8d5cc]" : "border-r border-[#d8d5cc]",
                    ].join(" ")}
                  >
                    <div className="border-b border-[#d8d5cc] px-2 py-2 text-[11px] font-semibold uppercase text-[#5d564e]">
                      {isPalmareMode ? "Reparti" : "Categorie"}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                      <div className={isPalmareMode ? "flex gap-2 overflow-x-auto pb-1" : "space-y-1"}>
                        {categories.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => {
                              snapshotOrderState("CHANGE_CATEGORY", { category });
                              setActiveCategory(category);
                            }}
                            className={[
                              "flex items-center rounded-[4px] border px-3 text-left font-semibold",
                              isPalmareMode ? "min-h-12 text-base" : "min-h-11 text-sm",
                              isPalmareMode ? "min-w-[160px] shrink-0 justify-center" : "w-full",
                              category === activeCategory
                                ? "border-[#b7b2a7] bg-[#fffefb] text-[#2e2a25]"
                                : "border-[#d4d0c7] bg-[#ffffff] text-[#5c564f]",
                            ].join(" ")}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col bg-[#fffefb]">
                    <div className="border-b border-[#d8d5cc] px-3 py-2 text-[11px] font-semibold uppercase text-[#5d564e]">
                      {isPalmareMode ? `Prodotti · ${activeCategory}` : activeCategory}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                      {pendingSizeProduct &&
                      pendingSizeProduct.category === activeCategory &&
                      !uramakiSelectorCategories.has(pendingSizeProduct.category) ? (
                        <div className="mb-2 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                          <div className="text-xs font-semibold uppercase text-[#5d564e]">
                            Scegli formato
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#2e2a25]">
                            {pendingSizeProduct.name}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {pendingSizeProduct.sizeVariants?.map((sizeVariant) => (
                              <button
                                key={`${pendingSizeProduct.id}-${sizeVariant.id}`}
                                type="button"
                                onClick={() => handleAddSizedProduct(pendingSizeProduct, sizeVariant)}
                                disabled={!canInsertProducts}
                                className="h-11 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {`${sizeVariant.label} · ${formatEuro(sizeVariant.price)}`}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingSizeProduct(null)}
                            className="mt-2 h-9 w-full rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] px-3 text-xs font-semibold text-[#5d564e]"
                          >
                            Annulla
                          </button>
                        </div>
                      ) : null}

                      {pendingTartareProduct && pendingTartareProduct.category === activeCategory ? (
                        <div className="mb-2 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                          <div className="text-xs font-semibold uppercase text-[#5d564e]">
                            Scegli preparazione
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#2e2a25]">
                            {pendingTartareProduct.name}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {tartareChoiceMap[pendingTartareProduct.id]?.map((variant) => (
                              <button
                                key={`${pendingTartareProduct.id}-${variant.id}`}
                                type="button"
                                onClick={() => handleAddTartareVariant(pendingTartareProduct, variant)}
                                disabled={!canInsertProducts}
                                className="h-11 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {`${variant.label} · ${formatEuro(variant.price)}`}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingTartareProduct(null)}
                            className="mt-2 h-9 w-full rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] px-3 text-xs font-semibold text-[#5d564e]"
                          >
                            Annulla
                          </button>
                        </div>
                      ) : null}

                      {pastoPricingProduct && pastoPricingProduct.category === activeCategory ? (
                        <div className="mb-2 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                          <div className="text-xs font-semibold uppercase text-[#5d564e]">
                            Inserisci prezzo
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#2e2a25]">
                            {pastoPricingProduct.name}
                          </div>
                          <label className="mt-3 block">
                            <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                              Prezzo
                            </div>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={pastoCustomPrice}
                              onChange={(event) => setPastoCustomPrice(event.target.value)}
                              disabled={!canInsertProducts}
                              className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={resetPastoPricing}
                              className="h-10 rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] px-3 text-xs font-semibold text-[#5d564e]"
                            >
                              Annulla
                            </button>
                            <button
                              type="button"
                              onClick={handleAddPasto}
                              disabled={!canInsertProducts}
                              className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-xs font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Conferma
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div
                        className={[
                          "rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]",
                          isPalmareMode ? "grid grid-cols-2 gap-2 border-0 bg-transparent" : "",
                        ].join(" ")}
                      >
                        {filteredProducts.map((product, index) => {
                          const visibleProductPrice =
                            uramakiSelectorCategories.has(product.category) && product.sizeVariants?.length
                              ? (product.sizeVariants.find((variant) => variant.id === "8pz")?.price ??
                                product.price)
                              : product.price;
                          const isPricePending = Boolean(product.pricePending);

                          return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={(event) => addProductToOrder(product, event)}
                            disabled={isPricePending || !canInsertProducts}
                            className={[
                              "grid w-full grid-cols-[minmax(0,1fr)_68px] items-center gap-2 px-3 py-2 text-left text-[#2e2a25]",
                              isPalmareMode ? "min-h-[72px] rounded-[12px] border border-[#d8d5cc] bg-white text-sm shadow-[0_1px_0_rgba(0,0,0,0.02)]" : "min-h-12 text-sm",
                              isPricePending || !canInsertProducts ? "opacity-60" : "",
                              !isPalmareMode && index !== filteredProducts.length - 1 ? "border-b border-[#e1ddd4]" : "",
                            ].join(" ")}
                          >
                            <span className={isPalmareMode ? "line-clamp-2 font-semibold" : "truncate font-medium"}>
                              {product.name}
                            </span>
                            <span className="text-right text-sm font-semibold">
                              {isPricePending ? "Da definire" : formatEuro(visibleProductPrice)}
                            </span>
                          </button>
                          );
                        })}
                        {filteredProducts.length === 0 ? (
                          <div className={isPalmareMode ? "col-span-2 rounded-[12px] border border-[#d8d5cc] bg-white px-3 py-4 text-center text-sm text-[#7a736a]" : "px-3 py-3 text-sm text-[#7a736a]"}>
                            Nessun prodotto in questo reparto
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : showPaymentLeftPanel ? (
              renderPaymentControlsPanel()
            ) : showOccupiedMiniMap ? (
              <div className="flex min-h-0 flex-1 items-center justify-center bg-[#fbf8f2] px-6 text-center">
                <div className="flex h-full min-h-0 w-full flex-col rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
                  <div className="border-b border-[#d8d5cc] px-2 py-2">
                    <div className="flex items-center gap-1">
                      {rooms.map((room) => (
                        <button
                          key={room.roomId}
                          type="button"
                          onClick={() => setActiveMiniRoomId(room.roomId)}
                          className={[
                            "h-7 border px-3 text-[11px] font-semibold",
                            room.roomId === activeMiniRoomId
                              ? "border-[#b7b2a7] bg-[#fffefb] text-[#2e2a25]"
                              : "border-[#d4d0c7] bg-[#e4e0d7] text-[#5c564f]",
                          ].join(" ")}
                        >
                          {room.roomName}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-5">
                      {miniMapTables.map((table) => {
                        const isMiniOccupied = table.status === "occupied";
                        const miniPanelMode =
                          table.status === "occupied" ? "sent-summary" : "draft";

                        return (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() => {
                              console.log(
                                "OPEN TABLE",
                                table.id,
                                table.status,
                                miniPanelMode
                              );
                              router.push(
                                buildOrderRoute(table.id, miniPanelMode, deviceMode)
                              );
                            }}
                            className={[
                              "flex min-h-[72px] flex-col justify-between rounded-[4px] border px-2 py-1 text-left text-[#2e2a25]",
                              isMiniOccupied
                                ? "border-[#b7cfe4] bg-[#cfe8ff]"
                                : "border-[#d8d5cc] bg-[#f0ede3]",
                              table.id === currentTable?.id
                                ? isMiniOccupied
                                  ? "border-[#8fb7d4] bg-[#c3e1fb]"
                                  : "border-[#a8a297] bg-[#e7e2d5]"
                                : "",
                            ].join(" ")}
                          >
                            <div className="text-[9px] uppercase leading-none text-[#6e685f]">
                              {isMiniOccupied ? "Occupato" : "Libero"}
                            </div>
                            <div className="text-center text-[22px] font-bold leading-none text-[#302c26]">
                              {table.name}
                            </div>
                            <div className="text-[9px] leading-none text-[#756f67]">
                              Coperti: {table.guests}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {isPalmareMode ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {palmareCourseQuickOptions.map((option, index) => {
                      const isActiveQuickCourse = activeMode === option.mode;
                      return (
                        <button
                          key={`${option.label}-${index}`}
                          type="button"
                          onClick={() => {
                            setActiveMode(option.mode);
                            setStatusMessage(`${option.label} selezionato`);
                          }}
                          className={[
                            "h-10 shrink-0 rounded-[999px] border px-4 text-sm font-semibold",
                            isActiveQuickCourse
                              ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                              : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                          ].join(" ")}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 bg-[#fbf8f2]" />
            )}

            {configuringPoke ? (
              <PokeConfigurator
                product={configuringPoke}
                sections={pokeSections}
                onClose={() => setConfiguringPoke(null)}
                onConfirm={handleAddConfiguredPoke}
              />
            ) : null}
          </aside>
          )}

          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#fffefb]">
            <header className={isPalmareMode ? "shrink-0 border-b border-[#d8d5cc] bg-[#f7f4ee] px-3 py-3" : "border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3"}>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className={isPalmareMode ? "text-base font-bold" : "text-lg font-bold"}>{`Tavolo ${currentTableName}`}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-[#666057]">
                    <span>{`Operatore: ${currentOperator}`}</span>
                    {currentTableStatus === "free" ? (
                      <label className="flex items-center gap-2">
                        <span className="font-semibold text-[#5f5950]">Coperti</span>
                        <select
                          value={String(currentTableGuests)}
                          onChange={(event) => handleGuestChange(event.target.value)}
                          className="h-8 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-2 text-xs text-[#2e2a25] outline-none"
                        >
                          <option value="0">0</option>
                          {Array.from({ length: 8 }, (_, index) => index + 1).map((guestCount) => (
                            <option key={guestCount} value={guestCount}>
                              {guestCount}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span>{`Coperti: ${currentTableGuests}`}</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-[#6a645b]">{currentTableRoom}</div>
              </div>
            </header>

            {panelMode === "draft" || panelMode === "edit-order" ? (
              <div className={isPalmareMode ? "shrink-0 border-b border-[#d8d5cc] bg-[#fbf8f2] px-3 py-3" : "border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-2"}>
                {isPalmareMode ? (
                  <>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5d564e]">
                      Portata
                    </div>
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {courseModes.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            snapshotOrderState("CHANGE_COURSE", { course: mode, surface: "palmare" });
                            setActiveMode(mode);
                            setStatusMessage("");
                          }}
                          className={[
                            "h-11 shrink-0 rounded-[999px] border px-4 text-sm font-semibold",
                            activeMode === mode
                              ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                              : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                          ].join(" ")}
                        >
                          {mode === "RIEPILOGO" ? "Riepilogo" : getPalmareCourseLabel(mode as CourseGroup)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {courseModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          snapshotOrderState("CHANGE_COURSE", { course: mode, surface: "cassa" });
                          setActiveMode(mode);
                          setStatusMessage("");
                        }}
                        className={[
                          "border px-2 font-semibold",
                          "h-9 text-xs",
                          activeMode === mode
                            ? "border-[#b7b2a7] bg-[#fffefb] text-[#2e2a25]"
                            : "border-[#d4d0c7] bg-[#ffffff] text-[#5c564f]",
                        ].join(" ")}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                )}
                {panelMode === "edit-order" && isVoidSelectionMode ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleVoidSelectedItems}
                      disabled={selectedVoidItemIds.length === 0}
                      className="h-9 border border-[#d9b5b5] bg-[#fce8e8] px-2 text-xs font-semibold text-[#7c2626] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      STORNA SELEZIONATI
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsVoidSelectionMode(false);
                        setSelectedVoidItemIds([]);
                        setStatusMessage("");
                      }}
                      className="h-9 border border-[#c7c1b6] bg-[#ffffff] px-2 text-xs font-semibold text-[#2e2a25]"
                    >
                      ANNULLA SELEZIONE
                    </button>
                  </div>
                ) : null}
              </div>
            ) : panelMode === "sent-summary" || panelMode === "detail" ? (
              <div className="border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-2">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                  <button
                    type="button"
                    onClick={handleOpenDetail}
                    disabled={!canEditTables}
                    className="h-9 border border-[#c7c1b6] bg-[#ffffff] px-2 text-xs font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    DETTAGLIO ORDINE
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenSentEdit}
                    disabled={!canEditOrders}
                    className="h-9 border border-[#c7c1b6] bg-[#ffffff] px-2 text-xs font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    MODIFICHE ORDINAZIONI
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUtilityMenuOpen((current) => !current);
                        setIsRistampaOpen(false);
                      }}
                      className="flex h-9 w-9 items-center justify-center border border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25]"
                      aria-label="Utility"
                      title="Utility"
                    >
                      <GearIcon className="h-4 w-4" />
                    </button>

                    {isUtilityMenuOpen ? (
                      <div className="absolute right-0 top-10 z-20 w-52 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
                        <button
                          type="button"
                          onClick={() => handleUtilityAction("stampa-preconto")}
                          className="flex h-9 w-full items-center border-b border-[#e1ddd4] px-3 text-left text-xs font-semibold text-[#2e2a25] hover:bg-[#fbf8f2]"
                        >
                          Stampa preconto
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUtilityAction("sposta")}
                          className="flex h-9 w-full items-center border-b border-[#e1ddd4] px-3 text-left text-xs font-semibold text-[#2e2a25] hover:bg-[#fbf8f2]"
                        >
                          Sposta ordine
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUtilityAction("ristampa-reparti")}
                          className="flex h-9 w-full items-center justify-between border-b border-[#e1ddd4] px-3 text-left text-xs font-semibold text-[#2e2a25] hover:bg-[#fbf8f2]"
                        >
                          <span>Ristampa reparti</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUtilityAction("storno-multiplo")}
                          className="flex h-9 w-full items-center border-b border-[#e1ddd4] px-3 text-left text-xs font-semibold text-[#2e2a25] hover:bg-[#fbf8f2]"
                        >
                          Storno multiplo prodotti
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUtilityAction("storno-tavolo")}
                          className="flex h-9 w-full items-center border-b border-[#e1ddd4] px-3 text-left text-xs font-semibold text-[#7c2626] hover:bg-[#f6e3e3]"
                        >
                          Storno intero tavolo
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteOrder}
                          className="flex h-9 w-full items-center px-3 text-left text-xs font-semibold text-[#2e2a25] hover:bg-[#fbf8f2]"
                        >
                          Cancella ordine
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

	            <div
	              className={
                panelMode === "payment"
                  ? isPalmareMode
                    ? "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 pb-28"
                    : "flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3"
                  : isPalmareMode
                    ? "flex-1 overflow-y-auto px-3 py-3 pb-28"
                    : "flex-1 overflow-y-auto px-4 py-3"
              }
            >
              {isFinalizingPayment ? (
                <div className="flex h-full min-h-0 flex-1 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] p-6">
                  <div className="text-center">
                    <div className="text-sm font-semibold uppercase text-[#5d564e]">Chiusura pagamento...</div>
                    <div className="mt-2 text-xs text-[#7b7369]">Ritorno alla home tavoli in corso.</div>
                  </div>
                </div>
              ) : panelMode === "payment" ? (
                <div
                  className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-5"
                  style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#fffefb]">
                    {renderPaymentControlsPanel()}
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#fffefb] p-4 lg:p-5">
                    <div className="flex items-center justify-between gap-3 border-b border-[#d8d5cc] pb-2">
                      <div className="text-sm font-semibold uppercase text-[#5d564e]">
                        {paymentStep === "calculator" ? "Calcolo importo" : "Riepilogo finale pagamento"}
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelPayment}
                        className="inline-flex h-10 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-4 text-sm font-semibold text-[#2e2a25] hover:bg-[#fbf8f2]"
                      >
                        Torna al tavolo
                      </button>
                    </div>
                    <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
                      {paymentStep === "calculator"
                        ? renderPaymentCalculatorPanel()
                        : renderPaymentFinalSummaryPanel()}
                    </div>
                  </div>
                </div>
              ) : panelMode === "detail" ? (
                <div className="flex min-h-full flex-col">
                  <div className="border-b border-[#d8d5cc] pb-2 text-sm font-semibold uppercase text-[#5d564e]">
                    Dettaglio ordine
                  </div>
                  <div className="mt-3 space-y-3 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Sala</div>
                        <input
                          value={currentTableRoom}
                          readOnly
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Operatore</div>
                        <input
                          value={currentOperator}
                          readOnly
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Cliente</div>
                        <input
                          value={preOrderCustomer}
                          readOnly
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Azienda</div>
                        <input
                          value={preOrderCompany}
                          readOnly
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm outline-none"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Tavolo</div>
                      <input
                        value={detailName}
                        onChange={(event) => setDetailName(event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Prezzo coperto</div>
                        <select
                          value={preOrderServicePrice}
                          onChange={(event) => setPreOrderServicePrice(event.target.value)}
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                        >
                          {servicePriceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Coperti</div>
                        <select
                          value={detailGuests}
                          onChange={(event) => setDetailGuests(event.target.value)}
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                        >
                          {Array.from({ length: 9 }, (_, index) => index).map((guestCount) => (
                            <option key={guestCount} value={guestCount}>
                              {guestCount}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Note ordine</div>
                      <textarea
                        value={detailNote}
                        onChange={(event) => setDetailNote(event.target.value)}
                        className="min-h-[140px] w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
                      />
                    </label>
                  </div>
                </div>
              ) : activeMode === "RIEPILOGO" ? (
                <div className="space-y-5">
                  {groupedItems.map((group) => renderCourseSection(group.course, group.items))}
                  {serviceItems.length > 0 ? renderCourseSection("SERVIZI", serviceItems) : null}
                  {currentTable?.selectedRewardDiscount ? (
                    <div className="rounded-[4px] border border-[#d8d5cc] bg-white p-4">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div>
                          <div className="font-semibold text-[#2e2a25]">Premio Fidelity</div>
                          <div className="mt-1 text-xs text-[#6a645b]">
                            {currentTable.selectedRewardName || "Premio applicato"}
                          </div>
                        </div>
                        <div className="font-bold text-[#8a3434]">
                          -{formatEuro(currentTable.selectedRewardDiscount)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {linkedFidelityCustomer ? (
                    <div className="rounded-[4px] border border-[#d8d5cc] bg-white p-4">
                      <div className="text-xs font-semibold uppercase text-[#5d564e]">Riepilogo fidelity</div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#5d564e] sm:grid-cols-2">
                        <div>
                          <div className="text-[11px] uppercase text-[#7b7369]">Cliente fidelity</div>
                          <div className="mt-1 font-semibold text-[#2e2a25]">
                            {linkedFidelityCustomer.firstName} {linkedFidelityCustomer.lastName}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase text-[#7b7369]">Punti disponibili</div>
                          <div className="mt-1 font-semibold text-[#0b3c5d]">
                            {currentTable?.pointsBeforePayment ?? linkedFidelityCustomer.currentPoints}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase text-[#7b7369]">Premio applicato</div>
                          <div className="mt-1 font-semibold text-[#2e2a25]">
                            {currentTable?.selectedRewardName || "nessuno"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase text-[#7b7369]">Punti residui stimati</div>
                          <div className="mt-1 font-semibold text-[#0b3c5d]">
                            {estimatedFinalPointsBalance ?? linkedFidelityCustomer.currentPoints}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-full flex-col">
                  {renderCourseSection(
                    getCourseTitle(activeMode),
                    activeCourseItems,
                    "Nessun piatto inserito"
                  )}
                </div>
	              )}
	            </div>
	            {renderQuantityPickerOverlay()}
	            {renderQuantityPickerOverlay()}
	            {renderSizeSelectorOverlay()}

              {isPrebillConfirmOpen ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 px-6">
                  <div className="w-full max-w-[420px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-4">
                    <div className="text-sm font-bold text-[#2e2a25]">Stampa preconto</div>
                    <div className="mt-2 text-sm text-[#5d564e]">
                      {`Vuoi stampare il preconto del ${getCurrentTableLabel()}?`}
                    </div>
                    <div className="mt-3 rounded-[4px] border border-[#e1ddd4] bg-white px-3 py-2 text-xs text-[#5d564e]">
                      <div>{`Coperti: ${currentTableGuests}`}</div>
                      <div>{`Operatore: ${currentOperator}`}</div>
                      <div>{`Totale provvisorio: ${formatEuro(paymentAdjustedTotal)}`}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPrebillConfirmOpen(false)}
                        className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmPrebillPrint}
                        className="h-10 border border-[#8db5d4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                      >
                        Stampa
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {pendingVoidAction ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 px-6">
                  <div className="w-full max-w-[520px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-4">
                    <div className="text-sm font-bold text-[#2e2a25]">{pendingVoidAction.title}</div>
                    <div className="mt-2 text-sm text-[#5d564e]">{pendingVoidAction.message}</div>
                    <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto rounded-[4px] border border-[#e1ddd4] bg-white p-3">
                      {pendingVoidAction.items.length > 0 ? (
                        pendingVoidAction.items.map((item) => (
                          <div
                            key={`${item.productId}-${item.itemId ?? item.name}`}
                            className="flex items-center justify-between gap-3 rounded-[4px] border border-[#f0ece4] px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-[#2e2a25]">{item.name}</div>
                              <div className="mt-1 text-[#6a645b]">
                                {`${item.quantity}x · ${getDepartmentDisplayName(item.department)}`}
                              </div>
                            </div>
                            <div className="shrink-0 text-[11px] font-semibold uppercase text-[#7b7369]">
                              {item.printerRole}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-[#6a645b]">
                          Nessun prodotto inviato da stampare: lo storno verrà solo registrato internamente.
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-xs font-semibold uppercase text-[#5d564e]">
                      {pendingVoidAction.allowPrint
                        ? "Vuoi stampare lo storno sulla stampante del reparto di riferimento?"
                        : "Nessuna stampa richiesta per prodotti non ancora inviati"}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingVoidAction(null)}
                        className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        onClick={() => finalizeVoidAction(false)}
                        className="h-10 border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25]"
                      >
                        Non stampare
                      </button>
                      <button
                        type="button"
                        onClick={() => finalizeVoidAction(true)}
                        disabled={!pendingVoidAction.allowPrint}
                        className="h-10 border border-[#d9b5b5] bg-[#fce8e8] px-3 text-sm font-semibold text-[#7c2626] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Stampa storno
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

	            {deleteConfirmItem ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 px-6">
                <div className="w-full max-w-[360px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-4">
                  <div className="text-sm font-bold text-[#2e2a25]">Conferma eliminazione</div>
                  <div className="mt-2 text-sm text-[#5d564e]">
                    {`Cancellare ${deleteConfirmItem.name}?`}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmItem(null);
                        setRevealedDeleteItemId(null);
                      }}
                      className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={confirmDeleteItem}
                      className="h-10 border border-[#d97070] bg-[#f3d0d0] px-3 text-sm font-semibold text-[#7c2626]"
                    >
                      Sì
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {noteEditorItem ? (
              <div
                className={[
                  "absolute inset-0 z-30 bg-black/20",
                  isPalmareMode ? "flex items-end" : "flex items-center justify-center px-6",
                ].join(" ")}
              >
                <div
                  className={[
                    "w-full border border-[#d8d5cc] bg-[#ffffff]",
                    isPalmareMode
                      ? "max-h-[86vh] overflow-y-auto rounded-t-[20px] px-4 pb-6 pt-4"
                      : "max-w-[420px] rounded-[4px] p-4",
                  ].join(" ")}
                >
                  <div className="text-sm font-bold text-[#2e2a25]">Note / Modificatori</div>
                  <div className="mt-1 text-sm font-semibold text-[#5d564e]">
                    {noteEditorItem.name}
                  </div>

                  {isPalmareMode ? (
                    <div className="mt-3">
                      <div className="mb-2 text-xs font-semibold uppercase text-[#5d564e]">
                        Note rapide
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {palmareQuickNotes.map((quickNote) => (
                          <button
                            key={quickNote}
                            type="button"
                            onClick={() => handleApplyPalmareQuickNote(quickNote)}
                            className="min-h-10 rounded-[999px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm font-semibold text-[#2e2a25]"
                          >
                            {quickNote}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <label className="mt-3 block">
                    <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                      Note libere
                    </div>
                    <textarea
                      value={noteEditorValue}
                      onChange={(event) => setNoteEditorValue(event.target.value)}
                      className={[
                        "w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none",
                        isPalmareMode ? "min-h-[120px]" : "min-h-[132px]",
                      ].join(" ")}
                    />
                  </label>

                  <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                          Prezzo attuale
                        </div>
                        <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-sm text-[#2e2a25]">
                          {formatEuro(noteEditorItem.unitPrice)}
                        </div>
                      </div>
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                          Modifica prezzo
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={noteEditorPrice}
                          onChange={(event) => setNoteEditorPrice(event.target.value)}
                          disabled={!hasPermission("canAccessBasePrices")}
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white">
                    <button
                      type="button"
                      onClick={() => setIsAdditionsOpen((current) => !current)}
                      className="flex h-10 w-full items-center justify-between px-3 text-left text-xs font-semibold uppercase text-[#5d564e]"
                    >
                      <span>Aggiunte</span>
                      <span>{isAdditionsOpen ? "-" : "+"}</span>
                    </button>
                    {isAdditionsOpen ? (
                      <div className="max-h-[164px] overflow-y-auto border-t border-[#e1ddd4] p-2">
                        <div className="grid grid-cols-2 gap-2">
                          {modifierOptions.map((option) => (
                            <button
                              key={`addition-${option}`}
                              type="button"
                              onClick={() =>
                                toggleModifierSelection(option, setNoteEditorAdditions)
                              }
                              className={[
                                "flex min-h-10 items-center rounded-[4px] border px-3 text-left text-sm leading-tight",
                                noteEditorAdditions.includes(option)
                                  ? "border-[#b7b2a7] bg-[#f7f4ee] text-[#2e2a25]"
                                  : "border-[#d8d5cc] bg-[#ffffff] text-[#4f4941]",
                              ].join(" ")}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white">
                    <button
                      type="button"
                      onClick={() => setIsRemovalsOpen((current) => !current)}
                      className="flex h-10 w-full items-center justify-between px-3 text-left text-xs font-semibold uppercase text-[#5d564e]"
                    >
                      <span>Rimozioni</span>
                      <span>{isRemovalsOpen ? "-" : "+"}</span>
                    </button>
                    {isRemovalsOpen ? (
                      <div className="max-h-[164px] overflow-y-auto border-t border-[#e1ddd4] p-2">
                        <div className="grid grid-cols-2 gap-2">
                          {modifierOptions.map((option) => (
                            <button
                              key={`removal-${option}`}
                              type="button"
                              onClick={() =>
                                toggleModifierSelection(option, setNoteEditorRemovals)
                              }
                              className={[
                                "flex min-h-10 items-center rounded-[4px] border px-3 text-left text-sm leading-tight",
                                noteEditorRemovals.includes(option)
                                  ? "border-[#b7b2a7] bg-[#f7f4ee] text-[#2e2a25]"
                                  : "border-[#d8d5cc] bg-[#ffffff] text-[#4f4941]",
                              ].join(" ")}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNoteEditorItem(null);
                        setNoteEditorValue("");
                        setNoteEditorPrice("");
                        setNoteEditorAdditions([]);
                        setNoteEditorRemovals([]);
                        setIsAdditionsOpen(false);
                        setIsRemovalsOpen(false);
                      }}
                      className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveItemNote}
                      disabled={!canEditOrders}
                      className="h-10 border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Salva
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {renderPalmareSummarySheet()}

            {wagyuPricingProduct ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 px-6">
                <div className="w-full max-w-[420px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-4">
                  <div className="text-sm font-bold text-[#2e2a25]">Wagyu Tataki</div>
                  <div className="mt-1 text-sm text-[#5d564e]">
                    Seleziona la modalita di prezzo prima di aggiungere il prodotto.
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWagyuPriceMode("per-kg")}
                      className={[
                        "h-10 rounded-[4px] border px-3 text-sm font-semibold",
                        wagyuPriceMode === "per-kg"
                          ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                          : "border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25]",
                      ].join(" ")}
                    >
                      Prezzo al chilo
                    </button>
                    <button
                      type="button"
                      onClick={() => setWagyuPriceMode("manual")}
                      className={[
                        "h-10 rounded-[4px] border px-3 text-sm font-semibold",
                        wagyuPriceMode === "manual"
                          ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                          : "border-[#c7c1b6] bg-[#ffffff] text-[#2e2a25]",
                      ].join(" ")}
                    >
                      Prezzo manuale
                    </button>
                  </div>

                  {wagyuPriceMode === "per-kg" ? (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                          Prezzo al chilo
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={wagyuPricePerKg}
                          onChange={(event) => setWagyuPricePerKg(event.target.value)}
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                          Peso / kg
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={wagyuWeight}
                          onChange={(event) => setWagyuWeight(event.target.value)}
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="mt-3 block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                        Prezzo finale
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={wagyuManualPrice}
                        onChange={(event) => setWagyuManualPrice(event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                      />
                    </label>
                  )}

                  <div className="mt-3 rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2">
                    <div className="text-[11px] uppercase text-[#5d564e]">Prezzo finale</div>
                    <div className="mt-1 text-sm font-bold text-[#2e2a25]">
                      {formatEuro(wagyuCalculatedPrice)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={resetWagyuPricing}
                      className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={handleAddWagyuTataki}
                      className="h-10 border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                    >
                      Conferma
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {isFidelityPanelOpen && activeFidelityCustomer ? (
              <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/25 px-4">
                <div className="w-full max-w-[560px] rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] p-5 shadow-[0_16px_40px_rgba(46,42,37,0.24)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-[#2e2a25]">Cliente riconosciuto</div>
                      <div className="mt-1 text-sm text-[#6d665e]">
                        {activeFidelityCustomer.firstName} {activeFidelityCustomer.lastName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFidelityPanelOpen(false);
                        setScannedFidelityCustomer(null);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-white text-lg text-[#2e2a25]"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2">
                      <div className="text-[11px] uppercase text-[#6d665e]">Codice tessera / QR</div>
                      <div className="mt-1 font-semibold text-[#2e2a25]">
                        {currentTable?.fidelityQrCodeValue ||
                          currentTable?.fidelityCardCode ||
                          activeFidelityCustomer.qrCodeValue ||
                          activeFidelityCustomer.cardCode ||
                          "—"}
                      </div>
                    </div>
                    <div className="rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2">
                      <div className="text-[11px] uppercase text-[#6d665e]">Punti disponibili</div>
                      <div className="mt-1 font-semibold text-[#0b3c5d]">
                        {activeFidelityCustomer.currentPoints}
                      </div>
                    </div>
                    <div className="rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2">
                      <div className="text-[11px] uppercase text-[#6d665e]">Stato carta</div>
                      <div className="mt-1 font-semibold text-[#2e2a25]">
                        {activeFidelityCustomer.isActive ? "Attiva" : "Non attiva"}
                      </div>
                    </div>
                    <div className="rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2">
                      <div className="text-[11px] uppercase text-[#6d665e]">Totale corrente</div>
                      <div className="mt-1 font-semibold text-[#2e2a25]">
                        {formatEuro(paymentAdjustedTotal)}
                      </div>
                    </div>
                  </div>

                  {fidelityPanelStep === "choice" ? (
                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={handleKeepAccumulatingPoints}
                        className="h-12 rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                      >
                        Accumula punti
                      </button>
                      <button
                        type="button"
                        onClick={() => setFidelityPanelStep("rewards")}
                        disabled={availableFidelityRewards.length === 0}
                        className="h-12 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Usa premio
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearFidelitySelection();
                          setIsFidelityPanelOpen(false);
                          setScannedFidelityCustomer(null);
                        }}
                        className="h-12 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[#2e2a25]">Seleziona premio</div>
                        <button
                          type="button"
                          onClick={() => setFidelityPanelStep("choice")}
                          className="text-xs font-semibold uppercase text-[#5d564e]"
                        >
                          Torna indietro
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {fidelityRewards.map((reward) => {
                          const isAvailable = activeFidelityCustomer.currentPoints >= reward.pointsRequired;
                          const appliedDiscount = Math.min(reward.discountAmount, paymentBaseSubtotal);
                          const isDisabled = !isAvailable || appliedDiscount <= 0;

                          return (
                            <div
                              key={reward.id}
                              className={[
                                "rounded-[4px] border p-3",
                                isDisabled ? "border-[#e4dfd5] bg-[#f6f3ec] text-[#8b8378]" : "border-[#d8d5cc] bg-white",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-semibold">{reward.name}</div>
                                  <div className="mt-1 text-xs">
                                    Richiede {reward.pointsRequired} punti · sconto {formatEuro(reward.discountAmount)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => handleSelectFidelityReward(reward)}
                                  className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:border-[#ddd8cf] disabled:bg-[#fbf8f2] disabled:text-[#8b8378]"
                                >
                                  Seleziona
                                </button>
                              </div>
                              {!isAvailable ? (
                                <div className="mt-2 text-xs">Nessun premio disponibile</div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-xs text-[#5d564e]">
                    I punti verranno aggiornati al termine del pagamento.
                  </div>
                </div>
              </div>
            ) : null}

            <CodeScannerModal
              isOpen={isFidelityScannerOpen}
              title="Scanner Fidelity Card"
              description="Leggi barcode tessera o QR code Linky per associare il cliente fidelity al conto."
              defaultType="auto"
              onClose={() => setIsFidelityScannerOpen(false)}
              onDetected={(value, scanType) => {
                handleFidelityScannerDetected(value, scanType);
                setIsFidelityScannerOpen(false);
              }}
            />

            {panelMode === "payment" || isPalmareMode ? null : (
            <footer className="shrink-0 border-t border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
              {statusMessage ? (
                <div
                  className={[
                    "mb-2 text-xs font-semibold uppercase",
                    isPalmareMode
                      ? "rounded-[10px] border border-[#d7cfbf] bg-[#fff7de] px-3 py-2 text-[#7b5b12]"
                      : "text-[#5d564e]",
                  ].join(" ")}
                >
                  {statusMessage}
                </div>
              ) : null}

	              {panelMode === "draft" || panelMode === "edit-order" ? (
	                <div
	                  className={[
	                    "grid grid-cols-2 gap-2",
	                    canResetEmptyTable
	                      ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
	                      : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]",
	                  ].join(" ")}
	                >
	                  <button
	                    type="button"
	                    onClick={() => {
                      setActiveMode("RIEPILOGO");
                      setStatusMessage("");
                    }}
                    className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25]"
                  >
                    RIEPILOGO
                  </button>
                  <button
                    type="button"
                    onClick={handleSendOrder}
                    disabled={!canSendOrders || !hasPendingOrderItems}
                    className="h-12 border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] hover:bg-[#bfe0ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasPendingOrderItems ? "INVIA COMANDA" : "NESSUNA NUOVA COMANDA"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    disabled={!canSaveOrderChanges}
                    className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    SALVA MODIFICHE
                  </button>
	                  <button
	                    type="button"
	                    onClick={handleCancelChanges}
                    className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25]"
	                  >
	                    ANNULLA MODIFICHE
	                  </button>
	                  {canResetEmptyTable ? (
	                    <button
	                      type="button"
	                      onClick={handleResetEmptyTable}
	                      className="h-10 border border-[#d8d5cc] bg-[#fbf8f2] px-3 text-xs font-semibold text-[#8a3434]"
	                    >
	                      SVUOTA TAVOLO
	                    </button>
	                  ) : null}
	                  <button
	                    type="button"
	                    onClick={handleOpenPayment}
                    disabled={!canOpenPayment}
                    className="h-12 border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] hover:bg-[#bfe0ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    PAGAMENTO
                  </button>
                </div>
              ) : panelMode === "sent-summary" ? (
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_minmax(0,1.1fr)]">
                  <button
                    type="button"
                    className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25]"
                  >
                    CONTI SEPARATI
                  </button>
                  <button
                    type="button"
                    className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25]"
                  >
                    ALLA ROMANA
                  </button>
                  <div className="flex h-10 items-center justify-center border border-[#d8d5cc] bg-[#fbf8f2] px-2 text-xs font-bold text-[#2e2a25]">
                    {formatEuro(orderTotal)}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenPayment}
                    disabled={!canOpenPayment}
                    className="h-12 border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] hover:bg-[#bfe0ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    PAGAMENTO
                  </button>
                </div>
              ) : panelMode === "detail" ? (
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <button
                    type="button"
                    onClick={handleOpenSentSummary}
                    className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25]"
                  >
                    TORNA AL RIEPILOGO
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDetail}
                    disabled={!canEditTables}
                    className="h-12 border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] hover:bg-[#bfe0ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    SALVA DETTAGLIO
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
                  <button
                    type="button"
                    onClick={handleCancelPayment}
                    className="h-10 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25]"
                  >
                    ANNULLA
                  </button>
                  <div className="flex h-10 items-center justify-center border border-[#d8d5cc] bg-[#fbf8f2] px-2 text-xs font-bold text-[#2e2a25]">
                    {formatEuro(paymentAdjustedTotal)}
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    disabled={!paymentMethod || !canConfirmPayments}
                    className="h-12 border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] hover:bg-[#bfe0ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    CONFERMA PAGAMENTO
                  </button>
                </div>
              )}
            </footer>
            )}
	          </section>
            </>
          )}

          {isPalmareMode ? (
            <>
              {renderPalmareSummarySheet()}
              {renderPalmareSearchSheet()}
              {renderQuantityPickerOverlay()}
              {renderSizeSelectorOverlay()}
              {configuringPoke ? (
                <PokeConfigurator
                  product={configuringPoke}
                  sections={pokeSections}
                  onClose={() => setConfiguringPoke(null)}
                  onConfirm={handleAddConfiguredPoke}
                />
              ) : null}
              <CodeScannerModal
                isOpen={isFidelityScannerOpen}
                title="Scanner Fidelity Card"
                description="Leggi barcode tessera o QR code Linky per associare il cliente fidelity al conto."
                defaultType="auto"
                onClose={() => setIsFidelityScannerOpen(false)}
                onDetected={(value, scanType) => {
                  handleFidelityScannerDetected(value, scanType);
                  setIsFidelityScannerOpen(false);
                }}
              />
            </>
          ) : null}

          {showPreOrderDetail ? (
            <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/25 px-8 py-6">
              <div className="relative w-full max-w-[760px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
                <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-5 py-3">
                  <div className="text-base font-bold text-[#2e2a25]">{`Dettaglio tavolo ${currentTableName}`}</div>
                  <div className="mt-1 text-xs text-[#686259]">
                    Inserisci i dati preliminari prima di accedere alla comanda.
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Cliente</div>
                      <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                        <input
                          value={getCustomerLabel(selectedCustomer, preOrderCustomer)}
                          readOnly
                          placeholder="Seleziona cliente"
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none placeholder:text-[#9b9489]"
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenDetailPicker("customer")}
                          disabled={!canAssignCustomer}
                          className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-lg font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Apri selezione cliente"
                        >
                          +
                        </button>
                      </div>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Azienda</div>
                      <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                        <input
                          value={getCompanyLabel(selectedCompany, preOrderCompany)}
                          readOnly
                          placeholder="Seleziona azienda"
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none placeholder:text-[#9b9489]"
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenDetailPicker("company")}
                          disabled={!canAssignCompany}
                          className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-lg font-semibold text-[#2e2a25] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Apri selezione azienda"
                        >
                          +
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Operatore</div>
                      <select
                        value={preOrderOperator}
                        onChange={(event) => setPreOrderOperator(event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                      >
                        {operatorOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Prezzo coperto</div>
                      <select
                        value={preOrderServicePrice}
                        onChange={(event) => setPreOrderServicePrice(event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                      >
                        {servicePriceOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Numero coperti</div>
                      <select
                        value={preOrderGuests}
                        onChange={(event) => setPreOrderGuests(event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                      >
                        {Array.from({ length: 8 }, (_, index) => index + 1).map((guestCount) => (
                          <option key={guestCount} value={guestCount}>
                            {guestCount}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="block">
                    <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Note</div>
                    <textarea
                      value={preOrderNote}
                      onChange={(event) => setPreOrderNote(event.target.value)}
                      className="min-h-[132px] w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleCancelPreOrderDetail}
                      className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={handleContinuePreOrderDetail}
                      disabled={!canEditTables}
                      className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Continua
                    </button>
                  </div>
                </div>

                {detailPickerMode ? (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 p-5">
                    <div className="w-full max-w-[560px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
                      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
                        <div className="text-sm font-bold text-[#2e2a25]">
                          {detailPickerMode === "customer" ? "Clienti" : "Aziende"}
                        </div>
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-white px-3">
                          <input
                            value={detailPickerSearch}
                            onChange={(event) => setDetailPickerSearch(event.target.value)}
                            placeholder={
                              detailPickerMode === "customer"
                                ? "Cerca per codice fiscale o nome"
                                : "Cerca per partita IVA, nome azienda o città"
                            }
                            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-[#9b9489]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => openDetailEditor(detailPickerMode)}
                          className="h-10 w-full rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                        >
                          {detailPickerMode === "customer" ? "Nuovo cliente" : "Nuova azienda"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleClearDetailSelection(detailPickerMode)}
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-left text-sm font-semibold text-[#5d564e]"
                        >
                          {detailPickerMode === "customer" ? "Seleziona cliente" : "Seleziona azienda"}
                        </button>

                        <div className="max-h-[320px] overflow-y-auto rounded-[4px] border border-[#d8d5cc] bg-white">
                          {(detailPickerMode === "customer" ? filteredCustomers : filteredCompanies).map((entry, index) => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() =>
                                detailPickerMode === "customer"
                                  ? handleSelectCustomer(entry as CustomerRecord)
                                  : handleSelectCompany(entry as CompanyRecord)
                              }
                              className={[
                                "grid min-h-12 w-full grid-cols-[minmax(0,1fr)_160px] items-center gap-3 px-3 py-2 text-left text-sm text-[#2e2a25]",
                                index !==
                                (detailPickerMode === "customer" ? filteredCustomers : filteredCompanies).length - 1
                                  ? "border-b border-[#e1ddd4]"
                                  : "",
                              ].join(" ")}
                            >
                              <span className="truncate font-medium">{entry.name}</span>
                              <span className="text-right text-xs text-[#6b645c]">
                                {"taxCode" in entry ? entry.taxCode : entry.vatNumber}
                              </span>
                            </button>
                          ))}
                          {(detailPickerMode === "customer" ? filteredCustomers : filteredCompanies).length === 0 ? (
                            <div className="px-3 py-3 text-sm text-[#7a736a]">Nessun risultato</div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={handleCloseDetailPicker}
                          className="h-10 w-full rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                        >
                          Chiudi
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {detailEditorMode ? (
                  <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/25 p-5">
                    <div className="w-full max-w-[560px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
                      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
                        <div className="text-sm font-bold text-[#2e2a25]">
                          {detailEditorMode === "customer" ? "Nuovo cliente" : "Nuova azienda"}
                        </div>
                      </div>

                      <div className="space-y-3 p-4">
                        {detailEditorMode === "customer" ? (
                          <>
                            <label className="block">
                              <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Nome</div>
                              <input
                                value={customerDraft.name}
                                onChange={(event) =>
                                  setCustomerDraft((current) => ({ ...current, name: event.target.value }))
                                }
                                className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Codice fiscale</div>
                              <input
                                value={customerDraft.taxCode}
                                onChange={(event) =>
                                  setCustomerDraft((current) => ({ ...current, taxCode: event.target.value }))
                                }
                                className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                              <label className="block">
                                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Telefono</div>
                                <input
                                  value={customerDraft.phone ?? ""}
                                  onChange={(event) =>
                                    setCustomerDraft((current) => ({ ...current, phone: event.target.value }))
                                  }
                                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Email</div>
                                <input
                                  value={customerDraft.email ?? ""}
                                  onChange={(event) =>
                                    setCustomerDraft((current) => ({ ...current, email: event.target.value }))
                                  }
                                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                                />
                              </label>
                            </div>
                          </>
                        ) : (
                          <CompanyFormFields
                            company={companyDraft}
                            onChange={updateCompanyDraftField}
                            onLookup={handleLookupCompanyDraft}
                            lookupLoading={companyLookupLoading}
                            lookupMessage={companyLookupMessage}
                            lookupError={companyLookupError}
                          />
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={closeDetailEditor}
                            className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            onClick={
                              detailEditorMode === "customer"
                                ? handleSaveCustomerDraft
                                : handleSaveCompanyDraft
                            }
                            className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                          >
                            Salva
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {!showPreOrderDetail && detailPickerMode ? (
            <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/20 p-5">
              <div className="w-full max-w-[560px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
                <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
                  <div className="text-sm font-bold text-[#2e2a25]">
                    {detailPickerMode === "customer" ? "Clienti" : "Aziende"}
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-white px-3">
                    <input
                      value={detailPickerSearch}
                      onChange={(event) => setDetailPickerSearch(event.target.value)}
                      placeholder={
                        detailPickerMode === "customer"
                          ? "Cerca per codice fiscale o nome"
                          : "Cerca per partita IVA, nome azienda o città"
                      }
                      className="h-full w-full bg-transparent text-sm outline-none placeholder:text-[#9b9489]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => openDetailEditor(detailPickerMode)}
                    className="h-10 w-full rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                  >
                    {detailPickerMode === "customer" ? "Nuovo cliente" : "Nuova azienda"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleClearDetailSelection(detailPickerMode)}
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-left text-sm font-semibold text-[#5d564e]"
                  >
                    {detailPickerMode === "customer" ? "Seleziona cliente" : "Seleziona azienda"}
                  </button>

                  <div className="max-h-[320px] overflow-y-auto rounded-[4px] border border-[#d8d5cc] bg-white">
                    {(detailPickerMode === "customer" ? filteredCustomers : filteredCompanies).map((entry, index) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() =>
                          detailPickerMode === "customer"
                            ? handleSelectCustomer(entry as CustomerRecord)
                            : handleSelectCompany(entry as CompanyRecord)
                        }
                        className={[
                          "grid min-h-12 w-full grid-cols-[minmax(0,1fr)_160px] items-center gap-3 px-3 py-2 text-left text-sm text-[#2e2a25]",
                          index !==
                          (detailPickerMode === "customer" ? filteredCustomers : filteredCompanies).length - 1
                            ? "border-b border-[#e1ddd4]"
                            : "",
                        ].join(" ")}
                      >
                        <span className="truncate font-medium">{entry.name}</span>
                        <span className="text-right text-xs text-[#6b645c]">
                          {"taxCode" in entry ? entry.taxCode : entry.vatNumber}
                        </span>
                      </button>
                    ))}
                    {(detailPickerMode === "customer" ? filteredCustomers : filteredCompanies).length === 0 ? (
                      <div className="px-3 py-3 text-sm text-[#7a736a]">Nessun risultato</div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseDetailPicker}
                    className="h-10 w-full rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {!showPreOrderDetail && detailEditorMode ? (
            <div className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/25 p-5">
              <div className="w-full max-w-[560px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
                <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
                  <div className="text-sm font-bold text-[#2e2a25]">
                    {detailEditorMode === "customer" ? "Nuovo cliente" : "Nuova azienda"}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  {detailEditorMode === "customer" ? (
                    <>
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Nome</div>
                        <input
                          value={customerDraft.name}
                          onChange={(event) =>
                            setCustomerDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Codice fiscale</div>
                        <input
                          value={customerDraft.taxCode}
                          onChange={(event) =>
                            setCustomerDraft((current) => ({ ...current, taxCode: event.target.value }))
                          }
                          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Telefono</div>
                          <input
                            value={customerDraft.phone ?? ""}
                            onChange={(event) =>
                              setCustomerDraft((current) => ({ ...current, phone: event.target.value }))
                            }
                            className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                          />
                        </label>
                        <label className="block">
                          <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Email</div>
                          <input
                            value={customerDraft.email ?? ""}
                            onChange={(event) =>
                              setCustomerDraft((current) => ({ ...current, email: event.target.value }))
                            }
                            className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <CompanyFormFields
                      company={companyDraft}
                      onChange={updateCompanyDraftField}
                      onLookup={handleLookupCompanyDraft}
                      lookupLoading={companyLookupLoading}
                      lookupMessage={companyLookupMessage}
                      lookupError={companyLookupError}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={closeDetailEditor}
                      className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={
                        detailEditorMode === "customer"
                          ? handleSaveCustomerDraft
                          : handleSaveCompanyDraft
                      }
                      className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                    >
                      Salva
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </main>
  );
}
