"use client";

import { useEffect, useState } from "react";

interface Proveedor {
  id: number;
  rut_proveedor: string;
  razon_social: string;
  porcentaje_descuento_base: number;
  telefono_contacto: string;
  habilitado: boolean;
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    id: 0,
    rut_proveedor: "",
    razon_social: "",
    porcentaje_descuento_base: "",
    telefono_contacto: "",
    habilitado: true,
  });
  const [isEditing, setIsEditing] = useState(false);

  const fetchProveedores = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://127.0.0.1:8000/api/proveedores/", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setProveedores(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProveedores();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    
    const url = isEditing 
      ? `http://127.0.0.1:8000/api/proveedores/${formData.id}` 
      : "http://127.0.0.1:8000/api/proveedores/";
    const method = isEditing ? "PUT" : "POST";

    const payload = {
      ...formData,
      porcentaje_descuento_base: parseFloat(formData.porcentaje_descuento_base as any) || 0
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
        fetchProveedores();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (p: Proveedor) => {
    setFormData({
      id: p.id,
      rut_proveedor: p.rut_proveedor,
      razon_social: p.razon_social,
      porcentaje_descuento_base: p.porcentaje_descuento_base.toString(),
      telefono_contacto: p.telefono_contacto || "",
      habilitado: p.habilitado,
    });
    setIsEditing(true);
  };

  const resetForm = () => {
    setFormData({
      id: 0,
      rut_proveedor: "",
      razon_social: "",
      porcentaje_descuento_base: "",
      telefono_contacto: "",
      habilitado: true,
    });
    setIsEditing(false);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h1 className="text-3xl font-bold text-slate-800 mb-6">Gestión de Proveedores</h1>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-slate-50 p-6 rounded-md mb-10 border border-slate-200">
        <h2 className="text-xl font-bold mb-4 text-blue-900">
          {isEditing ? "Editar Proveedor" : "Registrar Nuevo Proveedor"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold mb-1">RUT *</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.rut_proveedor} onChange={e => setFormData({...formData, rut_proveedor: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Razón Social *</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.razon_social} onChange={e => setFormData({...formData, razon_social: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Teléfono</label>
            <input type="text" className="w-full p-2 border rounded" value={formData.telefono_contacto} onChange={e => setFormData({...formData, telefono_contacto: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">% Descuento Comercial *</label>
            <input type="number" step="0.01" className="w-full p-2 border rounded" value={formData.porcentaje_descuento_base} onChange={e => setFormData({...formData, porcentaje_descuento_base: e.target.value})} required />
          </div>
          <div className="flex items-end">
            <label className="flex items-center space-x-2 pb-2">
              <input type="checkbox" checked={formData.habilitado} onChange={e => setFormData({...formData, habilitado: e.target.checked})} className="w-5 h-5" />
              <span className="font-semibold">Habilitado</span>
            </label>
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
            <tr className="bg-blue-900 text-white">
              <th className="p-3">RUT</th>
              <th className="p-3">Razón Social</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">% Descuento</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-center">Cargando...</td></tr>
            ) : proveedores.map(p => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                <td className="p-3">{p.rut_proveedor}</td>
                <td className="p-3 font-semibold">{p.razon_social}</td>
                <td className="p-3">{p.telefono_contacto || "-"}</td>
                <td className="p-3 text-green-700 font-bold">{p.porcentaje_descuento_base}%</td>
                <td className="p-3">
                  {p.habilitado ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">Activo</span>
                  ) : (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded">Inactivo</span>
                  )}
                </td>
                <td className="p-3">
                  <button onClick={() => handleEdit(p)} className="text-blue-600 font-bold hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
