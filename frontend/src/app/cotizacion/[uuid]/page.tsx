"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FichaData } from "./FichaPdf";

import { DESTINO_HITO, NOMBRE_HITO } from "./FichaPdf";
import { bajarContrato, unirContrato } from "@/lib/contrato";
import { claseEstado, etiquetaEstado } from "@/lib/estados";

interface HitoPago {
  id: number;
  fase: string;
  porcentaje: number;
  monto_pago: number;
  monto_abonado?: number;
  monto_pendiente?: number;
  estado: string;
  fecha_pago: string | null;
}

/** Lo que recibe el cliente: resumen general del proyecto (la API no entrega materiales ni costos internos). */
interface Cotizacion extends FichaData {
  id: number;
  hitos_pago: HitoPago[];
  tiene_contrato?: boolean;
}

async function descargarPdf(c: Cotizacion, token: string) {
  // react-pdf se carga solo al descargar (pesado y solo cliente).
  const [{ pdf }, { default: FichaPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./FichaPdf")]);
  const ficha = await pdf(<FichaPdf c={c} />).toBlob();
  const blob = await unirContrato(ficha, c.tiene_contrato ? await bajarContrato(`/api/cotizaciones/public/${token}/contrato`) : null);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${c.codigo_cotizacion}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function FichaCotizacion({ params }: { params: Promise<{ uuid: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCotizacion = async () => {
      try {
        const res = await fetch(`/api/cotizaciones/public/${resolvedParams.uuid}`);
        if (res.ok) {
          const data = await res.json();
          setCotizacion(data);
        } else {
          setError("Proyecto no encontrado o enlace inválido.");
        }
      } catch (err) {
        setError("Error de conexión al servidor backend.");
      } finally {
        setLoading(false);
      }
    };

    fetchCotizacion();
  }, [resolvedParams.uuid]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-bold text-lg">
        Cargando proyecto...
      </div>
    );
  }

  if (error || !cotizacion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 max-w-md">
          <p className="font-bold text-lg mb-2">Aviso</p>
          <p>{error || "No se encontró el proyecto."}</p>
        </div>
        <Link href="/" className="mt-4 text-blue-900 underline font-semibold text-sm">
          ← Volver al sitio web
        </Link>
      </div>
    );
  }

  const neto = Math.round(Number(cotizacion.costo_total) / 1.19);

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-slate-200">
        
        {/* Barra superior / Regreso */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center text-sm">
          <button 
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} 
            className="text-blue-900 font-bold hover:underline cursor-pointer"
          >
            ← Volver Atrás
          </button>
          <span className="font-mono text-xs text-slate-500 font-semibold">
            REF: {cotizacion.codigo_cotizacion}
          </span>
          <button
            onClick={() => descargarPdf(cotizacion, resolvedParams.uuid)}
            className="bg-blue-900 text-white font-bold px-3 py-1 rounded hover:bg-blue-800 cursor-pointer"
          >
            Descargar PDF
          </button>
        </div>

        {/* Encabezado Principal */}
        <div className="bg-blue-900 text-white p-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight">Ficha informativa del proyecto</h1>
          <p className="text-lg text-blue-200 font-medium">DENASERV — Fabricación y Montaje de Casas Prefabricadas</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Cliente y estado del proyecto */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pb-6 border-b border-slate-200">
            <div>
              <span className="text-xs uppercase font-bold text-slate-400">Cliente</span>
              <h2 className="text-2xl font-bold text-slate-900">{cotizacion.cliente_nombre}</h2>
              {cotizacion.cliente_telefono && (
                <p className="text-sm text-slate-600 mt-1">Contacto: {cotizacion.cliente_telefono}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Fecha de emisión: {new Date(cotizacion.fecha_creacion).toLocaleDateString("es-CL")}
              </p>
            </div>

            <div className="sm:text-right">
              <span className="text-xs uppercase font-bold text-slate-400">Estado del proyecto</span>
              <div>
                <span className={`inline-block mt-1 px-4 py-1.5 font-extrabold rounded-full text-sm border ${claseEstado(cotizacion.estado ?? "")}`}>
                  {etiquetaEstado(cotizacion.estado ?? "")}
                </span>
              </div>
            </div>
          </div>

          {/* Avance de la obra (desde que inicia) */}
          {cotizacion.estado !== "BORRADOR" && (
            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-bold text-slate-900">Avance de la obra</h3>
                <span className="text-2xl font-black text-blue-900 tabular-nums">{cotizacion.avance ?? 0} %</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={cotizacion.avance ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la obra">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-blue-500" style={{ width: `${cotizacion.avance ?? 0}%` }} />
              </div>
            </div>
          )}

          {/* El proyecto */}
          <div className="bg-blue-50/70 p-5 rounded-xl border border-blue-200">
            <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">Ubicación del terreno</span>
            <p className="text-lg font-bold text-slate-900 mt-1">{cotizacion.direccion_terreno}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs font-semibold text-slate-500">Tipo de proyecto</span>
              <p className="text-lg font-bold text-slate-900 mt-1">{cotizacion.tipo_proyecto === "SOLO_RADIER" ? "Radier" : "Casa prefabricada"}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-xs font-semibold text-slate-500">Superficie</span>
              <p className="text-lg font-bold text-slate-900 mt-1">{cotizacion.superficie_m2} m²</p>
            </div>
          </div>

          {/* Valor del proyecto */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 mb-4 border-b pb-2">Valor del proyecto</h3>
            <div className="space-y-2 text-sm bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200">
              <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                <span>Valor neto:</span>
                <span>${neto.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                <span>IVA 19 %:</span>
                <span>${(Number(cotizacion.costo_total) - neto).toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between pt-3 text-lg font-black text-blue-900">
                <span>TOTAL (IVA incluido):</span>
                <span>${Number(cotizacion.costo_total).toLocaleString("es-CL")}</span>
              </div>
              {cotizacion.nivelacion_modalidad === "CLIENTE" && (
                <p className="pt-2 text-xs text-slate-500">
                  El relleno de estabilizado ({Number(cotizacion.nivelacion_m3 ?? 0).toLocaleString("es-CL")} m³) lo adquiere el cliente directamente.
                </p>
              )}
            </div>
          </div>

          {/* Hitos de pago */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 mb-4 border-b pb-2">
              Cronograma de pagos
            </h3>
            <div className="space-y-4">
              {cotizacion.hitos_pago && cotizacion.hitos_pago.length > 0 ? (
                [...cotizacion.hitos_pago].sort((a, b) => a.id - b.id).map((hito, idx) => ( // orden fijo: anticipo, avance, entrega
                  <div
                    key={hito.id}
                    className={`p-5 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                      hito.estado === "PAGADO" ? "bg-green-50/70 border-green-300" : hito.estado === "ABONADO" ? "bg-orange-50/70 border-orange-300" : "bg-white border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Etapa {idx + 1}
                        </span>
                        <span className="font-extrabold text-slate-800 text-base">
                          {NOMBRE_HITO[hito.fase] || hito.fase} ({hito.porcentaje} %)
                        </span>
                      </div>
                      <p className="text-2xl font-black text-slate-900 mt-1">
                        ${Number(hito.monto_pago).toLocaleString("es-CL")}
                      </p>
                      {DESTINO_HITO[hito.fase] && <p className="text-xs text-slate-500 mt-1 max-w-md">{DESTINO_HITO[hito.fase]}</p>}
                      {hito.estado === "ABONADO" && (
                        <p className="text-sm text-orange-800 font-semibold mt-1">
                          Abonado ${Number(hito.monto_abonado).toLocaleString("es-CL")} · falta ${Number(hito.monto_pendiente).toLocaleString("es-CL")}
                        </p>
                      )}
                      {hito.fecha_pago && (
                        <p className="text-xs text-slate-500 mt-1">Fecha de pago: {hito.fecha_pago}</p>
                      )}
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        hito.estado === "PAGADO"
                          ? "bg-green-200 text-green-900"
                          : hito.estado === "ABONADO"
                          ? "bg-orange-200 text-orange-900"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {hito.estado === "ABONADO" ? "Pago parcial" : hito.estado === "PAGADO" ? "Pagado" : "Pendiente"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400 italic">No hay pagos asociados.</div>
              )}
            </div>
          </div>

          {cotizacion.tiene_contrato && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-4 border-b pb-2">Contrato notarial</h3>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200">
                <p className="text-sm text-slate-600 max-w-md">Contrato oficial del proyecto, firmado ante notario. También se incluye al final del PDF de esta ficha.</p>
                <a href={`/api/cotizaciones/public/${resolvedParams.uuid}/contrato`} target="_blank" rel="noopener noreferrer"
                  className="bg-blue-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-blue-800">Ver contrato (PDF)</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
