"use client";

import { useDialogo } from "@/components/ConfirmDialog";
import { urlSegura } from "@/lib/url";
import { CATEGORIAS } from "@/lib/categorias";
import Paginador from "@/components/Paginador";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import Insignia from "@/components/Insignia";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

const JSON_HDR = { "Content-Type": "application/json" };

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
const OBLIGATORIOS = ["TECHUMBRE", "REVESTIMIENTO", "TABIQUERIA", "BASE_RADIER"]; // deben tener un precio leído de su ficha
const GRUPOS = CATEGORIAS.map((c) => ({ ...c, obligatorio: OBLIGATORIOS.includes(c.key) }));

// Unidades en que se vende un material (las mismas que acepta el servidor).
const UNIDADES = [
  { v: "UN", t: "Unidad" }, { v: "M2", t: "m² (metro cuadrado)" }, { v: "ML", t: "Metro lineal" }, { v: "M3", t: "m³ (metro cúbico)" },
  { v: "KG", t: "Kilo" }, { v: "SACO", t: "Saco" }, { v: "CAJA", t: "Caja" }, { v: "ROLLO", t: "Rollo" }, { v: "PLANCHA", t: "Plancha" },
  { v: "BOLSA", t: "Bolsa" }, { v: "LT", t: "Litro" }, { v: "GL", t: "Global" }, { v: "PAR", t: "Par" },
];
const etiquetaUnidad = (u: string) => UNIDADES.find((x) => x.v === u.toUpperCase())?.t ?? u;

type FiltroEstado = "ACTIVOS" | "DESACTIVADOS" | "POR_CONFIRMAR" | "SIN_VERIFICAR" | "TODOS";
const ESTADOS: { k: FiltroEstado; t: string }[] = [
  { k: "ACTIVOS", t: "Activos" }, { k: "DESACTIVADOS", t: "Desactivados" }, { k: "POR_CONFIRMAR", t: "Por confirmar" },
  { k: "SIN_VERIFICAR", t: "Sin verificar" }, { k: "TODOS", t: "Todos" },
];
const cumple = (i: Insumo, f: FiltroEstado) =>
  f === "TODOS" || (f === "ACTIVOS" && i.activo) || (f === "DESACTIVADOS" && !i.activo && i.verificado) ||
  (f === "POR_CONFIRMAR" && !i.activo && !i.verificado) || (f === "SIN_VERIFICAR" && i.activo && !i.verificado);

const clp = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function antiguedad(iso: string | null) {
  if (!iso) return { texto: "Nunca", dias: Infinity };
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return { texto: dias <= 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`, dias };
}

export default function CatalogosPage() {
  const [items, setItems] = useState<Insumo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [categoria, setCategoria] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("ACTIVOS");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [modal, setModal] = useState<Insumo | "nuevo" | null>(null);
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [ri, rp, re] = await Promise.all([
        fetch("/api/insumos/"),
        fetch("/api/proveedores/"),
        fetch("/api/insumos/actualizar-precios/estado"),
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
      const r = await fetch("/api/insumos/actualizar-precios/estado");
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
    const r = await fetch("/api/insumos/actualizar-precios", { method: "POST" });
    if (r.status === 202 || r.status === 409) {
      setEstado((p) => ({ ...(p as Estado), estado: "running", resultado: null }));
      vigilar();
    } else {
      setError("No se pudo iniciar la actualización.");
    }
  };

  const q = busqueda.trim().toLowerCase();
  const porEstado = items.filter((i) => cumple(i, filtroEstado) && (!filtroProveedor || (i.proveedor ?? "Sin proveedor") === filtroProveedor));
  const nombresProveedor = Array.from(new Set(items.map((i) => i.proveedor ?? "Sin proveedor"))).sort((a, b) => a.localeCompare(b, "es"));
  const filtrados = porEstado
    .filter((i) => categoria === "TODOS" || i.categoria === categoria)
    .filter((i) => !q || `${i.nombre} ${i.proveedor ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => GRUPOS.findIndex((g) => g.key === a.categoria) - GRUPOS.findIndex((g) => g.key === b.categoria) || a.nombre.localeCompare(b.nombre));
  const visibles = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);
  const sinCobertura = estado?.grupos_sin_cobertura ?? [];
  const ultima = antiguedad(estado?.ultima_actualizacion ?? null);
  const problemas = [...(estado?.resultado?.errores ?? []), ...(estado?.resultado?.a_revisar ?? [])];

  return (
    <div className="space-y-4">
      <EncabezadoPagina icono="🧱" titulo="Materiales y precios"
        descripcion={<>Precios obtenidos de la ficha de cada producto. Última actualización:{" "}
          <strong className={ultima.dias > 8 ? "text-amber-700" : "text-slate-800"}>
            {estado?.ultima_actualizacion ? `${new Date(estado.ultima_actualizacion).toLocaleDateString("es-CL")} · ${ultima.texto.toLowerCase()}` : "nunca"}
          </strong>. Se actualizan solos cada lunes.</>}
        resumen={[{ texto: "Activos", valor: items.filter((i) => i.activo).length }, { texto: "Desactivados", valor: items.filter((i) => !i.activo).length }, { texto: "Total", valor: items.length }]}
        acciones={<>
          <button onClick={sincronizar} disabled={sincronizando}
            className="border-2 border-blue-900 text-blue-900 hover:bg-blue-50 font-semibold px-4 h-11 rounded-lg transition disabled:opacity-60 cursor-pointer">
            {sincronizando ? "Leyendo precios…" : "Sincronizar precios ahora"}
          </button>
          <button onClick={() => setModal("nuevo")} className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-4 h-11 rounded-lg shadow-sm transition cursor-pointer">
            + Agregar material
          </button>
        </>} />

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

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Estado del material">
          <span className="text-sm font-semibold text-slate-500 mr-1">Estado</span>
          {ESTADOS.map((e) => {
            const n = items.filter((i) => cumple(i, e.k)).length;
            if (n === 0 && e.k !== "ACTIVOS" && e.k !== "TODOS") return null; // estados sin materiales no ocupan espacio
            return (
              <button key={e.k} type="button" aria-pressed={filtroEstado === e.k} onClick={() => { setFiltroEstado(e.k); setPagina(1); }}
                className={`!min-h-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition cursor-pointer ring-1 ring-inset ${
                  filtroEstado === e.k ? "bg-blue-900 text-white ring-blue-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}>
                {e.t} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ key: "TODOS", label: "Todos", obligatorio: false }, ...GRUPOS].map((g) => {
            const n = porEstado.filter((i) => g.key === "TODOS" || i.categoria === g.key).length;
            const falta = g.obligatorio && sinCobertura.some((s) => s.codigo === g.key);
            if (g.key !== "TODOS" && n === 0 && !g.obligatorio) return null; // categorías sin materiales no ocupan espacio
            return (
              <button
                key={g.key}
                onClick={() => { setCategoria(g.key); setPagina(1); }}
                className={`!min-h-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                  categoria === g.key ? "bg-amber-400 text-blue-950" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                {g.label} <span className="opacity-70">{n}</span>
                {falta && <span title="Falta un producto verificado" className="ml-1 text-amber-500">●</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" placeholder="Buscar material o proveedor" aria-label="Buscar" value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} className="flex-1 min-w-0 sm:!w-80 sm:flex-none" />
          <select aria-label="Filtrar por proveedor" value={filtroProveedor} onChange={(e) => { setFiltroProveedor(e.target.value); setPagina(1); }} className="sm:!w-56">
            <option value="">Todos los proveedores</option>
            {nombresProveedor.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-sm text-slate-500">{filtrados.length} {filtrados.length === 1 ? "material" : "materiales"}</span>
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
                            {i.url ? <a href={urlSegura(i.url)} target="_blank" rel="noreferrer" className="hover:underline">{i.nombre} ↗</a> : i.nombre}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-slate-500">Se vende por {etiquetaUnidad(i.unidad_medida).toLowerCase()}</span>
                            {!i.activo && <Insignia tono="gris">{i.verificado ? "Desactivado" : "Por confirmar"}</Insignia>}
                            {i.activo && !i.verificado && <Insignia tono="ambar">Sin verificar</Insignia>}
                          </div>
                          {i.ultimo_error && <div className="text-xs text-red-700" title={i.ultimo_error}>⚠ {i.ultimo_error.slice(0, 70)}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{i.proveedor ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {clp(i.precio_lista)}
                          {i.m2_por_unidad > 0 && <div className="text-xs text-slate-500">por plancha</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{i.descuento_pct ? <Insignia tono="verde">−{i.descuento_pct}%</Insignia> : <span className="text-slate-400">—</span>}</td>
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
        <div className="px-4 pb-4">
          <Paginador total={filtrados.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(1); }} opciones={[20, 50, 100]} />
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
    unidad_medida: item?.unidad_medida || "",
    descuento_pct: item?.descuento_pct ? String(item.descuento_pct) : "",
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
    if (!manual && !/^https?:\/\//i.test(f.fuente_url.trim())) return setError("La dirección de la ficha debe comenzar con http:// o https://");
    if (manual && f.nombre.trim().length > 150) return setError("El nombre puede tener hasta 150 caracteres.");
    if (Number(f.precio_base_unitario) < 0 || Number(f.m2_por_unidad) < 0 || Number(f.mano_obra_m2) < 0) return setError("Los precios y medidas no pueden ser negativos.");
    if (manual && !f.proveedor_id) return setError("Elija la empresa a la que se le compra este material.");
    if (f.categoria !== "BASE_TERRENO" && !f.unidad_medida) return setError("Elija la unidad de medida del material (cómo se vende: unidad, caja, plancha, m²…).");
    if (Number(f.descuento_pct) < 0 || Number(f.descuento_pct) > 100) return setError("El descuento debe estar entre 0 y 100 %.");
    setGuardando(true);
    const payload: Record<string, unknown> = {
      categoria: f.categoria, nombre: f.nombre.trim(), activo: f.activo, verificado: f.verificado,
      fuente_url: manual ? "" : f.fuente_url.trim(),
      unidad_medida: f.categoria === "BASE_TERRENO" ? "M2" : f.unidad_medida,
      descuento_pct: Number(f.descuento_pct) || 0,
    };
    if (f.proveedor_id) payload.proveedor_id = Number(f.proveedor_id);
    if (manual) {
      payload.precio_base_unitario = Number(f.precio_base_unitario) || 0;
    }
    if (f.categoria === "REVESTIMIENTO" && f.m2_por_unidad) payload.m2_por_unidad = Number(f.m2_por_unidad);
    payload.mano_obra_m2 = Number(f.mano_obra_m2) || 0;
    try {
      const r = await fetch(item ? `/api/catalogo-tipos/${item.id}` : "/api/catalogo-tipos/", {
        method: item ? "PUT" : "POST", headers: JSON_HDR, body: JSON.stringify(payload),
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
    const r = await fetch(`/api/catalogo-tipos/${item.id}`, { method: "DELETE" });
    if (r.ok) onGuardado("Material eliminado.");
    else setError((await r.json().catch(() => ({}))).message || "No se pudo eliminar (puede estar usado en una cotización). Desactívelo en su lugar.");
  };

  // Esc cierra la ventana (también se cierra al hacer clic fuera del recuadro).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !guardando) onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const etiqueta = "block text-sm font-semibold text-slate-700 mb-1";
  const ayuda = "text-sm text-slate-500 mt-1";
  const tarjeta = "rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm";
  const titulo = (icono: string, texto: string) => (
    <h3 className="flex items-center gap-2 text-base font-extrabold text-blue-900"><span aria-hidden className="text-lg">{icono}</span>{texto}</h3>
  );
  const conFicha = !manual;
  return (
    <div className="fixed inset-0 bg-blue-950/55 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="m-titulo"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}>
      {dialogo}
      <form onSubmit={guardar} className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden ring-1 ring-black/10">
        <header className="flex items-start gap-3 bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-4 text-white">
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-2xl">🧱</span>
          <div className="min-w-0 mr-auto">
            <h2 id="m-titulo" className="text-xl font-extrabold leading-tight">{item ? "Editar material" : "Agregar material"}</h2>
            <p className="truncate text-sm text-blue-100">{item ? item.nombre : "Complete los datos del producto para poder cotizarlo."}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="!min-h-0 h-9 w-9 shrink-0 rounded-lg text-lg text-blue-100 hover:bg-white/15 cursor-pointer">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md text-sm font-semibold">{error}</div>}

          {/* Producto */}
          <section className={tarjeta}>
            {titulo("📦", "Producto")}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={etiqueta} htmlFor="m-cat">Categoría</label>
                <select id="m-cat" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
                  {GRUPOS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className={etiqueta} htmlFor="m-prov">Empresa (proveedor){manual ? " *" : ""}</label>
                <select id="m-prov" required={manual} value={f.proveedor_id} onChange={(e) => set("proveedor_id", e.target.value)}>
                  <option value="">{manual ? "Elija una empresa…" : "Detectar por la ficha"}</option>
                  {proveedores.filter((p) => p.activo !== false).map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
            </div>
            <p className={ayuda}>La lista de empresas sale de «Proveedores». ¿Falta una? Agréguela primero en esa sección.</p>

            {f.categoria !== "BASE_TERRENO" && (
              <label className="flex items-start gap-2 cursor-pointer rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <input type="checkbox" className="!w-5 !min-h-0 mt-0.5" checked={f.sin_ficha} onChange={(e) => set("sin_ficha", e.target.checked)} />
                <span className="text-sm">Este material no tiene ficha en línea: ingresaré el precio a mano.</span>
              </label>
            )}

            {manual ? (
              <div>
                <label className={etiqueta} htmlFor="m-nom">Nombre del material *</label>
                <input id="m-nom" required maxLength={150} value={f.nombre} onChange={(e) => set("nombre", e.target.value)}
                  placeholder={f.categoria === "BASE_TERRENO" ? "Ej: Radier H20 10 cm" : "Ej: Clavos 3 pulgadas"} />
              </div>
            ) : (
              <>
                <div>
                  <label className={etiqueta} htmlFor="m-url">Dirección de la ficha del producto *</label>
                  <input id="m-url" type="url" required value={f.fuente_url} onChange={(e) => set("fuente_url", e.target.value)}
                    placeholder="https://www.sodimac.cl/sodimac-cl/product/…" />
                  <p className={ayuda}>Hoy se leen solas las fichas de Easy, Sodimac, MCT y Ferrelan. El nombre, el precio y el descuento salen de esa página.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={etiqueta} htmlFor="m-nom2">Nombre (opcional)</label>
                    <input id="m-nom2" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Si lo deja vacío se usa el de la tienda" />
                  </div>
                  {f.categoria === "REVESTIMIENTO" && (
                    <div>
                      <label className={etiqueta} htmlFor="m-m2">m² que cubre cada unidad</label>
                      <input id="m-m2" type="number" min="0" step="0.01" value={f.m2_por_unidad} onFocus={(e) => e.target.select()}
                        onChange={(e) => set("m2_por_unidad", e.target.value)} placeholder="Se calcula con las medidas" />
                    </div>
                  )}
                </div>
              </>
            )}

            {f.categoria !== "BASE_TERRENO" && (
              <div>
                <label className={etiqueta} htmlFor="m-uni">Unidad de medida *</label>
                <select id="m-uni" value={f.unidad_medida} onChange={(e) => set("unidad_medida", e.target.value)} aria-invalid={error.includes("unidad de medida") ? true : undefined}>
                  <option value="" disabled>Elija cómo se vende…</option>
                  {UNIDADES.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}
                </select>
                <p className={ayuda}>Cómo se vende el producto: por unidad, saco, caja, plancha, rollo, m², etc.</p>
              </div>
            )}
          </section>

          {/* Precio */}
          <section className={tarjeta}>
            {titulo("💲", "Precio y descuento")}
            {manual ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={etiqueta} htmlFor="m-pre">{f.categoria === "BASE_TERRENO" ? "Precio por m² (lista)" : "Precio de lista ($)"}</label>
                  <input id="m-pre" type="number" min="0" step="500" value={f.precio_base_unitario} onFocus={(e) => e.target.select()}
                    onChange={(e) => set("precio_base_unitario", e.target.value)} />
                  <p className={ayuda}>Precio normal, sin descuento. Use solo precios reales: el material aparece en el cotizador.</p>
                </div>
                <div>
                  <label className={etiqueta} htmlFor="m-dcto">Descuento (%)</label>
                  <input id="m-dcto" type="number" min="0" max="100" step="0.01" value={f.descuento_pct} onFocus={(e) => e.target.select()}
                    onChange={(e) => set("descuento_pct", e.target.value)} placeholder="0" />
                  <p className={ayuda}>Si consigue un descuento en este producto, escríbalo: se resta al precio de lista.</p>
                </div>
              </div>
            ) : item ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200"><div className="text-xs font-semibold text-slate-500">Precio de lista</div><div className="font-extrabold tabular-nums">{clp(item.precio_lista)}</div></div>
                <div className="rounded-lg bg-green-50 p-3 ring-1 ring-green-200"><div className="text-xs font-semibold text-green-800">Descuento</div><div className="font-extrabold tabular-nums text-green-800">{item.descuento_pct ? `−${item.descuento_pct}%` : "Sin descuento"}</div></div>
                <div className="rounded-lg bg-blue-50 p-3 ring-1 ring-blue-200"><div className="text-xs font-semibold text-blue-800">Costo neto</div><div className="font-extrabold tabular-nums text-blue-900">{clp(item.costo_neto)}</div></div>
              </div>
            ) : null}
            {conFicha && (
              <p className="text-sm text-slate-600 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                El precio de lista (sin descuento), el descuento y el costo neto se leen solos de la ficha de la tienda y se actualizan cada lunes.
              </p>
            )}
          </section>

          {/* Instalación */}
          <section className={tarjeta}>
            {titulo("🔨", "Mano de obra por instalación")}
            <div>
              <label className={etiqueta} htmlFor="m-mo">Tarifa por m² instalado (opcional)</label>
              <input id="m-mo" type="number" min="0" step="100" value={f.mano_obra_m2} onFocus={(e) => e.target.select()}
                onChange={(e) => set("mano_obra_m2", e.target.value)} placeholder="Ej.: 2000 para el OSB Smartside Lap" />
              <p className={ayuda}>
                Tarifa habitual si a cada trabajador se le paga aparte por instalar este material. En cada cotización se puede quitar o cambiar sin
                tocar este valor; si la tarifa sube, edítela aquí una vez: las cotizaciones nuevas la usan y las ya emitidas conservan la suya.
              </p>
            </div>
          </section>

          {/* Estado */}
          <section className={tarjeta}>
            {titulo("✅", "Estado")}
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="!w-5 !min-h-0 mt-0.5" checked={f.verificado} onChange={(e) => set("verificado", e.target.checked)} />
              <span><strong>Confirmo que es el producto correcto.</strong> <span className="text-sm text-slate-500">Al marcarlo se vuelve a leer el precio de la ficha.</span></span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="!w-5 !min-h-0" checked={f.activo} onChange={(e) => set("activo", e.target.checked)} />
              <span>Disponible para cotizar</span>
            </label>
          </section>
        </div>

        <footer className="flex items-center gap-3 border-t border-slate-200 bg-white px-4 sm:px-5 py-3">
          {item && <button type="button" onClick={eliminar} className="!min-h-0 text-red-700 font-semibold hover:bg-red-50 px-3 py-2 rounded-lg cursor-pointer">Eliminar</button>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCerrar} className="px-5 h-11 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer">Cancelar</button>
            <button type="submit" disabled={guardando} className="px-6 h-11 bg-blue-900 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-sm disabled:opacity-60 cursor-pointer">
              {guardando ? "Leyendo la ficha…" : "Guardar"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
