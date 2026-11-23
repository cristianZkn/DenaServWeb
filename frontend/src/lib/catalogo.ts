/** Modelos de casa prediseñados que se muestran en el catálogo de la página pública.
 *  Edite este archivo para cambiar nombres, medidas y descripciones. Si tiene una foto del modelo, súbala a `public/img/catalogo/`
 *  y póngala en `imagen` (por ejemplo "/img/catalogo/familia-54.jpg"): reemplaza a la ilustración. */
export interface ModeloCasa {
  id: string;
  nombre: string;
  etiqueta?: string;      // viñeta sobre la imagen
  m2: number;
  dormitorios: number;
  banos: number;
  resumen: string;
  ideal: string;
  incluye: string[];
  imagen?: string;
  personalizado?: boolean; // tarjeta «a medida»: se dibuja como plano
}

export const MODELOS: ModeloCasa[] = [
  {
    id: "hogar-36", nombre: "Modelo Hogar", m2: 36, dormitorios: 1, banos: 1,
    resumen: "Compacta y eficiente: un dormitorio, living-comedor integrado y baño. Se arma rápido y es fácil de ampliar más adelante.",
    ideal: "Primera vivienda, casa de visitas o segunda vivienda.",
    incluye: ["Estructura de pino impregnado", "Cubierta de zinc", "Ventanas de aluminio"],
  },
  {
    id: "familia-54", nombre: "Modelo Familia", etiqueta: "Más consultado", m2: 54, dormitorios: 2, banos: 1,
    resumen: "El equilibrio entre espacio y presupuesto: dos dormitorios, cocina y living amplios y buena iluminación natural.",
    ideal: "Parejas con hijos o familias que quieren su casa propia.",
    incluye: ["Revestimiento exterior a elección", "Aleros y tapacanes", "Forro interior terminado"],
  },
  {
    id: "confort-72", nombre: "Modelo Confort", m2: 72, dormitorios: 3, banos: 2,
    resumen: "Tres dormitorios y dos baños, con espacios sociales generosos y más terminaciones para vivir con holgura.",
    ideal: "Familias grandes o quienes buscan más terminaciones.",
    incluye: ["Aislación y membrana hidrófuga", "Puertas y marcos de calidad", "Terminaciones personalizables"],
  },
  {
    id: "a-medida", nombre: "Proyecto a medida", etiqueta: "Personalizado", m2: 0, dormitorios: 0, banos: 0, personalizado: true,
    resumen: "¿Tiene un plano propio o una idea distinta? Adaptamos el diseño a su terreno, sus metros cuadrados y su presupuesto.",
    ideal: "Quienes buscan algo distinto a los modelos del catálogo.",
    incluye: ["Diseño según su terreno", "Cotización detallada", "Materiales a su elección"],
  },
];
