"use client";

import { useDialogo } from "@/components/ConfirmDialog";
import { reducirImagen } from "@/lib/imagenes";

import { useCallback, useEffect, useState } from "react";

interface Proyecto {
  id: number;
  titulo: string;
  descripcion: string | null;
  ubicacion_comuna: string | null;
  publicado: boolean;
  imagenes: string[];
}

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const jsonAuth = () => ({ "Content-Type": "application/json", ...auth() });
const MAX_IMAGENES = 10;

export default function PortafolioAdminPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Proyecto | "nuevo" | null>(null);
  const { preguntar, dialogo } = useDialogo();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/portafolio/admin", { headers: auth() });
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

  const alternarPublicado = async (p: Proyecto) => {
    const r = await fetch(`/api/portafolio/${p.id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify({ publicado: !p.publicado }) });
    if (r.ok) {
      setAviso(p.publicado ? "El proyecto se ocultó de la página pública." : "El proyecto ya se ve en la página pública.");
      cargar();
    } else setError("No se pudo cambiar la visibilidad.");
  };

  const eliminar = async (p: Proyecto) => {
    if (!(await preguntar({ titulo: "¿Seguro que desea eliminar este proyecto?", mensaje: `«${p.titulo}» y sus fotos se eliminarán de forma definitiva.`, peligro: true }))) return;
    const r = await fetch(`/api/portafolio/${p.id}`, { method: "DELETE", headers: auth() });
    if (r.ok) {
      setAviso("Proyecto eliminado.");
      cargar();
    } else setError("No se pudo eliminar el proyecto.");
  };

  return (
    <div className="space-y-4">
      {dialogo}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-extrabold text-slate-900">Portafolio</h1>
          <p className="text-slate-600">Obras finalizadas que se exhiben en la página pública.</p>
        </div>
        <a href="/portafolio" target="_blank" className="text-blue-800 font-semibold hover:underline">Ver página pública ↗</a>
        <button onClick={() => { setAviso(""); setError(""); setEditando("nuevo"); }} className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-5 h-11 rounded-lg shadow-sm cursor-pointer">
          + Agregar obra terminada
        </button>
      </div>

      {aviso && <div role="status" className="bg-green-50 border-l-4 border-green-600 text-green-900 p-3 rounded-r-md font-semibold">{aviso}</div>}
      {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md font-semibold">{error}</div>}

      {cargando ? (
        <p className="text-center text-slate-500 py-10 font-semibold">Cargando portafolio...</p>
      ) : proyectos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-600">
          Aún no hay obras en el portafolio. Agregue la primera con «Agregar obra terminada».
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {proyectos.map((p) => (
            <article key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="relative h-44 bg-slate-200 overflow-hidden">
                {p.imagenes[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagenes[0]} alt={p.titulo} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Sin fotos</div>
                )}
                <span className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded">{p.imagenes.length} {p.imagenes.length === 1 ? "foto" : "fotos"}</span>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <h2 className="font-bold text-lg leading-tight">{p.titulo}</h2>
                {p.ubicacion_comuna && <p className="text-sm text-slate-500">{p.ubicacion_comuna}</p>}
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
  const [existentes, setExistentes] = useState<string[]>(proyecto?.imagenes ?? []);
  const [quitar, setQuitar] = useState<number[]>([]);
  const [quitarPortada, setQuitarPortada] = useState(false); // foto externa de obras antiguas (no está en la base de datos)
  const [nuevas, setNuevas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const total = existentes.length + nuevas.length;

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (total + archivos.length > MAX_IMAGENES) return setError(`Un proyecto admite hasta ${MAX_IMAGENES} fotos.`);
    try {
      const listas = await Promise.all(archivos.map(reducirImagen));
      setNuevas((p) => [...p, ...listas]);
      setError("");
    } catch (err: any) {
      setError(err.message || "No se pudo leer la imagen.");
    }
  };

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
      const base = { titulo: titulo.trim(), descripcion: descripcion.trim() || null, ubicacion_comuna: comuna.trim() || null, publicado };
      // Las fotos suben de a pocas por vez: así ninguna solicitud supera el límite de tamaño del servidor.
      const r = proyecto
        ? await fetch(`/api/portafolio/${proyecto.id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify({ ...base, quitar_imagenes: quitar, quitar_portada: quitarPortada }) })
        : await fetch("/api/portafolio", { method: "POST", headers: jsonAuth(), body: JSON.stringify(base) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.message || "No se pudo guardar el proyecto.");
      const id = data.id as number;
      for (let i = 0; i < nuevas.length; i += 2) {
        const rf = await fetch(`/api/portafolio/${id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify({ agregar_imagenes: nuevas.slice(i, i + 2) }) });
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
          <label className={etiqueta} htmlFor="pf-d">Descripción</label>
          <textarea id="pf-d" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} rows={4}
            className="w-full px-3 py-2 text-lg border-2 border-slate-300 rounded-lg" placeholder="Cuente en pocas líneas qué se construyó y con qué materiales." />
        </div>

        <div>
          <label className={etiqueta} htmlFor="pf-i">Fotos ({total} de {MAX_IMAGENES})</label>
          <input id="pf-i" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={elegir} disabled={total >= MAX_IMAGENES} />
          <p className="text-sm text-slate-500 mt-1">La primera foto es la portada. Las fotos se achican solas para que la página cargue rápido.</p>
          {total > 0 && (
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
              {existentes.map((u, i) => (
                <li key={u} className="relative h-20 rounded-lg overflow-hidden bg-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => quitarExistente(u)} aria-label={`Quitar foto ${i + 1}`} className="absolute top-1 right-1 bg-black/70 text-white w-6 h-6 rounded-full text-sm leading-none cursor-pointer !min-h-0">✕</button>
                </li>
              ))}
              {nuevas.map((u, i) => (
                <li key={i} className="relative h-20 rounded-lg overflow-hidden bg-slate-200 ring-2 ring-green-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Foto nueva ${i + 1}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setNuevas((p) => p.filter((_, k) => k !== i))} aria-label={`Quitar foto nueva ${i + 1}`} className="absolute top-1 right-1 bg-black/70 text-white w-6 h-6 rounded-full text-sm leading-none cursor-pointer !min-h-0">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
