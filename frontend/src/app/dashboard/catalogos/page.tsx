"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Proveedor {
  id: number;
  razon_social: string;
}

interface CatalogoItem {
  id: number;
  categoria: string;
  nombre: string;
  descripcion: string | null;
  unidad_medida: string;
  precio_base_unitario: number;
  proveedor_id: number | null;
  etapa_obra?: string;
  rendimiento_m2?: number;
  fuente_url?: string;
  fuente_termino?: string;
  precio_actualizado_en?: string | null;
  proveedor?: Proveedor | null;
  activo: boolean;
}

const CATEGORIAS_PREDEFINIDAS = [
  { key: "TODAS", label: "Todas las Categorías" },
  { key: "BASE_TERRENO", label: "Base Terreno" },
  { key: "REVESTIMIENTO", label: "Revestimiento" },
  { key: "INSUMO", label: "Insumos (BOM)" },
  { key: "TABIQUERIA", label: "Tabiquería" },
  { key: "TECHUMBRE", label: "Techumbre" },
  { key: "TERMINACION", label: "Terminación" },
  { key: "ESTRUCTURA", label: "Estructura" },
  { key: "FIJACION", label: "Fijación" },
];

export default function CatalogosPage() {
  const router = useRouter();
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>("TODAS");
  const [busqueda, setBusqueda] = useState<string>("");
  const [pagina, setPagina] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [itemEdicion, setItemEdicion] = useState<CatalogoItem | null>(null);

  const [formData, setFormData] = useState({
    categoria: "REVESTIMIENTO",
    nombre: "",
    descripcion: "",
    unidad_medida: "M2",
    precio_base_unitario: 0,
    proveedor_id: "" as string | number,
    etapa_obra: "",
    rendimiento_m2: 0,
    fuente_url: "",
    fuente_termino: "",
    activo: true,
  });

  const [actualizando, setActualizando] = useState(false);
  const actualizarPrecios = async () => {
    setActualizando(true);
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    try {
      const inicio = await fetch("/api/catalogo-tipos/actualizar-precios", { method: "POST", headers });
      if (!inicio.ok && inicio.status !== 409) throw new Error("No se pudo iniciar la sincronización");

      // La sincronización corre en segundo plano (~1-2 min): se consulta el estado cada 3 s.
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch("/api/catalogo-tipos/actualizar-precios/estado", { headers });
        if (!res.ok) throw new Error("No se pudo consultar el estado");
        const est = await res.json();
        if (est.estado === "running") continue;
        if (est.estado === "error") throw new Error(est.resultado?.message || "Error en la sincronización");
        const r = est.resultado || {};
        alert(
          `Creados: ${(r.creados || []).length}. Precios actualizados: ${r.actualizados ?? 0}. Sin cambio: ${r.sin_cambio ?? 0}.` +
            ((r.no_encontrados || []).length ? `
No encontrados: ${r.no_encontrados.join(", ")}` : "") +
            ((r.sin_coincidencia || []).length ? `
Sin coincidencia: ${r.sin_coincidencia.join(", ")}` : "") +
            ((r.errores || []).length ? `
Errores: ${r.errores.join("; ")}` : "")
        );
        break;
      }
      fetchData();
    } catch (e: any) {
      alert(`No se pudo actualizar: ${e.message}`);
    } finally {
      setActualizando(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };
      const [resCatalogos, resProveedores] = await Promise.all([
        fetch("/api/catalogo-tipos", { headers }),
        fetch("/api/proveedores", { headers }),
      ]);

      if (resCatalogos.ok) {
        const data = await resCatalogos.json();
        setItems(data);
      }
      if (resProveedores.ok) {
        setProveedores(await resProveedores.json());
      }
    } catch (err) {
      setError("Error al cargar la información del servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const abrirModalCrear = () => {
    setItemEdicion(null);
    setFormData({
      categoria: categoriaSeleccionada !== "TODAS" ? categoriaSeleccionada : "REVESTIMIENTO",
      nombre: "",
      descripcion: "",
      unidad_medida: "M2",
      precio_base_unitario: 0,
      proveedor_id: "",
      etapa_obra: "",
      rendimiento_m2: 0,
      fuente_url: "",
      fuente_termino: "",
      activo: true,
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (item: CatalogoItem) => {
    setItemEdicion(item);
    setFormData({
      categoria: item.categoria,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      unidad_medida: item.unidad_medida,
      precio_base_unitario: item.precio_base_unitario,
      proveedor_id: item.proveedor_id || "",
      etapa_obra: item.etapa_obra || "",
      rendimiento_m2: Number(item.rendimiento_m2) || 0,
      fuente_url: item.fuente_url || "",
      fuente_termino: item.fuente_termino || "",
      activo: item.activo,
    });
    setModalAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      const url = itemEdicion
        ? `/api/catalogo-tipos/${itemEdicion.id}`
        : "/api/catalogo-tipos";
      const method = itemEdicion ? "PUT" : "POST";

      const payload = {
        ...formData,
        precio_base_unitario: parseFloat(formData.precio_base_unitario as any) || 0,
        proveedor_id: formData.proveedor_id ? parseInt(formData.proveedor_id as any) : null,
        rendimiento_m2: Number(formData.rendimiento_m2) || 0,
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setModalAbierto(false);
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || "Error al guardar el tipo de catálogo.");
      }
    } catch (err) {
      setError("Error de conexión al guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm("¿Seguro que deseas eliminar este elemento del catálogo?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/catalogo-tipos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || "No se pudo eliminar.");
      }
    } catch (err) {
      alert("Error al comunicarse con el servidor.");
    }
  };

  const itemsFiltrados = items.filter((item) => {
    const coincideCategoria =
      categoriaSeleccionada === "TODAS" ||
      item.categoria.toUpperCase() === categoriaSeleccionada.toUpperCase();
    const coincideBusqueda =
      item.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (item.descripcion && item.descripcion.toLowerCase().includes(busqueda.toLowerCase()));
    return coincideCategoria && coincideBusqueda;
  });

  // Paginación (en el navegador: el catálogo completo ya viene cargado)
  const POR_PAGINA = 10;
  const totalPaginas = Math.max(1, Math.ceil(itemsFiltrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * POR_PAGINA;
  const itemsPagina = itemsFiltrados.slice(inicio, inicio + POR_PAGINA);

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Materiales y precios</h1>
          <p className="text-sm text-slate-500">Los precios se actualizan solos cada semana desde las tiendas.</p>
        </div>
        <div className="flex gap-2">
        <button
          onClick={actualizarPrecios}
          disabled={actualizando}
          className="bg-white border border-blue-900 text-blue-900 hover:bg-blue-50 font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-50 cursor-pointer"
        >
          {actualizando ? "Actualizando..." : "Sincronizar catálogo y precios"}
        </button>
        <button
          onClick={abrirModalCrear}
          className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-4 py-2.5 rounded-lg shadow transition flex items-center gap-2 cursor-pointer"
        >
          <span>+</span> Nuevo Tipo
        </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r-md text-sm">
          {error}
        </div>
      )}

      {/* Tabs y Filtros */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
        {/* Tabs de Categorías */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS_PREDEFINIDAS.map((cat) => (
            <button
              key={cat.key}
              onClick={() => {
                setCategoriaSeleccionada(cat.key);
                setPagina(1);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                categoriaSeleccionada === cat.key
                  ? "bg-blue-900 text-white shadow-sm"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <input
            type="search"
            placeholder="Buscar por nombre o descripción"
            aria-label="Buscar material"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            className="sm:!w-80"
          />
          <div className="text-sm text-slate-500">
            <strong>{itemsFiltrados.length}</strong> de {items.length} materiales
          </div>
        </div>
      </div>

      {/* Tabla de Catálogos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="p-4">Categoría</th>
                <th className="p-4">Nombre y Descripción</th>
                <th className="p-4">Unidad</th>
                <th className="p-4">Precio Base</th>
                <th className="p-4">Proveedor</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Cargando catálogo...
                  </td>
                </tr>
              ) : itemsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No se encontraron registros para la categoría seleccionada.
                  </td>
                </tr>
              ) : (
                itemsPagina.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-semibold">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        {item.categoria}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-800">{item.nombre}</p>
                      {item.descripcion && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.descripcion}</p>
                      )}
                    </td>
                    <td className="p-4 font-medium text-slate-600">{item.unidad_medida}</td>
                    <td className="p-4 font-bold text-slate-900">
                      ${Number(item.precio_base_unitario).toLocaleString("es-CL")}
                      {item.precio_actualizado_en && (
                        <div className="text-[10px] font-normal text-slate-400">
                          act. {new Date(item.precio_actualizado_en).toLocaleDateString("es-CL")}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-slate-600">
                      {item.proveedor?.razon_social || (
                        <span className="text-xs text-slate-400 italic">Sin proveedor</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          item.activo
                            ? "bg-green-100 text-green-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => abrirModalEditar(item)}
                        className="text-blue-600 hover:text-blue-900 font-semibold text-xs cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleEliminar(item.id)}
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

        {itemsFiltrados.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50">
            <span className="text-base text-slate-600">
              Mostrando {inicio + 1} a {Math.min(inicio + POR_PAGINA, itemsFiltrados.length)} de {itemsFiltrados.length}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPagina(paginaActual - 1)}
                disabled={paginaActual <= 1}
                className="px-5 py-2 rounded-lg border-2 border-blue-900 text-blue-900 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                ← Anterior
              </button>
              <span className="text-base font-semibold text-slate-700">
                Página {paginaActual} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina(paginaActual + 1)}
                disabled={paginaActual >= totalPaginas}
                className="px-5 py-2 rounded-lg border-2 border-blue-900 text-blue-900 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-3">
              {itemEdicion ? "Editar Elemento del Catálogo" : "Nuevo Elemento del Catálogo"}
            </h2>

            <form onSubmit={handleGuardar} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Categoría *</label>
                  <select
                    value={formData.categoria}
                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg border-slate-300"
                    required
                  >
                    <option value="REVESTIMIENTO">REVESTIMIENTO</option>
                    <option value="BASE_TERRENO">BASE_TERRENO</option>
                    
                    <option value="INSUMO">INSUMO</option>
                    <option value="TABIQUERIA">TABIQUERIA</option>
                    <option value="TECHUMBRE">TECHUMBRE</option>
                    <option value="TERMINACION">TERMINACION</option>
                    <option value="ESTRUCTURA">ESTRUCTURA</option>
                    <option value="FIJACION">FIJACION</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Unidad de Medida *</label>
                  <input
                    type="text"
                    value={formData.unidad_medida}
                    onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}
                    placeholder="M2, ML, UN, KG"
                    className="w-full px-3 py-2 border rounded-lg border-slate-300"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Nombre *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Smart Panel 11.1mm"
                  className="w-full px-3 py-2 border rounded-lg border-slate-300"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Descripción</label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={2}
                  placeholder="Detalles técnicos u observaciones..."
                  className="w-full px-3 py-2 border rounded-lg border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Precio Base Unitario ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.precio_base_unitario}
                    onChange={(e) =>
                      setFormData({ ...formData, precio_base_unitario: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border rounded-lg border-slate-300"
                    required
                  />
                </div>
                {formData.categoria === "INSUMO" && (
                  <>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">Etapa de obra</label>
                      <select
                        value={formData.etapa_obra}
                        onChange={(e) => setFormData({ ...formData, etapa_obra: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg border-slate-300"
                        required
                      >
                        <option value="">-- Seleccione --</option>
                        <option value="ETAPA_1">Etapa 1 (obra gruesa)</option>
                        <option value="ETAPA_2">Etapa 2 (terminaciones)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">Cantidad por m² de casa</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={formData.rendimiento_m2}
                        onChange={(e) => setFormData({ ...formData, rendimiento_m2: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border rounded-lg border-slate-300"
                        required
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">URL del producto en Sodimac (opcional)</label>
                  <input
                    type="url"
                    value={formData.fuente_url}
                    onChange={(e) => setFormData({ ...formData, fuente_url: e.target.value })}
                    placeholder="https://www.sodimac.cl/sodimac-cl/articulo/..."
                    className="w-full px-3 py-2 border rounded-lg border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Término de búsqueda (para actualizar precio)</label>
                  <input
                    type="text"
                    value={formData.fuente_termino}
                    onChange={(e) => setFormData({ ...formData, fuente_termino: e.target.value })}
                    placeholder="ej. pino impregnado 2x3"
                    className="w-full px-3 py-2 border rounded-lg border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Proveedor</label>
                  <select
                    value={formData.proveedor_id}
                    onChange={(e) => setFormData({ ...formData, proveedor_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg border-slate-300"
                  >
                    <option value="">-- Sin Proveedor --</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.razon_social}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activo"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-900"
                />
                <label htmlFor="activo" className="font-semibold text-slate-700">
                  Elemento Activo (Disponible para Cotizar)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer font-semibold shadow-sm"
                >
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
