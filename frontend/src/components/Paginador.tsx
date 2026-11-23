"use client";

/** Paginación reutilizable: «Mostrando 11–20 de 56», selector de filas y botones anterior / siguiente con números. */
export default function Paginador({ total, pagina, porPagina, onPagina, onPorPagina, opciones = [10, 20, 50] }: {
  total: number; pagina: number; porPagina: number; onPagina: (p: number) => void; onPorPagina?: (n: number) => void; opciones?: number[];
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(pagina, paginas);
  const desde = total === 0 ? 0 : (actual - 1) * porPagina + 1;
  const hasta = Math.min(total, actual * porPagina);

  // Números visibles: primera, última y las vecinas de la actual, con «…» en los saltos.
  const numeros: (number | "…")[] = [];
  for (let p = 1; p <= paginas; p++) {
    if (p === 1 || p === paginas || Math.abs(p - actual) <= 1) numeros.push(p);
    else if (numeros[numeros.length - 1] !== "…") numeros.push("…");
  }

  const boton = "!min-h-0 h-9 min-w-9 px-3 rounded-lg border text-sm font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
      <div className="flex items-center gap-3">
        <span>Mostrando <strong className="text-slate-900">{desde}–{hasta}</strong> de <strong className="text-slate-900">{total}</strong></span>
        {onPorPagina && (
          <label className="flex items-center gap-1.5">
            <span className="sr-only sm:not-sr-only">Filas</span>
            <select value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))} aria-label="Filas por página"
              className="!min-h-0 !h-9 !w-auto !py-0 !px-2 text-sm">
              {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        )}
      </div>
      {paginas > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onPagina(actual - 1)} disabled={actual === 1} className={`${boton} border-slate-300 hover:bg-slate-50`} aria-label="Página anterior">‹</button>
          {numeros.map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-400" aria-hidden>…</span>
            ) : (
              <button key={n} type="button" onClick={() => onPagina(n)} aria-current={n === actual ? "page" : undefined}
                className={`${boton} ${n === actual ? "bg-blue-900 border-blue-900 text-white" : "border-slate-300 hover:bg-slate-50"}`}>{n}</button>
            )
          )}
          <button type="button" onClick={() => onPagina(actual + 1)} disabled={actual === paginas} className={`${boton} border-slate-300 hover:bg-slate-50`} aria-label="Página siguiente">›</button>
        </div>
      )}
    </nav>
  );
}
