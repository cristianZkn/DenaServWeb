"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Cliente {
  nombre_completo: string;
  telefono_whatsapp: string;
}

interface Cotizacion {
  id: number;
  uuid_publico: string;
  cliente: Cliente;
  monto_total_bruto: number;
  estado: string;
  fecha_emision: string;
}

interface AlertaInsumo {
  id: number;
  codigo_sku: string;
  nombre_material: string;
  stock_actual: number;
  stock_minimo_seguridad: number;
  unidad_medida: string;
}

export default function DashboardPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [alertas, setAlertas] = useState<AlertaInsumo[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const headers = { Authorization: `Bearer ${token}` };
        
        const [resCot, resAlertas] = await Promise.all([
          fetch("http://127.0.0.1:8000/api/cotizaciones/", { headers }),
          fetch("http://127.0.0.1:8000/api/insumos/alertas/", { headers })
        ]);

        if (resCot.ok) {
          setCotizaciones(await resCot.json());
        } else if (resCot.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }

        if (resAlertas.ok) {
          setAlertas(await resAlertas.json());
        }

      } catch (error) {
        console.error("Error al cargar datos", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (loading) {
    return <div className="text-xl p-8">Cargando tablero...</div>;
  }

  return (
    <div className="space-y-6">
      
      {/* Módulo de Alertas (Sólo visible si hay quiebres de stock) */}
      {alertas.length > 0 && (
        <div className="bg-red-50 p-6 rounded-lg shadow-sm border-2 border-red-400">
          <div className="flex items-center mb-4">
            <svg className="w-8 h-8 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <h2 className="text-2xl font-black text-red-700">¡Alerta de Inventario Crítico!</h2>
          </div>
          <p className="text-red-900 mb-4 font-medium">Los siguientes insumos están por debajo del umbral de seguridad y requieren reabastecimiento urgente:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alertas.map(alerta => (
              <div key={alerta.id} className="bg-white p-4 rounded-md shadow-sm border border-red-200">
                <h3 className="font-bold text-slate-800">{alerta.nombre_material} (SKU: {alerta.codigo_sku})</h3>
                <div className="mt-2 text-sm">
                  <span className="text-slate-500">Stock Actual: </span>
                  <span className="font-black text-red-600">{alerta.stock_actual} {alerta.unidad_medida}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-500">Mínimo Permitido: </span>
                  <span className="font-semibold text-slate-700">{alerta.stock_minimo_seguridad} {alerta.unidad_medida}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Listado de Cotizaciones */}
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
                    <td className="p-4 text-lg font-medium">{cotizacion.cliente?.nombre_completo || "Desconocido"}</td>
                    <td className="p-4 text-lg">{cotizacion.cliente?.telefono_whatsapp || "-"}</td>
                    <td className="p-4 text-lg">
                      {new Date(cotizacion.fecha_emision).toLocaleDateString("es-CL")}
                    </td>
                    <td className="p-4 text-lg font-semibold text-blue-900">
                      ${cotizacion.monto_total_bruto.toLocaleString("es-CL")}
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
    </div>
  );
}
