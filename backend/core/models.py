import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator

# --- Módulo 1: Seguridad ---
class UsuarioManager(BaseUserManager):
    def create_user(self, correo_electronico, nombre_usuario, password=None, **extra_fields):
        if not correo_electronico:
            raise ValueError('El correo electrónico es obligatorio')
        if not nombre_usuario:
            raise ValueError('El nombre de usuario es obligatorio')
        correo_electronico = self.normalize_email(correo_electronico)
        user = self.model(correo_electronico=correo_electronico, nombre_usuario=nombre_usuario, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, correo_electronico, nombre_usuario, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('rol', 'ADMINISTRADOR')
        return self.create_user(correo_electronico, nombre_usuario, password, **extra_fields)

class Usuario(AbstractBaseUser, PermissionsMixin):
    ROLES = (
        ('ADMINISTRADOR', 'ADMINISTRADOR'),
        ('JEFE_FAENA', 'JEFE_FAENA'),
    )
    
    nombre_usuario = models.CharField(max_length=150, unique=True)
    correo_electronico = models.EmailField(unique=True)
    rol = models.CharField(max_length=50, choices=ROLES)
    esta_activo = models.BooleanField(default=True)
    ultimo_acceso = models.DateTimeField(null=True, blank=True)

    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = UsuarioManager()

    USERNAME_FIELD = 'nombre_usuario'
    REQUIRED_FIELDS = ['correo_electronico']

    class Meta:
        db_table = 'usuario'

    def __str__(self):
        return f"{self.nombre_usuario} ({self.rol})"

# --- Módulo 2: Proveedores e Inventario ---
class Proveedor(models.Model):
    rut_proveedor = models.CharField(max_length=20, unique=True)
    razon_social = models.CharField(max_length=255)
    porcentaje_descuento_base = models.DecimalField(
        max_digits=5, decimal_places=2, 
        validators=[MinValueValidator(0.00), MaxValueValidator(100.00)]
    )
    telefono_contacto = models.CharField(max_length=50, blank=True, null=True)
    habilitado = models.BooleanField(default=True)

    class Meta:
        db_table = 'proveedor'

    def __str__(self):
        return self.razon_social

class Insumo(models.Model):
    CATEGORIAS = (
        ('ESTRUCTURA', 'ESTRUCTURA'),
        ('TECHUMBRE', 'TECHUMBRE'),
        ('REVESTIMIENTO_EXTERIOR', 'REVESTIMIENTO_EXTERIOR'),
        ('FUNDACION', 'FUNDACION'),
        ('TERMINACION', 'TERMINACION'),
        ('FIJACION', 'FIJACION'),
    )
    ETAPAS = (
        ('ETAPA_1_OBRA_GRUESA', 'ETAPA_1_OBRA_GRUESA'),
        ('ETAPA_2_TERMINACIONES', 'ETAPA_2_TERMINACIONES'),
    )

    codigo_sku = models.CharField(max_length=100, unique=True)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.PROTECT)
    nombre_material = models.CharField(max_length=255)
    categoria_constructiva = models.CharField(max_length=50, choices=CATEGORIAS)
    etapa_predeterminada = models.CharField(max_length=50, choices=ETAPAS)
    unidad_medida = models.CharField(max_length=50)
    precio_lista_vigente = models.IntegerField(validators=[MinValueValidator(0)])
    stock_actual = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    stock_minimo_seguridad = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    class Meta:
        db_table = 'insumo'

    def __str__(self):
        return f"{self.codigo_sku} - {self.nombre_material}"

class MovimientoInventario(models.Model):
    TIPOS_MOVIMIENTO = (
        ('ENTRADA_COMPRA', 'ENTRADA_COMPRA'),
        ('SALIDA_OBRA', 'SALIDA_OBRA'),
        ('MERMA', 'MERMA'),
        ('AJUSTE_INVENTARIO', 'AJUSTE_INVENTARIO'),
    )

    insumo = models.ForeignKey(Insumo, on_delete=models.PROTECT)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT)
    tipo_movimiento = models.CharField(max_length=50, choices=TIPOS_MOVIMIENTO)
    cantidad = models.DecimalField(max_digits=10, decimal_places=2)
    fecha_registro = models.DateTimeField(auto_now_add=True)
    observacion = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'movimiento_inventario'

    def __str__(self):
        return f"{self.tipo_movimiento} - {self.insumo.nombre_material} ({self.cantidad})"

# --- Módulo 3: Cotizaciones Paramétricas ---
class Cliente(models.Model):
    nombre_completo = models.CharField(max_length=255)
    telefono_whatsapp = models.CharField(max_length=50)
    correo_electronico = models.EmailField(blank=True, null=True)
    comuna_residencia = models.CharField(max_length=150, blank=True, null=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cliente'

    def __str__(self):
        return self.nombre_completo

class Cotizacion(models.Model):
    TIPOS_BASE = (
        ('RADIER_HORMIGON', 'RADIER_HORMIGON'),
        ('BASE_MADERA_PILOTES', 'BASE_MADERA_PILOTES'),
        ('SIN_BASE', 'SIN_BASE'),
    )
    REVESTIMIENTOS = (
        ('SMART_PANEL', 'SMART_PANEL'),
        ('SIDING_FIBROCEMENTO', 'SIDING_FIBROCEMENTO'),
        ('SMART_LAP', 'SMART_LAP'),
        ('METAL_SIDING', 'METAL_SIDING'),
        ('OSB_ESTRUCTURAL', 'OSB_ESTRUCTURAL'),
    )
    CUBIERTAS = (
        ('ZINC_ONDULADO', 'ZINC_ONDULADO'),
        ('ZINC_5V', 'ZINC_5V'),
    )

    folio = models.CharField(max_length=50, unique=True)
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT)
    usuario_generador = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True)
    
    superficie_m2 = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(15.00)])
    tipo_base = models.CharField(max_length=50, choices=TIPOS_BASE)
    tipo_revestimiento_exterior = models.CharField(max_length=50, choices=REVESTIMIENTOS)
    tipo_cubierta = models.CharField(max_length=50, choices=CUBIERTAS)
    
    requiere_nivelacion = models.BooleanField(default=False)
    espesor_nivelacion_cm = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, validators=[MinValueValidator(0.00)])
    volumen_estabilizado_m3 = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    suministro_estabilizado_empresa = models.BooleanField(default=True)
    
    distancia_traslado_km = models.DecimalField(max_digits=8, decimal_places=2, default=0.00, validators=[MinValueValidator(0.00)])
    costo_flete_calculado = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    
    margen_utilidad_porcentaje = models.DecimalField(max_digits=5, decimal_places=2, default=20.00, validators=[MinValueValidator(0.00)])
    subtotal_costo_directo_neto = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    monto_neto_venta = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    monto_iva = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    monto_total_bruto = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    
    fecha_emision = models.DateTimeField(default=timezone.now)
    vigencia_dias = models.IntegerField(default=15)
    uuid_publico = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    estado = models.CharField(max_length=20, default='Borrador')

    class Meta:
        db_table = 'cotizacion'

    def __str__(self):
        return f"{self.folio} - {self.cliente.nombre_completo}"

class CotizacionDetalleMaterial(models.Model):
    ETAPAS = (
        ('ETAPA_1_OBRA_GRUESA', 'ETAPA_1_OBRA_GRUESA'),
        ('ETAPA_2_TERMINACIONES', 'ETAPA_2_TERMINACIONES'),
    )

    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='detalles_materiales')
    insumo = models.ForeignKey(Insumo, on_delete=models.PROTECT)
    etapa_constructiva = models.CharField(max_length=50, choices=ETAPAS)
    cantidad_cubicada = models.DecimalField(max_digits=10, decimal_places=2)
    unidad_medida_historica = models.CharField(max_length=50)
    costo_unitario_neto_aplicado = models.IntegerField(validators=[MinValueValidator(0)])
    subtotal_linea = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'cotizacion_detalle_material'

# --- Módulo 4: Gestión Financiera Notarial ---
class Contrato(models.Model):
    ESTADOS = (
        ('EN_PREPARACION', 'EN_PREPARACION'),
        ('FIRMADO_ACTIVO', 'FIRMADO_ACTIVO'),
        ('EN_FAENA', 'EN_FAENA'),
        ('FINALIZADO_ENTREGADO', 'FINALIZADO_ENTREGADO'),
        ('RESCINDIDO', 'RESCINDIDO'),
    )

    cotizacion = models.OneToOneField(Cotizacion, on_delete=models.PROTECT)
    folio_notarial = models.CharField(max_length=100, unique=True, blank=True, null=True)
    nombre_notaria = models.CharField(max_length=255, blank=True, null=True)
    fecha_firma_notarial = models.DateField(blank=True, null=True)
    estado_contrato = models.CharField(max_length=50, choices=ESTADOS, default='EN_PREPARACION')
    monto_total_pactado = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'contrato'

class HitoPago(models.Model):
    ESTADOS = (
        ('PENDIENTE', 'PENDIENTE'),
        ('PAGADO', 'PAGADO'),
        ('ATRASADO', 'ATRASADO'),
    )

    contrato = models.ForeignKey(Contrato, on_delete=models.CASCADE, related_name='hitos')
    numero_hito = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(3)])
    nombre_fase = models.CharField(max_length=100)
    porcentaje_exigido = models.DecimalField(max_digits=5, decimal_places=2)
    monto_esperado = models.DecimalField(max_digits=12, decimal_places=2)
    estado_pago = models.CharField(max_length=20, choices=ESTADOS, default='PENDIENTE')
    fecha_limite_pactada = models.DateField(blank=True, null=True)
    fecha_pago_efectivo = models.DateTimeField(blank=True, null=True)
    numero_comprobante_bancario = models.CharField(max_length=100, blank=True, null=True)
    observaciones_recepcion = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'hito_pago'

# --- Módulo 5: Portafolio Web ---
class ProyectoRealizado(models.Model):
    slug = models.SlugField(max_length=255, unique=True)
    titulo_descriptivo = models.CharField(max_length=255)
    superficie_construida_m2 = models.DecimalField(max_digits=8, decimal_places=2)
    comuna = models.CharField(max_length=150)
    material_revestimiento_usado = models.CharField(max_length=150)
    plazo_ejecucion_dias = models.IntegerField()
    mensaje_whatsapp_predefinido = models.TextField()
    esta_publicado = models.BooleanField(default=False)
    fecha_publicacion = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'proyecto_realizado'

class FotoProyecto(models.Model):
    proyecto = models.ForeignKey(ProyectoRealizado, on_delete=models.CASCADE, related_name='fotos')
    url_imagen = models.URLField(max_length=500)
    es_portada = models.BooleanField(default=False)
    orden = models.IntegerField(default=0)

    class Meta:
        db_table = 'foto_proyecto'
        ordering = ['orden']
