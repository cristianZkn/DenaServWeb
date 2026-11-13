"use client";

import { useDialogo } from "./ConfirmDialog";

import { useState } from "react";

export interface HitoPago {
  id: number;
  fase: string;
  porcentaje: number;
  monto_pago: number;
  monto_abonado: number;
  monto_pendiente: number;
  estado: string; // PENDIENTE | ABONADO | PAGADO
  fecha_pago?: string | null;
}

export const clp = (n: number | string) => "$" + Math.round(Number(n)).toLocaleString("es-CL");

export const NOMBRE_HITO: Record<string, string> = {
  ANTICIPO_40: "1.º pago: anticipo (40 %)",
  AVANCE_30: "2.º pago: al llegar al 50 % de avance (30 %)",
  ENTREGA_30: "3.º pago: al entregar las llaves (30 %)",
};

export const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ABONADO: "Pago parcial",
  PAGADO: "Pagado",
};

export const COLOR_ESTADO: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-900 border-amber-500",
  ABONADO: "bg-orange-100 text-orange-900 border-orange-500",
  PAGADO: "bg-green-100 text-green-900 border-green-600",
};

/** Texto del botón que abre el modal, según cómo va el pago. */
export const textoBotonPago = (h: HitoPago) =>
  h.estado === "PAGADO" ? "Ver o corregir pago" : h.estado === "ABONADO" ? "Registrar otro abono" : "Registrar pago";

/**
 * Modal para registrar el pago de un hito: primero se pregunta si se pagó completo.
 * "Sí" salda el hito; "No" pide el monto pagado (o lo que falta) y deja el hito como pago parcial con su deuda.
 */
export default function PagoModal({
  hito,
  onClose,
  onSaved,
}: {
  hito: HitoPago;
  onClose: () => void;
  onSaved: (h: HitoPago) => void;
}) {
  const [completo, setCompleto] = useState<boolean | null>(null);
  const [modo, setModo] = useState<"pagado" | "falta">("pagado");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const total = Number(hito.monto_pago);
  const { preguntar, dialogo } = useDialogo();
  const valor = Number(monto) || 0;
  const abonado = modo === "pagado" ? valor : total - valor;
  const pendiente = total - abonado;
  const montoValido = monto !== "" && abonado >= 0 && abonado < total;

  const enviar = async (body: object) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`/api/hitos-pago/${hito.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "No se pudo guardar el pago. Intente de nuevo.");
        return;
      }
      onSaved(data);
      onClose();
    } catch {
      setError("No hay conexión con el servidor. Intente de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" role="dialog" aria-modal="true" aria-labelledby="pago-titulo">
      {dialogo}
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 border border-slate-200">
        <div>
          <h2 id="pago-titulo" className="text-xl font-black text-slate-900">Registrar pago</h2>
          <p className="text-slate-600 mt-1">{NOMBRE_HITO[hito.fase] || hito.fase}</p>
          <p className="text-2xl sm:text-3xl font-black text-blue-900 mt-1 break-words">{clp(total)}</p>
          {Number(hito.monto_abonado) > 0 && hito.estado !== "PAGADO" && (
            <p className="text-sm text-orange-800 font-semibold mt-1">
              Ya se abonó {clp(hito.monto_abonado)} · faltan {clp(hito.monto_pendiente)}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="text-lg font-bold text-slate-800 mb-2">¿Se realizó el pago completo?</legend>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCompleto(true)}
              aria-pressed={completo === true}
              className={`py-3 rounded-xl text-lg font-bold border-2 cursor-pointer ${
                completo === true ? "bg-green-700 text-white border-green-700" : "bg-white text-green-800 border-green-600 hover:bg-green-50"
              }`}
            >
              Sí, completo
            </button>
            <button
              type="button"
              onClick={() => setCompleto(false)}
              aria-pressed={completo === false}
              className={`py-3 rounded-xl text-lg font-bold border-2 cursor-pointer ${
                completo === false ? "bg-orange-600 text-white border-orange-600" : "bg-white text-orange-800 border-orange-500 hover:bg-orange-50"
              }`}
            >
              No, fue parcial
            </button>
          </div>
        </fieldset>

        {completo === false && (
          <div className="space-y-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-base">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="modo" checked={modo === "pagado"} onChange={() => { setModo("pagado"); setMonto(""); }} className="!w-auto !min-h-0" />
                Monto pagado
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="modo" checked={modo === "falta"} onChange={() => { setModo("falta"); setMonto(""); }} className="!w-auto !min-h-0" />
                Monto que falta
              </label>
            </div>
            <div>
              <label htmlFor="monto-pago" className="block text-base font-semibold text-slate-800 mb-1">
                {modo === "pagado" ? "¿Cuánto pagó el cliente en total? ($)" : "¿Cuánto falta por pagar? ($)"}
              </label>
              <input
                id="monto-pago"
                type="number"
                inputMode="numeric"
                min="0"
                max={total}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0"
              />
            </div>
            {monto !== "" && (
              <div className="text-base space-y-0.5" aria-live="polite">
                {montoValido ? (
                  <>
                    <div>Pagado: <strong>{clp(abonado)}</strong></div>
                    <div className="text-orange-900 font-bold">Falta por pagar: {clp(pendiente)}</div>
                  </>
                ) : (
                  <div className="text-red-700 font-semibold">
                    El monto debe ser mayor que 0 y menor que {clp(total)}. Si pagó todo, elija «Sí, completo».
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md">{error}</div>}

        <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t">
          {hito.estado !== "PENDIENTE" ? (
            <button
              type="button"
              disabled={guardando}
              onClick={async () => (await preguntar({ titulo: "¿Anular lo registrado?", mensaje: "Se borrarán los pagos registrados y este pago volverá a quedar pendiente.", peligro: true, textoConfirmar: "Anular" })) && enviar({ estado: "PENDIENTE" })}
              className="text-sm font-semibold text-red-700 hover:underline cursor-pointer"
            >
              Anular lo registrado
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold cursor-pointer">
              Cancelar
            </button>
            {completo === true && (
              <button type="button" disabled={guardando} onClick={() => enviar({ pago_completo: true })} className="px-5 py-2.5 rounded-lg bg-green-700 hover:bg-green-800 text-white font-bold cursor-pointer disabled:opacity-50">
                {guardando ? "Guardando..." : "Confirmar pago completo"}
              </button>
            )}
            {completo === false && (
              <button type="button" disabled={guardando || !montoValido} onClick={() => enviar({ pago_completo: false, monto_abonado: abonado })} className="px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold cursor-pointer disabled:opacity-50">
                {guardando ? "Guardando..." : "Guardar abono"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
