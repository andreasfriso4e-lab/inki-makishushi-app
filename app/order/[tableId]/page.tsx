import { notFound } from "next/navigation";

import { TableOrderScreen } from "@/components/table-order-screen";
import { resolveAppDeviceMode } from "@/lib/app-mode";
import {
  getPokeConfiguratorSections,
  findTableById,
  type Product,
  type ProductCategory,
} from "@/lib/pos-data";
import { readSharedCatalogConfigState } from "@/lib/server/shared-catalog-config-store";

type PanelMode = "draft" | "sent-summary" | "detail" | "payment" | "edit-order";

type OrderPageProps = {
  params: {
    tableId: string;
  };
  searchParams?: {
    panelMode?: string;
    mode?: string;
    device?: string;
  };
};

function resolvePanelMode(
  requestedPanelMode: string | undefined,
  tableStatus: "free" | "occupied"
): PanelMode {
  if (
    requestedPanelMode === "draft" ||
    requestedPanelMode === "sent-summary" ||
    requestedPanelMode === "detail" ||
    requestedPanelMode === "payment" ||
    requestedPanelMode === "edit-order"
  ) {
    return requestedPanelMode;
  }

  return tableStatus === "occupied" ? "sent-summary" : "draft";
}

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const { tableId } = params;
  const table = findTableById(tableId);

  if (!table) {
    notFound();
  }

  const sharedCatalogState = await readSharedCatalogConfigState();

  return (
    <TableOrderScreen
      tableId={tableId}
      initialPanelMode={resolvePanelMode(searchParams?.panelMode, table.status)}
      deviceMode={resolveAppDeviceMode(searchParams)}
      products={sharedCatalogState.products as Product[]}
      categories={sharedCatalogState.categories.map((category) => category.name) as ProductCategory[]}
      pokeSections={getPokeConfiguratorSections()}
    />
  );
}
