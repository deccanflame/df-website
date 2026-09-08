import type { Metadata } from "next";
import { AuthModal } from "../components/AuthModal";
import { AuthProvider } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
    metadataBase: new URL("https://deccanflame.com"),
    title: "Deccan Flame | Hyderabadi Cuisine, Reignited",
    description:
      "Ancient technique, fearless flavour. Discover Deccan Flame's modern expression of authentic Hyderabadi cuisine.",
    icons: {
      icon: "/deccan-flame-logo.png",
      shortcut: "/deccan-flame-logo.png",
    },
    openGraph: {
      title: "Deccan Flame | Hyderabadi Cuisine, Reignited",
      description: "Authentic. Bold. Unforgettable.",
      images: [{ url: "/og.png", width: 2200, height: 941 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Deccan Flame | Hyderabadi Cuisine, Reignited",
      description: "Authentic. Bold. Unforgettable.",
      images: ["/og.png"],
    },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <AuthModal />
        </AuthProvider>
      </body>
    </html>
  );
}
