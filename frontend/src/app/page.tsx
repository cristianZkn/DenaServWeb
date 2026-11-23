"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TarjetaObra, VisorObra, type Obra } from "@/components/GaleriaObra";
import { ETIQUETAS, REDES, WHATSAPP_GENERAL } from "@/lib/empresa";

const SECCIONES = [
  { id: "inicio", texto: "Inicio" },
  { id: "nosotros", texto: "Nosotros" },
  { id: "servicios", texto: "Servicios" },
  { id: "proyectos", texto: "Obras" },
  { id: "proceso", texto: "Cómo trabajamos" },
  { id: "contacto", texto: "Contacto" },
];

const VENTAJAS = [
  { icono: "📄", titulo: "Cotización clara", texto: "Un valor por escrito, con el detalle de materiales, mano de obra y traslado." },
  { icono: "🏷️", titulo: "Precios al día", texto: "Los materiales se cotizan con el precio real de las tiendas, no con estimaciones." },
  { icono: "📸", titulo: "Avance con fotos", texto: "Usted ve cómo progresa su obra: cada avance queda registrado con fotos." },
  { icono: "🤝", titulo: "Pagos por etapas", texto: "Anticipo, avance y entrega: paga a medida que la obra avanza." },
];

const SERVICIOS = [
  { icono: "🏠", titulo: "Casas prefabricadas", texto: "Fabricación y armado de casas a la medida de su terreno y su presupuesto." },
  { icono: "🧱", titulo: "Radieres", texto: "Base de hormigón firme y bien nivelada, lista para recibir su casa." },
  { icono: "🛡️", titulo: "Revestimientos", texto: "Smart Panel, siding y terminaciones pensadas para el clima del sur." },
  { icono: "🏗️", titulo: "Cubiertas y techumbres", texto: "Cerchas, zinc y estructura de techo con materiales de calidad." },
];

const PASOS = [
  { titulo: "Visita y cotización", texto: "Conversamos su idea, vemos el terreno y le entregamos una cotización detallada." },
  { titulo: "Acuerdo y anticipo", texto: "Con el contrato firmado y el anticipo del 40 %, comienza la obra." },
  { titulo: "Construcción con seguimiento", texto: "Avanzamos por etapas y le mostramos el progreso con fotos." },
  { titulo: "Entrega", texto: "Revisamos juntos la obra terminada y se cancela el saldo final." },
];

const METAS = [
  { icono: "🏠", titulo: "Calidad que perdura", texto: "Construcciones sólidas, con buenos materiales y terminaciones cuidadas en cada obra." },
  { icono: "🛡️", titulo: "Servicio con garantías", texto: "Acompañamos al cliente antes, durante y después de la obra, con respaldo y responsabilidades claras." },
  { icono: "⭐", titulo: "Recomendación", texto: "Queremos que cada cliente satisfecho nos recomiende y así seguir creciendo con confianza." },
];

/** Sección que está a la vista: sirve para marcar el enlace del menú. */
function useSeccionActiva(ids: string[]) {
  const [activa, setActiva] = useState(ids[0]);
  useEffect(() => {
    const onScroll = () => {
      const linea = window.innerHeight * 0.35;
      let actual = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= linea) actual = id;
      }
      setActiva(actual);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ids]);
  return activa;
}

function Encabezado({ sobre, titulo, texto, claro }: { sobre: string; titulo: string; texto?: string; claro?: boolean }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <p className={`text-sm font-bold uppercase tracking-widest ${claro ? "text-amber-300" : "text-amber-600"}`}>{sobre}</p>
      <h2 className={`mt-2 text-3xl sm:text-4xl font-black leading-tight ${claro ? "text-white" : "text-blue-900"}`}>{titulo}</h2>
      {texto && <p className={`mt-4 text-lg ${claro ? "text-blue-100" : "text-slate-600"}`}>{texto}</p>}
    </div>
  );
}

function IconoRed({ clave }: { clave: string }) {
  const p = { viewBox: "0 0 24 24", className: "h-6 w-6", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (clave === "instagram") return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>;
  if (clave === "facebook") return <svg {...p}><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" /></svg>;
  if (clave === "whatsapp") return <svg {...p}><path d="M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.5L3 21z" /><path d="M9 9.5c.5 2.5 2.5 4.5 5 5l1.5-1.2-2-1-1 .7a4 4 0 0 1-1.7-1.7l.7-1-1-2L9 9.5z" /></svg>;
  return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
}

export default function PortafolioPage() {
  const [proyectos, setProyectos] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [visor, setVisor] = useState<Obra | null>(null);
  const [filtro, setFiltro] = useState("TODAS");
  const [verTodas, setVerTodas] = useState(false);
  const [menu, setMenu] = useState(false);
  const [bajo, setBajo] = useState(false);
  const activa = useSeccionActiva(useMemo(() => SECCIONES.map((s) => s.id), []));

  useEffect(() => {
    fetch("/api/portafolio/")
      .then((res) => res.json())
      .then((data) => setProyectos(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Error al cargar portafolio:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const f = () => setBajo(window.scrollY > 24);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  const etiquetasPresentes = useMemo(() => Object.keys(ETIQUETAS).filter((e) => proyectos.some((p) => p.etiqueta === e)), [proyectos]);
  const filtradas = proyectos.filter((p) => filtro === "TODAS" || p.etiqueta === filtro);
  const mostradas = verTodas ? filtradas : filtradas.slice(0, 6);
  const contacto = WHATSAPP_GENERAL || proyectos.find((p) => p.whatsapp_url)?.whatsapp_url || "";

  const enlace = (s: { id: string; texto: string }) => (
    <a key={s.id} href={`#${s.id}`} onClick={() => setMenu(false)} aria-current={activa === s.id ? "true" : undefined}
      className={`relative whitespace-nowrap px-3 py-2 text-sm font-semibold transition-colors after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-amber-400 after:origin-left after:transition-transform after:duration-300 ${
        activa === s.id ? "text-white after:scale-x-100" : "text-blue-200 hover:text-white after:scale-x-0 hover:after:scale-x-50"}`}>
      {s.texto}
    </a>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {visor && <VisorObra obra={visor} onCerrar={() => setVisor(null)} />}

      {/* Menú fijo: cambia de transparente a sólido al bajar y marca la sección en la que se está */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${bajo || menu ? "bg-blue-950/95 backdrop-blur shadow-lg shadow-black/20" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a href="#inicio" className="font-black text-xl tracking-tighter text-white">DENASERV<span className="text-amber-400">.</span></a>
          <div className="hidden md:flex items-center gap-1">{SECCIONES.map(enlace)}</div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden sm:inline-block text-sm font-bold bg-white/10 hover:bg-white/20 border border-white/25 text-white px-4 py-2 rounded-full whitespace-nowrap transition">
              Acceso de la empresa
            </Link>
            <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Abrir menú" aria-expanded={menu}
              className="md:hidden !min-h-0 h-10 w-10 rounded-lg border border-white/25 text-white cursor-pointer">{menu ? "✕" : "☰"}</button>
          </div>
        </div>
        {menu && (
          <div className="md:hidden px-4 pb-4 flex flex-col animate-entrar">
            {SECCIONES.map(enlace)}
            <Link href="/login" className="mt-2 text-center text-sm font-bold bg-white/10 border border-white/25 text-white px-4 py-2.5 rounded-lg">Acceso de la empresa</Link>
          </div>
        )}
      </nav>

      {/* Inicio */}
      <header id="inicio" className="relative overflow-hidden bg-blue-950 text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60rem_28rem_at_50%_-8%,rgba(70,149,141,0.55),transparent_70%),radial-gradient(34rem_22rem_at_88%_18%,rgba(217,154,43,0.28),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:56px_56px]" />
        <div aria-hidden className="absolute left-1/2 -translate-x-1/2 -top-[34rem] w-[56rem] h-[56rem] rounded-full border border-blue-300/25 shadow-[0_0_140px_30px_rgba(70,149,141,0.35)]" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 pt-36 pb-32 sm:pt-44 sm:pb-40 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur px-4 py-1.5 text-sm font-semibold text-blue-100">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden /> Casas prefabricadas y radieres · Los Ángeles, Chile
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05]">
            Construimos <span className="bg-gradient-to-r from-blue-300 via-blue-200 to-amber-300 bg-clip-text text-transparent">tu hogar</span> con calidad estructural
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-3xl mx-auto font-light">
            Proyectos personalizados, materiales de calidad y un servicio con garantías. Conozca algunas de las obras que ya entregamos.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a href="#proyectos" className="bg-amber-400 hover:bg-amber-300 text-blue-950 font-black px-7 py-3.5 rounded-full shadow-lg shadow-amber-500/25 transition">Ver nuestras obras</a>
            <a href="#contacto" className="border border-white/30 hover:bg-white/10 font-bold px-7 py-3.5 rounded-full transition">Quiero cotizar</a>
          </div>
        </div>
      </header>

      {/* Ventajas, montadas sobre el borde de la cabecera */}
      <section aria-label="Por qué elegirnos" className="relative z-10 -mt-16 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VENTAJAS.map((v) => (
            <div key={v.titulo} className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-xl shadow-blue-950/10">
              <div className="h-11 w-11 rounded-xl bg-blue-900 text-xl flex items-center justify-center" aria-hidden>{v.icono}</div>
              <h3 className="mt-3 font-extrabold text-blue-900">{v.titulo}</h3>
              <p className="mt-1 text-sm text-slate-600">{v.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Nosotros */}
      <section id="nosotros" className="scroll-mt-16 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-amber-600">Quiénes somos</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-black text-blue-900 leading-tight">Una empresa de Los Ángeles que construye con confianza</h2>
            <p className="mt-4 text-slate-600 text-lg">
              Nos dedicamos a la construcción de casas y radieres. Trabajamos con proyectos personalizados y mejorados, y la mayoría de nuestros clientes
              llega por la recomendación de obras que ya hemos entregado.
            </p>
            <p className="mt-4 text-slate-600 text-lg">Cada proyecto se cotiza de forma clara, se acuerda con el cliente y se ejecuta con un equipo de maestros de confianza.</p>
            <ul className="mt-6 grid sm:grid-cols-3 gap-3">
              {METAS.map((m) => (
                <li key={m.titulo} className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
                  <span aria-hidden className="text-xl">{m.icono}</span>
                  <p className="mt-1 font-extrabold text-blue-900 text-sm">{m.titulo}</p>
                  <p className="mt-1 text-xs text-slate-600">{m.texto}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 text-white p-6 sm:p-8 shadow-xl">
              <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Misión</p>
              <p className="mt-2 text-blue-50">Entregar construcciones de calidad y un servicio con garantías a nuestros clientes, para lograr su satisfacción y crecer en reputación y clientela.</p>
            </div>
            <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-6 sm:p-8">
              <p className="text-sm font-bold uppercase tracking-widest text-amber-700">Visión</p>
              <p className="mt-2 text-slate-700">Masificar nuestros servicios para llegar tanto a clientes con presupuestos reducidos como a clientes con presupuestos altos, con buena calidad en materiales y en nuestros trabajos.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="scroll-mt-16 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <Encabezado sobre="Servicios" titulo="Todo lo que necesita su obra" texto="Desde la base hasta el techo, en una sola cotización." />
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SERVICIOS.map((s) => (
              <div key={s.titulo} className="group rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-6 hover:bg-blue-900 hover:ring-blue-900 transition-colors duration-300">
                <div className="h-12 w-12 rounded-xl bg-blue-900 group-hover:bg-white/15 text-2xl flex items-center justify-center transition-colors" aria-hidden>{s.icono}</div>
                <h3 className="mt-4 text-lg font-extrabold text-blue-900 group-hover:text-white transition-colors">{s.titulo}</h3>
                <p className="mt-2 text-sm text-slate-600 group-hover:text-blue-100 transition-colors">{s.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Obras */}
      <section id="proyectos" className="scroll-mt-16 bg-blue-950 relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(48rem_24rem_at_15%_0%,rgba(70,149,141,0.35),transparent_70%),radial-gradient(36rem_22rem_at_90%_100%,rgba(217,154,43,0.18),transparent_70%)]" />
        <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <Encabezado claro sobre="Portafolio" titulo="Nuestras obras" texto="Obras reales, entregadas a familias de la zona. Toque una para ver todas sus fotos y detalles." />

          {etiquetasPresentes.length > 0 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2" role="group" aria-label="Filtrar obras">
              {["TODAS", ...etiquetasPresentes].map((e) => (
                <button key={e} type="button" onClick={() => { setFiltro(e); setVerTodas(false); }} aria-pressed={filtro === e}
                  className={`!min-h-0 px-4 py-1.5 rounded-full text-sm font-bold border transition cursor-pointer ${filtro === e ? "bg-amber-400 border-amber-400 text-blue-950" : "border-white/25 text-blue-100 hover:bg-white/10"}`}>
                  {e === "TODAS" ? "Todas" : ETIQUETAS[e].texto}
                </button>
              ))}
            </div>
          )}

          <div className="mt-10">
            {loading ? (
              <div className="text-center text-xl font-bold text-blue-200 py-20">Cargando obras...</div>
            ) : proyectos.length === 0 ? (
              <div className="text-center text-xl text-blue-200 py-20">Pronto publicaremos aquí nuestras obras terminadas.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {mostradas.map((p) => <TarjetaObra key={p.id} obra={p} onAbrir={() => setVisor(p)} />)}
                </div>
                {filtradas.length > 6 && (
                  <div className="mt-10 text-center">
                    <button type="button" onClick={() => setVerTodas((v) => !v)}
                      className="rounded-full border border-white/30 hover:bg-white/10 text-white font-bold px-7 py-3 transition cursor-pointer">
                      {verTodas ? "Ver menos obras" : `Ver las ${filtradas.length} obras`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Proceso: es una secuencia real, por eso va numerado */}
      <section id="proceso" className="scroll-mt-16 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <Encabezado sobre="Cómo trabajamos" titulo="De la idea a la llave en mano" texto="Un camino simple, con acuerdos claros en cada etapa." />
        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="relative rounded-2xl bg-white ring-1 ring-slate-200 p-6 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 text-blue-950 font-black">{i + 1}</span>
              <h3 className="mt-4 font-extrabold text-blue-900">{p.titulo}</h3>
              <p className="mt-2 text-sm text-slate-600">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Llamado a la acción + redes */}
      <section id="contacto" className="scroll-mt-16 bg-gradient-to-br from-blue-900 to-blue-950 text-white">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">¿Listo para construir su casa?</h2>
            <p className="mt-4 text-lg text-blue-100">Cuéntenos su idea y su terreno. Le respondemos con una cotización clara y sin compromiso.</p>
            {contacto && (
              <a href={contacto} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-full bg-green-600 hover:bg-green-500 text-white font-black px-8 py-3.5 shadow-lg transition">
                <span aria-hidden>💬</span> Escribir por WhatsApp
              </a>
            )}
          </div>

          <h3 className="mt-14 text-center text-sm font-bold uppercase tracking-widest text-amber-300">Síganos en nuestras redes</h3>
          <ul className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {REDES.map((r) => {
              const cuerpo = (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-amber-300 group-hover:bg-amber-400 group-hover:text-blue-950 transition-colors"><IconoRed clave={r.clave} /></span>
                  <span className="mt-3 block font-extrabold">{r.nombre}</span>
                  <span className="mt-1 block text-sm text-blue-200">{r.descripcion}</span>
                  <span className="mt-3 block text-xs font-bold text-amber-300">{r.url ? "Visitar" : "Próximamente"}</span>
                </>
              );
              return (
                <li key={r.clave}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="group block h-full rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 p-5 transition">{cuerpo}</a>
                  ) : (
                    <div className="group block h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 opacity-70">{cuerpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Instituto y programadores */}
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

      <footer className="bg-blue-950 text-blue-200 py-8 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
          <p className="font-medium">&copy; {new Date().getFullYear()} DenaServ. Todos los derechos reservados.</p>
          <div className="flex items-center gap-5 font-semibold">
            <Link href="/privacidad" className="hover:text-white hover:underline">Política de privacidad</Link>
            <Link href="/login" className="hover:text-white hover:underline">Acceso de la empresa</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
