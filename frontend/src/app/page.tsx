"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Proyecto {
  id: number;
  titulo: string;
  descripcion: string | null;
  ubicacion_comuna: string | null;
  imagen_url: string | null;
  imagenes: string[];
  publicado: boolean;
  cotizacion_id: number | null;
  whatsapp_url: string | null;
}

const FOTO_POR_DEFECTO = "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&q=80&w=800";

/** Tarjeta de obra: foto grande y miniaturas para ver las demás fotos. */
function Tarjeta({ proyecto }: { proyecto: Proyecto }) {
  const fotos = proyecto.imagenes?.length ? proyecto.imagenes : [proyecto.imagen_url || FOTO_POR_DEFECTO];
  const [actual, setActual] = useState(0);
  return (
    <article className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden flex flex-col border border-slate-100">
      <div className="relative h-64 w-full bg-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotos[actual]} alt={`${proyecto.titulo} (foto ${actual + 1} de ${fotos.length})`} className="absolute inset-0 w-full h-full object-cover" />
      </div>
      {fotos.length > 1 && (
        <ul className="flex gap-1.5 p-2 overflow-x-auto bg-slate-50 border-b border-slate-100" aria-label="Más fotos de la obra">
          {fotos.map((f, i) => (
            <li key={f} className="shrink-0">
              <button type="button" onClick={() => setActual(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === actual}
                className={`block w-16 h-12 rounded overflow-hidden border-2 cursor-pointer ${i === actual ? "border-blue-700" : "border-transparent opacity-70 hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f} alt="" className="w-full h-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="p-6 flex-grow flex flex-col">
        <h2 className="text-2xl font-bold mb-2 leading-tight">{proyecto.titulo}</h2>
        {proyecto.ubicacion_comuna && <p className="text-slate-500 font-medium mb-4 text-sm">📍 {proyecto.ubicacion_comuna}</p>}
        {proyecto.descripcion && <p className="text-sm text-slate-600 mb-6 flex-grow line-clamp-3">{proyecto.descripcion}</p>}
        <a href={proyecto.whatsapp_url || "https://wa.me/"} target="_blank" rel="noopener noreferrer"
          className="w-full block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md">
          Consultar por WhatsApp
        </a>
      </div>
    </article>
  );
}

export default function PortafolioPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portafolio/")
      .then((res) => res.json())
      .then((data) => {
        setProyectos(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error("Error al cargar portafolio:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Navbar Pública */}
      <nav className="bg-blue-900 text-white shadow-md w-full sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 font-black text-2xl tracking-tighter">
              DENASERV<span className="text-blue-300">.</span>
            </div>
            <div>
              <Link
                href="/login"
                className="text-sm font-semibold hover:text-blue-200 transition bg-blue-800/80 px-4 py-2 rounded-lg"
              >
                Acceso Oficina (Google SSO)
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="bg-gradient-to-br from-blue-900 to-blue-700 text-white py-20 text-center shadow-inner">
        <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight">Construimos tu hogar.</h1>
        <p className="text-xl md:text-2xl font-light max-w-3xl mx-auto px-4 text-blue-100">
          Casas prefabricadas de alta calidad, precisión estructural y terminaciones de excelencia.
        </p>
      </header>

      {/* Grid de Proyectos */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
        {loading ? (
          <div className="text-center text-xl font-bold text-slate-500 py-20">Cargando proyectos...</div>
        ) : proyectos.length === 0 ? (
          <div className="text-center text-xl text-slate-500 py-20">
            Aún no hay proyectos publicados en el portafolio.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {proyectos.map((proyecto) => (
              <Tarjeta key={proyecto.id} proyecto={proyecto} />
            ))}
          </div>
        )}
      </main>

      <footer className="bg-slate-900 text-slate-400 py-8 text-center border-t border-slate-800">
        <p className="font-medium">&copy; {new Date().getFullYear()} DenaServ. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
