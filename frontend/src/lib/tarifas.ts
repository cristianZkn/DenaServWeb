/** Tarifas del cálculo que se pueden cambiar solo para una cotización (espejo de calculo.TARIFAS_POR_COTIZACION del servidor).
 *  La ganancia por m² se maneja con su propio campo; el resto del cálculo se cambia únicamente en la sección Tarifas. */
export interface AjusteTarifa {
  clave: string;
  etiqueta: string;
  unidad: string;
  ayuda: string;
  dinero: boolean;
  entero?: boolean;
  min: number;
  max: number;
}

export const AJUSTE_MANO_OBRA: AjusteTarifa = {
  clave: "mano_obra_m2", etiqueta: "Mano de obra de la casa", unidad: "$ por m² y por trabajador", dinero: true, min: 0, max: 10_000_000,
  ayuda: "Lo que se le paga a cada trabajador por cada m² de casa.",
};
export const AJUSTE_VIGAS: AjusteTarifa = {
  clave: "mo_viga_vista_m2", etiqueta: "Vigas a la vista", unidad: "$ por m² y por trabajador", dinero: true, min: 0, max: 10_000_000,
  ayuda: "Adicional por cada m² con vigas a la vista, a cada trabajador.",
};
export const AJUSTE_DIAS_RADIER: AjusteTarifa = {
  clave: "dias_fabricacion_radier", etiqueta: "Días de fabricación del radier o base", unidad: "días", dinero: false, entero: true, min: 0, max: 365,
  ayuda: "Se suman a los días de traslado de los maestros cuando el terreno no tiene radier ni base.",
};
export const AJUSTE_RENDIMIENTO: AjusteTarifa = {
  clave: "km_por_litro", etiqueta: "Rendimiento del vehículo", unidad: "km por litro", dinero: false, min: 0.1, max: 100,
  ayuda: "Kilómetros que rinde un litro; define los litros de cada traslado.",
};
/** Solo en el cotizador: se guarda en el campo de ganancia de la cotización, no en las tarifas personalizadas. */
export const AJUSTE_GANANCIA: AjusteTarifa = {
  clave: "ganancia_m2", etiqueta: "Margen de la empresa", unidad: "$ por m²", dinero: true, min: 0, max: 100_000_000,
  ayuda: "Ganancia de la empresa por cada m² construido.",
};

/** Mensaje de error de un valor escrito (vacío = usa la tarifa vigente, sin error). */
export function errorAjuste(a: AjusteTarifa, texto: string): string {
  if (texto.trim() === "") return "";
  const v = Number(texto);
  const rango = `entre ${a.min.toLocaleString("es-CL")} y ${a.max.toLocaleString("es-CL")}`;
  if (!Number.isFinite(v) || v < a.min || v > a.max) return `«${a.etiqueta}» debe estar ${rango}.`;
  if (a.entero && !Number.isInteger(v)) return `«${a.etiqueta}» debe ser un número entero.`;
  return "";
}

/** Valores escritos -> solo los válidos que difieren de la tarifa vigente (iguales a la vigente no se congelan en la cotización). */
export function tarifasPersonalizadas(valores: Record<string, string>, vigentes: Record<string, number>, ajustes: AjusteTarifa[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of ajustes) {
    const t = valores[a.clave] ?? "";
    if (t.trim() === "" || errorAjuste(a, t)) continue;
    if (Number(t) !== vigentes[a.clave]) out[a.clave] = Number(t);
  }
  return out;
}

/** Tarifas guardadas en una cotización -> textos para los campos del formulario. */
export const valoresDesde = (tarifas: Record<string, number> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(tarifas ?? {}).map(([k, v]) => [k, String(v)]));
