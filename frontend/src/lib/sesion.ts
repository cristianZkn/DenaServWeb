/** La sesión vive en una cookie httpOnly (no en localStorage): solo el servidor de Next.js puede leerla. */
export const COOKIE_SESION = "denaserv_sesion";
export const DURACION_SESION = 60 * 60 * 12; // 12 horas, igual que el token del backend
export const opcionesCookie = {
  httpOnly: true, // el JavaScript de la página no puede leerla (protege la sesión ante XSS)
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, // el navegador no la envía en peticiones POST iniciadas desde otros sitios (CSRF)
  path: "/",
};
