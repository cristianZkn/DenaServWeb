"use client";

import { reducirImagen } from "@/lib/imagenes";

/** Selector de fotos para los formularios del portafolio: muestra las ya guardadas y las nuevas, con botón para quitar cada una.
 *  Las fotos nuevas se achican en el navegador antes de enviarse. El estado vive en el formulario que lo usa. */
export default function SelectorFotos({ existentes, nuevas, max, onAgregar, onQuitarExistente, onQuitarNueva, onError }: {
  existentes: string[]; nuevas: string[]; max: number;
  onAgregar: (urls: string[]) => void; onQuitarExistente: (url: string) => void; onQuitarNueva: (i: number) => void; onError: (m: string) => void;
}) {
  const total = existentes.length + nuevas.length;

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (total + archivos.length > max) return onError(`Se admiten hasta ${max} fotos.`);
    try {
      onAgregar(await Promise.all(archivos.map(reducirImagen)));
      onError("");
    } catch (err: any) {
      onError(err.message || "No se pudo leer la imagen.");
    }
  };

  const quitar = "absolute top-1 right-1 bg-black/70 hover:bg-black text-white w-6 h-6 rounded-full text-sm leading-none cursor-pointer !min-h-0";
  return (
    <div>
      <label className="block text-base font-semibold text-slate-800 mb-1" htmlFor="sf-i">Fotos ({total} de {max})</label>
      <input id="sf-i" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={elegir} disabled={total >= max} />
      <p className="text-sm text-slate-500 mt-1">La primera foto es la portada. Las fotos se achican solas para que la página cargue rápido.</p>
      {total > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
          {existentes.map((u, i) => (
            <li key={u} className="relative h-20 rounded-lg overflow-hidden bg-slate-200 ring-1 ring-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-amber-400 px-1.5 text-[10px] font-black text-blue-950">Portada</span>}
              <button type="button" onClick={() => onQuitarExistente(u)} aria-label={`Quitar foto ${i + 1}`} className={quitar}>✕</button>
            </li>
          ))}
          {nuevas.map((u, i) => (
            <li key={i} className="relative h-20 rounded-lg overflow-hidden bg-slate-200 ring-2 ring-green-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Foto nueva ${i + 1}`} className="w-full h-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-green-600 px-1.5 text-[10px] font-black text-white">Nueva</span>
              <button type="button" onClick={() => onQuitarNueva(i)} aria-label={`Quitar foto nueva ${i + 1}`} className={quitar}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
