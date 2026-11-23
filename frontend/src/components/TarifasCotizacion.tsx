"use client";

import { errorAjuste, type AjusteTarifa } from "@/lib/tarifas";

const fmt = (a: AjusteTarifa, n: number) => (a.dinero ? `$${Math.round(n).toLocaleString("es-CL")}` : n.toLocaleString("es-CL", { maximumFractionDigits: 2 }));

/** Ajuste opcional de tarifas para UNA cotización: cada fila muestra el valor vigente y, si se escribe otro, solo esta cotización lo usa.
 *  Dejarlo vacío (o «Usar la vigente») mantiene la tarifa de la sección Tarifas, que sigue su propio camino. */
export default function TarifasCotizacion({ ajustes, vigentes, valores, onCambiar }: {
  ajustes: AjusteTarifa[]; vigentes: Record<string, number>; valores: Record<string, string>; onCambiar: (clave: string, texto: string) => void;
}) {
  const personalizada = (a: AjusteTarifa) => (valores[a.clave] ?? "").trim() !== "" && !errorAjuste(a, valores[a.clave]) && Number(valores[a.clave]) !== vigentes[a.clave];
  const cuantas = ajustes.filter(personalizada).length;

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5" open={cuantas > 0}>
      <summary className="cursor-pointer text-base sm:text-lg font-bold text-slate-800 flex flex-wrap items-center gap-2">
        Ajustar tarifas de esta cotización <span className="text-sm font-semibold text-slate-500">(opcional)</span>
        {cuantas > 0 && <span className="rounded-full bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200 px-2.5 py-0.5 text-xs font-bold">{cuantas} personalizada{cuantas === 1 ? "" : "s"}</span>}
      </summary>
      <p className="mt-3 text-sm text-slate-600">
        Cada tarifa viene con el valor vigente de la sección Tarifas. Si en esta obra se cobra distinto, escriba el valor: solo esta cotización lo usa
        y las demás siguen con la tarifa vigente.
      </p>
      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        {ajustes.map((a) => {
          const error = errorAjuste(a, valores[a.clave] ?? "");
          const propia = personalizada(a);
          const id = `ajuste-${a.clave}`;
          return (
            <div key={a.clave} className={`rounded-lg border p-3 ${propia ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white"}`}>
              <label htmlFor={id} className="block text-sm font-bold text-slate-800">{a.etiqueta}</label>
              <p className="text-xs text-slate-500 mb-2">{a.ayuda}</p>
              <div className="flex items-center gap-2">
                <input id={id} type="number" inputMode="decimal" min={a.min} max={a.max} step={a.entero ? 1 : a.dinero ? 100 : "any"}
                  value={valores[a.clave] ?? ""} placeholder={vigentes[a.clave] !== undefined ? String(vigentes[a.clave]) : "—"}
                  onFocus={(e) => e.target.select()} onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  onChange={(e) => onCambiar(a.clave, e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
                  className="!w-32 !min-h-0 h-10 px-2 border-2 border-slate-300 rounded-lg" />
                <span className="text-sm text-slate-500">{a.unidad}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">Vigente: <strong className="text-slate-700">{vigentes[a.clave] !== undefined ? fmt(a, vigentes[a.clave]) : "—"}</strong></span>
                {propia && <button type="button" onClick={() => onCambiar(a.clave, "")} className="!min-h-0 font-semibold text-blue-800 hover:underline cursor-pointer">Usar la vigente</button>}
              </div>
              {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
            </div>
          );
        })}
      </div>
    </details>
  );
}
