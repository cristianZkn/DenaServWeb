"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ico = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV = [
  { href: "/dashboard", label: "Inicio", icono: ico("M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z") },
  { href: "/dashboard/proyectos", label: "Proyectos", icono: ico("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z") },
  { href: "/dashboard/catalogos", label: "Materiales y precios", icono: ico("M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8") },
  { href: "/dashboard/proveedores", label: "Proveedores", icono: ico("M3 21V8l6-4 6 4v13M15 21V12h6v9M7 12h2M7 16h2") },
  { href: "/dashboard/portafolio", label: "Portafolio", icono: ico("M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M9 9.5h.01") },
  { href: "/dashboard/tarifas", label: "Tarifas", icono: ico("M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6") },
  { href: "/dashboard/usuarios", label: "Usuarios", icono: ico("M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8") },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string>("");
  const [autorizado, setAutorizado] = useState(false);
  const [abierto, setAbierto] = useState(false); // menú lateral en pantallas angostas

  useEffect(() => {
    // Guardia de sesión del panel: la sesión es una cookie httpOnly que solo ve el servidor, así que se le pregunta
    // al backend quién es el usuario. Además, si cualquier llamada responde 401 (sesión vencida) se vuelve al login.
    let activo = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((u) => {
        if (!activo) return;
        setUserEmail(u.email || u.nombre_completo || "");
        setAutorizado(true);
      })
      .catch(() => router.replace("/login"));
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (res.status === 401 && url.includes("/api/") && !url.includes("/auth/")) window.location.href = "/login";
      return res;
    };
    return () => {
      activo = false;
      window.fetch = originalFetch;
    };
  }, [router]);

  useEffect(() => setAbierto(false), [pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/"); // al cerrar sesión se vuelve al portafolio público
  };

  if (!autorizado) return null;

  const seccion = NAV.find((n) => (n.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(n.href)));

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* Barra superior en pantallas angostas */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 h-14 px-4 bg-blue-950 text-white shadow">
        <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir menú" className="!min-h-0 h-10 w-10 rounded-lg border border-white/25 flex items-center justify-center cursor-pointer">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span className="text-lg font-extrabold tracking-tight">DENA<span className="text-amber-400">SERV</span></span>
        <span className="ml-auto text-sm font-semibold text-blue-200">{seccion?.label}</span>
      </header>

      {abierto && <div className="lg:hidden fixed inset-0 z-40 bg-black/50 animate-aparecer" onClick={() => setAbierto(false)} aria-hidden />}

      {/* Menú lateral: la sección actual queda resaltada con una barra ámbar y el resto se atenúa */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-blue-950 to-blue-900 text-white flex flex-col shadow-xl transition-transform duration-300 lg:translate-x-0 ${abierto ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/10">
          <Link href="/dashboard" className="text-xl font-extrabold tracking-tight">DENA<span className="text-amber-400">SERV</span></Link>
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="lg:hidden !min-h-0 h-8 w-8 rounded-lg text-blue-200 hover:bg-white/10 cursor-pointer">✕</button>
        </div>

        <nav aria-label="Secciones del panel" className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV.map((n) => {
            const activo = n.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={activo ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-base font-semibold transition-all duration-200 ${
                  activo ? "bg-white/15 text-white shadow-inner" : "text-blue-200/70 hover:bg-white/10 hover:text-white hover:translate-x-0.5"
                }`}
              >
                <span aria-hidden className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-amber-400 origin-center transition-transform duration-300 ${activo ? "scale-y-100" : "scale-y-0"}`} />
                <span className={`transition-colors ${activo ? "text-amber-300" : "group-hover:text-amber-200"}`}>{n.icono}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <Link href="/" target="_blank" className="block text-sm font-semibold text-blue-200/80 hover:text-white transition-colors">Ver sitio público ↗</Link>
          {userEmail && <p className="text-xs text-blue-200/70 truncate" title={userEmail}>{userEmail}</p>}
          <button onClick={handleLogout} className="w-full !min-h-0 border border-white/25 hover:bg-white/10 text-white text-sm py-2 rounded-lg font-semibold transition cursor-pointer">
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido: los bloques de cada sección aparecen con un breve escalonado (ver .panel-anim en globals.css) */}
      <main className="lg:pl-64">
        <div key={pathname} className="panel-anim w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
