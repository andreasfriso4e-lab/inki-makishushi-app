"use client";

import { useMemo, useState } from "react";

import type { ProductCategory } from "@/lib/pos-data";
import { getFavoriteCategoryItems } from "@/lib/favorites-catalog";

type FavoritesViewProps = {
  categories: ProductCategory[];
};

export function FavoritesView({ categories }: FavoritesViewProps) {
  const [activeCategory, setActiveCategory] = useState<ProductCategory>(categories[0]);
  const categoryItems = useMemo(() => getFavoriteCategoryItems(activeCategory), [activeCategory]);

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 w-1/2 flex-col border-r border-[#d8d5cc] bg-[#fbf8f2]">
        <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-3 py-2 text-[11px] font-semibold uppercase text-[#5d564e]">
          Categorie
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-4 gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={[
                  "flex min-h-12 w-full items-center justify-center rounded-[4px] border px-2 text-center text-sm font-semibold",
                  activeCategory === category
                    ? "border-[#b9d3ee] bg-[#e8f2fd] text-[#1f4f79]"
                    : "border-[#d4d0c7] bg-[#ffffff] text-[#2e2a25]",
                ].join(" ")}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 w-1/2 flex-col bg-[#fffefb]">
        <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase text-[#5d564e]">{activeCategory}</div>
            <div className="text-[11px] text-[#7a736a]">{categoryItems.length} voci</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {categoryItems.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-5">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-h-[78px] flex-col justify-between rounded-[4px] border border-[#d8d5cc] bg-[#f0ede3] px-2 py-2 text-left text-[#2e2a25]"
                >
                  <div className="line-clamp-2 text-[12px] font-semibold leading-tight">{item.name}</div>
                  <div className="mt-2 text-[11px] font-bold text-[#5b544b]">
                    {item.price.toLocaleString("it-IT", {
                      style: "currency",
                      currency: "EUR",
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[6px] border border-dashed border-[#d8d5cc] bg-[#ffffff] px-3 py-4 text-sm text-[#756f67]">
              Nessuna voce configurata per questa categoria.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
