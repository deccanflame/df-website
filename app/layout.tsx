import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return {
    metadataBase: new URL(`${protocol}://${host}`),
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
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
