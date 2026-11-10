import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DENASERV WEB",
  description: "Casas prefabricadas: portafolio de obras y plataforma de cotizaciones",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased text-slate-900 bg-slate-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
