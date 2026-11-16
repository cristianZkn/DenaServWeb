"use client";

import { useDialogo } from "@/components/ConfirmDialog";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

interface Insumo {
  id: number;
  categoria: string;
  nombre: string;
  proveedor_id: number | null;
  proveedor: string | null;
  unidad_medida: string;
  url: string;
  precio_base_unitario: number;
  precio_lista: number | null;
  descuento_pct: number;
  costo_neto: number | null;
  m2_por_unidad: number;
  neto_por_m2: number | null;
  mano_obra_m2: number;
  actualizado_en: string | null;
  verificado: boolean;
  activo: boolean;
  ultimo_error: string;
}

interface Proveedor { id: number; razon_social: string; activo?: boolean }
interface Estado {
  estado: "idle" | "running" | "done" | "error";
  resultado: { actualizados?: number; sin_cambio?: number; errores?: { nombre: string; error: string }[]; a_revisar?: { nombre: string; error: string }[]; message?: string } | null;
  ultima_actualizacion: string | null;
  grupos_sin_cobertura: { codigo: string; nombre: string }[];
}

// Las cuatro primeras son obligatorias: siempre debe haber al menos un producto verificado en cada una.
const GRUPOS = [
  { key: "TECHUMBRE", label: "Techumbre", obligatorio: true },
  { key: "REVESTIMIENTO", label: "Revestimiento", obligatorio: true },
  { key: "TABIQUERIA", label: "Tabiquería", obligatorio: true },
  { key: "BASE_RADIER", label: "Base / Radier", obligatorio: true },
  { key: "INSUMO", label: "Otros insumos", obligatorio: false },
  { key: "BASE_TERRENO", label: "Bases (precio manual)", obligatorio: false },
];

const clp = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function antiguedad(iso: string | null) {
  if (!iso) return { texto: "Nunca", dias: Infinity };
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return { texto: dias <= 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`, dias };
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" });

export default function CatalogosPage() {
  const [items, setItems] = useState<Insumo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [categoria, setCategoria] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [modal, setModal] = useState<Insumo | "nuevo" | null>(null);
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [ri, rp, re] = await Promise.all([
        fetch("/api/insumos/", { headers: authHeaders() }),
        fetch("/api/proveedores/", { headers: authHeaders() }),
        fetch("/api/insumos/actualizar-precios/estado", { headers: authHeaders() }),
      ]);
      if (ri.ok) setItems(await ri.json());
      if (rp.ok) setProveedores(await rp.json());
      if (re.ok) setEstado(await re.json());
    } catch {
      setError("No hay conexión con el servidor. Recargue la página.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    return () => { if (sondeo.current) clearInterval(sondeo.current); };
  }, [cargar]);

  const sincronizando = estado?.estado === "running";

  // Consulta el avance cada 3 s hasta que termina (la lectura de ~20 fichas tarda cerca de un minuto).
  const vigilar = () => {
    if (sondeo.current) clearInterval(sondeo.current);
    sondeo.current = setInterval(async () => {
      const r = await fetch("/api/insumos/actualizar-precios/estado", { headers: authHeaders() });
      if (!r.ok) return;
      const e: Estado = await r.json();
      setEstado(e);
      if (e.estado !== "running") {
        clearInterval(sondeo.current!);
        const res = e.resultado;
        setAviso(
          e.estado === "error"
            ? ""
            : `Listo: ${res?.actualizados ?? 0} precios nuevos, ${res?.sin_cambio ?? 0} sin cambio, ${res?.errores?.length ?? 0} con problemas.`
        );
        if (e.estado === "error") setError(res?.message || "La actualización falló.");
        cargar();
      }
    }, 3000);
  };

  const sincronizar = async () => {
    setError(""); setAviso("");
    const r = await fetch("/api/insumos/actualizar-precios", { method: "POST", headers: authHeaders() });
    if (r.status === 202 || r.status === 409) {
      setEstado((p) => ({ ...(p as Estado), estado: "running", resultado: null }));
      vigilar();
    } else {
      setError("No se pudo iniciar la actualización.");
    }
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = items
    .filter((i) => (verInactivos || i.activo) && (categoria === "TODOS" || i.categoria === categoria))
    .filter((i) => !q || `${i.nombre} ${i.proveedor ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => GRUPOS.findIndex((g) => g.key === a.categoria) - GRUPOS.findIndex((g) => g.key === b.categoria) || a.nombre.localeCompare(b.nombre));
  const ocultos = items.filter((i) => !i.activo).length;
  const sinCobertura = estado?.grupos_sin_cobertura ?? [];
  const ultima = antiguedad(estado?.ultima_actualizacion ?? null);
  const problemas = [...(estado?.resultado?.errores ?? []), ...(estado?.resultado?.a_revisar ?? [])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="mr-auto">
          <h1 className="text-2xl font-extrabold text-slate-900">Materiales y precios</h1>
          <p className="text-sm text-slate-500">
            Precios obtenidos de la ficha de cada producto. Última actualización:{" "}
            <strong className={ultima.dias > 8 ? "text-amber-700" : "text-slate-700"}>
              {estado?.ultima_actualizacion ? `${new Date(estado.ultima_actualizacion).toLocaleDateString("es-CL")} · ${ultima.texto.toLowerCase()}` : "nunca"}
            </strong>
            . Se actualizan automáticamente cada lunes.
          </p>
        </div>
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="border-2 border-blue-900 text-blue-900 hover:bg-blue-50 font-semibold px-4 h-11 rounded-lg transition disabled:opacity-60"
        >
          {sincronizando ? "Leyendo precios…" : "Sincronizar precios ahora"}
        </button>
        <button onClick={() => setModal("nuevo")} className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-4 h-11 rounded-lg shadow-sm transition">
          + Agregar material
        </button>
      </div>

      {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md">{error}</div>}
      {aviso && <div className="bg-green-50 border-l-4 border-green-600 text-green-900 p-3 rounded-r-md font-semibold">{aviso}</div>}
      {sinCobertura.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-900 p-3 rounded-r-md">
          Falta un producto verificado en: <strong>{sinCobertura.map((g) => g.nombre).join(", ")}</strong>. Agregue uno o
          confirme el que está desactivado.
        </div>
      )}
      {problemas.length > 0 && (
        <details className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900">
          <summary className="font-semibold cursor-pointer">{problemas.length} productos no se pudieron actualizar (se mantiene su precio anterior)</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {problemas.map((p, i) => <li key={i}><strong>{p.nombre}:</strong> {p.error}</li>)}
          </ul>
        </details>
      )}

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {[{ key: "TODOS", label: "Todos", obligatorio: false }, ...GRUPOS].map((g) => {
            const n = items.filter((i) => i.activo && (g.key === "TODOS" || i.categoria === g.key)).length;
            const falta = g.obligatorio && sinCobertura.some((s) => s.codigo === g.key);
            return (
              <button
                key={g.key}
                onClick={() => setCategoria(g.key)}
                className={`!min-h-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
                  categoria === g.key ? "bg-blue-900 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                {g.label} <span className="opacity-70">{n}</span>
                {falta && <span title="Falta un producto verificado" className="ml-1 text-amber-500">●</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <input type="search" placeholder="Buscar material o proveedor" aria-label="Buscar" value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} className="flex-1 min-w-0 sm:!w-80 sm:flex-none" />
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" className="!w-4 !min-h-0" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Ver desactivados o por confirmar ({ocultos})
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3 text-right">Precio de lista</th>
                <th className="px-4 py-3 text-right">Desc.</th>
                <th className="px-4 py-3 text-right">Costo neto</th>
                <th className="px-4 py-3">Actualizado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {cargando ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Cargando materiales…</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">No hay materiales que mostrar con este filtro.</td></tr>
              ) : (
                visibles.map((i, idx) => {
                  const a = antiguedad(i.actualizado_en);
                  const color = !i.url ? "bg-slate-100 text-slate-600" : a.dias <= 8 ? "bg-green-100 text-green-800" : a.dias <= 15 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
                  const nuevoGrupo = categoria === "TODOS" && (idx === 0 || visibles[idx - 1].categoria !== i.categoria);
                  return (
                    <Fragment key={i.id}>
                      {nuevoGrupo && (
                        <tr key={`g-${i.categoria}`} className="bg-slate-50">
                          <td colSpan={7} className="px-4 py-1.5 text-sm font-bold text-blue-900">
                            {GRUPOS.find((g) => g.key === i.categoria)?.label ?? i.categoria}
                          </td>
                        </tr>
                      )}
                      <tr className={`hover:bg-slate-50 ${i.activo ? "" : "opacity-60"}`}>
                        <td className="px-4 py-2.5 max-w-sm">
                          <div className="font-semibold text-slate-900 truncate" title={i.nombre}>
                            {i.url ? <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">{i.nombre} ↗</a> : i.nombre}
                          </div>
                          {!i.activo && <span className="text-xs font-semibold text-amber-700">{i.verificado ? "Desactivado" : "Por confirmar"}</span>}
                          {i.activo && !i.verificado && <span className="text-xs font-semibold text-amber-700">Sin verificar</span>}
                          {i.ultimo_error && <div className="text-xs text-red-700" title={i.ultimo_error}>⚠ {i.ultimo_error.slice(0, 70)}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{i.proveedor ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {clp(i.precio_lista)}
                          {i.m2_por_unidad > 0 && <div className="text-xs text-slate-500">por plancha</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{i.descuento_pct ? `${i.descuento_pct}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">
                          {clp(i.costo_neto)}
                          {i.neto_por_m2 != null && <div className="text-xs font-normal text-slate-500">{clp(i.neto_por_m2)} por m²</div>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${color}`} title={i.actualizado_en ? new Date(i.actualizado_en).toLocaleString("es-CL") : "Precio ingresado a mano"}>
                            {i.url ? a.texto : "Manual"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setModal(i)} className="!min-h-0 text-sm font-semibold text-blue-800 hover:bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                            Editar
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <FormularioMaterial
          item={modal === "nuevo" ? null : modal}
          proveedores={proveedores}
          onCerrar={() => setModal(null)}
          onGuardado={(msg) => { setModal(null); setAviso(msg); cargar(); }}
        />
      )}
    </div>
  );
}

function FormularioMaterial({ item, proveedores, onCerrar, onGuardado }: {
  item: Insumo | null; proveedores: Proveedor[]; onCerrar: () => void; onGuardado: (msg: string) => void;
}) {
  const { preguntar, dialogo } = useDialogo();
  const [f, setF] = useState({
    categoria: item?.categoria ?? "TABIQUERIA",
    nombre: item?.nombre ?? "",
    fuente_url: item?.url ?? "",
    m2_por_unidad: item?.m2_por_unidad ? String(item.m2_por_unidad) : "",
    mano_obra_m2: item?.mano_obra_m2 ? String(item.mano_obra_m2) : "",
    precio_base_unitario: item ? String(item.precio_base_unitario) : "",
    proveedor_id: item?.proveedor_id ? String(item.proveedor_id) : "",
    sin_ficha: item ? !item.url : false,
    unidad_medida: item?.unidad_medida || "UN",
    activo: item?.activo ?? true,
    verificado: item?.verificado ?? false,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Las bases se cotizan a mano por m²; cualquier otro material puede ingresarse a mano si su proveedor no tiene ficha en línea.
  const manual = f.categoria === "BASE_TERRENO" || f.sin_ficha;
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!manual && !f.fuente_url.trim()) return setError("Pegue la dirección (URL) de la ficha del producto, o marque que no tiene ficha en línea.");
    if (manual && !f.nombre.trim()) return setError("Escriba el nombre del material.");
    if (manual && !f.proveedor_id) return setError("Elija la empresa a la que se le compra este material.");
    setGuardando(true);
    const payload: Record<string, unknown> = {
      categoria: f.categoria, nombre: f.nombre.trim(), activo: f.activo, verificado: f.verificado,
      fuente_url: manual ? "" : f.fuente_url.trim(),
    };
    if (f.proveedor_id) payload.proveedor_id = Number(f.proveedor_id);
    if (manual) {
      payload.unidad_medida = f.categoria === "BASE_TERRENO" ? "M2" : f.unidad_medida;
      payload.precio_base_unitario = Number(f.precio_base_unitario) || 0;
    }
    if (f.categoria === "REVESTIMIENTO" && f.m2_por_unidad) payload.m2_por_unidad = Number(f.m2_por_unidad);
    payload.mano_obra_m2 = Number(f.mano_obra_m2) || 0;
    try {
      const r = await fetch(item ? `/api/catalogo-tipos/${item.id}` : "/api/catalogo-tipos/", {
        method: item ? "PUT" : "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.message || "No se pudo guardar.");
      onGuardado(item ? "Cambios guardados." : "Material agregado: el precio se leyó de la ficha.");
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!item || !(await preguntar({ titulo: "¿Seguro que desea eliminar este material?", mensaje: `«${item.nombre}» se eliminará de forma definitiva.`, peligro: true }))) return;
    const r = await fetch(`/api/catalogo-tipos/${item.id}`, { method: "DELETE", headers: authHeaders() });
    if (r.ok) onGuardado("Material eliminado.");
    else setError((await r.json().catch(() => ({}))).message || "No se pudo eliminar (puede estar usado en una cotización). Desactívelo en su lugar.");
  };

  const etiqueta = "block text-base font-semibold text-slate-800 mb-1";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      {dialogo}
      <form onSubmit={guardar} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-slate-900">{item ? "Editar material" : "Agregar material"}</h2>
        {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md text-sm">{error}</div>}

        <div>
          <label className={etiqueta} htmlFor="m-cat">Categoría</label>
          <select id="m-cat" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
            {GRUPOS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>

        <div>
          <label className={etiqueta} htmlFor="m-prov">Empresa (proveedor)</label>
          <select id="m-prov" value={f.proveedor_id} onChange={(e) => set("proveedor_id", e.target.value)}>
            <option value="">{manual ? "Elija una empresa…" : "Detectar por la dirección de la ficha"}</option>
            {proveedores.filter((p) => p.activo !== false).map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </select>
          <p className="text-sm text-slate-500 mt-1">
            La lista sale de «Proveedores». ¿Falta una empresa? Agréguela primero en esa sección.
          </p>
        </div>

        {f.categoria !== "BASE_TERRENO" && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="!w-5 !min-h-0 mt-1" checked={f.sin_ficha} onChange={(e) => set("sin_ficha", e.target.checked)} />
            <span>Este material no tiene ficha en línea: ingresaré el precio a mano.</span>
          </label>
        )}

        {manual ? (
          <>
            <div>
              <label className={etiqueta} htmlFor="m-nom">Nombre del material</label>
              <input id="m-nom" value={f.nombre} onChange={(e) => set("nombre", e.target.value)}
                placeholder={f.categoria === "BASE_TERRENO" ? "Ej: Radier H20 10 cm" : "Ej: Clavos 3 pulgadas"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta} htmlFor="m-pre">{f.categoria === "BASE_TERRENO" ? "Precio por m² (lista)" : "Precio de lista ($)"}</label>
                <input id="m-pre" type="number" min="0" step="500" value={f.precio_base_unitario} onFocus={(e) => e.target.select()}
                  onChange={(e) => set("precio_base_unitario", e.target.value)} />
              </div>
              {f.categoria !== "BASE_TERRENO" && (
                <div>
                  <label className={etiqueta} htmlFor="m-uni">Se vende por</label>
                  <select id="m-uni" value={f.unidad_medida} onChange={(e) => set("unidad_medida", e.target.value)}>
                    {["UN", "M2", "ML", "KG", "SACO", "CAJA", "ROLLO", "PLANCHA"].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
            </div>
            <p className="text-sm text-slate-500">Solo ponga precios reales: el material aparece en el cotizador y puede cambiar el valor de la casa.</p>
          </>
        ) : (
          <>
            <div>
              <label className={etiqueta} htmlFor="m-url">Dirección de la ficha del producto</label>
              <input id="m-url" type="url" value={f.fuente_url} onChange={(e) => set("fuente_url", e.target.value)}
                placeholder="https://www.sodimac.cl/sodimac-cl/product/…" />
              <p className="text-sm text-slate-500 mt-1">Hoy se leen solas las fichas de Easy, Sodimac, MCT y Ferrelan. El nombre y el precio salen de esa página.</p>
            </div>
            <div>
              <label className={etiqueta} htmlFor="m-nom2">Nombre (opcional)</label>
              <input id="m-nom2" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Si lo deja vacío se usa el de la tienda" />
            </div>
            {f.categoria === "REVESTIMIENTO" && (
              <div>
                <label className={etiqueta} htmlFor="m-m2">m² que cubre cada unidad (opcional)</label>
                <input id="m-m2" type="number" min="0" step="0.01" value={f.m2_por_unidad} onFocus={(e) => e.target.select()}
                  onChange={(e) => set("m2_por_unidad", e.target.value)} placeholder="Se calcula con las medidas del nombre" />
              </div>
            )}
          </>
        )}

        <div>
          <label className={etiqueta} htmlFor="m-mo">Mano de obra por m² instalado (opcional)</label>
          <input id="m-mo" type="number" min="0" step="100" value={f.mano_obra_m2} onFocus={(e) => e.target.select()}
            onChange={(e) => set("mano_obra_m2", e.target.value)} placeholder="Ej.: 2000 para el OSB Smartside Lap" />
          <p className="text-sm text-slate-500 mt-1">
            Si a cada trabajador se le paga aparte por instalar este material, escriba cuánto por m². Al cotizar, la
            cantidad de este material se ingresa en m² y la mano de obra se suma sola.
          </p>
        </div>

        <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="!w-5 !min-h-0 mt-1" checked={f.verificado} onChange={(e) => set("verificado", e.target.checked)} />
            <span><strong>Confirmo que es el producto correcto.</strong> <span className="text-sm text-slate-500">Al marcarlo se vuelve a leer el precio de la ficha.</span></span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="!w-5 !min-h-0" checked={f.activo} onChange={(e) => set("activo", e.target.checked)} />
            <span>Disponible para cotizar</span>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-1">
          {item && <button type="button" onClick={eliminar} className="text-red-700 font-semibold hover:underline !min-h-0">Eliminar</button>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCerrar} className="px-5 h-11 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancelar</button>
            <button type="submit" disabled={guardando} className="px-6 h-11 bg-blue-900 hover:bg-blue-800 text-white rounded-lg disabled:opacity-60">
              {guardando ? "Leyendo la ficha…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
