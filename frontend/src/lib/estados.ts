/**
 * Estados de un proyecto. Se guardan como BORRADOR / ACEPTADA / FINALIZADA y se muestran con estos nombres.
 * Cambian solos con los pagos: Cotizado → En ejecución (cuando el anticipo del 40 % está pagado por completo) → Obra terminada (todos pagados).
 */
export const ESTADOS_PROYECTO = [
  { key: "BORRADOR", label: "Cotizado", plural: "Cotizados", clase: "bg-amber-50 text-amber-800 border-amber-300" },
  { key: "ACEPTADA", label: "En ejecución", plural: "En ejecución", clase: "bg-green-50 text-green-800 border-green-300" },
  { key: "FINALIZADA", label: "Obra terminada", plural: "Terminados", clase: "bg-blue-50 text-blue-800 border-blue-300" },
] as const;

export const etiquetaEstado = (estado: string) => ESTADOS_PROYECTO.find((e) => e.key === estado)?.label ?? estado;
export const claseEstado = (estado: string) => ESTADOS_PROYECTO.find((e) => e.key === estado)?.clase ?? "bg-slate-50 text-slate-700 border-slate-300";
