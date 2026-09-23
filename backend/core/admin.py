from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    Usuario, Proveedor, Insumo, MovimientoInventario, 
    Cliente, Cotizacion, CotizacionDetalleMaterial, 
    Contrato, HitoPago, ProyectoRealizado, FotoProyecto
)

class CustomUserAdmin(UserAdmin):
    list_display = ('nombre_usuario', 'correo_electronico', 'rol', 'esta_activo', 'is_staff')
    search_fields = ('nombre_usuario', 'correo_electronico')
    ordering = ('nombre_usuario',)
    filter_horizontal = ()
    list_filter = ()
    fieldsets = ()

admin.site.register(Usuario, CustomUserAdmin)
admin.site.register(Proveedor)
admin.site.register(Insumo)
admin.site.register(MovimientoInventario)
admin.site.register(Cliente)
admin.site.register(Cotizacion)
admin.site.register(CotizacionDetalleMaterial)
admin.site.register(Contrato)
admin.site.register(HitoPago)
admin.site.register(ProyectoRealizado)
admin.site.register(FotoProyecto)
