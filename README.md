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
| **Cotizaciones** | Estados: *En preparación*, *En ejecución* y *Obra terminada*. Solo se puede terminar una obra en ejecución con todos sus pagos saldados. Se puede modificar el valor con motivo (queda historial) o cancelar la cotización. |
| **Pagos** | Tres pagos por contrato (anticipo 40 %, avance 30 %, entrega 30 %), con registro de **abonos parciales**. |
| **Avance de obras** | Gráfico de barras en el panel principal con el avance de cada obra en ejecución. |
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

## Convenciones de trabajo

- **Commits:** una línea breve y descriptiva con el formato `tipo area: descripción`, por ejemplo `fix backend: conexion con bd`.
- **Migraciones:** una migración ya aplicada nunca se modifica ni se reemplaza; los cambios van en una migración nueva (`python manage.py makemigrations`).
- **Secretos:** los archivos `.env` no se suben al repositorio.
