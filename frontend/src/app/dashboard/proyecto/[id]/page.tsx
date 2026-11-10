"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FichaData } from "@/app/cotizacion/[uuid]/FichaPdf";

interface Item {
  id: number;
  nombre: string;
  precio_base_unitario: number;
}
interface Hito {
  id: number;
  fase: string;
  porcentaje: number;
  monto_pago: number;
  estado: string;
}
interface Obra {
  id: number;
  porcentaje_avance_real: number;
  gasto_real_acumulado: number;
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
  hitos_pago: Hito[];
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
type Panel = "datos" | "valor" | "avance";

const clp = (n: number | string) => "$" + Math.round(Number(n)).toLocaleString("es-CL");
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const jsonAuth = () => ({ "Content-Type": "application/json", ...auth() });
const NOMBRE_HITO: Record<string, string> = {
  ANTICIPO_40: "1.º pago: anticipo (40 %)",
  AVANCE_30: "2.º pago: al llegar al 50 % de avance (30 %)",
  ENTREGA_30: "3.º pago: al entregar las llaves (30 %)",
};

const campo = "block text-base font-semibold text-slate-800 mb-1";
const ayuda = "text-sm text-slate-500 mt-1";
const botonGrande = "px-6 py-3 rounded-xl text-lg font-bold shadow cursor-pointer disabled:opacity-50";

export default function ProyectoInternoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cot, setCot] = useState<Detalle | null>(null);
  const [gan, setGan] = useState<Ganancias | null>(null);
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [bases, setBases] = useState<Item[]>([]);
  const [revest, setRevest] = useState<Item[]>([]);
  const [panel, setPanel] = useState<Panel>("valor");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

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

  const payload = (aplicar: boolean, soloDatos = false) => {
    const datos = {
      cliente_nombre: form.cliente_nombre,
      cliente_telefono: form.cliente_telefono || null,
      direccion_terreno: form.direccion_terreno,
    };
    if (soloDatos) return { ...datos, aplicar };
    return {
      ...datos,
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
    };
  };

  // Vista previa del valor nuevo mientras se escribe
  useEffect(() => {
    if (!cot || panel !== "valor" || !form.superficie_m2) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify(payload(false)) });
      setPrevia(res.ok ? await res.json() : null);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, cot, panel]);

  const avisar = (texto: string, esError = false) => {
    setMsg(esError ? "" : texto);
    setError(esError ? texto : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardarDatos = async () => {
    const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify(payload(true, true)) });
    if (!res.ok) return avisar((await res.json()).message || "No se pudo guardar.", true);
    avisar("Listo: los datos del cliente quedaron guardados.");
    cargar();
  };

  const guardarValor = async () => {
    const dif = previa ? Number(previa.diferencia) : 0;
    if (dif !== 0 && !motivo.trim()) return avisar("Escriba por qué cambia el valor (por ejemplo: subió el precio del zinc).", true);
    const texto = dif === 0 ? "¿Guardar los cambios?" : `El valor de la casa pasará de ${clp(previa!.total_anterior)} a ${clp(previa!.total_nuevo)}. ¿Confirma el cambio?`;
    if (!confirm(texto)) return;
    const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify(payload(true)) });
    const data = await res.json();
    if (!res.ok) return avisar(data.message || "No se pudo guardar.", true);
    setMotivo("");
    avisar(Number(data.diferencia) ? `Listo: el valor de la casa ahora es ${clp(data.total_nuevo)}.` : "Listo: cambios guardados.");
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
    avisar(res.ok ? "Listo: el avance de la obra quedó guardado." : "No se pudo guardar el avance.", !res.ok);
    cargar();
  };

  const cambiarPago = async (h: Hito) => {
    const nuevo = h.estado === "PAGADO" ? "PENDIENTE" : "PAGADO";
    if (!confirm(nuevo === "PAGADO" ? "¿Marcar este pago como RECIBIDO?" : "¿Marcar este pago como pendiente?")) return;
    await fetch(`/api/hitos-pago/${h.id}`, { method: "PATCH", headers: jsonAuth(), body: JSON.stringify({ estado: nuevo }) });
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

  if (error && !cot) return <div className="p-8 text-center text-red-700 text-lg">{error}</div>;
  if (!cot) return <div className="p-8 text-center text-slate-500 text-lg font-semibold">Cargando...</div>;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const esCasa = cot.tipo_proyecto !== "SOLO_RADIER";
  const dif = previa ? Number(previa.diferencia) : 0;
  const pestana = (p: Panel, texto: string) => (
    <button
      onClick={() => setPanel(p)}
      className={`flex-1 px-4 py-2.5 rounded-xl text-base font-bold border-2 cursor-pointer transition ${
        panel === p ? "bg-blue-900 text-white border-blue-900" : "bg-white text-blue-900 border-slate-300 hover:border-blue-700"
      }`}
    >
      {texto}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto grid lg:grid-cols-[19rem_1fr] gap-5 items-start">
      {/* Resumen siempre a la vista a la izquierda: no hay que volver arriba para ver el valor ni descargar fichas */}
      <aside className="lg:sticky lg:top-20 space-y-3">
        <Link href="/dashboard" className="inline-block text-base font-semibold text-blue-800 hover:underline">
          ← Mis cotizaciones
        </Link>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">{cot.cliente_nombre}</h1>
            <p className="text-base text-slate-600 mt-1">{cot.direccion_terreno}</p>
            <p className="text-sm text-slate-500">{cot.superficie_m2} m² · {cot.codigo_cotizacion}</p>
          </div>
          <div className="bg-blue-900 text-white rounded-xl p-4">
            <div className="text-sm text-blue-200">Valor total, IVA incluido</div>
            <div className="text-3xl font-black tabular-nums">{clp(cot.costo_total)}</div>
          </div>
          <div className="grid gap-2">
            <Link href={`/cotizacion/${(cot as any).token_publico}`} target="_blank" className="px-4 py-2.5 text-center text-base font-semibold border border-slate-300 rounded-xl hover:bg-slate-50">
              Ver ficha del cliente
            </Link>
            <button onClick={descargarPdf} className="px-4 py-2.5 text-base font-semibold border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer">
              Descargar ficha de la empresa (PDF)
            </button>
          </div>
        </div>
      </aside>

      <div className="space-y-5 min-w-0">
      {msg && <div className="bg-green-50 border-l-8 border-green-600 text-green-900 p-4 rounded-r-xl text-lg font-semibold">{msg}</div>}
      {error && <div className="bg-red-50 border-l-8 border-red-600 text-red-800 p-4 rounded-r-xl text-lg font-semibold">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-2">
        {pestana("valor", "Cambiar el valor")}
        {pestana("datos", "Datos del cliente")}
        {pestana("avance", "Avance y pagos")}
      </div>

      {panel === "datos" && (
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div>
            <label className={campo}>Nombre del cliente</label>
            <input value={form.cliente_nombre} onChange={set("cliente_nombre")} />
          </div>
          <div>
            <label className={campo}>Teléfono</label>
            <input value={form.cliente_telefono} onChange={set("cliente_telefono")} />
          </div>
          <div>
            <label className={campo}>Dirección del terreno</label>
            <input value={form.direccion_terreno} onChange={set("direccion_terreno")} />
          </div>
          <p className={ayuda}>Cambiar estos datos no modifica el valor de la casa.</p>
          <button onClick={guardarDatos} className={`${botonGrande} bg-blue-900 text-white hover:bg-blue-800`}>
            Guardar datos
          </button>
        </section>
      )}

      {panel === "valor" && (
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <p className="text-lg text-slate-700">
            Cambie lo que haya variado. Abajo verá cuánto quedaría el valor de la casa <strong>antes de guardar</strong>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={campo}>Metros cuadrados de la casa</label>
              <input type="number" min="1" step="0.5" value={form.superficie_m2} onChange={set("superficie_m2")} />
            </div>
            <div>
              <label className={campo}>Kilómetros hasta el terreno</label>
              <input type="number" min="0" value={form.distancia_flete_km} onChange={set("distancia_flete_km")} />
            </div>
            {esCasa ? (
              <div className="sm:col-span-2">
                <label className={campo}>Material exterior de la casa</label>
                <select value={form.revestimiento_id} onChange={set("revestimiento_id")}>
                  <option value="">Sin elegir</option>
                  {revest.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} ({clp(r.precio_base_unitario)} por m²)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className={campo}>Precio del radier por m²</label>
                <input type="number" min="0" step="500" value={form.radier_m2} onChange={set("radier_m2")} />
              </div>
            )}
          </div>

          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
            <h3 className="text-xl font-bold text-slate-900">Sumar o restar un monto al total</h3>
            <p className={ayuda}>
              Úselo cuando un costo cambió (por ejemplo, subió el zinc). Escriba un número positivo para <strong>sumar</strong> o
              negativo para <strong>descontar</strong>, por ejemplo -50000.
            </p>
            <div>
              <label className={campo}>Monto a sumar o restar ($)</label>
              <input type="number" step="1000" value={form.ajuste_monto} onChange={set("ajuste_monto")} />
            </div>
          </div>

          <details className="border border-slate-200 rounded-xl p-4">
            <summary className="text-lg font-semibold text-slate-700 cursor-pointer">Opciones avanzadas</summary>
            <div className="grid sm:grid-cols-2 gap-4 pt-4">
              {esCasa && (
                <>
                  <div>
                    <label className={campo}>Metros con vigas a la vista</label>
                    <input type="number" min="0" value={form.m2_vigas_vista} onChange={set("m2_vigas_vista")} />
                    <p className={ayuda}>Suma $65.000 por cada m².</p>
                  </div>
                  <div>
                    <label className={campo}>Ganancia de la empresa por m² ($)</label>
                    <input type="number" min="0" step="1000" value={form.ganancia_m2} onChange={set("ganancia_m2")} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={campo}>Tipo de base</label>
                    <select value={form.base_terreno_id} onChange={set("base_terreno_id")}>
                      <option value="">Sin elegir</option>
                      {bases.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </details>

          <div className="rounded-xl border-2 border-blue-900 p-4 space-y-1">
            {previa ? (
              <>
                <div className="text-lg">Valor actual: <strong>{clp(previa.total_anterior)}</strong></div>
                <div className="text-2xl font-black text-blue-900">Valor nuevo: {clp(previa.total_nuevo)}</div>
                <div className={`text-lg font-bold ${dif > 0 ? "text-red-700" : dif < 0 ? "text-green-700" : "text-slate-500"}`}>
                  {dif === 0 ? "Sin cambios en el valor" : dif > 0 ? `Sube ${clp(dif)}` : `Baja ${clp(-dif)}`}
                </div>
                {dif !== 0 && <p className={ayuda}>La diferencia se reparte entre los pagos que aún no se han recibido.</p>}
              </>
            ) : (
              <div className="text-lg text-slate-400">Calculando...</div>
            )}
          </div>

          {dif !== 0 && (
            <div>
              <label className={campo}>¿Por qué cambia el valor? *</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: subió el precio del zinc" />
            </div>
          )}

          <button onClick={guardarValor} className={`${botonGrande} bg-blue-900 text-white hover:bg-blue-800`}>
            Guardar cambios
          </button>
        </section>
      )}

      {panel === "avance" && (
        <section className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-2xl font-black">Pagos del cliente</h3>
            {cot.hitos_pago.map((h) => (
              <div key={h.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-2 border-slate-200 rounded-xl p-4">
                <div>
                  <div className="text-base text-slate-600">{NOMBRE_HITO[h.fase] || h.fase}</div>
                  <div className="text-2xl font-black">{clp(h.monto_pago)}</div>
                </div>
                <button
                  onClick={() => cambiarPago(h)}
                  className={`px-5 py-3 rounded-xl text-lg font-bold border-2 cursor-pointer ${
                    h.estado === "PAGADO" ? "bg-green-100 text-green-900 border-green-600" : "bg-amber-100 text-amber-900 border-amber-500"
                  }`}
                >
                  {h.estado === "PAGADO" ? "✓ Recibido" : "Pendiente · marcar recibido"}
                </button>
              </div>
            ))}
            {gan?.hito_avance_exigible && (
              <p className="text-lg text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl p-3 font-semibold">
                La obra ya va en el 50 %: corresponde cobrar el 2.º pago.
              </p>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-2xl font-black">Cómo va la obra</h3>
            <div>
              <label className={campo}>Avance de la obra (%)</label>
              <input type="number" min="0" max="100" value={avance} onChange={(e) => setAvance(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className={campo}>Lo gastado hasta ahora ($)</label>
              <input type="number" min="0" value={gasto} onChange={(e) => setGasto(parseFloat(e.target.value) || 0)} />
            </div>
            <button onClick={guardarObra} className={`${botonGrande} bg-blue-900 text-white hover:bg-blue-800`}>
              Guardar avance
            </button>
          </div>

          {gan && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-lg">
              <h3 className="text-2xl font-black mb-2">Resumen para la empresa</h3>
              <div className="flex justify-between"><span>Ganancia estimada</span><strong>{clp(gan.ganancia_estimada)}</strong></div>
              <div className="flex justify-between"><span>Ganancia con lo gastado hasta hoy</span><strong>{clp(gan.ganancia_real)}</strong></div>
              <div className="flex justify-between text-slate-500 text-base"><span>Cobrado sin IVA</span><span>{clp(gan.neto_cobrado)}</span></div>
            </div>
          )}
        </section>
      )}

      <details className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <summary className="text-xl font-bold cursor-pointer">Cambios anteriores del valor ({cambios.length})</summary>
        {cambios.length === 0 ? (
          <p className="text-base text-slate-500 pt-3">Todavía no se ha cambiado el valor de esta cotización.</p>
        ) : (
          <ul className="divide-y divide-slate-200 pt-3">
            {cambios.map((c) => (
              <li key={c.id} className="py-3 text-base">
                <strong>{clp(c.total_anterior)} → {clp(c.total_nuevo)}</strong> · {c.motivo}
                <div className="text-sm text-slate-500">{c.usuario} · {new Date(c.fecha).toLocaleDateString("es-CL")}</div>
              </li>
            ))}
          </ul>
        )}
      </details>
      </div>
    </div>
  );
}
