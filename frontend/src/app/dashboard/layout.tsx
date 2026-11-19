"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/dashboard/proyectos", label: "Proyectos" },
  { href: "/dashboard/catalogos", label: "Materiales y precios" },
  { href: "/dashboard/proveedores", label: "Proveedores" },
  { href: "/dashboard/portafolio", label: "Portafolio" },
  { href: "/dashboard/tarifas", label: "Tarifas" },
  { href: "/dashboard/usuarios", label: "Usuarios" },
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

  useEffect(() => {
    // Guardia de sesión para todo el panel + cierre de sesión automático si la API responde 401 (token vencido).
    if (!localStorage.getItem("token")) {
      router.replace("/login");
      return;
    }
    setAutorizado(true);
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (res.status === 401 && url.includes("/api/") && !url.includes("/auth/")) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        window.location.href = "/login";
      }
      return res;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);

  useEffect(() => {
    const rawUser = localStorage.getItem("usuario");
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        setUserEmail(u.email || u.nombre_completo || "");
      } catch (e) {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    router.push("/"); // al cerrar sesión se vuelve al portafolio público
  };

  if (!autorizado) return null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Una sola barra: marca, secciones y sesión (ocupa poca altura y siempre queda a la vista) */}
      <nav className="bg-blue-900 text-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-4 h-14">
          <Link href="/dashboard" className="text-lg font-extrabold tracking-tight shrink-0">
            DENA<span className="text-amber-400">SERV</span>
          </Link>
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-1 whitespace-nowrap">
              {NAV.map((n) => {
                const activo = n.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={activo ? "page" : undefined}
                    className={`px-3.5 py-1.5 rounded-lg text-base font-semibold transition-colors ${
                      activo ? "bg-white/15 text-white" : "text-blue-100 hover:bg-white/10"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {userEmail && <span className="text-xs text-blue-200 hidden xl:inline-block">{userEmail}</span>}
            <button
              onClick={handleLogout}
              className="!min-h-0 border border-white/30 hover:bg-white/10 text-white text-sm px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer"
            >
              Salir
            </button>
          </div>
        </div>
      </nav>

      {/* Contenido Principal */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {children}
      </main>
    </div>
  );
}
