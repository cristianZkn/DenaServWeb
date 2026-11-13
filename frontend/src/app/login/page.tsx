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
        localStorage.setItem("token", data.token);
        if (data.usuario) localStorage.setItem("usuario", JSON.stringify(data.usuario));
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-blue-900">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-blue-900 tracking-tight">
            DENA<span className="text-accent">SERV</span>
          </h1>
          <p className="text-slate-500 mt-2">Cotizaciones de casas prefabricadas</p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 text-left rounded-r-md text-sm">
            <p className="font-bold">Error al ingresar</p>
            <p>{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border-l-4 border-green-500 text-green-800 p-4 mb-6 text-left rounded-r-md text-sm font-semibold">
            {successMsg}
          </div>
        )}

        <p className="font-semibold text-slate-700 mb-4">Ingrese con su cuenta de Google</p>
        <div ref={btnRef} className="flex justify-center" />

        <p className="mt-8 text-sm text-slate-500">El acceso está restringido a los correos autorizados por la empresa.</p>
      </div>
    </div>
  );
}
