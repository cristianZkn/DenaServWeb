import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Política de contenido: solo se ejecuta código de este sitio y del inicio de sesión de Google; no se permite incrustar la página en otros sitios.
// 'unsafe-inline' en scripts lo exige Next.js para sus datos de hidratación (no hay nonce); 'unsafe-eval' solo en desarrollo.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval' " : ""}https://accounts.google.com`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com",
  "frame-src https://accounts.google.com blob:",
  "object-src 'self' blob:", // visor de PDF del navegador (contratos y comprobantes se abren como blob:)
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const comunes = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [
      { source: "/:path*", headers: comunes },
      // La CSP va en las páginas; las respuestas de /api (JSON, imágenes, PDF) pasan tal cual desde el backend.
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
    ];
  },
};

export default nextConfig;
