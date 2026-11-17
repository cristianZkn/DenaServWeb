"use client";

import { useMemo, useState } from "react";

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
  const etiquetaCategoria = (c: string) => (etiquetasCategoria[c] ?? c).replace(/\s*\(.*\)$/, "");

  return (
    <div className="border-2 border-slate-300 rounded-xl overflow-hidden bg-white">
      <div className="p-3 border-b border-slate-200 space-y-3">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar material o proveedor…"
          aria-label="Buscar material o proveedor"
        />
        <details>
          <summary className="cursor-pointer select-none font-semibold text-slate-700">
            Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""}
          </summary>
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-600 mb-1">Categoría</legend>
              {todasCategorias.map((c) => (
                <label key={c} className="flex items-center gap-2 py-1 cursor-pointer">
                  <input type="checkbox" className="!w-5 !min-h-0" checked={categorias.includes(c)} onChange={() => setCategorias((p) => alternar(p, c))} />
                  <span>{etiquetaCategoria(c)}</span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-600 mb-1">Proveedor</legend>
              {todosProveedores.map((p) => (
                <label key={p} className="flex items-center gap-2 py-1 cursor-pointer">
                  <input type="checkbox" className="!w-5 !min-h-0" checked={proveedores.includes(p)} onChange={() => setProveedores((x) => alternar(x, p))} />
                  <span>{p}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">Ordenar por</span>
              <select value={orden} onChange={(e) => setOrden(e.target.value as "nombre" | "precio")} className="!w-auto">
                <option value="nombre">Nombre</option>
                <option value="precio">Precio (menor a mayor)</option>
              </select>
            </label>
            {filtrosActivos > 0 && (
              <button type="button" onClick={() => { setCategorias([]); setProveedores([]); }} className="text-blue-800 font-semibold hover:underline cursor-pointer">
                Limpiar filtros
              </button>
            )}
          </div>
        </details>
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
        {visibles.length} de {catalogo.length} materiales · precios netos, con el descuento del proveedor
      </p>
    </div>
  );
}
