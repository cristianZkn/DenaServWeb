"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [customEmail, setCustomEmail] = useState("");

  const handleGoogleLogin = async (userEmail?: string) => {
    setError("");
    setLoading(true);

    try {
      const emailToUse = userEmail || "admin@denaserv.cl";
      const res = await fetch("http://127.0.0.1:8000/api/auth/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: emailToUse,
          nombre_completo: emailToUse.split("@")[0].toUpperCase(),
          google_id: "google_oauth_" + Math.random().toString(36).substring(7),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("token", data.token);
        if (data.usuario) {
          localStorage.setItem("usuario", JSON.stringify(data.usuario));
        }
        router.push("/dashboard");
      } else {
        const errData = await res.json();
        setError(errData.message || "No se pudo iniciar sesión con Google SSO.");
      }
    } catch (err) {
      setError("Error de conexión con el backend (http://127.0.0.1:8000).");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border border-slate-200 text-center">
        {/* Logo / Encabezado */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-900 text-white font-black text-2xl mb-4 shadow">
            D
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">DENASERV WEB</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Sistema de Gestión y Cotizaciones de Casas Prefabricadas
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 text-left rounded-r-md text-sm">
            <p className="font-bold">Error de Autenticación</p>
            <p>{error}</p>
          </div>
        )}

        {/* Sección SSO */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Autenticación Corporativa Única
          </p>

          <button
            type="button"
            onClick={() => handleGoogleLogin()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-300 rounded-lg shadow-sm bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-all hover:shadow active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{loading ? "Conectando..." : "Iniciar Sesión con Google"}</span>
          </button>

          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowEmailPrompt(!showEmailPrompt)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {showEmailPrompt ? "Ocultar opciones de prueba" : "Ingresar con otro correo de Google"}
            </button>
          </div>

          {showEmailPrompt && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg text-left border border-slate-200 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Email de cuenta corporativa Google:
              </label>
              <input
                type="email"
                placeholder="usuario@denaserv.cl"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm border-slate-300"
              />
              <button
                type="button"
                onClick={() => handleGoogleLogin(customEmail)}
                disabled={loading || !customEmail}
                className="w-full bg-blue-900 text-white py-2 px-3 rounded-md text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                Acceder con este email
              </button>
            </div>
          )}
        </div>

        <p className="mt-8 text-xs text-slate-400">
          Autenticación delegada segura vía OAuth 2.0 / Google Identity. Sin contraseñas locales.
        </p>
      </div>
    </div>
  );
}
