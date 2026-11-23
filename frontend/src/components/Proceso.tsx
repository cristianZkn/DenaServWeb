"use client";

import { useEffect, useRef, useState } from "react";

const PASOS = [
  { titulo: "Visita y cotización", texto: "Conversamos su idea, vemos el terreno y le entregamos una cotización detallada.", etiqueta: "Paso 1",
    icono: "M9 12l2 2 4-4M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" },
  { titulo: "Acuerdo y anticipo", texto: "Con el contrato firmado y el anticipo del 40 %, comienza la obra.", etiqueta: "Paso 2",
    icono: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4" },
  { titulo: "Construcción con seguimiento", texto: "Avanzamos por etapas y le mostramos el progreso con fotos.", etiqueta: "Paso 3",
    icono: "M3 21h18M5 21V10l7-6 7 6v11M10 21v-6h4v6" },
  { titulo: "Entrega", texto: "Revisamos juntos la obra terminada y se cancela el saldo final.", etiqueta: "Paso 4",
    icono: "M21 11.5l-9-8-9 8M5 10v10h14V10M9.5 14.5l2 2 3.5-4" },
];

/** Línea de tiempo: al llegar a la sección la línea se dibuja y los pasos aparecen uno tras otro; luego un foco recorre los pasos. */
export default function Proceso() {
  const ref = useRef<HTMLOListElement>(null);
  const [visible, setVisible] = useState(false);   // ya se llegó a la sección alguna vez (dibuja la línea y muestra los pasos)
  const [enVista, setEnVista] = useState(false);   // la sección está ahora en pantalla (solo entonces gira el foco)
  const [foco, setFoco] = useState(0);
  const [pausa, setPausa] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { setEnVista(e.isIntersecting); if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!enVista || pausa || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setFoco((f) => (f + 1) % PASOS.length), 3200);
    return () => window.clearInterval(t);
  }, [enVista, pausa]);

  return (
    <ol ref={ref} className="relative mt-14 grid lg:grid-cols-4 gap-x-6 gap-y-10">
      {/* Línea que se dibuja: horizontal en pantallas anchas, vertical en celular */}
      <span aria-hidden className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-0.5 rounded-full bg-slate-200 overflow-hidden">
        <span className={`block h-full origin-left bg-gradient-to-r from-amber-400 via-blue-400 to-blue-700 transition-transform duration-[2000ms] ease-out ${visible ? "scale-x-100" : "scale-x-0"}`} />
      </span>
      <span aria-hidden className="lg:hidden absolute left-7 top-7 bottom-7 w-0.5 -translate-x-1/2 rounded-full bg-slate-200 overflow-hidden">
        <span className={`block w-full h-full origin-top bg-gradient-to-b from-amber-400 to-blue-700 transition-transform duration-[2000ms] ease-out ${visible ? "scale-y-100" : "scale-y-0"}`} />
      </span>

      {PASOS.map((p, i) => {
        const activo = visible && foco === i;
        return (
          <li key={p.titulo} onMouseEnter={() => { setPausa(true); setFoco(i); }} onMouseLeave={() => setPausa(false)}
            style={{ transitionDelay: visible ? `${300 + i * 350}ms` : "0ms" }}
            className={`relative pl-20 lg:pl-0 lg:pt-20 transition-all duration-700 ease-out motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {/* Nodo con ícono sobre la línea */}
            <span className={`absolute left-0 top-0 lg:left-1/2 lg:-translate-x-1/2 flex h-14 w-14 items-center justify-center rounded-full ring-4 ring-slate-50 transition-all duration-500 ${
              activo ? "bg-amber-400 text-blue-950 scale-110 animate-pulso-anillo" : "bg-blue-900 text-white"}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={p.icono} /></svg>
            </span>

            <div className={`relative overflow-hidden rounded-2xl p-6 lg:text-center ring-1 transition-all duration-500 ${
              activo ? "bg-white ring-amber-300 shadow-xl shadow-amber-500/10 -translate-y-1.5" : "bg-white/70 ring-slate-200 shadow-sm"}`}>
              {/* Número grande de fondo */}
              <span aria-hidden className={`pointer-events-none absolute -right-2 -top-5 text-8xl font-black select-none transition-colors duration-500 ${activo ? "text-amber-100" : "text-slate-100"}`}>{i + 1}</span>
              <p className="relative text-xs font-bold uppercase tracking-widest text-amber-600">{p.etiqueta}</p>
              <h3 className="relative mt-1 text-lg font-extrabold text-blue-900">{p.titulo}</h3>
              <p className="relative mt-2 text-sm text-slate-600">{p.texto}</p>
              <span aria-hidden className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r from-amber-400 to-blue-500 transition-all duration-500 ${activo ? "w-full" : "w-0"}`} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
