"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Cotizacion {
  id: number;
  uuid_publico: string;
  cliente_nombre: string;
  cliente_telefono: string;
  costo_total: number;
  estado: string;
  fecha_creacion: string;
}

export default function DashboardPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchCotizaciones = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const res = await fetch("http://127.0.0.1:8000/api/cotizaciones/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setCotizaciones(data);
        } else if (res.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
        }
      } catch (error) {
        console.error("Error al cargar cotizaciones", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCotizaciones();
  }, [router]);

  if (loading) {
    return <div className="text-xl p-8">Cargando cotizaciones...</div>;
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Cotizaciones Recientes</h1>
        <Link href="/dashboard/cotizador" className="btn-primary text-lg">
          + Crear Nueva
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-300">
              <th className="p-4 font-bold text-lg text-slate-700">Cliente</th>
              <th className="p-4 font-bold text-lg text-slate-700">Teléfono</th>
              <th className="p-4 font-bold text-lg text-slate-700">Fecha</th>
              <th className="p-4 font-bold text-lg text-slate-700">Total</th>
              <th className="p-4 font-bold text-lg text-slate-700">Estado</th>
              <th className="p-4 font-bold text-lg text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cotizaciones.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500 text-lg">
                  No hay cotizaciones aún. Crea la primera.
                </td>
              </tr>
            ) : (
              cotizaciones.map((cotizacion) => (
                <tr key={cotizacion.id} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="p-4 text-lg font-medium">{cotizacion.cliente_nombre}</td>
                  <td className="p-4 text-lg">{cotizacion.cliente_telefono}</td>
                  <td className="p-4 text-lg">
                    {new Date(cotizacion.fecha_creacion).toLocaleDateString("es-CL")}
                  </td>
                  <td className="p-4 text-lg font-semibold text-blue-900">
                    ${cotizacion.costo_total.toLocaleString("es-CL")}
                  </td>
                  <td className="p-4 text-lg">
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-bold border border-yellow-300">
                      {cotizacion.estado}
                    </span>
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/cotizacion/${cotizacion.uuid_publico}`}
                      target="_blank"
                      className="text-blue-600 font-bold hover:underline text-lg mr-4"
                    >
                      Ver Ficha
                    </Link>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/cotizacion/${cotizacion.uuid_publico}`;
                        navigator.clipboard.writeText(url);
                        alert("Enlace copiado al portapapeles");
                      }}
                      className="text-slate-600 font-bold hover:text-slate-900 text-lg underline"
                    >
                      Copiar Enlace
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
