import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, DURACION_SESION, opcionesCookie } from "@/lib/sesion";

// En Vercel se define BACKEND_URL con la URL pública del backend en Render (sin "/" final).
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
// Clave compartida con el backend: le permite confiar en la IP real del visitante que le informa este proxy (límite de peticiones).
const PROXY_SECRET = process.env.PROXY_SECRET || "";

// Rutas en Django Ninja que NO llevan trailing slash
const SIN_BARRA_FINAL = ["auth/google", "auth/me", "cotizaciones/calcular", "insumos/actualizar-precios"];
const SEGMENTO_VALIDO = /^[\w.\-~]+$/;
// Cabeceras que el navegador no manda al backend: la sesión y la IP las pone este proxy.
const CABECERAS_BLOQUEADAS = new Set(["host", "content-length", "connection", "expect", "cookie", "authorization", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto", "x-real-ip", "x-client-ip", "x-proxy-secret", "forwarded"]);
const CABECERAS_RESPUESTA_BLOQUEADAS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie", "server", "x-powered-by"]);

const json = (message: string, status: number) => NextResponse.json({ message }, { status });

/** En peticiones que modifican datos solo se aceptan las que nacen en este mismo sitio. */
function origenPermitido(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const sitio = request.headers.get("sec-fetch-site");
  return !sitio || sitio === "same-origin" || sitio === "none";
}

function ipDelVisitante(request: NextRequest): string {
  return (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
}

async function handleProxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  // Solo segmentos simples: así no se puede salir de /api/ (por ejemplo con ".." hacia /admin/).
  if (!path.length || path.some((s) => s === "." || s === ".." || !SEGMENTO_VALIDO.test(s))) return json("Ruta no válida.", 400);
  const subPath = path.join("/");
  const method = request.method;
  if (!["GET", "HEAD"].includes(method) && !origenPermitido(request)) return json("Origen no permitido.", 403);

  const normalizedPath = SIN_BARRA_FINAL.some((p) => subPath.startsWith(p)) ? subPath : `${subPath}/`;
  const queryString = request.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${normalizedPath}${queryString}`;
  // Django Ninja distingue rutas con y sin "/" final: si la primera variante no existe, se prueba la otra.
  const altPath = normalizedPath.endsWith("/") ? normalizedPath.replace(/\/+$/, "") : `${normalizedPath}/`;
  const altUrl = `${BACKEND_URL}/api/${altPath}${queryString}`;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!CABECERAS_BLOQUEADAS.has(key.toLowerCase())) headers[key] = value;
  });
  // La sesión vive en una cookie httpOnly: el proxy la convierte en el token que espera el backend.
  const sesion = request.cookies.get(COOKIE_SESION)?.value;
  if (sesion) headers["authorization"] = `Bearer ${sesion}`;
  if (PROXY_SECRET) {
    headers["x-proxy-secret"] = PROXY_SECRET;
    headers["x-client-ip"] = ipDelVisitante(request);
  }

  const bodyData = ["GET", "HEAD"].includes(method) ? undefined : await request.text();

  try {
    const send = (url: string) => fetch(url, { method, headers, body: bodyData, redirect: "follow", cache: "no-store" });
    let backendResponse = await send(targetUrl);
    // 404 con HTML = ruta inexistente (un 404 de la API responde JSON)
    // 405 = la ruta con "/" existe para otro método (p. ej. POST /cotizaciones/calcular cae en /cotizaciones/{id}/).
    if ([404, 405].includes(backendResponse.status) && !(backendResponse.headers.get("content-type") || "").includes("json")) {
      const retry = await send(altUrl);
      if (![404, 405].includes(retry.status) || (retry.headers.get("content-type") || "").includes("json")) backendResponse = retry;
    }

    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      if (!CABECERAS_RESPUESTA_BLOQUEADAS.has(key.toLowerCase())) responseHeaders.set(key, value);
    });

    // Inicio de sesión: el token se guarda en la cookie y no llega al JavaScript del navegador.
    if (subPath === "auth/google" && method === "POST" && backendResponse.ok) {
      const datos = await backendResponse.json();
      const respuesta = NextResponse.json({ usuario: datos.usuario }, { status: 200 });
      respuesta.cookies.set(COOKIE_SESION, datos.token, { ...opcionesCookie, maxAge: DURACION_SESION });
      return respuesta;
    }

    // Se copia como bytes: así también pasan intactas las imágenes del portafolio.
    const respuesta = new NextResponse(await backendResponse.arrayBuffer(), {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
    // Sesión vencida o inválida: se borra la cookie.
    if (backendResponse.status === 401 && sesion) respuesta.cookies.delete(COOKIE_SESION);
    return respuesta;
  } catch (error) {
    console.error("Error al conectar con el backend:", error); // el detalle queda en el log del servidor, no en la respuesta
    return json("No se pudo conectar con el servidor. Intente nuevamente en unos minutos.", 502);
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
