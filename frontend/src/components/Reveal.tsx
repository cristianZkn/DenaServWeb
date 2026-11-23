"use client";

import { useEffect, useRef, useState } from "react";

/** true cuando el elemento entra en pantalla por primera vez (se queda en true: la animación no se repite). */
export function useVisible<T extends HTMLElement>(umbral = 0.15) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: umbral });
    obs.observe(el);
    return () => obs.disconnect();
  }, [umbral]);
  return { ref, visible };
}

/** Hace aparecer su contenido (fundido + subida suave) cuando se llega a él al bajar por la página. */
export default function Reveal({ children, delay = 0, desde = "abajo", className = "" }: {
  children: React.ReactNode; delay?: number; desde?: "abajo" | "izquierda" | "derecha" | "escala"; className?: string;
}) {
  const { ref, visible } = useVisible<HTMLDivElement>();
  const oculto = { abajo: "translate-y-8", izquierda: "-translate-x-8", derecha: "translate-x-8", escala: "scale-95" }[desde];
  return (
    <div ref={ref} style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${visible ? "opacity-100 translate-x-0 translate-y-0 scale-100" : `opacity-0 ${oculto}`} ${className}`}>
      {children}
    </div>
  );
}

/** Texto con efecto de marcador: el subrayado de color se dibuja de izquierda a derecha cuando el texto entra en pantalla. */
export function Resaltado({ children, tono = "claro", retraso = 0 }: { children: React.ReactNode; tono?: "claro" | "oscuro"; retraso?: number }) {
  const { ref, visible } = useVisible<HTMLSpanElement>(0.6);
  const color = tono === "oscuro" ? "rgb(251 191 36 / 0.45)" : "rgb(252 211 77 / 0.75)";
  return (
    <span ref={ref} className={`font-bold ${tono === "oscuro" ? "text-white" : "text-blue-900"} bg-no-repeat bg-left-bottom transition-[background-size] duration-[900ms] ease-out motion-reduce:transition-none`}
      style={{ backgroundImage: `linear-gradient(${color}, ${color})`, backgroundSize: `${visible ? 100 : 0}% 42%`, transitionDelay: `${retraso}ms` }}>
      {children}
    </span>
  );
}
