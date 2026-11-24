"use client";

import Icono from "@/components/Icono";
import { useCallback, useEffect, useState } from "react";
import { useDialogo } from "@/components/ConfirmDialog";
import { fotoPrivadaADataUrl, reducirImagen } from "@/lib/imagenes";

const JSON_HDR = { "Content-Type": "application/json" };

export interface RegistroBitacora {
  id: number;
  porcentaje: number;
  comentario: string;
  fecha: string;
  usuario: string | null;
  fotos: string[];
}

const MAX_FOTOS = 6;
const etiqueta = "block text-base font-semibold text-slate-800 mb-1";

/** Foto protegida: se descarga con la sesión y se muestra como imagen. */
function FotoPrivada({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fotoPrivadaADataUrl(url).then((d) => vivo && setSrc(d));
    return () => { vivo = false; };
  }, [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-200 animate-pulse" />;
}

/**
 * Bitácora de la obra: cada registro guarda el % de avance alcanzado, un comentario y fotos opcionales (desde el
 * celular o desde archivos). El servidor valida que el avance sea coherente con los pagos registrados.
 */
export default function BitacoraAvance({
  cotizacionId, avanceActual, minimo, maximo, onCambio, onRegistros,
}: {
  cotizacionId: number; avanceActual: number; minimo: number; maximo: number;
  onCambio: () => void; onRegistros?: (r: RegistroBitacora[]) => void;
}) {
  const { preguntar, dialogo } = useDialogo();
  const [registros, setRegistros] = useState<RegistroBitacora[]>([]);
  const [porcentaje, setPorcentaje] = useState(String(Math.max(avanceActual, minimo)));
  const [comentario, setComentario] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/cotizaciones/${cotizacionId}/bitacora`);
    if (r.ok) {
      const datos: RegistroBitacora[] = await r.json();
      setRegistros(datos);
      onRegistros?.(datos);
    }
  }, [cotizacionId, onRegistros]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPorcentaje(String(Math.max(avanceActual, minimo))); }, [avanceActual, minimo]);

  const elegirFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (fotos.length + archivos.length > MAX_FOTOS) return setError(`Cada registro admite hasta ${MAX_FOTOS} fotos.`);
    try {
      const listas = await Promise.all(archivos.map(reducirImagen));
      setFotos((prev) => [...prev, ...listas]);
      setError("");
    } catch (err: any) {
      setError(err.message || "No se pudo leer la imagen.");
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const pct = Number(porcentaje);
    if (!(pct >= 0 && pct <= 100)) return setError("El avance debe estar entre 0 y 100 %.");
    if (comentario.trim().length < 3) return setError("Escriba un comentario sobre el avance (mínimo 3 letras).");
    setGuardando(true);
    try {
      // Las fotos suben de a dos para no superar el límite de tamaño de una solicitud.
      const r = await fetch(`/api/cotizaciones/${cotizacionId}/bitacora`, {
        method: "POST", headers: JSON_HDR,
        body: JSON.stringify({ porcentaje: pct, comentario: comentario.trim(), imagenes: fotos.slice(0, 2) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.message || "No se pudo registrar el avance.");
      for (let i = 2; i < fotos.length; i += 2) {
        const rf = await fetch(`/api/bitacora/${d.id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify({ agregar_imagenes: fotos.slice(i, i + 2) }) });
        if (!rf.ok) {
          setError("El avance se registró, pero una foto no se pudo subir. Intente agregarla de nuevo.");
          break;
        }
      }
      setComentario("");
      setFotos([]);
      await cargar();
      onCambio();
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (reg: RegistroBitacora) => {
    const ok = await preguntar({
      titulo: "¿Seguro que desea eliminar este registro?",
      mensaje: `Se eliminará el registro del ${reg.porcentaje} % con sus fotos. El avance de la obra volverá al del registro anterior.`,
      peligro: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/bitacora/${reg.id}`, { method: "DELETE" });
    if (!r.ok) return setError("No se pudo eliminar el registro.");
    await cargar();
    onCambio();
  };

  const sinPagos = maximo === 0;
  return (
    <div className="space-y-6">
      {dialogo}
      <form onSubmit={guardar} className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <h3 className="text-2xl font-black">Registrar avance de obra</h3>
          <p className="text-base text-slate-600 mt-1">
            Avance actual: <strong>{avanceActual} %</strong>.{" "}
            {sinPagos
              ? "La obra inicia cuando el anticipo (40 %) se paga por completo."
              : `Con los pagos registrados puede informar entre ${Math.max(minimo, avanceActual)} % y ${maximo} %.`}
          </p>
        </div>

        {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md font-semibold">{error}</div>}

        <fieldset disabled={sinPagos || guardando} className="space-y-4 disabled:opacity-60">
          <div>
            <label className={etiqueta} htmlFor="bit-pct">Porcentaje de obra alcanzado: {porcentaje || 0} %</label>
            <input id="bit-pct" type="range" min={Math.max(minimo, avanceActual)} max={maximo} step="1" value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)} className="!p-0 !min-h-0 !border-0 accent-blue-900" />
          </div>
          <div>
            <label className={etiqueta} htmlFor="bit-com">Comentario *</label>
            <textarea id="bit-com" required minLength={3} rows={3} maxLength={1000} value={comentario} onChange={(e) => setComentario(e.target.value)}
              placeholder="Ej.: avance de radier y proceso de levantar vigas" />
          </div>
          <div>
            <label className={etiqueta} htmlFor="bit-fotos">Fotos (opcional, hasta {MAX_FOTOS})</label>
            <input id="bit-fotos" type="file" accept="image/*" multiple onChange={elegirFotos} disabled={fotos.length >= MAX_FOTOS} />
            <p className="text-sm text-slate-500 mt-1">Desde el celular puede tomar la foto en el momento o elegirla de la galería. Se achican solas al subirlas.</p>
            {fotos.length > 0 && (
              <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                {fotos.map((f, i) => (
                  <li key={i} className="relative h-20 rounded-lg overflow-hidden bg-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt={`Foto nueva ${i + 1}`} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setFotos((p) => p.filter((_, k) => k !== i))} aria-label={`Quitar foto ${i + 1}`}
                      className="absolute top-1 right-1 bg-black/70 text-white w-6 h-6 rounded-full text-sm leading-none cursor-pointer !min-h-0"><Icono nombre="cerrar" className="h-4 w-4 mx-auto" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" className="px-6 py-3 rounded-xl text-lg font-bold shadow cursor-pointer disabled:opacity-50 bg-blue-900 text-white hover:bg-blue-800">
            {guardando ? "Guardando..." : "Registrar avance"}
          </button>
        </fieldset>
      </form>

      <section className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4" aria-labelledby="hist-bit">
        <h3 id="hist-bit" className="text-2xl font-black">Historial de la bitácora ({registros.length})</h3>
        {registros.length === 0 ? (
          <p className="text-base text-slate-500">Aún no hay registros de avance.</p>
        ) : (
          <ol className="space-y-4">
            {registros.map((r) => (
              <li key={r.id} className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-extrabold text-sm">{r.porcentaje} % de obra</span>
                    <div className="text-sm text-slate-500 mt-1">
                      {new Date(r.fecha).toLocaleDateString("es-CL")}{r.usuario ? ` · ${r.usuario}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => eliminar(r)} className="!min-h-0 text-sm font-semibold text-red-700 hover:underline cursor-pointer">Eliminar</button>
                </div>
                <p className="mt-2 text-base text-slate-800 whitespace-pre-line">{r.comentario}</p>
                {r.fotos.length > 0 && (
                  <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                    {r.fotos.map((f, i) => (
                      <li key={f} className="h-20 rounded-lg overflow-hidden bg-slate-200"><FotoPrivada url={f} alt={`Foto ${i + 1} del registro`} /></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
