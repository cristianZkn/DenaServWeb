"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FichaData } from "@/app/cotizacion/[uuid]/FichaPdf";

interface Item {
  id: number;
  nombre: string;
  precio_base_unitario: number;
  unidad_medida: string;
}
interface Hito {
  id: number;
  fase: string;
  porcentaje: number;
  monto_pago: number;
  estado: string;
  fecha_pago: string | null;
}
interface Obra {
  id: number;
  porcentaje_avance_real: number;
  gasto_real_acumulado: number;
  observaciones: string | null;
}
interface Detalle extends FichaData {
  id: number;
  estado: string;
  tipo_proyecto: string;
  base_terreno_id: number | null;
  revestimiento_id: number | null;
  ganancia_m2: number;
  m2_vigas_vista: number;
  radier_m2: number;
  ajuste_monto: number;
  hitos_pago: (Hito & { cotizacion_id: number })[];
  obras_ejecucion: Obra[];
}
interface Ganancias {
  neto_cobrado: number;
  costo_presupuestado: number;
  gasto_real: number;
  ganancia_estimada: number;
  ganancia_real: number;
  avance_real: number;
  hito_avance_exigible: boolean;
}
interface Cambio {
  id: number;
  fecha: string;
  usuario: string;
  total_anterior: number;
  total_nuevo: number;
  motivo: string;
}

const clp = (n: number | string) => "$" + Math.round(Number(n)).toLocaleString("es-CL");
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const jsonAuth = () => ({ "Content-Type": "application/json", ...auth() });

export default function ProyectoInternoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cot, setCot] = useState<Detalle | null>(null);
  const [gan, setGan] = useState<Ganancias | null>(null);
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [bases, setBases] = useState<Item[]>([]);
  const [revest, setRevest] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Formularios
  const [form, setForm] = useState<Record<string, any>>({});
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<{ total_anterior: string; total_nuevo: string; diferencia: string } | null>(null);
  const [avance, setAvance] = useState(0);
  const [gasto, setGasto] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const [rc, rg, rh] = await Promise.all([
        fetch(`/api/cotizaciones/${id}`, { headers: auth() }),
        fetch(`/api/cotizaciones/${id}/ganancias`, { headers: auth() }),
        fetch(`/api/cotizaciones/${id}/cambios`, { headers: auth() }),
      ]);
      if (!rc.ok) throw new Error("No se encontró la cotización.");
      const c: Detalle = await rc.json();
      setCot(c);
      setGan(rg.ok ? await rg.json() : null);
      setCambios(rh.ok ? await rh.json() : []);
      setForm({
        cliente_nombre: c.cliente_nombre,
        cliente_telefono: c.cliente_telefono || "",
        direccion_terreno: c.direccion_terreno,
        superficie_m2: c.superficie_m2,
        distancia_flete_km: c.distancia_flete_km,
        base_terreno_id: c.base_terreno_id ?? "",
        revestimiento_id: c.revestimiento_id ?? "",
        m2_vigas_vista: c.m2_vigas_vista,
        ganancia_m2: c.ganancia_m2,
        radier_m2: c.radier_m2,
        ajuste_monto: c.ajuste_monto,
      });
      const o = c.obras_ejecucion?.[0];
      setAvance(o ? Number(o.porcentaje_avance_real) : 0);
      setGasto(o ? Number(o.gasto_real_acumulado) : 0);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    cargar();
    Promise.all([
      fetch("/api/catalogo-tipos/?categoria=BASE_TERRENO&activo=true", { headers: auth() }),
      fetch("/api/catalogo-tipos/?categoria=REVESTIMIENTO&activo=true", { headers: auth() }),
    ]).then(async ([a, b]) => {
      if (a.ok) setBases(await a.json());
      if (b.ok) setRevest(await b.json());
    });
  }, [cargar]);

  const payload = (aplicar: boolean) => ({
    cliente_nombre: form.cliente_nombre,
    cliente_telefono: form.cliente_telefono || null,
    direccion_terreno: form.direccion_terreno,
    superficie_m2: Number(form.superficie_m2),
    distancia_flete_km: Number(form.distancia_flete_km),
    base_terreno_id: form.base_terreno_id ? Number(form.base_terreno_id) : null,
    revestimiento_id: form.revestimiento_id ? Number(form.revestimiento_id) : null,
    m2_vigas_vista: Number(form.m2_vigas_vista) || 0,
    ganancia_m2: Number(form.ganancia_m2) || 0,
    radier_m2: Number(form.radier_m2) || 0,
    ajuste_monto: Number(form.ajuste_monto) || 0,
    motivo,
    aplicar,
  });

  // Vista previa del nuevo monto mientras se edita
  useEffect(() => {
    if (!cot || !form.superficie_m2) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify(payload(false)) });
      setPrevia(res.ok ? await res.json() : null);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, cot]);

  const guardar = async () => {
    setMsg("");
    setError("");
    const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify(payload(true)) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || "No se pudo guardar.");
      return;
    }
    setMotivo("");
    setMsg(Number(data.diferencia) ? `Monto reajustado: ${clp(data.total_anterior)} → ${clp(data.total_nuevo)}` : "Datos guardados.");
    cargar();
  };

  const guardarObra = async () => {
    const obra = cot?.obras_ejecucion?.[0];
    if (!obra) return;
    const res = await fetch(`/api/obras/${obra.id}`, {
      method: "PATCH",
      headers: jsonAuth(),
      body: JSON.stringify({ porcentaje_avance_real: avance, gasto_real_acumulado: gasto }),
    });
    setMsg(res.ok ? "Avance de obra actualizado." : "No se pudo actualizar la obra.");
    cargar();
  };

  const toggleHito = async (h: Hito) => {
    await fetch(`/api/hitos-pago/${h.id}`, {
      method: "PATCH",
      headers: jsonAuth(),
      body: JSON.stringify({ estado: h.estado === "PAGADO" ? "PENDIENTE" : "PAGADO" }),
    });
    cargar();
  };

  const descargarPdf = async () => {
    if (!cot || !gan) return;
    const [{ pdf }, { default: FichaPdf }] = await Promise.all([import("@react-pdf/renderer"), import("@/app/cotizacion/[uuid]/FichaPdf")]);
    const blob = await pdf(<FichaPdf c={cot} interno={gan} />).toBlob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cot.codigo_cotizacion}-interno.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error && !cot) return <div className="p-8 text-center text-red-700">{error}</div>;
  if (!cot) return <div className="p-8 text-center text-slate-500 font-semibold">Cargando proyecto...</div>;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const esCasa = cot.tipo_proyecto !== "SOLO_RADIER";
  const dif = previa ? Number(previa.diferencia) : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-xs text-blue-900 font-semibold underline">← Volver a cotizaciones</Link>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            {cot.codigo_cotizacion} <span className="text-sm font-semibold text-slate-400">· ficha interna</span>
          </h1>
          <p className="text-sm text-slate-600">
            {cot.cliente_nombre} · {cot.direccion_terreno} · {cot.superficie_m2} m² · {cot.estado}
          </p>
        </div>
        <div className="flex gap-2 items-start">
          <Link href={`/cotizacion/${cot.codigo_cotizacion}`} target="_blank" className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-semibold">
            Ficha del cliente ↗
          </Link>
          <button onClick={descargarPdf} className="px-3 py-2 text-sm bg-blue-900 text-white rounded-lg font-semibold">
            PDF interno
          </button>
        </div>
      </div>

      {msg && <div className="bg-green-50 border-l-4 border-green-500 text-green-800 p-3 rounded-r text-sm">{msg}</div>}
      {error && <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-r text-sm">{error}</div>}

      {/* Resumen económico */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold mb-3">Resumen económico</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Total (IVA incl.)", cot.costo_total],
            ["Neto cobrado", gan?.neto_cobrado],
            ["Costo presupuestado (neto)", gan?.costo_presupuestado],
            ["Gasto real acumulado", gan?.gasto_real],
            ["Ganancia estimada", gan?.ganancia_estimada],
            ["Ganancia real", gan?.ganancia_real],
            ["Avance real", gan ? `${gan.avance_real}%` : undefined],
            ["Ajuste manual vigente", cot.ajuste_monto],
          ].map(([l, v]) => (
            <div key={l as string} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">{l}</div>
              <div className="font-black text-slate-900">{v === undefined ? "-" : typeof v === "string" ? v : clp(v as number)}</div>
            </div>
          ))}
        </div>
        {gan?.hito_avance_exigible && (
          <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            El avance llegó al 50 %: corresponde cobrar el hito 2 (30 %).
          </p>
        )}
      </section>

      {/* Hitos y obra */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-lg font-bold">Hitos de pago</h2>
          {cot.hitos_pago.map((h) => (
            <div key={h.id} className="flex justify-between items-center border border-slate-200 rounded-lg p-3 text-sm">
              <div>
                <div className="font-semibold">{h.fase.replace(/_/g, " ")} ({h.porcentaje}%)</div>
                <div className="font-black">{clp(h.monto_pago)}</div>
              </div>
              <button
                onClick={() => toggleHito(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  h.estado === "PAGADO" ? "bg-green-100 text-green-800 border-green-300" : "bg-amber-100 text-amber-800 border-amber-300"
                }`}
              >
                {h.estado === "PAGADO" ? "Pagado ✓" : "Pendiente"}
              </button>
            </div>
          ))}
        </section>

        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-lg font-bold">Ejecución de obra</h2>
          <label className="block text-sm font-semibold">Avance físico real (%)</label>
          <input type="number" min="0" max="100" value={avance} onChange={(e) => setAvance(parseFloat(e.target.value) || 0)} />
          <label className="block text-sm font-semibold">Gasto real acumulado ($)</label>
          <input type="number" min="0" value={gasto} onChange={(e) => setGasto(parseFloat(e.target.value) || 0)} />
          <button onClick={guardarObra} className="px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold">
            Guardar avance
          </button>
        </section>
      </div>

      {/* Edición y reajuste */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-lg font-bold">Editar cotización y reajustar el monto</h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div><label className="font-semibold">Cliente</label><input value={form.cliente_nombre} onChange={set("cliente_nombre")} /></div>
          <div><label className="font-semibold">Teléfono</label><input value={form.cliente_telefono} onChange={set("cliente_telefono")} /></div>
          <div className="md:col-span-2"><label className="font-semibold">Dirección del terreno</label><input value={form.direccion_terreno} onChange={set("direccion_terreno")} /></div>
          <div><label className="font-semibold">Superficie (m²)</label><input type="number" min="1" step="0.5" value={form.superficie_m2} onChange={set("superficie_m2")} /></div>
          <div><label className="font-semibold">Distancia de traslado (km)</label><input type="number" min="0" value={form.distancia_flete_km} onChange={set("distancia_flete_km")} /></div>
          {esCasa ? (
            <>
              <div>
                <label className="font-semibold">Base</label>
                <select value={form.base_terreno_id} onChange={set("base_terreno_id")}>
                  <option value="">—</option>
                  {bases.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold">Revestimiento</label>
                <select value={form.revestimiento_id} onChange={set("revestimiento_id")}>
                  <option value="">—</option>
                  {revest.map((r) => <option key={r.id} value={r.id}>{r.nombre} ({clp(r.precio_base_unitario)}/m²)</option>)}
                </select>
              </div>
              <div><label className="font-semibold">m² con vigas a la vista</label><input type="number" min="0" value={form.m2_vigas_vista} onChange={set("m2_vigas_vista")} /></div>
              <div><label className="font-semibold">Ganancia de la empresa ($/m²)</label><input type="number" min="0" step="1000" value={form.ganancia_m2} onChange={set("ganancia_m2")} /></div>
            </>
          ) : (
            <div><label className="font-semibold">Precio del radier ($/m²)</label><input type="number" min="0" step="500" value={form.radier_m2} onChange={set("radier_m2")} /></div>
          )}
          <div>
            <label className="font-semibold">Ajuste manual al monto total ($, + o −)</label>
            <input type="number" step="1000" value={form.ajuste_monto} onChange={set("ajuste_monto")} />
          </div>
          <div>
            <label className="font-semibold">Motivo del reajuste {dif !== 0 && "*"}</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: alza del precio del zinc" />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm flex flex-wrap gap-x-8 gap-y-1 items-center">
          {previa ? (
            <>
              <span>Total actual: <strong>{clp(previa.total_anterior)}</strong></span>
              <span>Nuevo total: <strong>{clp(previa.total_nuevo)}</strong></span>
              <span className={dif > 0 ? "text-red-700" : dif < 0 ? "text-green-700" : ""}>
                Diferencia: <strong>{dif > 0 ? "+" : ""}{clp(dif)}</strong>
              </span>
              {dif !== 0 && <span className="text-xs text-slate-500">Se reparte entre los hitos aún pendientes.</span>}
            </>
          ) : (
            <span className="text-slate-400">Calculando...</span>
          )}
        </div>
        <button onClick={guardar} className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg font-semibold">
          Guardar cambios
        </button>
        <p className="text-xs text-slate-500">
          El relleno de estabilizado se ajusta desde &quot;Visita técnica&quot; en el listado de cotizaciones.
        </p>
      </section>

      {/* Historial */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold mb-3">Historial de reajustes</h2>
        {cambios.length === 0 ? (
          <p className="text-sm text-slate-400">Sin reajustes desde la emisión.</p>
        ) : (
          <ul className="divide-y divide-slate-200 text-sm">
            {cambios.map((c) => (
              <li key={c.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span>
                  <strong>{clp(c.total_anterior)} → {clp(c.total_nuevo)}</strong> · {c.motivo}
                </span>
                <span className="text-xs text-slate-500">{c.usuario} · {new Date(c.fecha).toLocaleString("es-CL")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
