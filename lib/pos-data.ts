import {
  buildRoomsFromHomeAreas,
  findGeneratedTableById,
  getHomeAreaSettings,
  getInitialTablesStateFromHomeAreas,
} from "@/lib/home-settings";
import { normalizeCompanyRecord } from "@/lib/company-records";
import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";

export type TableStatus = "free" | "occupied";
export type SplitBillMode = "people" | "amount" | "items";
export type SplitBillQuotaStatus = "pending" | "paid";

export type SplitBillQuota = {
  id: string;
  label: string;
  mode: SplitBillMode;
  amount: number;
  status: SplitBillQuotaStatus;
  itemIds?: string[];
  paymentMethod?: string | null;
  paidAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SplitBillState = {
  mode: SplitBillMode;
  quotas: SplitBillQuota[];
  peopleCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type RestaurantTable = {
  id: string;
  name: string;
  room: string;
  roomId?: string;
  status: TableStatus;
  paymentStatus?: "idle" | "pending" | "paid";
  covers: number;
  guests: number;
  customerName: string;
  companyName: string;
  operator: string;
  saleMode: string;
  servicePriceLabel: string;
  discountType: string;
  note: string;
  prebillPrintedAt?: string | null;
  splitBillState?: SplitBillState | null;
  operatorId?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByOperatorId?: string;
  updatedByOperatorId?: string;
  deletedByOperatorId?: string | null;
  paidByOperatorId?: string | null;
  approvedByOperatorId?: string | null;
  fidelityCustomerId?: string | null;
  fidelityCustomerLabel?: string;
  fidelityCardCode?: string;
  fidelityQrCodeValue?: string;
  fidelityScannedBeforePayment?: boolean;
  pointsEligible?: boolean;
  pointsProcessed?: boolean;
  pendingPoints?: number;
  lastFidelityScanAt?: string | null;
  selectedRewardId?: string | null;
  selectedRewardName?: string;
  selectedRewardDiscount?: number;
  selectedRewardPoints?: number;
  rewardRedemptionId?: string | null;
  earnedPoints?: number;
  finalPointsBalanceSnapshot?: number | null;
  pointsBeforePayment?: number | null;
};

export type PosRoom = {
  roomId: string;
  roomName: string;
  roomType?: "room" | "takeaway";
  tables: RestaurantTable[];
};

export type CourseGroup = "PRIMA PORTATA" | "SECONDA PORTATA" | "TERZA PORTATA";

export type ProductCategory = string;

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  pricePending?: boolean;
  vatRateKey?: string;
  sizeVariants?: Array<{
    id: string;
    label: "4 pezzi" | "8 pezzi";
    price: number;
  }>;
};

export type CustomerRecord = {
  id: string;
  name: string;
  taxCode: string;
  phone?: string;
  email?: string;
  note?: string;
};

export type CompanyRecord = {
  id: string;
  name: string;
  vatNumber: string;
  taxCode?: string;
  sdiCode?: string;
  pec?: string;
  address?: string;
  addressStreet?: string;
  addressNumber?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  note?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type PokeConfiguratorSection = {
  id: "proteine" | "sauce" | "vitamine" | "taste";
  title: string;
  items: string[];
};

export type OrderItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  commensaleCode?: string | null;
  sentQuantity?: number;
  queuedQuantity?: number;
  unitPrice: number;
  originalUnitPrice?: number;
  course: CourseGroup;
  status: "draft" | "sent";
  printStatus?: "pending" | "queued" | "sent" | "cancelled" | "modified";
  paymentState?: "unpaid" | "paid";
  operatorLabel?: string;
  note?: string;
  additions?: string[];
  removals?: string[];
  vatRateKey?: string;
  vatRateLabel?: string;
  vatRateValue?: number | null;
  orderId?: string;
  operatorId?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByOperatorId?: string;
  updatedByOperatorId?: string;
  deletedByOperatorId?: string | null;
  sentByOperatorId?: string | null;
  lastPrintJobId?: string | null;
  sentToKitchenAt?: string | null;
  paidByOperatorId?: string | null;
  approvedByOperatorId?: string | null;
};

export type PosTableState = RestaurantTable & {
  orders: OrderItem[];
};

export function getPosRooms(): PosRoom[] {
  return buildRoomsFromHomeAreas(getHomeAreaSettings());
}

export const posRooms: PosRoom[] = getPosRooms();

const products: Product[] = [
  { id: "bao-california", name: "BAO California", category: "Bao", price: 6 },
  { id: "bao-spicy-tonno", name: "BAO Spicy tonno", category: "Bao", price: 7 },
  { id: "bao-spicy-salmone", name: "BAO Spicy salmone", category: "Bao", price: 7 },
  { id: "bao-philadelphia", name: "BAO Philadelphia", category: "Bao", price: 6 },
  { id: "bao-hot", name: "BAO Hot", category: "Bao", price: 7 },
  { id: "bao-affumicato", name: "BAO Affumicato", category: "Bao", price: 7 },
  { id: "bao-crispy", name: "BAO Crispy", category: "Bao", price: 7 },
  { id: "bao-bbq", name: "BAO BBQ", category: "Bao", price: 7 },
  { id: "bao-gricia", name: "BAO Gricia", category: "Bao", price: 7 },
  { id: "bao-super-salmon", name: "BAO Super salmon", category: "Bao", price: 7 },
  { id: "bao-super-tuna", name: "BAO Super tuna", category: "Bao", price: 7 },
  { id: "bao-favignana", name: "BAO Favignana", category: "Bao", price: 9 },
  { id: "bao-tartufo", name: "BAO Tartufo", category: "Bao", price: 7 },
  { id: "bao-roll-flambe", name: "BAO Roll flambé", category: "Bao", price: 7 },
  { id: "bao-yellow", name: "BAO Yellow", category: "Bao", price: 7 },
  { id: "bao-genovese", name: "BAO Genovese", category: "Bao", price: 7 },
  { id: "bao-mediterraneo", name: "BAO Mediterraneo", category: "Bao", price: 7 },
  { id: "bao-heaven", name: "BAO Heaven", category: "Bao", price: 7 },
  { id: "bao-zari", name: "BAO Zari", category: "Bao", price: 7 },
  { id: "bao-boulevard", name: "BAO Boulevard", category: "Bao", price: 7 },
  { id: "bao-pumpkin", name: "BAO Pumpkin", category: "Bao", price: 7 },
  { id: "bao-cod", name: "BAO Cod", category: "Bao", price: 7 },
  { id: "bao-sicily", name: "BAO Sicily", category: "Bao", price: 7 },
  { id: "bao-caramel", name: "BAO Caramel", category: "Bao", price: 7 },
  {
    id: "uramaki-hot",
    name: "Uramaki hot",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "uramaki-crispy",
    name: "Uramaki crispy",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "ura-affumicato",
    name: "Ura affumicato",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "ura-gricia",
    name: "Ura gricia",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "ura-bbq",
    name: "Ura bbq",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "ura-sicolo",
    name: "Ura sicolo",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "tartufo-ura",
    name: "Tartufo Ura",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "roll-flambe",
    name: "Roll flambé",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "uramaki-yellow",
    name: "Uramaki yellow",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "uramaki-genovese",
    name: "Uramaki genovese",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "uramaki-mediterraneo",
    name: "Uramaki mediterraneo",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "heaven",
    name: "Heaven",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "uramaki-crumble",
    name: "Uramaki crumble",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "zari",
    name: "Zari",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "uramaki-pumpkin",
    name: "Uramaki pumpkin",
    category: "Uramaki Deluxe",
    price: 12,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 12 },
      { id: "8pz", label: "8 pezzi", price: 20 },
    ],
  },
  {
    id: "ura-code",
    name: "Ura code",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "ura-sicily",
    name: "Ura Sicily",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "ura-caramel",
    name: "Ura caramel",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "uramaki-gold",
    name: "Uramaki gold",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "ura-tricolore",
    name: "Ura tricolore",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "ura-arcobaleno",
    name: "Ura arcobaleno",
    category: "Uramaki Deluxe",
    price: 13,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 13 },
      { id: "8pz", label: "8 pezzi", price: 22 },
    ],
  },
  {
    id: "uramaki-classici-california",
    name: "California",
    category: "Uramaki classici",
    price: 5,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 5 },
      { id: "8pz", label: "8 pezzi", price: 9 },
    ],
  },
  {
    id: "uramaki-classici-philadelphia",
    name: "Philadelphia",
    category: "Uramaki classici",
    price: 5,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 5 },
      { id: "8pz", label: "8 pezzi", price: 9 },
    ],
  },
  {
    id: "uramaki-classici-california-in-tempura",
    name: "California in tempura",
    category: "Uramaki classici",
    price: 6.5,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 6.5 },
      { id: "8pz", label: "8 pezzi", price: 12 },
    ],
  },
  {
    id: "uramaki-classici-spicy-tonno",
    name: "Spicy tonno",
    category: "Uramaki classici",
    price: 6.5,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 6.5 },
      { id: "8pz", label: "8 pezzi", price: 12 },
    ],
  },
  {
    id: "uramaki-classici-spicy-salmone",
    name: "Spicy salmone",
    category: "Uramaki classici",
    price: 6.5,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 6.5 },
      { id: "8pz", label: "8 pezzi", price: 12 },
    ],
  },
  { id: "hoso-maki-plus", name: "Hoso Maki Plus", category: "Hosomaki", price: 8.5 },
  { id: "hoso-maki-special", name: "Hoso Maki Special", category: "Hosomaki", price: 10 },
  { id: "gunkan-sake", name: "Gunkan sake", category: "Gunkan", price: 11 },
  { id: "gunkan-maguro", name: "Gunkan maguro", category: "Gunkan", price: 11 },
  { id: "gunkan-royal", name: "Gunkan royal", category: "Gunkan", price: 12 },
  { id: "gunkan-cod", name: "Gunkan cod", category: "Gunkan", price: 12 },
  { id: "nigiri-shake", name: "Nigiri Shake", category: "Nigiri", price: 3 },
  { id: "nigiri-sake-8-pezzi", name: "Nigiri Sake (8 pezzi)", category: "Nigiri", price: 10 },
  { id: "nigiri-sake-fume", name: "Nigiri Sake Fumè", category: "Nigiri", price: 3 },
  { id: "nigiri-ebi", name: "Nigiri Ebi", category: "Nigiri", price: 3 },
  { id: "nigiri-escape", name: "Nigiri Escape", category: "Nigiri", price: 7 },
  { id: "nigiri-gambero-rosso", name: "Nigiri gambero rosso", category: "Nigiri", price: 8 },
  { id: "nigiri-ama-ebi", name: "Nigiri Ama Ebi", category: "Nigiri", price: 3.5 },
  { id: "nigiri-maguro", name: "Nigiri Maguro", category: "Nigiri", price: 3.5 },
  { id: "nigiri-maguro-8-pezzi", name: "Nigiri Maguro (8 pezzi)", category: "Nigiri", price: 11 },
  { id: "nigiri-avocado", name: "Nigiri Avocado", category: "Nigiri", price: 2.5 },
  { id: "nigiri-tako", name: "Nigiri Tako", category: "Nigiri", price: 3 },
  { id: "nigiri-ombrina", name: "Nigiri Ombrina", category: "Nigiri", price: 3 },
  { id: "nigiri-hotategai", name: "Nigiri Hotategai", category: "Nigiri", price: 3.5 },
  { id: "nigiri-special", name: "Nigiri Special", category: "Nigiri", price: 8 },
  {
    id: "futomaki-zeng",
    name: "Futomaki Zeng",
    category: "Futomaki",
    price: 8.5,
    sizeVariants: [
      { id: "4pz", label: "4 pezzi", price: 8.5 },
      { id: "8pz", label: "8 pezzi", price: 16 },
    ],
  },
  { id: "temaki-tempura", name: "Temaki Tempura", category: "Temaki", price: 5.5 },
  { id: "temaki-spice-shake", name: "Temaki Spice Shake", category: "Temaki", price: 5.5 },
  { id: "temaki-spicy-tuna", name: "Temaki Spicy Tuna", category: "Temaki", price: 5.5 },
  { id: "sashimi-yomo", name: "Sashimi Yomo", category: "Sashimi", price: 10.5 },
  { id: "sashimi-mix", name: "Sashimi mix", category: "Sashimi", price: 13 },
  { id: "sashimi-di-capasanta", name: "Sashimi di capasanta", category: "Sashimi", price: 12 },
  { id: "sashimi-di-sgombro", name: "Sashimi di sgombro", category: "Sashimi", price: 13 },
  { id: "sashimi-salmone", name: "Sashimi salmone", category: "Sashimi", price: 11 },
  { id: "sashimi-tonno", name: "Sashimi tonno", category: "Sashimi", price: 12.5 },
  { id: "battuto-di-gamberi-rossi", name: "Battuto di gamberi rossi", category: "Crudità", price: 17 },
  { id: "carpaccio-hot", name: "Carpaccio hot", category: "Crudità", price: 15 },
  { id: "carpaccio-mix", name: "Carpaccio mix", category: "Crudità", price: 14 },
  { id: "carpaccio-ombrina", name: "Carpaccio ombrina", category: "Crudità", price: 12 },
  { id: "carpaccio-salmone", name: "Carpaccio salmone", category: "Crudità", price: 12 },
  { id: "carpaccio-tonno", name: "Carpaccio tonno", category: "Crudità", price: 14 },
  { id: "crudita-deluxe", name: "Crudità deluxe", category: "Crudità", price: 29 },
  { id: "gambero-rosso-crudita", name: "Gambero rosso", category: "Crudità", price: 4 },
  { id: "scampo", name: "Scampo", category: "Crudità", price: 3.5 },
  { id: "tartare-ombrina", name: "Tartare ombrina", category: "Crudità", price: 11 },
  { id: "tartare-salmone", name: "Tartare salmone", category: "Crudità", price: 11 },
  { id: "tartare-salmone-special", name: "Tartare salmone special", category: "Crudità", price: 14 },
  { id: "tartare-tonno", name: "Tartare tonno", category: "Crudità", price: 12 },
  { id: "tartare-tonno-special", name: "Tartare tonno special", category: "Crudità", price: 15 },
  { id: "tris-di-capesante", name: "Tris di capesante", category: "Crudità", price: 12 },
  { id: "inchi-box-18-pezzi", name: "Inchi Box 18 pezzi", category: "Inki box", price: 18.5 },
  { id: "inchi-box-25-pezzi", name: "Inchi Box 25 pezzi", category: "Inki box", price: 30 },
  { id: "inchi-box-50-pezzi", name: "Inchi Box 50 pezzi", category: "Inki box", price: 55 },
  { id: "chirashi-normale", name: "Chirashi normale", category: "Chirashi", price: 14.5 },
  { id: "chirashi-salmon", name: "Chirashi salmon", category: "Chirashi", price: 13.5 },
  { id: "wakame", name: "Wakame", category: "Insalate", price: 5.5 },
  { id: "edamame", name: "Edamame", category: "Insalate", price: 5 },
  { id: "verdure-spadellate", name: "Verdure spadellate", category: "Insalate", price: 6 },
  { id: "meat-ramen", name: "Meat ramen", category: "Ramen and soup", price: 15 },
  { id: "sea-ramen", name: "Sea ramen", category: "Ramen and soup", price: 14 },
  { id: "miso-soup", name: "Miso soup", category: "Ramen and soup", price: 5.5 },
  { id: "riso-al-vapore", name: "Riso al vapore", category: "Riso", price: 3 },
  { id: "riso-pollo", name: "Riso pollo", category: "Riso", price: 11 },
  { id: "riso-gamberi-verdure", name: "Riso gamberi e verdure", category: "Riso", price: 12 },
  { id: "udon-pollo", name: "Udon pollo", category: "Udon", price: 9 },
  { id: "udon-gamberi", name: "Udon gamberi", category: "Udon", price: 10 },
  { id: "udon-verdure", name: "Udon verdure", category: "Udon", price: 8.5 },
  { id: "sake-teppanyaki", name: "Sake Teppanyaki", category: "Hot", price: 14 },
  { id: "tagliata-di-tonno", name: "Tagliata di tonno", category: "Hot", price: 16 },
  { id: "taco-teriyaki", name: "Taco teriyaki", category: "Hot", price: 10 },
  { id: "wagyu-tataki", name: "Wagyu Tataki", category: "Hot", price: 0 },
  { id: "ravioli-ebi", name: "Ravioli ebi", category: "Ravioli", price: 7.5 },
  { id: "ravioli-beef", name: "Ravioli BEEF", category: "Ravioli", price: 7.5 },
  { id: "ravioli-vegetables", name: "Ravioli vegetables", category: "Ravioli", price: 6.5 },
  {
    id: "ravioli-ebi-in-tempura",
    name: "Ravioli ebi in tempura",
    category: "Ravioli",
    price: 8.5,
  },
  { id: "ebi-tempura", name: "Ebi tempura", category: "Tempura", price: 10 },
  { id: "black-tempura", name: "Black tempura", category: "Tempura", price: 12.5 },
  { id: "fish-tempura", name: "Fish tempura", category: "Tempura", price: 14 },
  { id: "yasai-tempura", name: "Yasai tempura", category: "Tempura", price: 8 },
  { id: "gamberone-butterfly", name: "Gamberone butterfly", category: "Tempura", price: 8.5 },
  { id: "taco-in-tempura", name: "Taco in tempura", category: "Tempura", price: 12.5 },
  { id: "pollo-in-tempura", name: "Pollo in tempura", category: "Tempura", price: 10 },
  {
    id: "funghi-shiitake-in-tempura",
    name: "Funghi shiitake in tempura",
    category: "Tempura",
    price: 12,
  },
  { id: "poke-medium", name: "Poke Medium", category: "Poke", price: 13 },
  { id: "poke-large", name: "Poke Large", category: "Poke", price: 16 },
  { id: "poke-salmon", name: "Poke Salmon", category: "Poke", price: 14 },
  { id: "poke-chicken", name: "Poke Chicken", category: "Poke", price: 13 },
  { id: "poke-tuna", name: "Poke Tuna", category: "Poke", price: 15 },
  { id: "champagne-brut", name: "Champagne brut", category: "Champagne", price: 14 },
  { id: "champagne-brut-carte-dor", name: "Champagne Brut Carte d'Or", category: "Bollicine", price: 75 },
  { id: "champagne-brut-nature", name: "Champagne Brut Nature", category: "Bollicine", price: 80 },
  { id: "champagne-rose", name: "Champagne Rosé", category: "Bollicine", price: 85 },
  { id: "franciacorta-brut", name: "Franciacorta Brut", category: "Bollicine", price: 33 },
  {
    id: "franciacorta-dosaggio-zero",
    name: "Franciacorta Dosaggio Zero",
    category: "Bollicine",
    price: 40,
  },
  { id: "franciacorta-rose", name: "Franciacorta Rosé", category: "Bollicine", price: 40 },
  { id: "franciacorta-saten", name: "Franciacorta Satèn", category: "Bollicine", price: 38 },
  {
    id: "hamelin-cremant-de-bourgogne",
    name: "Hamelin Cremant de Bourgogne",
    category: "Bollicine",
    price: 30,
  },
  {
    id: "metodo-classico-fulvio-beo-brut",
    name: "Metodo Classico Fulvio Beo Brut",
    category: "Bollicine",
    price: 30,
  },
  {
    id: "metodo-classico-fulvio-beo-rose",
    name: "Metodo Classico Fulvio Beo Rosé",
    category: "Bollicine",
    price: 33,
  },
  {
    id: "prosecco-di-valdobbiadene-superiore-brut",
    name: "Prosecco di Valdobbiadene Superiore Brut",
    category: "Bollicine",
    price: 25,
  },
  {
    id: "prosecco-millesimato-extra-dry",
    name: "Prosecco Millesimato Extra Dry",
    category: "Bollicine",
    price: 22,
  },
  { id: "spritz", name: "Spritz", category: "Cocktail", price: 8 },
  { id: "tiramisu", name: "Tiramisù", category: "Dessert", price: 7 },
  { id: "mochi-gelato", name: "Mochi gelato", category: "Dessert", price: 6 },
  { id: "grappa", name: "Grappa", category: "Distillati", price: 5 },
  { id: "amaro-montenegro", name: "Amaro Montenegro", category: "Amari", price: 4.5 },
  { id: "sake-bicchiere", name: "Bicchiere", category: "Sakè", price: 2 },
  {
    id: "sake-bottiglietta-2-bicchieri",
    name: "Bottiglietta 2 bicchieri",
    category: "Sakè",
    price: 4,
  },
  {
    id: "sake-bottiglietta-4-bicchieri",
    name: "Bottiglietta 4 bicchieri",
    category: "Sakè",
    price: 6,
  },
  { id: "sake-bottiglietta-33-cl", name: "Bottiglietta 33 cl", category: "Sakè", price: 16 },
  { id: "vino-rosso", name: "Vino rosso", category: "Vino", price: 18 },
  { id: "calice-chardonnay", name: "Calice Chardonnay", category: "Vino mescita", price: 6 },
  { id: "birra-asahi", name: "Birra Asahi", category: "Birre", price: 5 },
  { id: "birra-kirin", name: "Birra Kirin", category: "Birre", price: 5 },
  { id: "birra-sapporo", name: "Birra Sapporo", category: "Birre", price: 5 },
  { id: "aperitivo-house", name: "Aperitivo house", category: "Aperitivo", price: 6 },
  { id: "caffe-espresso", name: "Caffè espresso", category: "Caffetteria", price: 1.5 },
  { id: "caffe-decaffeinato", name: "Caffè decaffeinato", category: "Caffetteria", price: 1.5 },
  { id: "caffe-dorzo", name: "Caffè d'orzo", category: "Caffetteria", price: 1.5 },
  { id: "caffe-ginseng", name: "Caffè ginseng", category: "Caffetteria", price: 2 },
  { id: "macchiatone", name: "Macchiatone", category: "Caffetteria", price: 2 },
  { id: "cappuccino", name: "Cappuccino", category: "Caffetteria", price: 2.5 },
  { id: "caffe-corretto", name: "Caffè corretto", category: "Caffetteria", price: 2.5 },
  {
    id: "te-caldo-in-foglia-giapponese",
    name: "Tè caldo in foglia giapponese",
    category: "Caffetteria",
    price: 3.5,
  },
  { id: "pasto", name: "Pasto", category: "Servizi", price: 0 },
  { id: "servizio-cena", name: "Servizio cena", category: "Servizi", price: 3 },
  { id: "servizio-pranzo", name: "Servizio pranzo", category: "Servizi", price: 0 },
  { id: "servizio-torta", name: "Servizio torta", category: "Servizi", price: 3 },
  { id: "acqua-gasata", name: "Acqua Gasata", category: "Bevande", price: 3 },
  { id: "acqua-gasata-050-cl", name: "Acqua Gasata 0,50 cl", category: "Bevande", price: 2 },
  { id: "acqua-naturale", name: "Acqua Naturale", category: "Bevande", price: 3 },
  { id: "acqua-naturale-050-cl", name: "Acqua Naturale 0,50 cl", category: "Bevande", price: 2 },
  { id: "coca-cola", name: "Coca-Cola", category: "Bevande", price: 3 },
  { id: "coca-cola-zero", name: "Coca-Cola Zero", category: "Bevande", price: 3 },
  { id: "fanta", name: "Fanta", category: "Bevande", price: 3 },
  { id: "ginger-beer", name: "Ginger Beer", category: "Bevande", price: 4 },
  { id: "lemon-soda", name: "Lemon Soda", category: "Bevande", price: 3 },
  { id: "red-bull", name: "Red Bull", category: "Bevande", price: 4 },
  { id: "soda-polpalmo", name: "Soda Polpalmo", category: "Bevande", price: 3 },
  { id: "te-verde", name: "Tè verde", category: "Bevande", price: 3 },
  {
    id: "te-verde-al-gelsomino",
    name: "Tè verde gelsomino",
    category: "Bevande",
    price: 3,
  },
  { id: "tonica", name: "Tonica", category: "Bevande", price: 3 },
];

const CUSTOMERS_STORAGE_KEY = getRestaurantStorageKey("pos-settings-customers");
const COMPANIES_STORAGE_KEY = getRestaurantStorageKey("pos-settings-companies");
const BUSINESS_DIRECTORY_API_ENDPOINT = "/api/business-directory";

const customers: CustomerRecord[] = [
  {
    id: "customer-1",
    name: "Luca Bianchi",
    taxCode: "BNC LCU 85A01 H501Z".replaceAll(" ", ""),
    phone: "+39 333 1020304",
    email: "luca.bianchi@example.it",
  },
  {
    id: "customer-2",
    name: "Giulia Rossi",
    taxCode: "RSS GLI 90C41 F205Y".replaceAll(" ", ""),
    phone: "+39 333 4050607",
    email: "giulia.rossi@example.it",
  },
  {
    id: "customer-3",
    name: "Marco Verdi",
    taxCode: "VRD MRC 78T12 D612K".replaceAll(" ", ""),
    phone: "+39 333 7080901",
    email: "marco.verdi@example.it",
  },
  {
    id: "customer-4",
    name: "Elena Neri",
    taxCode: "NRE LNE 92L55 H224Q".replaceAll(" ", ""),
    phone: "+39 333 2233445",
    email: "elena.neri@example.it",
  },
];

const companies: CompanyRecord[] = [
  {
    id: "company-1",
    name: "Alfa SRL",
    vatNumber: "01234560987",
    taxCode: "01234560987",
    sdiCode: "ALF1234",
    pec: "alfa@pec.it",
    address: "Via Torino 18",
    addressStreet: "Via Torino",
    addressNumber: "18",
    postalCode: "20121",
    city: "Milano",
    province: "MI",
    country: "Italia",
    contactPerson: "Chiara Sala",
    phone: "+39 02 123456",
    email: "amministrazione@alfasrl.it",
    isActive: true,
  },
  {
    id: "company-2",
    name: "Beta Food SRL",
    vatNumber: "03456780129",
    taxCode: "03456780129",
    sdiCode: "BET5678",
    pec: "betafood@pec.it",
    address: "Via Verdi 42",
    addressStreet: "Via Verdi",
    addressNumber: "42",
    postalCode: "40121",
    city: "Bologna",
    province: "BO",
    country: "Italia",
    contactPerson: "Matteo Riva",
    phone: "+39 051 456789",
    email: "info@betafood.it",
  },
  {
    id: "company-3",
    name: "Gamma Retail SPA",
    vatNumber: "09876123450",
    taxCode: "09876123450",
    sdiCode: "GAM9012",
    pec: "gamma@pec.it",
    address: "Corso Italia 7",
    addressStreet: "Corso Italia",
    addressNumber: "7",
    postalCode: "50123",
    city: "Firenze",
    province: "FI",
    country: "Italia",
    contactPerson: "Sara Conti",
    phone: "+39 055 334455",
    email: "office@gammaretail.it",
  },
  {
    id: "company-4",
    name: "Delta Service SNC",
    vatNumber: "04561230981",
    taxCode: "04561230981",
    sdiCode: "DEL3456",
    pec: "delta@pec.it",
    address: "Via Mazzini 11",
    addressStreet: "Via Mazzini",
    addressNumber: "11",
    postalCode: "35122",
    city: "Padova",
    province: "PD",
    country: "Italia",
    contactPerson: "Davide Moro",
    phone: "+39 049 778899",
    email: "contabilita@deltaservice.it",
  },
];

function readStoredRecords<T>(storageKey: string, fallback: T[]): T[] {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(storageKey);

  if (!storedValue) {
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as T[];
    return Array.isArray(parsedValue) && parsedValue.length > 0 ? parsedValue : fallback;
  } catch {
    window.localStorage.removeItem(storageKey);
    return fallback;
  }
}

export const productCategories: ProductCategory[] = [
  "Bao",
  "Uramaki Deluxe",
  "Uramaki classici",
  "Hosomaki",
  "Gunkan",
  "Nigiri",
  "Futomaki",
  "Temaki",
  "Sashimi",
  "Crudità",
  "Inki box",
  "Chirashi",
  "Insalate",
  "Ramen and soup",
  "Riso",
  "Udon",
  "Hot",
  "Ravioli",
  "Tempura",
  "Poke",
  "Champagne",
  "Bollicine",
  "Cocktail",
  "Dessert",
  "Distillati",
  "Amari",
  "Sakè",
  "Vino",
  "Vino mescita",
  "Birre",
  "Aperitivo",
  "Caffetteria",
  "Servizi",
  "Bevande",
];

const LEGACY_GHOST_ORDER_PRODUCT_IDS = [
  "bao-salmone",
  "nigiri-special",
  "uramaki-spicy-tuna",
  "calice-chardonnay",
  "tiramisu",
] as const;

const CATEGORIES_STORAGE_KEY = getRestaurantStorageKey("pos-settings-categories");
const PRODUCTS_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-settings-products");

function readStoredCatalogValue<T>(storageKey: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as T;
    return parsedValue ?? fallback;
  } catch {
    return fallback;
  }
}

export function findTableById(tableId: string) {
  return findGeneratedTableById(tableId, getHomeAreaSettings());
}

export function getProducts() {
  const configuredProducts = getRestaurantConfig().products ?? products;
  return readStoredCatalogValue(PRODUCTS_SETTINGS_STORAGE_KEY, configuredProducts) as Product[];
}

export function getProductCategories(): ProductCategory[] {
  const configuredCategories = getRestaurantConfig().categories ?? productCategories;
  const storedCategories = readStoredCatalogValue<Array<{ name?: string }>>(CATEGORIES_STORAGE_KEY, []);

  if (Array.isArray(storedCategories) && storedCategories.length > 0) {
    return storedCategories
      .map((category) => category?.name?.trim())
      .filter((category): category is string => Boolean(category)) as ProductCategory[];
  }

  return configuredCategories;
}

export function getInitialOrderForTable(tableId: string): OrderItem[] {
  void tableId;
  return [];
}

export function getLegacyGhostOrderProductIds() {
  return [...LEGACY_GHOST_ORDER_PRODUCT_IDS];
}

export function getCustomers() {
  return readStoredRecords(CUSTOMERS_STORAGE_KEY, customers);
}

export function getCompanies() {
  return readStoredRecords(COMPANIES_STORAGE_KEY, companies).map((company) =>
    normalizeCompanyRecord(company)
  );
}

export function saveCustomers(nextCustomers: CustomerRecord[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(nextCustomers));
  }

  return nextCustomers;
}

export function saveCompanies(nextCompanies: CompanyRecord[]) {
  const normalizedCompanies = nextCompanies.map((company) => normalizeCompanyRecord(company));

  if (typeof window !== "undefined") {
    window.localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(normalizedCompanies));
  }

  return normalizedCompanies;
}

export async function fetchSharedBusinessDirectory() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(BUSINESS_DIRECTORY_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as {
      customers?: CustomerRecord[];
      companies?: CompanyRecord[];
      updatedAt?: string | null;
    };
  } catch {
    return null;
  }
}

export async function hydrateBusinessDirectoryFromServer() {
  const remoteState = await fetchSharedBusinessDirectory();

  if (!remoteState) {
    return {
      customers: getCustomers(),
      companies: getCompanies(),
    };
  }

  const nextCustomers = Array.isArray(remoteState.customers)
    ? saveCustomers(remoteState.customers)
    : getCustomers();
  const nextCompanies = Array.isArray(remoteState.companies)
    ? saveCompanies(remoteState.companies)
    : getCompanies();

  return {
    customers: nextCustomers,
    companies: nextCompanies,
  };
}

export async function persistBusinessDirectoryToServer(
  customers: CustomerRecord[],
  companies: CompanyRecord[]
) {
  if (typeof window === "undefined") {
    return {
      customers,
      companies,
    };
  }

  try {
    const response = await fetch(BUSINESS_DIRECTORY_API_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({ customers, companies }),
    });

    if (!response.ok) {
      return {
        customers,
        companies,
      };
    }

    const payload = (await response.json()) as {
      customers?: CustomerRecord[];
      companies?: CompanyRecord[];
    };

    return {
      customers: Array.isArray(payload.customers)
        ? saveCustomers(payload.customers)
        : customers,
      companies: Array.isArray(payload.companies)
        ? saveCompanies(payload.companies)
        : companies,
    };
  } catch {
    return {
      customers,
      companies,
    };
  }
}

export function getInitialTablesState(): PosTableState[] {
  return getInitialTablesStateFromHomeAreas(getHomeAreaSettings()).map((table) => ({
    ...table,
    orders: getInitialOrderForTable(table.id),
  }));
}

export function getPokeConfiguratorSections(): PokeConfiguratorSection[] {
  return [
    {
      id: "proteine",
      title: "POKE PROTEINE",
      items: [
        "Baccalà mantecato",
        "Capesante",
        "Gamberi cotti",
        "Gamberi crudi",
        "Gamberi crudi marinati allo zenzero",
        "Gamberi in tempura",
        "Ombrina cruda",
        "Pancetta croccante",
        "Pollo in piastra",
        "Pollo in tempura",
        "Polpo cotto",
        "Salmone affumicato",
        "Salmone flambato",
        "Sashimi salmone",
        "Sashimi tonno",
        "Tartare salmone",
        "Tartare tonno",
        "Tonno flambato",
        "Uovo cotto",
        "Uovo in tempura",
      ],
    },
    {
      id: "sauce",
      title: "POKE SAUCE",
      items: [
        "Crema di tartufo",
        "Maionese",
        "Olio EVO",
        "Olio tartufo",
        "Pesto alla genovese",
        "Salsa anago",
        "Salsa basilico",
        "Salsa di pomodoro datterino",
        "Salsa di soia",
        "Salsa mango",
        "Salsa piccante",
        "Salsa piselli",
        "Salsa ponzu",
        "Salsa teriyaki",
        "Salsa wasabi",
      ],
    },
    {
      id: "vitamine",
      title: "POKE VITAMINE",
      items: [
        "Avocado",
        "Carote",
        "Cetriolo",
        "Cipolla caramellata",
        "Edamame",
        "Erba cipollina",
        "Insalata wakame",
        "Mais",
        "Mango",
        "Philadelphia",
        "Pomodori",
        "Pomodori secchi",
        "Stracciatella",
        "Zucchine",
        "Zucchine cotte",
        "Zucca in tempura",
      ],
    },
    {
      id: "taste",
      title: "POKE TASTE",
      items: [
        "Anacardi",
        "Chips di patate viola",
        "Crumble di cipolla",
        "Granella di nocciola",
        "Panco",
        "Sesamo",
      ],
    },
  ];
}
