"use client";

import Icono from "@/components/Icono";
import { useCallback, useEffect, useRef, useState } from "react";
import { ETIQUETAS } from "@/lib/empresa";

export interface Obra {
  id: number;
  titulo: string;
  descripcion: string | null;
  ubicacion_comuna: string | null;
  imagen_url: string | null;
  imagenes: string[];
  etiqueta?: string;
  superficie_m2?: number | null;
  revestimiento?: string | null;
  whatsapp_url: string | null;
}

export const FOTO_POR_DEFECTO = "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&q=80&w=800";
export const fotosDe = (o: Obra) => (o.imagenes?.length ? o.imagenes : [o.imagen_url || FOTO_POR_DEFECTO]);

/** Viñeta ("Nuevo", "Destacado"…) que va sobre la foto. */
export function Vineta({ etiqueta }: { etiqueta?: string }) {
  const e = etiqueta ? ETIQUETAS[etiqueta] : null;
  if (!e) return null;
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black tracking-wide shadow-md ${e.clase}`}>{e.texto}</span>;
}

/** Estado y gestos de un carrusel: flechas, puntos y deslizar con el dedo. */
function useCarrusel(total: number) {
  const [i, setI] = useState(0);
  const x0 = useRef<number | null>(null);
  const ir = useCallback((n: number) => setI(((n % total) + total) % total), [total]);
  return {
    i, ir, sig: () => ir(i + 1), ant: () => ir(i - 1),
    gestos: {
      onTouchStart: (e: React.TouchEvent) => { x0.current = e.touches[0].clientX; },
      onTouchEnd: (e: React.TouchEvent) => {
        if (x0.current === null) return;
        const dx = e.changedTouches[0].clientX - x0.current;
        x0.current = null;
        if (Math.abs(dx) > 40) ir(i + (dx < 0 ? 1 : -1));
      },
    },
  };
}

function Flecha({ lado, onClick, grande }: { lado: "ant" | "sig"; onClick: () => void; grande?: boolean }) {
  return (
    <button
      type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={lado === "ant" ? "Foto anterior" : "Foto siguiente"}
      className={`absolute top-1/2 -translate-y-1/2 ${lado === "ant" ? "left-3" : "right-3"} ${grande ? "h-12 w-12" : "h-9 w-9 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"} !min-h-0 flex items-center justify-center rounded-full bg-black/45 hover:bg-black/70 text-white backdrop-blur transition cursor-pointer`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={lado === "ant" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}

function Puntos({ total, actual, ir }: { total: number; actual: number; ir: (n: number) => void }) {
  return (
    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5" role="tablist" aria-label="Fotos de la obra">
      {Array.from({ length: total }, (_, k) => (
        <button
          key={k} type="button" role="tab" aria-selected={k === actual} aria-label={`Foto ${k + 1}`}
          onClick={(e) => { e.stopPropagation(); ir(k); }}
          className={`!min-h-0 h-1.5 rounded-full transition-all duration-300 cursor-pointer ${k === actual ? "w-6 bg-amber-400" : "w-1.5 bg-white/60 hover:bg-white"}`}
        />
      ))}
    </div>
  );
}

/** Tarjeta de obra en vidrio difuminado: toda ella es clicable (foto, textos y datos) y abre el visor con los detalles y el WhatsApp. */
export function TarjetaObra({ obra, onAbrir }: { obra: Obra; onAbrir: () => void }) {
  const fotos = fotosDe(obra);
  const c = useCarrusel(fotos.length);
  const datos = [obra.superficie_m2 ? `${obra.superficie_m2} m²` : null, obra.revestimiento].filter(Boolean) as string[];
  return (
    <article
      role="button" tabIndex={0} aria-label={`Ver detalles de ${obra.titulo}`} onClick={onAbrir}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onAbrir(); } }}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl cursor-pointer bg-gradient-to-b from-white/15 to-white/5 backdrop-blur-md ring-1 ring-white/20 shadow-xl shadow-black/20 hover:-translate-y-1.5 hover:ring-amber-300/60 hover:shadow-2xl hover:shadow-amber-400/10 transition duration-300"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden" {...c.gestos}>
        <div className="absolute inset-0 flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${c.i * 100}%)` }}>
          {fotos.map((f, k) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f} src={f} alt={`${obra.titulo}, foto ${k + 1} de ${fotos.length}`} loading={k === 0 ? "eager" : "lazy"} decoding="async" className="h-full w-full shrink-0 object-cover transition-transform duration-700 group-hover:scale-105" />
          ))}
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-blue-950/80 to-transparent pointer-events-none" />
        <div className="absolute top-4 left-4"><Vineta etiqueta={obra.etiqueta} /></div>
        {fotos.length > 1 && (
          <span className="absolute top-4 right-4 rounded-full bg-black/50 backdrop-blur text-white text-xs font-bold px-2.5 py-1">{c.i + 1}/{fotos.length}</span>
        )}
        <span aria-hidden className="absolute bottom-3 right-3 rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/30 text-white text-xs font-bold px-3 py-1 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition duration-300">
          Ver detalles
        </span>
        {fotos.length > 1 && <><Flecha lado="ant" onClick={c.ant} /><Flecha lado="sig" onClick={c.sig} /><Puntos total={fotos.length} actual={c.i} ir={c.ir} /></>}
      </div>

      <div className="p-5 sm:p-6 flex-grow flex flex-col gap-3 text-white">
        <div>
          <h3 className="text-xl font-black leading-tight">{obra.titulo}</h3>
          {obra.ubicacion_comuna && <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-blue-200"><Icono nombre="pin" className="h-4 w-4" />{obra.ubicacion_comuna}</p>}
        </div>
        {datos.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Datos de la obra">
            {datos.map((d) => <li key={d} className="rounded-full bg-white/10 ring-1 ring-white/15 text-blue-50 text-xs font-bold px-3 py-1">{d}</li>)}
          </ul>
        )}
        {obra.descripcion && <p className="text-blue-100/90 line-clamp-3">{obra.descripcion}</p>}
      </div>
    </article>
  );
}

/** Visor a pantalla completa: foto grande, miniaturas, flechas del teclado y datos de la obra. */
export function VisorObra({ obra, onCerrar }: { obra: Obra; onCerrar: () => void }) {
  const fotos = fotosDe(obra);
  const c = useCarrusel(fotos.length);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    cerrarRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; previo?.focus(); };
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      else if (e.key === "ArrowRight") c.sig();
      else if (e.key === "ArrowLeft") c.ant();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-blue-950/90 backdrop-blur-sm p-3 sm:p-6 animate-aparecer" role="dialog" aria-modal="true" aria-label={obra.titulo} onClick={onCerrar}>
      <div className="relative w-full max-w-6xl max-h-full overflow-y-auto rounded-3xl bg-gradient-to-br from-blue-900/90 via-blue-950/90 to-blue-900/80 backdrop-blur-xl ring-1 ring-white/20 text-white shadow-2xl shadow-black/40 grid lg:grid-cols-[1.5fr_1fr] animate-subir" onClick={(e) => e.stopPropagation()}>
        <button ref={cerrarRef} type="button" onClick={onCerrar} aria-label="Cerrar galería"
          className="absolute top-3 right-3 z-10 !min-h-0 h-10 w-10 rounded-full bg-black/55 hover:bg-black/80 text-white text-lg cursor-pointer"><Icono nombre="cerrar" className="h-4 w-4 mx-auto" /></button>

        <div className="bg-black/30 flex flex-col">
          <div className="relative aspect-[4/3] lg:aspect-auto lg:flex-1 lg:min-h-[28rem] overflow-hidden" {...c.gestos}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={fotos[c.i]} src={fotos[c.i]} alt={`${obra.titulo}, foto ${c.i + 1} de ${fotos.length}`} className="absolute inset-0 h-full w-full object-contain animate-aparecer" />
            <div className="absolute top-4 left-4"><Vineta etiqueta={obra.etiqueta} /></div>
            {fotos.length > 1 && <><Flecha lado="ant" onClick={c.ant} grande /><Flecha lado="sig" onClick={c.sig} grande /></>}
          </div>
          {fotos.length > 1 && (
            <ul className="flex gap-2 p-3 overflow-x-auto bg-black/30" aria-label="Miniaturas">
              {fotos.map((f, k) => (
                <li key={f} className="shrink-0">
                  <button type="button" onClick={() => c.ir(k)} aria-label={`Ver foto ${k + 1}`} aria-current={k === c.i}
                    className={`!min-h-0 block h-14 w-20 rounded-lg overflow-hidden border-2 transition cursor-pointer ${k === c.i ? "border-amber-400" : "border-transparent opacity-60 hover:opacity-100"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-6 sm:p-8 flex flex-col gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Obra terminada</p>
            <h3 className="mt-1 text-2xl sm:text-3xl font-black text-white leading-tight">{obra.titulo}</h3>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {obra.ubicacion_comuna && <div className="rounded-xl bg-white/10 ring-1 ring-white/10 p-3"><dt className="text-blue-200 font-semibold">Ubicación</dt><dd className="font-black text-white">{obra.ubicacion_comuna}</dd></div>}
            {obra.superficie_m2 ? <div className="rounded-xl bg-white/10 ring-1 ring-white/10 p-3"><dt className="text-blue-200 font-semibold">Superficie</dt><dd className="font-black text-white">{obra.superficie_m2} m²</dd></div> : null}
            {obra.revestimiento && <div className="rounded-xl bg-white/10 ring-1 ring-white/10 p-3 col-span-2"><dt className="text-blue-200 font-semibold">Revestimiento</dt><dd className="font-black text-white">{obra.revestimiento}</dd></div>}
            <div className="rounded-xl bg-white/10 ring-1 ring-white/10 p-3"><dt className="text-blue-200 font-semibold">Fotos</dt><dd className="font-black text-white">{fotos.length}</dd></div>
          </dl>
          {obra.descripcion && <p className="text-blue-100 whitespace-pre-line">{obra.descripcion}</p>}
          <a href={obra.whatsapp_url || "https://wa.me/"} target="_blank" rel="noopener noreferrer"
            className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 transition-colors shadow-md">
            <Icono nombre="mensaje" className="h-5 w-5" /> Consultar por esta obra
          </a>
        </div>
      </div>
    </div>
  );
}
