"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface CatalogoItem {
  id: number;
  categoria: string;
  nombre: string;
  precio_base_unitario: number;
  unidad_medida: string;
}

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
}

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const FASES: Record<string, string> = { ANTICIPO_40: "Anticipo", AVANCE_30: "Avance de obra", ENTREGA_30: "Entrega" };

const inputCls =
  "w-full h-12 px-3 text-lg border-2 border-slate-300 rounded-lg bg-white focus:border-blue-900 focus:outline-none focus:ring-4 focus:ring-blue-900/10";
const labelCls = "block text-base font-semibold text-slate-800 mb-1.5";
const helpCls = "text-sm text-slate-500 mt-1.5";

// Campo numérico: guarda el texto tal cual se escribe (así "10" no queda "010") y selecciona el contenido al entrar.
function NumberField({
  label, help, name, value, onChange, step, suffix, required,
}: {
  label: string; help?: string; name: string; value: string; onChange: (name: string, v: string) => void;
  step?: string; suffix?: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>{label}</label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          placeholder="0"
          value={value}
          required={required}
          onFocus={(e) => e.target.select()}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          onChange={(e) => onChange(name, e.target.value)}
          className={`${inputCls} ${suffix ? "pr-14" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-base pointer-events-none">{suffix}</span>
        )}
      </div>
      {help && <p className={helpCls}>{help}</p>}
    </div>
  );
}

function Paso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 space-y-5">
      <h2 className="text-xl font-bold text-slate-900">{titulo}</h2>
      {children}
    </section>
  );
}

// Línea de presupuesto con guía punteada entre el concepto y el monto, como en un presupuesto impreso.
function Linea({ concepto, monto, fuerte }: { concepto: string; monto: number; fuerte?: boolean }) {
  return (
    <li className={`flex items-baseline gap-2 ${fuerte ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      <span>{concepto}</span>
      <span className="flex-1 border-b-2 border-dotted border-slate-300 translate-y-[-3px]" aria-hidden />
      <span className="tabular-nums">{clp(monto)}</span>
    </li>
  );
}

export default function CotizadorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [calcError, setCalcError] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);

  const [basesTerreno, setBasesTerreno] = useState<CatalogoItem[]>([]);
  const [revestimientos, setRevestimientos] = useState<CatalogoItem[]>([]);

  // Los campos numéricos se guardan como texto; se convierten a número solo al calcular o guardar.
  const [formData, setFormData] = useState({
    cliente_nombre: "",
    cliente_telefono: "",
    direccion_terreno: "",
    estado: "BORRADOR",
    superficie_m2: "54",
    distancia_flete_km: "25",
    base_terreno_id: "" as string | number,
    revestimiento_id: "" as string | number,
    ganancia_m2: "30000",
    tipo_proyecto: "CASA",
    radier_m2: "37500",
    m2_vigas_vista: "",
  });

  useEffect(() => {
    const fetchCatalogos = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/login");
          return;
        }
        const authHeaders = { Authorization: `Bearer ${token}` };
        const [resBases, resRevest] = await Promise.all([
          fetch("/api/catalogo-tipos/?categoria=BASE_TERRENO&activo=true", { headers: authHeaders }),
          fetch("/api/catalogo-tipos/?categoria=REVESTIMIENTO&activo=true", { headers: authHeaders }),
        ]);
        if (resBases.ok && resRevest.ok) {
          const bases = await resBases.json();
          const revest = await resRevest.json();
          setBasesTerreno(bases);
          setRevestimientos(revest);
          setFormData((prev) => ({
            ...prev,
            base_terreno_id: bases.length > 0 ? bases[0].id : "",
            revestimiento_id: revest.length > 0 ? revest[0].id : "",
          }));
        }
      } catch {
        setError("No se pudieron cargar los materiales. Recargue la página.");
      } finally {
        setLoadingData(false);
      }
    };
    fetchCatalogos();
  }, [router]);

  // El valor se recalcula en el servidor cada vez que cambia un dato (espera 300 ms tras la última tecla).
  useEffect(() => {
    if (loadingData) return;
    const timer = setTimeout(async () => {
      setCalculando(true);
      try {
        const res = await fetch("/api/cotizaciones/calcular", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: JSON.stringify({
            superficie_m2: Number(formData.superficie_m2) || 0,
            distancia_km: Number(formData.distancia_flete_km) || 0,
            base_terreno_id: formData.base_terreno_id ? Number(formData.base_terreno_id) : null,
            revestimiento_id: formData.revestimiento_id ? Number(formData.revestimiento_id) : null,
            ganancia_m2: Number(formData.ganancia_m2) || 0,
            tipo_proyecto: formData.tipo_proyecto,
            radier_m2: Number(formData.radier_m2) || undefined,
            m2_vigas_vista: Number(formData.m2_vigas_vista) || 0,
          }),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCalcError(r.message || "No se pudo calcular el valor con estos datos. Revise los metros y los kilómetros.");
          return;
        }
        setCalcError("");
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
        });
      } catch {
        setCalcError("No hay conexión con el servidor. El valor se actualizará cuando vuelva.");
      } finally {
        setCalculando(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    loadingData,
    formData.superficie_m2,
    formData.distancia_flete_km,
    formData.base_terreno_id,
    formData.revestimiento_id,
    formData.ganancia_m2,
    formData.m2_vigas_vista,
    formData.tipo_proyecto,
    formData.radier_m2,
  ]);

  const setCampo = (name: string, value: string) => setFormData((prev) => ({ ...prev, [name]: value }));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setCampo(e.target.name, e.target.value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.direccion_terreno.trim()) {
      setError("Falta la dirección del terreno.");
      return;
    }
    if (!presupuesto) {
      setError("Espere a que aparezca el valor de la obra antes de guardar.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        superficie_m2: Number(formData.superficie_m2),
        distancia_flete_km: Number(formData.distancia_flete_km) || 0,
        base_terreno_id: formData.base_terreno_id ? Number(formData.base_terreno_id) : null,
        revestimiento_id: formData.revestimiento_id ? Number(formData.revestimiento_id) : null,
        ganancia_m2: Number(formData.ganancia_m2) || 0,
        radier_m2: Number(formData.radier_m2) || null,
        m2_vigas_vista: Number(formData.m2_vigas_vista) || 0,
        costo_materiales: presupuesto.materiales,
        costo_mano_obra: presupuesto.manoObra,
        costo_flete: presupuesto.flete,
        costo_total: presupuesto.total,
      };

      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(`No se pudo guardar: ${errData.message || JSON.stringify(errData)}`);
      }
    } catch {
      setError("No hay conexión con el servidor. Intente de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return <div className="p-8 text-center text-slate-500 font-bold">Cargando opciones del sistema...</div>;
  }

  const esCasa = formData.tipo_proyecto === "CASA";

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto pb-28 lg:pb-0">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900">Nueva cotización</h1>
        <p className="text-slate-600 mt-1">Complete los datos. El valor de la obra se actualiza solo a la derecha.</p>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 mb-6 rounded-r-md">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="space-y-6">
          <Paso titulo="El cliente y el terreno">
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="cliente_nombre" className={labelCls}>Nombre del cliente</label>
                <input id="cliente_nombre" name="cliente_nombre" value={formData.cliente_nombre} onChange={handleChange}
                  placeholder="Ej: Carolina Rojas" className={inputCls} required />
              </div>
              <div>
                <label htmlFor="cliente_telefono" className={labelCls}>Teléfono o WhatsApp</label>
                <input id="cliente_telefono" name="cliente_telefono" type="tel" value={formData.cliente_telefono}
                  onChange={handleChange} placeholder="+56 9 8765 4321" className={inputCls} />
              </div>
            </div>
            <div className="grid sm:grid-cols-[1fr_12rem] gap-5">
              <div>
                <label htmlFor="direccion_terreno" className={labelCls}>Dirección del terreno</label>
                <input id="direccion_terreno" name="direccion_terreno" value={formData.direccion_terreno}
                  onChange={handleChange} placeholder="Ej: Parcela 14, Camino Los Boldos, Limache"
                  className={inputCls} required />
              </div>
              <div>
                <label htmlFor="estado" className={labelCls}>Estado</label>
                <select id="estado" name="estado" value={formData.estado} onChange={handleChange} className={inputCls}>
                  <option value="BORRADOR">En preparación</option>
                  <option value="ACEPTADA">Aceptada</option>
                  <option value="FINALIZADA">Obra terminada</option>
                </select>
              </div>
            </div>
          </Paso>

          <Paso titulo="Qué se va a construir">
            <div role="radiogroup" aria-label="Tipo de proyecto" className="grid grid-cols-2 gap-3">
              {[
                { v: "CASA", t: "Casa", d: "Casa prefabricada completa" },
                { v: "SOLO_RADIER", t: "Solo radier", d: "Solo la losa de hormigón" },
              ].map((o) => {
                const activo = formData.tipo_proyecto === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setCampo("tipo_proyecto", o.v)}
                    className={`text-left rounded-xl border-2 p-4 cursor-pointer transition focus:outline-none focus:ring-4 focus:ring-blue-900/15 ${
                      activo ? "border-blue-900 bg-blue-50" : "border-slate-300 bg-white hover:border-slate-400"
                    }`}
                  >
                    <span className="block text-lg font-bold text-slate-900">{o.t}</span>
                    <span className="block text-sm text-slate-600">{o.d}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <NumberField label="Metros cuadrados" name="superficie_m2" value={formData.superficie_m2}
                onChange={setCampo} step="0.5" suffix="m²" required />
              <NumberField label="Distancia hasta el terreno" name="distancia_flete_km" value={formData.distancia_flete_km}
                onChange={setCampo} suffix="km" required help="Define el costo del traslado." />
            </div>

            {esCasa ? (
              <>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="base_terreno_id" className={labelCls}>Tipo de base</label>
                    <select id="base_terreno_id" name="base_terreno_id" value={formData.base_terreno_id}
                      onChange={handleChange} className={inputCls}>
                      {basesTerreno.length === 0 ? (
                        <option value="">No hay bases en el catálogo</option>
                      ) : (
                        basesTerreno.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nombre} ({clp(Number(b.precio_base_unitario))}/{b.unidad_medida})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="revestimiento_id" className={labelCls}>Material exterior</label>
                    <select id="revestimiento_id" name="revestimiento_id" value={formData.revestimiento_id}
                      onChange={handleChange} className={inputCls}>
                      {revestimientos.length === 0 ? (
                        <option value="">No hay revestimientos en el catálogo</option>
                      ) : (
                        revestimientos.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre} ({clp(Number(r.precio_base_unitario))}/{r.unidad_medida})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <NumberField label="Metros con vigas a la vista" name="m2_vigas_vista" value={formData.m2_vigas_vista}
                    onChange={setCampo} suffix="m²" help="Suma $65.000 por cada m² con vigas." />
                  <NumberField label="Ganancia de la empresa por m²" name="ganancia_m2" value={formData.ganancia_m2}
                    onChange={setCampo} step="1000" suffix="$" />
                </div>

                <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  El relleno de estabilizado no va aquí: se mide en la visita al terreno y se agrega después desde
                  «Mis cotizaciones».
                </p>
              </>
            ) : (
              <NumberField label="Precio del radier por m²" name="radier_m2" value={formData.radier_m2}
                onChange={setCampo} step="500" suffix="$"
                help="Incluye material y mano de obra, IVA incluido. Lo normal es entre $35.000 y $40.000. El traslado se suma aparte. Un radier especial (estacionamiento: mínimo 10 cm y malla ACMA) se calcula aparte: ingrese aquí el valor por m² que resulte." />
            )}
          </Paso>
        </div>

        {/* Presupuesto en vivo */}
        <aside className="lg:sticky lg:top-6" aria-live="polite">
          <div className="rounded-2xl overflow-hidden border border-slate-300 bg-white shadow-sm">
            <div className="bg-blue-900 text-white px-6 py-5">
              <p className="text-sm text-blue-200">Valor de la obra, IVA incluido</p>
              <p className={`text-4xl font-black tabular-nums tracking-tight mt-1 transition-opacity ${calculando ? "opacity-60" : ""}`}>
                {presupuesto ? clp(presupuesto.total) : "—"}
              </p>
              <p className="text-sm text-blue-200 mt-1 h-5">{calculando ? "Calculando…" : ""}</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {calcError && (
                <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">{calcError}</p>
              )}

              {presupuesto && (
                <>
                  <ul className="space-y-2.5 text-base">
                    <Linea concepto="Materiales" monto={presupuesto.materiales} />
                    {presupuesto.vigas > 0 && <Linea concepto="Vigas a la vista" monto={presupuesto.vigas} />}
                    <Linea concepto="Mano de obra" monto={presupuesto.manoObra} />
                    <Linea concepto="Traslado" monto={presupuesto.flete} />
                    {presupuesto.ganancia > 0 && <Linea concepto="Ganancia" monto={presupuesto.ganancia} />}
                    <li className="border-t border-slate-200 pt-2.5 space-y-2.5">
                      <ul className="space-y-2.5">
                        <Linea concepto="Neto" monto={presupuesto.neto} />
                        <Linea concepto="IVA 19%" monto={presupuesto.iva} />
                      </ul>
                    </li>
                  </ul>

                  {presupuesto.hitos.length > 0 && (
                    <div>
                      <p className="text-base font-semibold text-slate-800 mb-2">Cómo paga el cliente</p>
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-3" aria-hidden>
                        {presupuesto.hitos.map((h, i) => (
                          <div key={h.fase} style={{ width: `${h.porcentaje}%` }}
                            className={i === 0 ? "bg-blue-900" : i === 1 ? "bg-blue-600" : "bg-blue-300"} />
                        ))}
                      </div>
                      <ul className="space-y-2 text-sm">
                        {presupuesto.hitos.map((h) => (
                          <Linea key={h.fase} concepto={`${FASES[h.fase] || h.fase} ${h.porcentaje}%`} monto={h.monto} />
                        ))}
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
              <button type="submit" disabled={loading || !presupuesto}
                className="flex-1 h-12 font-bold text-lg text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-50 transition focus:outline-none focus:ring-4 focus:ring-blue-900/25">
                {loading ? "Guardando…" : "Guardar cotización"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Barra inferior en pantallas chicas: total siempre a la vista */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-300 p-3 flex items-center gap-3 z-20">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500">Valor de la obra</p>
          <p className="text-xl font-black text-blue-900 tabular-nums truncate">{presupuesto ? clp(presupuesto.total) : "—"}</p>
        </div>
        <button type="submit" disabled={loading || !presupuesto}
          className="px-6 h-12 font-bold text-white bg-blue-900 rounded-lg cursor-pointer disabled:opacity-50">
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
