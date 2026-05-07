import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inki Makisushi app",
    short_name: "Inki",
    description: "Gestionale ristorante cassa e palmare",
    start_url: "/cassa",
    display: "standalone",
    orientation: "any",
    background_color: "#f4efe7",
    theme_color: "#0b3c5d",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
