"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import type { FichaData } from "./FichaPdf";

interface CatalogoItem {
  id: number;
  nombre: string;
  categoria: string;
}

const DESTINO_HITO: Record<string, string> = {
  ANTICIPO_40: "Al firmar el contrato o antes del inicio de obras: compra de materiales, traslados, transporte y primeros pagos a proveedores.",
  AVANCE_30: "Al alcanzar el 50 % de avance: adelantos por trabajos de maestros y proveedores.",
  ENTREGA_30: "Al terminar el proyecto, con la revisión y entrega de llaves: pago final a maestros y utilidad de la empresa.",
};

interface HitoPago {
  id: number;
  fase: string;
  porcentaje: number;
  monto_pago: number;
  estado: string;
  fecha_pago: string | null;
  comprobante_ref: string | null;
}

interface Cotizacion {
  id: number;
  codigo_cotizacion: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  direccion_terreno: string;
  superficie_m2: number;
  distancia_flete_km: number;
  base_terreno?: CatalogoItem | null;
  revestimiento?: CatalogoItem | null;
  costo_materiales: number;
  costo_mano_obra: number;
  costo_flete: number;
  costo_total: number;
  estado: string;
  fecha_creacion: string;
  nivelacion_modalidad?: string;
  nivelacion_m3?: number;
  costo_nivelacion?: number;
  hitos_pago: HitoPago[];
  detalles_insumo?: FichaData["detalles_insumo"];
}

async function descargarPdf(c: Cotizacion) {
  // react-pdf se carga solo al descargar (pesado y solo cliente).
  const [{ pdf }, { default: FichaPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./FichaPdf")]);
  const blob = await pdf(<FichaPdf c={c} />).toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${c.codigo_cotizacion}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function FichaCotizacion({ params }: { params: Promise<{ uuid: string }> }) {
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
          setError("Cotización no encontrada o enlace inválido.");
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
        Cargando cotización...
      </div>
    );
  }

  if (error || !cotizacion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 max-w-md">
          <p className="font-bold text-lg mb-2">Aviso</p>
          <p>{error || "No se encontró la cotización requerida."}</p>
        </div>
        <Link href="/" className="mt-4 text-blue-900 underline font-semibold text-sm">
          ← Volver al sitio web
        </Link>
      </div>
    );
  }

  const subtotal = Number(cotizacion.costo_materiales) + Number(cotizacion.costo_mano_obra) + Number(cotizacion.costo_flete) + Number(cotizacion.costo_nivelacion ?? 0);
  const gestion = Math.max(0, Math.round(Number(cotizacion.costo_total) - subtotal)); // ganancia de la empresa
  const neto = Math.round(Number(cotizacion.costo_total) / 1.19);

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-slate-200">
        
        {/* Barra superior / Regreso */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center text-sm">
          <button 
            onClick={() => window.history.back()} 
            className="text-blue-900 font-bold hover:underline cursor-pointer"
          >
            ← Volver Atrás
          </button>
          <span className="font-mono text-xs text-slate-500 font-semibold">
            REF: {cotizacion.codigo_cotizacion}
          </span>
          <button
            onClick={() => descargarPdf(cotizacion)}
            className="bg-blue-900 text-white font-bold px-3 py-1 rounded hover:bg-blue-800 cursor-pointer"
          >
            Descargar PDF
          </button>
        </div>

        {/* Encabezado Principal */}
        <div className="bg-blue-900 text-white p-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight">Cotización Formal de Obra</h1>
          <p className="text-lg text-blue-200 font-medium">DENASERV — Fabricación y Montaje de Casas Prefabricadas</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Ficha Cliente & Estado */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pb-6 border-b border-slate-200">
            <div>
              <span className="text-xs uppercase font-bold text-slate-400">Cliente Receptor</span>
              <h2 className="text-2xl font-bold text-slate-900">{cotizacion.cliente_nombre}</h2>
              {cotizacion.cliente_telefono && (
                <p className="text-sm text-slate-600 mt-1">Contacto: {cotizacion.cliente_telefono}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Fecha de Emisión: {new Date(cotizacion.fecha_creacion).toLocaleDateString("es-CL")}
              </p>
            </div>

            <div className="sm:text-right">
              <span className="text-xs uppercase font-bold text-slate-400">Estado del Proyecto</span>
              <div>
                <span className={`inline-block mt-1 px-4 py-1.5 font-extrabold rounded-full text-xs uppercase tracking-wider ${
                  cotizacion.estado === "ACEPTADA"
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : cotizacion.estado === "FINALIZADA"
                    ? "bg-blue-100 text-blue-800 border border-blue-300"
                    : "bg-yellow-100 text-yellow-800 border border-yellow-300"
                }`}>
                  {cotizacion.estado}
                </span>
              </div>
            </div>
          </div>

          {/* Ubicación Terreno (Campo Crítico) */}
          <div className="bg-blue-50/70 p-5 rounded-xl border border-blue-200">
            <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
              Ubicación de la Faena / Terreno
            </span>
            <p className="text-lg font-bold text-slate-900 mt-1">{cotizacion.direccion_terreno}</p>
            <p className="text-xs text-slate-600 mt-1">
              Distancia estimada de traslado y flete: <strong>{cotizacion.distancia_flete_km} km</strong>
            </p>
          </div>

          {/* Especificaciones Constructivas */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 mb-4 border-b pb-2">
              Especificaciones Constructivas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-500">Superficie Total</span>
                <p className="text-xl font-black text-slate-900 mt-1">{cotizacion.superficie_m2} m²</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-500">Tipo de Base</span>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {cotizacion.base_terreno?.nombre || "No especificada"}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-500">Revestimiento Exterior</span>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {cotizacion.revestimiento?.nombre || "No especificado"}
                </p>
              </div>
            </div>
          </div>

          {/* Resumen Económico */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 mb-4 border-b pb-2">
              Desglose Financiero de la Cotización
            </h3>
            <div className="space-y-2 text-sm bg-slate-50 p-6 rounded-xl border border-slate-200">
              {[
                ["Suministro de Materiales", cotizacion.costo_materiales],
                ["Mano de Obra Especializada", cotizacion.costo_mano_obra],
                ["Transporte y Logística de Flete", cotizacion.costo_flete],
                ["Relleno de estabilizado", cotizacion.costo_nivelacion ?? 0],
                ["Gestión y utilidad", gestion],
              ]
                .filter(([, v]) => Number(v) > 0)
                .map(([label, v]) => (
                  <div key={label as string} className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">{label}:</span>
                    <span className="font-semibold">${Number(v).toLocaleString("es-CL")}</span>
                  </div>
                ))}
              {cotizacion.nivelacion_modalidad === "CLIENTE" && (
                <div className="py-1 border-b border-slate-200 text-xs text-slate-500">
                  Relleno de estabilizado ({Number(cotizacion.nivelacion_m3 ?? 0).toLocaleString("es-CL")} m³): lo adquiere el cliente directamente.
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-200 text-slate-500">
                <span>Neto:</span>
                <span>${neto.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 text-slate-500">
                <span>IVA 19%:</span>
                <span>${(Number(cotizacion.costo_total) - neto).toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between pt-3 text-lg font-black text-blue-900">
                <span>TOTAL (IVA incluido):</span>
                <span>${Number(cotizacion.costo_total).toLocaleString("es-CL")}</span>
              </div>
            </div>
          </div>

          {/* Hitos de Pago Notariales */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 mb-4 border-b pb-2">
              Cronograma de Pagos por Hitos de Avance
            </h3>
            <div className="space-y-4">
              {cotizacion.hitos_pago && cotizacion.hitos_pago.length > 0 ? (
                cotizacion.hitos_pago.map((hito, idx) => (
                  <div
                    key={hito.id}
                    className={`p-5 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                      hito.estado === "PAGADO" ? "bg-green-50/70 border-green-300" : "bg-white border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Etapa {idx + 1}
                        </span>
                        <span className="font-extrabold text-slate-800 text-base">
                          {hito.fase.replace(/_/g, " ")} ({hito.porcentaje}%)
                        </span>
                      </div>
                      <p className="text-2xl font-black text-slate-900 mt-1">
                        ${Number(hito.monto_pago).toLocaleString("es-CL")}
                      </p>
                      {DESTINO_HITO[hito.fase] && <p className="text-xs text-slate-500 mt-1 max-w-md">{DESTINO_HITO[hito.fase]}</p>}
                      {hito.fecha_pago && (
                        <p className="text-xs text-slate-500 mt-1">Fecha de pago: {hito.fecha_pago}</p>
                      )}
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        hito.estado === "PAGADO"
                          ? "bg-green-200 text-green-900"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {hito.estado}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400 italic">No hay hitos de pago asociados.</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
