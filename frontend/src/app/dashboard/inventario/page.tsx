"use client";

import { useEffect, useState } from "react";

interface Proveedor {
  id: number;
  razon_social: string;
}

interface Insumo {
  id: number;
  codigo_sku: string;
  proveedor: Proveedor;
  nombre_material: string;
  categoria_constructiva: string;
  etapa_predeterminada: str;
  unidad_medida: string;
  precio_lista_vigente: number;
  stock_actual: number;
  stock_minimo_seguridad: number;
  costo_neto: number;
}

export default function InventarioPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    id: 0,
    codigo_sku: "",
    proveedor_id: "",
    nombre_material: "",
    categoria_constructiva: "ESTRUCTURA",
    etapa_predeterminada: "ETAPA_1_OBRA_GRUESA",
    unidad_medida: "UN",
    precio_lista_vigente: "",
    stock_actual: "",
    stock_minimo_seguridad: "",
  });
  const [isEditing, setIsEditing] = useState(false);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [resInsumos, resProv] = await Promise.all([
        fetch("http://127.0.0.1:8000/api/insumos/", { headers }),
        fetch("http://127.0.0.1:8000/api/proveedores/", { headers })
      ]);
      
      if (resInsumos.ok && resProv.ok) {
        setInsumos(await resInsumos.json());
        setProveedores(await resProv.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    
    const url = isEditing 
      ? `http://127.0.0.1:8000/api/insumos/${formData.id}` 
      : "http://127.0.0.1:8000/api/insumos/";
    const method = isEditing ? "PUT" : "POST";

    const payload = {
      ...formData,
      proveedor_id: parseInt(formData.proveedor_id as any),
      precio_lista_vigente: parseInt(formData.precio_lista_vigente as any) || 0,
      stock_actual: parseFloat(formData.stock_actual as any) || 0,
      stock_minimo_seguridad: parseFloat(formData.stock_minimo_seguridad as any) || 0,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        resetForm();
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (insumo: Insumo) => {
    setFormData({
      id: insumo.id,
      codigo_sku: insumo.codigo_sku,
      proveedor_id: insumo.proveedor.id.toString(),
      nombre_material: insumo.nombre_material,
      categoria_constructiva: insumo.categoria_constructiva,
      etapa_predeterminada: insumo.etapa_predeterminada,
      unidad_medida: insumo.unidad_medida,
      precio_lista_vigente: insumo.precio_lista_vigente.toString(),
      stock_actual: insumo.stock_actual.toString(),
      stock_minimo_seguridad: insumo.stock_minimo_seguridad.toString(),
    });
    setIsEditing(true);
  };

  const resetForm = () => {
    setFormData({
      id: 0,
      codigo_sku: "",
      proveedor_id: "",
      nombre_material: "",
      categoria_constructiva: "ESTRUCTURA",
      etapa_predeterminada: "ETAPA_1_OBRA_GRUESA",
      unidad_medida: "UN",
      precio_lista_vigente: "",
      stock_actual: "",
      stock_minimo_seguridad: "",
    });
    setIsEditing(false);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h1 className="text-3xl font-bold text-slate-800 mb-6">Catálogo Maestro de Inventario</h1>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-slate-50 p-6 rounded-md mb-10 border border-slate-200">
        <h2 className="text-xl font-bold mb-4 text-blue-900">
          {isEditing ? "Editar Insumo" : "Registrar Nuevo Insumo"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold mb-1">SKU *</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.codigo_sku} onChange={e => setFormData({...formData, codigo_sku: e.target.value})} required />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1">Nombre Material *</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.nombre_material} onChange={e => setFormData({...formData, nombre_material: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Proveedor *</label>
            <select className="w-full p-2 border rounded" value={formData.proveedor_id} onChange={e => setFormData({...formData, proveedor_id: e.target.value})} required>
              <option value="">-- Seleccionar --</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.razon_social}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Categoría</label>
            <select className="w-full p-2 border rounded" value={formData.categoria_constructiva} onChange={e => setFormData({...formData, categoria_constructiva: e.target.value})} required>
              <option value="ESTRUCTURA">Estructura</option>
              <option value="TECHUMBRE">Techumbre</option>
              <option value="REVESTIMIENTO_EXTERIOR">Revestimiento Exterior</option>
              <option value="FUNDACION">Fundación</option>
              <option value="TERMINACION">Terminación</option>
              <option value="FIJACION">Fijación</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Unidad Medida</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.unidad_medida} onChange={e => setFormData({...formData, unidad_medida: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Precio Lista Proveedor ($) *</label>
            <input type="number" className="w-full p-2 border rounded" value={formData.precio_lista_vigente} onChange={e => setFormData({...formData, precio_lista_vigente: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Stock Físico</label>
            <input type="number" step="0.01" className="w-full p-2 border rounded" value={formData.stock_actual} onChange={e => setFormData({...formData, stock_actual: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Alerta: Stock Mínimo</label>
            <input type="number" step="0.01" className="w-full p-2 border rounded" value={formData.stock_minimo_seguridad} onChange={e => setFormData({...formData, stock_minimo_seguridad: e.target.value})} required />
          </div>
        </div>
        <div className="flex space-x-4">
          <button type="submit" className="bg-blue-900 text-white px-6 py-2 rounded font-bold hover:bg-blue-800">
            {isEditing ? "Actualizar" : "Guardar"}
          </button>
          {isEditing && (
            <button type="button" onClick={resetForm} className="bg-slate-300 px-6 py-2 rounded font-bold">
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Lista */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="p-3">SKU</th>
              <th className="p-3">Material</th>
              <th className="p-3">Proveedor</th>
              <th className="p-3 text-right">Precio Lista</th>
              <th className="p-3 text-right">Costo Neto</th>
              <th className="p-3 text-right">Stock</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-4 text-center">Cargando...</td></tr>
            ) : insumos.map(insumo => {
              const isCritico = insumo.stock_actual <= insumo.stock_minimo_seguridad;
              return (
                <tr key={insumo.id} className={`border-b ${isCritico ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                  <td className="p-3 text-sm">{insumo.codigo_sku}</td>
                  <td className="p-3 font-semibold">{insumo.nombre_material}</td>
                  <td className="p-3 text-sm text-slate-600">{insumo.proveedor.razon_social}</td>
                  <td className="p-3 text-right text-slate-500">${insumo.precio_lista_vigente.toLocaleString("es-CL")}</td>
                  <td className="p-3 text-right font-black text-blue-900">${insumo.costo_neto.toLocaleString("es-CL")}</td>
                  <td className="p-3 text-right">
                    <span className={`px-2 py-1 rounded font-bold ${isCritico ? 'bg-red-200 text-red-900' : 'bg-green-100 text-green-800'}`}>
                      {insumo.stock_actual} {insumo.unidad_medida}
                    </span>
                  </td>
                  <td className="p-3">
                    <button onClick={() => handleEdit(insumo)} className="text-blue-600 font-bold hover:underline">
                      Editar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
