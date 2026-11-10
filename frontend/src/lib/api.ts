export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith("/api")
    ? endpoint
    : `/api${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;

  if (typeof window !== "undefined") {
    // En el navegador, siempre usamos URL relativa para evitar problemas de CORS,
    // firewalls, o diferencias de host (localhost vs 127.0.0.1 vs IP de red/Tailscale).
    return cleanEndpoint;
  }

  // En renderizado en servidor (SSR)
  return `${(process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "")}${cleanEndpoint}`;
}

