"use client";

import { useDialogo } from "@/components/ConfirmDialog";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ESTADOS_PROYECTO, claseEstado, etiquetaEstado } from "@/lib/estados";
import PagoModal, { COLOR_ESTADO, ETIQUETA_ESTADO, NOMBRE_HITO, clp, textoBotonPago, type HitoPago } from "@/components/PagoModal";

interface CatalogoTipo {
  id: number;
  nombre: string;
  categoria: string;
}

interface Cotizacion {
  id: number;
  codigo_cotizacion: string;
  token_publico: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_rut?: string | null;
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

const POR_PAGINA = 8;

export default function ProyectosPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCotizacion, setSelectedCotizacion] = useState<Cotizacion | null>(null);
  const [modalHitosAbierto, setModalHitosAbierto] = useState(false);
  const [hitos, setHitos] = useState<HitoPago[]>([]);
  const [pagando, setPagando] = useState<HitoPago | null>(null);
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
      headers: { "Content-Type": "application/json" },
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
      void preguntar({ titulo: "No se pudo guardar", mensaje: e.message, soloAviso: true });
    } finally {
      setGuardandoVisita(false);
    }
  };
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("TODOS"); // estado del proyecto
  const [pagina, setPagina] = useState(1);
  const { preguntar, dialogo } = useDialogo();

  const fetchCotizaciones = async () => {
    try {
      const res = await fetch("/api/cotizaciones");

      if (res.ok) {
        const data = await res.json();
        setCotizaciones(data);
      } else if (res.status === 401) {
        router.push("/login");
      } else {
        setError("No fue posible obtener la lista de proyectos.");
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

  const abrirGestionHitos = async (cotizacion: Cotizacion) => {
    setSelectedCotizacion(cotizacion);
    setModalHitosAbierto(true);
    setHitos([]);
    setHitosCargando(true);
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacion.id}/hitos`, {
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

  if (loading) {
    return (
      <div className="text-xl p-12 text-center text-slate-500 font-semibold">
        Cargando proyectos...
      </div>
    );
  }

  const q = busqueda.trim().toLowerCase();
  const porEstado = filtro === "TODOS" ? cotizaciones : cotizaciones.filter((c) => c.estado === filtro);
  const visibles = q
    ? porEstado.filter((c) =>
        `${c.codigo_cotizacion} ${c.cliente_nombre} ${c.direccion_terreno} ${c.cliente_telefono || ""} ${c.cliente_rut || ""}`.toLowerCase().includes(q)
      )
    : porEstado;
  // Paginación: la lista nunca crece más allá de POR_PAGINA filas, así la página mantiene su forma con muchas obras.
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filas = visibles.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);
  const cuenta = (estado: string) => (estado === "TODOS" ? cotizaciones.length : cotizaciones.filter((c) => c.estado === estado).length);

  return (
    <div className="space-y-4">
      {dialogo}
      {/* Barra superior: título, búsqueda y acción principal en una sola línea */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 w-full sm:w-auto sm:mr-auto">
          Proyectos <span className="text-slate-400 font-semibold text-lg">{cotizaciones.length}</span>
        </h1>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
          placeholder="Buscar cliente, código o dirección"
          aria-label="Buscar proyecto"
          className="flex-1 min-w-0 sm:!w-80 sm:flex-none"
        />
        <Link
          href="/dashboard/cotizador"
          className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-4 sm:px-5 h-11 inline-flex items-center justify-center rounded-lg shadow-sm transition whitespace-nowrap"
        >
          + Nuevo proyecto
        </Link>
      </div>

      {/* Filtro por estado del proyecto */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar proyectos por estado">
        {[{ key: "TODOS", label: "Todos" }, ...ESTADOS_PROYECTO.map((e) => ({ key: e.key as string, label: e.plural }))].map((e) => (
          <button
            key={e.key}
            type="button"
            aria-pressed={filtro === e.key}
            onClick={() => { setFiltro(e.key); setPagina(1); }}
            className={`!min-h-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
              filtro === e.key ? "bg-blue-900 text-white" : "bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
            }`}
          >
            {e.label} <span className="opacity-70">{cuenta(e.key)}</span>
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-r-md text-base font-semibold">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse block md:table">
            <thead className="hidden md:table-header-group">
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Dirección</th>
                <th className="px-4 py-3 text-right">Valor total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm block md:table-row-group">
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    {cotizaciones.length === 0
                      ? "No existen proyectos registrados. Cree el primero mediante «Nuevo proyecto»."
                      : "Ningún proyecto coincide con el filtro o la búsqueda."}
                  </td>
                </tr>
              ) : (
                filas.map((cotizacion) => (
                  <tr key={cotizacion.id} className="hover:bg-slate-50 transition-colors block md:table-row p-2 md:p-0">
                    <td className="px-4 py-2 md:py-3 block md:table-cell">
                      <div className="font-bold text-slate-900">{cotizacion.cliente_nombre}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono font-semibold text-blue-800">{cotizacion.codigo_cotizacion}</span>
                        {" · "}{cotizacion.tipo_proyecto === "SOLO_RADIER" ? "Solo radier" : "Casa"}
                        {" · "}{new Date(cotizacion.fecha_creacion).toLocaleDateString("es-CL")}
                        {cotizacion.cliente_telefono ? ` · ${cotizacion.cliente_telefono}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-1 md:py-3 md:max-w-xs block md:table-cell">
                      <div className="text-slate-800 truncate" title={cotizacion.direccion_terreno}>
                        {cotizacion.direccion_terreno}
                      </div>
                      <div className="text-xs text-slate-500">{cotizacion.superficie_m2} m²</div>
                    </td>
                    <td className="px-4 py-1 md:py-3 md:text-right font-bold text-slate-900 tabular-nums whitespace-nowrap block md:table-cell">
                      ${Number(cotizacion.costo_total).toLocaleString("es-CL")}
                    </td>
                    <td className="px-4 py-2 md:py-3 block md:table-cell">
                      <span className={`inline-block text-sm font-semibold px-2.5 py-1 rounded-md border ${claseEstado(cotizacion.estado)}`}>
                        {etiquetaEstado(cotizacion.estado)}
                      </span>
                      {cotizacion.tipo_proyecto !== "SOLO_RADIER" && (
                        <button
                          onClick={() => abrirVisita(cotizacion)}
                          className="!min-h-0 block mt-1 text-xs font-semibold text-blue-700 hover:underline"
                          title="Medir el relleno de estabilizado tras la visita al terreno"
                        >
                          {cotizacion.nivelacion_modalidad
                            ? cotizacion.nivelacion_modalidad === "EMPRESA"
                              ? "Estabilizado: lo pone la empresa"
                              : "Estabilizado: lo compra el cliente"
                            : "Medir estabilizado"}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 md:py-3 block md:table-cell">
                      <div className="flex flex-wrap items-center md:justify-end gap-2">
                        <button
                          onClick={() => abrirGestionHitos(cotizacion)}
                          className="!min-h-0 text-sm font-semibold bg-white hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 transition"
                        >
                          Ver pagos
                        </button>
                        <Link
                          href={`/cotizacion/${cotizacion.token_publico}`}
                          className="text-sm font-semibold text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition"
                          title="Abrir la ficha que ve el cliente"
                        >
                          Ficha del cliente
                        </Link>
                        <Link
                          href={`/dashboard/proyecto/${cotizacion.id}`}
                          className="bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm px-4 py-1.5 rounded-lg transition"
                        >
                          Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {visibles.length > POR_PAGINA && (
          <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm" aria-label="Paginación de proyectos">
            <span className="text-slate-600">
              Mostrando {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, visibles.length)} de {visibles.length}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={paginaActual === 1} onClick={() => setPagina(paginaActual - 1)}
                className="!min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold disabled:opacity-40">
                Anterior
              </button>
              <span className="font-semibold text-slate-700 tabular-nums">Página {paginaActual} de {totalPaginas}</span>
              <button type="button" disabled={paginaActual === totalPaginas} onClick={() => setPagina(paginaActual + 1)}
                className="!min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold disabled:opacity-40">
                Siguiente
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* Modal de visita técnica (estabilizado) */}
      {visita && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Visita técnica: {visita.codigo_cotizacion}</h2>
                <p className="text-xs text-slate-500">
                  Cubicación del estabilizado (polvo de roca) para la base del radier ({visita.superficie_m2} m²).
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Pagos del contrato: {selectedCotizacion.codigo_cotizacion}
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
                        : hito.estado === "ABONADO"
                        ? "bg-orange-50/60 border-orange-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-800">
                        {idx + 1}. {NOMBRE_HITO[hito.fase] || hito.fase.replace(/_/g, " ")}
                      </div>
                      <div className="text-lg font-black text-slate-900 mt-1">{clp(hito.monto_pago)}</div>
                      {hito.estado === "ABONADO" && (
                        <div className="text-sm text-orange-900 font-semibold">
                          Abonado {clp(hito.monto_abonado)} · falta {clp(hito.monto_pendiente)}
                        </div>
                      )}
                      {hito.fecha_pago && hito.estado !== "PENDIENTE" && (
                        <div className="text-xs text-slate-500 mt-0.5">Último pago: {hito.fecha_pago}</div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`px-2.5 py-1 rounded border text-sm font-bold ${COLOR_ESTADO[hito.estado] || ""}`}>
                        {ETIQUETA_ESTADO[hito.estado] || hito.estado}
                      </span>
                      <button
                        onClick={() => setPagando(hito)}
                        className={`text-sm font-semibold px-3 py-2 rounded-lg border transition cursor-pointer ${
                          hito.estado === "PAGADO"
                            ? "bg-white text-slate-700 hover:bg-slate-100 border-slate-300"
                            : "bg-green-700 text-white hover:bg-green-800 border-green-700"
                        }`}
                      >
                        {textoBotonPago(hito)}
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
      {pagando && (
        <PagoModal
          hito={pagando}
          onClose={() => setPagando(null)}
          onSaved={(h) => {
            setHitos((prev) => prev.map((x) => (x.id === h.id ? h : x)));
            fetchCotizaciones();
          }}
        />
      )}
    </div>
  );
}
