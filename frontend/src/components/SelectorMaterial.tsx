"use client";

import { useMemo, useState } from "react";
import Icono from "@/components/Icono";

/** Material del catálogo tal como lo necesita el selector. `precio_neto` ya trae el descuento del proveedor. */
export interface MaterialCatalogo {
  id: number;
  categoria: string;
  nombre: string;
  unidad_medida: string;
  proveedor?: { razon_social: string } | null;
  precio_neto: number;
  m2_por_unidad: number;
}

interface Props {
  catalogo: MaterialCatalogo[];
  etiquetasCategoria: Record<string, string>;
  seleccionado: string;
  /** Ids de los materiales que ya están en la lista de la cotización. */
  enLista: number[];
  onSeleccionar: (id: string) => void;
}

const SIN_PROVEEDOR = "Sin proveedor";
const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const proveedorDe = (m: MaterialCatalogo) => m.proveedor?.razon_social || SIN_PROVEEDOR;
const alternar = (lista: string[], valor: string) => (lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
const comparar = (a: string, b: string) => a.localeCompare(b, "es");

/** Unidad en la que se cotiza el material: los que se venden por plancha se cotizan por m². */
export function unidadDe(m: MaterialCatalogo): string {
  if (m.m2_por_unidad > 0) return "m²";
  const u = m.unidad_medida.toLowerCase();
  return u === "m2" ? "m²" : u;
}

/**
 * Selector de materiales: lista con proveedor y precio de cada producto, buscador y filtros por categoría y proveedor.
 * Ordenada por nombre, los mismos productos de distintas tiendas quedan juntos para comparar sus precios.
 */
export default function SelectorMaterial({ catalogo, etiquetasCategoria, seleccionado, enLista, onSeleccionar }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [orden, setOrden] = useState<"nombre" | "precio">("nombre");

  const todasCategorias = useMemo(() => Array.from(new Set(catalogo.map((m) => m.categoria))), [catalogo]);
  const todosProveedores = useMemo(() => Array.from(new Set(catalogo.map(proveedorDe))).sort(comparar), [catalogo]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return catalogo
      .filter((m) => categorias.length === 0 || categorias.includes(m.categoria))
      .filter((m) => proveedores.length === 0 || proveedores.includes(proveedorDe(m)))
      .filter((m) => !q || `${m.nombre} ${proveedorDe(m)}`.toLowerCase().includes(q))
      .sort((a, b) =>
        orden === "precio" ? a.precio_neto - b.precio_neto || comparar(a.nombre, b.nombre) : comparar(a.nombre, b.nombre) || a.precio_neto - b.precio_neto
      );
  }, [catalogo, busqueda, categorias, proveedores, orden]);

  const filtrosActivos = categorias.length + proveedores.length;
  const conteoCategoria = useMemo(() => catalogo.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.categoria]: (acc[m.categoria] ?? 0) + 1 }), {}), [catalogo]);
  const etiquetaCategoria = (c: string) => (etiquetasCategoria[c] ?? c).replace(/\s*\(.*\)$/, "");

  return (
    <div className="border-2 border-slate-300 rounded-xl overflow-hidden bg-white">
      <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50/70 space-y-3">
        <div className="relative">
          <Icono nombre="buscar" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar material o proveedor…"
            aria-label="Buscar material o proveedor" className="!pl-10" />
        </div>

        {/* Los filtros están siempre a la vista: un toque activa o quita cada uno */}
        <div>
          <p className="mb-1.5 text-xs font-bold text-slate-500">Categoría</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por categoría">
            {todasCategorias.map((c) => {
              const activa = categorias.includes(c);
              return (
                <button key={c} type="button" aria-pressed={activa} onClick={() => setCategorias((p) => alternar(p, c))}
                  className={`!min-h-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset transition cursor-pointer ${
                    activa ? "bg-blue-900 text-white ring-blue-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"}`}>
                  {activa && <Icono nombre="check" className="h-3.5 w-3.5" />}{etiquetaCategoria(c)}
                  <span className={`text-xs ${activa ? "text-blue-200" : "text-slate-400"}`}>{conteoCategoria[c] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-slate-500">Proveedor</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por proveedor">
            {todosProveedores.map((p) => {
              const activo = proveedores.includes(p);
              return (
                <button key={p} type="button" aria-pressed={activo} onClick={() => setProveedores((x) => alternar(x, p))}
                  className={`!min-h-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset transition cursor-pointer ${
                    activo ? "bg-amber-400 text-blue-950 ring-amber-400" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"}`}>
                  {activo && <Icono nombre="check" className="h-3.5 w-3.5" />}{p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-600"><strong className="text-slate-900">{visibles.length}</strong> de {catalogo.length} materiales</span>
          <div className="flex flex-wrap items-center gap-3">
            {filtrosActivos > 0 && (
              <button type="button" onClick={() => { setCategorias([]); setProveedores([]); }} className="!min-h-0 inline-flex items-center gap-1 font-semibold text-blue-800 hover:underline cursor-pointer">
                <Icono nombre="cerrar" className="h-3.5 w-3.5" />Limpiar filtros ({filtrosActivos})
              </button>
            )}
            <label className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Ordenar</span>
              <select value={orden} onChange={(e) => setOrden(e.target.value as "nombre" | "precio")} className="!w-auto !min-h-0 !h-9 !py-0 text-sm">
                <option value="nombre">Por nombre</option>
                <option value="precio">Precio: menor a mayor</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div role="radiogroup" aria-label="Materiales disponibles" className="max-h-80 overflow-y-auto divide-y divide-slate-100">
        {visibles.length === 0 && <p className="p-4 text-slate-500">Ningún material coincide con la búsqueda o los filtros.</p>}
        {visibles.map((m) => (
          <label key={m.id} className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 ${seleccionado === String(m.id) ? "bg-blue-50" : ""}`}>
            <input type="radio" name="material-elegido" className="!w-5 !min-h-0 mt-1" checked={seleccionado === String(m.id)} onChange={() => onSeleccionar(String(m.id))} />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-slate-900">{m.nombre}</span>
              <span className="block text-sm text-slate-500">
                <span className="inline-block px-2 py-0.5 mr-2 rounded bg-slate-100 text-slate-700 font-semibold">{proveedorDe(m)}</span>
                {etiquetaCategoria(m.categoria)}
                {enLista.includes(m.id) && <span className="ml-2 font-semibold text-green-700">· ya está en la lista</span>}
              </span>
            </span>
            <span className="text-right whitespace-nowrap">
              <span className="block font-bold tabular-nums">{m.precio_neto > 0 ? clp(m.precio_neto) : "Sin precio"}</span>
              <span className="block text-xs text-slate-500">por {unidadDe(m)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="px-3 py-2 text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
        {visibles.length} de {catalogo.length} materiales · precios netos, con el descuento de cada producto
      </p>
    </div>
  );
}
