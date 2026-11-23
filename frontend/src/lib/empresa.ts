/** Datos públicos de la empresa. Los enlaces de redes se configuran con variables NEXT_PUBLIC_* (en Vercel) y, mientras no
 *  estén, la tarjeta de esa red aparece como «Próximamente» en vez de apuntar a una página inventada. */
export const REDES = [
  { clave: "instagram", nombre: "Instagram", descripcion: "Fotos de obras y avances día a día.", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "" },
  { clave: "facebook", nombre: "Facebook", descripcion: "Novedades, obras entregadas y comentarios de clientes.", url: process.env.NEXT_PUBLIC_FACEBOOK_URL || "" },
  { clave: "whatsapp", nombre: "WhatsApp", descripcion: "Cuéntenos su proyecto y reciba respuesta directa.", url: process.env.NEXT_PUBLIC_WHATSAPP_URL || "" },
  { clave: "correo", nombre: "Correo", descripcion: "Escríbanos para cotizaciones y consultas.", url: process.env.NEXT_PUBLIC_CORREO ? `mailto:${process.env.NEXT_PUBLIC_CORREO}` : "" },
] as const;

export const WHATSAPP_GENERAL = process.env.NEXT_PUBLIC_WHATSAPP_URL || "";

/** Viñetas que se muestran sobre las fotos de cada obra. */
export const ETIQUETAS: Record<string, { texto: string; clase: string }> = {
  NUEVO: { texto: "Nuevo", clase: "bg-emerald-500 text-white" },
  DESTACADO: { texto: "Destacado", clase: "bg-amber-400 text-blue-950" },
  ENTREGADO: { texto: "Entregado", clase: "bg-white text-blue-900" },
  EN_CONSTRUCCION: { texto: "En construcción", clase: "bg-sky-500 text-white" },
};
