"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar Minimalista */}
      <nav className="bg-blue-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex space-x-8 items-center">
              <span className="text-xl font-bold">DenaServ</span>
              <div className="hidden md:flex space-x-4">
                <Link href="/dashboard" className="hover:text-blue-200 font-medium px-3 py-2 rounded-md text-lg">
                  Cotizaciones
                </Link>
                <Link href="/dashboard/cotizador" className="hover:text-blue-200 font-medium px-3 py-2 rounded-md text-lg">
                  Nueva Cotización
                </Link>
                <Link href="/dashboard/proveedores" className="hover:text-blue-200 font-medium px-3 py-2 rounded-md text-lg">
                  Proveedores
                </Link>
                <Link href="/dashboard/inventario" className="hover:text-blue-200 font-medium px-3 py-2 rounded-md text-lg">
                  Inventario
                </Link>
              </div>
            </div>
            <div>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-semibold"
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
