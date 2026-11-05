import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coba Raket",
  description: "Coba raket tenis 3 hari sebelum membeli.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="topbar">
          <div className="page">Coba Raket</div>
        </header>
        {children}
      </body>
    </html>
  );
}
