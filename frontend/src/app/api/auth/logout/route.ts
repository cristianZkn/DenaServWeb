import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, opcionesCookie } from "@/lib/sesion";

/** Cierra la sesión borrando la cookie. Solo acepta peticiones nacidas en este mismo sitio. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && new URL(origin).host !== host) return NextResponse.json({ message: "Origen no permitido." }, { status: 403 });
  const respuesta = NextResponse.json({ message: "Sesión cerrada." });
  respuesta.cookies.set(COOKIE_SESION, "", { ...opcionesCookie, maxAge: 0 });
  return respuesta;
}
