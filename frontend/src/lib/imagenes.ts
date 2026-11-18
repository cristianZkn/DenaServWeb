/** Reduce la foto a 1280 px de ancho máximo y la guarda como JPEG: pesa poco y sube rápido aunque venga de un celular. */
export function reducirImagen(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 1280 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`«${archivo.name}» no es una imagen válida.`));
    };
    img.src = url;
  });
}

/** Descarga una foto protegida (requiere la sesión) y la devuelve como data URL, lista para mostrar o incluir en el PDF. */
export async function fotoPrivadaADataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(typeof lector.result === "string" ? lector.result : null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
