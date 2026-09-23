# pyrefly: ignore [missing-import]
from django.contrib import admin
# pyrefly: ignore [missing-import]
from django.urls import path
# pyrefly: ignore [missing-import]
from ninja import NinjaAPI

######### entrada de la API #########

api = NinjaAPI(title="DenaServ API") 

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
