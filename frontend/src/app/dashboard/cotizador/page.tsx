"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CotizadorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    cliente_nombre: "",
    cliente_telefono: "",
    cliente_email: "",
    presupuesto_estimado: 0,
    tipo_proyecto: "Personalizado",
    superficie_m2: 0,
    costo_base_casa: 0,
    requiere_nivelacion: false,
    costo_nivelacion: 0,
    distancia_terreno_km: 0,
    costo_logistica: 0,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    
    if (type === "number") {
      finalValue = parseFloat(value) || 0;
    } else if (type === "checkbox") {
      finalValue = (e.target as HTMLInputElement).checked;
    }
    
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const calcularTotales = () => {
    const total = formData.costo_base_casa + formData.costo_nivelacion + formData.costo_logistica;
    return total;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const token = localStorage.getItem("token");

    try {
      const res = await fetch("http://127.0.0.1:8000/api/cotizaciones/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/cotizacion/${data.uuid_publico}`);
      } else {
        setError("Error al crear la cotización. Verifica los datos.");
      }
    } catch (err) {
      setError("Error de red. Asegúrate de que el servidor esté encendido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 mb-8 border-b pb-4">Nueva Cotización</h1>

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
              <label className="block font-semibold mb-2">Teléfono</label>
              <input type="text" name="cliente_telefono" value={formData.cliente_telefono} onChange={handleChange} />
            </div>
            <div>
              <label className="block font-semibold mb-2">Email</label>
              <input type="email" name="cliente_email" value={formData.cliente_email} onChange={handleChange} />
            </div>
            <div>
              <label className="block font-semibold mb-2">Presupuesto Estimado ($)</label>
              <input type="number" name="presupuesto_estimado" value={formData.presupuesto_estimado} onChange={handleChange} />
            </div>
          </div>
        </section>

        {/* Proyecto */}
        <section className="bg-slate-50 p-6 rounded-md border border-slate-200">
          <h2 className="text-xl font-bold text-slate-700 mb-4">Detalles del Proyecto</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block font-semibold mb-2">Tipo de Proyecto</label>
              <select name="tipo_proyecto" value={formData.tipo_proyecto} onChange={handleChange}>
                <option value="Personalizado">Personalizado</option>
                <option value="Prediseñado">Prediseñado</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-2">Superficie Total (m²)</label>
              <input type="number" name="superficie_m2" value={formData.superficie_m2} onChange={handleChange} required />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold mb-2">Costo Base de Casa ($)</label>
              <input type="number" name="costo_base_casa" value={formData.costo_base_casa} onChange={handleChange} required />
              <p className="text-sm text-slate-500 mt-1">Costo calculado o acordado para la construcción principal.</p>
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
              <label className="font-semibold text-lg">Incluir Preparación y Nivelación de Terreno</label>
            </div>
            
            {formData.requiere_nivelacion && (
              <div>
                <label className="block font-semibold mb-2">Costo de Nivelación ($)</label>
                <input type="number" name="costo_nivelacion" value={formData.costo_nivelacion} onChange={handleChange} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-4 border-t border-slate-300">
              <div>
                <label className="block font-semibold mb-2">Distancia al Terreno (Km)</label>
                <input type="number" name="distancia_terreno_km" value={formData.distancia_terreno_km} onChange={handleChange} />
              </div>
              <div>
                <label className="block font-semibold mb-2">Costo Total Logística (Flete y Obreros) ($)</label>
                <input type="number" name="costo_logistica" value={formData.costo_logistica} onChange={handleChange} />
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
