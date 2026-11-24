"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icono from "@/components/Icono";

const COOKIE = "denaserv_cookies";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
// Solo las páginas públicas miden visitas: el panel y las fichas de clientes (que llevan un código privado en la dirección) nunca.
const RUTAS_PUBLICAS = ["/", "/privacidad", "/terminos"];

type Decision = "aceptadas" | "rechazadas" | "";

const leer = (): Decision => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(aceptadas|rechazadas)`));
  return (m?.[1] as Decision) ?? "";
};
const guardar = (d: Exclude<Decision, "">) => {
  document.cookie = `${COOKIE}=${d}; Max-Age=${60 * 60 * 24 * 180}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
};

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void }
}

/** Carga Google Analytics una sola vez (después de aceptar) y deja de medir con «rechazar». */
function activarAnalytics() {
  if (!GA_ID || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...a: unknown[]) { window.dataLayer!.push(a); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false, anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

/** Aviso de cookies: Google Analytics solo se activa si la persona acepta. Se puede cambiar la decisión desde el pie de página. */
export default function BannerCookies() {
  const pathname = usePathname();
  const publica = RUTAS_PUBLICAS.includes(pathname);
  const [decision, setDecision] = useState<Decision>("");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const d = leer();
    setDecision(d);
    setAbierto(d === "");
    const reabrir = () => setAbierto(true);
    window.addEventListener("cookies:abrir", reabrir);
    return () => window.removeEventListener("cookies:abrir", reabrir);
  }, []);

  useEffect(() => {
    if (decision === "aceptadas" && publica) {
      activarAnalytics();
      window.gtag?.("event", "page_view", { page_path: pathname });
    }
  }, [decision, publica, pathname]);

  const elegir = (d: Exclude<Decision, "">) => {
    guardar(d);
    setDecision(d);
    setAbierto(false);
    if (d === "rechazadas" && window.gtag) window.location.reload(); // la forma segura de detener lo ya cargado
  };

  if (!publica || !abierto) return null;
  return (
    <div role="dialog" aria-label="Aviso de cookies" aria-live="polite"
      className="animate-subir fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-3xl rounded-2xl bg-blue-950/95 backdrop-blur-md text-white shadow-2xl shadow-black/40 ring-1 ring-white/15 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span aria-hidden className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-300"><Icono nombre="cookie" className="h-6 w-6" /></span>
        <p className="text-sm text-blue-100 sm:mr-auto">
          Usamos cookies técnicas para que el sitio funcione y, <strong className="text-white">solo si usted lo acepta</strong>, Google Analytics para medir las visitas
          de forma agregada. Más detalles en la <Link href="/privacidad" className="underline hover:text-white">política de privacidad</Link> y los{" "}
          <Link href="/terminos" className="underline hover:text-white">términos y condiciones</Link>.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => elegir("rechazadas")} className="!min-h-0 rounded-full border border-white/30 hover:bg-white/10 px-4 py-2 text-sm font-bold cursor-pointer">Solo necesarias</button>
          <button type="button" onClick={() => elegir("aceptadas")} className="!min-h-0 rounded-full bg-amber-400 hover:bg-amber-300 px-5 py-2 text-sm font-black text-blue-950 cursor-pointer">Aceptar</button>
        </div>
      </div>
    </div>
  );
}
