import type { Metadata } from "next";
import "./globals.css";
import ValidacionVisual from "@/components/ValidacionVisual";
import BannerCookies from "@/components/BannerCookies";

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
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-amber-400 focus:px-4 focus:py-2 focus:font-bold focus:text-blue-950">Saltar al contenido</a>
        <ValidacionVisual />
        {children}
        <BannerCookies />
      </body>
    </html>
  );
}
