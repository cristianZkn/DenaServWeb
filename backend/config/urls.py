# pyrefly: ignore [missing-import]
import os

from django.contrib import admin
# pyrefly: ignore [missing-import]
from django.urls import path
# pyrefly: ignore [missing-import]
from django.conf import settings
from functools import wraps

from django.http import HttpResponse
from ninja import NinjaAPI
from ninja.errors import ValidationError
from ninja.throttling import AuthRateThrottle

from core.api import AuthBearer, PermisoDenegado
from core.limites import IpRateThrottle

######### entrada de la API #########

# En producción no se publica la documentación de la API (ni openapi.json): solo en desarrollo.
# Límites por minuto: por IP del visitante y por usuario autenticado (el inicio de sesión tiene uno más estricto).
def _solo_admin(vista):
    """La documentación (Swagger) solo la ve un Admin con sesión iniciada: se entra desde el sitio, que pone el token de la cookie."""
    @wraps(vista)
    def protegida(request, *args, **kwargs):
        usuario = AuthBearer()(request)
        if usuario is None:
            return HttpResponse("Inicie sesión como Admin para ver la documentación.", status=401)
        if usuario.rol != "ADMIN":
            return HttpResponse("La documentación es solo para el rol Admin.", status=403)
        return vista(request, *args, **kwargs)
    return protegida


api = NinjaAPI(title="DenaServ API", throttle=[IpRateThrottle("600/m"), AuthRateThrottle("600/m")],
               docs_url="/docs", openapi_url="/openapi.json", docs_decorator=_solo_admin)


@api.exception_handler(PermisoDenegado)
def permiso_denegado(request, exc):
    return api.create_response(request, {"message": str(exc)}, status=403)


@api.exception_handler(ValidationError)
def datos_invalidos(request, exc):
    """422 con un mensaje legible: 'Campo: motivo' por cada error (el front lo muestra tal cual)."""
    etiquetas = {"cliente_nombre": "Nombre del cliente", "cliente_telefono": "Teléfono", "cliente_rut": "RUN",
                 "direccion_terreno": "Dirección", "superficie_m2": "Superficie", "distancia_flete_km": "Distancia",
                 "telefono": "Teléfono", "email": "Correo", "rut_empresa": "RUT de la empresa", "razon_social": "Razón social",
                 "descuento_pct": "Descuento", "m2_vigas_vista": "Metros con vigas", "nombre": "Nombre", "unidad_medida": "Unidad", "categoria": "Categoría",
                 "precio_base_unitario": "Precio", "fuente_url": "Dirección de la ficha", "comentario": "Comentario", "porcentaje": "Avance", "titulo": "Título",
                 "monto": "Monto", "metodo": "Método de pago", "desde": "Fecha desde", "hasta": "Fecha hasta"}
    # Mensajes de validación de los límites numéricos y de largo, en español (los de Pydantic vienen en inglés).
    traduccion = {"greater_than": "debe ser mayor que {gt}", "greater_than_equal": "no puede ser menor que {ge}", "less_than": "debe ser menor que {lt}",
                  "less_than_equal": "no puede ser mayor que {le}", "missing": "es obligatorio", "string_too_short": "debe tener al menos {min_length} caracteres",
                  "string_too_long": "puede tener hasta {max_length} caracteres", "float_parsing": "debe ser un número", "int_parsing": "debe ser un número entero",
                  "date_parsing": "debe ser una fecha válida (AAAA-MM-DD)", "date_from_datetime_parsing": "debe ser una fecha válida (AAAA-MM-DD)"}
    msgs = []
    for e in exc.errors:
        campo = etiquetas.get(str(e["loc"][-1]), str(e["loc"][-1]))
        msg = str(e.get("msg", "")).removeprefix("Value error, ")
        if e.get("type") in traduccion:
            try:
                msg = traduccion[e["type"]].format(**(e.get("ctx") or {}))
            except KeyError:
                pass
        msgs.append(msg if msg.startswith(("El ", "La ")) else f"{campo}: {msg}")
    return api.create_response(request, {"message": " ".join(msgs), "detail": exc.errors}, status=422)

# Endpoint para verificar que la API esta funcionando correctamente
@api.get("/")
def health_check(request):
    return {"status": "ok", "message": "DenaServ API esta funcionando correctamente"}

from core.api import router as core_router
api.add_router("", core_router)

urlpatterns = [path("api/", api.urls)]
# El panel de Django no se usa (la gestión es la web de DenaServ): solo se habilita en desarrollo o con ENABLE_ADMIN=1.
if settings.DEBUG or os.getenv("ENABLE_ADMIN") == "1":
    urlpatterns.insert(0, path('admin/', admin.site.urls))
