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

const METAS = [
  { icono: "🏠", titulo: "Calidad que perdura", texto: "Construcciones sólidas, con buenos materiales y terminaciones cuidadas en cada obra." },
  { icono: "🛡️", titulo: "Servicio con garantías", texto: "Acompañamos al cliente antes, durante y después de la obra, con respaldo y responsabilidades claras." },
  { icono: "🤝", titulo: "Un presupuesto para cada familia", texto: "Proyectos para presupuestos reducidos y también para clientes que buscan más terminaciones." },
  { icono: "⭐", titulo: "Reputación y recomendación", texto: "Queremos que cada cliente satisfecho nos recomiende y así seguir creciendo con confianza." },
];

/** Tarjeta de obra: foto grande con título sobre la imagen y miniaturas para ver las demás fotos. */
function Tarjeta({ proyecto }: { proyecto: Proyecto }) {
  const fotos = proyecto.imagenes?.length ? proyecto.imagenes : [proyecto.imagen_url || FOTO_POR_DEFECTO];
  const [actual, setActual] = useState(0);
  return (
    <article className="group relative bg-white rounded-3xl overflow-hidden flex flex-col shadow-xl shadow-blue-950/10 ring-1 ring-slate-200 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-blue-950/25 transition duration-300">
      <div className="relative h-72 sm:h-80 w-full bg-blue-950 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotos[actual]}
          alt={`${proyecto.titulo} (foto ${actual + 1} de ${fotos.length})`}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-blue-950 via-blue-950/40 to-transparent" />
        {proyecto.ubicacion_comuna && (
          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-xs font-semibold px-3 py-1.5">
            <span aria-hidden>📍</span> {proyecto.ubicacion_comuna}
          </span>
        )}
        {fotos.length > 1 && (
          <span className="absolute top-4 right-4 rounded-full bg-amber-400 text-blue-950 text-xs font-black px-2.5 py-1.5">
            {fotos.length} fotos
          </span>
        )}
        <h3 className="absolute bottom-4 left-5 right-5 text-white text-2xl font-black leading-tight drop-shadow">{proyecto.titulo}</h3>
      </div>

      {fotos.length > 1 && (
        <ul className="flex gap-2 px-4 py-3 overflow-x-auto bg-blue-950" aria-label="Más fotos de la obra">
          {fotos.map((f, i) => (
            <li key={f} className="shrink-0">
              <button
                type="button" onClick={() => setActual(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === actual}
                className={`block w-16 h-12 rounded-lg overflow-hidden border-2 cursor-pointer transition ${i === actual ? "border-amber-400" : "border-transparent opacity-60 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f} alt="" className="w-full h-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="p-5 sm:p-6 flex-grow flex flex-col">
        {proyecto.descripcion && <p className="text-slate-600 mb-6 flex-grow line-clamp-3">{proyecto.descripcion}</p>}
        <a
          href={proyecto.whatsapp_url || "https://wa.me/"} target="_blank" rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md"
        >
          <span aria-hidden>💬</span> Consultar por WhatsApp
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
      {/* Cabecera oscura con brillo, en los colores de la marca */}
      <header className="relative overflow-hidden bg-blue-950 text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60rem_28rem_at_50%_-8%,rgba(70,149,141,0.55),transparent_70%),radial-gradient(34rem_22rem_at_88%_18%,rgba(217,154,43,0.28),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:56px_56px]" />
        <div aria-hidden className="absolute left-1/2 -translate-x-1/2 -top-[34rem] w-[56rem] h-[56rem] rounded-full border border-blue-300/25 shadow-[0_0_140px_30px_rgba(70,149,141,0.35)]" />

        <nav className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="font-black text-2xl tracking-tighter">
            DENASERV<span className="text-amber-400">.</span>
          </div>
          <div className="hidden sm:flex items-center gap-8 text-sm font-semibold text-blue-100">
            <a href="#nosotros" className="hover:text-white transition">Nosotros</a>
            <a href="#metas" className="hover:text-white transition">Metas</a>
            <a href="#proyectos" className="hover:text-white transition">Proyectos</a>
          </div>
          <Link href="/login" className="text-xs sm:text-sm font-bold bg-white/10 hover:bg-white/20 backdrop-blur border border-white/25 px-4 py-2 rounded-full whitespace-nowrap transition">
            Acceso de la empresa
          </Link>
        </nav>

        <div className="relative z-10 max-w-5xl mx-auto px-4 pt-12 pb-24 sm:pt-20 sm:pb-32 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur px-4 py-1.5 text-sm font-semibold text-blue-100">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden /> Casas prefabricadas y radieres · Los Ángeles, Chile
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05]">
            Construimos <span className="bg-gradient-to-r from-blue-300 via-blue-200 to-amber-300 bg-clip-text text-transparent">tu hogar</span> con calidad estructural
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-3xl mx-auto font-light">
            Obras ejecutadas con terminaciones de excelencia, proyectos personalizados y un servicio con garantías. Conozca algunos de nuestros proyectos terminados.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a href="#proyectos" className="bg-amber-400 hover:bg-amber-300 text-blue-950 font-black px-7 py-3.5 rounded-full shadow-lg shadow-amber-500/25 transition">Ver nuestras obras</a>
            <a href="#nosotros" className="border border-white/30 hover:bg-white/10 font-bold px-7 py-3.5 rounded-full transition">Conózcanos</a>
          </div>
          <ul className="mt-14 flex flex-wrap justify-center gap-3 text-sm font-semibold" aria-label="Lo que construimos">
            {["Casas prefabricadas", "Radieres", "Revestimiento Smart Panel", "Cubiertas de zinc", "Proyectos a medida"].map((t) => (
              <li key={t} className="rounded-full border border-white/15 bg-white/5 backdrop-blur px-4 py-2 text-blue-100">{t}</li>
            ))}
          </ul>
        </div>
      </header>

      {/* Quiénes somos */}
      <section id="nosotros" className="scroll-mt-4 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-slate-200 p-6 sm:p-10 grid lg:grid-cols-[1.2fr_1fr] gap-10">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-amber-600">Quiénes somos</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-black text-blue-900 leading-tight">DenaServ, fabricación y venta de casas prefabricadas</h2>
            <p className="mt-4 text-slate-600 text-lg">
              Somos una empresa de Los Ángeles dedicada a la construcción de casas y radieres. Trabajamos con
              proyectos personalizados y mejorados, y la mayoría de nuestros clientes llega por la recomendación de obras que ya hemos entregado.
            </p>
            <p className="mt-4 text-slate-600 text-lg">
              Cada proyecto se cotiza de forma clara, se acuerda con el cliente y se ejecuta con un equipo de maestros de confianza.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 text-white p-6">
              <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Misión</p>
              <p className="mt-2 text-blue-50">Entregar construcciones de calidad y un servicio con garantías a nuestros clientes, para lograr su satisfacción y crecer en reputación y clientela.</p>
            </div>
            <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-6">
              <p className="text-sm font-bold uppercase tracking-widest text-amber-700">Visión</p>
              <p className="mt-2 text-slate-700">Masificar nuestros servicios para llegar tanto a clientes con presupuestos reducidos como a clientes con presupuestos altos, entregando buena calidad en materiales y en nuestros trabajos.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Metas y objetivos */}
      <section id="metas" className="scroll-mt-4 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-bold uppercase tracking-widest text-amber-600">Metas y objetivos</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-black text-blue-900">Lo que nos mueve en cada obra</h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {METAS.map((m) => (
            <div key={m.titulo} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition duration-300">
              <div className="h-12 w-12 rounded-xl bg-blue-900 text-2xl flex items-center justify-center" aria-hidden>{m.icono}</div>
              <h3 className="mt-4 text-lg font-extrabold text-blue-900">{m.titulo}</h3>
              <p className="mt-2 text-sm text-slate-600">{m.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proyectos */}
      <section id="proyectos" className="scroll-mt-4 bg-blue-950 relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(48rem_24rem_at_15%_0%,rgba(70,149,141,0.35),transparent_70%),radial-gradient(36rem_22rem_at_90%_100%,rgba(217,154,43,0.18),transparent_70%)]" />
        <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Portafolio</p>
            <h2 className="mt-2 text-3xl sm:text-5xl font-black text-white">Nuestros proyectos terminados</h2>
            <p className="mt-4 text-blue-100 text-lg">Obras reales, entregadas a familias de la zona. Pregúntenos por la que más le guste.</p>
          </div>

          <div className="mt-12">
            {loading ? (
              <div className="text-center text-xl font-bold text-blue-200 py-20">Cargando proyectos...</div>
            ) : proyectos.length === 0 ? (
              <div className="text-center text-xl text-blue-200 py-20">Actualmente no existen proyectos publicados en el portafolio.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
                {proyectos.map((proyecto) => (
                  <Tarjeta key={proyecto.id} proyecto={proyecto} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Banner del instituto y contacto de los programadores */}
      <section aria-label="Instituto y desarrolladores" className="bg-blue-950 border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4 text-left" aria-label="Instituto Profesional Virginio Gómez, Universidad de Concepción">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/escudo-virginio-gomez.png" alt="" width={100} height={110} className="h-24 sm:h-28 w-auto shrink-0" />
            <div>
              <p className="text-sm sm:text-base font-semibold text-blue-100">Instituto Profesional</p>
              <p className="text-2xl sm:text-3xl font-black leading-tight text-white">Virginio Gómez</p>
              <p className="mt-1 text-sm sm:text-base font-semibold text-blue-100">Universidad de Concepción</p>
            </div>
          </div>
          <div className="text-center md:text-right">
            <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Desarrollado por</p>
            <p className="mt-1 text-blue-100">Programadores del proyecto</p>
            <ul className="mt-3 space-y-1.5 font-semibold text-white">
              <li><a href="mailto:ignacioer6@gmail.com" className="hover:underline break-all">ignacioer6@gmail.com</a></li>
              <li><a href="mailto:maikol17aj@gmail.com" className="hover:underline break-all">maikol17aj@gmail.com</a></li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="bg-blue-950 text-blue-200 py-8 text-center border-t border-white/10">
        <p className="font-medium">&copy; {new Date().getFullYear()} DenaServ. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
