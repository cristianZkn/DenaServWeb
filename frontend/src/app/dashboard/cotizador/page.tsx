"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CotizadorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    cliente_nombre: "",
    cliente_telefono: "",
    cliente_email: "",
    cliente_comuna: "",
    
    superficie_m2: "",
    tipo_base: "RADIER_HORMIGON",
    tipo_revestimiento_exterior: "SMART_PANEL",
    tipo_cubierta: "ZINC_ONDULADO",
    costo_base_casa_global: "",
    
    requiere_nivelacion: false,
    costo_nivelacion_global: "",
    distancia_traslado_km: "",
    costo_logistica_global: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    
    if (type === "number") {
      finalValue = value === "" ? "" : parseFloat(value);
    } else if (type === "checkbox") {
      finalValue = (e.target as HTMLInputElement).checked;
    }
    
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const calcularTotales = () => {
    let total = (parseFloat(formData.costo_base_casa_global as any) || 0) + (parseFloat(formData.costo_logistica_global as any) || 0);
    if (formData.requiere_nivelacion) {
      total += (parseFloat(formData.costo_nivelacion_global as any) || 0);
    }
    return total;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const token = localStorage.getItem("token");

    const payload = {
      ...formData,
      superficie_m2: parseFloat(formData.superficie_m2 as any) || 0,
      costo_base_casa_global: parseFloat(formData.costo_base_casa_global as any) || 0,
      costo_nivelacion_global: parseFloat(formData.costo_nivelacion_global as any) || 0,
      distancia_traslado_km: parseFloat(formData.distancia_traslado_km as any) || 0,
      costo_logistica_global: parseFloat(formData.costo_logistica_global as any) || 0,
    };

    try {
      const res = await fetch("http://127.0.0.1:8000/api/cotizaciones/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/cotizacion/${data.uuid_publico}`);
      } else {
        const errData = await res.json();
        setError(`Error al crear la cotización: ${errData.message || JSON.stringify(errData)}`);
      }
    } catch (err) {
      setError("Error de red. Asegúrate de que el servidor esté encendido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 mb-8 border-b pb-4">Nueva Cotización (Cálculo Global)</h1>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Datos del Cliente */}
        <section className="bg-slate-50 p-6 rounded-md border border-slate-200">
          <h2 className="text-xl font-bold text-slate-700 mb-4">Datos del Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block font-semibold mb-2">Nombre del Cliente *</label>
              <input type="text" name="cliente_nombre" value={formData.cliente_nombre} onChange={handleChange} required />
            </div>
            <div>
              <label className="block font-semibold mb-2">Teléfono (WhatsApp) *</label>
              <input type="text" name="cliente_telefono" value={formData.cliente_telefono} onChange={handleChange} required />
            </div>
            <div>
              <label className="block font-semibold mb-2">Email</label>
              <input type="email" name="cliente_email" value={formData.cliente_email} onChange={handleChange} />
            </div>
            <div>
              <label className="block font-semibold mb-2">Comuna</label>
              <input type="text" name="cliente_comuna" value={formData.cliente_comuna} onChange={handleChange} />
            </div>
          </div>
        </section>

        {/* Proyecto */}
        <section className="bg-slate-50 p-6 rounded-md border border-slate-200">
          <h2 className="text-xl font-bold text-slate-700 mb-4">Detalles Arquitectónicos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block font-semibold mb-2">Superficie Total (m²)</label>
              <input type="number" name="superficie_m2" value={formData.superficie_m2} onChange={handleChange} required min="15" />
            </div>
            <div>
              <label className="block font-semibold mb-2">Tipo de Base</label>
              <select name="tipo_base" value={formData.tipo_base} onChange={handleChange}>
                <option value="RADIER_HORMIGON">Radier Hormigón</option>
                <option value="BASE_MADERA_PILOTES">Base Madera / Pilotes</option>
                <option value="SIN_BASE">Sin Base (Provee Cliente)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-2">Revestimiento Exterior</label>
              <select name="tipo_revestimiento_exterior" value={formData.tipo_revestimiento_exterior} onChange={handleChange}>
                <option value="SMART_PANEL">Smart Panel</option>
                <option value="SIDING_FIBROCEMENTO">Siding Fibrocemento</option>
                <option value="SMART_LAP">Smart Lap</option>
                <option value="METAL_SIDING">Metal Siding</option>
                <option value="OSB_ESTRUCTURAL">OSB Estructural (Desnudo)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-2">Tipo de Cubierta</label>
              <select name="tipo_cubierta" value={formData.tipo_cubierta} onChange={handleChange}>
                <option value="ZINC_ONDULADO">Zinc Ondulado</option>
                <option value="ZINC_5V">Zinc 5V</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold mb-2">Costo Base de Casa Global ($)</label>
              <input type="number" name="costo_base_casa_global" value={formData.costo_base_casa_global} onChange={handleChange} required min="0" />
            </div>
          </div>
        </section>

        {/* Nivelación y Logística */}
        <section className="bg-slate-50 p-6 rounded-md border border-slate-200">
          <h2 className="text-xl font-bold text-slate-700 mb-4">Terreno y Logística</h2>
          <div className="space-y-4">
            <div className="flex items-center mb-4">
              <input 
                type="checkbox" 
                name="requiere_nivelacion" 
                checked={formData.requiere_nivelacion} 
                onChange={handleChange} 
                className="w-6 h-6 mr-3"
              />
              <label className="font-semibold text-lg">Incluir Nivelación de Terreno</label>
            </div>
            
            {formData.requiere_nivelacion && (
              <div>
                <label className="block font-semibold mb-2">Costo Global Nivelación ($)</label>
                <input type="number" name="costo_nivelacion_global" value={formData.costo_nivelacion_global} onChange={handleChange} min="0" />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-4 border-t border-slate-300">
              <div>
                <label className="block font-semibold mb-2">Distancia al Terreno (Km)</label>
                <input type="number" name="distancia_traslado_km" value={formData.distancia_traslado_km} onChange={handleChange} min="0" />
              </div>
              <div>
                <label className="block font-semibold mb-2">Costo Global Logística ($)</label>
                <input type="number" name="costo_logistica_global" value={formData.costo_logistica_global} onChange={handleChange} min="0" />
              </div>
            </div>
          </div>
        </section>

        {/* Resumen Final */}
        <section className="bg-blue-900 text-white p-6 rounded-md shadow-inner text-right">
          <h2 className="text-2xl font-bold mb-2">Costo Total Estimado:</h2>
          <p className="text-4xl font-black">${calcularTotales().toLocaleString("es-CL")}</p>
          <p className="text-blue-200 mt-2">Los hitos de pago (40%, 30%, 30%) se generarán automáticamente.</p>
        </section>

        <div className="flex justify-end space-x-4">
          <button type="button" onClick={() => router.push("/dashboard")} className="px-6 py-3 font-bold bg-slate-300 text-slate-800 rounded-md hover:bg-slate-400">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="btn-primary px-8 py-3 text-xl">
            {loading ? "Guardando..." : "Generar Cotización"}
          </button>
        </div>
      </form>
    </div>
  );
}
