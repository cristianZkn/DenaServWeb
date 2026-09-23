"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface Foto {
  url_imagen: string;
  es_portada: boolean;
}

interface Proyecto {
  slug: string;
  titulo_descriptivo: string;
  superficie_construida_m2: number;
  comuna: string;
  material_revestimiento_usado: string;
  plazo_ejecucion_dias: number;
  mensaje_whatsapp_predefinido: string;
  fotos: Foto[];
}

export default function PortafolioPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/portafolio/")
      .then((res) => res.json())
      .then((data) => {
        setProyectos(data);
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
              <Link href="/login" className="text-sm font-semibold hover:text-blue-200 transition">
                Acceso Oficina
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="bg-gradient-to-br from-blue-900 to-blue-700 text-white py-20 text-center shadow-inner">
        <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight">Construimos tu hogar.</h1>
        <p className="text-xl md:text-2xl font-light max-w-3xl mx-auto px-4 text-blue-100">
          Casas prefabricadas de alta calidad y precisión estructural. 
          Revisa nuestros proyectos entregados.
        </p>
      </header>

      {/* Grid de Proyectos */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
        {loading ? (
          <div className="text-center text-xl font-bold text-slate-500 py-20">Cargando proyectos...</div>
        ) : proyectos.length === 0 ? (
          <div className="text-center text-xl text-slate-500 py-20">Aún no hay proyectos publicados.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {proyectos.map((proyecto) => {
              const portada = proyecto.fotos.find(f => f.es_portada)?.url_imagen || "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&q=80&w=800";
              return (
                <article key={proyecto.slug} className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden flex flex-col border border-slate-100">
                  <div className="relative h-64 w-full bg-slate-200">
                    <img 
                      src={portada} 
                      alt={proyecto.titulo_descriptivo}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-bold text-blue-900 shadow-sm">
                      {proyecto.superficie_construida_m2} m²
                    </div>
                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <h2 className="text-2xl font-bold mb-2 leading-tight">{proyecto.titulo_descriptivo}</h2>
                    <p className="text-slate-500 font-medium mb-6 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path></svg>
                      {proyecto.comuna}
                    </p>
                    
                    <div className="space-y-2 mb-8 flex-grow">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Revestimiento:</span>
                        <span className="font-semibold text-right">{proyecto.material_revestimiento_usado.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Tiempo de obra:</span>
                        <span className="font-semibold">{proyecto.plazo_ejecucion_dias} días</span>
                      </div>
                    </div>

                    <a 
                      href={`https://wa.me/?text=${encodeURIComponent(proyecto.mensaje_whatsapp_predefinido)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full block text-center bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md"
                    >
                      Me interesa este modelo
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="bg-slate-900 text-slate-400 py-8 text-center border-t border-slate-800">
        <p className="font-medium">&copy; {new Date().getFullYear()} DenaServ. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
