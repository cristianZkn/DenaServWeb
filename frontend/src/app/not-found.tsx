import type { Metadata } from "next";
import Link from "next/link";
import Icono from "@/components/Icono";

export const metadata: Metadata = { title: "Página no encontrada | DenaServ" };

/** Página 404 con la identidad del sitio: fondo verde pino, casa en construcción y salidas claras. */
export default function NoEncontrada() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-blue-950 text-white flex items-center justify-center px-4">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50rem_26rem_at_50%_-10%,rgba(70,149,141,0.5),transparent_70%),radial-gradient(30rem_20rem_at_90%_100%,rgba(217,154,43,0.22),transparent_70%)]" />
      <div aria-hidden className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative z-10 max-w-xl text-center">
        {/* Casa a medio dibujar: el trazo punteado es el plano que falta */}
        <svg viewBox="0 0 240 150" className="animate-entrar-arriba mx-auto h-40 w-auto text-blue-300" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
          <path d="M20 130h200" />
          <path d="M50 130V70h140v60" />
          <path d="M36 78L120 20l84 58" />
          <path d="M104 130V98h32v32" className="text-amber-300" />
          <path d="M70 86h22v18H70zM148 86h22v18h-22z" strokeDasharray="5 5" className="opacity-70" />
        </svg>
        <p className="animate-entrar-arriba retraso-1 mt-6 text-7xl sm:text-8xl font-black tracking-tight bg-gradient-to-r from-blue-300 via-amber-200 to-blue-300 bg-clip-text text-transparent">404</p>
        <h1 className="animate-entrar-arriba retraso-2 mt-2 text-2xl sm:text-3xl font-black">No encontramos esta página</h1>
        <p className="animate-entrar-arriba retraso-3 mt-3 text-blue-100">
          La dirección puede estar mal escrita o la página ya no existe. Vuelva al inicio para ver nuestras obras y casas.
        </p>
        <div className="animate-entrar-arriba retraso-4 mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-amber-400 hover:bg-amber-300 px-7 py-3 font-black text-blue-950 shadow-lg shadow-amber-500/25 transition">
            <Icono nombre="casa" className="h-5 w-5" /> Volver al inicio
          </Link>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-white/30 hover:bg-white/10 px-7 py-3 font-bold transition">
            Acceso de la empresa
          </Link>
        </div>
      </div>
    </main>
  );
}
