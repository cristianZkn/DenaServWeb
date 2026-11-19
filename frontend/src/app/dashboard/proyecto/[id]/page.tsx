"use client";

import { useDialogo } from "@/components/ConfirmDialog";
import { urlSegura } from "@/lib/url";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorDatosCliente, formatearRut, formatearTelefono, marcarInvalido } from "@/lib/validar";
import ContratoNotarial from "@/components/ContratoNotarial";
import { bajarContrato, unirContrato } from "@/lib/contrato";
import BitacoraAvance, { type RegistroBitacora } from "@/components/BitacoraAvance";
import { claseEstado, etiquetaEstado } from "@/lib/estados";
import { fotoPrivadaADataUrl } from "@/lib/imagenes";
import PagoModal, { COLOR_ESTADO, ETIQUETA_ESTADO, textoBotonPago, type HitoPago } from "@/components/PagoModal";
import type { FichaData } from "@/app/cotizacion/[uuid]/FichaPdf";

const JSON_HDR = { "Content-Type": "application/json" };

interface Item {
  id: number;
  nombre: string;
  precio_base_unitario: number;
}
type Hito = HitoPago;
interface Obra {
  id: number;
  porcentaje_avance_real: number;
}
interface Detalle extends FichaData {
  modo_lista?: boolean;
  cliente_rut?: string | null;
  distancia_flete_km: number;
  token_publico?: string;
  tiene_contrato?: boolean;
  base_terreno?: { nombre: string } | null;
  revestimiento?: { nombre: string } | null;
  detalles_insumo?: { id: number; etapa_obra: string; es_adicional?: boolean; subtotal_costo: number; cantidad_calculada: number }[];
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
  ganancia_estimada: number;
  avance_real: number;
  avance_minimo: number;
  avance_maximo: number;
}
interface Cambio {
  id: number;
  fecha: string;
  usuario: string;
  total_anterior: number;
  total_nuevo: number;
  motivo: string;
}
type Panel = "datos" | "valor" | "materiales" | "avance";

interface LineaMaterial {
  id: number;
  etapa_obra: string;
  cantidad_calculada: number;
  subtotal_costo: number;
  es_adicional?: boolean;
  catalogo_tipo?: {
    nombre: string;
    unidad_medida: string;
    m2_por_unidad?: number;
    fuente_url?: string;
    proveedor?: { razon_social: string } | null;
  } | null;
}
const ETAPA: Record<string, string> = { ETAPA_1: "Etapa 1", ETAPA_2: "Etapa 2" };

const clp = (n: number | string) => "$" + Math.round(Number(n)).toLocaleString("es-CL");
const NOMBRE_HITO: Record<string, string> = {
  ANTICIPO_40: "1.º pago: anticipo (40 %)",
  AVANCE_30: "2.º pago: al llegar al 50 % de avance (30 %)",
  ENTREGA_30: "3.º pago: al entregar las llaves (30 %)",
};

const campo = "block text-base font-semibold text-slate-800 mb-1";
const ayuda = "text-sm text-slate-500 mt-1";
const botonGrande = "px-6 py-3 rounded-xl text-lg font-bold shadow cursor-pointer disabled:opacity-50";

/** Materiales con los que se trabaja el proyecto: desglose por etapa y materiales agregados al cotizar. */
function MaterialesProyecto({ cot }: { cot: Detalle }) {
  const lineas = (cot.detalles_insumo ?? []) as unknown as LineaMaterial[];
  const obra = cot as unknown as { modo_tarifas?: boolean; n_trabajadores?: number; dias_obra?: number; lleva_radier?: boolean };
  const agregados = lineas.filter((l) => l.es_adicional);
  const desglose = lineas.filter((l) => !l.es_adicional);
  const etapas = Array.from(new Set(desglose.map((l) => l.etapa_obra || "ETAPA_1"))).sort();
  const suma = (ls: LineaMaterial[]) => ls.reduce((t, l) => t + Number(l.subtotal_costo), 0);
  const unidad = (l: LineaMaterial) => {
    const u = (l.catalogo_tipo?.unidad_medida ?? "").toLowerCase();
    return (l.catalogo_tipo?.m2_por_unidad ?? 0) > 0 || u === "m2" ? "m²" : u;
  };
  const cantidad = (l: LineaMaterial) => `${Number(l.cantidad_calculada).toLocaleString("es-CL", { maximumFractionDigits: 2 })} ${unidad(l)}`;

  const tabla = (ls: LineaMaterial[]) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-base">
        <thead>
          <tr className="text-sm font-semibold text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3">Material</th>
            <th className="py-2 pr-3">Proveedor</th>
            <th className="py-2 pr-3 text-right">Cantidad</th>
            <th className="py-2 text-right">Costo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ls.map((l) => (
            <tr key={l.id}>
              <td className="py-2 pr-3 font-semibold text-slate-900">
                {l.catalogo_tipo?.fuente_url ? (
                  <a href={urlSegura(l.catalogo_tipo.fuente_url)} target="_blank" rel="noreferrer" className="hover:underline">{l.catalogo_tipo.nombre} ↗</a>
                ) : (
                  l.catalogo_tipo?.nombre ?? "Material eliminado"
                )}
              </td>
              <td className="py-2 pr-3 text-slate-600">{l.catalogo_tipo?.proveedor?.razon_social ?? "—"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{cantidad(l)}</td>
              <td className="py-2 text-right tabular-nums font-bold">{clp(l.subtotal_costo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const bloque = (titulo: string, ayuda: string, ls: LineaMaterial[]) => (
    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xl font-black text-slate-900">{titulo}</h3>
          <p className="text-sm text-slate-500">{ayuda}</p>
        </div>
        <div className="text-base text-slate-600">
          Subtotal: <strong className="text-slate-900">{clp(suma(ls))}</strong>
        </div>
      </div>
      {tabla(ls)}
    </div>
  );

  return (
    <section className="space-y-5">
      {(cot.revestimiento || cot.base_terreno || obra.modo_tarifas) && (
        <div className="flex flex-wrap gap-2 text-base">
          {cot.revestimiento && <span className="px-3 py-1 rounded-lg bg-blue-50 text-blue-900 border border-blue-100">Material exterior: <strong>{cot.revestimiento.nombre}</strong></span>}
          {cot.base_terreno && <span className="px-3 py-1 rounded-lg bg-blue-50 text-blue-900 border border-blue-100">Base: <strong>{cot.base_terreno.nombre}</strong></span>}
          {obra.modo_tarifas && (
            <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
              <strong>{obra.n_trabajadores ?? 0}</strong> {obra.n_trabajadores === 1 ? "trabajador" : "trabajadores"} · <strong>{obra.dias_obra ?? 0}</strong> días de construcción{obra.lleva_radier ? " · lleva radier o base" : ""}
            </span>
          )}
        </div>
      )}

      {lineas.length === 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center text-slate-500 text-lg">
          Este proyecto no tiene una lista de materiales registrada.
        </div>
      )}

      {etapas.map((e) =>
        bloque(`Materiales de la obra · ${ETAPA[e] ?? e}`, "Desglose calculado según los m² de la casa, para organizar las compras.", desglose.filter((l) => (l.etapa_obra || "ETAPA_1") === e))
      )}

      {agregados.length > 0 && bloque("Materiales de la cotización", "Los que se eligieron al cotizar: suman al valor de la obra.", agregados)}
    </section>
  );
}

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
  const [bitacora, setBitacora] = useState<RegistroBitacora[]>([]);

  const cargar = useCallback(async () => {
    try {
      const [rc, rg, rh] = await Promise.all([
        fetch(`/api/cotizaciones/${id}`),
        fetch(`/api/cotizaciones/${id}/ganancias`),
        fetch(`/api/cotizaciones/${id}/cambios`),
      ]);
      if (!rc.ok) throw new Error("No se encontró el proyecto.");
      const c: Detalle = await rc.json();
      setCot(c);
      setGan(rg.ok ? await rg.json() : null);
      setCambios(rh.ok ? await rh.json() : []);
      setForm({
        cliente_nombre: c.cliente_nombre,
        cliente_telefono: c.cliente_telefono || "",
        cliente_rut: c.cliente_rut || "",
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
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    cargar();
    Promise.all([
      fetch("/api/catalogo-tipos/?categoria=BASE_TERRENO&activo=true"),
      fetch("/api/catalogo-tipos/?categoria=REVESTIMIENTO&activo=true"),
    ]).then(async ([a, b]) => {
      if (a.ok) setBases(await a.json());
      if (b.ok) setRevest(await b.json());
    });
  }, [cargar]);

  const payload = (aplicar: boolean, soloDatos = false) => {
    const datos = {
      cliente_nombre: form.cliente_nombre,
      cliente_telefono: form.cliente_telefono || null,
      cliente_rut: form.cliente_rut || null,
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
      const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify(payload(false)) });
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
    const vacios = [["pd-nombre", form.cliente_nombre], ["pd-dir", form.direccion_terreno]].filter(([, v]) => !v.trim()).map(([i]) => i);
    if (vacios.length) { marcarInvalido(...vacios); return avisar("Complete los campos obligatorios marcados en rojo.", true); }
    const err = errorDatosCliente({ nombre: form.cliente_nombre, telefono: form.cliente_telefono, rut: form.cliente_rut, direccion: form.direccion_terreno });
    if (err) return avisar(err, true);
    const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify(payload(true, true)) });
    if (!res.ok) return avisar((await res.json()).message || "No se pudo guardar.", true);
    avisar("Listo: los datos del cliente quedaron guardados.");
    cargar();
  };

  const guardarValor = async () => {
    const dif = previa ? Number(previa.diferencia) : 0;
    if (dif !== 0 && !motivo.trim()) { marcarInvalido("pv-motivo"); return avisar("Escriba por qué cambia el valor (por ejemplo: subió el precio del zinc).", true); }
    const texto = `El valor de la casa pasará de ${clp(previa!.total_anterior)} a ${clp(previa!.total_nuevo)}. ¿Confirma el cambio?`;
    if (!(await preguntar({ titulo: dif === 0 ? "¿Guardar los cambios?" : "¿Confirma el cambio de valor?", mensaje: dif === 0 ? undefined : texto }))) return;
    const res = await fetch(`/api/cotizaciones/${id}`, { method: "PATCH", headers: JSON_HDR, body: JSON.stringify(payload(true)) });
    const data = await res.json();
    if (!res.ok) return avisar(data.message || "No se pudo guardar.", true);
    setMotivo("");
    avisar(Number(data.diferencia) ? `Listo: el valor de la casa ahora es ${clp(data.total_nuevo)}.` : "Listo: cambios guardados.");
    cargar();
  };

  const [pagando, setPagando] = useState<Hito | null>(null);
  const router = useRouter();

  const cancelarCotizacion = async () => {
    if (!cot) return;
    const conPagos = cot.hitos_pago.some((h) => h.estado !== "PENDIENTE");
    const ok = await preguntar({
      titulo: "¿Seguro que desea eliminar este proyecto?",
      mensaje: `Se eliminarán «${cot.codigo_cotizacion}» de ${cot.cliente_nombre}, su lista, su bitácora, su avance y sus pagos${conPagos ? " (incluidos los pagos ya registrados)" : ""}. Esta acción no se puede deshacer.`,
      peligro: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/cotizaciones/${id}`, { method: "DELETE", headers: JSON_HDR });
    if (!res.ok) return avisar("No se pudo eliminar el proyecto.", true);
    router.push("/dashboard/proyectos");
  };
  const { preguntar, dialogo } = useDialogo();

  // La ficha de la empresa es el documento detallado: todos los materiales, la mano de obra, el traslado y la bitácora con fotos.
  const descargarPdf = async () => {
    if (!cot || !gan) return;
    const [rd, { pdf }, { default: FichaEmpresaPdf }] = await Promise.all([
      fetch(`/api/cotizaciones/${id}/desglose`),
      import("@react-pdf/renderer"),
      import("@/app/cotizacion/[uuid]/FichaEmpresaPdf"),
    ]);
    if (!rd.ok) return avisar("No se pudo preparar la ficha de la empresa.", true);
    const desglose = await rd.json();
    const registros = await Promise.all(
      bitacora.map(async (b) => ({ ...b, fotos: (await Promise.all(b.fotos.slice(0, 3).map(fotoPrivadaADataUrl))).filter((f): f is string => !!f) }))
    );
    const ficha = await pdf(<FichaEmpresaPdf c={cot} desglose={desglose} interno={gan} bitacora={registros} />).toBlob();
    const blob = await unirContrato(ficha, cot.tiene_contrato ? await bajarContrato(`/api/cotizaciones/${id}/contrato/`) : null);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cot.codigo_cotizacion}-empresa.pdf`;
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
    <div className="max-w-6xl mx-auto grid lg:grid-cols-[19rem_minmax(0,1fr)] gap-5 items-start">
      {dialogo}
      {/* Resumen siempre a la vista a la izquierda: no hay que volver arriba para ver el valor ni descargar fichas */}
      <aside className="lg:sticky lg:top-20 space-y-3">
        <Link href="/dashboard/proyectos" className="inline-block text-base font-semibold text-blue-800 hover:underline">
          ← Proyectos
        </Link>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">{cot.cliente_nombre}</h1>
            <p className="text-base text-slate-600 mt-1">{cot.direccion_terreno}</p>
            <p className="text-sm text-slate-500">{cot.superficie_m2} m² · {cot.codigo_cotizacion}</p>
            <span className={`inline-block mt-2 text-sm font-semibold px-2.5 py-1 rounded-md border ${claseEstado(cot.estado)}`}>
              {etiquetaEstado(cot.estado)}
            </span>
          </div>
          <div className="bg-blue-900 text-white rounded-xl p-4">
            <div className="text-sm text-blue-200">Valor total, IVA incluido</div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums break-words">{clp(cot.costo_total)}</div>
          </div>
          <div className="grid gap-2">
            <Link href={`/cotizacion/${(cot as any).token_publico}`} className="px-4 py-2.5 text-center text-base font-semibold border border-slate-300 rounded-xl hover:bg-slate-50">
              Ficha del cliente
            </Link>
            <button onClick={descargarPdf} className="px-4 py-2.5 text-base font-semibold border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer">
              Descargar ficha de la empresa (PDF)
            </button>
            <button onClick={cancelarCotizacion} className="px-4 py-2.5 text-base font-semibold text-red-700 border border-red-200 rounded-xl hover:bg-red-50 cursor-pointer">
              Eliminar proyecto
            </button>
          </div>
        </div>
      </aside>

      <div className="space-y-5 min-w-0">
      {msg && <div className="bg-green-50 border-l-8 border-green-600 text-green-900 p-4 rounded-r-xl text-lg font-semibold">{msg}</div>}
      {error && <div className="bg-red-50 border-l-8 border-red-600 text-red-800 p-4 rounded-r-xl text-lg font-semibold">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-2">
        {pestana("valor", "Modificar valor")}
        {pestana("datos", "Datos del cliente")}
        {pestana("materiales", "Materiales")}
        {pestana("avance", "Avance y pagos")}
      </div>

      {panel === "datos" && (
        <section className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div>
            <label className={campo} htmlFor="pd-nombre">Nombre del cliente *</label>
            <input id="pd-nombre" value={form.cliente_nombre} onChange={set("cliente_nombre")} maxLength={150} />
          </div>
          <div>
            <label className={campo}>RUN del cliente</label>
            <input value={form.cliente_rut} onChange={(e) => setForm({ ...form, cliente_rut: formatearRut(e.target.value) })} placeholder="12.345.678-5" maxLength={12} />
          </div>
          <div>
            <label className={campo}>Teléfono</label>
            <input type="tel" value={form.cliente_telefono} onChange={(e) => setForm({ ...form, cliente_telefono: formatearTelefono(e.target.value) })} placeholder="+56 9 8765 4321" maxLength={16} />
          </div>
          <div>
            <label className={campo} htmlFor="pd-dir">Dirección del terreno *</label>
            <input id="pd-dir" value={form.direccion_terreno} onChange={set("direccion_terreno")} maxLength={255} />
          </div>
          <p className={ayuda}>La modificación de estos datos no altera el valor de la obra.</p>
          <button onClick={guardarDatos} className={`${botonGrande} bg-blue-900 text-white hover:bg-blue-800`}>
            Guardar datos
          </button>
        </section>
      )}

      {panel === "valor" && (
        <section className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <p className="text-lg text-slate-700">
            Cambie lo que haya variado. Abajo verá cuánto quedaría el valor de la casa <strong>antes de guardar</strong>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={campo}>Metros cuadrados de la casa</label>
              <input type="number" min="1" step="0.5" value={form.superficie_m2} onChange={set("superficie_m2")} />
            </div>
            <div>
              <label className={campo}>Distancia total ida y vuelta (km)</label>
              <input type="number" min="0" value={form.distancia_flete_km} onChange={set("distancia_flete_km")} />
            </div>
            {cot.modo_lista ? null : esCasa ? (
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
            <h3 className="text-xl font-bold text-slate-900">Ajuste manual del valor total</h3>
            <p className={ayuda}>
              Utilícelo cuando un costo haya variado (por ejemplo, el alza del zinc). Ingrese un monto positivo para <strong>sumar</strong> o
              negativo para <strong>descontar</strong>; por ejemplo, -50000.
            </p>
            <div>
              <label className={campo}>Monto a sumar o restar ($)</label>
              <input type="number" step="1000" value={form.ajuste_monto} onChange={set("ajuste_monto")} />
            </div>
          </div>

          <details className="border border-slate-200 rounded-xl p-4">
            <summary className="text-lg font-semibold text-slate-700 cursor-pointer">Opciones avanzadas</summary>
            <div className="grid sm:grid-cols-2 gap-4 pt-4">
              {esCasa && !cot.modo_lista && (
                <>
                  <div>
                    <label className={campo}>Metros con vigas a la vista</label>
                    <input type="number" min="0" value={form.m2_vigas_vista} onChange={set("m2_vigas_vista")} />
                    <p className={ayuda}>Suma el adicional por m² vigente (ver Tarifas).</p>
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
                {dif !== 0 && <p className={ayuda}>La diferencia se distribuye entre los pagos aún no recibidos.</p>}
              </>
            ) : (
              <div className="text-lg text-slate-400">Calculando...</div>
            )}
          </div>

          {dif !== 0 && (
            <div>
              <label className={campo} htmlFor="pv-motivo">Motivo de la modificación *</label>
              <input id="pv-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: subió el precio del zinc" />
            </div>
          )}

          <button onClick={guardarValor} className={`${botonGrande} bg-blue-900 text-white hover:bg-blue-800`}>
            Guardar cambios
          </button>
        </section>
      )}

      {panel === "materiales" && <MaterialesProyecto cot={cot} />}

      {panel === "avance" && (
        <section className="space-y-6">
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-2xl font-black">Pagos del contrato</h3>
            {cot.hitos_pago.map((h) => (
              <div key={h.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-2 border-slate-200 rounded-xl p-4">
                <div>
                  <div className="text-base text-slate-600">{NOMBRE_HITO[h.fase] || h.fase}</div>
                  <div className="text-2xl font-black">{clp(h.monto_pago)}</div>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded border text-sm font-bold ${COLOR_ESTADO[h.estado] || ""}`}>
                    {ETIQUETA_ESTADO[h.estado] || h.estado}
                  </span>
                  {h.estado === "ABONADO" && (
                    <div className="text-base text-orange-900 font-semibold mt-1">
                      Abonado {clp(h.monto_abonado)} · falta {clp(h.monto_pendiente)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setPagando(h)}
                  className={`px-5 py-3 rounded-xl text-lg font-bold border-2 cursor-pointer ${
                    h.estado === "PAGADO" ? "bg-white text-slate-700 border-slate-300 hover:bg-slate-50" : "bg-green-700 text-white border-green-700 hover:bg-green-800"
                  }`}
                >
                  {textoBotonPago(h)}
                </button>
              </div>
            ))}
          </div>

          <BitacoraAvance
            cotizacionId={cot.id}
            avanceActual={avance}
            minimo={gan?.avance_minimo ?? 0}
            maximo={gan?.avance_maximo ?? 0}
            onCambio={cargar}
            onRegistros={setBitacora}
          />

          <ContratoNotarial cotizacionId={cot.id} adjunto={!!cot.tiene_contrato} onCambio={cargar} />

          {gan && (
            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-lg">
              <h3 className="text-2xl font-black mb-2">Resumen económico</h3>
              <div className="flex justify-between"><span>Ganancia estimada</span><strong>{clp(gan.ganancia_estimada)}</strong></div>
              <div className="flex justify-between text-slate-500 text-base"><span>Cobrado sin IVA</span><span>{clp(gan.neto_cobrado)}</span></div>
            </div>
          )}
        </section>
      )}

      {pagando && <PagoModal hito={pagando} onClose={() => setPagando(null)} onSaved={() => { avisar("Listo: los pagos quedaron actualizados. El estado y el avance se ajustaron según lo pagado."); cargar(); }} />}

      <details className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <summary className="text-xl font-bold cursor-pointer">Historial de modificaciones del valor ({cambios.length})</summary>
        {cambios.length === 0 ? (
          <p className="text-base text-slate-500 pt-3">Este proyecto no registra modificaciones de valor.</p>
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
