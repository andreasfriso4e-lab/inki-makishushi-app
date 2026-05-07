import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { getProductCategories, type ProductCategory } from "@/lib/pos-data";
import { recordAuditEvent } from "@/services/audit-log-service";

export type SavedBillPrintMode = "never" | "always" | "on-request";
export type ProductTextStyle = "lowercase" | "uppercase";
export type VariantTextStyle = "lowercase" | "uppercase" | "normal" | "bold";
export type VariantSizeStyle = "normal" | "double";
export type CommandTitleScale = "normal" | "double" | "extra-large";
export type OrderCommandFontWeight = "normal" | "bold";
export type OrderCommandHeaderFieldKey =
  | "table"
  | "room"
  | "date"
  | "time"
  | "operator"
  | "orderNumber"
  | "guests"
  | "customer"
  | "company";
export type OrderCommandHeaderDisplayMode = "label-value" | "label-only" | "value-only";
export type OrderCommandSpacing = "none" | "small" | "medium" | "large";
export type CommandLineRole =
  | "title"
  | "header"
  | "separator"
  | "section"
  | "product"
  | "variant"
  | "note"
  | "footer"
  | "total";

export type OrderCommandRenderItem = {
  id: string;
  name: string;
  quantity: number;
  category?: string;
  variant?: string;
  note?: string;
  course?: string;
  guestCode?: string | null;
  price?: number;
};

export type OrderCommandRenderContext = {
  tableLabel?: string;
  roomLabel?: string;
  operator?: string;
  createdAt: string;
  commandNumber?: string;
  guests?: number;
  customerLabel?: string;
  companyLabel?: string;
  total?: number;
  items: OrderCommandRenderItem[];
};

export type OrderCommandRenderLine = {
  role: CommandLineRole;
  text: string;
  emphasized?: boolean;
  centered?: boolean;
  fontSize?: number;
  fontWeight?: OrderCommandFontWeight;
};

export type OrderCommandHeaderFieldConfig = {
  key: OrderCommandHeaderFieldKey;
  enabled: boolean;
  label: string;
  fontSize: number;
  fontWeight: OrderCommandFontWeight;
  order: number;
  displayMode: OrderCommandHeaderDisplayMode;
};

export type OrderCommandTitleConfig = {
  enabled: boolean;
  prefix: string;
  includeTableValue: boolean;
  fontSize: number;
  fontWeight: OrderCommandFontWeight;
  centered: boolean;
  uppercase: boolean;
  order: number;
  displayMode: "prefix-and-table" | "prefix-only" | "table-only";
};

export type OrderPrintStation = {
  id: string;
  name: string;
  printerId: string | null;
  enabled: boolean;
  copies: number;
  categories: ProductCategory[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderCommandSettings = {
  printCommandWithReceiptAndInvoice: boolean;
  printCommandWithBill: boolean;
  enableDirectCommandPrintButton: boolean;
  printOneCommandPerProduct: boolean;
  printOneCommandPerCategory: boolean;
  mergeDuplicateItems: boolean;
  printOrderNote: boolean;
  printCustomerCompanyName: boolean;
  alwaysPrintCategoryNames: boolean;
  printOrdersInInsertionOrder: boolean;
  printOrdersInInterfaceOrder: boolean;
  printPieceCount: boolean;
  printElementPrices: boolean;
  printCommandTotal: boolean;
  printFromSavedBill: SavedBillPrintMode;
  nextOrderNumber: number;
  maxOrderNumber: number;
  prefix: string;
  singleProductFooter: string;
  topSpacing: number;
  lineCapacity: number;
  productFontSize: number;
  variantFontSize: number;
  headerFontSize: number;
  noteFontSize: number;
  showCommandTitle: boolean;
  showRoomLabel: boolean;
  showTableLabel: boolean;
  showOperatorLabel: boolean;
  showOrderDate: boolean;
  showOrderTime: boolean;
  showOrderNumber: boolean;
  showCourseLabel: boolean;
  showCourseHeader: boolean;
  showGuests: boolean;
  titleFontSize: number;
  titleFontScale: CommandTitleScale;
  titleBold: boolean;
  titleCentered: boolean;
  titleUppercase: boolean;
  productBold: boolean;
  noteBold: boolean;
  noteUppercase: boolean;
  showGuestGroupTitle: boolean;
  courseHeaderBaseText: string;
  courseHeaderFontSize: number;
  courseHeaderBold: boolean;
  courseHeaderUppercase: boolean;
  courseHeaderCentered: boolean;
  courseHeaderSpacingTop: OrderCommandSpacing;
  courseHeaderSpacingBottom: OrderCommandSpacing;
  guestGroupTitleText: string;
  guestGroupFontSize: number;
  guestGroupBold: boolean;
  guestGroupUppercase: boolean;
  guestGroupCentered: boolean;
  guestGroupSpacing: OrderCommandSpacing;
  productLineSpacing: OrderCommandSpacing;
  commandTitle: OrderCommandTitleConfig;
  headerFields: OrderCommandHeaderFieldConfig[];
  productTextStyle: ProductTextStyle;
  variantTextStyle: VariantTextStyle;
  variantSize: VariantSizeStyle;
  stations: OrderPrintStation[];
  updatedAt: string;
};

const ORDER_COMMAND_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-order-command-settings");

function getNowIso() {
  return new Date().toISOString();
}

function createStation(
  id: string,
  name: string,
  categories: ProductCategory[] = []
): OrderPrintStation {
  const now = getNowIso();

  return {
    id,
    name,
    printerId: null,
    enabled: true,
    copies: 1,
    categories,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function createHeaderField(
  key: OrderCommandHeaderFieldKey,
  label: string,
  order: number,
  overrides: Partial<OrderCommandHeaderFieldConfig> = {}
): OrderCommandHeaderFieldConfig {
  return {
    key,
    enabled: true,
    label,
    fontSize: 18,
    fontWeight: "normal",
    order,
    displayMode: "label-value",
    ...overrides,
  };
}

function getDefaultHeaderFields(): OrderCommandHeaderFieldConfig[] {
  return [
    createHeaderField("table", "Tavolo:", 1, { fontSize: 26, fontWeight: "bold" }),
    createHeaderField("room", "Sala:", 2, { fontSize: 18 }),
    createHeaderField("date", "Data:", 3, { fontSize: 18 }),
    createHeaderField("time", "Ora:", 4, { fontSize: 18 }),
    createHeaderField("operator", "Operatore:", 5, {
      fontSize: 16,
      enabled: false,
    }),
    createHeaderField("orderNumber", "Comanda:", 6, { fontSize: 18 }),
    createHeaderField("guests", "Coperti:", 7, {
      fontSize: 16,
      enabled: false,
    }),
    createHeaderField("customer", "Cliente:", 8, {
      fontSize: 16,
      enabled: false,
    }),
    createHeaderField("company", "Azienda:", 9, {
      fontSize: 16,
      enabled: false,
    }),
  ];
}

function getDefaultTitleConfig(): OrderCommandTitleConfig {
  return {
    enabled: true,
    prefix: "COMANDA",
    includeTableValue: false,
    fontSize: 30,
    fontWeight: "bold",
    centered: true,
    uppercase: true,
    order: 0,
    displayMode: "prefix-only",
  };
}

function getDefaultStations() {
  const configuredStations = getRestaurantConfig().orderCommandStations;

  if (configuredStations && configuredStations.length > 0) {
    return configuredStations.map((station) =>
      createStation(
        station.id,
        station.name,
        station.categories.filter((category): category is ProductCategory =>
          getProductCategories().includes(category as ProductCategory)
        )
      )
    );
  }

  return [
    createStation("station-bar", "Bar", [
      "Bevande",
      "Birre",
      "Bollicine",
      "Vino",
      "Vino mescita",
      "Cocktail",
      "Distillati",
      "Amari",
      "Aperitivo",
      "Caffetteria",
      "Champagne",
      "Sakè",
    ].filter((category): category is ProductCategory =>
      getProductCategories().includes(category as ProductCategory)
    )),
    createStation("station-cucina", "Cucina", [
      "Bao",
      "Crudità",
      "Chirashi",
      "Dessert",
      "Gunkan",
      "Hot",
      "Insalate",
      "Nigiri",
      "Poke",
      "Ramen and soup",
      "Ravioli",
      "Riso",
      "Sashimi",
      "Tempura",
    ].filter((category): category is ProductCategory =>
      getProductCategories().includes(category as ProductCategory)
    )),
    createStation("station-sushi", "Sushi", [
      "Futomaki",
      "Hosomaki",
      "Temaki",
      "Uramaki Deluxe",
      "Uramaki classici",
      "Inki box",
    ].filter((category): category is ProductCategory =>
      getProductCategories().includes(category as ProductCategory)
    )),
  ];
}

export function getDefaultOrderCommandSettings(): OrderCommandSettings {
  return {
    printCommandWithReceiptAndInvoice: false,
    printCommandWithBill: false,
    enableDirectCommandPrintButton: false,
    printOneCommandPerProduct: false,
    printOneCommandPerCategory: false,
    mergeDuplicateItems: true,
    printOrderNote: true,
    printCustomerCompanyName: true,
    alwaysPrintCategoryNames: false,
    printOrdersInInsertionOrder: false,
    printOrdersInInterfaceOrder: true,
    printPieceCount: false,
    printElementPrices: false,
    printCommandTotal: false,
    printFromSavedBill: "always",
    nextOrderNumber: 1,
    maxOrderNumber: 9999,
    prefix: "CMD",
    singleProductFooter: "",
    topSpacing: 1,
    lineCapacity: 42,
    productFontSize: 14,
    variantFontSize: 12,
    headerFontSize: 13,
    noteFontSize: 11,
    titleFontSize: 30,
    showCommandTitle: true,
    showRoomLabel: true,
    showTableLabel: true,
    showOperatorLabel: true,
    showOrderDate: true,
    showOrderTime: true,
    showOrderNumber: true,
    showCourseLabel: false,
    showCourseHeader: true,
    showGuests: false,
    titleFontScale: "double",
    titleBold: true,
    titleCentered: true,
    titleUppercase: true,
    productBold: false,
    noteBold: false,
    noteUppercase: false,
    showGuestGroupTitle: true,
    courseHeaderBaseText: "",
    courseHeaderFontSize: 20,
    courseHeaderBold: true,
    courseHeaderUppercase: true,
    courseHeaderCentered: false,
    courseHeaderSpacingTop: "small",
    courseHeaderSpacingBottom: "small",
    guestGroupTitleText: "COMMENSALE",
    guestGroupFontSize: 18,
    guestGroupBold: true,
    guestGroupUppercase: true,
    guestGroupCentered: false,
    guestGroupSpacing: "medium",
    productLineSpacing: "none",
    commandTitle: getDefaultTitleConfig(),
    headerFields: getDefaultHeaderFields(),
    productTextStyle: "lowercase",
    variantTextStyle: "normal",
    variantSize: "normal",
    stations: getDefaultStations(),
    updatedAt: getNowIso(),
  };
}

function normalizeStation(station: OrderPrintStation, index: number): OrderPrintStation {
  const defaults = getDefaultStations();
  const defaultStation = defaults[index];
  const categories = getProductCategories();

  return {
    id: station.id || defaultStation?.id || `station-${index + 1}`,
    name: station.name?.trim() || defaultStation?.name || `Postazione ${index + 1}`,
    printerId: station.printerId || null,
    enabled: station.enabled ?? true,
    copies: Number(station.copies) > 0 ? Number(station.copies) : 1,
    categories: Array.isArray(station.categories)
      ? station.categories.filter(
          (category): category is ProductCategory =>
            categories.includes(category as ProductCategory)
        )
      : [],
    notes: station.notes?.trim() ?? "",
    createdAt: station.createdAt || getNowIso(),
    updatedAt: station.updatedAt || station.createdAt || getNowIso(),
  };
}

function normalizeHeaderField(
  field: Partial<OrderCommandHeaderFieldConfig>,
  index: number
): OrderCommandHeaderFieldConfig {
  const defaults = getDefaultHeaderFields();
  const defaultField = defaults.find((entry) => entry.key === field.key) ?? defaults[index];

  return {
    key: (field.key as OrderCommandHeaderFieldKey) ?? defaultField.key,
    enabled: field.enabled ?? defaultField.enabled,
    label: field.label?.trim() ?? defaultField.label,
    fontSize: Number(field.fontSize) > 0 ? Number(field.fontSize) : defaultField.fontSize,
    fontWeight: field.fontWeight === "bold" ? "bold" : defaultField.fontWeight,
    order: Number.isFinite(field.order) ? Number(field.order) : defaultField.order,
    displayMode:
      field.displayMode === "label-only" || field.displayMode === "value-only"
        ? field.displayMode
        : defaultField.displayMode,
  };
}

function normalizeTitleConfig(
  config?: Partial<OrderCommandTitleConfig>
): OrderCommandTitleConfig {
  const defaults = getDefaultTitleConfig();

  return {
    enabled: config?.enabled ?? defaults.enabled,
    prefix: config?.prefix?.trim() ?? defaults.prefix,
    includeTableValue: config?.includeTableValue ?? defaults.includeTableValue,
    fontSize: Number(config?.fontSize) > 0 ? Number(config?.fontSize) : defaults.fontSize,
    fontWeight: config?.fontWeight === "bold" ? "bold" : defaults.fontWeight,
    centered: config?.centered ?? defaults.centered,
    uppercase: config?.uppercase ?? defaults.uppercase,
    order: Number.isFinite(config?.order) ? Number(config?.order) : defaults.order,
    displayMode:
      config?.displayMode === "prefix-only" || config?.displayMode === "table-only"
        ? config.displayMode
        : defaults.displayMode,
  };
}

function normalizeSettings(settings?: Partial<OrderCommandSettings>): OrderCommandSettings {
  const defaults = getDefaultOrderCommandSettings();
  const nextStations =
    Array.isArray(settings?.stations) && settings?.stations.length > 0
      ? settings.stations.map((station, index) => normalizeStation(station, index))
      : defaults.stations;

  const existingStationIds = new Set(nextStations.map((station) => station.id));
  const mergedStations = [
    ...nextStations,
    ...defaults.stations.filter((station) => !existingStationIds.has(station.id)),
  ];
  const nextHeaderFields =
    Array.isArray(settings?.headerFields) && settings?.headerFields.length > 0
      ? settings.headerFields.map((field, index) => normalizeHeaderField(field, index))
      : defaults.headerFields;
  const existingHeaderFieldKeys = new Set(nextHeaderFields.map((field) => field.key));
  const mergedHeaderFields = [
    ...nextHeaderFields,
    ...defaults.headerFields.filter((field) => !existingHeaderFieldKeys.has(field.key)),
  ].sort((left, right) => left.order - right.order);
  const normalizedTitle = normalizeTitleConfig({
    ...settings?.commandTitle,
    fontSize:
      Number(settings?.commandTitle?.fontSize) > 0
        ? Number(settings?.commandTitle?.fontSize)
        : Number(settings?.titleFontSize) > 0
          ? Number(settings?.titleFontSize)
          : defaults.commandTitle.fontSize,
    fontWeight:
      settings?.commandTitle?.fontWeight ??
      (settings?.titleBold ? "bold" : defaults.commandTitle.fontWeight),
    centered: settings?.commandTitle?.centered ?? settings?.titleCentered ?? defaults.commandTitle.centered,
    uppercase:
      settings?.commandTitle?.uppercase ?? settings?.titleUppercase ?? defaults.commandTitle.uppercase,
  });

  return {
    ...defaults,
    ...settings,
    printFromSavedBill:
      settings?.printFromSavedBill === "never" ||
      settings?.printFromSavedBill === "on-request"
        ? settings.printFromSavedBill
        : defaults.printFromSavedBill,
    productTextStyle:
      settings?.productTextStyle === "uppercase" ? "uppercase" : defaults.productTextStyle,
    variantTextStyle:
      settings?.variantTextStyle === "lowercase" ||
      settings?.variantTextStyle === "uppercase" ||
      settings?.variantTextStyle === "bold"
        ? settings.variantTextStyle
        : defaults.variantTextStyle,
    variantSize: settings?.variantSize === "double" ? "double" : defaults.variantSize,
    nextOrderNumber:
      Number(settings?.nextOrderNumber) > 0
        ? Number(settings?.nextOrderNumber)
        : defaults.nextOrderNumber,
    maxOrderNumber:
      Number(settings?.maxOrderNumber) > 0
        ? Number(settings?.maxOrderNumber)
        : defaults.maxOrderNumber,
    topSpacing: Number.isFinite(settings?.topSpacing)
      ? Math.max(Number(settings?.topSpacing), 0)
      : defaults.topSpacing,
    lineCapacity:
      Number(settings?.lineCapacity) > 0 ? Number(settings?.lineCapacity) : defaults.lineCapacity,
    productFontSize:
      Number(settings?.productFontSize) > 0
        ? Number(settings?.productFontSize)
        : defaults.productFontSize,
    variantFontSize:
      Number(settings?.variantFontSize) > 0
        ? Number(settings?.variantFontSize)
        : defaults.variantFontSize,
    headerFontSize:
      Number(settings?.headerFontSize) > 0
        ? Number(settings?.headerFontSize)
        : defaults.headerFontSize,
    noteFontSize:
      Number(settings?.noteFontSize) > 0 ? Number(settings?.noteFontSize) : defaults.noteFontSize,
    titleFontSize:
      Number(settings?.titleFontSize) > 0 ? Number(settings?.titleFontSize) : normalizedTitle.fontSize,
    showCommandTitle: settings?.showCommandTitle ?? defaults.showCommandTitle,
    showRoomLabel: settings?.showRoomLabel ?? defaults.showRoomLabel,
    showTableLabel: settings?.showTableLabel ?? defaults.showTableLabel,
    showOperatorLabel: settings?.showOperatorLabel ?? defaults.showOperatorLabel,
    showOrderDate: settings?.showOrderDate ?? defaults.showOrderDate,
    showOrderTime: settings?.showOrderTime ?? defaults.showOrderTime,
    showOrderNumber: settings?.showOrderNumber ?? defaults.showOrderNumber,
    showCourseLabel: settings?.showCourseLabel ?? defaults.showCourseLabel,
    showCourseHeader: settings?.showCourseHeader ?? defaults.showCourseHeader,
    showGuests: settings?.showGuests ?? defaults.showGuests,
    titleFontScale:
      settings?.titleFontScale === "normal" ||
      settings?.titleFontScale === "double" ||
      settings?.titleFontScale === "extra-large"
        ? settings.titleFontScale
        : defaults.titleFontScale,
    titleBold: settings?.titleBold ?? defaults.titleBold,
    titleCentered: settings?.titleCentered ?? defaults.titleCentered,
    titleUppercase: settings?.titleUppercase ?? defaults.titleUppercase,
    productBold: settings?.productBold ?? defaults.productBold,
    noteBold: settings?.noteBold ?? defaults.noteBold,
    noteUppercase: settings?.noteUppercase ?? defaults.noteUppercase,
    showGuestGroupTitle: settings?.showGuestGroupTitle ?? defaults.showGuestGroupTitle,
    courseHeaderBaseText:
      settings?.courseHeaderBaseText?.trim() ?? defaults.courseHeaderBaseText,
    courseHeaderFontSize:
      Number(settings?.courseHeaderFontSize) > 0
        ? Number(settings?.courseHeaderFontSize)
        : defaults.courseHeaderFontSize,
    courseHeaderBold: settings?.courseHeaderBold ?? defaults.courseHeaderBold,
    courseHeaderUppercase:
      settings?.courseHeaderUppercase ?? defaults.courseHeaderUppercase,
    courseHeaderCentered:
      settings?.courseHeaderCentered ?? defaults.courseHeaderCentered,
    courseHeaderSpacingTop:
      settings?.courseHeaderSpacingTop === "none" ||
      settings?.courseHeaderSpacingTop === "small" ||
      settings?.courseHeaderSpacingTop === "medium" ||
      settings?.courseHeaderSpacingTop === "large"
        ? settings.courseHeaderSpacingTop
        : defaults.courseHeaderSpacingTop,
    courseHeaderSpacingBottom:
      settings?.courseHeaderSpacingBottom === "none" ||
      settings?.courseHeaderSpacingBottom === "small" ||
      settings?.courseHeaderSpacingBottom === "medium" ||
      settings?.courseHeaderSpacingBottom === "large"
        ? settings.courseHeaderSpacingBottom
        : defaults.courseHeaderSpacingBottom,
    guestGroupTitleText: settings?.guestGroupTitleText?.trim() || defaults.guestGroupTitleText,
    guestGroupFontSize:
      Number(settings?.guestGroupFontSize) > 0
        ? Number(settings?.guestGroupFontSize)
        : defaults.guestGroupFontSize,
    guestGroupBold: settings?.guestGroupBold ?? defaults.guestGroupBold,
    guestGroupUppercase: settings?.guestGroupUppercase ?? defaults.guestGroupUppercase,
    guestGroupCentered: settings?.guestGroupCentered ?? defaults.guestGroupCentered,
    guestGroupSpacing:
      settings?.guestGroupSpacing === "none" ||
      settings?.guestGroupSpacing === "small" ||
      settings?.guestGroupSpacing === "medium" ||
      settings?.guestGroupSpacing === "large"
        ? settings.guestGroupSpacing
        : defaults.guestGroupSpacing,
    productLineSpacing:
      settings?.productLineSpacing === "none" ||
      settings?.productLineSpacing === "small" ||
      settings?.productLineSpacing === "medium" ||
      settings?.productLineSpacing === "large"
        ? settings.productLineSpacing
        : defaults.productLineSpacing,
    commandTitle: normalizedTitle,
    headerFields: mergedHeaderFields,
    prefix: settings?.prefix?.trim() ?? defaults.prefix,
    singleProductFooter: settings?.singleProductFooter ?? defaults.singleProductFooter,
    stations: mergedStations,
    updatedAt: settings?.updatedAt || getNowIso(),
  };
}

function createRenderLine(
  role: CommandLineRole,
  text: string,
  options: Pick<OrderCommandRenderLine, "emphasized" | "centered" | "fontSize" | "fontWeight"> = {}
): OrderCommandRenderLine {
  return {
    role,
    text,
    emphasized: options.emphasized ?? false,
    centered: options.centered ?? false,
    fontSize: options.fontSize,
    fontWeight: options.fontWeight,
  };
}

function getSpacingLineCount(spacing: OrderCommandSpacing) {
  switch (spacing) {
    case "none":
      return 0;
    case "small":
      return 1;
    case "medium":
      return 2;
    case "large":
      return 3;
    default:
      return 0;
  }
}

function pushSpacingLines(lines: OrderCommandRenderLine[], count: number) {
  for (let index = 0; index < count; index += 1) {
    lines.push(createRenderLine("footer", ""));
  }
}

function formatDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTimeLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function extractTableValue(value?: string) {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return "";
  }

  return trimmedValue.replace(/^(tavolo|takeaway)\s*/i, "").trim() || trimmedValue;
}

function getHeaderFieldValue(
  fieldKey: OrderCommandHeaderFieldKey,
  context: OrderCommandRenderContext
) {
  switch (fieldKey) {
    case "table":
      return extractTableValue(context.tableLabel);
    case "room":
      return context.roomLabel?.trim() ?? "";
    case "date":
      return formatDateLabel(context.createdAt);
    case "time":
      return formatTimeLabel(context.createdAt);
    case "operator":
      return context.operator?.trim() ?? "";
    case "orderNumber":
      return context.commandNumber?.trim() ?? "";
    case "guests":
      return typeof context.guests === "number" && context.guests > 0
        ? String(context.guests)
        : "";
    case "customer":
      return context.customerLabel?.trim() ?? "";
    case "company":
      return context.companyLabel?.trim() ?? "";
    default:
      return "";
  }
}

function buildHeaderLineText(field: OrderCommandHeaderFieldConfig, value: string) {
  if (field.displayMode === "value-only") {
    return value;
  }

  if (field.displayMode === "label-only") {
    return field.label.trim();
  }

  const label = field.label.trim();

  if (!label) {
    return value;
  }

  return value ? `${label} ${value}` : label;
}

export function formatProductNameForCommand(name: string, style: ProductTextStyle) {
  return style === "uppercase" ? name.toUpperCase() : name.toLowerCase();
}

export function formatVariantNameForCommand(name: string, style: VariantTextStyle) {
  if (style === "uppercase") {
    return name.toUpperCase();
  }

  if (style === "lowercase") {
    return name.toLowerCase();
  }

  return name;
}

function sortAndMergeRenderItems(
  settings: OrderCommandSettings,
  items: OrderCommandRenderItem[]
) {
  const sortedItems = settings.printOrdersInInsertionOrder
    ? items
    : settings.printOrdersInInterfaceOrder
      ? [...items].sort(
          (left, right) =>
            (left.category ?? "").localeCompare(right.category ?? "", "it") ||
            left.name.localeCompare(right.name, "it")
        )
      : items;

  if (!settings.mergeDuplicateItems) {
    return sortedItems.map((item) => ({ ...item }));
  }

  return sortedItems.reduce<OrderCommandRenderItem[]>((accumulator, item) => {
    const existingItem = accumulator.find(
      (candidate) =>
        candidate.name === item.name &&
        candidate.category === item.category &&
        candidate.variant === item.variant &&
        candidate.note === item.note &&
        candidate.course === item.course &&
        candidate.guestCode === item.guestCode
    );

    if (existingItem) {
      existingItem.quantity += item.quantity;
      if (typeof item.price === "number") {
        existingItem.price = (existingItem.price ?? 0) + item.price;
      }
      return accumulator;
    }

    accumulator.push({ ...item });
    return accumulator;
  }, []);
}

function getGroupedRenderItems(
  settings: OrderCommandSettings,
  items: OrderCommandRenderItem[]
) {
  const mergedItems = sortAndMergeRenderItems(settings, items);
  const unassignedItems: OrderCommandRenderItem[] = [];
  const guestGroups = new Map<string, OrderCommandRenderItem[]>();

  mergedItems.forEach((item) => {
    const normalizedGuestCode = item.guestCode?.trim() ?? "";

    if (!normalizedGuestCode) {
      unassignedItems.push(item);
      return;
    }

    const currentItems = guestGroups.get(normalizedGuestCode) ?? [];
    currentItems.push({ ...item, guestCode: normalizedGuestCode });
    guestGroups.set(normalizedGuestCode, currentItems);
  });

  const sortedGuestCodes = Array.from(guestGroups.keys()).sort((left, right) => {
    const leftNumber = Number(left.replace(/^C/i, ""));
    const rightNumber = Number(right.replace(/^C/i, ""));

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return left.localeCompare(right, "it", { numeric: true });
  });

  return {
    unassignedItems,
    guestGroups: sortedGuestCodes.map((guestCode) => ({
      guestCode,
      items: guestGroups.get(guestCode) ?? [],
    })),
  };
}

function getCourseSortWeight(course?: string) {
  const normalizedCourse = course?.trim().toUpperCase() ?? "";

  if (normalizedCourse === "PRIMA PORTATA") {
    return 1;
  }

  if (normalizedCourse === "SECONDA PORTATA") {
    return 2;
  }

  if (normalizedCourse === "TERZA PORTATA") {
    return 3;
  }

  return normalizedCourse ? 10 : 0;
}

function getCourseNumber(course?: string) {
  const normalizedCourse = course?.trim().toUpperCase() ?? "";

  if (normalizedCourse === "PRIMA PORTATA") {
    return "1";
  }

  if (normalizedCourse === "SECONDA PORTATA") {
    return "2";
  }

  if (normalizedCourse === "TERZA PORTATA") {
    return "3";
  }

  return "";
}

function buildCourseHeaderText(settings: OrderCommandSettings, course: string) {
  const normalizedCourse = course.trim();
  const courseNumber = getCourseNumber(normalizedCourse);
  const customBase = settings.courseHeaderBaseText.trim();

  if (customBase && courseNumber) {
    const customText = `${customBase} ${courseNumber}`.trim();
    return settings.courseHeaderUppercase ? customText.toUpperCase() : customText;
  }

  return settings.courseHeaderUppercase ? normalizedCourse.toUpperCase() : normalizedCourse;
}

export function buildOrderCommandNumberLabel(settings: OrderCommandSettings, number: number) {
  return `${settings.prefix}-${String(number).padStart(4, "0")}`;
}

export function reserveNextOrderCommandNumber() {
  const currentSettings = getOrderCommandSettings();
  const currentNumber = Math.max(1, currentSettings.nextOrderNumber);
  const nextNumber =
    currentNumber >= currentSettings.maxOrderNumber ? 1 : currentNumber + 1;
  const normalized = saveOrderCommandSettings({
    ...currentSettings,
    nextOrderNumber: nextNumber,
  });

  return {
    label: buildOrderCommandNumberLabel(currentSettings, currentNumber),
    nextSettings: normalized,
  };
}

export function buildOrderCommandRenderLines(
  settings: OrderCommandSettings,
  context: OrderCommandRenderContext
) {
  const lines: OrderCommandRenderLine[] = [];
  const mergedItems = sortAndMergeRenderItems(settings, context.items);
  const headerLines: Array<{ order: number; line: OrderCommandRenderLine }> = [];
  const titleConfig = settings.commandTitle;
  const titleTableValue = extractTableValue(context.tableLabel);
  const titlePrefix = titleConfig.uppercase
    ? titleConfig.prefix.trim().toUpperCase()
    : titleConfig.prefix.trim();
  let titleText = "";

  if (titleConfig.enabled || settings.showCommandTitle) {
    if (titleConfig.displayMode === "prefix-only") {
      titleText = titlePrefix;
    } else if (titleConfig.displayMode === "table-only") {
      titleText = titleTableValue;
    } else {
      const parts = [titlePrefix];
      if (titleConfig.includeTableValue && titleTableValue) {
        parts.push(titleTableValue);
      }
      titleText = parts.filter(Boolean).join(" ").trim();
    }

    if (titleText) {
      headerLines.push({
        order: titleConfig.order,
        line: {
          role: "title",
          text: titleText,
          emphasized: titleConfig.fontWeight === "bold",
          centered: titleConfig.centered,
          fontSize: titleConfig.fontSize,
          fontWeight: titleConfig.fontWeight,
        },
      });
    }
  }

  settings.headerFields
    .slice()
    .sort((left, right) => left.order - right.order)
    .forEach((field) => {
      if (!field.enabled) {
        return;
      }

      if (
        (field.key === "customer" || field.key === "company") &&
        !settings.printCustomerCompanyName
      ) {
        return;
      }

      const value = getHeaderFieldValue(field.key, context);
      const text = buildHeaderLineText(field, value);

      if (!text) {
        return;
      }

      headerLines.push({
        order: field.order,
        line: {
          role: "header",
          text,
          emphasized: field.fontWeight === "bold",
          centered: false,
          fontSize: field.fontSize,
          fontWeight: field.fontWeight,
        },
      });
    });

  headerLines
    .sort((left, right) => left.order - right.order)
    .forEach((entry) => lines.push(entry.line));

  lines.push(createRenderLine("separator", ""));
  const renderItemsBlock = (items: OrderCommandRenderItem[]) => {
    let previousCategory = "";

    items.forEach((item, itemIndex) => {
      if (
        settings.alwaysPrintCategoryNames &&
        item.category?.trim() &&
        item.category !== previousCategory
      ) {
        lines.push(createRenderLine("section", `[${item.category.trim()}]`, { emphasized: true }));
        previousCategory = item.category;
      }

      const quantityLabel = settings.printPieceCount ? `${item.quantity}pz` : `${item.quantity}x`;
      const productName = formatProductNameForCommand(item.name, settings.productTextStyle);
      lines.push(
        createRenderLine("product", `${quantityLabel} ${productName}`, {
          emphasized: settings.productBold,
        })
      );

      if (item.variant?.trim()) {
        lines.push(
          createRenderLine(
            "variant",
            formatVariantNameForCommand(item.variant.trim(), settings.variantTextStyle),
            { emphasized: settings.variantTextStyle === "bold" }
          )
        );
      }

      if (settings.printOrderNote && item.note?.trim()) {
        lines.push(
          createRenderLine(
            "note",
            `Nota: ${
              settings.noteUppercase ? item.note.trim().toUpperCase() : item.note.trim()
            }`,
            { emphasized: settings.noteBold }
          )
        );
      }

      if (itemIndex < items.length - 1) {
        pushSpacingLines(lines, getSpacingLineCount(settings.productLineSpacing));
      }
    });
  };

  const courseGroups = mergedItems.reduce<
    Array<{ course: string; items: OrderCommandRenderItem[] }>
  >((accumulator, item) => {
    const courseLabel = item.course?.trim() || "";
    const currentGroup = accumulator.find((group) => group.course === courseLabel);

    if (currentGroup) {
      currentGroup.items.push(item);
      return accumulator;
    }

    accumulator.push({
      course: courseLabel,
      items: [item],
    });

    return accumulator;
  }, []);

  courseGroups
    .sort((left, right) => {
      const weightDifference = getCourseSortWeight(left.course) - getCourseSortWeight(right.course);
      if (weightDifference !== 0) {
        return weightDifference;
      }
      return left.course.localeCompare(right.course, "it", { numeric: true });
    })
    .forEach((courseGroup, courseIndex) => {
      if (courseIndex > 0) {
        lines.push(createRenderLine("separator", ""));
      }

      if (settings.showCourseHeader && courseGroup.course) {
        pushSpacingLines(lines, getSpacingLineCount(settings.courseHeaderSpacingTop));
        lines.push(
          createRenderLine("section", buildCourseHeaderText(settings, courseGroup.course), {
            emphasized: settings.courseHeaderBold,
            centered: settings.courseHeaderCentered,
            fontSize: settings.courseHeaderFontSize,
            fontWeight: settings.courseHeaderBold ? "bold" : "normal",
          })
        );
        pushSpacingLines(lines, getSpacingLineCount(settings.courseHeaderSpacingBottom));
      }

      const groupedItems = getGroupedRenderItems(settings, courseGroup.items);

      if (groupedItems.unassignedItems.length > 0) {
        renderItemsBlock(groupedItems.unassignedItems);
      }

      groupedItems.guestGroups.forEach((group, groupIndex) => {
        if (lines.length > 0 && (groupedItems.unassignedItems.length > 0 || groupIndex > 0)) {
          pushSpacingLines(lines, getSpacingLineCount(settings.guestGroupSpacing));
        }

        if (settings.showGuestGroupTitle) {
          const guestNumber = group.guestCode.trim().replace(/^C/i, "");
          const guestTitleBase = settings.guestGroupTitleText.trim() || "COMMENSALE";
          const guestTitleLabel = settings.guestGroupUppercase
            ? guestTitleBase.toUpperCase()
            : guestTitleBase;

          lines.push(
            createRenderLine("section", `${guestTitleLabel} ${guestNumber}`.trim(), {
              emphasized: settings.guestGroupBold,
              centered: settings.guestGroupCentered,
              fontSize: settings.guestGroupFontSize,
              fontWeight: settings.guestGroupBold ? "bold" : "normal",
            })
          );
        }

        renderItemsBlock(group.items);
      });
    });

  if (settings.singleProductFooter.trim()) {
    lines.push(createRenderLine("separator", ""));
    lines.push(createRenderLine("footer", settings.singleProductFooter.trim()));
  }

  if (settings.printCommandTotal && typeof context.total === "number") {
    lines.push(createRenderLine("separator", ""));
    lines.push(
      createRenderLine("total", `Totale comanda: ${context.total.toFixed(2)} EUR`, {
        emphasized: true,
      })
    );
  }

  return lines;
}

export function getOrderCommandSettings() {
  if (typeof window === "undefined") {
    return getDefaultOrderCommandSettings();
  }

  const rawValue = window.localStorage.getItem(ORDER_COMMAND_SETTINGS_STORAGE_KEY);

  if (!rawValue) {
    const defaults = getDefaultOrderCommandSettings();
    window.localStorage.setItem(ORDER_COMMAND_SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<OrderCommandSettings>;
    const normalized = normalizeSettings(parsedValue);
    window.localStorage.setItem(ORDER_COMMAND_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const defaults = getDefaultOrderCommandSettings();
    window.localStorage.setItem(ORDER_COMMAND_SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

export function saveOrderCommandSettings(settings: OrderCommandSettings) {
  const previousSettings = getOrderCommandSettings();
  const normalized = normalizeSettings({
    ...settings,
    updatedAt: getNowIso(),
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(ORDER_COMMAND_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }

  recordAuditEvent({
    eventType: "CONFIG_COMMAND_PRINT_CHANGED",
    entityType: "command-settings",
    entityId: "order-command-settings",
    previousValue: previousSettings,
    nextValue: normalized,
    origin: "configuration",
  });

  return normalized;
}
