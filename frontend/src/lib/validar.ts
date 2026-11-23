// Validaciones de datos de contacto chilenos (espejo de backend/core/validadores.py).

/** Da formato 12.345.678-5 mientras se escribe. Solo admite números; la K únicamente puede ser el dígito verificador (el último). */
export function formatearRut(valor: string): string {
  const limpio = valor.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (limpio.length <= 1) return limpio === "K" ? "" : limpio;
  const cuerpo = limpio.slice(0, -1).replace(/K/g, "");
  const dv = limpio.slice(-1);
  if (!cuerpo) return dv === "K" ? "" : dv;
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

/** Dígito verificador (módulo 11) que le corresponde a los números del RUN/RUT. */
export function dvCorrecto(cuerpo: string): string {
  const suma = cuerpo.split("").reverse().reduce((a, d, i) => a + Number(d) * (2 + (i % 6)), 0);
  const esperado = 11 - (suma % 11);
  return esperado === 11 ? "0" : esperado === 10 ? "K" : String(esperado);
}

/** Mensaje que explica qué está mal en un RUN/RUT, o "" si es válido (mismos textos que el servidor). */
export function errorRut(valor: string, etiqueta = "RUN"): string {
  const s = valor.replace(/[.\-\s]/g, "").toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(s)) return `El ${etiqueta} debe tener 7 u 8 números y un dígito verificador (0-9 o K). Ejemplo: 12.345.678-5`;
  const cuerpo = s.slice(0, -1);
  const esperado = dvCorrecto(cuerpo);
  if (s.slice(-1) === esperado) return "";
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `El dígito verificador del ${etiqueta} no corresponde: para ${conPuntos} debería ser ${esperado}, no ${s.slice(-1)}. Revise que lo haya escrito bien.`;
}

export const rutValido = (rut: string) => errorRut(rut) === "";

/** Celular chileno mientras se escribe: la persona ingresa solo los 8 dígitos finales y se agrega "+56 9" con el espacio cada 4. */
export function formatearTelefono(valor: string): string {
  let d = valor.replace(/\D/g, "");
  if (d.startsWith("569")) d = d.slice(3);
  else if (d.startsWith("56")) d = d.slice(2);
  else if (d.length > 8 && d.startsWith("9")) d = d.slice(1);
  d = d.slice(0, 8);
  if (!d) return "";
  return `+56 9 ${d.slice(0, 4)}${d.length > 4 ? " " + d.slice(4) : ""}`;
}

/** Teléfono chileno de 9 dígitos, con o sin +56. */
export function telefonoValido(tel: string): boolean {
  let s = tel.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(s)) return false;
  if (s.startsWith("+56")) s = s.slice(3);
  else if (s.startsWith("56") && s.length === 11) s = s.slice(2);
  return /^[2-9]\d{8}$/.test(s);
}

export const correoValido = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(c);

/** Mensaje que explica qué le falta a un correo, o "" si es válido (mismos textos que el servidor). */
export function errorCorreo(correo: string): string {
  const v = correo.trim().toLowerCase();
  if (correoValido(v)) return "";
  if (!v.includes("@")) return "Al correo le falta el «@». Ejemplo: nombre@correo.cl";
  if (/\s/.test(v) || v.split("@").length > 2) return "El correo no puede llevar espacios ni más de un «@». Ejemplo: nombre@correo.cl";
  return "El correo está incompleto: después del «@» falta el dominio. Ejemplo: nombre@correo.cl";
}

export const errorTelefono = (tel: string) => (telefonoValido(tel) ? "" : "El teléfono debe tener 9 dígitos. Ejemplo: +56 9 8765 4321");

/** Errores de los datos del cliente por campo (nombre, rut, telefono, direccion); vacío si todo está bien. RUN y teléfono son opcionales. */
export function erroresDatosCliente(d: { nombre: string; telefono: string; rut: string; direccion: string }): Record<string, string> {
  const e: Record<string, string> = {};
  const nombre = d.nombre.trim();
  if (nombre.length < 3 || nombre.length > 150) e.nombre = "El nombre del cliente debe tener entre 3 y 150 caracteres.";
  if (d.rut.trim() && errorRut(d.rut)) e.rut = errorRut(d.rut);
  if (d.telefono.trim() && errorTelefono(d.telefono)) e.telefono = errorTelefono(d.telefono);
  const dir = d.direccion.trim();
  if (dir.length < 5 || dir.length > 255) e.direccion = "La dirección del terreno debe tener entre 5 y 255 caracteres.";
  return e;
}

/** Resalta en rojo un campo por su id (para validaciones hechas en código, fuera de un formulario) y le da el foco. */
export function marcarInvalido(...ids: string[]) {
  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    el?.setAttribute("aria-invalid", "true");
    if (i === 0) el?.focus();
  });
}
