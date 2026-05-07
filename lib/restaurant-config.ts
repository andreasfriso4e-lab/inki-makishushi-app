export type RestaurantId = "default" | "canevone";

export type RestaurantFeatureFlags = {
  takeaway: boolean;
  calendar: boolean;
  appOrders: boolean;
  fidelity: boolean;
};

export type RestaurantHomeAreaConfig = {
  id: string;
  name: string;
  type: "room" | "takeaway";
  startTableNumber: number;
  endTableNumber: number;
};

export type RestaurantDepartmentConfig = {
  id: string;
  name: string;
  description?: string;
};

export type RestaurantPrinterConfig = {
  id: string;
  name: string;
  model: "ESC/POS" | "Epson RT v.10 XML7";
  ipAddress: string;
  port: number | null;
  timeoutMs: number;
  paperColumns: number | null;
  role: "fiscal" | "bar" | "kitchen" | "generic";
  enabled: boolean;
  connectionMode: "mock" | "real";
  status: "configured" | "online" | "offline" | "error";
  fiscalDeviceId?: string;
};

export type RestaurantPaymentMethodConfig = {
  id: "CONTANTI" | "CARTA" | "BANCOMAT" | "FIDELITY" | "ASSEGNO";
  label: string;
  enabled: boolean;
};

export type RestaurantCompanyConfig = {
  businessName: string;
  tradeName: string;
  vatNumber: string;
  taxCode: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  phone: string;
  email: string;
  pec: string;
  sdiCode: string;
  website: string;
  vatRegime: string;
  reaNumber: string;
  shareCapital: string;
  businessType: string;
  receiptHeader: string;
  invoiceHeader: string;
  documentFooter: string;
};

export type RestaurantProductSeed = {
  id: string;
  name: string;
  category: string;
  price: number;
  pricePending?: boolean;
  vatRateKey?: string;
  sizeVariants?: Array<{
    id: string;
    label: "4 pezzi" | "8 pezzi";
    price: number;
  }>;
};

export type RestaurantPrintStationConfig = {
  id: string;
  name: string;
  categories: string[];
};

export type RestaurantConfig = {
  id: RestaurantId;
  name: string;
  appTitle: string;
  features: RestaurantFeatureFlags;
  allowedViews?: string[];
  allowedSidebarItems?: string[];
  allowedUtilityItems?: string[];
  allowedSettingsItems?: string[];
  homeAreas?: RestaurantHomeAreaConfig[];
  categories?: string[];
  products?: RestaurantProductSeed[];
  departments?: RestaurantDepartmentConfig[];
  printers?: RestaurantPrinterConfig[];
  paymentMethods?: RestaurantPaymentMethodConfig[];
  categoryPrinterRoles?: Record<string, "bar" | "kitchen" | "generic">;
  orderCommandStations?: RestaurantPrintStationConfig[];
  company?: RestaurantCompanyConfig;
};

const canevoneCategories = [
  "Food",
  "Brunch",
  "Birre",
  "Vini",
  "Bibite",
  "Aperitivi",
  "Spirits & Co",
  "Cocktail classici",
  "Cocktail Canevone",
  "Cocktail analcolici",
];

export const restaurantConfigs: Record<RestaurantId, RestaurantConfig> = {
  default: {
    id: "default",
    name: "Gestionale base",
    appTitle: "Inki Makisushi app",
    features: {
      takeaway: true,
      calendar: true,
      appOrders: true,
      fidelity: true,
    },
  },
  canevone: {
    id: "canevone",
    name: "Canevone",
    appTitle: "Canevone",
    features: {
      takeaway: false,
      calendar: false,
      appOrders: false,
      fidelity: false,
    },
    allowedViews: [
      "tables",
      "favorites",
      "order-status",
      "settings-company",
      "settings-home",
      "settings-departments",
      "settings-categories",
      "settings-products",
      "settings-printers",
      "settings-roles",
      "settings-commands",
      "settings-payments",
      "documenti",
      "report",
    ],
    allowedSidebarItems: ["home", "favorites", "tables", "order-status"],
    allowedUtilityItems: ["report", "documenti", "impostazioni"],
    allowedSettingsItems: [
      "home-settings",
      "ragione-sociale",
      "reparti",
      "categorie",
      "prodotti",
      "stampanti",
      "pagamenti",
      "metodo-pagamento",
      "ruolo",
      "operatori",
      "ordine-comande",
    ],
    homeAreas: [
      {
        id: "corridoio",
        name: "Corridoio",
        type: "room",
        startTableNumber: 1,
        endTableNumber: 10,
      },
      {
        id: "sala-interna",
        name: "Sala interna",
        type: "room",
        startTableNumber: 20,
        endTableNumber: 30,
      },
      {
        id: "sala-esterna",
        name: "Sala esterna",
        type: "room",
        startTableNumber: 31,
        endTableNumber: 55,
      },
    ],
    categories: canevoneCategories,
    products: [],
    departments: [
      { id: "department-cassa-rt", name: "Cassa RT" },
      { id: "department-cucina", name: "Cucina" },
      { id: "department-bar", name: "Bar" },
    ],
    printers: [
      {
        id: "printer-cucina",
        name: "Cucina",
        model: "ESC/POS",
        ipAddress: "192.168.1.202",
        port: 9100,
        timeoutMs: 3000,
        paperColumns: 42,
        role: "kitchen",
        enabled: true,
        connectionMode: "mock",
        status: "configured",
      },
      {
        id: "printer-bar",
        name: "Bar",
        model: "ESC/POS",
        ipAddress: "192.168.1.201",
        port: 9100,
        timeoutMs: 3000,
        paperColumns: 42,
        role: "bar",
        enabled: true,
        connectionMode: "mock",
        status: "configured",
      },
      {
        id: "printer-fiscale-cassa-1",
        name: "RT Cassa 1",
        model: "Epson RT v.10 XML7",
        ipAddress: "192.168.1.210",
        port: 9100,
        timeoutMs: 5000,
        paperColumns: null,
        role: "fiscal",
        enabled: true,
        connectionMode: "mock",
        status: "configured",
        fiscalDeviceId: "RT-CASSA-1",
      },
      {
        id: "printer-fiscale-cassa-2",
        name: "RT Cassa 2",
        model: "Epson RT v.10 XML7",
        ipAddress: "192.168.1.211",
        port: 9100,
        timeoutMs: 5000,
        paperColumns: null,
        role: "fiscal",
        enabled: true,
        connectionMode: "mock",
        status: "configured",
        fiscalDeviceId: "RT-CASSA-2",
      },
    ],
    paymentMethods: [
      { id: "CONTANTI", label: "Contanti", enabled: true },
      { id: "CARTA", label: "Carta", enabled: true },
      { id: "BANCOMAT", label: "Bancomat", enabled: false },
      { id: "FIDELITY", label: "Fidelity card", enabled: false },
      { id: "ASSEGNO", label: "Assegno", enabled: false },
    ],
    categoryPrinterRoles: {
      Food: "kitchen",
      Brunch: "kitchen",
      Birre: "bar",
      Vini: "bar",
      Bibite: "bar",
      Aperitivi: "bar",
      "Spirits & Co": "bar",
      "Cocktail classici": "bar",
      "Cocktail Canevone": "bar",
      "Cocktail analcolici": "bar",
    },
    orderCommandStations: [
      {
        id: "station-cucina",
        name: "Cucina",
        categories: ["Food", "Brunch"],
      },
      {
        id: "station-bar",
        name: "Bar",
        categories: [
          "Birre",
          "Vini",
          "Bibite",
          "Aperitivi",
          "Spirits & Co",
          "Cocktail classici",
          "Cocktail Canevone",
          "Cocktail analcolici",
        ],
      },
    ],
    company: {
      businessName: "Canevone",
      tradeName: "Canevone",
      vatNumber: "",
      taxCode: "",
      address: "",
      postalCode: "",
      city: "",
      province: "",
      country: "Italia",
      phone: "",
      email: "",
      pec: "",
      sdiCode: "",
      website: "",
      vatRegime: "Ordinario",
      reaNumber: "",
      shareCapital: "",
      businessType: "Ristorazione",
      receiptHeader: "Grazie per aver scelto Canevone",
      invoiceHeader: "Canevone",
      documentFooter: "Arrivederci e a presto",
    },
  },
};

export function getActiveRestaurantId(): RestaurantId {
  const configuredId = process.env.NEXT_PUBLIC_ACTIVE_RESTAURANT?.trim().toLowerCase();
  return configuredId === "canevone" ? "canevone" : "default";
}

export function getRestaurantConfig() {
  return restaurantConfigs[getActiveRestaurantId()];
}

export function isRestaurantViewEnabled(viewId: string) {
  const config = getRestaurantConfig();
  return !config.allowedViews || config.allowedViews.includes(viewId);
}
