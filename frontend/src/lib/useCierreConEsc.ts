"use client";

import { useEffect } from "react";

/** Cierra una ventana emergente al pulsar Esc (WCAG: las ventanas deben poder cerrarse con el teclado). */
export function useCierreConEsc(cerrar: () => void) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar]);
}
