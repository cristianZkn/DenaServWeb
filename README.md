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
| **Proyectos** | El estado cambia solo con los pagos: *Cotizado* al crearse, *En ejecución* cuando el anticipo del 40 % se paga por completo y *Obra terminada* cuando todos están pagados. Se puede modificar el valor con motivo (queda historial) o eliminar el proyecto. |
| **Pagos** | Tres pagos por contrato (anticipo 40 %, avance 30 %, entrega 30 %), con registro de **abonos parciales**. |
| **Avance y bitácora** | Cada registro de la bitácora guarda el % de obra, un comentario y fotos opcionales. El avance debe ser coherente con los pagos (por ejemplo, 50 % exige el 2.º pago cobrado). El panel principal muestra el avance de las obras en ejecución. |
| **Fichas** | La ficha del cliente es un resumen general (sin materiales). La ficha de la empresa (PDF) incluye el desglose completo de materiales, mano de obra, traslado, ganancia, pagos y bitácora con fotos. |
| **Materiales y precios** | Catálogo con proveedor, unidad de medida, precio de lista, descuento propio de cada material y costo neto. Los precios se actualizan solos cada lunes desde las fichas de las tiendas (la tienda no informa descuentos: los escribe la empresa en cada material). La mano de obra por m² instalado se decide en cada cotización y queda guardada con la tarifa usada. |
| **Proveedores** | Mantenedor de las empresas a las que se les compra (razón social, RUT y contacto). |
| **Tarifas** | Valores del cálculo (mano de obra, vigas a la vista, ganancia, rendimiento…) editables desde la web. Cada cotización puede cambiar algunas de ellas solo para sí misma («Tarifas de esta cotización» en el cotizador y en «Opciones avanzadas» del proyecto); las que no se cambian siguen las vigentes. |
| **Portafolio** | Obras finalizadas con hasta 10 fotos, que se pueden publicar u ocultar de la web. |
| **Ficha del cliente** | Página pública por enlace con el resumen de la cotización y descarga en PDF. |
| **Roles y auditoría** | Dos roles: **Admin** (todo) y **Operador** (cotiza y registra pagos y avances; no gestiona usuarios ni proveedores, no edita materiales y solo oculta o publica el portafolio). Cada alta, cambio o baja de las entidades principales y cada exportación queda registrada con quién la hizo (pantalla *Auditoría*, solo Admin). |
| **Dashboard y reportes** | Indicadores con su fórmula, gráficos con filtros de fecha y estado, y tres reportes (operativo, gerencial, por período) con exportación a Excel, PDF y CSV e impresión. Ver el [manual por rol](docs/manual-de-usuario.md). |
| **Resumen con IA** | Resumen en lenguaje simple de cada proyecto (Groq, capa gratuita). Si el servicio falla o no hay clave, se entrega un resumen armado por reglas. |

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
    dominio.py         Reglas de negocio puras de pagos y avance (sin base de datos)
    servicios.py       Casos de uso de pagos y obra (reciben sus repositorios por constructor)
    repositorios.py    Patrón Repository: acceso a datos de pagos y obra
    reportes.py, analisis.py  Reportes, exportación e indicadores (usan las vistas SQL)
    auditoria.py       Registro automático de quién cambió qué
    validadores.py     Validación de RUT y teléfono
    migrations/        Migraciones (nunca editar una ya aplicada: crear una nueva)
    management/commands/  cargar_materiales, actualizar_precios_mercado, mapear_catalogo
    tests.py, test_negocio.py, test_reportes.py  Pruebas automáticas (integración y unitarias)
docs/                  Contrato OpenAPI (openapi.json) y manual de usuario
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
| `DB_CONN_MAX_AGE` | Segundos que se reutiliza una conexión a la base (por defecto 60; 0 = una por petición) |
| `GOOGLE_CLIENT_ID` | Cliente OAuth de Google para el inicio de sesión |
| `WHATSAPP_NUMERO` | Número de contacto del portafolio, con código de país (`569XXXXXXXX`) |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Orígenes permitidos (los valores por defecto sirven en local) |
| `CRON_TOKEN` | Clave del actualizador semanal de precios (solo producción) |
| `PROXY_SECRET` | Clave compartida con el frontend (el mismo valor en Vercel y en Render). Permite que el backend cuente las peticiones por la IP real del visitante; sin ella usa la IP de la conexión |
| `COMBUSTIBLE_ZONAS` | Zonas de la CNE cuyo precio del combustible se promedia, separadas por coma: `Zona Norte`, `Zona Centro`, `Metropolitana`, `Zona Sur` (por defecto `Zona Centro,Zona Sur`, la de Los Ángeles) |
| `GROQ_API_KEY`, `GROQ_MODEL` | Clave y modelo del resumen con IA (Groq). Sin clave se usa el resumen base. El modelo por defecto es `openai/gpt-oss-20b` |
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
- Pruebas del backend (con el entorno virtual activo): `python manage.py test core`. **Requieren PostgreSQL**: los reportes usan vistas SQL. Con `DB_HOST` definido corren contra un servidor PostgreSQL (crean y borran su propia base `test_…`); cada push las ejecuta en GitHub Actions ([pruebas.yml](.github/workflows/pruebas.yml)).
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
- **Cabeceras:** el frontend envía política de contenido (CSP), HSTS, anti-clickjacking y `nosniff`. El panel `/admin/` está apagado en producción. La documentación de la API (`/api/docs`) solo la abre un Admin con sesión iniciada (se entra desde el enlace del menú del panel).
- **Roles y control de acceso:** cada endpoint exige sesión y, donde corresponde, rol Admin (403 si no). Lo que el Operador no puede hacer también se oculta en la interfaz, pero el servidor es quien decide.
- **Validación en tres niveles:** formularios del front (mensajes en línea), API (esquemas con mensajes claros, formato de error `{message}`) y base de datos (restricciones `CHECK`, únicos y claves foráneas).
- **Auditoría:** cambios de las entidades principales y cada exportación de reportes, con usuario y fecha.
- **Dependencias:** revisar con `npm audit` (frontend) y `pip-audit` (backend) antes de cada despliegue importante.

## Datos de prueba, respaldo y documentación

- **Datos sintéticos** (para demostrar el dashboard y los reportes): `python manage.py sembrar_datos --base-de-pruebas` crea 520 cotizaciones con 12 meses de historia, hitos, abonos y avance. Todo es inventado y queda marcado (`SIM-…`); `--limpiar` lo borra. Exige el indicador `--base-de-pruebas` porque el `.env` puede apuntar a producción: **córralo solo contra una base de pruebas**.
- **Respaldo y restauración:** `python manage.py respaldar_bd --salida respaldo.json.gz` y `python manage.py restaurar_bd respaldo.json.gz --reemplazar` (detalle en [DEPLOY.md](DEPLOY.md)).
- **Contrato OpenAPI:** [docs/openapi.json](docs/openapi.json). Se regenera con el script de [docs/README.md](docs/README.md) cuando cambia la API.
- **Manual de usuario por rol:** [docs/manual-de-usuario.md](docs/manual-de-usuario.md).

## Uso de herramientas de IA

- **En el producto:** el resumen de proyectos usa la API de **Groq** (modelo `openai/gpt-oss-20b`, capa gratuita). Recibe solo datos del proyecto sin información personal (sin nombre, RUN, teléfono ni dirección), con tiempo máximo de 20 s; la clave es un secreto de entorno y, ante cualquier error, el sistema entrega un resumen armado por reglas. Está probado con el servicio simulado (`ResumenProyectoTests`).
- **En el desarrollo:** se usó **Claude Code** (Anthropic) como apoyo para escribir y revisar código, pruebas y documentación. Todo lo entregado fue revisado por el equipo y puede explicarse y modificarse en vivo.

## Convenciones de trabajo

- **Commits:** una línea breve y descriptiva con el formato `tipo area: descripción`, por ejemplo `fix backend: conexion con bd`.
- **Migraciones:** una migración ya aplicada nunca se modifica ni se reemplaza; los cambios van en una migración nueva (`python manage.py makemigrations`).
- **Secretos:** los archivos `.env` no se suben al repositorio.
