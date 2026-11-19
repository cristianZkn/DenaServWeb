"use client";

import { useEffect } from "react";

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Marca en rojo los campos obligatorios vacíos o inválidos de cualquier formulario y quita la marca al corregirlos. */
export default function ValidacionVisual() {
  useEffect(() => {
    // `invalid` no burbujea, por eso se escucha en la fase de captura del documento.
    const marcar = (e: Event) => (e.target as Campo).setAttribute("aria-invalid", "true");
    const limpiar = (e: Event) => {
      const c = e.target as Campo;
      if (c.getAttribute?.("aria-invalid") === "true" && c.validity?.valid) c.removeAttribute("aria-invalid");
    };
    document.addEventListener("invalid", marcar, true);
    document.addEventListener("input", limpiar, true);
    document.addEventListener("change", limpiar, true);
    return () => {
      document.removeEventListener("invalid", marcar, true);
      document.removeEventListener("input", limpiar, true);
      document.removeEventListener("change", limpiar, true);
    };
  }, []);
  return null;
}
