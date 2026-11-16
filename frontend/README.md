# DENASERV WEB: frontend

Aplicación Next.js 16 (React 19, Tailwind CSS 4) con el sitio público de portafolio y el panel interno de cotizaciones.

La guía de instalación completa y el contexto del proyecto están en el [README principal](../README.md).

## Inicio rápido

```bash
npm install
cp .env.example .env.local   # completar NEXT_PUBLIC_GOOGLE_CLIENT_ID y BACKEND_URL
npm run dev
```

La aplicación queda en `http://localhost:3000/`. Requiere el backend corriendo en la URL indicada en `BACKEND_URL`.

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run start` | Sirve la compilación de producción |
| `npm run lint` | Revisión con ESLint |

## Estructura

```
src/app/
  page.tsx             Portafolio público
  login/               Inicio de sesión con Google
  dashboard/           Panel interno (cotizaciones, cotizador, materiales, proveedores, portafolio, proyecto)
  cotizacion/[uuid]/   Ficha pública del cliente y PDF
  api/[...path]/       Proxy hacia el backend (BACKEND_URL)
src/components/        PagoModal, ConfirmDialog (ventana de confirmación)
src/lib/validar.ts     Validación de RUT, teléfono y correo
```

Las llamadas `/api/*` del navegador pasan por el proxy, que las reenvía al backend de Django.
