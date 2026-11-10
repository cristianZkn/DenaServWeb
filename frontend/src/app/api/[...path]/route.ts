import { NextRequest, NextResponse } from "next/server";

// En Vercel se define BACKEND_URL con la URL pública del backend en Render (sin "/" final).
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const subPath = path.join("/");
  const queryString = request.nextUrl.search;

  // Rutas en Django Ninja que NO llevan trailing slash
  const noSlashPrefixes = ["auth/google", "auth/me"];
  const isNoSlash = noSlashPrefixes.some((p) => subPath.startsWith(p));

  // Para endpoints de Django Ninja que esperan trailing slash (/cotizaciones/, /proveedores/, etc.)
  const normalizedPath = isNoSlash
    ? subPath.replace(/\/+$/, "")
    : subPath.endsWith("/")
    ? subPath
    : `${subPath}/`;

  const targetUrl = `${BACKEND_URL}/api/${normalizedPath}${queryString}`;
  // Django Ninja distingue rutas con y sin "/" final: si la primera variante no existe, se prueba la otra.
  const altPath = normalizedPath.endsWith("/") ? normalizedPath.replace(/\/+$/, "") : `${normalizedPath}/`;
  const altUrl = `${BACKEND_URL}/api/${altPath}${queryString}`;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Excluir cabeceras de salto que causan fallos en Node fetch (undici)
    if (!["host", "content-length", "connection", "expect"].includes(lowerKey)) {
      headers[key] = value;
    }
  });

  const method = request.method;
  const isBodyAllowed = !["GET", "HEAD"].includes(method);
  let bodyData: any = undefined;

  if (isBodyAllowed) {
    bodyData = await request.text();
  }

  try {
    const send = (url: string) =>
      fetch(url, { method, headers, body: bodyData, redirect: "follow", cache: "no-store" });
    let backendResponse = await send(targetUrl);
    // 404 con HTML = ruta inexistente (un 404 de la API responde JSON)
    if (backendResponse.status === 404 && !(backendResponse.headers.get("content-type") || "").includes("json")) {
      const retry = await send(altUrl);
      if (retry.status !== 404 || (retry.headers.get("content-type") || "").includes("json")) backendResponse = retry;
    }

    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      // fetch ya descomprime el cuerpo: content-length (del cuerpo comprimido) lo dejaría truncado.
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(lower)) {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await backendResponse.text();

    return new NextResponse(responseBody, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    const causeMsg = error?.cause ? ` (Causa: ${error.cause})` : "";
    console.error("Error al conectar con backend Django en:", targetUrl, error);
    return NextResponse.json(
      {
        message: `No se pudo conectar al servidor backend en ${targetUrl}: ${error.message}${causeMsg}`,
      },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
