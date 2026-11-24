"use client";

import Icono, { type NombreIcono } from "@/components/Icono";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Contador, useMontado } from "@/components/Animaciones";
import { useVisible } from "@/components/Reveal";

interface ProgresoObra {
  id: number;
  codigo_cotizacion: string;
  cliente_nombre: string;
  avance: number;
}

interface Trimestre {
  clave: string;
  etiqueta: string;
  creados: number;
  terminados: number;
}

interface Estadisticas {
  cotizados: number;
  en_ejecucion: number;
  terminados: number;
  trimestres: Trimestre[];
}

const SEGMENTOS = 20;

/** Etapa y color de la barra según el avance. El 50 % es cuando corresponde el 2.º pago. */
function etapa(av: number) {
  if (av >= 100) return { texto: "Terminada", barra: "bg-green-500", chip: "bg-green-100 text-green-800" };
  if (av >= 50) return { texto: "Más de la mitad", barra: "bg-blue-500", chip: "bg-blue-100 text-blue-800" };
  if (av > 0) return { texto: "En construcción", barra: "bg-amber-400", chip: "bg-amber-100 text-amber-800" };
  return { texto: "Por iniciar", barra: "bg-slate-300", chip: "bg-slate-100 text-slate-600" };
}

/** Barra de avance dividida en 20 tramos de 5 %; un espacio marca la mitad de la obra. */
function BarraSegmentada({ av, nombre }: { av: number; nombre: string }) {
  const llenos = Math.round((av / 100) * SEGMENTOS);
  const { barra } = etapa(av);
  const montado = useMontado(150);
  return (
    <div className="flex gap-[3px]" role="progressbar" aria-valuenow={av} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance de ${nombre}`}>
      {Array.from({ length: SEGMENTOS }, (_, i) => (
        <span
          key={i}
          style={{ transitionDelay: `${i * 35}ms` }}
          className={`h-7 flex-1 rounded-[5px] origin-bottom transition-all duration-500 ease-out ${montado && i < llenos ? `${barra} shadow-sm scale-y-100` : i < llenos ? "bg-slate-100 scale-y-50" : "bg-slate-100"} ${i === SEGMENTOS / 2 - 1 ? "mr-1.5" : ""}`}
        />
      ))}
    </div>
  );
}

/** Columnas por trimestre (los 4 más recientes). */
function GraficoTrimestres({ titulo, ayuda, datos, campo, color }: {
  titulo: string; ayuda: string; datos: Trimestre[]; campo: "creados" | "terminados"; color: string;
}) {
  const max = Math.max(1, ...datos.map((d) => d[campo]));
  const total = datos.reduce((t, d) => t + d[campo], 0);
  const { ref, visible: montado } = useVisible<HTMLElement>(0.35); // las columnas crecen cuando el gráfico entra en pantalla
  return (
    <section ref={ref} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
          <p className="text-sm text-slate-500">{ayuda}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700 whitespace-nowrap">{total} en 4 trimestres</span>
      </div>
      <div className="mt-5 flex gap-3 sm:gap-5" role="img" aria-label={`${titulo}: ${datos.map((d) => `${d.etiqueta} ${d[campo]}`).join(", ")}`}>
        {datos.map((d, i) => {
          const valor = d[campo];
          return (
            <div key={d.clave} className="flex-1 flex flex-col items-center">
              <div className="h-40 w-full flex flex-col items-center justify-end">
                <span className={`mb-1 text-sm font-extrabold tabular-nums text-slate-800 transition-opacity duration-500 ${montado ? "opacity-100" : "opacity-0"}`} style={{ transitionDelay: `${500 + i * 140}ms` }}>
                  <Contador valor={valor} ms={900} />
                </span>
                <div className={`w-full max-w-16 rounded-t-xl ${valor ? color : "bg-slate-200"} transition-[height] duration-[1100ms] ease-[cubic-bezier(0.34,1.4,0.64,1)]`}
                  style={{ transitionDelay: `${i * 140}ms`, height: montado ? `${valor ? Math.max((valor / max) * 82, 8) : 3}%` : "0%" }} />
              </div>
              <span className="mt-2 text-xs font-semibold text-slate-500">{d.etiqueta}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Tarjeta({ icono, titulo, valor, detalle, acento, href }: { icono: NombreIcono; titulo: string; valor: number | string; detalle: string; acento: string; href: string }) {
  const montado = useMontado(100);
  return (
    <Link href={href} className="group relative overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition">
      <span aria-hidden className={`absolute left-0 top-0 h-full w-1.5 origin-top ${acento} transition-transform duration-700 ease-out ${montado ? "scale-y-100" : "scale-y-0"}`} />
      <div className="flex items-center gap-4">
        <span aria-hidden className={`h-12 w-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-blue-800 transition-transform duration-500 ease-[cubic-bezier(0.34,1.8,0.64,1)] group-hover:rotate-6 group-hover:scale-110 ${montado ? "scale-100" : "scale-50"}`}><Icono nombre={icono} className="h-6 w-6" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{titulo}</p>
          <p className="text-3xl font-black tabular-nums text-slate-900 leading-tight">{typeof valor === "number" ? <Contador valor={valor} /> : valor}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{detalle}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const [progreso, setProgreso] = useState<ProgresoObra[]>([]);
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    const fallos: string[] = [];
    try {
      const [p, e] = await Promise.all([fetch("/api/cotizaciones/progreso"), fetch("/api/cotizaciones/estadisticas/")]);
      if (p.ok) setProgreso(await p.json());
      else fallos.push("el avance de las obras");
      if (e.ok) setStats(await e.json());
      else fallos.push("las estadísticas de proyectos");
    } catch {
      fallos.push("los datos del panel (sin conexión con el servidor)");
    }
    setErrores(fallos);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, [cargar]);

  const reintentar = () => {
    setLoading(true);
    cargar();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mr-auto">Panel principal</h1>
        <Link href="/dashboard/proyectos" className="font-semibold text-blue-800 border border-blue-200 hover:bg-blue-50 px-4 h-11 inline-flex items-center rounded-lg transition">
          Ver proyectos
        </Link>
        <Link href="/dashboard/cotizador" className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-5 h-11 inline-flex items-center rounded-lg shadow-sm transition whitespace-nowrap">
          + Nuevo proyecto
        </Link>
      </div>

      {/* Aviso si algo no pudo cargarse */}
      {errores.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-3 bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-r-md">
          <p className="font-semibold mr-auto">No se pudo cargar {errores.join(" ni ")}.</p>
          <button type="button" onClick={reintentar} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 h-10 rounded-lg cursor-pointer">Reintentar</button>
        </div>
      )}

      {/* Resumen por estado */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Tarjeta icono="borrador" titulo="Proyectos cotizados" valor={stats ? stats.cotizados : "—"} detalle="Esperando que se pague por completo el anticipo del 40 %." acento="bg-amber-400" href="/dashboard/proyectos?estado=BORRADOR" />
        <Tarjeta icono="obra" titulo="Obras en ejecución" valor={stats ? stats.en_ejecucion : "—"} detalle="Con el anticipo pagado y la obra en marcha." acento="bg-blue-500" href="/dashboard/proyectos?estado=ACEPTADA" />
        <Tarjeta icono="check-circulo" titulo="Obras terminadas" valor={stats ? stats.terminados : "—"} detalle="Con todos sus pagos completos." acento="bg-green-500" href="/dashboard/proyectos?estado=FINALIZADA" />
      </div>

      {/* Avance físico de las obras en ejecución */}
      <section aria-labelledby="progreso-titulo" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="progreso-titulo" className="text-lg font-bold text-slate-900">Avance de obras en ejecución</h2>
          <p className="text-xs text-slate-500">Cada tramo es un 5 % de avance; el espacio marca el 50 %, cuando corresponde el 2.º pago.</p>
        </div>
        {loading ? (
          <p className="text-slate-500 text-sm mt-3">Cargando…</p>
        ) : progreso.length === 0 ? (
          <p className="text-slate-500 text-sm mt-3">
            No existen obras en ejecución. Cuando se pague por completo el anticipo (40 %) de un proyecto, pasará a «En ejecución» y su avance se mostrará aquí.
          </p>
        ) : (
          <ul className="mt-4 grid lg:grid-cols-2 gap-4" aria-label="Avance de cada obra">
            {progreso.map((p) => {
              const av = Math.max(0, Math.min(100, Number(p.avance)));
              const e = etapa(av);
              return (
                <li key={p.id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/dashboard/proyecto/${p.id}`} className="font-bold text-slate-900 hover:underline truncate block">{p.cliente_nombre}</Link>
                      <p className="text-xs font-mono text-slate-400">{p.codigo_cotizacion}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-black tabular-nums leading-none text-slate-900"><Contador valor={av} ms={1000} /><span className="text-lg">%</span></p>
                      <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${e.chip}`}>{e.texto}</span>
                    </div>
                  </div>
                  <div className="mt-3"><BarraSegmentada av={av} nombre={p.cliente_nombre} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Proyectos por trimestre */}
      {stats && (
        <div className="grid lg:grid-cols-2 gap-4">
          <GraficoTrimestres titulo="Proyectos cotizados por trimestre" ayuda="Proyectos creados en cada trimestre." datos={stats.trimestres} campo="creados" color="bg-blue-500" />
          <GraficoTrimestres titulo="Proyectos terminados por trimestre" ayuda="Obras con todos sus pagos completos, según la fecha del último pago." datos={stats.trimestres} campo="terminados" color="bg-amber-400" />
        </div>
      )}
    </div>
  );
}
