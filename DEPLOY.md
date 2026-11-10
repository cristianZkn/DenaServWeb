# Guía de despliegue

Arquitectura: **Vercel** (frontend Next.js) → **Render** (API Django) → **Supabase** (PostgreSQL).
Orden recomendado: 1) Supabase, 2) Render, 3) Vercel, 4) Google, 5) cerrar el círculo.

## 1. Supabase (base de datos)
La base ya existe. Para que Render se conecte:
- Usa la cadena del **Session pooler** (*Project Settings → Database → Connection string → Session pooler*). El host directo de Supabase es solo IPv6 y Render no lo alcanza.
- Anota `host`, `port` (5432), `database` (`postgres`), `user` (`postgres.<ref-proyecto>`) y la contraseña.

## 2. Render (API)
1. *New → Blueprint* y elige este repositorio; Render lee [render.yaml](render.yaml).
2. En el servicio `denaserv-api` completa las variables marcadas «a mano»:

| Variable | Valor |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Los de Supabase (paso 1) |
| `GOOGLE_CLIENT_ID` | El mismo ID de cliente OAuth del login |
| `ALLOWED_HOSTS` | `denaserv-api.onrender.com` (tu host real) |
| `CORS_ALLOWED_ORIGINS` | `https://<tu-app>.vercel.app` |
| `CSRF_TRUSTED_ORIGINS` | `https://denaserv-api.onrender.com` |
| `WHATSAPP_NUMERO` | `569XXXXXXXX` (formato internacional, sin «+») |

`DJANGO_SECRET_KEY` la genera Render. `DJANGO_DEBUG` queda en `0`.
3. Despliega. Comprueba `https://<tu-api>.onrender.com/api/` → `{"status": "ok", ...}`.

Nota: en la capa gratuita el servicio se duerme tras 15 min sin uso; la primera visita puede tardar cerca de un minuto.

## 3. Vercel (frontend)
1. *Add New → Project* con este repositorio y **Root Directory = `frontend`**.
2. Variables de entorno:

| Variable | Valor |
|---|---|
| `BACKEND_URL` | `https://<tu-api>.onrender.com` (sin «/» final) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | El ID de cliente OAuth |

3. Despliega y anota la URL pública.

## 4. Google Cloud (login)
En *APIs y servicios → Credenciales →* tu ID de cliente OAuth:
- **Orígenes de JavaScript autorizados**: agrega `https://<tu-app>.vercel.app`.
- Si la app sigue en modo «Prueba», los correos de la empresa deben estar en *Usuarios de prueba*.

## 5. Cerrar el círculo
1. Vuelve a Render y confirma que `CORS_ALLOWED_ORIGINS` tiene la URL final de Vercel.
2. Los usuarios autorizados están en la tabla `usuario`; cualquier correo no registrado recibe «Correo no autorizado».
3. Abre la URL de Vercel, inicia sesión y crea una cotización de prueba.

## Actualización semanal de precios
Comando: `python manage.py actualizar_precios` (lee Sodimac, Easy y MCT; no usa Apify). Opciones sin costo:
- Botón «Sincronizar catálogo y precios» en *Materiales y precios*.
- Una acción programada de GitHub (lunes) que ejecute el comando con las variables `DB_*` como *secrets*.

## Variables locales
Plantillas sin secretos: [backend/.env.example](backend/.env.example) y [frontend/.env.example](frontend/.env.example).
