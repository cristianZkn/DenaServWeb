# DENASERV WEB

Plataforma web de **DenaServ**, empresa de construcción de casas prefabricadas y radieres. Tiene dos partes:

- **Sitio público:** portafolio de obras terminadas, con galería de fotos y botón de contacto por WhatsApp.
- **Panel interno** (solo correos autorizados): cotizador, seguimiento de obras y pagos, catálogo de materiales y proveedores, y administración del portafolio.

---

## Contexto del proyecto

### ¿Qué hace el sistema?

| Módulo | Descripción |
|---|---|
| **Cotizador** | Se ingresan los datos del cliente y del terreno, y se arma una **lista de materiales** y la **mano de obra** (cantidad de trabajadores y cobro, con opción de pagos diferenciados). El valor se calcula en vivo. |
| **Cálculo del valor** | `materiales + mano de obra + traslado (por distancia y m²) + vigas a la vista (solo casas) + margen de la empresa ($30.000 por m²)`. Los montos se tratan como IVA incluido y el IVA se desglosa. |
| **Proyectos** | El estado cambia solo con los pagos: *Cotizado* al crearse, *En ejecución* al registrarse el primer pago y *Obra terminada* cuando todos están pagados. Se puede modificar el valor con motivo (queda historial) o eliminar el proyecto. |
| **Pagos** | Tres pagos por contrato (anticipo 40 %, avance 30 %, entrega 30 %), con registro de **abonos parciales**. |
| **Avance y bitácora** | Cada registro de la bitácora guarda el % de obra, un comentario y fotos opcionales. El avance debe ser coherente con los pagos (por ejemplo, 50 % exige el 2.º pago cobrado). El panel principal muestra el avance de las obras en ejecución. |
| **Fichas** | La ficha del cliente es un resumen general (sin materiales). La ficha de la empresa (PDF) incluye el desglose completo de materiales, mano de obra, traslado, ganancia, pagos y bitácora con fotos. |
| **Materiales y precios** | Catálogo con proveedor, precio de lista, descuento y costo neto. Los precios se actualizan solos cada lunes desde las fichas de las tiendas. |
| **Proveedores** | Mantenedor de empresas proveedoras con su descuento comercial. |
| **Portafolio** | Obras finalizadas con hasta 10 fotos, que se pueden publicar u ocultar de la web. |
| **Ficha del cliente** | Página pública por enlace con el resumen de la cotización y descarga en PDF. |

### Arquitectura

```
Navegador ──► Frontend (Next.js, Vercel) ──/api/*──► Backend (Django Ninja, Render) ──► PostgreSQL (Supabase)
```

El frontend reenvía las llamadas `/api/*` al backend mediante un proxy ([`frontend/src/app/api/[...path]/route.ts`](frontend/src/app/api/%5B...path%5D/route.ts)), por lo que el navegador nunca habla directo con el backend.

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | Django 6, Django Ninja (API REST), PyJWT |
| Base de datos | PostgreSQL (Supabase) |
| Autenticación | Inicio de sesión con Google; solo ingresan correos registrados y activos |
| Despliegue | Vercel (frontend) y Render (backend) |
| Automatización | GitHub Actions: actualización semanal de precios ([workflow](.github/workflows/precios-semanales.yml)) |

### Estructura del repositorio

```
backend/
  config/              Configuración de Django (settings, urls)
  core/
    models.py          Modelos de la base de datos
    api.py             Endpoints de la API
    schemas.py         Validación de entrada y salida
    calculo.py         Motor de cálculo del valor de la obra
    validadores.py     Validación de RUT y teléfono
    migrations/        Migraciones (nunca editar una ya aplicada: crear una nueva)
    management/commands/  cargar_materiales, actualizar_precios_mercado, mapear_catalogo
    tests.py           Pruebas automáticas
frontend/
  src/app/             Páginas: portafolio público, login, dashboard, ficha del cliente
  src/components/      Componentes compartidos (modal de pago, ventana de confirmación)
  src/lib/             Validaciones (RUT, teléfono, correo)
```

---

## Guía de instalación local

### 1. Requisitos

- **Python 3.11 o superior** (en Windows, marcar *Add Python to PATH* al instalar)
- **Node.js 20 o superior** (versión LTS)
- **Git**
- Acceso a una base de datos PostgreSQL (solicitar los datos de desarrollo al administrador del proyecto)

### 2. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/tu-repo.git
cd tu-repo
```

Reemplaza la URL por la del repositorio real.

### 3. Backend (Django)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Si PowerShell bloquea la activación, ejecuta antes `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.

Crea el archivo `backend/.env` a partir de [`backend/.env.example`](backend/.env.example). Debe llamarse exactamente `.env` y estar junto a `manage.py`. No se sube a GitHub.

| Variable | Descripción |
|---|---|
| `DJANGO_DEBUG` | `1` en desarrollo (exactamente `1`, sin comillas); `0` en producción |
| `DJANGO_SECRET_KEY` | Obligatoria si `DJANGO_DEBUG` no es `1`. Genera una propia con `python -c "import secrets; print(secrets.token_urlsafe(50))"`. **Nunca uses la de producción.** |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Conexión a PostgreSQL |
| `GOOGLE_CLIENT_ID` | Cliente OAuth de Google para el inicio de sesión |
| `WHATSAPP_NUMERO` | Número de contacto del portafolio, con código de país (`569XXXXXXXX`) |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Orígenes permitidos (los valores por defecto sirven en local) |
| `CRON_TOKEN` | Clave del actualizador semanal de precios (solo producción) |
| `PROXY_SECRET` | Clave compartida con el frontend (el mismo valor en Vercel y en Render). Permite que el backend cuente las peticiones por la IP real del visitante; sin ella usa la IP de la conexión |
| `COMBUSTIBLE_ZONA` | Zona de la CNE para el precio del combustible: `Zona Norte`, `Zona Centro` (por defecto), `Metropolitana` o `Zona Sur` |
| `ENABLE_ADMIN` | `1` para habilitar el panel de Django en `/admin/` (en producción está apagado) |

Luego aplica las migraciones y levanta el servidor:

```powershell
python manage.py migrate
python manage.py runserver 8000
```

La API queda en `http://127.0.0.1:8000/api/`.

**Datos iniciales (opcional):** carga materiales de ejemplo con

```powershell
python manage.py cargar_materiales core/fixtures/materiales_ejemplo.json
```

**Materiales del presupuesto de referencia (casa de 60 m²):** `python manage.py mapear_catalogo` agrega los materiales del listado (radier, tabiques, techumbre, forro exterior e interior, aleros, ventanas y puertas) con la ficha de su tienda (Easy, Sodimac, MCT o Ferrelan), y luego `python manage.py actualizar_precios_mercado` lee sus precios; después se refrescan solos cada lunes. Cada material es un producto con su precio unitario (la cantidad se indica al cotizar). Quedan sin ficha los servicios y traslados (se calculan en el paso de traslado del cotizador). Las partidas globales de `core/fixtures/materiales_presupuesto.json` (unidad `GL`, sin ficha) son solo de referencia y no hace falta cargarlas.

**Primer usuario:** solo ingresan correos registrados en la tabla `usuario`. Crea el tuyo desde `python manage.py shell` o pídele al administrador que lo registre. Si en tu `.env` no defines `GOOGLE_CLIENT_ID` y `DJANGO_DEBUG=1`, el login funciona en modo simulado con el correo registrado.

### 4. Frontend (Next.js)

En una segunda terminal:

```powershell
cd frontend
npm install
```

Crea `frontend/.env.local` a partir de [`frontend/.env.example`](frontend/.env.example):

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | El mismo cliente OAuth de Google del backend |
| `BACKEND_URL` | URL del backend; en local `http://127.0.0.1:8000` |
| `PROXY_SECRET` | La misma clave que en el backend (opcional en local) |

```powershell
npm run dev
```

La aplicación queda en `http://localhost:3000/`. El panel interno está en `/dashboard`.

### 5. Verificación

- Portafolio público: `http://localhost:3000/`
- Panel interno: `http://localhost:3000/login`
- Pruebas del backend (con el entorno virtual activo): `python manage.py test core`
- Compilación del frontend: `npm run build`

---

## Despliegue

- **Backend en Render:** ejecuta `python manage.py migrate` en cada despliegue y define las variables de entorno del paso 3 (con `DJANGO_DEBUG=0` y una `DJANGO_SECRET_KEY` propia).
- **Frontend en Vercel:** define `BACKEND_URL` con la URL pública del backend y `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Precios semanales:** el workflow de GitHub necesita los secretos `API_URL` (URL del backend) y `CRON_TOKEN` (el mismo de Render).

## Seguridad

- **Sesión:** el token vive en una cookie `httpOnly` que solo el servidor de Next.js lee (no se usa `localStorage`); dura 12 horas. El proxy `/api/*` la convierte en el encabezado que espera el backend y acepta peticiones que modifican datos solo si nacen en el mismo sitio.
- **Límites de peticiones:** 600 por minuto por IP y por usuario, y 10 por minuto por IP en el inicio de sesión. Para ataques de denegación de servicio a gran escala conviene además activar reglas de límite en el Firewall de Vercel.
- **Entradas:** todo acceso a la base pasa por el ORM de Django (consultas parametrizadas); los datos se validan en el backend; React escapa lo que muestra; los archivos subidos se aceptan solo con tipos permitidos (JPG, PNG, WebP, PDF).
- **Cabeceras:** el frontend envía política de contenido (CSP), HSTS, anti-clickjacking y `nosniff`. La documentación de la API (`/api/docs`) y el panel `/admin/` no están disponibles en producción.
- **Dependencias:** revisar con `npm audit` (frontend) y `pip-audit` (backend) antes de cada despliegue importante.

## Convenciones de trabajo

- **Commits:** una línea breve y descriptiva con el formato `tipo area: descripción`, por ejemplo `fix backend: conexion con bd`.
- **Migraciones:** una migración ya aplicada nunca se modifica ni se reemplaza; los cambios van en una migración nueva (`python manage.py makemigrations`).
- **Secretos:** los archivos `.env` no se suben al repositorio.
