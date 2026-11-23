"use client";

import { useDialogo } from "@/components/ConfirmDialog";
import CatalogoAdmin from "@/components/CatalogoAdmin";
import SelectorFotos from "@/components/SelectorFotos";
import { ETIQUETAS } from "@/lib/empresa";

import { useCallback, useEffect, useState } from "react";

const JSON_HDR = { "Content-Type": "application/json" };

interface Proyecto {
  id: number;
  titulo: string;
  descripcion: string | null;
  ubicacion_comuna: string | null;
  publicado: boolean;
  etiqueta?: string;
  imagenes: string[];
}
const MAX_IMAGENES = 10;

type Pestana = "obras" | "catalogo";

export default function PortafolioAdminPage() {
  const [pestana, setPestana] = useState<Pestana>("obras");
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [nCasas, setNCasas] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Proyecto | "nuevo" | null>(null);
  const { preguntar, dialogo } = useDialogo();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/portafolio/admin");
      if (r.ok) setProyectos(await r.json());
      else setError("No se pudo cargar el portafolio.");
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarPestana = (p: Pestana) => { setAviso(""); setError(""); setPestana(p); };

  const alternarPublicado = async (p: Proyecto) => {
    const r = await fetch(`/api/portafolio/${p.id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ publicado: !p.publicado }) });
    if (r.ok) {
      setAviso(p.publicado ? "El proyecto se ocultó de la página pública." : "El proyecto ya se ve en la página pública.");
      cargar();
    } else setError("No se pudo cambiar la visibilidad.");
  };

  const eliminar = async (p: Proyecto) => {
    if (!(await preguntar({ titulo: "¿Seguro que desea eliminar este proyecto?", mensaje: `«${p.titulo}» y sus fotos se eliminarán de forma definitiva.`, peligro: true }))) return;
    const r = await fetch(`/api/portafolio/${p.id}`, { method: "DELETE" });
    if (r.ok) {
      setAviso("Proyecto eliminado.");
      cargar();
    } else setError("No se pudo eliminar el proyecto.");
  };

  const visibles = proyectos.filter((p) => p.publicado).length;
  const pestanas: { clave: Pestana; texto: string; n: number }[] = [
    { clave: "obras", texto: "Obras terminadas", n: proyectos.length },
    { clave: "catalogo", texto: "Catálogo de casas", n: nCasas },
  ];

  return (
    <div className="space-y-5">
      {dialogo}

      {/* Encabezado */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white p-5 sm:p-6 shadow-md">
        <div aria-hidden className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-amber-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-2xl font-extrabold">Portafolio y catálogo</h1>
            <p className="text-blue-100 mt-1">Lo que se muestra en la página pública: obras terminadas y casas prediseñadas.</p>
          </div>
          <a href="/portafolio" target="_blank" className="rounded-lg border border-white/30 hover:bg-white/10 px-4 py-2 font-semibold transition">Ver página pública ↗</a>
        </div>
        <dl className="relative mt-5 grid grid-cols-3 gap-3 max-w-xl">
          {[["Obras publicadas", `${visibles} de ${proyectos.length}`], ["Casas en el catálogo", String(nCasas)], ["Fotos en obras", String(proyectos.reduce((t, p) => t + p.imagenes.length, 0))]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/10 ring-1 ring-white/15 p-3">
              <dt className="text-xs font-semibold text-blue-100">{k}</dt>
              <dd className="text-xl font-black tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-slate-200" role="tablist" aria-label="Secciones del portafolio">
        {pestanas.map((p) => (
          <button key={p.clave} type="button" role="tab" aria-selected={pestana === p.clave} onClick={() => cambiarPestana(p.clave)}
            className={`relative !min-h-0 px-4 py-3 text-base font-bold transition-colors cursor-pointer after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-amber-500 after:origin-center after:transition-transform after:duration-300 ${
              pestana === p.clave ? "text-blue-900 after:scale-x-100" : "text-slate-500 hover:text-blue-800 after:scale-x-0"}`}>
            {p.texto} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${pestana === p.clave ? "bg-blue-900 text-white" : "bg-slate-200 text-slate-600"}`}>{p.n}</span>
          </button>
        ))}
      </div>

      {aviso && <div role="status" className="bg-green-50 border-l-4 border-green-600 text-green-900 p-3 rounded-r-md font-semibold">{aviso}</div>}
      {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md font-semibold">{error}</div>}

      {/* La pestaña del catálogo se mantiene montada para conservar su cantidad en la etiqueta */}
      <div hidden={pestana !== "catalogo"}>
        <CatalogoAdmin onCantidad={setNCasas} onAviso={setAviso} onError={setError} />
      </div>

      {pestana === "obras" && (
        <div className="space-y-4 animate-entrar">
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 p-4">
            <p className="mr-auto text-blue-900">Obras finalizadas que se exhiben en la sección «Obras» de la página pública.</p>
            <button onClick={() => { setAviso(""); setError(""); setEditando("nuevo"); }} className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-5 h-11 rounded-lg shadow-sm cursor-pointer whitespace-nowrap">
              + Agregar obra terminada
            </button>
          </div>

          {cargando ? (
            <p className="text-center text-slate-500 py-10 font-semibold">Cargando portafolio...</p>
          ) : proyectos.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-600">
              Aún no hay obras en el portafolio. Agregue la primera con «Agregar obra terminada».
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {proyectos.map((p) => (
                <article key={p.id} className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition duration-300">
                  <div className="relative h-44 bg-slate-200 overflow-hidden">
                    {p.imagenes[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagenes[0]} alt={p.titulo} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Sin fotos</div>
                    )}
                    {p.etiqueta && ETIQUETAS[p.etiqueta] && (
                      <span className={`absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-xs font-black shadow ${ETIQUETAS[p.etiqueta].clase}`}>{ETIQUETAS[p.etiqueta].texto}</span>
                    )}
                    <span className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded">{p.imagenes.length} {p.imagenes.length === 1 ? "foto" : "fotos"}</span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <h2 className="font-bold text-lg leading-tight">{p.titulo}</h2>
                    {p.ubicacion_comuna && <p className="text-sm text-slate-500">📍 {p.ubicacion_comuna}</p>}
                    <span className={`self-start px-2 py-0.5 rounded border text-sm font-bold ${p.publicado ? "bg-green-100 text-green-900 border-green-600" : "bg-slate-100 text-slate-700 border-slate-400"}`}>
                      {p.publicado ? "Visible en la web" : "Oculto"}
                    </span>
                    <div className="mt-auto pt-3 flex flex-wrap gap-2">
                      <button onClick={() => { setAviso(""); setError(""); setEditando(p); }} className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-800 font-semibold hover:bg-blue-50 cursor-pointer">Editar</button>
                      <button onClick={() => alternarPublicado(p)} className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold hover:bg-slate-50 cursor-pointer">
                        {p.publicado ? "Ocultar de la web" : "Publicar en la web"}
                      </button>
                      <button onClick={() => eliminar(p)} className="px-3 py-1.5 rounded-lg text-red-700 font-semibold hover:bg-red-50 cursor-pointer">Eliminar</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {editando && (
        <FormularioProyecto
          proyecto={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(msg) => { setEditando(null); setAviso(msg); cargar(); }}
        />
      )}
    </div>
  );
}

function FormularioProyecto({ proyecto, onCerrar, onGuardado }: {
  proyecto: Proyecto | null; onCerrar: () => void; onGuardado: (msg: string) => void;
}) {
  const [titulo, setTitulo] = useState(proyecto?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion ?? "");
  const [comuna, setComuna] = useState(proyecto?.ubicacion_comuna ?? "");
  const [publicado, setPublicado] = useState(proyecto?.publicado ?? true);
  const [vineta, setVineta] = useState(proyecto?.etiqueta ?? "");
  const [existentes, setExistentes] = useState<string[]>(proyecto?.imagenes ?? []);
  const [quitar, setQuitar] = useState<number[]>([]);
  const [quitarPortada, setQuitarPortada] = useState(false); // foto externa de obras antiguas (no está en la base de datos)
  const [nuevas, setNuevas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const quitarExistente = (url: string) => {
    if (url.startsWith("/api/portafolio/imagenes/")) setQuitar((p) => [...p, Number(url.split("/").filter(Boolean).pop())]);
    else setQuitarPortada(true);
    setExistentes((p) => p.filter((u) => u !== url));
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (titulo.trim().length < 3) return setError("El título debe tener al menos 3 letras.");
    setGuardando(true);
    try {
      const base = { titulo: titulo.trim(), descripcion: descripcion.trim() || null, ubicacion_comuna: comuna.trim() || null, publicado, etiqueta: vineta };
      // Las fotos suben de a pocas por vez: así ninguna solicitud supera el límite de tamaño del servidor.
      const r = proyecto
        ? await fetch(`/api/portafolio/${proyecto.id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ ...base, quitar_imagenes: quitar, quitar_portada: quitarPortada }) })
        : await fetch("/api/portafolio", { method: "POST", headers: JSON_HDR, body: JSON.stringify(base) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.message || "No se pudo guardar el proyecto.");
      const id = data.id as number;
      for (let i = 0; i < nuevas.length; i += 2) {
        const rf = await fetch(`/api/portafolio/${id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ agregar_imagenes: nuevas.slice(i, i + 2) }) });
        if (!rf.ok) {
          const d = await rf.json().catch(() => ({}));
          return setError(`La obra se guardó, pero una foto falló: ${d.message || "intente subirla de nuevo editando la obra."}`);
        }
      }
      onGuardado(proyecto ? "Cambios guardados." : "Obra agregada al portafolio.");
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const etiqueta = "block text-base font-semibold text-slate-800 mb-1";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="pf-titulo">
      <form onSubmit={guardar} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <h2 id="pf-titulo" className="text-xl font-bold text-slate-900">{proyecto ? "Editar obra" : "Agregar obra terminada"}</h2>
        {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md text-sm font-semibold">{error}</div>}

        <div>
          <label className={etiqueta} htmlFor="pf-t">Título *</label>
          <input id="pf-t" required minLength={3} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={150} placeholder="Ej: Casa de 54 m² en Limache" />
        </div>
        <div>
          <label className={etiqueta} htmlFor="pf-c">Comuna</label>
          <input id="pf-c" value={comuna} onChange={(e) => setComuna(e.target.value)} maxLength={100} placeholder="Ej: Casablanca" />
        </div>
        <div>
          <label className={etiqueta} htmlFor="pf-v">Viñeta sobre las fotos</label>
          <select id="pf-v" value={vineta} onChange={(e) => setVineta(e.target.value)}>
            <option value="">Sin viñeta</option>
            {Object.entries(ETIQUETAS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
          <p className="text-sm text-slate-500 mt-1">Se muestra en una esquina de la foto en la página pública.</p>
        </div>
        <div>
          <label className={etiqueta} htmlFor="pf-d">Descripción</label>
          <textarea id="pf-d" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} rows={4}
            className="w-full px-3 py-2 text-lg border-2 border-slate-300 rounded-lg" placeholder="Cuente en pocas líneas qué se construyó y con qué materiales." />
        </div>

        <SelectorFotos existentes={existentes} nuevas={nuevas} max={MAX_IMAGENES} onError={setError}
          onAgregar={(u) => setNuevas((p) => [...p, ...u])} onQuitarNueva={(i) => setNuevas((p) => p.filter((_, k) => k !== i))} onQuitarExistente={quitarExistente} />

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="!w-5 !min-h-0" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} />
          <span>Mostrar esta obra en la página pública</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onCerrar} className="px-5 h-11 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">Cancelar</button>
          <button type="submit" disabled={guardando} className="px-6 h-11 bg-blue-900 hover:bg-blue-800 text-white font-semibold rounded-lg disabled:opacity-60 cursor-pointer">
            {guardando ? "Guardando…" : "Guardar obra"}
          </button>
        </div>
      </form>
    </div>
  );
}
