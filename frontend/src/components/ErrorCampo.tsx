"use client";

import { useState } from "react";

/** Mensaje de error bajo un campo. Todos los formularios validan de la misma forma: el campo se marca en rojo y este texto explica qué corregir. */
export default function ErrorCampo({ id, texto }: { id: string; texto?: string }) {
  return texto ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-semibold text-red-700">{texto}</p> : null;
}

/** Errores por campo (clave = id del campo). `fallar` los fija y lleva el foco al primero; `props` marca el campo; `limpiar` quita el error al corregirlo. */
export function useErrores() {
  const [errores, setErrores] = useState<Record<string, string>>({});
  const limpiar = (id: string) => setErrores((prev) => {
    if (!(id in prev)) return prev;
    const resto = { ...prev };
    delete resto[id];
    return resto;
  });
  /** true si hay errores (y entonces el formulario no debe enviarse). */
  const fallar = (nuevos: Record<string, string>) => {
    setErrores(nuevos);
    const primero = Object.keys(nuevos)[0];
    if (primero) document.getElementById(primero)?.focus();
    return Object.keys(nuevos).length > 0;
  };
  const props = (id: string) => ({ id, "aria-invalid": errores[id] ? true : undefined, "aria-describedby": errores[id] ? `${id}-error` : undefined });
  return { errores, limpiar, fallar, props };
}
