"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ProgresoObra {
  id: number;
  codigo_cotizacion: string;
  cliente_nombre: string;
  avance: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [progreso, setProgreso] = useState<ProgresoObra[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return void router.push("/login");
    fetch("/api/cotizaciones/progreso", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setProgreso)
      .catch(() => setProgreso([]))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mr-auto">Panel principal</h1>
        <Link href="/dashboard/proyectos" className="font-semibold text-blue-800 border border-blue-200 hover:bg-blue-50 px-4 h-11 inline-flex items-center rounded-lg transition">
          Ver proyectos
        </Link>
        <Link href="/dashboard/cotizador" className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-5 h-11 inline-flex items-center rounded-lg shadow-sm transition whitespace-nowrap">
          + Nuevo proyecto
        </Link>
      </div>

      {/* Avance físico de las obras en ejecución */}
      <section aria-labelledby="progreso-titulo" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 id="progreso-titulo" className="text-lg font-bold text-slate-900">Avance de obras en ejecución</h2>
        {loading ? (
          <p className="text-slate-500 text-sm mt-1">Cargando…</p>
        ) : progreso.length === 0 ? (
          <p className="text-slate-500 text-sm mt-1">
            No existen obras en ejecución. Cuando se registre el primer pago de un proyecto, pasará a «En ejecución» y su avance se mostrará aquí.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-3" aria-label="Avance de cada obra">
              {progreso.map((p) => {
                const av = Math.max(0, Math.min(100, Number(p.avance)));
                // Color según el avance: ámbar al inicio, verde azulado en el tramo medio y verde al terminar
                const color = av >= 100 ? "from-green-600 to-green-500" : av >= 50 ? "from-blue-700 to-blue-500" : "from-amber-600 to-amber-400";
                return (
                  <li key={p.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-800 truncate">
                        {p.cliente_nombre} <span className="font-normal text-slate-400">{p.codigo_cotizacion}</span>
                      </span>
                      <span className="font-extrabold tabular-nums text-slate-900">{av}%</span>
                    </div>
                    <div className="mt-1 h-3 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={av} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance de ${p.cliente_nombre}`}>
                      <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-700`} style={{ width: `${av}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

    </div>
  );
}
