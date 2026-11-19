# pyrefly: ignore [missing-import]
from django.contrib import admin
# pyrefly: ignore [missing-import]
from django.urls import path
# pyrefly: ignore [missing-import]
from ninja import NinjaAPI
from ninja.errors import ValidationError

######### entrada de la API #########

api = NinjaAPI(title="DenaServ API")


@api.exception_handler(ValidationError)
def datos_invalidos(request, exc):
    """422 con un mensaje legible: 'Campo: motivo' por cada error (el front lo muestra tal cual)."""
    etiquetas = {"cliente_nombre": "Nombre del cliente", "cliente_telefono": "Teléfono", "cliente_rut": "RUN",
                 "direccion_terreno": "Dirección", "superficie_m2": "Superficie", "distancia_flete_km": "Distancia",
                 "telefono": "Teléfono", "email": "Correo", "rut_empresa": "RUT de la empresa", "razon_social": "Razón social",
                 "descuento_pct": "Descuento", "m2_vigas_vista": "Metros con vigas", "nombre": "Nombre", "unidad_medida": "Unidad", "categoria": "Categoría",
                 "precio_base_unitario": "Precio", "fuente_url": "Dirección de la ficha", "comentario": "Comentario", "porcentaje": "Avance", "titulo": "Título"}
    msgs = []
    for e in exc.errors:
        campo = etiquetas.get(str(e["loc"][-1]), str(e["loc"][-1]))
        msg = str(e.get("msg", "")).removeprefix("Value error, ")
        msgs.append(msg if msg.startswith(("El ", "La ")) else f"{campo}: {msg}")
    return api.create_response(request, {"message": " ".join(msgs), "detail": exc.errors}, status=422)

# Endpoint para verificar que la API esta funcionando correctamente
@api.get("/")
def health_check(request):
    return {"status": "ok", "message": "DenaServ API esta funcionando correctamente"}

from core.api import router as core_router
api.add_router("", core_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/", api.urls)
]
