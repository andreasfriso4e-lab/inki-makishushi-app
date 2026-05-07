"use client";

import { useMemo, useState } from "react";

import type { PokeConfiguratorSection, Product } from "@/lib/pos-data";

type FilterMode = "TUTTE" | "AGGIUNTE" | "RIMOZIONI";

type PokeConfiguratorProps = {
  product: Product;
  sections: PokeConfiguratorSection[];
  onClose: () => void;
  onConfirm: (payload: {
    name: string;
    unitPrice: number;
    note: string;
  }) => void;
};

export function PokeConfigurator({
  product,
  sections,
  onClose,
  onConfirm,
}: PokeConfiguratorProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("TUTTE");
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({
    proteine: [],
    sauce: [],
    vitamine: [],
    taste: [],
  });

  const visibleSections = useMemo(() => {
    if (filterMode === "TUTTE") {
      return sections;
    }

    return sections.filter((section) =>
      filterMode === "AGGIUNTE" ? section.id !== "taste" : section.id === "taste"
    );
  }, [filterMode, sections]);

  const toggleItem = (sectionId: string, itemName: string) => {
    setSelectedItems((current) => {
      const currentItems = current[sectionId] ?? [];
      const exists = currentItems.includes(itemName);

      return {
        ...current,
        [sectionId]: exists
          ? currentItems.filter((entry) => entry !== itemName)
          : [...currentItems, itemName],
      };
    });
  };

  const handleConfirm = () => {
    const noteParts = sections
      .map((section) => {
        const items = selectedItems[section.id] ?? [];
        return items.length > 0 ? `${section.title}: ${items.join(", ")}` : "";
      })
      .filter(Boolean);

    onConfirm({
      name: product.name,
      unitPrice: product.price,
      note: noteParts.join(" | "),
    });
  };

  return (
    <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-[#fffefb]">
      <div className="flex items-center justify-between border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div>
          <h2 className="text-lg font-bold text-[#2e2a25]">Crea Poke</h2>
          <div className="mt-1 text-xs text-[#6a645b]">{product.name}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 border border-[#c7c1b6] bg-[#ffffff] px-3 text-xs font-semibold text-[#2e2a25]"
        >
          CHIUDI
        </button>
      </div>

      <div className="border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-2">
        <div className="grid grid-cols-3 gap-2">
          {(["TUTTE", "AGGIUNTE", "RIMOZIONI"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={[
                "h-9 border px-2 text-xs font-semibold",
                filterMode === mode
                  ? "border-[#b7b2a7] bg-[#fffefb] text-[#2e2a25]"
                  : "border-[#d4d0c7] bg-[#ffffff] text-[#5c564f]",
              ].join(" ")}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <section key={section.id}>
              <div className="flex h-9 w-full items-center rounded-[4px] border border-[#79828b] bg-[#56616b] px-3 text-xs font-bold uppercase tracking-[0.02em] text-white">
                {section.title}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {section.items.map((item) => {
                  const isSelected = (selectedItems[section.id] ?? []).includes(item);

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleItem(section.id, item)}
                      className={[
                        "flex min-h-10 items-center border px-3 text-left text-sm leading-tight",
                        isSelected
                          ? "border-[#b7b2a7] bg-[#f7f4ee] text-[#2e2a25]"
                          : "border-[#d8d5cc] bg-[#ffffff] text-[#4f4941]",
                      ].join(" ")}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="border-t border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <button
          type="button"
          onClick={handleConfirm}
          className="h-11 w-full border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-bold text-[#0b3c5d] hover:bg-[#bfe0ff]"
        >
          AGGIUNGI POKE
        </button>
      </div>
    </div>
  );
}
