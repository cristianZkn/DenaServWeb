/** Iconos de línea (trazo 1.8, 24x24) para toda la interfaz. Se colorean con `currentColor` y se dimensionan con className. */
const RUTAS = {
  casa: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z",
  ladrillo: "M3 6h18v12H3zM3 12h18M9 6v6M15 12v6",
  escudo: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z",
  obra: "M3 20h18M5 20v-6a7 7 0 0 1 14 0v6M12 7v7M8 14h8",
  caja: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  dolar: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  herramienta: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6 2.6-2.2z",
  "check-circulo": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6",
  check: "M5 12l5 5 9-10",
  lapiz: "M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4",
  mas: "M12 5v14M5 12h14",
  cerrar: "M6 6l12 12M18 6L6 18",
  "flecha-izq": "M19 12H5M11 6l-6 6 6 6",
  "flecha-der": "M5 12h14M13 6l6 6-6 6",
  "chevron-izq": "M15 18l-6-6 6-6",
  "chevron-der": "M9 18l6-6-6-6",
  externo: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  alerta: "M12 3l10 18H2L12 3zM12 10v5M12 18h.01",
  pin: "M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  mensaje: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z",
  usuarios: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  edificio: "M3 21V8l6-4 6 4v13M15 21V12h6v9M7 12h2M7 16h2",
  carpeta: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z",
  documento: "M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 12h6M9 16h6",
  menu: "M4 7h16M4 12h16M4 17h16",
  salir: "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9",
  cookie: "M21 12a9 9 0 1 1-9-9 3 3 0 0 0 3 3 3 3 0 0 0 3 3 3 3 0 0 0 3 3zM8.5 10.5h.01M12 15h.01M15.5 14h.01M9 15.5h.01",
  buscar: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  filtro: "M3 5h18l-7 8v6l-4 2v-8L3 5z",
  borrador: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h3",
  ayuda: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01",
} as const;

export type NombreIcono = keyof typeof RUTAS;

export default function Icono({ nombre, className = "h-5 w-5" }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={RUTAS[nombre]} />
    </svg>
  );
}
