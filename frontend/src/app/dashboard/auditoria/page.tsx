"use client";

import { useCallback, useEffect, useState } from "react";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import Insignia from "@/components/Insignia";

interface Registro {
  id: number;
  usuario_nombre: string;
  accion: "CREAR" | "MODIFICAR" | "ELIMINAR" | "EXPORTAR";
  entidad: string;
  entidad_id: number;
  detalle: string;
  fecha: string;
}

const POR_PAGINA = 50;
const ENTIDADES: [string, string][] = [
  ["Cotizacion", "Cotizaciones"], ["HitoPago", "Hitos de pago"], ["DetalleRegistro", "Pagos registrados"], ["ObraEjecucion", "Obras"],
  ["BitacoraAvance", "Bitácora"], ["Proveedor", "Proveedores"], ["CatalogoTipo", "Materiales"], ["Usuario", "Usuarios"],
  ["PortafolioProyecto", "Portafolio"], ["CasaCatalogo", "Catálogo de casas"], ["Tarifa", "Tarifas"], ["ContratoNotarial", "Contratos"],
];
const ACCIONES = { CREAR: { texto: "Creó", tono: "verde" }, MODIFICAR: { texto: "Modificó", tono: "azul" }, ELIMINAR: { texto: "Eliminó", tono: "rojo" }, EXPORTAR: { texto: "Exportó", tono: "ambar" } } as const;
const nombreEntidad = (e: string) => ENTIDADES.find(([k]) => k === e)?.[1] ?? e;

/** Historial de cambios del sistema (solo Admin): quién creó, modificó o eliminó qué, y cuándo. */
export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [entidad, setEntidad] = useState("");
  const [accion, setAccion] = useState("");
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async (desde: number) => {
    setCargando(true);
    setError("");
    const q = new URLSearchParams({ limite: String(POR_PAGINA), desde: String(desde) });
    if (entidad) q.set("entidad", entidad);
    if (accion) q.set("accion", accion);
    try {
      const r = await fetch(`/api/auditoria/?${q}`);
      if (!r.ok) throw new Error();
      const datos: Registro[] = await r.json();
      setRegistros((previos) => (desde ? [...previos, ...datos] : datos));
      setHayMas(datos.length === POR_PAGINA);
    } catch {
      setError("No se pudo cargar el historial de cambios.");
    } finally {
      setCargando(false);
    }
  }, [entidad, accion]);

  useEffect(() => {
    void Promise.resolve().then(() => cargar(0));
  }, [cargar]);

  return (
    <div className="space-y-4">
      <EncabezadoPagina icono="documento" titulo="Auditoría" descripcion="Quién creó, modificó o eliminó información del sistema, y cuándo." />
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-slate-100">
          <div>
            <label htmlFor="au-entidad" className="block text-sm font-semibold text-slate-700 mb-1">Qué se cambió</label>
            <select id="au-entidad" value={entidad} onChange={(e) => setEntidad(e.target.value)}>
              <option value="">Todo</option>
              {ENTIDADES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="au-accion" className="block text-sm font-semibold text-slate-700 mb-1">Acción</label>
            <select id="au-accion" value={accion} onChange={(e) => setAccion(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ACCIONES).map(([k, a]) => <option key={k} value={k}>{a.texto}</option>)}
            </select>
          </div>
        </div>
        {error && <p role="alert" className="m-4 rounded-md border-l-4 border-red-500 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left border-collapse">
            <caption className="sr-only">Historial de cambios, del más reciente al más antiguo</caption>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3">Usuario</th>
                <th scope="col" className="px-4 py-3">Acción</th>
                <th scope="col" className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registros.length === 0 && !cargando && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No hay cambios registrados con ese filtro.</td></tr>}
              {registros.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-2.5 text-sm tabular-nums whitespace-nowrap">{new Date(r.fecha).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{r.usuario_nombre}</td>
                  <td className="px-4 py-2.5"><Insignia tono={ACCIONES[r.accion].tono}>{ACCIONES[r.accion].texto}</Insignia></td>
                  <td className="px-4 py-2.5 text-sm">
                    <span className="font-semibold text-slate-800">{nombreEntidad(r.entidad)}{r.accion === "EXPORTAR" ? "" : ` n.º ${r.entidad_id}`}</span>
                    <span className="block text-slate-500 break-words">{r.detalle}</span>
                  </td>
                </tr>
              ))}
              {cargando && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
        {hayMas && !cargando && (
          <div className="p-4 text-center border-t border-slate-100">
            <button type="button" onClick={() => cargar(registros.length)} className="font-semibold text-blue-800 border border-blue-200 hover:bg-blue-50 px-5 h-11 rounded-lg cursor-pointer">Ver más cambios</button>
          </div>
        )}
      </section>
    </div>
  );
}
