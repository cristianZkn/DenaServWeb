/** Devuelve la dirección solo si es http(s); evita enlaces `javascript:` si algún dato guardado trajera uno. */
export const urlSegura = (u?: string | null) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : "#");
