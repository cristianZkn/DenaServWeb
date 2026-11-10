from django.db import models
from django.utils import timezone


# 1. usuario
class Usuario(models.Model):
    rut = models.CharField(max_length=12, unique=True)
    nombre_completo = models.CharField(max_length=150)
    email = models.EmailField(max_length=150, unique=True)
    google_id = models.CharField(max_length=255, null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = 'usuario'
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'

    def __str__(self):
        return f"{self.nombre_completo} ({self.email})"


# 2. proveedor
class Proveedor(models.Model):
    rut_empresa = models.CharField(max_length=12, unique=True)
    razon_social = models.CharField(max_length=150)
    contacto_nombre = models.CharField(max_length=100, null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)
    email = models.EmailField(max_length=150, null=True, blank=True)
    descuento_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # convenio comercial
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = 'proveedor'
        verbose_name = 'Proveedor'
        verbose_name_plural = 'Proveedores'

    def __str__(self):
        return self.razon_social


# 3. catalogo_tipo (Fusiona todos los "tipos")
class CatalogoTipo(models.Model):
    categoria = models.CharField(max_length=50)  # Ej: 'REVESTIMIENTO', 'BASE_TERRENO', 'TABIQUERIA'
    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(null=True, blank=True)
    unidad_medida = models.CharField(max_length=20)
    precio_base_unitario = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='catalogos'
    )
    # Solo categoria 'INSUMO': etapa constructiva ('ETAPA_1'/'ETAPA_2') y cantidad por m² de casa.
    # Fuente de precio (Sodimac/Apify): URL del producto y término de búsqueda para encontrarlo.
    fuente_url = models.CharField(max_length=500, blank=True, default='')
    fuente_termino = models.CharField(max_length=150, blank=True, default='')
    precio_actualizado_en = models.DateTimeField(null=True, blank=True)
    # >0: la tienda vende por unidad (plancha/tira) y precio_base_unitario se expresa por m² = precio unidad / m2_por_unidad.
    m2_por_unidad = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    etapa_obra = models.CharField(max_length=50, blank=True, default='')
    rendimiento_m2 = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = 'catalogo_tipo'
        verbose_name = 'Catálogo Tipo'
        verbose_name_plural = 'Catálogos Tipos'

    def __str__(self):
        return f"[{self.categoria}] {self.nombre}"


# 4. cotizacion
class Cotizacion(models.Model):
    codigo_cotizacion = models.CharField(max_length=50, unique=True)
    cliente_nombre = models.CharField(max_length=150)
    cliente_telefono = models.CharField(max_length=20, null=True, blank=True)
    direccion_terreno = models.CharField(max_length=255)
    superficie_m2 = models.DecimalField(max_digits=10, decimal_places=2)
    distancia_flete_km = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    base_terreno = models.ForeignKey(
        CatalogoTipo,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cotizaciones_base'
    )
    revestimiento = models.ForeignKey(
        CatalogoTipo,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cotizaciones_revestimiento'
    )
    costo_materiales = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    costo_mano_obra = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    costo_flete = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    costo_total = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    estado = models.CharField(max_length=50, default='BORRADOR')  # 'BORRADOR', 'ACEPTADA', 'FINALIZADA'
    tipo_proyecto = models.CharField(max_length=20, default='CASA')  # 'CASA' | 'SOLO_RADIER'
    fecha_creacion = models.DateTimeField(default=timezone.now)
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        related_name='cotizaciones'
    )

    class Meta:
        db_table = 'cotizacion'
        verbose_name = 'Cotización'
        verbose_name_plural = 'Cotizaciones'

    def __str__(self):
        return f"{self.codigo_cotizacion} - {self.cliente_nombre}"


# 5. detalle_cotizacion_insumo
class DetalleCotizacionInsumo(models.Model):
    cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        related_name='detalles_insumo'
    )
    catalogo_tipo = models.ForeignKey(
        CatalogoTipo,
        on_delete=models.PROTECT,
        related_name='detalles_cotizacion'
    )
    etapa_obra = models.CharField(max_length=50)
    cantidad_calculada = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal_costo = models.DecimalField(max_digits=18, decimal_places=2)

    class Meta:
        db_table = 'detalle_cotizacion_insumo'
        verbose_name = 'Detalle Cotización Insumo'
        verbose_name_plural = 'Detalles Cotización Insumo'

    def __str__(self):
        return f"{self.cotizacion.codigo_cotizacion} - {self.catalogo_tipo.nombre} ({self.etapa_obra})"


# 6. hito_pago
class HitoPago(models.Model):
    cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        related_name='hitos_pago'
    )
    fase = models.CharField(max_length=50)  # Ej: 'ANTICIPO_40', 'AVANCE_30'
    porcentaje = models.DecimalField(max_digits=5, decimal_places=2)
    monto_pago = models.DecimalField(max_digits=18, decimal_places=2)
    estado = models.CharField(max_length=50, default='PENDIENTE')  # 'PENDIENTE', 'PAGADO'
    fecha_pago = models.DateField(null=True, blank=True)
    comprobante_ref = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'hito_pago'
        verbose_name = 'Hito de Pago'
        verbose_name_plural = 'Hitos de Pago'

    def __str__(self):
        return f"{self.cotizacion.codigo_cotizacion} - {self.fase} ({self.estado})"


# 7. obra_ejecucion
class ObraEjecucion(models.Model):
    cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        related_name='obras_ejecucion'
    )
    porcentaje_avance_real = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    gasto_real_acumulado = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    fecha_ultima_actualizacion = models.DateField(null=True, blank=True)
    observaciones = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'obra_ejecucion'
        verbose_name = 'Obra en Ejecución'
        verbose_name_plural = 'Obras en Ejecución'

    def __str__(self):
        return f"Obra {self.cotizacion.codigo_cotizacion} - Avance: {self.porcentaje_avance_real}%"


# 8. portafolio_proyecto
class PortafolioProyecto(models.Model):
    titulo = models.CharField(max_length=150)
    descripcion = models.TextField(null=True, blank=True)
    ubicacion_comuna = models.CharField(max_length=100, null=True, blank=True)
    imagen_url = models.CharField(max_length=500, null=True, blank=True)
    publicado = models.BooleanField(default=True)
    cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='proyectos_portafolio'
    )

    class Meta:
        db_table = 'portafolio_proyecto'
        verbose_name = 'Proyecto de Portafolio'
        verbose_name_plural = 'Proyectos de Portafolio'

    def __str__(self):
        return self.titulo
