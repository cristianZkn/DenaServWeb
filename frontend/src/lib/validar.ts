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

/** Teléfono chileno de 9 dígitos, con o sin +56. */
export function telefonoValido(tel: string): boolean {
  let s = tel.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(s)) return false;
  if (s.startsWith("+56")) s = s.slice(3);
  else if (s.startsWith("56") && s.length === 11) s = s.slice(2);
  return /^[2-9]\d{8}$/.test(s);
}

export const correoValido = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(c);

/** Mensaje del primer error de los datos del cliente, o "" si todo está bien. RUT y teléfono son opcionales. */
export function errorDatosCliente(d: { nombre: string; telefono: string; rut: string; direccion: string }): string {
  const nombre = d.nombre.trim();
  if (nombre.length < 3 || nombre.length > 150) return "El nombre del cliente debe tener entre 3 y 150 caracteres.";
  if (d.rut.trim() && !rutValido(d.rut)) return "El RUT no es válido. Ejemplo: 12.345.678-5";
  if (d.telefono.trim() && !telefonoValido(d.telefono)) return "El teléfono debe tener 9 dígitos. Ejemplo: +56 9 8765 4321";
  const dir = d.direccion.trim();
  if (dir.length < 5 || dir.length > 255) return "La dirección del terreno debe tener entre 5 y 255 caracteres.";
  return "";
}
