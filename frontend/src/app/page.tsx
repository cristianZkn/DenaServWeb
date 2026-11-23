"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TarjetaObra, VisorObra, type Obra } from "@/components/GaleriaObra";
import Reveal, { Resaltado } from "@/components/Reveal";
import Proceso from "@/components/Proceso";
import CasaIlustrada from "@/components/CasaIlustrada";
import { MODELOS, type ModeloCasa } from "@/lib/catalogo";
import { ETIQUETAS, REDES, WHATSAPP_GENERAL } from "@/lib/empresa";

const SECCIONES = [
  { id: "inicio", texto: "Inicio" },
  { id: "nosotros", texto: "Nosotros" },
  { id: "servicios", texto: "Servicios" },
  { id: "catalogo", texto: "Catálogo" },
  { id: "proyectos", texto: "Obras" },
  { id: "proceso", texto: "Cómo trabajamos" },
  { id: "contacto", texto: "Contacto" },
];

const VENTAJAS = [
  { icono: "M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 12h6M9 16h6", titulo: "Cotización clara", texto: "Sepa cuánto paga, todo por escrito." },
  { icono: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM8 8h.01", titulo: "Precios al día", texto: "Valores reales, sin sorpresas." },
  { icono: "M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", titulo: "Avance con fotos", texto: "Vea su obra crecer paso a paso." },
  { icono: "M12 6v12M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-3-1.5M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z", titulo: "Pagos por etapas", texto: "Pague a medida que avanza." },
];

const FRASES = ["Cotización clara", "Precios al día", "Avance con fotos", "Pagos por etapas", "Tu casa, tu presupuesto", "Atención cercana", "Calidad que perdura", "Servicio con garantías", "Recomendados por nuestros clientes"];

const SERVICIOS = [
  { icono: "🏠", titulo: "Casas prefabricadas", texto: "Fabricación y armado de casas a la medida de su terreno y su presupuesto." },
  { icono: "🧱", titulo: "Radieres", texto: "Base de hormigón firme y bien nivelada, lista para recibir su casa." },
  { icono: "🛡️", titulo: "Revestimientos", texto: "Smart Panel, siding y terminaciones pensadas para el clima del sur." },
  { icono: "🏗️", titulo: "Cubiertas y techumbres", texto: "Cerchas, zinc y estructura de techo con materiales de calidad." },
];

const METAS = [
  { icono: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z", titulo: "Calidad que perdura", texto: "Construcciones sólidas, con buenos materiales y terminaciones cuidadas." },
  { icono: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4", titulo: "Servicio con garantías", texto: "Lo acompañamos antes, durante y después de la obra, con respaldo claro." },
  { icono: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8", titulo: "Su recomendación", texto: "Queremos que cada cliente satisfecho nos recomiende." },
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
  const [casas, setCasas] = useState<ModeloCasa[]>(MODELOS); // modelos de ejemplo hasta que la empresa cargue los reales
  const [menu, setMenu] = useState(false);
  const [bajo, setBajo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const activa = useSeccionActiva(useMemo(() => SECCIONES.map((s) => s.id), []));

  useEffect(() => {
    fetch("/api/portafolio/")
      .then((res) => res.json())
      .then((data) => setProyectos(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Error al cargar portafolio:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/catalogo-casas/")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setCasas(data.map((c) => ({
          id: String(c.id), nombre: c.nombre, etiqueta: c.etiqueta || undefined, m2: c.m2, dormitorios: c.dormitorios, banos: c.banos,
          resumen: c.resumen, ideal: c.ideal, incluye: c.incluye ?? [], imagen: c.imagenes?.[0], personalizado: c.personalizado,
        })));
      })
      .catch(() => {}); // sin respuesta se quedan los modelos de ejemplo
  }, []);

  useEffect(() => {
    const f = () => {
      setBajo(window.scrollY > 24);
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgreso(total > 0 ? Math.min(1, window.scrollY / total) : 0);
    };
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
          <div className="hidden lg:flex items-center gap-1">{SECCIONES.map(enlace)}</div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden sm:inline-block text-sm font-bold bg-white/10 hover:bg-white/20 border border-white/25 text-white px-4 py-2 rounded-full whitespace-nowrap transition">
              Acceso de la empresa
            </Link>
            <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Abrir menú" aria-expanded={menu}
              className="lg:hidden !min-h-0 h-10 w-10 rounded-lg border border-white/25 text-white cursor-pointer">{menu ? "✕" : "☰"}</button>
          </div>
        </div>
        {menu && (
          <div className="lg:hidden px-4 pb-4 flex flex-col animate-entrar">
            {SECCIONES.map(enlace)}
            <Link href="/login" className="mt-2 text-center text-sm font-bold bg-white/10 border border-white/25 text-white px-4 py-2.5 rounded-lg">Acceso de la empresa</Link>
          </div>
        )}
        <span aria-hidden className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-gradient-to-r from-amber-400 to-blue-300" style={{ transform: `scaleX(${progreso})` }} />
      </nav>

      {/* Inicio */}
      <header id="inicio" className="relative overflow-hidden bg-blue-950 text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60rem_28rem_at_50%_-8%,rgba(70,149,141,0.55),transparent_70%),radial-gradient(34rem_22rem_at_88%_18%,rgba(217,154,43,0.28),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:56px_56px]" />
        <div aria-hidden className="absolute left-1/2 -translate-x-1/2 -top-[34rem] w-[56rem] h-[56rem] rounded-full border border-blue-300/25 shadow-[0_0_140px_30px_rgba(70,149,141,0.35)]" />
        <div aria-hidden className="animate-flotar absolute left-[8%] top-[38%] h-40 w-40 rounded-full bg-blue-400/15 blur-2xl" />
        <div aria-hidden className="animate-flotar-lento absolute right-[10%] top-[52%] h-52 w-52 rounded-full bg-amber-400/15 blur-3xl" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 pt-36 pb-32 sm:pt-44 sm:pb-40 text-center">
          <span className="animate-entrar-arriba inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur px-4 py-1.5 text-sm font-semibold text-blue-100">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulso-anillo" aria-hidden /> Casas prefabricadas y radieres · Los Ángeles, Chile
          </span>
          <h1 className="animate-entrar-arriba retraso-1 mt-6 text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05]">
            Construimos <span className="animate-brillo-texto bg-gradient-to-r from-blue-300 via-amber-200 to-blue-300 bg-clip-text text-transparent">tu hogar</span> con calidad estructural
          </h1>
          <p className="animate-entrar-arriba retraso-2 mt-6 text-lg sm:text-xl text-blue-100 max-w-3xl mx-auto font-light">
            Proyectos personalizados, materiales de calidad y un servicio con garantías. Conozca algunas de las obras que ya entregamos.
          </p>
          <div className="animate-entrar-arriba retraso-3 mt-10 flex flex-wrap justify-center gap-4">
            <a href="#proyectos" className="brillo-boton bg-amber-400 hover:bg-amber-300 text-blue-950 font-black px-7 py-3.5 rounded-full shadow-lg shadow-amber-500/25 hover:-translate-y-0.5 transition">Ver nuestras obras</a>
            <a href="#contacto" className="border border-white/30 hover:bg-white/10 hover:-translate-y-0.5 font-bold px-7 py-3.5 rounded-full transition">Quiero cotizar</a>
          </div>
        </div>
      </header>

      {/* Ventajas: panel de vidrio con borde animado, montado sobre el borde de la cabecera */}
      <section aria-label="Por qué elegirnos" className="relative z-10 -mt-20 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="animate-brillo-texto rounded-3xl bg-gradient-to-r from-amber-400 via-blue-400 to-amber-400 p-[1.5px] shadow-2xl shadow-blue-950/30">
          <div className="relative overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950">
            <div aria-hidden className="absolute -top-24 left-1/4 h-48 w-96 rounded-full bg-blue-400/20 blur-3xl" />
            <div aria-hidden className="absolute -bottom-24 right-1/4 h-48 w-96 rounded-full bg-amber-400/15 blur-3xl" />
            <ul className="relative grid sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-white/10">
              {VENTAJAS.map((v, i) => (
                <li key={v.titulo} className="border-b border-white/10 last:border-b-0 sm:border-b-0 sm:[&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-white/10 lg:[&:nth-child(-n+2)]:border-b-0">
                  <Reveal delay={i * 130} className="h-full">
                    <div className="group h-full p-6 sm:p-7 text-center hover:bg-white/5 transition-colors duration-300">
                      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-blue-950 shadow-lg shadow-amber-500/30 transition-transform duration-500 ease-[cubic-bezier(0.34,1.8,0.64,1)] group-hover:scale-110 group-hover:-rotate-6">
                        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={v.icono} /></svg>
                      </span>
                      <h3 className="mt-4 text-lg font-black text-white group-hover:text-amber-300 transition-colors">{v.titulo}</h3>
                      <p className="mt-1 text-sm text-blue-100/90">{v.texto}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Cinta de frases */}
      <div aria-hidden className="mt-14 overflow-hidden border-y border-slate-200 bg-white py-3.5">
        <div className="animate-cinta flex w-max gap-10 whitespace-nowrap text-sm font-black uppercase tracking-widest text-blue-900/75">
          {[0, 1].map((k) => (
            <div key={k} className="flex gap-10">
              {FRASES.map((x) => (
                <span key={`${k}-${x}`} className="flex items-center gap-10">{x}<span className="text-amber-500">◆</span></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Nosotros */}
      <section id="nosotros" className="scroll-mt-16 relative overflow-hidden">
        <div aria-hidden className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-blue-300/25 blur-3xl animate-flotar-lento" />
        <div aria-hidden className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-amber-300/25 blur-3xl animate-flotar" />
        <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <Reveal className="text-center max-w-3xl mx-auto">
            <p className="text-sm font-bold uppercase tracking-widest text-amber-600">Quiénes somos</p>
            <h2 className="mt-2 text-3xl sm:text-5xl font-black text-blue-900 leading-tight">
              Una empresa de Los Ángeles que construye con <Resaltado retraso={300}>confianza</Resaltado>
            </h2>
            <p className="mt-5 text-lg text-slate-600">
              Nos dedicamos a la <Resaltado retraso={500}>construcción de casas y radieres</Resaltado>, con proyectos personalizados y mejorados. La mayoría de nuestros clientes llega por la{" "}
              <Resaltado retraso={700}>recomendación de obras que ya entregamos</Resaltado>.
            </p>
          </Reveal>

          {/* Valores */}
          <ul className="mt-12 grid md:grid-cols-3 gap-5">
            {METAS.map((m, i) => (
              <li key={m.titulo}>
                <Reveal delay={i * 130} className="h-full">
                  <div className="group relative h-full overflow-hidden rounded-3xl bg-white p-7 ring-1 ring-slate-200 shadow-lg shadow-blue-950/5 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-blue-950/10 transition duration-300">
                    <span aria-hidden className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-amber-400 to-blue-500 transition-transform duration-500 group-hover:scale-x-100" />
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-800 to-blue-600 text-white shadow-md transition-transform duration-500 ease-[cubic-bezier(0.34,1.8,0.64,1)] group-hover:scale-110 group-hover:rotate-6">
                      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={m.icono} /></svg>
                    </span>
                    <h3 className="mt-5 text-xl font-black text-blue-900">{m.titulo}</h3>
                    <p className="mt-2 text-slate-600">{m.texto}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>

          {/* Misión y visión */}
          <div className="mt-6 grid lg:grid-cols-2 gap-5">
            <Reveal desde="izquierda">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-8 sm:p-10 text-white shadow-xl">
                <svg viewBox="0 0 24 24" aria-hidden className="absolute -right-6 -bottom-6 h-44 w-44 text-white/10 animate-flotar" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" /></svg>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-black uppercase tracking-widest text-amber-300">Misión</span>
                <p className="relative mt-5 text-xl sm:text-2xl leading-relaxed text-blue-50">
                  Entregar <Resaltado tono="oscuro" retraso={300}>construcciones de calidad</Resaltado> y un <Resaltado tono="oscuro" retraso={600}>servicio con garantías</Resaltado> a nuestros
                  clientes, para lograr su <Resaltado tono="oscuro" retraso={900}>satisfacción</Resaltado> y crecer en reputación y clientela.
                </p>
              </div>
            </Reveal>
            <Reveal desde="derecha" delay={150}>
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-white to-amber-100 p-8 sm:p-10 ring-1 ring-amber-200 shadow-xl">
                <svg viewBox="0 0 24 24" aria-hidden className="absolute -right-6 -bottom-6 h-44 w-44 text-amber-400/20 animate-flotar-lento" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></svg>
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-200/70 px-4 py-1.5 text-sm font-black uppercase tracking-widest text-amber-800">Visión</span>
                <p className="relative mt-5 text-xl sm:text-2xl leading-relaxed text-slate-700">
                  <Resaltado retraso={300}>Masificar</Resaltado> nuestros servicios para llegar tanto a clientes con <Resaltado retraso={600}>presupuestos reducidos</Resaltado> como a
                  clientes con presupuestos altos, con <Resaltado retraso={900}>buena calidad</Resaltado> en materiales y en nuestros trabajos.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="scroll-mt-16 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <Encabezado sobre="Servicios" titulo="Todo lo que necesita su obra" texto="Desde la base hasta el techo, en una sola cotización." />
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SERVICIOS.map((s, i) => (
              <Reveal key={s.titulo} delay={i * 120} className="h-full">
              <div className="group h-full rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-6 hover:bg-blue-900 hover:ring-blue-900 hover:-translate-y-1 hover:shadow-xl transition duration-300">
                <div className="h-12 w-12 rounded-xl bg-blue-900 group-hover:bg-white/15 text-2xl flex items-center justify-center transition-colors" aria-hidden>{s.icono}</div>
                <h3 className="mt-4 text-lg font-extrabold text-blue-900 group-hover:text-white transition-colors">{s.titulo}</h3>
                <p className="mt-2 text-sm text-slate-600 group-hover:text-blue-100 transition-colors">{s.texto}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Catálogo: casas prediseñadas por la empresa */}
      <section id="catalogo" className="scroll-mt-16 relative overflow-hidden bg-slate-50">
        <div aria-hidden className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl animate-flotar-lento" />
        <div aria-hidden className="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl animate-flotar" />
        <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <Reveal><Encabezado sobre="Catálogo" titulo="Casas prediseñadas" texto="Modelos listos para elegir. Cada uno se adapta a su terreno y a su presupuesto: pida su cotización sin compromiso." /></Reveal>
          <div className="mt-12 grid sm:grid-cols-2 xl:grid-cols-4 gap-6">
            {casas.map((m, i) => {
              const mensaje = encodeURIComponent(m.personalizado || !m.m2 ? `Hola, me interesa ${m.personalizado ? "un proyecto a medida" : `el ${m.nombre}`}. ¿Me pueden enviar una cotización?` : `Hola, me interesa el ${m.nombre} de ${m.m2} m². ¿Me pueden enviar una cotización?`);
              const href = `${WHATSAPP_GENERAL}?text=${mensaje}`;
              return (
                <Reveal key={m.id} delay={i * 120} className="h-full">
                  <article className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-lg shadow-blue-950/5 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-blue-950/15 hover:ring-blue-300 transition duration-300">
                    <div className="relative aspect-[3/2] overflow-hidden bg-blue-950">
                      {m.imagen ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.imagen} alt={`${m.nombre} de ${m.m2} m²`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      ) : (
                        <div className="h-full w-full transition-transform duration-700 group-hover:scale-105"><CasaIlustrada m2={m.m2 || 54} dormitorios={m.dormitorios} plano={m.personalizado} /></div>
                      )}
                      {m.etiqueta && (
                        <span className={`absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-black shadow-md ${m.personalizado ? "bg-white text-blue-900" : "bg-amber-400 text-blue-950"}`}>{m.etiqueta}</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div>
                        <h3 className="text-xl font-black text-blue-900">{m.nombre}</h3>
                        {!m.personalizado && (
                          <ul className="mt-2 flex flex-wrap gap-2 text-xs font-bold" aria-label="Características">
                            <li className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{m.m2} m²</li>
                            <li className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{m.dormitorios} {m.dormitorios === 1 ? "dormitorio" : "dormitorios"}</li>
                            <li className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{m.banos} {m.banos === 1 ? "baño" : "baños"}</li>
                          </ul>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{m.resumen}</p>
                      <ul className="space-y-1.5 text-sm text-slate-700">
                        {m.incluye.map((x) => (
                          <li key={x} className="flex gap-2"><span aria-hidden className="mt-0.5 text-emerald-600">✓</span>{x}</li>
                        ))}
                      </ul>
                      <p className="mt-auto pt-2 text-xs font-semibold text-slate-500"><span className="text-amber-600">Ideal para:</span> {m.ideal}</p>
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="brillo-boton mt-1 block rounded-xl bg-blue-900 hover:bg-blue-800 px-4 py-3 text-center font-bold text-white transition-colors">
                        {m.personalizado ? "Cotizar a medida" : "Cotizar este modelo"}
                      </a>
                    </div>
                  </article>
                </Reveal>
              );
            })}
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
                  {mostradas.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 120} className="h-full"><TarjetaObra obra={p} onAbrir={() => setVisor(p)} /></Reveal>)}
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

      {/* Cómo trabajamos: línea de tiempo animada */}
      <section id="proceso" className="scroll-mt-16 relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_0%,rgba(70,149,141,0.10),transparent_70%)]" />
        <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <Reveal><Encabezado sobre="Cómo trabajamos" titulo="De la idea a la llave en mano" texto="Un camino simple, con acuerdos claros en cada etapa." /></Reveal>
          <Proceso />
        </div>
      </section>

      {/* Llamado a la acción + redes */}
      <section id="contacto" className="scroll-mt-16 bg-gradient-to-br from-blue-900 to-blue-950 text-white">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">¿Listo para construir su casa?</h2>
            <p className="mt-4 text-lg text-blue-100">Cuéntenos su idea y su terreno. Le respondemos con una cotización clara y sin compromiso.</p>
            {contacto && (
              <a href={contacto} target="_blank" rel="noopener noreferrer" className="brillo-boton mt-8 inline-flex items-center gap-2 rounded-full bg-green-600 hover:bg-green-500 text-white font-black px-8 py-3.5 shadow-lg hover:-translate-y-0.5 transition">
                <span aria-hidden>💬</span> Escribir por WhatsApp
              </a>
            )}
          </Reveal>

          <h3 className="mt-14 text-center text-sm font-bold uppercase tracking-widest text-amber-300">Síganos en nuestras redes</h3>
          <ul className="mt-5 grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {REDES.map((r, i) => {
              const cuerpo = (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-amber-300 group-hover:bg-amber-400 group-hover:text-blue-950 transition-colors"><IconoRed clave={r.clave} /></span>
                  <span className="mt-3 block font-extrabold">{r.nombre}</span>
                  <span className="mt-1 block text-sm text-blue-200">{r.descripcion}</span>
                  <span className="mt-3 block text-xs font-bold text-amber-300">{r.cta}</span>
                </>
              );
              return (
                <li key={r.clave}><Reveal delay={i * 100} className="h-full">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="group block h-full rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 p-5 transition">{cuerpo}</a>
                  ) : (
                    <div className="group block h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 opacity-70">{cuerpo}</div>
                  )}
                </Reveal></li>
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
