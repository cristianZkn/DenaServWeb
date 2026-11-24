import Icono, { type NombreIcono } from "@/components/Icono";

/** Encabezado común de las pantallas del panel: ícono, título, descripción, resumen en etiquetas y acciones a la derecha. */
export default function EncabezadoPagina({ icono, titulo, descripcion, acciones, resumen }: {
  icono: NombreIcono; titulo: string; descripcion: React.ReactNode; acciones?: React.ReactNode; resumen?: { texto: string; valor: string | number }[];
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-blue-700" />
      <div className="flex flex-wrap items-center gap-4 pl-6 pr-5 py-4 sm:py-5">
        <span aria-hidden className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-blue-800 to-blue-600 text-white flex items-center justify-center shadow-sm"><Icono nombre={icono} className="h-6 w-6" /></span>
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">{titulo}</h1>
          <p className="text-slate-600 mt-0.5 max-w-3xl">{descripcion}</p>
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {resumen && resumen.length > 0 && (
        <ul className="flex flex-wrap gap-2 pl-6 pr-5 pb-4 -mt-1">
          {resumen.map((r) => (
            <li key={r.texto} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {r.texto}: <strong className="text-slate-900 tabular-nums">{r.valor}</strong>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
