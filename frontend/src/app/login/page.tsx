"use client";

import { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Tipado mínimo de Google Identity Services (se carga desde accounts.google.com).
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!CLIENT_ID) {
      setError("Falta NEXT_PUBLIC_GOOGLE_CLIENT_ID en la configuración del frontend.");
      return;
    }

    const onCredential = async ({ credential }: { credential: string }) => {
      setError("");
      try {
        const res = await fetch(getApiUrl("/auth/google"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.message || `Error del servidor (${res.status})`);
          return;
        }
        // El servidor dejó la sesión en una cookie httpOnly: aquí no se guarda ningún token.
        setSuccessMsg("Autenticación exitosa. Redirigiendo...");
        window.location.href = "/dashboard";
      } catch (err: any) {
        setError(`Error de comunicación con el backend: ${err.message || err}`);
      }
    };

    const init = () => {
      if (!window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCredential });
      window.google.accounts.id.renderButton(btnRef.current, { theme: "outline", size: "large", width: 320 });
    };

    if (window.google) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }, []);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-8 overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-700">
      {/* Resplandores de fondo: verde de la marca y un acento ámbar */}
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(44rem_30rem_at_12%_8%,rgba(70,149,141,0.45),transparent_70%),radial-gradient(40rem_26rem_at_92%_95%,rgba(217,154,43,0.35),transparent_70%)]" />

      <div className="relative w-full max-w-4xl grid md:grid-cols-[1.05fr_1fr] rounded-3xl overflow-hidden shadow-2xl shadow-black/40 bg-white">
        {/* Panel de bienvenida */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-400 via-blue-600 to-blue-800 text-white p-8 sm:p-10 flex flex-col justify-between min-h-[18rem] md:min-h-[32rem]">
          <p className="relative z-10 text-2xl font-black tracking-tighter">
            DENASERV<span className="text-amber-300">.</span>
          </p>
          <div className="relative z-10 my-10">
            <h2 className="text-4xl sm:text-5xl font-black leading-tight">
              Bienvenido <span className="text-amber-300">a su panel</span>
            </h2>
            <p className="mt-4 text-blue-50 max-w-sm">
              Cotice proyectos, siga el avance de cada obra y administre pagos, materiales y proveedores desde un solo lugar.
            </p>
          </div>
          <p className="relative z-10 text-sm text-blue-100">Casas prefabricadas · Los Ángeles, Chile</p>

          {/* Olas decorativas */}
          <svg aria-hidden viewBox="0 0 400 200" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full h-1/2 opacity-60">
            <path d="M0 120 C 90 60, 170 190, 270 120 S 380 60, 400 90 L400 200 L0 200 Z" fill="#12332f" fillOpacity="0.35" />
            <path d="M0 150 C 110 100, 190 200, 290 150 S 380 110, 400 130 L400 200 L0 200 Z" fill="#d99a2b" fillOpacity="0.28" />
          </svg>
        </div>

        {/* Panel de acceso */}
        <div className="p-8 sm:p-12 flex flex-col justify-center">
          <h1 className="text-3xl sm:text-4xl font-black text-blue-900 tracking-tight">Acceso de la empresa</h1>
          <p className="mt-2 text-slate-500">Ingrese con su cuenta de Google para continuar.</p>

          <div className="mt-8">
            {error && (
              <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 text-left rounded-r-md text-sm">
                <p className="font-bold">Error al ingresar</p>
                <p>{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="bg-green-50 border-l-4 border-green-500 text-green-800 p-4 mb-6 text-left rounded-r-md text-sm font-semibold">
                {successMsg}
              </div>
            )}

            <div ref={btnRef} className="flex justify-start min-h-11" />
          </div>

          <p className="mt-8 text-sm text-slate-500 border-t border-slate-100 pt-5">
            El acceso está restringido a los correos autorizados por la empresa.
          </p>
          <a href="/" className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline">
            ← Volver al portafolio
          </a>
        </div>
      </div>
    </div>
  );
}
