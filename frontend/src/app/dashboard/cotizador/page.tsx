"use client";

/**
 * Nueva cotización.
 *
 * El valor de la obra se arma exclusivamente con la lista:
 *   materiales + mano de obra (tarifa por m² x trabajadores) + traslado (combustible según km y días) + ganancia.
 * Cada vez que cambia un dato, el servidor recalcula el presupuesto (`/api/cotizaciones/calcular`) y esta
 * pantalla solo lo muestra; el mismo cálculo se repite al guardar, por lo que nunca se confía en montos del navegador.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { errorDatosCliente, formatearRut } from "@/lib/validar";
import SelectorMaterial, { unidadDe } from "@/components/SelectorMaterial";
import { CATEGORIAS } from "@/lib/categorias";

// ---------------------------------------------------------------- tipos

interface CatalogoItem {
  id: number;
  categoria: string;
  nombre: string;
  unidad_medida: string;
  proveedor?: { razon_social: string } | null;
  precio_neto: number;
  m2_por_unidad: number;
  mano_obra_m2: number;
}

/** Material de la lista, tal como lo edita el usuario (la cantidad se guarda como texto mientras se escribe). */
interface MaterialLista { catalogo_id: number; cantidad: string }

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
  manoObraDetalle: { concepto: string; m2: number; tarifa: number; trabajadores: number; subtotal: number }[];
  traslado: { km: number; dias: number; litros: number; precioLitro: number; costo: number };
  diasTotal: number;
}

// ---------------------------------------------------------------- constantes y utilidades

// Nombres de las categorías para el selector: los generales más los matices propios del cotizador.
const ETIQUETA_CATEGORIA: Record<string, string> = {
  ...Object.fromEntries(CATEGORIAS.map((c) => [c.key, c.label])),
  BASE_TERRENO: "Bases (cantidad en m²)",
  REVESTIMIENTO: "Revestimientos (cantidad en m²)",
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
    tipo_proyecto: "CASA",
    superficie_m2: "",
    distancia_flete_km: "",
    m2_vigas_vista: "",
    dias_obra: "",
  });
  const [llevaRadier, setLlevaRadier] = useState(false);
  const [tarifaRadier, setTarifaRadier] = useState("");
  const [precioLitro, setPrecioLitro] = useState("");
  const [nTrabajadores, setNTrabajadores] = useState("");
  const setCampo = (name: string, value: string) => setFormData((prev) => ({ ...prev, [name]: value }));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCampo(e.target.name, e.target.value);
  const esCasa = formData.tipo_proyecto === "CASA";

  // ---- Materiales: catálogo disponible y lista elegida
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [materiales, setMateriales] = useState<MaterialLista[]>([]);
  const [materialElegido, setMaterialElegido] = useState("");
  const [cantidadElegida, setCantidadElegida] = useState("");

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
    setCantidadElegida("");
  };

  // ---- Lo que se envía al servidor (solo datos completos y válidos)
  const materialesValidos = useMemo(
    () => materiales.filter((m) => num(m.cantidad) > 0).map((m) => ({ catalogo_id: m.catalogo_id, cantidad: num(m.cantidad) })),
    [materiales]
  );

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

  // Parámetros de tarifas que se envían tanto al calcular como al guardar. El radier suma 4 días de fabricación.
  const parametrosTarifas = {
    modo_tarifas: true,
    n_trabajadores: Math.floor(num(nTrabajadores)),
    dias_obra: Math.floor(num(formData.dias_obra)),
    lleva_radier: !esCasa || llevaRadier,
    tarifa_radier_m2: num(tarifaRadier),
    precio_litro: num(precioLitro) > 0 ? num(precioLitro) : undefined,
  };

  // Recalcula el presupuesto en el servidor 300 ms después del último cambio.
  const claveLista = JSON.stringify([materialesValidos]);
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
            ...parametrosTarifas,
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
          manoObraDetalle: (r.mano_obra_detalle || []).map((m: any) => ({
            concepto: m.concepto, m2: Number(m.m2), tarifa: Number(m.tarifa), trabajadores: Number(m.trabajadores), subtotal: Number(m.subtotal),
          })),
          traslado: {
            km: Number(r.traslado?.km || 0), dias: Number(r.traslado?.dias || 0), litros: Number(r.traslado?.litros || 0),
            precioLitro: Number(r.traslado?.precio_litro || 0), costo: Number(r.traslado?.costo || 0),
          },
          diasTotal: Number(r.dias_total || 0),
        });
      } catch {
        setErrorCalculo("Sin conexión con el servidor. El valor se actualizará al restablecerse.");
      } finally {
        setCalculando(false);
      }
    }, 300);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoCatalogo, formData.superficie_m2, formData.distancia_flete_km, formData.m2_vigas_vista, formData.tipo_proyecto, formData.dias_obra,
      llevaRadier, tarifaRadier, precioLitro, nTrabajadores, claveLista]);

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
    if ((llevaRadier || !esCasa) && num(tarifaRadier) <= 0) return setError("Elija el valor de la mano de obra del radier.");
    if (num(formData.distancia_flete_km) > 0 && num(precioLitro) <= 0) return setError("Indique el precio de la bencina para calcular el traslado.");
    if (num(nTrabajadores) < 1) return setError("Indique la cantidad de trabajadores: la mano de obra se calcula por trabajador.");
    if (num(formData.distancia_flete_km) > 0 && parametrosTarifas.dias_obra + (parametrosTarifas.lleva_radier ? 4 : 0) < 1) {
      return setError("Indique los días de construcción para calcular el traslado.");
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
          ...parametrosTarifas,
        }),
      });
      if (res.ok) return router.push("/dashboard/proyectos");
      const detalle = await res.json().catch(() => ({}));
      setError(`No fue posible guardar el proyecto: ${detalle.message || JSON.stringify(detalle)}`);
    } catch {
      setError("Sin conexión con el servidor. Intente nuevamente.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoCatalogo) return <div className="p-8 text-center text-slate-500 font-bold">Cargando información...</div>;

  const elegido = catalogo.find((c) => String(c.id) === materialElegido);
  // Datos de los que depende el valor y que todavía no se han ingresado
  const pendientes = [
    ...(num(formData.superficie_m2) <= 0 ? ["la superficie"] : []),
    ...(num(nTrabajadores) < 1 ? ["la cantidad de trabajadores"] : []),
    ...(num(formData.distancia_flete_km) > 0 && num(precioLitro) <= 0 ? ["el precio de la bencina"] : []),
    ...(parametrosTarifas.dias_obra + (parametrosTarifas.lleva_radier ? 4 : 0) < 1 && num(formData.distancia_flete_km) > 0 ? ["los días de construcción"] : []),
  ];
  const totalLineas = presupuesto ? presupuesto.materialesLinea.length + presupuesto.manoObraDetalle.length : 0;

  return (
    <form onSubmit={guardar} className="max-w-6xl mx-auto pb-28 lg:pb-0">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Nuevo proyecto</h1>
        <p className="text-slate-600 mt-1">Complete los datos en el orden indicado: cada paso alimenta al siguiente y el valor de la obra se actualiza en el panel lateral.</p>
      </div>

      {error && <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 mb-6 rounded-r-md">{error}</div>}

      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="space-y-6">
          {/* Paso 1: cliente y terreno */}
          <Seccion titulo="1. Datos del cliente y del terreno">
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="cliente_nombre" className={labelCls}>Nombre del cliente</label>
                <input id="cliente_nombre" name="cliente_nombre" value={formData.cliente_nombre} onChange={handleChange}
                  placeholder="Ej.: Carolina Rojas" className={inputCls} required minLength={3} maxLength={150} />
              </div>
              <div>
                <label htmlFor="cliente_rut" className={labelCls}>RUN del cliente</label>
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
            <div>
              <label htmlFor="direccion_terreno" className={labelCls}>Dirección del terreno</label>
              <input id="direccion_terreno" name="direccion_terreno" value={formData.direccion_terreno} onChange={handleChange}
                placeholder="Ej.: Parcela 14, Camino Los Boldos, Limache" className={inputCls} required minLength={5} maxLength={255} />
            </div>
          </Seccion>

          {/* Paso 2: tipo de obra y superficie (definen todas las tarifas por m²) */}
          <Seccion titulo="2. Tipo de obra y superficie">
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
                step="0.5" suffix="m²" required max={10000} help="Con la superficie se calculan la mano de obra y el margen de la empresa." />
              {esCasa && (
                <NumberField label="Superficie con vigas a la vista" name="m2_vigas_vista" value={formData.m2_vigas_vista}
                  onChange={setCampo} suffix="m²" max={10000} help="Se paga un adicional por cada m² con vigas a la vista, a cada trabajador (valor en la sección Tarifas)." />
              )}
            </div>

            {/* Radier o base: suma 4 días y su mano de obra */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              {esCasa ? (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="!w-5 !min-h-0 mt-1" checked={llevaRadier} onChange={(e) => setLlevaRadier(e.target.checked)} />
                  <span>
                    <strong className="text-slate-900">La casa lleva radier o base</strong>
                    <span className="block text-sm text-slate-600">Suma 4 días de fabricación al traslado y se paga su mano de obra por m².</span>
                  </span>
                </label>
              ) : (
                <p className="text-sm text-slate-700"><strong>Radier:</strong> la fabricación toma 4 días, que ya se suman al traslado.</p>
              )}
              {(llevaRadier || !esCasa) && (
                <div className="max-w-xs">
                  <label htmlFor="tarifa_radier" className={labelCls}>Mano de obra del radier (por trabajador)</label>
                  <select id="tarifa_radier" value={tarifaRadier} onChange={(e) => setTarifaRadier(e.target.value)} className={inputCls}>
                    <option value="" disabled>Elija el valor por m²</option>
                    <option value="35000">$35.000 por m²</option>
                    <option value="38000">$38.000 por m²</option>
                  </select>
                </div>
              )}
            </div>
            {esCasa && (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                El relleno de estabilizado no se incluye en esta etapa: se mide durante la visita al terreno y se agrega
                posteriormente desde el listado de proyectos.
              </p>
            )}
          </Seccion>

          {/* Paso 3: trabajadores y días (la mano de obra depende de la superficie y del radier ya indicados) */}
          <Seccion titulo="3. Mano de obra y plazos">
            <p className="text-slate-600 -mt-2">
              A cada trabajador se le paga por m² según las tarifas vigentes (casa, vigas a la vista, radier o base y OSB Smartside Lap).
              Sin la cantidad de trabajadores no se puede calcular la mano de obra.
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              <NumberField label="Cantidad de trabajadores" name="n_trabajadores" value={nTrabajadores}
                onChange={(_, v) => setNTrabajadores(v)} step="1" max={100} required />
              <NumberField label="Días de construcción" name="dias_obra" value={formData.dias_obra} onChange={setCampo}
                step="1" suffix="días" max={365}
                help={esCasa ? "Días que se irá a trabajar al terreno. Determinan el combustible del traslado (siguiente paso)." : "Opcional. El radier ya suma 4 días de fabricación."} />
            </div>
            {presupuesto && presupuesto.manoObraDetalle.length > 0 && (
              <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl text-base">
                {presupuesto.manoObraDetalle.map((m, i) => (
                  <li key={i} className="p-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{m.concepto}</div>
                      <div className="text-sm text-slate-500">
                        {m.m2.toLocaleString("es-CL")} m² × {clp(m.tarifa)} × {m.trabajadores} {m.trabajadores === 1 ? "trabajador" : "trabajadores"}
                      </div>
                    </div>
                    <span className="font-bold tabular-nums whitespace-nowrap">{clp(m.subtotal)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="flex justify-between border-t border-slate-200 pt-3 font-bold">
              <span>Total de mano de obra</span>
              <span className="tabular-nums">{presupuesto ? clp(presupuesto.manoObra) : "—"}</span>
            </p>
          </Seccion>

          {/* Paso 4: traslado (combustible = km ÷ 10 × días: necesita los días del paso anterior) */}
          <Seccion titulo="4. Traslado">
            <p className="text-slate-600 -mt-2">El combustible se calcula con la distancia, los días de trabajo del paso anterior y el precio de la bencina.</p>
            <div className="grid sm:grid-cols-2 gap-5">
              <NumberField label="Distancia total (ida y vuelta)" name="distancia_flete_km" value={formData.distancia_flete_km}
                onChange={setCampo} suffix="km" required max={3000} help="Kilómetros que se recorren en total cada día." />
              <NumberField label="Precio de la bencina" name="precio_litro" value={precioLitro} onChange={(_, v) => setPrecioLitro(v)}
                step="10" suffix="$/L" help="1 litro rinde 10 km." />
            </div>
            {presupuesto && presupuesto.diasTotal > 0 ? (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                {presupuesto.traslado.litros.toLocaleString("es-CL")} litros ({presupuesto.diasTotal} {presupuesto.diasTotal === 1 ? "día" : "días"}
                {parametrosTarifas.lleva_radier ? ", incluye 4 de fabricación del radier" : ""}) × {clp(presupuesto.traslado.precioLitro)} ={" "}
                <strong>{clp(presupuesto.traslado.costo)}</strong>
              </p>
            ) : (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                El traslado queda en $0 hasta indicar los días de construcción en el paso 3.
              </p>
            )}
          </Seccion>

          {/* Paso 5: materiales */}
          <Seccion titulo="5. Materiales">
            <p className="text-slate-600 -mt-2">
              Agregue todos los materiales de la obra: base, revestimiento, madera, cemento, arena, entre otros. Cada uno se
              valoriza al precio con descuento del proveedor.
            </p>
            <SelectorMaterial
              catalogo={catalogo}
              etiquetasCategoria={ETIQUETA_CATEGORIA}
              seleccionado={materialElegido}
              enLista={materiales.map((m) => m.catalogo_id)}
              onSeleccionar={setMaterialElegido}
            />
            <div className="grid sm:grid-cols-[1fr_8rem_auto] gap-3 items-end">
              <p className="text-slate-700 sm:min-h-[2.75rem] sm:flex sm:items-center">
                {elegido ? (
                  <span>
                    <strong>{elegido.nombre}</strong> · {elegido.proveedor?.razon_social ?? "Sin proveedor"} · {clp(elegido.precio_neto)} por {unidadDe(elegido)}
                  </span>
                ) : (
                  <span className="text-slate-500">Elija un material de la lista para agregarlo.</span>
                )}
              </p>
              <div>
                <label htmlFor="cantidad_material" className={labelCls}>Cantidad{elegido ? ` (${unidadDe(elegido)})` : ""}</label>
                <input id="cantidad_material" type="number" inputMode="decimal" min="0" step="any" value={cantidadElegida} placeholder="Ej.: 10"
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
                  const proveedor = catalogo.find((c) => c.id === m.catalogo_id)?.proveedor?.razon_social;
                  const linea = presupuesto?.materialesLinea.find((a) => a.id === m.catalogo_id);
                  return (
                    <li key={m.catalogo_id} className="p-3 flex flex-wrap items-center gap-3">
                      <div className="basis-full sm:basis-0 sm:flex-1 sm:min-w-[10rem]">
                        <div className="font-semibold text-slate-900">{nombre}</div>
                        <div className="text-sm text-slate-500">{linea ? `${proveedor ? `${proveedor} · ` : ""}${clp(linea.precioNeto)} por unidad (con descuento)` : "Calculando…"}</div>
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
              {pendientes.length > 0 && (
                <p className="mt-2 text-sm bg-white/10 rounded-lg p-2.5 text-blue-50">
                  Aún falta indicar: <strong>{pendientes.join(" y ")}</strong>. Mientras tanto el valor es parcial.
                </p>
              )}
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
                      <p className="py-3 text-sm text-slate-500">Indique los trabajadores y agregue materiales para conformar el valor de la obra.</p>
                    ) : (
                      <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100 text-sm pr-1">
                        {presupuesto.manoObraDetalle.map((m, i) => (
                          <li key={`mo-${i}`} className="py-2 flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-800">{m.concepto}</div>
                              <div className="text-slate-500">{m.m2.toLocaleString("es-CL")} m² × {clp(m.tarifa)} × {m.trabajadores} trab.</div>
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
              <button type="button" onClick={() => router.push("/dashboard/proyectos")}
                className="px-5 h-12 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando || !presupuesto}
                className="flex-1 h-12 font-bold text-lg text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-50 transition focus:outline-none focus:ring-4 focus:ring-blue-900/25">
                {guardando ? "Guardando…" : "Guardar proyecto"}
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
