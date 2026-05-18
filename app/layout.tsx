import type { ReactNode } from "react";
import "./globals.css";
import Providers from "./providers";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen transition-colors" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}