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

export default function CotizadorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const [basesTerreno, setBasesTerreno] = useState<CatalogoItem[]>([]);
  const [revestimientos, setRevestimientos] = useState<CatalogoItem[]>([]);
  const [estabilizados, setEstabilizados] = useState<CatalogoItem[]>([]);

  const [formData, setFormData] = useState({
    cliente_nombre: "",
    cliente_telefono: "",
    direccion_terreno: "", // Campo crítico exigido
    estado: "BORRADOR",    // Selector: BORRADOR, ACEPTADA, FINALIZADA
    superficie_m2: 54,
    distancia_flete_km: 25,
    base_terreno_id: "" as string | number,
    revestimiento_id: "" as string | number,
    espesor_cm: 10,
    arido_empresa: true,
    estabilizado_id: "" as string | number,
    ganancia_m2: 30000,
    tipo_proyecto: "CASA",
    radier_m2: 37500,
    m2_vigas_vista: 0,
    costo_materiales: 0,
    costo_mano_obra: 0,
    costo_flete: 0,
    costo_total: 0,
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
        const [resBases, resRevest, resEstab] = await Promise.all([
          fetch("/api/catalogo-tipos/?categoria=BASE_TERRENO&activo=true", { headers: authHeaders }),
          fetch("/api/catalogo-tipos/?categoria=REVESTIMIENTO&activo=true", { headers: authHeaders }),
          fetch("/api/catalogo-tipos/?categoria=ESTABILIZADO&activo=true", { headers: authHeaders }),
        ]);

        if (resBases.ok && resRevest.ok) {
          const bases = await resBases.json();
          const revest = await resRevest.json();
          setBasesTerreno(bases);
          setRevestimientos(revest);
          const estab = resEstab.ok ? await resEstab.json() : [];
          setEstabilizados(estab);

          // Defaults
          setFormData((prev) => ({
            ...prev,
            base_terreno_id: bases.length > 0 ? bases[0].id : "",
            revestimiento_id: revest.length > 0 ? revest[0].id : "",
            estabilizado_id: estab.length > 0 ? estab[0].id : "",
          }));
        }
      } catch (err) {
        setError("Error al cargar opciones de catálogo desde el backend.");
      } finally {
        setLoadingData(false);
      }
    };

    fetchCatalogos();
  }, [router]);

  // Recalcular costos en el backend (motor de cálculo, debounce 300 ms)
  useEffect(() => {
    const baseSel = basesTerreno.find((b) => b.id === Number(formData.base_terreno_id));
    const revestSel = revestimientos.find((r) => r.id === Number(formData.revestimiento_id));
    const estabSel = estabilizados.find((e) => e.id === Number(formData.estabilizado_id));
    if (!baseSel || !revestSel) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/cotizaciones/calcular", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: JSON.stringify({
            superficie_m2: Number(formData.superficie_m2) || 0,
            distancia_km: Number(formData.distancia_flete_km) || 0,
            base_terreno_id: baseSel.id,
            revestimiento_id: revestSel.id,
            estabilizado_id: estabSel ? estabSel.id : null,
            espesor_cm: Number(formData.espesor_cm) || 0,
            arido_empresa: formData.arido_empresa,
            ganancia_m2: Number(formData.ganancia_m2) || 0,
            tipo_proyecto: formData.tipo_proyecto,
            radier_m2: Number(formData.radier_m2) || undefined,
            m2_vigas_vista: Number(formData.m2_vigas_vista) || 0,
          }),
        });
        if (!res.ok) return;
        const r = await res.json();
        setFormData((prev) => ({
          ...prev,
          costo_materiales: Number(r.costo_materiales_total),
          costo_mano_obra: Number(r.costo_mano_obra),
          costo_flete: Number(r.costo_flete),
          costo_total: Number(r.total),
        }));
      } catch {
        setError("No se pudo calcular el presupuesto en el servidor.");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    formData.superficie_m2,
    formData.distancia_flete_km,
    formData.base_terreno_id,
    formData.revestimiento_id,
    formData.espesor_cm,
    formData.arido_empresa,
    formData.estabilizado_id,
    formData.ganancia_m2,
    formData.m2_vigas_vista,
    formData.tipo_proyecto,
    formData.radier_m2,
    basesTerreno,
    revestimientos,
    estabilizados,
  ]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalVal: any = value;
    if (name === "arido_empresa") finalVal = value === "true";
    if (type === "number") {
      finalVal = value === "" ? 0 : parseFloat(value);
    }
    setFormData((prev) => ({ ...prev, [name]: finalVal }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!formData.direccion_terreno.trim()) {
      setError("La dirección del terreno es obligatoria.");
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const payload = {
        ...formData,
        superficie_m2: parseFloat(formData.superficie_m2 as any),
        distancia_flete_km: parseFloat(formData.distancia_flete_km as any),
        base_terreno_id: formData.base_terreno_id ? parseInt(formData.base_terreno_id as any) : null,
        revestimiento_id: formData.revestimiento_id ? parseInt(formData.revestimiento_id as any) : null,
        estabilizado_id: formData.estabilizado_id ? parseInt(formData.estabilizado_id as any) : null,
        espesor_cm: Number(formData.espesor_cm) || 0,
        ganancia_m2: Number(formData.ganancia_m2) || 0,
        radier_m2: Number(formData.radier_m2) || null,
        m2_vigas_vista: Number(formData.m2_vigas_vista) || 0,
        costo_materiales: parseFloat(formData.costo_materiales as any),
        costo_mano_obra: parseFloat(formData.costo_mano_obra as any),
        costo_flete: parseFloat(formData.costo_flete as any),
        costo_total: parseFloat(formData.costo_total as any),
      };

      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/cotizacion/${data.codigo_cotizacion}`);
      } else {
        const errData = await res.json();
        setError(`Error al guardar: ${errData.message || JSON.stringify(errData)}`);
      }
    } catch (err) {
      setError("Error de comunicación con el servidor backend.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return <div className="p-8 text-center text-slate-500 font-bold">Cargando opciones del sistema...</div>;
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-4xl mx-auto">
      <div className="border-b pb-4 mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900">Nueva Cotización Paramétrica</h1>
        <p className="text-slate-500 text-sm mt-1">
          Complete los datos del cliente, la ubicación del terreno y seleccione los tipos de materiales.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r-md text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* SECCIÓN 1: DATOS DEL CLIENTE Y TERRENO */}
        <section className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
            1. Datos del Cliente & Ubicación del Terreno
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Nombre Completo del Cliente *
              </label>
              <input
                type="text"
                name="cliente_nombre"
                value={formData.cliente_nombre}
                onChange={handleChange}
                placeholder="Ej: Carolina Rojas M."
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Teléfono de Contacto / WhatsApp
              </label>
              <input
                type="text"
                name="cliente_telefono"
                value={formData.cliente_telefono}
                onChange={handleChange}
                placeholder="+56 9 8765 4321"
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Dirección del Terreno * (Campo Crítico)
              </label>
              <input
                type="text"
                name="direccion_terreno"
                value={formData.direccion_terreno}
                onChange={handleChange}
                placeholder="Ej: Parcela 14, Camino Los Boldos, Limache"
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Estado Inicial *
              </label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white font-semibold"
              >
                <option value="BORRADOR">BORRADOR</option>
                <option value="ACEPTADA">ACEPTADA</option>
                <option value="FINALIZADA">FINALIZADA</option>
              </select>
            </div>
          </div>
        </section>

        {/* TIPO DE PROYECTO */}
        <section className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">Tipo de proyecto</label>
          <select
            name="tipo_proyecto"
            value={formData.tipo_proyecto}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg border-slate-300 bg-white"
          >
            <option value="CASA">Casa (semi terminada)</option>
            <option value="SOLO_RADIER">Solo radier (medidas estándar)</option>
          </select>
          {formData.tipo_proyecto === "SOLO_RADIER" && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Precio del radier por m² (incluye material y mano de obra, IVA incl.; normal $35.000–$40.000). El traslado se suma aparte.
              </label>
              <input
                type="number"
                name="radier_m2"
                min="0"
                step="500"
                value={formData.radier_m2}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 bg-white"
              />
              <p className="text-xs text-slate-500 mt-1">
                Radier especial (p. ej. estacionamiento: mínimo 10 cm y malla ACMA en toda la superficie) se calcula
                aparte: ingrese aquí el valor por m² que resulte.
              </p>
            </div>
          )}
        </section>

        {/* SECCIÓN 2: ESPECIFICACIONES CONSTRUCTIVAS */}
        <section className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
            2. Especificaciones Técnicas (Catálogo Unificado)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Superficie Total Construida (m²) *
              </label>
              <input
                type="number"
                name="superficie_m2"
                min="10"
                step="0.5"
                value={formData.superficie_m2}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Distancia Flete / Traslado (Km) *
              </label>
              <input
                type="number"
                name="distancia_flete_km"
                min="0"
                value={formData.distancia_flete_km}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Tipo de Base de Terreno (Catálogo)
              </label>
              <select
                name="base_terreno_id"
                value={formData.base_terreno_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
              >
                {basesTerreno.length === 0 ? (
                  <option value="">No hay bases registradas en el catálogo</option>
                ) : (
                  basesTerreno.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre} (${Number(b.precio_base_unitario).toLocaleString("es-CL")}/{b.unidad_medida})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Tipo de Revestimiento Exterior (Catálogo)
              </label>
              <select
                name="revestimiento_id"
                value={formData.revestimiento_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
              >
                {revestimientos.length === 0 ? (
                  <option value="">No hay revestimientos registrados en el catálogo</option>
                ) : (
                  revestimientos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} (${Number(r.precio_base_unitario).toLocaleString("es-CL")}/{r.unidad_medida})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Espesor capa de estabilizado (cm)
              </label>
              <input
                type="number"
                name="espesor_cm"
                min="0"
                value={formData.espesor_cm}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Suministro del estabilizado
              </label>
              <select
                name="arido_empresa"
                value={String(formData.arido_empresa)}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
              >
                <option value="true">Provisto por la empresa</option>
                <option value="false">Comprado por el cliente</option>
              </select>
            </div>

            {formData.arido_empresa && estabilizados.length === 0 && (
              <p className="md:col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                No hay material ESTABILIZADO activo en el catálogo: la nivelación se cotiza en $0. Regístrelo en
                Catálogos (categoría ESTABILIZADO, precio por m³, cotizado con su proveedor de áridos).
              </p>
            )}

            {formData.arido_empresa && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Material de nivelación (Catálogo)
                </label>
                <select
                  name="estabilizado_id"
                  value={formData.estabilizado_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
                >
                  {estabilizados.length === 0 ? (
                    <option value="">Sin materiales ESTABILIZADO en el catálogo</option>
                  ) : (
                    estabilizados.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre} (${Number(e.precio_base_unitario).toLocaleString("es-CL")}/{e.unidad_medida})
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Ganancia de la empresa ($ por m²)
              </label>
              <input
                type="number"
                name="ganancia_m2"
                min="0"
                step="1000"
                value={formData.ganancia_m2}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                m² con vigas a la vista (+$65.000/m²)
              </label>
              <input
                type="number"
                name="m2_vigas_vista"
                min="0"
                value={formData.m2_vigas_vista}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-blue-600 bg-white"
              />
            </div>
          </div>
        </section>

        {/* SECCIÓN 3: DESGLOSE DE COSTOS Y TOTAL */}
        <section className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
            3. Desglose de Costos de Obra
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Costo Materiales ($)
              </label>
              <input
                type="number"
                name="costo_materiales"
                value={formData.costo_materiales}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Costo Mano de Obra ($)
              </label>
              <input
                type="number"
                name="costo_mano_obra"
                value={formData.costo_mano_obra}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Costo Flete / Logística ($)
              </label>
              <input
                type="number"
                name="costo_flete"
                value={formData.costo_flete}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg border-slate-300 bg-white font-medium"
              />
            </div>
          </div>

          <div className="bg-blue-900 text-white p-6 rounded-xl shadow-inner flex flex-col sm:flex-row justify-between items-center mt-6">
            <div>
              <h3 className="text-xl font-bold">Costo Total de Cotización:</h3>
              <p className="text-xs text-blue-200 mt-1">
                Se generarán automáticamente los 3 hitos de pago: Anticipo (40%), Avance (30%) y Entrega (30%).
              </p>
            </div>
            <div className="text-3xl font-black mt-3 sm:mt-0 tracking-tight">
              ${Number(formData.costo_total).toLocaleString("es-CL")}
            </div>
          </div>
        </section>

        {/* BOTONES DE ACCIÓN */}
        <div className="flex justify-end gap-4 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2.5 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-2.5 font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-md cursor-pointer disabled:opacity-50 transition"
          >
            {loading ? "Creando Cotización..." : "Crear y Generar Hitos de Pago"}
          </button>
        </div>
      </form>
    </div>
  );
}
