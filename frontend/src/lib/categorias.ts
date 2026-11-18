/** Categorías de materiales: las originales y las que corresponden al presupuesto de referencia (por etapa de la obra). */
export const CATEGORIAS: { key: string; label: string }[] = [
  { key: "TECHUMBRE", label: "Techumbre" },
  { key: "REVESTIMIENTO", label: "Revestimiento" },
  { key: "TABIQUERIA", label: "Tabiquería" },
  { key: "BASE_RADIER", label: "Base / Radier" },
  { key: "INSUMO", label: "Otros insumos" },
  { key: "BASE_TERRENO", label: "Bases (precio manual)" },
  // Presupuesto de referencia (partidas globales de una casa de 60 m²)
  { key: "RADIER_CASA", label: "Radier de la casa" },
  { key: "RADIER_ADICIONAL", label: "Radier adicional" },
  { key: "TABIQUES", label: "Fabricación de tabiques" },
  { key: "ESTRUCTURA_TECHO", label: "Cerchas y estructura de techo" },
  { key: "FORRO_EXTERIOR", label: "Forro exterior" },
  { key: "ALEROS", label: "Tapacán, tapa regla y aleros" },
  { key: "FORRO_INTERIOR", label: "Forro interior y marcos" },
  { key: "VENTANAS_PUERTAS", label: "Ventanas y puertas" },
  { key: "SERVICIOS", label: "Servicios y traslados" },
];

export const etiquetaCategoria = (key: string) => CATEGORIAS.find((c) => c.key === key)?.label ?? key;
