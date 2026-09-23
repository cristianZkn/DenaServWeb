"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface HitoPago {
  id: number;
  numero_hito: number;
  nombre_fase: string;
  porcentaje_exigido: number;
  monto_esperado: number;
  estado_pago: string;
}

interface Contrato {
  monto_total_pactado: number;
  hitos: HitoPago[];
}

interface Cliente {
  nombre_completo: string;
  telefono_whatsapp: string;
  correo_electronico?: string;
}

interface Cotizacion {
  uuid_publico: string;
  cliente: Cliente;
  superficie_m2: number;
  tipo_base: string;
  tipo_revestimiento_exterior: string;
  tipo_cubierta: string;
  requiere_nivelacion: boolean;
  distancia_traslado_km: number;
  monto_total_bruto: number;
  estado: string;
  fecha_emision: string;
  contrato: Contrato | null;
}

export default function FichaCotizacion({ params }: { params: Promise<{ uuid: string }> }) {
  const resolvedParams = use(params);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCotizacion = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/cotizaciones/public/${resolvedParams.uuid}`);
        if (res.ok) {
          const data = await res.json();
          setCotizacion(data);
        } else {
          setError("Cotización no encontrada o enlace inválido.");
        }
      } catch (err) {
        setError("Error de conexión al servidor.");
      } finally {
        setLoading(false);
      }
    };

    fetchCotizacion();
  }, [resolvedParams.uuid]);

  if (loading) return <div className="text-xl p-8 text-center mt-20 font-bold">Cargando cotización...</div>;
  if (error || !cotizacion) return <div className="text-xl p-8 text-center mt-20 text-red-600 font-bold">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden border border-slate-300">
        
        {/* Header Publico */}
        <div className="bg-blue-900 text-white p-8 text-center">
          <h1 className="text-4xl font-black mb-2">Cotización Formal</h1>
          <p className="text-xl">DenaServ - Casas Prefabricadas</p>
        </div>

        <div className="p-8">
          {/* Datos del Cliente y Resumen */}
          <div className="flex flex-col md:flex-row justify-between mb-10 pb-6 border-b-2 border-slate-200">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Estimado/a:</h2>
              <p className="text-xl text-slate-700">{cotizacion.cliente.nombre_completo}</p>
              <p className="text-lg text-slate-500 mt-2">
                Fecha: {new Date(cotizacion.fecha_emision).toLocaleDateString("es-CL")}
              </p>
            </div>
            <div className="mt-6 md:mt-0 md:text-right">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Proyecto:</h2>
              <p className="text-xl text-slate-700">{cotizacion.superficie_m2} m²</p>
              <span className={`inline-block mt-2 px-4 py-1 font-bold rounded-full ${
                cotizacion.estado === 'Aceptada' ? 'bg-green-100 text-green-800' : 
                cotizacion.estado === 'Rechazada' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                Estado: {cotizacion.estado}
              </span>
            </div>
          </div>

          {/* Especificaciones Constructivas */}
          <h3 className="text-2xl font-bold text-blue-900 mb-4 border-b pb-2">Especificaciones Técnicas</h3>
          <ul className="list-disc pl-5 mb-8 text-lg text-slate-700 space-y-2">
            <li><strong>Base:</strong> {cotizacion.tipo_base.replace(/_/g, ' ')}</li>
            <li><strong>Revestimiento Exterior:</strong> {cotizacion.tipo_revestimiento_exterior.replace(/_/g, ' ')}</li>
            <li><strong>Cubierta:</strong> {cotizacion.tipo_cubierta.replace(/_/g, ' ')}</li>
            {cotizacion.requiere_nivelacion && (
              <li><strong>Incluye Preparación y Nivelación de Terreno</strong></li>
            )}
            {cotizacion.distancia_traslado_km > 0 && (
              <li><strong>Desplazamiento Logístico:</strong> {cotizacion.distancia_traslado_km} km</li>
            )}
          </ul>

          {/* Desglose de Costos */}
          <h3 className="text-2xl font-bold text-blue-900 mb-6 border-b pb-2">Inversión Estimada</h3>
          <table className="w-full text-left mb-10 text-lg border border-slate-200">
            <tbody>
              <tr className="bg-slate-50">
                <td className="p-6 font-black text-2xl text-slate-900">COSTO TOTAL BRUTO</td>
                <td className="p-6 text-right font-black text-3xl text-blue-900">
                  ${cotizacion.monto_total_bruto.toLocaleString("es-CL")}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Hitos de Pago (Esquema Notarial) */}
          <h3 className="text-2xl font-bold text-blue-900 mb-6 border-b pb-2">Esquema Notarial de Pagos</h3>
          <div className="space-y-6">
            {cotizacion.contrato?.hitos.sort((a, b) => a.numero_hito - b.numero_hito).map((hito) => (
              <div key={hito.id} className="bg-slate-50 border border-slate-300 rounded-lg p-6 relative">
                {hito.estado_pago === 'PAGADO' && (
                  <div className="absolute top-6 right-6 px-4 py-1 bg-green-600 text-white font-bold rounded-full transform rotate-12 shadow-md">
                    PAGADO
                  </div>
                )}
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-2xl font-black text-slate-800">
                    Pago {hito.numero_hito}: {hito.porcentaje_exigido}%
                  </h4>
                  <span className="text-3xl font-black text-blue-800">
                    ${hito.monto_esperado.toLocaleString("es-CL")}
                  </span>
                </div>
                <p className="text-lg text-slate-600">
                  <strong className="text-slate-800">Corresponde a:</strong> {hito.nombre_fase.replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
