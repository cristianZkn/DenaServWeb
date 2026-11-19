"use client";

import { useDialogo } from "@/components/ConfirmDialog";
import { useEffect, useState } from "react";

interface Tarifa {
  clave: string;
  grupo: string;
  nombre: string;
  unidad: string;
  descripcion: string;
  valor: number;
  valor_de_fabrica: number;
  modificada: boolean;
}

const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });
const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 2 });

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [editando, setEditando] = useState<Record<string, string>>({}); // clave -> texto que se está escribiendo
  const [guardando, setGuardando] = useState("");
  const [loading, setLoading] = useState(true);
  const { preguntar, dialogo } = useDialogo();
  const avisar = (mensaje: string) => void preguntar({ titulo: "No se pudo completar la acción", mensaje, soloAviso: true });

  useEffect(() => {
    fetch("/api/tarifas/", { headers: headers() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setTarifas)
      .catch(() => avisar("No se pudieron cargar las tarifas."))
      .finally(() => setLoading(false));
  }, []);

  const reemplazar = (t: Tarifa) => {
    setTarifas((prev) => prev.map((x) => (x.clave === t.clave ? t : x)));
    setEditando((prev) => { const { [t.clave]: _, ...resto } = prev; return resto; });
  };

  const guardar = async (t: Tarifa) => {
    const texto = editando[t.clave];
    const valor = Number(texto);
    if (texto === undefined || texto.trim() === "" || !Number.isFinite(valor) || valor < 0) return avisar("Ingrese un valor numérico mayor o igual a 0.");
    setGuardando(t.clave);
    const res = await fetch(`/api/tarifas/${t.clave}`, { method: "PUT", headers: headers(), body: JSON.stringify({ valor }) });
    setGuardando("");
    if (!res.ok) return avisar((await res.json().catch(() => ({}))).message || "No se pudo guardar el valor.");
    reemplazar(await res.json());
  };

  const restablecer = async (t: Tarifa) => {
    if (!(await preguntar({ titulo: `¿Volver «${t.nombre}» a su valor original?`, mensaje: `Quedará en ${fmt(t.valor_de_fabrica)} ${t.unidad}.`, peligro: true }))) return;
    const res = await fetch(`/api/tarifas/${t.clave}`, { method: "DELETE", headers: headers() });
    if (!res.ok) return avisar("No se pudo restablecer el valor.");
    reemplazar(await res.json());
  };

  const grupos = Array.from(new Set(tarifas.map((t) => t.grupo)));

  return (
    <div className="space-y-4">
      {dialogo}
      <div className="bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Tarifas del cálculo</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Valores fijos con los que el cotizador calcula el precio de cada obra. Un cambio rige para los proyectos que se cotizan desde ese
          momento; los proyectos ya guardados mantienen su valor, salvo que se les modifique el monto.
        </p>
      </div>

      {loading ? (
        <p className="p-8 text-center text-slate-400">Cargando tarifas...</p>
      ) : (
        grupos.map((g) => (
          <section key={g} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-lg font-bold text-slate-800">{g}</h2>
            <ul className="divide-y divide-slate-100">
              {tarifas.filter((t) => t.grupo === g).map((t) => {
                const texto = editando[t.clave];
                const sinGuardar = texto !== undefined && Number(texto) !== t.valor;
                return (
                  <li key={t.clave} className="px-5 py-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                        {t.nombre}
                        {t.modificada && <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">Modificada</span>}
                      </div>
                      <p className="text-sm text-slate-500">{t.descripcion}</p>
                      {t.modificada && <p className="text-xs text-slate-400 mt-0.5">Valor original: {fmt(t.valor_de_fabrica)} {t.unidad}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <input
                          type="number" inputMode="decimal" min="0" step="any" aria-label={t.nombre}
                          value={texto ?? String(t.valor)}
                          onFocus={(e) => e.target.select()}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          onChange={(e) => setEditando({ ...editando, [t.clave]: e.target.value })}
                          className="!w-40 pr-14 text-right"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">{t.unidad}</span>
                      </div>
                      <button type="button" onClick={() => guardar(t)} disabled={!sinGuardar || guardando === t.clave}
                        className="!min-h-0 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-default">
                        {guardando === t.clave ? "Guardando..." : "Guardar"}
                      </button>
                      {t.modificada && (
                        <button type="button" onClick={() => restablecer(t)}
                          className="!min-h-0 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-sm px-3 py-2 rounded-lg cursor-pointer">
                          Restablecer
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
