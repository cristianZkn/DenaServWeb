"use client";

import { useCallback, useEffect, useState } from "react";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import Paginador from "@/components/Paginador";
import { useEsAdmin } from "@/lib/rol";

type Tipo = "operativo" | "gerencial" | "periodo";
type Formato = "xlsx" | "pdf" | "csv";
interface Columna { clave: string; titulo: string; tipo: string }
interface Reporte {
  titulo: string; columnas: Columna[]; filas: (string | number | null)[][]; totales: Record<string, number>;
  filtros: string[]; total_filas: number; pagina: number; por_pagina: number;
}

const TIPOS: { clave: Tipo; texto: string; ayuda: string; soloAdmin?: boolean }[] = [
  { clave: "operativo", texto: "Operativo", ayuda: "Detalle de cada cotización: total, lo cobrado, el saldo y el avance de la obra." },
  { clave: "gerencial", texto: "Gerencial", ayuda: "Ganancia por trimestre y estado, con totales y gráfico (solo se ve en el PDF).", soloAdmin: true },
  { clave: "periodo", texto: "Por período", ayuda: "Pagos recibidos por mes y método dentro del rango de fechas elegido." },
];
const ESTADOS = [["", "Todos"], ["BORRADOR", "Cotizado"], ["ACEPTADA", "En ejecución"], ["FINALIZADA", "Terminada"]];
const FORMATOS: [Formato, string][] = [["xlsx", "Excel"], ["pdf", "PDF"], ["csv", "CSV"]];

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("-");
function celda(v: string | number | null, tipo: string) {
  if (v === null || v === "") return "";
  if (tipo === "pesos") return pesos(Number(v));
  if (tipo === "porcentaje") return `${Math.round(Number(v))} %`;
  if (tipo === "fecha") return fecha(String(v));
  if (tipo === "mes") return String(v).slice(5, 7) + "-" + String(v).slice(0, 4);
  if (tipo === "numero") return Number(v).toLocaleString("es-CL");
  return String(v);
}

/** Reportes con filtros, vista en pantalla paginada, exportación a Excel, PDF y CSV, e impresión limpia (ver @media print en globals.css). */
export default function ReportesPage() {
  const admin = useEsAdmin();
  const [tipo, setTipo] = useState<Tipo>("operativo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [datos, setDatos] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState<Formato | null>(null);
  const [error, setError] = useState("");

  const consulta = useCallback((formato: string) => {
    const q = new URLSearchParams({ formato });
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    if (tipo === "operativo") {
      if (estado) q.set("estado", estado);
      if (buscar.trim()) q.set("buscar", buscar.trim());
    }
    if (formato === "json") { q.set("pagina", String(pagina)); q.set("por_pagina", String(porPagina)); }
    return `/api/reportes/${tipo}/?${q}`;
  }, [tipo, desde, hasta, estado, buscar, pagina, porPagina]);

  useEffect(() => {
    let vigente = true;
    void Promise.resolve().then(async () => {
      setCargando(true);
      setError("");
      try {
        const r = await fetch(consulta("json"));
        const cuerpo = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (r.ok) setDatos(cuerpo);
        else { setDatos(null); setError(cuerpo.message || "No se pudo cargar el reporte."); }
      } catch {
        if (vigente) setError("No hay conexión con el servidor.");
      } finally {
        if (vigente) setCargando(false);
      }
    });
    return () => { vigente = false; };
  }, [consulta]);

  const cambiar = (f: () => void) => { f(); setPagina(1); };

  const exportar = async (formato: Formato) => {
    setExportando(formato);
    setError("");
    try {
      const r = await fetch(consulta(formato));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "No se pudo generar el archivo.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || `reporte.${formato}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el archivo.");
    } finally {
      setExportando(null);
    }
  };

  const tipos = TIPOS.filter((t) => !t.soloAdmin || admin);
  const actual = TIPOS.find((t) => t.clave === tipo)!;
  const campo = "block text-sm font-semibold text-slate-700 mb-1";
  return (
    <div className="space-y-4">
      <div className="no-imprimir">
        <EncabezadoPagina icono="documento" titulo="Reportes" descripcion="Consulte, exporte a Excel, PDF o CSV e imprima con los filtros que elija." />
      </div>

      <div role="tablist" aria-label="Tipo de reporte" className="no-imprimir flex flex-wrap gap-2 border-b border-slate-200">
        {tipos.map((t) => (
          <button key={t.clave} type="button" role="tab" aria-selected={tipo === t.clave} onClick={() => { setTipo(t.clave); setPagina(1); setDatos(null); }}
            className={`!min-h-0 px-4 py-3 text-base font-bold border-b-2 -mb-px cursor-pointer ${tipo === t.clave ? "border-amber-500 text-blue-900" : "border-transparent text-slate-500 hover:text-blue-800"}`}>
            {t.texto}
          </button>
        ))}
      </div>
      <p className="no-imprimir text-slate-600">{actual.ayuda}</p>

      <form onSubmit={(e) => e.preventDefault()} className="no-imprimir flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4" aria-label="Filtros del reporte">
        <div>
          <label htmlFor="rp-desde" className={campo}>Desde</label>
          <input id="rp-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiar(() => setDesde(e.target.value))} />
        </div>
        <div>
          <label htmlFor="rp-hasta" className={campo}>Hasta</label>
          <input id="rp-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiar(() => setHasta(e.target.value))} />
        </div>
        {tipo === "operativo" && (
          <>
            <div>
              <label htmlFor="rp-estado" className={campo}>Estado</label>
              <select id="rp-estado" value={estado} onChange={(e) => cambiar(() => setEstado(e.target.value))}>
                {ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div className="min-w-48 flex-1">
              <label htmlFor="rp-buscar" className={campo}>Cliente o código</label>
              <input id="rp-buscar" type="search" value={buscar} maxLength={60} onChange={(e) => cambiar(() => setBuscar(e.target.value))} placeholder="Ej: González o COT-2026" />
            </div>
          </>
        )}
        {(desde || hasta || estado || buscar) && (
          <button type="button" onClick={() => cambiar(() => { setDesde(""); setHasta(""); setEstado(""); setBuscar(""); })}
            className="!min-h-0 h-11 px-4 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Quitar filtros</button>
        )}
        <div className="ml-auto flex flex-wrap gap-2" role="group" aria-label="Exportar e imprimir">
          {FORMATOS.map(([f, t]) => (
            <button key={f} type="button" disabled={exportando !== null} onClick={() => exportar(f)}
              className="!min-h-0 h-11 px-4 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold disabled:opacity-60 cursor-pointer">
              {exportando === f ? "Generando…" : `Descargar ${t}`}
            </button>
          ))}
          <button type="button" onClick={() => window.print()} className="!min-h-0 h-11 px-4 rounded-lg border border-blue-200 text-blue-800 font-semibold hover:bg-blue-50 cursor-pointer">Imprimir</button>
        </div>
      </form>

      {error && <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}

      <section aria-labelledby="rp-titulo" aria-busy={cargando} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <header className="p-4 border-b border-slate-100">
          <h2 id="rp-titulo" className="text-lg font-bold text-slate-900">{datos?.titulo ?? actual.texto}</h2>
          {datos && <p className="text-sm text-slate-600">{datos.filtros.join(" · ")}</p>}
          <p className="solo-imprimir text-sm text-slate-600">Emitido el {new Date().toLocaleDateString("es-CL")}</p>
        </header>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla del reporte, con desplazamiento">
          <table className="w-full min-w-[40rem] text-left border-collapse text-sm">
            <caption className="sr-only">{datos?.titulo}</caption>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                {datos?.columnas.map((c) => (
                  <th key={c.clave} scope="col" className={`px-4 py-3 font-semibold ${["pesos", "numero", "porcentaje"].includes(c.tipo) ? "text-right" : ""}`}>{c.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando && <tr><td colSpan={9} className="p-8 text-center text-slate-500">Cargando…</td></tr>}
              {!cargando && datos?.filas.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">No hay datos con esos filtros.</td></tr>}
              {!cargando && datos?.filas.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {f.map((v, k) => (
                    <td key={k} className={`px-4 py-2.5 ${["pesos", "numero", "porcentaje"].includes(datos.columnas[k].tipo) ? "text-right tabular-nums" : ""}`}>{celda(v, datos.columnas[k].tipo)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {!cargando && datos && datos.filas.length > 0 && Object.keys(datos.totales).length > 0 && (
              <tfoot>
                <tr className="bg-blue-50 font-bold text-blue-950">
                  {datos.columnas.map((c, i) => (
                    <th key={c.clave} scope={i === 0 ? "row" : undefined} className={`px-4 py-3 ${["pesos", "numero", "porcentaje"].includes(c.tipo) ? "text-right tabular-nums" : "text-left"}`}>
                      {i === 0 ? "Total" : c.clave in datos.totales ? celda(datos.totales[c.clave], c.tipo) : ""}
                    </th>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {tipo === "operativo" && datos && (
          <div className="no-imprimir px-4 pb-4">
            <Paginador total={datos.total_filas} pagina={pagina} porPagina={porPagina} onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(1); }} opciones={[20, 50, 100]} />
          </div>
        )}
      </section>
      <p className="no-imprimir text-xs text-slate-500">El CSV usa «;» como separador de columnas y codificación UTF-8, y se abre directo en Excel. Cada descarga queda registrada con su nombre.</p>
    </div>
  );
}
