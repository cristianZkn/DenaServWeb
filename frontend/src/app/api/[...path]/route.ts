import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = "http://127.0.0.1:8000";

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
    const backendResponse = await fetch(targetUrl, {
      method,
      headers,
      body: bodyData,
      redirect: "follow",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!["content-encoding", "transfer-encoding", "connection"].includes(lower)) {
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
