import type { Metadata } from "next";

import { PalmareHomeView } from "@/components/palmare-home-view";

export const metadata: Metadata = {
  title: "Inki Makisushi app · Palmare",
  appleWebApp: {
    title: "Inki Palmare",
  },
};

export default function PalmarePage() {
  return <PalmareHomeView />;
}
