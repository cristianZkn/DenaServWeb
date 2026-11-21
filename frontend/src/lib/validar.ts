// Validaciones de datos de contacto chilenos (espejo de backend/core/validadores.py).

/** Da formato 12.345.678-5 mientras se escribe (solo dígitos y K, máx. 9 caracteres). */
export function formatearRut(valor: string): string {
  const s = valor.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (s.length <= 1) return s;
  return `${s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${s.slice(-1)}`;
}

export function rutValido(rut: string): boolean {
  const s = rut.replace(/[.\-\s]/g, "").toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(s)) return false;
  const cuerpo = s.slice(0, -1).split("").reverse();
  const suma = cuerpo.reduce((a, d, i) => a + Number(d) * (2 + (i % 6)), 0);
  const esperado = 11 - (suma % 11);
  return s.slice(-1) === (esperado === 11 ? "0" : esperado === 10 ? "K" : String(esperado));
}

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

/** Primer error de los datos del cliente con el id del campo que lo causó, o null si todo está bien. RUN y teléfono son opcionales. */
export function errorDatosClienteCampo(d: { nombre: string; telefono: string; rut: string; direccion: string }): { mensaje: string; campo: string } | null {
  const nombre = d.nombre.trim();
  if (nombre.length < 3 || nombre.length > 150) return { mensaje: "El nombre del cliente debe tener entre 3 y 150 caracteres.", campo: "cliente_nombre" };
  if (d.rut.trim() && !rutValido(d.rut)) return { mensaje: "El RUN no es válido. Ejemplo: 12.345.678-5", campo: "cliente_rut" };
  if (d.telefono.trim() && !telefonoValido(d.telefono)) return { mensaje: "El teléfono debe tener 9 dígitos. Ejemplo: +56 9 8765 4321", campo: "cliente_telefono" };
  const dir = d.direccion.trim();
  if (dir.length < 5 || dir.length > 255) return { mensaje: "La dirección del terreno debe tener entre 5 y 255 caracteres.", campo: "direccion_terreno" };
  return null;
}

/** Mensaje del primer error de los datos del cliente, o "" si todo está bien. */
export function errorDatosCliente(d: { nombre: string; telefono: string; rut: string; direccion: string }): string {
  return errorDatosClienteCampo(d)?.mensaje ?? "";
}

/** Resalta en rojo un campo por su id (para validaciones hechas en código, fuera de un formulario) y le da el foco. */
export function marcarInvalido(...ids: string[]) {
  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    el?.setAttribute("aria-invalid", "true");
    if (i === 0) el?.focus();
  });
}
