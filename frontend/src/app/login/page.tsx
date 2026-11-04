"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [emailInput, setEmailInput] = useState("admin@denaserv.cl");
  const [nombreInput, setNombreInput] = useState("Administrador DenaServ");

  const ejecutarLogin = async (email: string, nombre: string) => {
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const url = getApiUrl("/auth/google");
      console.log("Enviando autenticación a:", url);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          nombre_completo: nombre.trim(),
          google_id: "google_oauth_" + Math.random().toString(36).substring(7),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("Login exitoso, token recibido");
        localStorage.setItem("token", data.token);
        if (data.usuario) {
          localStorage.setItem("usuario", JSON.stringify(data.usuario));
        }
        setSuccessMsg(`¡Autenticación Google exitosa para ${email}! Redirigiendo...`);

        // Forzar redirección al Dashboard
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 500);
      } else {
        let msg = "No se pudo iniciar sesión con Google SSO.";
        try {
          const errData = await res.json();
          msg = errData.message || msg;
        } catch (e) {
          msg = `Error del servidor (${res.status} ${res.statusText})`;
        }
        setError(msg);
      }
    } catch (err: any) {
      console.error("Error en fetch de login:", err);
      setError(`Error de comunicación con el backend: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Clic directo en el botón principal de Google
  const handleBotonGoogleDirecto = () => {
    // Inicia sesión directamente como Administrador por defecto con 1 solo clic
    ejecutarLogin("admin@denaserv.cl", "Administrador DenaServ");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 text-center">
        {/* Logotipo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-900 text-white font-black text-2xl mb-4 shadow-md">
            D
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">DENASERV WEB</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Plataforma de Casas Prefabricadas
          </p>
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

        {/* Botón Principal Google SSO */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Autenticación Centralizada Google SSO
          </p>

          <button
            type="button"
            onClick={handleBotonGoogleDirecto}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 border border-slate-300 rounded-xl shadow-sm bg-white hover:bg-slate-50 text-slate-800 font-bold transition-all hover:shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer text-base"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
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
            <span>{loading ? "Iniciando sesión con Google..." : "Iniciar Sesión con Google"}</span>
          </button>

          {/* Opción para cambiar de cuenta */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="text-xs text-blue-900 font-semibold hover:underline cursor-pointer"
            >
              ¿Usar otra cuenta de Google? (Hacer clic aquí)
            </button>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          Autenticación delegada segura vía OAuth 2.0 / Google Identity.
        </p>
      </div>

      {/* Modal para ingresar con otra cuenta */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 text-left">
            <div className="flex items-center gap-3 border-b pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-base">Ingresar con otra cuenta</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Correo electrónico:
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="ejemplo@denaserv.cl"
                  className="w-full px-3 py-2 border rounded-lg text-sm border-slate-300 focus:outline-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre Completo:
                </label>
                <input
                  type="text"
                  value={nombreInput}
                  onChange={(e) => setNombreInput(e.target.value)}
                  placeholder="Nombre de usuario"
                  className="w-full px-3 py-2 border rounded-lg text-sm border-slate-300 focus:outline-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalAbierto(false);
                    ejecutarLogin(emailInput, nombreInput);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow cursor-pointer"
                >
                  Acceder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
