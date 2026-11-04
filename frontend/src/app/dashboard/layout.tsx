"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>("");

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
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navbar Minimalista */}
      <nav className="bg-blue-900 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex space-x-8 items-center">
              <Link href="/dashboard" className="text-xl font-bold tracking-tight">
                DenaServ <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded ml-1 font-normal">v2.0</span>
              </Link>
              <div className="hidden md:flex space-x-2">
                <Link
                  href="/dashboard"
                  className="hover:bg-blue-800 font-medium px-3 py-2 rounded-md text-base transition-colors"
                >
                  Cotizaciones
                </Link>
                <Link
                  href="/dashboard/cotizador"
                  className="hover:bg-blue-800 font-medium px-3 py-2 rounded-md text-base transition-colors"
                >
                  Nueva Cotización
                </Link>
                <Link
                  href="/dashboard/catalogos"
                  className="hover:bg-blue-800 font-medium px-3 py-2 rounded-md text-base transition-colors"
                >
                  Catálogo de Tipos
                </Link>
                <Link
                  href="/dashboard/proveedores"
                  className="hover:bg-blue-800 font-medium px-3 py-2 rounded-md text-base transition-colors"
                >
                  Proveedores
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {userEmail && (
                <span className="text-xs text-blue-200 hidden sm:inline-block">
                  {userEmail}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white text-sm px-3.5 py-1.5 rounded-md font-semibold transition shadow-sm cursor-pointer"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Contenido Principal */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
