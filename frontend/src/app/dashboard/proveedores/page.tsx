"use client";

import { useEffect, useMemo, useState } from "react";
import Aviso, { useAviso } from "@/components/Aviso";
import { useDialogo } from "@/components/ConfirmDialog";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import ErrorCampo, { useErrores } from "@/components/ErrorCampo";
import Insignia from "@/components/Insignia";
import { errorCorreo, errorRut, errorTelefono, formatearRut, formatearTelefono } from "@/lib/validar";

interface Proveedor {
  id: number;
  rut_empresa: string;
  razon_social: string;
  contacto_nombre: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
}

const VACIO = { id: 0, rut_empresa: "", razon_social: "", contacto_nombre: "", telefono: "", email: "", activo: true };

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(VACIO);
  const [isEditing, setIsEditing] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");
  const { preguntar, dialogo } = useDialogo();
  const avisar = (mensaje: string) => void preguntar({ titulo: "No se pudo completar la acción", mensaje, soloAviso: true });
  const exito = useAviso();
  const { errores, limpiar, fallar, props } = useErrores();

  const fetchProveedores = async () => {
    try {
      const res = await fetch("/api/proveedores");
      if (res.ok) setProveedores(await res.json());
      else avisar("Error al cargar proveedores");
    } catch {
      avisar("Error de red");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProveedores();
  }, []);

  const set = (campo: keyof typeof VACIO, id: string, valor: string | boolean) => {
    setFormData((f) => ({ ...f, [campo]: valor }));
    limpiar(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const razon = formData.razon_social.trim();
    const nuevos: Record<string, string> = {};
    if (!formData.rut_empresa.trim()) nuevos["pv-rut"] = "Escriba el RUT de la empresa.";
    else if (errorRut(formData.rut_empresa, "RUT")) nuevos["pv-rut"] = errorRut(formData.rut_empresa, "RUT");
    if (razon.length < 2 || razon.length > 150) nuevos["pv-razon"] = "La razón social debe tener entre 2 y 150 caracteres.";
    if (formData.telefono.trim() && errorTelefono(formData.telefono)) nuevos["pv-tel"] = errorTelefono(formData.telefono);
    if (formData.email.trim() && errorCorreo(formData.email)) nuevos["pv-email"] = errorCorreo(formData.email);
    if (fallar(nuevos)) return;

    const payload = {
      rut_empresa: formData.rut_empresa,
      razon_social: razon,
      contacto_nombre: formData.contacto_nombre.trim() || null,
      telefono: formData.telefono || null,
      email: formData.email.trim() || null,
      activo: formData.activo,
    };

    try {
      const res = await fetch(isEditing ? `/api/proveedores/${formData.id}` : "/api/proveedores", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        exito.mostrar(isEditing ? "Proveedor actualizado correctamente." : "Proveedor registrado correctamente.");
        resetForm();
        fetchProveedores();
      } else {
        const err = await res.json().catch(() => ({}));
        const msg: string = err.message || "Error al procesar la solicitud.";
        if (/RUT/i.test(msg)) fallar({ "pv-rut": msg });  // p. ej. «Ya existe un proveedor con ese RUT.»
        else avisar(msg);
      }
    } catch {
      avisar("Error de conexión");
    }
  };

  const handleEdit = (p: Proveedor) => {
    setFormData({ id: p.id, rut_empresa: p.rut_empresa, razon_social: p.razon_social, contacto_nombre: p.contacto_nombre || "",
      telefono: p.telefono || "", email: p.email || "", activo: p.activo });
    fallar({});
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (p: Proveedor) => {
    if (!(await preguntar({ titulo: `¿Seguro que desea eliminar a ${p.razon_social}?`, mensaje: "Esta acción no se puede deshacer.", peligro: true }))) return;
    try {
      const res = await fetch(`/api/proveedores/${p.id}`, { method: "DELETE" });
      if (res.ok) {
        exito.mostrar("Proveedor eliminado correctamente.");
        fetchProveedores();
      } else {
        avisar((await res.json().catch(() => ({}))).message || "No se pudo eliminar.");
      }
    } catch {
      avisar("Error al comunicarse con el backend.");
    }
  };

  const resetForm = () => {
    setFormData(VACIO);
    setIsEditing(false);
    fallar({});
  };

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return proveedores
      .filter((p) => filtro === "TODOS" || (filtro === "ACTIVOS" ? p.activo : !p.activo))
      .filter((p) => !q || `${p.razon_social} ${p.rut_empresa} ${p.contacto_nombre ?? ""} ${p.email ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.razon_social.localeCompare(b.razon_social, "es"));
  }, [proveedores, busqueda, filtro]);

  const lbl = "block font-semibold mb-1 text-slate-700";
  return (
    <div className="space-y-4">
      {dialogo}
      <EncabezadoPagina icono="🏢" titulo="Proveedores" descripcion="Empresas a las que se les compran los materiales. Cada material elige su proveedor y lleva su propio descuento."
        resumen={[{ texto: "Total", valor: proveedores.length }, { texto: "Activos", valor: proveedores.filter((p) => p.activo).length }]} />
      <Aviso texto={exito.texto} />

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start">
        {/* Formulario */}
        <section className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b flex items-center gap-2">
            <span aria-hidden className="text-amber-500">{isEditing ? "✎" : "＋"}</span>
            {isEditing ? "Editar proveedor" : "Registrar proveedor"}
          </h2>
          <form onSubmit={handleSubmit} noValidate className="space-y-4 text-sm">
            <div>
              <label className={lbl} htmlFor="pv-rut">RUT de la empresa *</label>
              <input {...props("pv-rut")} value={formData.rut_empresa} onChange={(e) => set("rut_empresa", "pv-rut", formatearRut(e.target.value))}
                placeholder="Ej: 76.123.456-0" maxLength={12} inputMode="text" autoComplete="off" />
              <ErrorCampo id="pv-rut" texto={errores["pv-rut"]} />
            </div>
            <div>
              <label className={lbl} htmlFor="pv-razon">Razón social *</label>
              <input {...props("pv-razon")} value={formData.razon_social} onChange={(e) => set("razon_social", "pv-razon", e.target.value)}
                placeholder="Ej: Maderas del Sur SpA" maxLength={150} />
              <ErrorCampo id="pv-razon" texto={errores["pv-razon"]} />
            </div>
            <div>
              <label className={lbl} htmlFor="pv-contacto">Contacto comercial</label>
              <input id="pv-contacto" value={formData.contacto_nombre} onChange={(e) => set("contacto_nombre", "pv-contacto", e.target.value)}
                placeholder="Ej: Pedro Valdivia" maxLength={100} />
            </div>
            <div>
              <label className={lbl} htmlFor="pv-tel">Teléfono</label>
              <input {...props("pv-tel")} type="tel" value={formData.telefono} onChange={(e) => set("telefono", "pv-tel", formatearTelefono(e.target.value))}
                placeholder="+56 9 1234 5678" maxLength={16} />
              <ErrorCampo id="pv-tel" texto={errores["pv-tel"]} />
            </div>
            <div>
              <label className={lbl} htmlFor="pv-email">Correo electrónico</label>
              <input {...props("pv-email")} type="text" inputMode="email" autoComplete="off" value={formData.email}
                onChange={(e) => set("email", "pv-email", e.target.value)} placeholder="contacto@proveedor.cl" maxLength={254} />
              <ErrorCampo id="pv-email" texto={errores["pv-email"]} />
            </div>
            <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" className="!w-4 !min-h-0" checked={formData.activo} onChange={(e) => set("activo", "pv-activo", e.target.checked)} />
              Proveedor activo
            </label>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm cursor-pointer">
                {isEditing ? "Actualizar" : "Crear proveedor"}
              </button>
              {isEditing && (
                <button type="button" onClick={resetForm} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 px-3 rounded-lg cursor-pointer">Cancelar</button>
              )}
            </div>
          </form>
        </section>

        {/* Listado */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
            <input type="search" aria-label="Buscar proveedor" placeholder="Buscar por razón social, RUT o contacto" value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)} className="flex-1 min-w-0 sm:!w-72 sm:flex-none" />
            <div className="flex gap-1.5" role="group" aria-label="Filtrar por estado">
              {([["TODOS", "Todos"], ["ACTIVOS", "Activos"], ["INACTIVOS", "Inactivos"]] as const).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
                  className={`!min-h-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${filtro === k ? "bg-blue-900 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                  <th className="px-4 py-3">Razón social</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-500">Cargando proveedores...</td></tr>
                ) : visibles.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-500">{proveedores.length === 0 ? "No hay proveedores registrados." : "Ningún proveedor coincide con la búsqueda."}</td></tr>
                ) : (
                  visibles.map((p) => (
                    <tr key={p.id} className={`hover:bg-slate-50 ${p.activo ? "" : "opacity-70"}`}>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{p.razon_social}</div>
                        <div className="text-sm font-mono text-slate-500">{p.rut_empresa}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-slate-800">{p.contacto_nombre || <span className="text-slate-400">Sin contacto</span>}</div>
                        {p.telefono && <div className="text-slate-500">{p.telefono}</div>}
                        {p.email && <div className="text-slate-500 break-all">{p.email}</div>}
                      </td>
                      <td className="px-4 py-3"><Insignia tono={p.activo ? "verde" : "gris"}>{p.activo ? "Activo" : "Inactivo"}</Insignia></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        <button onClick={() => handleEdit(p)} className="!min-h-0 text-sm font-semibold text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer">Editar</button>
                        <button onClick={() => handleDelete(p)} className="!min-h-0 text-sm font-semibold text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer">Eliminar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
