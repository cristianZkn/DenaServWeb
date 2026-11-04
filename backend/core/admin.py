from django.contrib import admin
from .models import (
    Usuario, Proveedor, CatalogoTipo, Cotizacion,
    DetalleCotizacionInsumo, HitoPago, ObraEjecucion, PortafolioProyecto
)

@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    list_display = ('id', 'rut', 'nombre_completo', 'email', 'activo')
    search_fields = ('rut', 'nombre_completo', 'email')
    list_filter = ('activo',)

@admin.register(Proveedor)
class ProveedorAdmin(admin.ModelAdmin):
    list_display = ('id', 'rut_empresa', 'razon_social', 'telefono', 'email', 'activo')
    search_fields = ('rut_empresa', 'razon_social')
    list_filter = ('activo',)

@admin.register(CatalogoTipo)
class CatalogoTipoAdmin(admin.ModelAdmin):
    list_display = ('id', 'categoria', 'nombre', 'unidad_medida', 'precio_base_unitario', 'activo')
    search_fields = ('nombre', 'categoria')
    list_filter = ('categoria', 'activo')

@admin.register(Cotizacion)
class CotizacionAdmin(admin.ModelAdmin):
    list_display = ('id', 'codigo_cotizacion', 'cliente_nombre', 'direccion_terreno', 'costo_total', 'estado', 'fecha_creacion')
    search_fields = ('codigo_cotizacion', 'cliente_nombre', 'direccion_terreno')
    list_filter = ('estado', 'fecha_creacion')

@admin.register(DetalleCotizacionInsumo)
class DetalleCotizacionInsumoAdmin(admin.ModelAdmin):
    list_display = ('id', 'cotizacion', 'catalogo_tipo', 'etapa_obra', 'cantidad_calculada', 'subtotal_costo')
    search_fields = ('cotizacion__codigo_cotizacion', 'catalogo_tipo__nombre')

@admin.register(HitoPago)
class HitoPagoAdmin(admin.ModelAdmin):
    list_display = ('id', 'cotizacion', 'fase', 'porcentaje', 'monto_pago', 'estado', 'fecha_pago')
    search_fields = ('cotizacion__codigo_cotizacion', 'fase', 'comprobante_ref')
    list_filter = ('estado', 'fase')

@admin.register(ObraEjecucion)
class ObraEjecucionAdmin(admin.ModelAdmin):
    list_display = ('id', 'cotizacion', 'porcentaje_avance_real', 'gasto_real_acumulado', 'fecha_ultima_actualizacion')
    search_fields = ('cotizacion__codigo_cotizacion',)

@admin.register(PortafolioProyecto)
class PortafolioProyectoAdmin(admin.ModelAdmin):
    list_display = ('id', 'titulo', 'ubicacion_comuna', 'publicado')
    search_fields = ('titulo', 'ubicacion_comuna')
    list_filter = ('publicado',)
