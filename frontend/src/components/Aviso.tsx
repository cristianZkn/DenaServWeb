"use client";

import { useEffect, useRef, useState } from "react";

/** Aviso de éxito que se muestra unos segundos («Usuario registrado correctamente.») y luego se oculta solo. */
export function useAviso(ms = 6000) {
  const [texto, setTexto] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const mostrar = (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    setTexto(t);
    timer.current = setTimeout(() => setTexto(""), ms);
  };
  return { texto, mostrar };
}

export default function Aviso({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-900">
      <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-sm text-white">✓</span>
      {texto}
    </div>
  );
}
