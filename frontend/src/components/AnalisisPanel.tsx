"use client";

import { useEffect, useState } from "react";
import { useMontado } from "@/components/Animaciones";

interface Indicador { clave: string; nombre: string; valor: number; unidad: "n" | "%" | "$"; formula: string; pregunta: string }
interface Analisis {
  desde: string; hasta: string; indicadores: Indicador[];
  mensual: { mes: string; cotizaciones: number; neto: number; cobrado: number }[];
  por_estado: { estado: string; etiqueta: string; cotizaciones: number; neto: number }[];
  por_metodo: { metodo: string; etiqueta: string; pagos: number; monto: number }[];
}

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const corto = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : pesos(n));
const mesCorto = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-CL", { month: "short", year: "2-digit" }).replace(".", "");
const valorIndicador = (i: Indicador) => (i.unidad === "$" ? pesos(i.valor) : i.unidad === "%" ? `${i.valor.toLocaleString("es-CL")} %` : i.valor.toLocaleString("es-CL"));
const COLOR_ESTADO: Record<string, string> = { BORRADOR: "bg-amber-400", ACEPTADA: "bg-blue-500", FINALIZADA: "bg-green-500" };

/** Gráfico con descripción para lector de pantalla y una tabla con sus datos (WCAG: ninguna información solo en el dibujo). */
function Tarjeta({ titulo, descripcion, tabla, children, className = "" }: { className?: string; titulo: string; descripcion: string; tabla: { columnas: string[]; filas: (string | number)[][] }; children: React.ReactNode }) {
  return (
    <figure className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ${className}`}>
      <figcaption className="text-lg font-bold text-slate-900">{titulo}</figcaption>
      <div role="img" aria-label={`${titulo}. ${descripcion}`} className="mt-4">{children}</div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-blue-800">Ver tabla de datos</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left">
            <caption className="sr-only">{titulo}</caption>
            <thead><tr className="text-slate-600">{tabla.columnas.map((c) => <th key={c} scope="col" className="py-1 pr-4 font-semibold">{c}</th>)}</tr></thead>
            <tbody>{tabla.filas.map((f, i) => <tr key={i} className="border-t border-slate-100">{f.map((v, k) => <td key={k} className="py-1 pr-4 tabular-nums">{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Indicadores y gráficos del dashboard con filtros de fecha y estado; se recalculan en el servidor con los datos del sistema. */
export default function AnalisisPanel() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [datos, setDatos] = useState<Analisis | null>(null);
  const [error, setError] = useState("");
  const montado = useMontado(120);

  useEffect(() => {
    let vigente = true;
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    if (estado) q.set("estado", estado);
    void Promise.resolve().then(async () => {
      try {
        const r = await fetch(`/api/dashboard/analisis/?${q}`);
        const cuerpo = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (r.ok) { setDatos(cuerpo); setError(""); } else setError(cuerpo.message || "No se pudo cargar el análisis.");
      } catch {
        if (vigente) setError("No hay conexión con el servidor.");
      }
    });
    return () => { vigente = false; };
  }, [desde, hasta, estado]);

  const maxMes = Math.max(1, ...(datos?.mensual.map((m) => Math.max(m.neto, m.cobrado)) ?? [1]));
  const maxMetodo = Math.max(1, ...(datos?.por_metodo.map((m) => m.monto) ?? [1]));
  const totalEstado = datos?.por_estado.reduce((t, e) => t + e.cotizaciones, 0) ?? 0;
  const campo = "block text-sm font-semibold text-slate-700 mb-1";

  return (
    <section aria-labelledby="an-titulo" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 id="an-titulo" className="text-xl font-extrabold text-slate-900 mr-auto">Análisis del negocio</h2>
        <form onSubmit={(e) => e.preventDefault()} aria-label="Filtros del análisis" className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="an-desde" className={campo}>Desde</label><input id="an-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} /></div>
          <div><label htmlFor="an-hasta" className={campo}>Hasta</label><input id="an-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} /></div>
          <div>
            <label htmlFor="an-estado" className={campo}>Estado</label>
            <select id="an-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option><option value="BORRADOR">Cotizado</option><option value="ACEPTADA">En ejecución</option><option value="FINALIZADA">Terminada</option>
            </select>
          </div>
        </form>
      </div>
      <p className="text-sm text-slate-600">
        {datos ? `Período: ${datos.desde.split("-").reverse().join("-")} a ${datos.hasta.split("-").reverse().join("-")}${desde || hasta ? "" : " (últimos 12 meses)"}.` : "Cargando…"}
      </p>
      {error && <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}

      {datos && (
        <>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Indicadores">
            {datos.indicadores.map((i) => (
              <li key={i.clave} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-600">{i.nombre}</p>
                <p className="text-lg xl:text-xl font-black tabular-nums text-slate-900 whitespace-nowrap">{valorIndicador(i)}</p>
                <details className="mt-1 text-xs text-slate-600">
                  <summary className="cursor-pointer font-semibold text-blue-800">Cómo se calcula</summary>
                  <p className="mt-1"><strong>Pregunta:</strong> {i.pregunta}</p>
                  <p className="mt-1"><strong>Fórmula:</strong> {i.formula}</p>
                </details>
              </li>
            ))}
          </ul>

          <div className="grid lg:grid-cols-2 gap-4">
            <Tarjeta className="lg:col-span-2" titulo="Venta neta y cobro por mes" tabla={{ columnas: ["Mes", "Cotizaciones", "Venta neta", "Cobrado"], filas: datos.mensual.map((m) => [mesCorto(m.mes), m.cotizaciones, pesos(m.neto), pesos(m.cobrado)]) }}
              descripcion={datos.mensual.length ? `Por mes de creación de la cotización, venta neta y monto cobrado. Mayor venta: ${mesCorto(datos.mensual.reduce((a, b) => (b.neto > a.neto ? b : a)).mes)}.` : "Sin datos en el período."}>
              {datos.mensual.length === 0 ? <p className="text-slate-500">Sin datos en el período.</p> : (
                <>
                  <div className="flex items-end gap-1.5 h-44">
                    {datos.mensual.map((m, i) => (
                      <div key={m.mes} className="flex-1 min-w-0 h-full flex items-end justify-center gap-0.5">
                        <span className="w-1/2 max-w-4 rounded-t bg-blue-600 transition-[height] duration-700 ease-out" title={`${mesCorto(m.mes)}: venta ${pesos(m.neto)}`}
                          style={{ height: montado ? `${Math.max((m.neto / maxMes) * 100, m.neto ? 3 : 0)}%` : "0%", transitionDelay: `${i * 40}ms` }} />
                        <span className="w-1/2 max-w-4 rounded-t bg-green-500 transition-[height] duration-700 ease-out" title={`${mesCorto(m.mes)}: cobrado ${pesos(m.cobrado)}`}
                          style={{ height: montado ? `${Math.max((m.cobrado / maxMes) * 100, m.cobrado ? 3 : 0)}%` : "0%", transitionDelay: `${i * 40 + 60}ms` }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-1 text-[0.7rem] text-slate-500">{datos.mensual.map((m) => <span key={m.mes} className="flex-1 min-w-0 text-center truncate">{mesCorto(m.mes)}</span>)}</div>
                  <p className="mt-2 flex gap-4 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-sm bg-blue-600" />Venta neta</span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-sm bg-green-500" />Cobrado</span>
                    <span className="ml-auto">Máx.: {corto(maxMes)}</span>
                  </p>
                </>
              )}
            </Tarjeta>

            <Tarjeta titulo="Cotizaciones por estado" tabla={{ columnas: ["Estado", "Cotizaciones", "Venta neta"], filas: datos.por_estado.map((e) => [e.etiqueta, e.cotizaciones, pesos(e.neto)]) }}
              descripcion={datos.por_estado.map((e) => `${e.etiqueta}: ${e.cotizaciones}`).join(", ") || "Sin datos en el período."}>
              {totalEstado === 0 ? <p className="text-slate-500">Sin datos en el período.</p> : (
                <>
                  <div className="flex h-9 w-full overflow-hidden rounded-lg">
                    {datos.por_estado.map((e) => (
                      <span key={e.estado} className={`${COLOR_ESTADO[e.estado] ?? "bg-slate-400"} transition-[width] duration-700 ease-out`} title={`${e.etiqueta}: ${e.cotizaciones}`}
                        style={{ width: montado ? `${(e.cotizaciones / totalEstado) * 100}%` : "0%" }} />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {datos.por_estado.map((e) => (
                      <li key={e.estado} className="flex items-center gap-2">
                        <span aria-hidden className={`h-3 w-3 rounded-sm ${COLOR_ESTADO[e.estado] ?? "bg-slate-400"}`} />
                        <span className="text-slate-700">{e.etiqueta}</span>
                        <span className="ml-auto tabular-nums font-bold text-slate-900">{e.cotizaciones} <span className="font-normal text-slate-500">({Math.round((e.cotizaciones / totalEstado) * 100)} %)</span></span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Tarjeta>

            <Tarjeta titulo="Pagos recibidos por método" tabla={{ columnas: ["Método", "Pagos", "Monto"], filas: datos.por_metodo.map((m) => [m.etiqueta, m.pagos, pesos(m.monto)]) }}
              descripcion={datos.por_metodo.map((m) => `${m.etiqueta}: ${pesos(m.monto)}`).join(", ") || "Sin pagos en el período."}>
              {datos.por_metodo.length === 0 ? <p className="text-slate-500">Sin pagos en el período.</p> : (
                <ul className="space-y-2">
                  {datos.por_metodo.map((m) => (
                    <li key={m.metodo}>
                      <div className="flex justify-between text-sm"><span className="text-slate-700">{m.etiqueta}</span><span className="tabular-nums font-bold text-slate-900">{corto(m.monto)}</span></div>
                      <div className="h-3 rounded bg-slate-100 overflow-hidden"><div className="h-full rounded bg-blue-600 transition-[width] duration-700 ease-out" style={{ width: montado ? `${(m.monto / maxMetodo) * 100}%` : "0%" }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>
        </>
      )}
    </section>
  );
}
