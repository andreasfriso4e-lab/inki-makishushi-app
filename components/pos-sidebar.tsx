"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SVGProps } from "react";
import { getRestaurantConfig } from "@/lib/restaurant-config";
import { useAuth } from "@/store/auth-context";

type IconProps = SVGProps<SVGSVGElement>;

type SidebarItem = {
  id: string;
  label: string;
  icon: (props: IconProps) => React.JSX.Element;
};

type UtilityMenuItem = {
  id: string;
  label: string;
  icon: (props: IconProps) => React.JSX.Element;
};

type UtilityMenuView = "main" | "settings";

type PosSidebarProps = {
  activeItemId?: string;
};

function HomeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3 2.9 5.88 6.49.95-4.7 4.58 1.11 6.47L12 17.85 6.2 20.88l1.11-6.47-4.7-4.58 6.49-.95Z" />
    </svg>
  );
}

function GridIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListCheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m4 6 2 2 4-4" />
      <path d="M12 6h8" />
      <path d="m4 12 2 2 4-4" />
      <path d="M12 12h8" />
      <path d="m4 18 2 2 4-4" />
      <path d="M12 18h8" />
    </svg>
  );
}

function CalendarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="17" rx="1" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function SmartphoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ChartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 3v18h18" />
      <path d="M7 14v4" />
      <path d="M12 10v8" />
      <path d="M17 6v12" />
    </svg>
  );
}

function FileIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </svg>
  );
}

function BuildingIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="3" width="16" height="18" />
      <path d="M9 8h1" />
      <path d="M14 8h1" />
      <path d="M9 12h1" />
      <path d="M14 12h1" />
      <path d="M10 21v-4h4v4" />
    </svg>
  );
}

function UsersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ReceiptIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 3h16v18l-3-2-2 2-3-2-3 2-2-2-3 2Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function CardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M7 15h3" />
    </svg>
  );
}

function WalletIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
      <path d="M16 12h.01" />
      <path d="M6 7V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function PackageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m12 12 8-4.5" />
      <path d="m12 12-8-4.5" />
      <path d="M12 21v-9" />
    </svg>
  );
}

function SettingsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function LifebuoyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="m5.6 5.6 4.2 4.2" />
      <path d="m14.2 14.2 4.2 4.2" />
      <path d="m18.4 5.6-4.2 4.2" />
      <path d="m9.8 14.2-4.2 4.2" />
    </svg>
  );
}

function NewsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2Z" />
      <path d="M19 19a2 2 0 0 0 2-2V8" />
      <path d="M8 9h7" />
      <path d="M8 13h7" />
      <path d="M8 17h4" />
    </svg>
  );
}

function ArrowLeftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function PercentIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m19 5-14 14" />
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

function LayersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

function BoxesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function ShoppingCartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.5 3H5l2.4 11.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 6H6" />
    </svg>
  );
}

function PrinterIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

function BarcodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 7v10" />
      <path d="M7 7v10" />
      <path d="M10 7v10" />
      <path d="M14 7v10" />
      <path d="M17 7v10" />
      <path d="M20 7v10" />
    </svg>
  );
}

function MonitorIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

function BanknoteIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9h.01" />
      <path d="M18 15h.01" />
    </svg>
  );
}

function ShieldIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3 5 6v6c0 5 3.5 8 7 9 3.5-1 7-4 7-9V6l-7-3Z" />
    </svg>
  );
}

function ClipboardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
      <path d="M8 11h8" />
      <path d="M8 15h8" />
    </svg>
  );
}

const sidebarItems: SidebarItem[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "favorites", label: "Preferiti", icon: StarIcon },
  { id: "tables", label: "Tavoli", icon: GridIcon },
  { id: "order-status", label: "Stato ordini", icon: ListCheckIcon },
  { id: "calendar", label: "Calendario", icon: CalendarIcon },
  { id: "application", label: "Applicazione", icon: SmartphoneIcon },
];

const utilityMenuItems: UtilityMenuItem[] = [
  { id: "report", label: "Report", icon: ChartIcon },
  { id: "documenti", label: "Documenti", icon: FileIcon },
  { id: "lista-aziende", label: "Lista aziende", icon: BuildingIcon },
  { id: "lista-clienti", label: "Lista clienti", icon: UsersIcon },
  { id: "fattura-differita", label: "Fattura differita", icon: ReceiptIcon },
  { id: "fidelity-card", label: "Fidelity Card", icon: CardIcon },
  { id: "ts-wallet", label: "TS Wallet", icon: WalletIcon },
  { id: "magazzino", label: "Magazzino", icon: PackageIcon },
  { id: "impostazioni", label: "Impostazioni", icon: SettingsIcon },
  { id: "centro-assistenza", label: "Centro assistenza", icon: LifebuoyIcon },
  { id: "news", label: "News", icon: NewsIcon },
];

const settingsMenuItems: UtilityMenuItem[] = [
  { id: "home-settings", label: "Home", icon: HomeIcon },
  { id: "ragione-sociale", label: "Ragione sociale", icon: BuildingIcon },
  { id: "aziende", label: "Aziende", icon: BuildingIcon },
  { id: "aliquote-iva", label: "Aliquote IVA", icon: PercentIcon },
  { id: "reparti", label: "Reparti", icon: LayersIcon },
  { id: "categorie", label: "Categorie", icon: LayersIcon },
  { id: "prodotti", label: "Prodotti", icon: BoxesIcon },
  { id: "modalita-vendita", label: "Modalità di vendita", icon: ShoppingCartIcon },
  { id: "stampanti", label: "Stampanti", icon: PrinterIcon },
  { id: "lettori-barcode", label: "Lettori barcode", icon: BarcodeIcon },
  { id: "display-cliente", label: "Display cliente", icon: MonitorIcon },
  { id: "pagamenti", label: "Pagamenti", icon: WalletIcon },
  { id: "metodo-pagamento", label: "Metodo di pagamento", icon: BanknoteIcon },
  { id: "ruolo", label: "Ruolo", icon: ShieldIcon },
  { id: "operatori", label: "Operatori", icon: UsersIcon },
  { id: "documenti-settings", label: "Documenti", icon: FileIcon },
  { id: "ordine-comande", label: "Ordine e comande", icon: ClipboardIcon },
];

export function PosSidebar({ activeItemId = "tables" }: PosSidebarProps) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<UtilityMenuView>("main");
  const restaurantConfig = getRestaurantConfig();
  const cassaViewPath = (view: string) => (view === "tables" ? "/cassa" : `/cassa?view=${view}`);
  const allowedSidebarItems = restaurantConfig.allowedSidebarItems;
  const allowedUtilityItems = restaurantConfig.allowedUtilityItems;
  const allowedSettingsItems = restaurantConfig.allowedSettingsItems;

  const settingsRouteMap: Record<string, string> = {
    "home-settings": cassaViewPath("settings-home"),
    "ragione-sociale": cassaViewPath("settings-company"),
    aziende: cassaViewPath("settings-companies"),
    "aliquote-iva": cassaViewPath("settings-vat"),
    reparti: cassaViewPath("settings-departments"),
    categorie: cassaViewPath("settings-categories"),
    prodotti: cassaViewPath("settings-products"),
    stampanti: cassaViewPath("settings-printers"),
    pagamenti: cassaViewPath("settings-payments"),
    "metodo-pagamento": cassaViewPath("settings-payments"),
    ruolo: cassaViewPath("settings-roles"),
    operatori: cassaViewPath("settings-roles"),
    "ordine-comande": cassaViewPath("settings-commands"),
  };

  const utilityRouteMap: Record<string, string> = {
    documenti: cassaViewPath("documenti"),
    report: cassaViewPath("report"),
    "fidelity-card": cassaViewPath("fidelity"),
  };

  const navigateToCassaView = (path: string) => {
    router.push(path);
    setIsSidebarMenuOpen(false);

    window.setTimeout(() => {
      if (
        typeof window !== "undefined" &&
        `${window.location.pathname}${window.location.search}` !== path
      ) {
        window.location.assign(path);
      }
    }, 120);
  };

  useEffect(() => {
    if (!isSidebarMenuOpen) {
      setMenuView("main");
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSidebarMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSidebarMenuOpen]);

  return (
    <>
      {isSidebarMenuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/35"
          onClick={() => setIsSidebarMenuOpen(false)}
        >
          <div
            className="fixed left-[58px] top-0 z-50 h-full w-[22vw] min-w-[280px] max-w-[420px] border-r border-[#d8d5cc] bg-[#ffffff]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
              {menuView === "settings" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMenuView("main")}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#514b43] hover:bg-[#fbf8f2]"
                    aria-label="Torna al menu principale"
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                  </button>
                  <div className="text-sm font-bold text-[#2e2a25]">Impostazioni</div>
                </div>
              ) : (
                <div className="text-sm font-bold text-[#2e2a25]">Menu Utility</div>
              )}
            </div>

            <div className="h-[calc(100dvh-61px)] overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
              <div className="space-y-1">
                {(menuView === "settings"
                  ? settingsMenuItems.filter((item) => {
                      if (allowedSettingsItems && !allowedSettingsItems.includes(item.id)) {
                        return false;
                      }

                      if (!hasPermission("canAccessSettings")) {
                        return false;
                      }

                      if (item.id === "stampanti" && !hasPermission("canManagePrinters")) {
                        return false;
                      }

                      if (
                        (item.id === "pagamenti" || item.id === "metodo-pagamento") &&
                        !hasPermission("canManagePaymentsSettings")
                      ) {
                        return false;
                      }

                      if (item.id === "aliquote-iva" && !hasPermission("canManageVatSettings")) {
                        return false;
                      }

                      if (item.id === "ordine-comande" && !hasPermission("canManageOrderSettings")) {
                        return false;
                      }

                      if ((item.id === "ruolo" || item.id === "operatori") && !hasPermission("canManageRoles")) {
                        return false;
                      }

                      return true;
                    })
                  : utilityMenuItems.filter(
                      (item) => !allowedUtilityItems || allowedUtilityItems.includes(item.id)
                    )).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (menuView === "main" && item.id === "impostazioni") {
                        if (!hasPermission("canAccessSettings")) {
                          setIsSidebarMenuOpen(false);
                          return;
                        }
                        setMenuView("settings");
                        return;
                      }

                      if (menuView === "settings") {
                        const nextPath = settingsRouteMap[item.id];

                        if (nextPath) {
                          navigateToCassaView(nextPath);
                        }
                        return;
                      }

                      if (menuView === "main") {
                        const nextPath = utilityRouteMap[item.id];

                        if (nextPath) {
                          navigateToCassaView(nextPath);
                          return;
                        }
                      }

                      setIsSidebarMenuOpen(false);
                    }}
                    className="flex h-11 w-full items-center gap-3 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-left text-sm text-[#2e2a25] hover:bg-[#fbf8f2]"
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0 text-[#5d564e]" />
                    <span className="font-semibold">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <aside className="relative z-50 flex w-[58px] shrink-0 flex-col items-center gap-2 border-r border-[#8d939a] bg-[#474f57] px-1 py-3">
        <div className="mb-1">
          <button
            type="button"
            title="Menu"
            aria-label="Menu"
            onClick={() => setIsSidebarMenuOpen((current) => !current)}
            className={[
              "flex h-10 w-10 items-center justify-center rounded-[4px] border text-white",
              isSidebarMenuOpen ? "border-[#d5dbe1] bg-[#66717b]" : "border-[#79828b] bg-[#56616b]",
            ].join(" ")}
          >
            <MenuIcon className="h-[18px] w-[18px]" />
          </button>
        </div>

        {sidebarItems
          .filter((item) => !allowedSidebarItems || allowedSidebarItems.includes(item.id))
          .map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            onClick={() => {
              if (item.id === "home") {
                navigateToCassaView(cassaViewPath("tables"));
              }

              if (item.id === "favorites") {
                navigateToCassaView(cassaViewPath("favorites"));
              }

              if (item.id === "order-status") {
                navigateToCassaView(cassaViewPath("order-status"));
              }

              if (item.id === "calendar") {
                navigateToCassaView(cassaViewPath("calendar"));
              }

              if (item.id === "application") {
                navigateToCassaView(cassaViewPath("app-orders"));
              }

              if (item.id === "tables") {
                navigateToCassaView(cassaViewPath("tables"));
              }
            }}
            className={[
              "flex h-10 w-10 items-center justify-center rounded-[4px] border text-white",
              activeItemId === item.id ? "border-[#d5dbe1] bg-[#66717b]" : "border-[#79828b] bg-[#56616b]",
            ].join(" ")}
          >
            <item.icon className="h-[18px] w-[18px]" />
          </button>
        ))}
      </aside>
    </>
  );
}
