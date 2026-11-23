const TONOS = {
  verde: "bg-green-100 text-green-800 ring-green-200",
  gris: "bg-slate-100 text-slate-600 ring-slate-200",
  ambar: "bg-amber-100 text-amber-800 ring-amber-200",
  rojo: "bg-red-100 text-red-800 ring-red-200",
  azul: "bg-blue-100 text-blue-800 ring-blue-200",
};

/** Etiqueta de estado con el mismo aspecto en todas las listas (Activo, Inactivo, Sin verificar…). */
export default function Insignia({ tono, children, titulo }: { tono: keyof typeof TONOS; children: React.ReactNode; titulo?: string }) {
  return <span title={titulo} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset whitespace-nowrap ${TONOS[tono]}`}>{children}</span>;
}
