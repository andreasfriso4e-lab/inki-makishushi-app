import { Suspense } from "react";
import type { Metadata } from "next";

import { CassaHomeView } from "@/components/cassa-home-view";

export const metadata: Metadata = {
  title: "Inki Makisushi app · Cassa",
  appleWebApp: {
    title: "Inki Cassa",
  },
};

export default function CassaPage() {
  return (
    <Suspense fallback={null}>
      <CassaHomeView />
    </Suspense>
  );
}
