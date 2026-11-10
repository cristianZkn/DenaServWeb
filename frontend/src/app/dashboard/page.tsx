"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CatalogoTipo {
  id: number;
  nombre: string;
  categoria: string;
}

interface HitoPago {
  id: number;
  cotizacion_id: number;
  fase: string;
  porcentaje: number;
  monto_pago: number;
  estado: string;
  fecha_pago: string | null;
  comprobante_ref: string | null;
}

interface Cotizacion {
  id: number;
  codigo_cotizacion: string;
  token_publico: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  direccion_terreno: string;
  superficie_m2: number;
  costo_total: number;
  estado: string;
  tipo_proyecto?: string;
  nivelacion_modalidad?: string;
  nivelacion_m3?: number;
  costo_nivelacion?: number;
  fecha_creacion: string;
  base_terreno?: CatalogoTipo | null;
  revestimiento?: CatalogoTipo | null;
  hitos_pago?: HitoPago[];
}

export default function DashboardPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCotizacion, setSelectedCotizacion] = useState<Cotizacion | null>(null);
  const [modalHitosAbierto, setModalHitosAbierto] = useState(false);
  const [hitos, setHitos] = useState<HitoPago[]>([]);
  const [actualizandoHito, setActualizandoHito] = useState<number | null>(null);
  const [hitosCargando, setHitosCargando] = useState(false);

  // Visita técnica al terreno: cubicación del estabilizado (no va en la cotización inicial)
  const [visita, setVisita] = useState<Cotizacion | null>(null);
  const [espesor, setEspesor] = useState(10);
  const [aridoEmpresa, setAridoEmpresa] = useState(true);
  const [previa, setPrevia] = useState<{ m3: number; costo: number; total_nuevo: number } | null>(null);
  const [guardandoVisita, setGuardandoVisita] = useState(false);

  const llamarNivelacion = async (cot: Cotizacion, aplicar: boolean) => {
    const res = await fetch(`/api/cotizaciones/${cot.id}/nivelacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify({ espesor_cm: espesor, arido_empresa: aridoEmpresa, aplicar }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al calcular");
    return data;
  };

  useEffect(() => {
    if (!visita) return;
    const t = setTimeout(() => {
      llamarNivelacion(visita, false).then(setPrevia).catch(() => setPrevia(null));
    }, 300);
    return () => clearTimeout(t);
  }, [visita, espesor, aridoEmpresa]);

  const abrirVisita = (c: Cotizacion) => {
    setVisita(c);
    setEspesor(10);
    setAridoEmpresa(c.nivelacion_modalidad !== "CLIENTE");
    setPrevia(null);
  };

  const guardarVisita = async () => {
    if (!visita) return;
    setGuardandoVisita(true);
    try {
      await llamarNivelacion(visita, true);
      setVisita(null);
      fetchCotizaciones();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGuardandoVisita(false);
    }
  };
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");

  const fetchCotizaciones = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch("/api/cotizaciones", { headers });

      if (res.ok) {
        const data = await res.json();
        setCotizaciones(data);
      } else if (res.status === 401) {
        localStorage.removeItem("token");
        router.push("/login");
      } else {
        setError("Error al obtener la lista de cotizaciones.");
      }
    } catch (err) {
      setError("Error de red al conectar con el servidor backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCotizaciones();
  }, []);

  const handleCambiarEstadoCotizacion = async (cotizacionId: number, nuevoEstado: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/estado`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      if (res.ok) {
        setCotizaciones((prev) =>
          prev.map((c) => (c.id === cotizacionId ? { ...c, estado: nuevoEstado } : c))
        );
      } else {
        alert("No se pudo actualizar el estado.");
      }
    } catch (e) {
      alert("Error al comunicarse con el servidor.");
    }
  };

  const abrirGestionHitos = async (cotizacion: Cotizacion) => {
    setSelectedCotizacion(cotizacion);
    setModalHitosAbierto(true);
    setHitos([]);
    setHitosCargando(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/cotizaciones/${cotizacion.id}/hitos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHitos(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHitosCargando(false);
    }
  };

  const handleToggleEstadoHito = async (hitoId: number, estadoActual: string) => {
    setActualizandoHito(hitoId);
    const nuevoEstado = estadoActual === "PAGADO" ? "PENDIENTE" : "PAGADO";
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/hitos-pago/${hitoId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      if (res.ok) {
        const hitoActualizado = await res.json();
        setHitos((prev) => prev.map((h) => (h.id === hitoId ? hitoActualizado : h)));
      } else {
        alert("Error al actualizar estado del hito.");
      }
    } catch (e) {
      alert("Error de red.");
    } finally {
      setActualizandoHito(null);
    }
  };

  if (loading) {
    return (
      <div className="text-xl p-12 text-center text-slate-500 font-semibold">
        Cargando panel de cotizaciones...
      </div>
    );
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? cotizaciones.filter((c) =>
        `${c.codigo_cotizacion} ${c.cliente_nombre} ${c.direccion_terreno} ${c.cliente_telefono || ""}`.toLowerCase().includes(q)
      )
    : cotizaciones;

  return (
    <div className="space-y-4">
      {/* Barra superior: título, búsqueda y acción principal en una sola línea */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900 mr-auto">
          Mis cotizaciones <span className="text-slate-400 font-semibold text-lg">{cotizaciones.length}</span>
        </h1>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente, código o dirección"
          aria-label="Buscar cotización"
          className="sm:!w-80"
        />
        <Link
          href="/dashboard/cotizador"
          className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-5 h-11 inline-flex items-center rounded-lg shadow-sm transition"
        >
          + Nueva cotización
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r-md text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Terreno</th>
                <th className="px-4 py-3 text-right">Valor total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    {cotizaciones.length === 0
                      ? "Aún no hay cotizaciones. Cree la primera con «Nueva cotización»."
                      : "Ninguna cotización coincide con la búsqueda."}
                  </td>
                </tr>
              ) : (
                visibles.map((cotizacion) => (
                  <tr key={cotizacion.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{cotizacion.cliente_nombre}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono font-semibold text-blue-800">{cotizacion.codigo_cotizacion}</span>
                        {" · "}{cotizacion.tipo_proyecto === "SOLO_RADIER" ? "Solo radier" : "Casa"}
                        {" · "}{new Date(cotizacion.fecha_creacion).toLocaleDateString("es-CL")}
                        {cotizacion.cliente_telefono ? ` · ${cotizacion.cliente_telefono}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-slate-800 truncate" title={cotizacion.direccion_terreno}>
                        {cotizacion.direccion_terreno}
                      </div>
                      <div className="text-xs text-slate-500">{cotizacion.superficie_m2} m²</div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      ${Number(cotizacion.costo_total).toLocaleString("es-CL")}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={cotizacion.estado}
                        onChange={(e) => handleCambiarEstadoCotizacion(cotizacion.id, e.target.value)}
                        aria-label="Estado de la cotización"
                        className={`!min-h-0 !w-auto text-sm font-semibold !px-2 !py-1 rounded-md border cursor-pointer ${
                          cotizacion.estado === "ACEPTADA"
                            ? "bg-green-50 text-green-800 border-green-300"
                            : cotizacion.estado === "FINALIZADA"
                            ? "bg-blue-50 text-blue-800 border-blue-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}
                      >
                        <option value="BORRADOR">En preparación</option>
                        <option value="ACEPTADA">Aceptada</option>
                        <option value="FINALIZADA">Obra terminada</option>
                      </select>
                      {cotizacion.tipo_proyecto !== "SOLO_RADIER" && (
                        <button
                          onClick={() => abrirVisita(cotizacion)}
                          className="!min-h-0 block mt-1 text-xs font-semibold text-blue-700 hover:underline"
                          title="Medir el relleno de estabilizado tras visitar el terreno"
                        >
                          {cotizacion.nivelacion_modalidad
                            ? cotizacion.nivelacion_modalidad === "EMPRESA"
                              ? "Estabilizado: lo pone la empresa"
                              : "Estabilizado: lo compra el cliente"
                            : "Medir estabilizado"}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          onClick={() => abrirGestionHitos(cotizacion)}
                          className="!min-h-0 text-sm font-semibold bg-white hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 transition"
                        >
                          Pagos
                        </button>
                        <Link
                          href={`/cotizacion/${cotizacion.token_publico}`}
                          target="_blank"
                          className="text-sm font-semibold text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition"
                          title="Abrir la ficha que ve el cliente"
                        >
                          Ficha ↗
                        </Link>
                        <Link
                          href={`/dashboard/proyecto/${cotizacion.id}`}
                          className="bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm px-4 py-1.5 rounded-lg transition"
                        >
                          Abrir
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de visita técnica (estabilizado) */}
      {visita && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Visita técnica: {visita.codigo_cotizacion}</h2>
                <p className="text-xs text-slate-500">
                  Cubicación del estabilizado base o polvo de roca para la base del radier ({visita.superficie_m2} m²).
                </p>
              </div>
              <button onClick={() => setVisita(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer">
                ✕
              </button>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Espesor de la capa (cm)</label>
              <input type="number" min="1" value={espesor} onChange={(e) => setEspesor(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Quién lo adquiere</label>
              <select value={String(aridoEmpresa)} onChange={(e) => setAridoEmpresa(e.target.value === "true")}>
                <option value="true">La empresa (se suma al valor informado)</option>
                <option value="false">El cliente lo compra directamente</option>
              </select>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1">
              {previa ? (
                <>
                  <div>Volumen a informar al cliente: <strong>{Number(previa.m3).toLocaleString("es-CL")} m³</strong></div>
                  <div>Costo sumado: <strong>${Number(previa.costo).toLocaleString("es-CL")}</strong></div>
                  <div>Nuevo total (IVA incl.): <strong>${Number(previa.total_nuevo).toLocaleString("es-CL")}</strong></div>
                </>
              ) : (
                <div className="text-slate-400">Calculando...</div>
              )}
              <p className="text-[11px] text-slate-500 pt-1">
                La diferencia se reparte entre los hitos de pago aún pendientes.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => setVisita(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm cursor-pointer">
                Cancelar
              </button>
              <button
                onClick={guardarVisita}
                disabled={guardandoVisita || !previa}
                className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-sm disabled:opacity-50 cursor-pointer"
              >
                {guardandoVisita ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Hitos de Pago */}
      {modalHitosAbierto && selectedCotizacion && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Hitos de Pago: {selectedCotizacion.codigo_cotizacion}
                </h2>
                <p className="text-xs text-slate-500">
                  Cliente: {selectedCotizacion.cliente_nombre} | Total: ${Number(selectedCotizacion.costo_total).toLocaleString("es-CL")}
                </p>
              </div>
              <button
                onClick={() => setModalHitosAbierto(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {hitos.length === 0 ? (
                <div className="p-6 text-center text-slate-400">{hitosCargando ? "Cargando hitos..." : "No se pudieron cargar los hitos de pago."}</div>
              ) : (
                hitos.map((hito, idx) => (
                  <div
                    key={hito.id}
                    className={`p-4 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${
                      hito.estado === "PAGADO"
                        ? "bg-green-50/60 border-green-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Hito #{idx + 1}
                        </span>
                        <span className="font-bold text-slate-800">
                          {hito.fase.replace(/_/g, " ")} ({hito.porcentaje}%)
                        </span>
                      </div>
                      <div className="text-lg font-black text-slate-900 mt-1">
                        ${Number(hito.monto_pago).toLocaleString("es-CL")}
                      </div>
                      {hito.fecha_pago && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          Fecha de Pago: {hito.fecha_pago}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                          hito.estado === "PAGADO"
                            ? "bg-green-100 text-green-800 border border-green-300"
                            : "bg-amber-100 text-amber-800 border border-amber-300"
                        }`}
                      >
                        {hito.estado}
                      </span>
                      <button
                        onClick={() => handleToggleEstadoHito(hito.id, hito.estado)}
                        disabled={actualizandoHito === hito.id}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                          hito.estado === "PAGADO"
                            ? "bg-white text-slate-700 hover:bg-slate-100 border-slate-300"
                            : "bg-green-700 text-white hover:bg-green-800 border-green-700"
                        }`}
                      >
                        {actualizandoHito === hito.id
                          ? "Actualizando..."
                          : hito.estado === "PAGADO"
                          ? "Marcar Pendiente"
                          : "Marcar Pagado ✓"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                onClick={() => setModalHitosAbierto(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-sm cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
