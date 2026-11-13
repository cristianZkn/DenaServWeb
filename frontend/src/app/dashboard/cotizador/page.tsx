"use client";

/**
 * Nueva cotización.
 *
 * El valor de la obra se arma exclusivamente con la lista:
 *   materiales + mano de obra + traslado (según la distancia) + vigas a la vista + ganancia por defecto.
 * Cada vez que cambia un dato, el servidor recalcula el presupuesto (`/api/cotizaciones/calcular`) y esta
 * pantalla solo lo muestra; el mismo cálculo se repite al guardar, por lo que nunca se confía en montos del navegador.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { errorDatosCliente, formatearRut } from "@/lib/validar";

// ---------------------------------------------------------------- tipos

interface CatalogoItem {
  id: number;
  categoria: string;
  nombre: string;
  unidad_medida: string;
}

/** Material de la lista, tal como lo edita el usuario (la cantidad se guarda como texto mientras se escribe). */
interface MaterialLista { catalogo_id: number; cantidad: string }

/** Una línea de mano de obra: `cantidad` de trabajadores que cobran el mismo monto cada uno. */
interface LineaManoObra { cantidad: string; cobro: string }

/** Respuesta del servidor ya convertida a números. */
interface Presupuesto {
  materiales: number;
  vigas: number;
  manoObra: number;
  flete: number;
  ganancia: number;
  neto: number;
  iva: number;
  total: number;
  hitos: { fase: string; porcentaje: number; monto: number }[];
  materialesLinea: { id: number; nombre: string; unidad: string; cantidad: number; precioNeto: number; subtotal: number }[];
  manoObraLinea: { cantidad: number; cobro: number; subtotal: number }[];
}

// ---------------------------------------------------------------- constantes y utilidades

const ETIQUETA_CATEGORIA: Record<string, string> = {
  BASE_TERRENO: "Bases (cantidad en m²)",
  REVESTIMIENTO: "Revestimientos (cantidad en m²)",
  TECHUMBRE: "Techumbre",
  TABIQUERIA: "Tabiquería",
  BASE_RADIER: "Base y radier",
  INSUMO: "Otros materiales",
};
const FASES: Record<string, string> = { ANTICIPO_40: "Anticipo", AVANCE_30: "Avance de obra", ENTREGA_30: "Entrega" };

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const num = (v: string) => Number(v) || 0;

const inputCls =
  "w-full h-12 px-3 text-lg border-2 border-slate-300 rounded-lg bg-white focus:border-blue-900 focus:outline-none focus:ring-4 focus:ring-blue-900/10";
const labelCls = "block text-base font-semibold text-slate-800 mb-1.5";
const helpCls = "text-sm text-slate-500 mt-1.5";
const botonAgregar =
  "h-12 px-5 font-bold text-white bg-green-700 hover:bg-green-800 rounded-lg cursor-pointer disabled:opacity-50";

// ---------------------------------------------------------------- componentes de presentación

/** Campo numérico: conserva el texto tal como se escribe (así «10» no queda «010») y selecciona su contenido al entrar. */
function NumberField({
  label, help, name, value, onChange, step, suffix, required, max,
}: {
  label: string; help?: string; name: string; value: string; onChange: (name: string, v: string) => void;
  step?: string; suffix?: string; required?: boolean; max?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>{label}</label>
      <div className="relative">
        <input
          id={name} name={name} type="number" inputMode="decimal" min="0" max={max} step={step} placeholder="0"
          value={value} required={required}
          onFocus={(e) => e.target.select()}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          onChange={(e) => onChange(name, e.target.value)}
          className={`${inputCls} ${suffix ? "pr-14" : ""}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">{suffix}</span>}
      </div>
      {help && <p className={helpCls}>{help}</p>}
    </div>
  );
}

/** Sección del formulario con su título. */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-7 space-y-5 min-w-0">
      <h2 className="text-lg sm:text-xl font-bold text-slate-900">{titulo}</h2>
      {children}
    </section>
  );
}

/** Línea del presupuesto con guía punteada entre el concepto y el monto, como en un presupuesto impreso. */
function Linea({ concepto, monto }: { concepto: string; monto: number }) {
  return (
    <li className="flex items-baseline gap-2 text-slate-700">
      <span>{concepto}</span>
      <span className="flex-1 border-b-2 border-dotted border-slate-300 translate-y-[-3px]" aria-hidden />
      <span className="tabular-nums">{clp(monto)}</span>
    </li>
  );
}

// ---------------------------------------------------------------- página

export default function CotizadorPage() {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [error, setError] = useState("");
  const [errorCalculo, setErrorCalculo] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);

  // Datos generales. Los numéricos se guardan como texto y se convierten al calcular o guardar.
  const [formData, setFormData] = useState({
    cliente_nombre: "",
    cliente_telefono: "",
    cliente_rut: "",
    direccion_terreno: "",
    estado: "BORRADOR",
    tipo_proyecto: "CASA",
    superficie_m2: "54",
    distancia_flete_km: "25",
    m2_vigas_vista: "",
  });
  const setCampo = (name: string, value: string) => setFormData((prev) => ({ ...prev, [name]: value }));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCampo(e.target.name, e.target.value);
  const esCasa = formData.tipo_proyecto === "CASA";

  // ---- Materiales: catálogo disponible y lista elegida
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [materiales, setMateriales] = useState<MaterialLista[]>([]);
  const [materialElegido, setMaterialElegido] = useState("");
  const [cantidadElegida, setCantidadElegida] = useState("1");

  const agregarMaterial = () => {
    const id = Number(materialElegido);
    if (!id || num(cantidadElegida) <= 0) return;
    // Si el material ya está en la lista, se suma la cantidad en lugar de duplicar la fila.
    setMateriales((prev) =>
      prev.some((m) => m.catalogo_id === id)
        ? prev.map((m) => (m.catalogo_id === id ? { ...m, cantidad: String(num(m.cantidad) + num(cantidadElegida)) } : m))
        : [...prev, { catalogo_id: id, cantidad: cantidadElegida }]
    );
    setMaterialElegido("");
    setCantidadElegida("1");
  };

  // ---- Mano de obra: un solo monto para todos, o pagos diferenciados (una línea por cada monto distinto)
  const [pagosDiferenciados, setPagosDiferenciados] = useState(false);
  const [manoObraIgual, setManoObraIgual] = useState<LineaManoObra>({ cantidad: "", cobro: "" });
  const [manoObraLineas, setManoObraLineas] = useState<LineaManoObra[]>([{ cantidad: "1", cobro: "" }]);
  const actualizarLinea = (i: number, campo: keyof LineaManoObra, valor: string) =>
    setManoObraLineas((prev) => prev.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)));

  // ---- Lo que se envía al servidor (solo datos completos y válidos)
  const materialesValidos = useMemo(
    () => materiales.filter((m) => num(m.cantidad) > 0).map((m) => ({ catalogo_id: m.catalogo_id, cantidad: num(m.cantidad) })),
    [materiales]
  );
  const manoObraValida = useMemo(() => {
    const lineas = pagosDiferenciados ? manoObraLineas : [manoObraIgual];
    return lineas
      .filter((l) => num(l.cantidad) >= 1 && l.cobro !== "" && num(l.cobro) >= 0)
      .map((l) => ({ cantidad: Math.floor(num(l.cantidad)), cobro: num(l.cobro) }));
  }, [pagosDiferenciados, manoObraIgual, manoObraLineas]);

  // Carga del catálogo de materiales activos.
  useEffect(() => {
    const cargar = async () => {
      const token = localStorage.getItem("token");
      if (!token) return router.push("/login");
      try {
        const res = await fetch("/api/catalogo-tipos/?activo=true", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setCatalogo(await res.json());
      } catch {
        setError("No fue posible cargar los materiales. Recargue la página.");
      } finally {
        setCargandoCatalogo(false);
      }
    };
    cargar();
  }, [router]);

  // Recalcula el presupuesto en el servidor 300 ms después del último cambio.
  const claveLista = JSON.stringify([materialesValidos, manoObraValida]);
  useEffect(() => {
    if (cargandoCatalogo) return;
    const temporizador = setTimeout(async () => {
      setCalculando(true);
      try {
        const res = await fetch("/api/cotizaciones/calcular", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: JSON.stringify({
            superficie_m2: num(formData.superficie_m2),
            distancia_km: num(formData.distancia_flete_km),
            m2_vigas_vista: num(formData.m2_vigas_vista),
            tipo_proyecto: formData.tipo_proyecto,
            modo_lista: true,
            materiales: materialesValidos,
            maestros: manoObraValida, // el servidor llama «maestros» a las líneas de mano de obra
          }),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorCalculo(r.message || "No fue posible calcular el valor con los datos ingresados. Revise los metros y la distancia.");
          return;
        }
        setErrorCalculo("");
        setPresupuesto({
          materiales: Number(r.costo_materiales_total),
          vigas: Number(r.costo_vigas_vista || 0),
          manoObra: Number(r.costo_mano_obra),
          flete: Number(r.costo_flete),
          ganancia: Number(r.ganancia || 0),
          neto: Number(r.neto),
          iva: Number(r.iva),
          total: Number(r.total),
          hitos: (r.hitos || []).map((h: any) => ({ fase: h.fase, porcentaje: Number(h.porcentaje), monto: Number(h.monto) })),
          materialesLinea: (r.adicionales || []).map((a: any) => ({
            id: a.id, nombre: a.nombre, unidad: a.unidad, cantidad: Number(a.cantidad),
            precioNeto: Number(a.precio_neto), subtotal: Number(a.subtotal),
          })),
          manoObraLinea: (r.mano_obra_lineas || []).map((m: any) => ({ cantidad: Number(m.cantidad), cobro: Number(m.cobro), subtotal: Number(m.subtotal) })),
        });
      } catch {
        setErrorCalculo("Sin conexión con el servidor. El valor se actualizará al restablecerse.");
      } finally {
        setCalculando(false);
      }
    }, 300);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoCatalogo, formData.superficie_m2, formData.distancia_flete_km, formData.m2_vigas_vista, formData.tipo_proyecto, claveLista]);

  // Guarda la cotización: el servidor vuelve a calcular todo con estos mismos datos.
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const errorDatos = errorDatosCliente({
      nombre: formData.cliente_nombre, telefono: formData.cliente_telefono,
      rut: formData.cliente_rut, direccion: formData.direccion_terreno,
    });
    if (errorDatos) return setError(errorDatos);
    if (num(formData.superficie_m2) <= 0) return setError("Los metros cuadrados deben ser mayores a 0.");
    if (materialesValidos.length === 0 && manoObraValida.length === 0) {
      return setError("Agregue al menos un material o mano de obra: de lo contrario, el valor de la obra queda en cero.");
    }
    if (!presupuesto) return setError("Espere a que se calcule el valor de la obra antes de guardar.");

    setGuardando(true);
    try {
      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          ...formData,
          superficie_m2: num(formData.superficie_m2),
          distancia_flete_km: num(formData.distancia_flete_km),
          m2_vigas_vista: num(formData.m2_vigas_vista),
          modo_lista: true,
          materiales: materialesValidos,
          maestros: manoObraValida,
        }),
      });
      if (res.ok) return router.push("/dashboard");
      const detalle = await res.json().catch(() => ({}));
      setError(`No fue posible guardar la cotización: ${detalle.message || JSON.stringify(detalle)}`);
    } catch {
      setError("Sin conexión con el servidor. Intente nuevamente.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoCatalogo) return <div className="p-8 text-center text-slate-500 font-bold">Cargando información...</div>;

  const categorias = Array.from(new Set(catalogo.map((c) => c.categoria)));
  const totalLineas = presupuesto ? presupuesto.materialesLinea.length + presupuesto.manoObraLinea.length : 0;

  return (
    <form onSubmit={guardar} className="max-w-6xl mx-auto pb-28 lg:pb-0">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Nueva cotización</h1>
        <p className="text-slate-600 mt-1">Complete la información solicitada. El valor de la obra se actualiza en el panel lateral.</p>
      </div>

      {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 mb-6 rounded-r-md">{error}</div>}

      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="space-y-6">
          {/* 1. Cliente y terreno */}
          <Seccion titulo="Datos del cliente y del terreno">
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="cliente_nombre" className={labelCls}>Nombre del cliente</label>
                <input id="cliente_nombre" name="cliente_nombre" value={formData.cliente_nombre} onChange={handleChange}
                  placeholder="Ej.: Carolina Rojas" className={inputCls} required minLength={3} maxLength={150} />
              </div>
              <div>
                <label htmlFor="cliente_rut" className={labelCls}>RUT del cliente</label>
                <input id="cliente_rut" name="cliente_rut" value={formData.cliente_rut}
                  onChange={(e) => setCampo("cliente_rut", formatearRut(e.target.value))}
                  placeholder="12.345.678-5" maxLength={12} className={inputCls} />
              </div>
              <div>
                <label htmlFor="cliente_telefono" className={labelCls}>Teléfono o WhatsApp</label>
                <input id="cliente_telefono" name="cliente_telefono" type="tel" value={formData.cliente_telefono}
                  onChange={(e) => setCampo("cliente_telefono", e.target.value.replace(/[^\d+\s]/g, ""))}
                  placeholder="+56 9 8765 4321" maxLength={16} className={inputCls} />
              </div>
            </div>
            <div className="grid sm:grid-cols-[1fr_12rem] gap-5">
              <div>
                <label htmlFor="direccion_terreno" className={labelCls}>Dirección del terreno</label>
                <input id="direccion_terreno" name="direccion_terreno" value={formData.direccion_terreno} onChange={handleChange}
                  placeholder="Ej.: Parcela 14, Camino Los Boldos, Limache" className={inputCls} required minLength={5} maxLength={255} />
              </div>
              <div>
                <label htmlFor="estado" className={labelCls}>Estado inicial</label>
                <select id="estado" name="estado" value={formData.estado} onChange={handleChange} className={inputCls}>
                  <option value="BORRADOR">En preparación</option>
                  <option value="ACEPTADA">En ejecución</option>
                </select>
              </div>
            </div>
          </Seccion>

          {/* 2. Características generales de la obra */}
          <Seccion titulo="Características de la obra">
            <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de proyecto">
              {[
                { v: "CASA", t: "Casa", d: "Vivienda prefabricada completa" },
                { v: "SOLO_RADIER", t: "Solo radier", d: "Losa de hormigón únicamente" },
              ].map((o) => {
                const activo = formData.tipo_proyecto === o.v;
                return (
                  <button key={o.v} type="button" role="radio" aria-checked={activo} onClick={() => setCampo("tipo_proyecto", o.v)}
                    className={`text-left rounded-xl border-2 p-4 cursor-pointer transition focus:outline-none focus:ring-4 focus:ring-blue-900/15 ${
                      activo ? "border-blue-900 bg-blue-50" : "border-slate-300 bg-white hover:border-slate-400"
                    }`}>
                    <span className="block text-lg font-bold text-slate-900">{o.t}</span>
                    <span className="block text-sm text-slate-600">{o.d}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <NumberField label="Superficie" name="superficie_m2" value={formData.superficie_m2} onChange={setCampo}
                step="0.5" suffix="m²" required max={10000} />
              <NumberField label="Distancia hasta el terreno" name="distancia_flete_km" value={formData.distancia_flete_km}
                onChange={setCampo} suffix="km" required max={3000} help="Determina el costo de traslado." />
            </div>

            {esCasa && (
              <>
                <NumberField label="Superficie con vigas a la vista" name="m2_vigas_vista" value={formData.m2_vigas_vista}
                  onChange={setCampo} suffix="m²" max={10000} help="Se suman $65.000 por cada m² con vigas a la vista." />
                <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  El relleno de estabilizado no se incluye en esta etapa: se mide durante la visita al terreno y se agrega
                  posteriormente desde el listado de cotizaciones.
                </p>
              </>
            )}
          </Seccion>

          {/* 3. Materiales */}
          <Seccion titulo="Materiales">
            <p className="text-slate-600 -mt-2">
              Agregue todos los materiales de la obra: base, revestimiento, madera, cemento, arena, entre otros. Cada uno se
              valoriza al precio con descuento del proveedor.
            </p>
            <div className="grid sm:grid-cols-[1fr_8rem_auto] gap-3 items-end">
              <div>
                <label htmlFor="material" className={labelCls}>Material</label>
                <select id="material" value={materialElegido} onChange={(e) => setMaterialElegido(e.target.value)} className={inputCls}>
                  <option value="">Seleccione un material</option>
                  {categorias.map((cat) => (
                    <optgroup key={cat} label={ETIQUETA_CATEGORIA[cat] || cat}>
                      {catalogo.filter((c) => c.categoria === cat).map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre} ({c.unidad_medida.toLowerCase()})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cantidad_material" className={labelCls}>Cantidad</label>
                <input id="cantidad_material" type="number" inputMode="decimal" min="0" step="any" value={cantidadElegida}
                  onFocus={(e) => e.target.select()} onChange={(e) => setCantidadElegida(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarMaterial(); } }} className={inputCls} />
              </div>
              <button type="button" onClick={agregarMaterial} disabled={!materialElegido || num(cantidadElegida) <= 0} className={botonAgregar}>
                Agregar a la lista
              </button>
            </div>
            {catalogo.length === 0 && (
              <p className="text-sm text-slate-500">No existen materiales registrados. Agréguelos en «Materiales y precios».</p>
            )}

            {materiales.length > 0 && (
              <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                {materiales.map((m) => {
                  const nombre = catalogo.find((c) => c.id === m.catalogo_id)?.nombre ?? `Material ${m.catalogo_id}`;
                  const linea = presupuesto?.materialesLinea.find((a) => a.id === m.catalogo_id);
                  return (
                    <li key={m.catalogo_id} className="p-3 flex flex-wrap items-center gap-3">
                      <div className="basis-full sm:basis-0 sm:flex-1 sm:min-w-[10rem]">
                        <div className="font-semibold text-slate-900">{nombre}</div>
                        <div className="text-sm text-slate-500">{linea ? `${clp(linea.precioNeto)} por unidad (con descuento)` : "Calculando…"}</div>
                      </div>
                      <input type="number" inputMode="decimal" min="0" step="any" value={m.cantidad} aria-label={`Cantidad de ${nombre}`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setMateriales((prev) => prev.map((x) => (x.catalogo_id === m.catalogo_id ? { ...x, cantidad: e.target.value } : x)))}
                        className="!w-24 h-11 px-2 text-lg border-2 border-slate-300 rounded-lg" />
                      <span className="ml-auto sm:ml-0 sm:w-28 text-right font-bold tabular-nums">{linea ? clp(linea.subtotal) : "—"}</span>
                      <button type="button" onClick={() => setMateriales((prev) => prev.filter((x) => x.catalogo_id !== m.catalogo_id))}
                        className="text-red-700 font-semibold hover:underline cursor-pointer">Quitar</button>
                    </li>
                  );
                })}
                <li className="p-3 flex justify-between font-bold bg-slate-50 rounded-b-xl">
                  <span>Total de materiales</span>
                  <span className="tabular-nums">{presupuesto ? clp(presupuesto.materiales) : "—"}</span>
                </li>
              </ul>
            )}
          </Seccion>

          {/* 4. Mano de obra */}
          <Seccion titulo="Mano de obra">
            <p className="text-slate-600 -mt-2">
              Indique la cantidad de trabajadores y el monto que cobrará cada uno por la totalidad de la obra.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="!w-5 !min-h-0" checked={pagosDiferenciados}
                onChange={(e) => setPagosDiferenciados(e.target.checked)} />
              <span className="font-semibold text-slate-800">Los trabajadores cobran montos distintos (pagos diferenciados)</span>
            </label>

            {!pagosDiferenciados ? (
              <div className="grid sm:grid-cols-2 gap-5">
                <NumberField label="Cantidad de trabajadores" name="mo_cantidad" value={manoObraIgual.cantidad}
                  onChange={(_, v) => setManoObraIgual({ ...manoObraIgual, cantidad: v })} step="1" max={100} />
                <NumberField label="Cobro por trabajador" name="mo_cobro" value={manoObraIgual.cobro}
                  onChange={(_, v) => setManoObraIgual({ ...manoObraIgual, cobro: v })} step="1000" suffix="$" />
              </div>
            ) : (
              <div className="space-y-3">
                {manoObraLineas.map((l, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[8rem_12rem_1fr_auto] gap-3 items-end">
                    <NumberField label="Cantidad" name={`mo_cantidad_${i}`} value={l.cantidad}
                      onChange={(_, v) => actualizarLinea(i, "cantidad", v)} step="1" max={100} />
                    <NumberField label="Cobro por trabajador" name={`mo_cobro_${i}`} value={l.cobro}
                      onChange={(_, v) => actualizarLinea(i, "cobro", v)} step="1000" suffix="$" />
                    <div className="col-span-2 sm:contents flex items-center justify-between gap-3 border-b border-slate-100 pb-3 sm:border-0 sm:pb-0">
                      <span className="sm:h-12 flex items-center sm:justify-end font-bold tabular-nums">
                        {clp(Math.floor(num(l.cantidad)) * num(l.cobro))}
                      </span>
                      <button type="button" disabled={manoObraLineas.length === 1} aria-label={`Quitar línea ${i + 1}`}
                        onClick={() => setManoObraLineas((prev) => prev.filter((_, k) => k !== i))}
                        className="sm:h-12 px-2 text-red-700 font-semibold hover:underline cursor-pointer disabled:opacity-40">Quitar</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setManoObraLineas((prev) => [...prev, { cantidad: "1", cobro: "" }])}
                  className="font-semibold text-blue-800 hover:underline cursor-pointer">+ Agregar otro monto</button>
              </div>
            )}
            <p className="flex justify-between border-t border-slate-200 pt-3 font-bold">
              <span>Total de mano de obra</span>
              <span className="tabular-nums">{presupuesto ? clp(presupuesto.manoObra) : "—"}</span>
            </p>
          </Seccion>
        </div>

        {/* Panel lateral: presupuesto en vivo */}
        <aside className="lg:sticky lg:top-6" aria-live="polite">
          <div className="rounded-2xl overflow-hidden border border-slate-300 bg-white shadow-sm">
            <div className="bg-blue-900 text-white px-4 sm:px-6 py-5">
              <p className="text-sm text-blue-200">Valor de la obra, IVA incluido</p>
              <p className={`text-3xl sm:text-4xl font-black tabular-nums tracking-tight mt-1 transition-opacity ${calculando ? "opacity-60" : ""}`}>
                {presupuesto ? clp(presupuesto.total) : "—"}
              </p>
              <p className="text-sm text-blue-200 mt-1 h-5">{calculando ? "Calculando…" : ""}</p>
            </div>

            <div className="px-4 sm:px-6 py-5 space-y-5">
              {errorCalculo && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">{errorCalculo}</p>}

              {presupuesto && (
                <>
                  <ul className="space-y-2.5 text-base">
                    <Linea concepto="Materiales" monto={presupuesto.materiales} />
                    <Linea concepto="Mano de obra" monto={presupuesto.manoObra} />
                    <Linea concepto="Traslado" monto={presupuesto.flete} />
                    {presupuesto.vigas > 0 && <Linea concepto="Vigas a la vista" monto={presupuesto.vigas} />}
                    <Linea concepto="Margen de la empresa" monto={presupuesto.ganancia} />
                    <li className="border-t border-slate-200 pt-2.5">
                      <ul className="space-y-2.5">
                        <Linea concepto="Valor neto" monto={presupuesto.neto} />
                        <Linea concepto="IVA (19 %)" monto={presupuesto.iva} />
                      </ul>
                    </li>
                  </ul>

                  <section aria-labelledby="detalle-titulo" className="border-t border-slate-200 pt-4">
                    <div className="flex items-baseline justify-between">
                      <h2 id="detalle-titulo" className="text-base font-bold text-slate-900">Detalle de la lista</h2>
                      <span className="text-sm text-slate-500 shrink-0">{totalLineas} {totalLineas === 1 ? "partida" : "partidas"}</span>
                    </div>
                    {totalLineas === 0 ? (
                      <p className="py-3 text-sm text-slate-500">Agregue materiales y mano de obra para conformar el valor de la obra.</p>
                    ) : (
                      <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100 text-sm pr-1">
                        {presupuesto.manoObraLinea.map((m, i) => (
                          <li key={`mo-${i}`} className="py-2 flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-800">Mano de obra</div>
                              <div className="text-slate-500">{m.cantidad} {m.cantidad === 1 ? "trabajador" : "trabajadores"} × {clp(m.cobro)}</div>
                            </div>
                            <span className="font-bold tabular-nums whitespace-nowrap">{clp(m.subtotal)}</span>
                          </li>
                        ))}
                        {presupuesto.materialesLinea.map((a) => (
                          <li key={`mat-${a.id}`} className="py-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800">{a.nombre}</div>
                              <div className="text-slate-500">{a.cantidad.toLocaleString("es-CL")} {a.unidad.toLowerCase()}</div>
                            </div>
                            <span className="font-bold tabular-nums whitespace-nowrap">{clp(a.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {presupuesto.hitos.length > 0 && (
                    <div>
                      <p className="text-base font-semibold text-slate-800 mb-2">Forma de pago</p>
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-3" aria-hidden>
                        {presupuesto.hitos.map((h, i) => (
                          <div key={h.fase} style={{ width: `${h.porcentaje}%` }} className={i === 0 ? "bg-blue-900" : i === 1 ? "bg-blue-600" : "bg-blue-300"} />
                        ))}
                      </div>
                      <ul className="space-y-2 text-sm">
                        {presupuesto.hitos.map((h) => <Linea key={h.fase} concepto={`${FASES[h.fase] || h.fase} ${h.porcentaje}%`} monto={h.monto} />)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="hidden lg:flex gap-3 px-6 pb-6">
              <button type="button" onClick={() => router.push("/dashboard")}
                className="px-5 h-12 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando || !presupuesto}
                className="flex-1 h-12 font-bold text-lg text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-50 transition focus:outline-none focus:ring-4 focus:ring-blue-900/25">
                {guardando ? "Guardando…" : "Guardar cotización"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Barra inferior en pantallas pequeñas: el valor total permanece visible */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-300 p-3 flex items-center gap-3 z-20">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500">Valor de la obra</p>
          <p className="text-lg sm:text-xl font-black text-blue-900 tabular-nums truncate">{presupuesto ? clp(presupuesto.total) : "—"}</p>
        </div>
        <button type="submit" disabled={guardando || !presupuesto} className="px-5 sm:px-6 h-12 shrink-0 font-bold text-white bg-blue-900 rounded-lg cursor-pointer disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
