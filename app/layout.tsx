import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/store/auth-context";
import { TableProvider } from "@/store/table-context";
import { AppVersionMonitor } from "@/components/app-version-monitor";
import { GlobalTouchInputManager } from "@/components/global-touch-input-manager";
import { getRestaurantConfig } from "@/lib/restaurant-config";

const restaurantConfig = getRestaurantConfig();

export const metadata: Metadata = {
  title: "Inki Makisushi app",
  description: "Gestionale ristorante cassa e palmare",
  applicationName: "Inki Makisushi app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Inki",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b3c5d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    return (
      <html lang="it">
        <body>
          <AuthProvider>
            <TableProvider>
              <GlobalTouchInputManager />
              <AppVersionMonitor />
              {children}
            </TableProvider>
          </AuthProvider>
        </body>
      </html>
    );
  }
