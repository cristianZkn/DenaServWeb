"use client";

import EncabezadoPagina from "@/components/EncabezadoPagina";
import { useDialogo } from "@/components/ConfirmDialog";
import { useEffect, useState } from "react";

const JSON_HDR = { "Content-Type": "application/json" };

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

interface Combustible {
  tipo: string;
  nombre: string;
  precio: number | null;
  manual: boolean;
  zona: string;
  fuente: string;
  actualizado_en: string | null;
}
const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 2 });

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [editando, setEditando] = useState<Record<string, string>>({}); // clave -> texto que se está escribiendo
  const [guardando, setGuardando] = useState("");
  const [loading, setLoading] = useState(true);
  const [comb, setComb] = useState<{ filas: Combustible[]; error: string | null }>({ filas: [], error: null });
  const [editandoComb, setEditandoComb] = useState<Record<string, string>>({});
  const [consultando, setConsultando] = useState(false);
  const { preguntar, dialogo } = useDialogo();
  const avisar = (mensaje: string) => void preguntar({ titulo: "No se pudo completar la acción", mensaje, soloAviso: true });

  useEffect(() => {
    fetch("/api/tarifas/")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setTarifas)
      .catch(() => avisar("No se pudieron cargar las tarifas."))
      .finally(() => setLoading(false));
  }, []);

  const cargarComb = async (forzar = false) => {
    setConsultando(true);
    try {
      if (forzar) {
        const r = await fetch("/api/combustibles/actualizar/", { method: "POST" });
        if (!r.ok) avisar((await r.json().catch(() => null))?.message || "La CNE no respondió; se mantienen los precios guardados.");
      }
      const res = await fetch("/api/combustibles/estado/", { cache: "no-store" });
      if (res.ok) setComb(await res.json());
      else avisar("No se pudo cargar el precio del combustible.");
    } finally {
      setConsultando(false);
    }
  };
  useEffect(() => { cargarComb(); }, []);

  const fijarComb = async (c: Combustible) => {
    const valor = Number(editandoComb[c.tipo]);
    if (!Number.isFinite(valor) || valor <= 0) return avisar("Ingrese el precio por litro, mayor que 0.");
    const res = await fetch(`/api/combustibles/${c.tipo}`, { method: "PUT", headers: JSON_HDR, body: JSON.stringify({ valor }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return avisar(data.message || "No se pudo guardar el precio.");
    setComb(data);
    setEditandoComb(({ [c.tipo]: _, ...resto }) => resto);
  };

  const volverACne = async (c: Combustible) => {
    const res = await fetch(`/api/combustibles/${c.tipo}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return avisar(data.message || "No se pudo volver al precio de la CNE.");
    setComb(data);
  };

  const reemplazar = (t: Tarifa) => {
    setTarifas((prev) => prev.map((x) => (x.clave === t.clave ? t : x)));
    setEditando((prev) => { const { [t.clave]: _, ...resto } = prev; return resto; });
  };

  const guardar = async (t: Tarifa) => {
    const texto = editando[t.clave];
    const valor = Number(texto);
    if (texto === undefined || texto.trim() === "" || !Number.isFinite(valor) || valor < 0) return avisar("Ingrese un valor numérico mayor o igual a 0.");
    setGuardando(t.clave);
    const res = await fetch(`/api/tarifas/${t.clave}`, { method: "PUT", headers: JSON_HDR, body: JSON.stringify({ valor }) });
    setGuardando("");
    if (!res.ok) return avisar((await res.json().catch(() => ({}))).message || "No se pudo guardar el valor.");
    reemplazar(await res.json());
  };

  const restablecer = async (t: Tarifa) => {
    if (!(await preguntar({ titulo: `¿Volver «${t.nombre}» a su valor original?`, mensaje: `Quedará en ${fmt(t.valor_de_fabrica)} ${t.unidad}.`, peligro: true }))) return;
    const res = await fetch(`/api/tarifas/${t.clave}`, { method: "DELETE" });
    if (!res.ok) return avisar("No se pudo restablecer el valor.");
    reemplazar(await res.json());
  };

  const grupos = Array.from(new Set(tarifas.map((t) => t.grupo)));

  return (
    <div className="space-y-4">
      {dialogo}
      <EncabezadoPagina icono="💲" titulo="Tarifas del cálculo"
        descripcion="Valores fijos con los que el cotizador calcula el precio de cada obra. Un cambio rige para los proyectos que se cotizan desde ese momento; los ya guardados mantienen su valor, salvo que se les modifique el monto. Cada cotización también puede ajustar algunas de estas tarifas solo para sí misma, desde «Tarifas de esta cotización»." />

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="comb-titulo">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="comb-titulo" className="text-lg font-bold text-slate-800">Precio del combustible</h2>
            <p className="text-sm text-slate-500">
              Se consulta solo a la CNE (Bencina en Línea). Si no responde, o quiere usar otro valor, escríbalo aquí: el precio manual rige hasta que vuelva al de la CNE.
            </p>
          </div>
          <button type="button" onClick={() => cargarComb(true)} disabled={consultando}
            className="!min-h-0 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold cursor-pointer disabled:opacity-50">
            {consultando ? "Consultando…" : "Consultar a la CNE"}
          </button>
        </div>
        {comb.error && (
          <p role="alert" className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-900">
            {comb.error} Puede ingresar los precios a mano mientras tanto.
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {comb.filas.map((c) => {
            const texto = editandoComb[c.tipo];
            const sinGuardar = texto !== undefined && texto !== "" && Number(texto) !== c.precio;
            return (
              <li key={c.tipo} className="px-5 py-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                    {c.nombre}
                    {c.precio === null ? (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">Sin precio</span>
                    ) : c.manual ? (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">Manual</span>
                    ) : (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-800">CNE</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {c.precio === null
                      ? "Aún no hay un precio: ingréselo a mano o consulte a la CNE."
                      : `${c.fuente}${c.zona ? ` · ${c.zona}` : ""} · ${c.actualizado_en ? new Date(c.actualizado_en).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : ""}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <input type="number" inputMode="numeric" min="1" step="1" aria-label={`Precio por litro de ${c.nombre}`}
                      value={texto ?? (c.precio === null ? "" : String(c.precio))} placeholder="Ej.: 1500"
                      onFocus={(e) => e.target.select()} onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      onChange={(e) => setEditandoComb({ ...editandoComb, [c.tipo]: e.target.value })}
                      className="!w-40 pr-12 text-right" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">$/L</span>
                  </div>
                  <button type="button" onClick={() => fijarComb(c)} disabled={!sinGuardar}
                    className="!min-h-0 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    Guardar
                  </button>
                  {c.manual && (
                    <button type="button" onClick={() => volverACne(c)}
                      className="!min-h-0 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-sm px-3 py-2 rounded-lg cursor-pointer">
                      Usar el de la CNE
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

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
