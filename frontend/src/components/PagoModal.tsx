"use client";

import { marcarInvalido } from "@/lib/validar";
import { useDialogo } from "./ConfirmDialog";

import { useState } from "react";

const JSON_HDR = { "Content-Type": "application/json" };

const MAX_COMPROBANTE = 2_500_000;
const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

export interface HitoPago {
  id: number;
  fase: string;
  porcentaje: number;
  monto_pago: number;
  monto_abonado: number;
  monto_pendiente: number;
  estado: string; // PENDIENTE | ABONADO | PAGADO
  fecha_pago?: string | null;
  registros?: RegistroPago[];
}

/** Una fila del libro de pagos (detalle_registros). */
export interface RegistroPago {
  id: number;
  monto: number;
  metodo: string;
  metodo_etiqueta: string;
  fecha: string;
  nota: string;
  tiene_comprobante: boolean;
  comprobante_nombre: string;
  usuario: string | null;
  acumulado: number;
  saldo: number;
}

export const METODOS = [
  { v: "EFECTIVO", t: "Efectivo" }, { v: "TRANSFERENCIA", t: "Transferencia" }, { v: "CHEQUE", t: "Cheque" },
  { v: "DEBITO", t: "Tarjeta de débito" }, { v: "CREDITO", t: "Tarjeta de crédito" }, { v: "OTRO", t: "Otro" },
];

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
  h.estado === "PAGADO" ? "Ver pagos" : h.estado === "ABONADO" ? "Registrar otro abono" : "Registrar pago";

/**
 * Libro de pagos de un hito: muestra cada abono (monto, método, comprobante) con lo acumulado y lo que falta, y permite
 * registrar uno nuevo indicando cuánto se pagó, cómo y, si existe, adjuntando el comprobante.
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
  const [actual, setActual] = useState<HitoPago>(hito);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const { preguntar, dialogo } = useDialogo();
  const total = Number(actual.monto_pago);
  const pendiente = Number(actual.monto_pendiente);
  const registros = actual.registros ?? [];
  const valor = Number(monto) || 0;

  const verComprobante = async (r: RegistroPago) => {
    const res = await fetch(`/api/registros-pago/${r.id}/comprobante/`);
    if (!res.ok) return setError("No se pudo abrir el comprobante.");
    window.open(URL.createObjectURL(await res.blob()), "_blank");
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (valor <= 0 || valor > pendiente) {
      marcarInvalido("monto-pago");
      return setError(`El monto debe ser mayor que 0 y no superar lo que falta (${clp(pendiente)}).`);
    }
    if (archivo && archivo.size > MAX_COMPROBANTE) return setError("El comprobante puede pesar hasta 2,5 MB.");
    setGuardando(true);
    try {
      const comprobante = archivo
        ? await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(archivo); })
        : undefined;
      const res = await fetch(`/api/hitos-pago/${actual.id}/registros/`, {
        method: "POST",
        headers: JSON_HDR,
        body: JSON.stringify({ monto: valor, metodo, fecha, nota, comprobante, comprobante_nombre: archivo?.name ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.message || "No se pudo guardar el pago. Intente de nuevo.");
      onSaved(data);
      onClose();
    } catch {
      setError("No hay conexión con el servidor. Intente de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const anular = async (r: RegistroPago) => {
    if (!(await preguntar({ titulo: "¿Seguro que desea anular este pago?", mensaje: `Se quitará el pago de ${clp(r.monto)} (${r.metodo_etiqueta}) y el saldo del hito se recalculará.`, peligro: true, textoConfirmar: "Anular" }))) return;
    let res = await fetch(`/api/registros-pago/${r.id}/`, { method: "DELETE" });
    let data = await res.json().catch(() => ({}));
    // El pago respalda un avance ya registrado: se explica qué pasará y, si la persona confirma, se anula igual y el avance baja.
    if (res.status === 409 && data.confirmar) {
      const ok = await preguntar({ titulo: "¿Seguro que desea anular este hito?", mensaje: `${data.message} Los registros de la bitácora se conservan como historial.`, peligro: true, textoConfirmar: "Anular hito" });
      if (!ok) return;
      res = await fetch(`/api/registros-pago/${r.id}/?forzar=true`, { method: "DELETE" });
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok) return setError(data.message || "No se pudo anular el pago.");
    setError("");
    setActual(data);
    onSaved(data);
  };

  // Cambia el comprobante de un abono ya registrado (por ejemplo, si se adjuntó el equivocado).
  const reemplazarComprobante = async (r: RegistroPago, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_COMPROBANTE) return setError("El comprobante puede pesar hasta 2,5 MB.");
    const comprobante = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(file); });
    const res = await fetch(`/api/registros-pago/${r.id}/comprobante/`, { method: "PUT", headers: JSON_HDR, body: JSON.stringify({ comprobante, comprobante_nombre: file.name }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.message || "No se pudo cambiar el comprobante.");
    setError("");
    setActual(data);
    onSaved(data);
  };

  const etiqueta = "block text-base font-semibold text-slate-800 mb-1";
  const resumen: [string, string, string][] = [
    ["Total", clp(total), "text-slate-900"],
    ["Pagado", clp(actual.monto_abonado), "text-green-800"],
    ["Falta", clp(pendiente), pendiente > 0 ? "text-orange-800" : "text-slate-400"],
  ];
  const alerta = error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-md">{error}</div>;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" role="dialog" aria-modal="true" aria-labelledby="pago-titulo">
      {dialogo}
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-5 border border-slate-200">
        <div>
          <h2 id="pago-titulo" className="text-xl font-black text-slate-900">Pagos del hito</h2>
          <p className="text-slate-600 mt-1">{NOMBRE_HITO[actual.fase] || actual.fase}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {resumen.map(([k, v, c]) => (
              <div key={k} className="bg-slate-50 border border-slate-200 rounded-xl py-2">
                <dt className="text-xs font-semibold text-slate-500">{k}</dt>
                <dd className={`text-lg font-black tabular-nums ${c}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <section aria-labelledby="hist-pagos">
          <h3 id="hist-pagos" className="text-lg font-bold text-slate-800 mb-2">Historial de pagos ({registros.length})</h3>
          {registros.length === 0 ? (
            <p className="text-slate-500 text-sm bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4">Aún no hay pagos registrados en este hito.</p>
          ) : (
            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
              {registros.map((r) => (
                <li key={r.id} className="p-3 space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-bold text-slate-900 tabular-nums">{clp(r.monto)}</span>
                    <span className="text-sm text-slate-600">{r.metodo_etiqueta} · {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-CL")}</span>
                  </div>
                  <div className="text-sm text-slate-500">
                    Acumulado {clp(r.acumulado)} · {r.saldo > 0 ? `falta ${clp(r.saldo)}` : "hito pagado"}
                    {r.usuario ? ` · registró ${r.usuario}` : ""}
                  </div>
                  {r.nota && <div className="text-sm text-slate-700">{r.nota}</div>}
                  <div className="flex gap-4 text-sm font-semibold">
                    {r.tiene_comprobante ? (
                      <button type="button" onClick={() => verComprobante(r)} className="!min-h-0 text-blue-800 hover:underline cursor-pointer">Ver comprobante</button>
                    ) : (
                      <span className="text-slate-400 font-normal">Sin comprobante</span>
                    )}
                    <label className="!min-h-0 text-blue-800 hover:underline cursor-pointer">
                      {r.tiene_comprobante ? "Reemplazar comprobante" : "Adjuntar comprobante"}
                      <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { reemplazarComprobante(r, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    <button type="button" onClick={() => anular(r)} className="!min-h-0 text-red-700 hover:underline cursor-pointer">Anular</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {pendiente > 0 ? (
          <form onSubmit={registrar} className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="text-lg font-bold text-slate-800">Registrar un pago</h3>
            <div>
              <label htmlFor="monto-pago" className={etiqueta}>¿Cuánto se pagó? ($) *</label>
              <div className="flex gap-2">
                <input id="monto-pago" type="number" inputMode="numeric" min="1" max={pendiente} required value={monto}
                  onChange={(e) => setMonto(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Ej.: 500000" />
                <button type="button" onClick={() => setMonto(String(pendiente))}
                  className="!min-h-0 whitespace-nowrap px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold cursor-pointer">
                  Lo que falta
                </button>
              </div>
              {valor > 0 && valor <= pendiente && (
                <p className="text-sm text-slate-600 mt-1" aria-live="polite">
                  {valor === pendiente ? "Con este pago el hito queda pagado completo." : `Después de este pago faltarán ${clp(pendiente - valor)}.`}
                </p>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="metodo-pago" className={etiqueta}>Método de pago *</label>
                <select id="metodo-pago" required value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                  <option value="" disabled>Elija una opción…</option>
                  {METODOS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fecha-pago" className={etiqueta}>Fecha del pago *</label>
                <input id="fecha-pago" type="date" required max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="comprobante-pago" className={etiqueta}>Comprobante (opcional)</label>
              <input id="comprobante-pago" type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              <p className="text-sm text-slate-500 mt-1">Foto o PDF de la transferencia, boleta o cheque (hasta 2,5 MB).</p>
            </div>
            <div>
              <label htmlFor="nota-pago" className={etiqueta}>Nota (opcional)</label>
              <input id="nota-pago" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: transferencia del Banco Estado" />
            </div>
            {alerta}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold cursor-pointer">Cerrar</button>
              <button type="submit" disabled={guardando} className="px-5 py-2.5 rounded-lg bg-green-700 hover:bg-green-800 text-white font-bold cursor-pointer disabled:opacity-50">
                {guardando ? "Guardando..." : "Registrar pago"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-green-800 bg-green-50 border border-green-200 rounded-xl p-3 font-semibold">Este hito está pagado por completo.</p>
            {alerta}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold cursor-pointer">Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
