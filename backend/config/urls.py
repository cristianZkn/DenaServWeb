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

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/", api.urls)
]
