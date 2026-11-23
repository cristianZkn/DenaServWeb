"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialogo } from "@/components/ConfirmDialog";
import SelectorFotos from "@/components/SelectorFotos";
import { MODELOS } from "@/lib/catalogo";

const JSON_HDR = { "Content-Type": "application/json" };
const MAX_FOTOS = 10;
const MAX_INCLUYE = 8;

export interface CasaAdmin {
  id: number;
  nombre: string;
  etiqueta: string;
  m2: number;
  dormitorios: number;
  banos: number;
  resumen: string;
  ideal: string;
  incluye: string[];
  personalizado: boolean;
  publicado: boolean;
  orden: number;
  imagenes: string[];
}

/** Catálogo de casas prediseñadas de la página pública: lista, alta, edición, ocultar y eliminar. */
export default function CatalogoAdmin({ onCantidad, onAviso, onError }: { onCantidad: (n: number) => void; onAviso: (m: string) => void; onError: (m: string) => void }) {
  const [casas, setCasas] = useState<CasaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<CasaAdmin | "nueva" | null>(null);
  const { preguntar, dialogo } = useDialogo();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/catalogo-casas/admin/");
      if (r.ok) {
        const d: CasaAdmin[] = await r.json();
        setCasas(d);
        onCantidad(d.length);
      } else onError("No se pudo cargar el catálogo.");
    } catch {
      onError("No hay conexión con el servidor.");
    } finally {
      setCargando(false);
    }
  }, [onCantidad, onError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alternar = async (c: CasaAdmin) => {
    const r = await fetch(`/api/catalogo-casas/${c.id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ publicado: !c.publicado }) });
    if (r.ok) { onAviso(c.publicado ? "La casa se ocultó del catálogo público." : "La casa ya se ve en el catálogo público."); cargar(); }
    else onError("No se pudo cambiar la visibilidad.");
  };

  const eliminar = async (c: CasaAdmin) => {
    if (!(await preguntar({ titulo: "¿Seguro que desea eliminar esta casa?", mensaje: `«${c.nombre}» y sus fotos se eliminarán de forma definitiva.`, peligro: true }))) return;
    const r = await fetch(`/api/catalogo-casas/${c.id}`, { method: "DELETE" });
    if (r.ok) { onAviso("Casa eliminada del catálogo."); cargar(); } else onError("No se pudo eliminar la casa.");
  };

  return (
    <div className="space-y-4">
      {dialogo}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 p-4">
        <p className="mr-auto text-blue-900 max-w-2xl">
          {casas.length === 0
            ? "Mientras no agregue casas aquí, la página pública muestra modelos de ejemplo. Agregue las casas prediseñadas reales de la empresa para reemplazarlos."
            : "Estas casas son las que se muestran en la sección «Catálogo» de la página pública, en el orden indicado."}
        </p>
        <button onClick={() => setEditando("nueva")} className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-5 h-11 rounded-lg shadow-sm cursor-pointer whitespace-nowrap">
          + Agregar casa al catálogo
        </button>
      </div>

      {cargando ? (
        <p className="text-center text-slate-500 py-10 font-semibold">Cargando catálogo...</p>
      ) : casas.length === 0 ? (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Así se ve hoy en la página pública (modelos de ejemplo)</h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 opacity-70">
            {MODELOS.map((m) => (
              <li key={m.id} className="rounded-xl border border-dashed border-slate-300 bg-white p-4">
                <p className="font-bold text-slate-800">{m.nombre}</p>
                <p className="text-sm text-slate-500">{m.personalizado ? "A medida" : `${m.m2} m² · ${m.dormitorios} dorm. · ${m.banos} baño(s)`}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {casas.map((c) => (
            <article key={c.id} className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition duration-300">
              <div className="relative h-44 bg-slate-200 overflow-hidden">
                {c.imagenes[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imagenes[0]} alt={c.nombre} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Sin fotos (se usará una ilustración)</div>
                )}
                {c.etiqueta && <span className="absolute top-2 left-2 rounded-full bg-amber-400 text-blue-950 text-xs font-black px-2.5 py-0.5 shadow">{c.etiqueta}</span>}
                <span className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded">Posición {c.orden}</span>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <h2 className="font-bold text-lg leading-tight">{c.nombre}</h2>
                <p className="text-sm text-slate-500">{c.personalizado ? "Proyecto a medida" : `${c.m2} m² · ${c.dormitorios} dormitorio(s) · ${c.banos} baño(s)`}</p>
                <span className={`self-start px-2 py-0.5 rounded border text-sm font-bold ${c.publicado ? "bg-green-100 text-green-900 border-green-600" : "bg-slate-100 text-slate-700 border-slate-400"}`}>
                  {c.publicado ? "Visible en la web" : "Oculta"}
                </span>
                <div className="mt-auto pt-3 flex flex-wrap gap-2">
                  <button onClick={() => setEditando(c)} className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-800 font-semibold hover:bg-blue-50 cursor-pointer">Editar</button>
                  <button onClick={() => alternar(c)} className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold hover:bg-slate-50 cursor-pointer">{c.publicado ? "Ocultar" : "Publicar"}</button>
                  <button onClick={() => eliminar(c)} className="px-3 py-1.5 rounded-lg text-red-700 font-semibold hover:bg-red-50 cursor-pointer">Eliminar</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editando && (
        <FormularioCasa
          casa={editando === "nueva" ? null : editando}
          siguienteOrden={casas.length ? Math.max(...casas.map((c) => c.orden)) + 1 : 1}
          onCerrar={() => setEditando(null)}
          onGuardado={(m) => { setEditando(null); onAviso(m); cargar(); }}
        />
      )}
    </div>
  );
}

function FormularioCasa({ casa, siguienteOrden, onCerrar, onGuardado }: { casa: CasaAdmin | null; siguienteOrden: number; onCerrar: () => void; onGuardado: (m: string) => void }) {
  const [nombre, setNombre] = useState(casa?.nombre ?? "");
  const [etiqueta, setEtiqueta] = useState(casa?.etiqueta ?? "");
  const [personalizado, setPersonalizado] = useState(casa?.personalizado ?? false);
  const [m2, setM2] = useState(String(casa?.m2 ?? ""));
  const [dormitorios, setDormitorios] = useState(String(casa?.dormitorios ?? ""));
  const [banos, setBanos] = useState(String(casa?.banos ?? ""));
  const [resumen, setResumen] = useState(casa?.resumen ?? "");
  const [ideal, setIdeal] = useState(casa?.ideal ?? "");
  const [incluye, setIncluye] = useState((casa?.incluye ?? []).join("\n"));
  const [orden, setOrden] = useState(String(casa?.orden ?? siguienteOrden));
  const [publicado, setPublicado] = useState(casa?.publicado ?? true);
  const [existentes, setExistentes] = useState<string[]>(casa?.imagenes ?? []);
  const [quitar, setQuitar] = useState<number[]>([]);
  const [nuevas, setNuevas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const lineas = incluye.split("\n").map((l) => l.trim()).filter(Boolean);
    if (nombre.trim().length < 3) return setError("El nombre debe tener al menos 3 letras.");
    if (!personalizado && !(Number(m2) > 0)) return setError("Indique los metros cuadrados de la casa.");
    if (lineas.length > MAX_INCLUYE) return setError(`Escriba hasta ${MAX_INCLUYE} características (una por línea).`);
    setGuardando(true);
    try {
      const base = {
        nombre: nombre.trim(), etiqueta: etiqueta.trim(), personalizado, publicado, orden: Number(orden) || 0,
        m2: personalizado ? 0 : Math.round(Number(m2) || 0), dormitorios: personalizado ? 0 : Math.round(Number(dormitorios) || 0), banos: personalizado ? 0 : Math.round(Number(banos) || 0),
        resumen: resumen.trim(), ideal: ideal.trim(), incluye: lineas,
      };
      const r = casa
        ? await fetch(`/api/catalogo-casas/${casa.id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ ...base, quitar_imagenes: quitar }) })
        : await fetch("/api/catalogo-casas/", { method: "POST", headers: JSON_HDR, body: JSON.stringify(base) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.message || data.detail?.[0]?.msg || "No se pudo guardar la casa.");
      // Las fotos suben de a pocas por vez: así ninguna solicitud supera el límite de tamaño del servidor.
      for (let i = 0; i < nuevas.length; i += 2) {
        const rf = await fetch(`/api/catalogo-casas/${data.id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ agregar_imagenes: nuevas.slice(i, i + 2) }) });
        if (!rf.ok) {
          const d = await rf.json().catch(() => ({}));
          return setError(`La casa se guardó, pero una foto falló: ${d.message || "intente subirla de nuevo editando la casa."}`);
        }
      }
      onGuardado(casa ? "Cambios guardados." : "Casa agregada al catálogo.");
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const lbl = "block text-base font-semibold text-slate-800 mb-1";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="cc-titulo">
      <form onSubmit={guardar} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <h2 id="cc-titulo" className="text-xl font-bold text-slate-900">{casa ? "Editar casa del catálogo" : "Agregar casa al catálogo"}</h2>
        {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md text-sm font-semibold">{error}</div>}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl} htmlFor="cc-n">Nombre del modelo *</label>
            <input id="cc-n" required minLength={3} maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Modelo Familia" />
          </div>
          <div>
            <label className={lbl} htmlFor="cc-e">Viñeta sobre la imagen</label>
            <input id="cc-e" list="cc-etiquetas" maxLength={30} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Ej.: Más consultado (opcional)" />
            <datalist id="cc-etiquetas"><option value="Nuevo" /><option value="Destacado" /><option value="Más consultado" /><option value="Oferta" /></datalist>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="!w-5 !min-h-0" checked={personalizado} onChange={(e) => setPersonalizado(e.target.checked)} />
          <span>Es una tarjeta de «proyecto a medida» (sin metros cuadrados ni dormitorios)</span>
        </label>

        {!personalizado && (
          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl} htmlFor="cc-m">m² *</label><input id="cc-m" type="number" inputMode="numeric" min="1" max="1000" value={m2} onChange={(e) => setM2(e.target.value)} placeholder="54" /></div>
            <div><label className={lbl} htmlFor="cc-d">Dormitorios</label><input id="cc-d" type="number" inputMode="numeric" min="0" max="20" value={dormitorios} onChange={(e) => setDormitorios(e.target.value)} placeholder="2" /></div>
            <div><label className={lbl} htmlFor="cc-b">Baños</label><input id="cc-b" type="number" inputMode="numeric" min="0" max="20" value={banos} onChange={(e) => setBanos(e.target.value)} placeholder="1" /></div>
          </div>
        )}

        <div>
          <label className={lbl} htmlFor="cc-r">Descripción</label>
          <textarea id="cc-r" rows={3} maxLength={600} value={resumen} onChange={(e) => setResumen(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg" placeholder="Cuente en pocas líneas cómo es esta casa." />
        </div>
        <div>
          <label className={lbl} htmlFor="cc-i">Ideal para</label>
          <input id="cc-i" maxLength={200} value={ideal} onChange={(e) => setIdeal(e.target.value)} placeholder="Ej.: Parejas con hijos o primera vivienda" />
        </div>
        <div>
          <label className={lbl} htmlFor="cc-x">Qué incluye (una característica por línea, hasta {MAX_INCLUYE})</label>
          <textarea id="cc-x" rows={4} value={incluye} onChange={(e) => setIncluye(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg" placeholder={"Cubierta de zinc\nVentanas de aluminio\nRevestimiento a elección"} />
        </div>

        <SelectorFotos existentes={existentes} nuevas={nuevas} max={MAX_FOTOS} onError={setError}
          onAgregar={(u) => setNuevas((p) => [...p, ...u])}
          onQuitarNueva={(i) => setNuevas((p) => p.filter((_, k) => k !== i))}
          onQuitarExistente={(url) => { setQuitar((p) => [...p, Number(url.split("/").filter(Boolean).pop())]); setExistentes((p) => p.filter((u) => u !== url)); }} />

        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className={lbl} htmlFor="cc-o">Posición en el catálogo</label>
            <input id="cc-o" type="number" inputMode="numeric" min="0" max="999" value={orden} onChange={(e) => setOrden(e.target.value)} />
            <p className="text-sm text-slate-500 mt-1">Las casas se muestran de menor a mayor número.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-6">
            <input type="checkbox" className="!w-5 !min-h-0" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} />
            <span>Mostrar en la página pública</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onCerrar} className="px-5 h-11 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">Cancelar</button>
          <button type="submit" disabled={guardando} className="px-6 h-11 bg-blue-900 hover:bg-blue-800 text-white font-semibold rounded-lg disabled:opacity-60 cursor-pointer">
            {guardando ? "Guardando…" : "Guardar casa"}
          </button>
        </div>
      </form>
    </div>
  );
}
