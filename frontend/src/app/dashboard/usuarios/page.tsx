"use client";

import Icono from "@/components/Icono";
import { useEffect, useState } from "react";
import Aviso, { useAviso } from "@/components/Aviso";
import { useDialogo } from "@/components/ConfirmDialog";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import ErrorCampo, { useErrores } from "@/components/ErrorCampo";
import Insignia from "@/components/Insignia";
import { errorCorreo, errorRut, formatearRut } from "@/lib/validar";

interface Usuario {
  id: number;
  rut: string;
  nombre_completo: string;
  email: string;
  activo: boolean;
}

const JSON_HDR = { "Content-Type": "application/json" };
const VACIO = { id: 0, rut: "", nombre_completo: "", email: "", activo: true };

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(false);
  const { preguntar, dialogo } = useDialogo();
  const avisar = (mensaje: string) => void preguntar({ titulo: "No se pudo completar la acción", mensaje, soloAviso: true });
  const exito = useAviso();
  const { errores, limpiar, fallar, props } = useErrores();

  const cargar = async () => {
    try {
      const res = await fetch("/api/usuarios/");
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
    fallar({});
  };

  const set = (campo: keyof typeof VACIO, id: string, valor: string | boolean) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    limpiar(id);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nuevos: Record<string, string> = {};
    if (form.nombre_completo.trim().length < 3) nuevos["us-nombre"] = "El nombre debe tener al menos 3 caracteres.";
    if (!form.rut.trim()) nuevos["us-rut"] = "Escriba el RUN de la persona.";
    else if (errorRut(form.rut, "RUN")) nuevos["us-rut"] = errorRut(form.rut, "RUN");
    if (!form.email.trim()) nuevos["us-email"] = "Escriba el correo de Google con el que ingresará.";
    else if (errorCorreo(form.email)) nuevos["us-email"] = errorCorreo(form.email);
    if (fallar(nuevos)) return;
    try {
      const res = await fetch(editando ? `/api/usuarios/${form.id}` : "/api/usuarios/", {
        method: editando ? "PUT" : "POST",
        headers: JSON_HDR,
        body: JSON.stringify({ rut: form.rut, nombre_completo: form.nombre_completo.trim(), email: form.email.trim(), activo: form.activo }),
      });
      if (res.ok) {
        exito.mostrar(editando ? "Usuario actualizado correctamente." : "Usuario registrado correctamente.");
        reset();
        cargar();
      } else {
        const msg: string = (await res.json().catch(() => ({}))).message || "Error al procesar la solicitud.";
        if (/correo|email/i.test(msg)) fallar({ "us-email": msg });
        else if (/RUN|RUT/i.test(msg)) fallar({ "us-rut": msg });
        else avisar(msg);
      }
    } catch {
      avisar("Error de conexión");
    }
  };

  const eliminar = async (u: Usuario) => {
    if (!(await preguntar({ titulo: `¿Seguro que desea eliminar a ${u.nombre_completo}?`, mensaje: "Ya no podrá ingresar al panel.", peligro: true }))) return;
    const res = await fetch(`/api/usuarios/${u.id}`, { method: "DELETE" });
    if (res.ok) {
      exito.mostrar("Usuario eliminado correctamente.");
      cargar();
    } else avisar((await res.json().catch(() => ({}))).message || "No se pudo eliminar.");
  };

  const lbl = "block font-semibold mb-1 text-slate-700";
  return (
    <div className="space-y-4">
      {dialogo}
      <EncabezadoPagina icono="usuarios" titulo="Usuarios" descripcion="Correos de Google autorizados para ingresar al panel interno."
        resumen={[{ texto: "Total", valor: usuarios.length }, { texto: "Con acceso", valor: usuarios.filter((u) => u.activo).length }]} />
      <Aviso texto={exito.texto} />

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start">
        <section className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b flex items-center gap-2">
            <Icono nombre={editando ? "lapiz" : "mas"} className="h-5 w-5 text-amber-500" />
            {editando ? "Editar usuario" : "Autorizar usuario"}
          </h2>
          <form onSubmit={guardar} noValidate className="space-y-4 text-sm">
            <div>
              <label className={lbl} htmlFor="us-nombre">Nombre completo *</label>
              <input {...props("us-nombre")} value={form.nombre_completo} maxLength={150} onChange={(e) => set("nombre_completo", "us-nombre", e.target.value)} />
              <ErrorCampo id="us-nombre" texto={errores["us-nombre"]} />
            </div>
            <div>
              <label className={lbl} htmlFor="us-rut">RUN *</label>
              <input {...props("us-rut")} value={form.rut} maxLength={12} placeholder="12.345.678-5" autoComplete="off"
                onChange={(e) => set("rut", "us-rut", formatearRut(e.target.value))} />
              <ErrorCampo id="us-rut" texto={errores["us-rut"]} />
            </div>
            <div>
              <label className={lbl} htmlFor="us-email">Correo de Google *</label>
              <input {...props("us-email")} type="text" inputMode="email" autoComplete="off" value={form.email} maxLength={150} placeholder="persona@gmail.com"
                onChange={(e) => set("email", "us-email", e.target.value)} />
              <ErrorCampo id="us-email" texto={errores["us-email"]} />
            </div>
            <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" className="!w-4 !min-h-0" checked={form.activo} onChange={(e) => set("activo", "us-activo", e.target.checked)} />
              Acceso activo
            </label>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm cursor-pointer">
                {editando ? "Actualizar" : "Autorizar"}
              </button>
              {editando && (
                <button type="button" onClick={reset} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 px-3 rounded-lg cursor-pointer">Cancelar</button>
              )}
            </div>
          </form>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={3} className="p-8 text-center text-slate-500">Cargando usuarios...</td></tr>
              ) : usuarios.map((u) => (
                <tr key={u.id} className={`hover:bg-slate-50 ${u.activo ? "" : "opacity-70"}`}>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{u.nombre_completo}</div>
                    <div className="text-sm text-slate-500 break-all">{u.email}</div>
                    <div className="text-sm font-mono text-slate-400">{u.rut}</div>
                  </td>
                  <td className="px-4 py-3"><Insignia tono={u.activo ? "verde" : "gris"}>{u.activo ? "Con acceso" : "Sin acceso"}</Insignia></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    <button onClick={() => { setForm(u); setEditando(true); fallar({}); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="!min-h-0 text-sm font-semibold text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer">Editar</button>
                    <button onClick={() => eliminar(u)}
                      className="!min-h-0 text-sm font-semibold text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
