"use client";

import { useDialogo } from "@/components/ConfirmDialog";
import { correoValido, formatearRut, rutValido } from "@/lib/validar";
import { useEffect, useState } from "react";

interface Usuario {
  id: number;
  rut: string;
  nombre_completo: string;
  email: string;
  activo: boolean;
}

const VACIO = { id: 0, rut: "", nombre_completo: "", email: "", activo: true };

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(false);
  const { preguntar, dialogo } = useDialogo();
  const avisar = (mensaje: string) => void preguntar({ titulo: "No se pudo completar la acción", mensaje, soloAviso: true });
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });

  const cargar = async () => {
    try {
      const res = await fetch("/api/usuarios/", { headers: headers() });
      if (res.ok) setUsuarios(await res.json());
      else avisar("No se pudo cargar la lista de usuarios.");
    } catch {
      avisar("Error de red");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const reset = () => {
    setForm(VACIO);
    setEditando(false);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.nombre_completo.trim().length < 3) return avisar("El nombre debe tener al menos 3 caracteres.");
    if (!rutValido(form.rut)) return avisar("El RUN no es válido. Ejemplo: 12.345.678-5");
    if (!correoValido(form.email.trim())) return avisar("El correo no es válido. Ejemplo: persona@gmail.com");
    try {
      const res = await fetch(editando ? `/api/usuarios/${form.id}` : "/api/usuarios/", {
        method: editando ? "PUT" : "POST",
        headers: headers(),
        body: JSON.stringify({ rut: form.rut, nombre_completo: form.nombre_completo, email: form.email.trim(), activo: form.activo }),
      });
      if (res.ok) {
        reset();
        cargar();
      } else {
        avisar((await res.json()).message || "Error al procesar la solicitud.");
      }
    } catch {
      avisar("Error de conexión");
    }
  };

  const eliminar = async (u: Usuario) => {
    if (!(await preguntar({ titulo: `¿Seguro que desea eliminar a ${u.nombre_completo}?`, mensaje: "Ya no podrá ingresar al panel.", peligro: true }))) return;
    const res = await fetch(`/api/usuarios/${u.id}`, { method: "DELETE", headers: headers() });
    if (res.ok) cargar();
    else avisar((await res.json()).message || "No se pudo eliminar.");
  };

  const cls = "w-full px-3 py-2 border rounded-lg border-slate-300";

  return (
    <div className="space-y-4">
      {dialogo}
      <div className="bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Usuarios</h1>
        <p className="text-sm text-slate-500 mt-1">Correos de Google autorizados para ingresar al panel interno.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">{editando ? "Editar usuario" : "Autorizar usuario"}</h2>
          <form onSubmit={guardar} className="space-y-4 text-sm">
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Nombre completo *</label>
              <input className={cls} value={form.nombre_completo} maxLength={150} required
                onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-700">RUN *</label>
              <input className={cls} value={form.rut} maxLength={12} placeholder="12.345.678-5" required
                onChange={(e) => setForm({ ...form, rut: formatearRut(e.target.value) })} />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Correo de Google *</label>
              <input type="email" className={cls} value={form.email} maxLength={150} placeholder="persona@gmail.com" required
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              <input type="checkbox" className="!w-4 !min-h-0" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Acceso activo
            </label>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-2 px-4 rounded-lg cursor-pointer">
                {editando ? "Actualizar" : "Autorizar"}
              </button>
              {editando && (
                <button type="button" onClick={reset} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2 px-3 rounded-lg cursor-pointer">
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="p-4">Usuario</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={3} className="p-8 text-center text-slate-400">Cargando usuarios...</td></tr>
              ) : usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-semibold text-slate-800">{u.nombre_completo}</div>
                    <div className="text-xs text-slate-500">{u.email} · {u.rut}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.activo ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="p-4 text-right whitespace-nowrap space-x-2">
                    <button onClick={() => { setForm(u); setEditando(true); }}
                      className="!min-h-0 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm px-3 py-1.5 rounded-lg cursor-pointer">Editar</button>
                    <button onClick={() => eliminar(u)}
                      className="!min-h-0 bg-red-700 hover:bg-red-800 text-white font-semibold text-sm px-3 py-1.5 rounded-lg cursor-pointer">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
