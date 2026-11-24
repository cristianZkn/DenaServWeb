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
| `CRON_TOKEN` | Llave del planificador semanal (ver «Actualización semanal de precios») |

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
Cada producto guarda la URL exacta de su ficha en Easy, Sodimac o MCT (sin buscadores). El sistema lee el precio de
lista, aplica el descuento del proveedor y guarda `costo neto = precio de lista × (1 − descuento / 100)`.

- **Manual:** botón «Sincronizar precios ahora» en *Materiales y precios* (o `POST /api/insumos/actualizar-precios`).
- **Automática, 1 vez por semana (lunes 03:00 de Chile):** [.github/workflows/precios-semanales.yml](.github/workflows/precios-semanales.yml).
  Configuración única:
  1. Genera una llave: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
  2. En Render agrega la variable `CRON_TOKEN` con esa llave.
  3. En GitHub (*Settings → Secrets and variables → Actions*) crea dos secretos: `CRON_TOKEN` (la misma llave) y
     `API_URL` (`https://<tu-api>.onrender.com`, sin «/» final).
  4. Prueba una vez desde *Actions → Precios semanales → Run workflow*. Si falla un producto, GitHub avisa por correo.
- **Por consola** (local o servidor): `python manage.py actualizar_precios_mercado`.
- Para dejar el catálogo con las fichas mapeadas y las cuatro categorías obligatorias (Techumbre, Revestimiento,
  Tabiquería, Base/Radier) en una base nueva: `python manage.py mapear_catalogo` y luego el comando anterior.

## Respaldo y restauración de la base

La base de Supabase gratuita no incluye respaldos descargables, así que la aplicación trae los suyos (no necesitan `pg_dump`):

```powershell
python manage.py respaldar_bd --salida respaldo.json.gz      # guarda todas las tablas, con fotos y comprobantes
python manage.py restaurar_bd respaldo.json.gz --reemplazar  # vacía la base y la deja como el respaldo
```

- Sin `--reemplazar`, `restaurar_bd` se niega si la base ya tiene datos. Para probar sin riesgo, restaure contra una base vacía (otro proyecto de Supabase o una local).
- El archivo contiene datos de clientes: guárdelo fuera del repositorio. Recomendado: uno por semana y antes de cada despliegue con migraciones.
- La prueba automática `RespaldoTests` respalda, vacía y restaura una base de prueba, y comprueba que no se pierde nada (ni los comprobantes).

## Mantener activo el backend (anti-sueño)

Render gratuito duerme el backend tras 15 min sin visitas y la primera carga tarda cerca de 1 minuto (la portada pide las obras a la API).
[.github/workflows/mantener-activo.yml](.github/workflows/mantener-activo.yml) lo despierta con un `GET /api/` cada 13 minutos, de 07:00 a 23:00 hora de Chile
(verano; en invierno 06:00 a 22:00). Usa el mismo secreto `API_URL` de arriba. Fuera de ese horario el backend se duerme y se ahorran horas de la
capa gratuita (750 h al mes). Para cambiar el horario edita el `cron` del archivo (la hora es UTC). Si GitHub retrasa una ejecución más de 2 minutos el
backend se duerme una vez; se puede probar a mano en *Actions → Mantener activo el backend → Run workflow*.

**Las ejecuciones programadas de GitHub no son confiables:** las retrasa o las descarta cuando hay mucha carga, y un retraso de más de 2 minutos ya deja dormir
al backend. Si en *Actions* no aparecen ejecuciones con evento `schedule`, el respaldo es un monitor externo gratuito (UptimeRobot o cron-job.org) que pida
`https://<tu-api>.onrender.com/api/` cada 5 minutos: es más puntual que GitHub y no necesita cambios en el código.

## Variables locales
Plantillas sin secretos: [backend/.env.example](backend/.env.example) y [frontend/.env.example](frontend/.env.example).
