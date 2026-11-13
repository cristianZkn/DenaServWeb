"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Opciones de la ventana: `peligro` pinta el botón en rojo (eliminar); `soloAviso` muestra únicamente «Entendido». */
export interface OpcionesDialogo {
  titulo: string;
  mensaje?: string;
  textoConfirmar?: string;
  peligro?: boolean;
  soloAviso?: boolean;
}

/**
 * Reemplaza confirm() y alert() del navegador por una ventana con el diseño del sistema.
 * Uso: const { preguntar, dialogo } = useDialogo();  if (!(await preguntar({...}))) return;  ...  y renderizar {dialogo}.
 */
export function useDialogo() {
  const [opciones, setOpciones] = useState<OpcionesDialogo | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const preguntar = useCallback(
    (o: OpcionesDialogo) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpciones(o);
      }),
    []
  );

  const cerrar = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpciones(null);
  };

  const dialogo = opciones ? <Dialogo {...opciones} onCerrar={cerrar} /> : null;
  return { preguntar, dialogo };
}

function Dialogo({ titulo, mensaje, textoConfirmar, peligro, soloAviso, onCerrar }: OpcionesDialogo & { onCerrar: (ok: boolean) => void }) {
  const botonOk = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    botonOk.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dialogo-titulo"
      aria-describedby={mensaje ? "dialogo-mensaje" : undefined}
      onClick={(e) => e.target === e.currentTarget && onCerrar(false)}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 text-center">
        <div
          aria-hidden
          className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl font-black ${
            peligro ? "bg-red-100 text-red-700" : soloAviso ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-800"
          }`}
        >
          {peligro ? "!" : soloAviso ? "i" : "?"}
        </div>
        <h2 id="dialogo-titulo" className="text-lg font-extrabold text-slate-900">{titulo}</h2>
        {mensaje && <p id="dialogo-mensaje" className="mt-2 text-sm text-slate-600">{mensaje}</p>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-center">
          {!soloAviso && (
            <button type="button" onClick={() => onCerrar(false)} className="sm:flex-1 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer">
              Cancelar
            </button>
          )}
          <button
            ref={botonOk}
            type="button"
            onClick={() => onCerrar(true)}
            className={`sm:flex-1 px-4 py-2.5 rounded-lg font-semibold text-white cursor-pointer ${
              peligro ? "bg-red-700 hover:bg-red-800" : "bg-blue-900 hover:bg-blue-800"
            }`}
          >
            {textoConfirmar || (soloAviso ? "Entendido" : peligro ? "Eliminar" : "Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
