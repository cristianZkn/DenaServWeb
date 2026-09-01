import uuid
from django.db import models

class ModeloCasa(models.Model):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    metros_cuadrados = models.DecimalField(max_digits=8, decimal_places=2)
    precio_base_estimado = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.nombre} ({self.metros_cuadrados}m2)"

class Cotizacion(models.Model):
    ESTADOS = (
        ('Borrador', 'Borrador'),
        ('Enviada', 'Enviada'),
        ('Aceptada', 'Aceptada'),
        ('Rechazada', 'Rechazada'),
    )
    TIPOS = (
        ('Prediseniado', 'Prediseñado'),
        ('Personalizado', 'Personalizado'),
    )

    uuid_publico = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    cliente_nombre = models.CharField(max_length=150)
    cliente_telefono = models.CharField(max_length=20, blank=True)
    cliente_email = models.EmailField(blank=True)
    presupuesto_estimado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    tipo_proyecto = models.CharField(max_length=20, choices=TIPOS, default='Personalizado')
    modelo_base = models.ForeignKey(ModeloCasa, on_delete=models.SET_NULL, null=True, blank=True)
    superficie_m2 = models.DecimalField(max_digits=8, decimal_places=2)
    
    costo_base_casa = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    requiere_nivelacion = models.BooleanField(default=False)
    costo_nivelacion = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    distancia_terreno_km = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    costo_logistica = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    costo_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='Borrador')

    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cotizacion {self.id} - {self.cliente_nombre}"

class HitoPago(models.Model):
    ESTADOS_PAGO = (
        ('Pendiente', 'Pendiente'),
        ('Pagado', 'Pagado'),
    )
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='hitos')
    nombre = models.CharField(max_length=100) # ej: "40% Inicio"
    porcentaje = models.DecimalField(max_digits=5, decimal_places=2)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    detalle_cobertura = models.TextField()
    estado = models.CharField(max_length=20, choices=ESTADOS_PAGO, default='Pendiente')
    fecha_pago = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.nombre} - {self.cotizacion.cliente_nombre}"
