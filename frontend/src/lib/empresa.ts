/** Datos públicos de contacto de la empresa (se muestran en la sección «Contacto» y en los botones de WhatsApp). */
export const FACEBOOK_URL = "https://www.facebook.com/danielenrique.navarretearaneda?locale=es_LA";
export const CORREO = "dnavarretea@gmail.com";
export const WHATSAPP_GENERAL = "https://wa.me/56988993703"; // +56 9 8899 3703

export const REDES = [
  { clave: "facebook", nombre: "Facebook", descripcion: "Novedades, obras entregadas y comentarios de clientes.", cta: "Visitar nuestro perfil", url: FACEBOOK_URL },
  { clave: "whatsapp", nombre: "WhatsApp", descripcion: "Cuéntenos su proyecto y reciba respuesta directa.", cta: "+56 9 8899 3703", url: WHATSAPP_GENERAL },
  { clave: "correo", nombre: "Correo", descripcion: "Escríbanos para cotizaciones y consultas.", cta: CORREO, url: `mailto:${CORREO}` },
] as const;

/** Viñetas que se muestran sobre las fotos de cada obra. */
export const ETIQUETAS: Record<string, { texto: string; clase: string }> = {
  NUEVO: { texto: "Nuevo", clase: "bg-emerald-500 text-white" },
  DESTACADO: { texto: "Destacado", clase: "bg-amber-400 text-blue-950" },
  ENTREGADO: { texto: "Entregado", clase: "bg-white text-blue-900" },
  EN_CONSTRUCCION: { texto: "En construcción", clase: "bg-sky-500 text-white" },
};
