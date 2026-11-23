"use client";

import { useEffect, useState } from "react";

const sinMovimiento = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** false en el primer dibujo y true un instante después: permite que las barras «crezcan» desde cero con una transición CSS. */
export function useMontado(retardo = 60) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setListo(true), sinMovimiento() ? 0 : retardo);
    return () => window.clearTimeout(t);
  }, [retardo]);
  return listo;
}

/** Número que sube desde 0 hasta `objetivo` (con frenado suave al final). */
export function useContador(objetivo: number, ms = 900) {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    let id = 0;
    const t0 = performance.now();
    const duracion = sinMovimiento() || !Number.isFinite(objetivo) ? 1 : ms;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / duracion);
      setValor(Math.round(objetivo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [objetivo, ms]);
  return valor;
}

/** Muestra un número animado (para usar donde un hook no cabe, como dentro de un map). */
export function Contador({ valor, ms }: { valor: number; ms?: number }) {
  return <>{useContador(valor, ms)}</>;
}
