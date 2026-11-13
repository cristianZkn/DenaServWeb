"use client";

import { correoValido, telefonoValido } from "@/lib/validar";
import { useEffect, useState } from "react";

interface Proveedor {
  id: number;
  rut_empresa: string;
  razon_social: string;
  contacto_nombre: string | null;
  telefono: string | null;
  email: string | null;
  descuento_pct: number;
  activo: boolean;
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    id: 0,
    rut_empresa: "",
    razon_social: "",
    contacto_nombre: "",
    telefono: "",
    email: "",
    descuento_pct: 0,
    activo: true,
  });
  const [isEditing, setIsEditing] = useState(false);

  const fetchProveedores = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/proveedores", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setProveedores(await res.json());
      } else {
        setError("Error al cargar proveedores");
      }
    } catch (err) {
      setError("Error de red");
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

    const rut = formData.rut_empresa.trim();
    const razon = formData.razon_social.trim();
    if (rut.length < 3 || rut.length > 12) return alert("El RUT debe tener entre 3 y 12 caracteres.");
    if (razon.length < 2 || razon.length > 150) return alert("La razón social debe tener entre 2 y 150 caracteres.");
    if (formData.telefono.trim() && !telefonoValido(formData.telefono)) return alert("El teléfono debe tener 9 dígitos. Ejemplo: +56 9 1234 5678");
    if (formData.email.trim() && !correoValido(formData.email.trim())) return alert("El correo no es válido. Ejemplo: contacto@proveedor.cl");
    if (formData.descuento_pct < 0 || formData.descuento_pct > 100) return alert("El descuento debe estar entre 0 y 100.");

    const url = isEditing
      ? `/api/proveedores/${formData.id}`
      : "/api/proveedores";
    const method = isEditing ? "PUT" : "POST";

    const payload = {
      rut_empresa: formData.rut_empresa,
      razon_social: formData.razon_social,
      contacto_nombre: formData.contacto_nombre || null,
      telefono: formData.telefono || null,
      email: formData.email || null,
      descuento_pct: Number(formData.descuento_pct) || 0,
      activo: formData.activo,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        resetForm();
        fetchProveedores();
      } else {
        const err = await res.json();
        alert(err.message || "Error al procesar la solicitud.");
      }
    } catch (err) {
      alert("Error de conexión");
    }
  };

  const handleEdit = (p: Proveedor) => {
    setFormData({
      id: p.id,
      rut_empresa: p.rut_empresa,
      razon_social: p.razon_social,
      contacto_nombre: p.contacto_nombre || "",
      telefono: p.telefono || "",
      email: p.email || "",
      descuento_pct: Number(p.descuento_pct) || 0,
      activo: p.activo,
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Deseas eliminar este proveedor?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/proveedores/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchProveedores();
      } else {
        const err = await res.json();
        alert(err.message || "No se pudo eliminar.");
      }
    } catch (e) {
      alert("Error al comunicarse con el backend.");
    }
  };

  const resetForm = () => {
    setFormData({
      id: 0,
      rut_empresa: "",
      razon_social: "",
      contacto_nombre: "",
      telefono: "",
      email: "",
      descuento_pct: 0,
      activo: true,
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Proveedores</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administración de las empresas proveedoras de insumos de construcción.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
            {isEditing ? "Editar proveedor" : "Registrar proveedor"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            <div>
              <label className="block font-semibold mb-1 text-slate-700">RUT Empresa *</label>
              <input
                type="text"
                value={formData.rut_empresa}
                onChange={(e) => setFormData({ ...formData, rut_empresa: e.target.value })}
                placeholder="Ej: 76.123.456-7" maxLength={12}
                className="w-full px-3 py-2 border rounded-lg border-slate-300"
                required
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Razón Social *</label>
              <input
                type="text"
                value={formData.razon_social}
                onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                placeholder="Ej: Maderas del Sur SpA" maxLength={150}
                className="w-full px-3 py-2 border rounded-lg border-slate-300"
                required
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Contacto Comercial</label>
              <input
                type="text"
                value={formData.contacto_nombre}
                onChange={(e) => setFormData({ ...formData, contacto_nombre: e.target.value })}
                placeholder="Ej: Pedro Valdivia" maxLength={150}
                className="w-full px-3 py-2 border rounded-lg border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Teléfono</label>
              <input
                type="text"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value.replace(/[^\d+\s]/g, "") })}
                placeholder="+56 9 1234 5678" maxLength={16}
                className="w-full px-3 py-2 border rounded-lg border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Correo Electrónico</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contacto@proveedor.cl" maxLength={254}
                className="w-full px-3 py-2 border rounded-lg border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Descuento comercial (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.descuento_pct}
                onChange={(e) => setFormData({ ...formData, descuento_pct: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg border-slate-300"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="activo_p"
                checked={formData.activo}
                onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                className="w-4 h-4 rounded text-blue-900"
              />
              <label htmlFor="activo_p" className="font-semibold text-slate-700">
                Proveedor Activo
              </label>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-2 px-4 rounded-lg shadow-sm cursor-pointer"
              >
                {isEditing ? "Actualizar" : "Crear Proveedor"}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2 px-3 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Listado */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
                  <th className="p-4">RUT</th>
                  <th className="p-4">Razón Social</th>
                  <th className="p-4">Contacto & Teléfono</th>
                  <th className="p-4">Descuento</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Cargando proveedores...
                    </td>
                  </tr>
                ) : proveedores.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No hay proveedores registrados.
                    </td>
                  </tr>
                ) : (
                  proveedores.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono font-medium text-slate-600">{p.rut_empresa}</td>
                      <td className="p-4">
                        <span className="font-bold text-slate-800">{p.razon_social}</span>
                        {p.email && <div className="text-xs text-slate-400">{p.email}</div>}
                      </td>
                      <td className="p-4">
                        <div className="text-slate-700">{p.contacto_nombre || "-"}</div>
                        <div className="text-xs text-slate-400">{p.telefono || "-"}</div>
                      </td>
                      <td className="p-4 font-semibold text-slate-700">{Number(p.descuento_pct) || 0}%</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            p.activo
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {p.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(p)}
                          className="text-blue-600 hover:text-blue-900 font-semibold text-xs cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-red-600 hover:text-red-900 font-semibold text-xs cursor-pointer"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
