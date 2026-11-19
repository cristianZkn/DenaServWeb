/** Agrega al final de la ficha (PDF generado) las páginas del contrato notarial. Si no hay contrato, devuelve la ficha tal cual. */
export async function unirContrato(ficha: Blob, contrato: ArrayBuffer | null): Promise<Blob> {
  if (!contrato) return ficha;
  const { PDFDocument } = await import("pdf-lib");
  const salida = await PDFDocument.load(await ficha.arrayBuffer());
  const anexo = await PDFDocument.load(contrato, { ignoreEncryption: true });
  (await salida.copyPages(anexo, anexo.getPageIndices())).forEach((p) => salida.addPage(p));
  return new Blob([new Uint8Array(await salida.save())], { type: "application/pdf" });
}

/** Descarga el contrato adjunto (la sesión viaja en una cookie). Null si no existe. */
export async function bajarContrato(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url);
  return res.ok ? res.arrayBuffer() : null;
}
