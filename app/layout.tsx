import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen transition-colors" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
