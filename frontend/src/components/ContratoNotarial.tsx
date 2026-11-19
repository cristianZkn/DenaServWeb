"use client";

import { useRef, useState } from "react";
import { useDialogo } from "@/components/ConfirmDialog";

const JSON_HDR = { "Content-Type": "application/json" };

const MAX_MB = 3;

/** Contrato notarial oficial del proyecto (PDF opcional). Se anexa al final de las fichas descargables. */
export default function ContratoNotarial({ cotizacionId, adjunto, onCambio }: { cotizacionId: number; adjunto: boolean; onCambio: () => void }) {
  const { preguntar, dialogo } = useDialogo();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const aviso = (mensaje: string) => void preguntar({ titulo: "Contrato notarial", mensaje, soloAviso: true });
  const url = `/api/cotizaciones/${cotizacionId}/contrato/`;

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") return aviso("El contrato debe ser un archivo PDF.");
    if (f.size > MAX_MB * 1_000_000) return aviso(`El PDF puede pesar hasta ${MAX_MB} MB.`);
    setSubiendo(true);
    const pdf = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
    const res = await fetch(url, { method: "POST", headers: JSON_HDR, body: JSON.stringify({ nombre_archivo: f.name, pdf }) });
    setSubiendo(false);
    if (!res.ok) return aviso((await res.json().catch(() => ({}))).message || "No se pudo adjuntar el contrato.");
    onCambio();
  };

  const ver = async () => {
    const res = await fetch(url);
    if (!res.ok) return aviso("No se pudo abrir el contrato.");
    window.open(URL.createObjectURL(await res.blob()), "_blank");
  };

  const quitar = async () => {
    if (!(await preguntar({ titulo: "¿Seguro que desea quitar el contrato?", mensaje: "El PDF dejará de mostrarse en las fichas.", peligro: true }))) return;
    await fetch(url, { method: "DELETE" });
    onCambio();
  };

  const btn = "!min-h-0 px-4 py-2 rounded-lg font-semibold text-base border cursor-pointer transition";
  const neutro = `${btn} bg-white border-slate-300 text-slate-700 hover:bg-slate-100`;
  return (
    <section className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      {dialogo}
      <div>
        <h3 className="text-2xl font-black">Contrato notarial</h3>
        <p className="text-slate-600 text-base">
          Adjunte el PDF del contrato oficial firmado ante notario (opcional, hasta {MAX_MB} MB). Se muestra en las fichas y se incluye al final de su PDF.
        </p>
      </div>
      <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={elegir} />
      <div className="flex flex-wrap items-center gap-3">
        {adjunto ? (
          <>
            <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 font-bold text-sm">Contrato adjunto</span>
            <button type="button" onClick={ver} className={neutro}>Ver PDF</button>
            <button type="button" onClick={() => input.current?.click()} disabled={subiendo} className={neutro}>Reemplazar</button>
            <button type="button" onClick={quitar} className={`${btn} bg-red-700 border-red-700 text-white hover:bg-red-800`}>Quitar</button>
          </>
        ) : (
          <button type="button" onClick={() => input.current?.click()} disabled={subiendo} className={`${btn} bg-blue-900 border-blue-900 text-white hover:bg-blue-800`}>
            {subiendo ? "Subiendo..." : "Adjuntar contrato (PDF)"}
          </button>
        )}
      </div>
    </section>
  );
}
