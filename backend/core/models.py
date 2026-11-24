import uuid
from datetime import date

from django.db import models
from django.utils import timezone


# 1. usuario
class Usuario(models.Model):
    rut = models.CharField(max_length=12, unique=True)
    nombre_completo = models.CharField(max_length=150)
    email = models.EmailField(max_length=150, unique=True)
    google_id = models.CharField(max_length=255, null=True, blank=True)
    activo = models.BooleanField(default=True)
    # Admin: todo. Operador: no gestiona usuarios ni proveedores, no edita materiales ni portafolio (solo lo oculta).
    # Los usuarios que ya existían quedan como Admin para no perder acceso.
    rol = models.CharField(max_length=10, choices=[('ADMIN', 'Admin'), ('OPERADOR', 'Operador')], default='ADMIN')

    class Meta:
        db_table = 'usuario'
        constraints = [models.CheckConstraint(condition=models.Q(rol__in=['ADMIN', 'OPERADOR']), name='ck_usuario_rol')]
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
    # Solo insumos: etapa constructiva ('ETAPA_1'/'ETAPA_2') y cantidad por m² de casa.
    # Fuente de precio: URL exacta de la ficha del producto en la tienda (mapeo 1 a 1, sin buscadores).
    fuente_url = models.CharField(max_length=500, blank=True, default='')
    fuente_termino = models.CharField(max_length=150, blank=True, default='')  # en desuso: lo dejó la búsqueda antigua
    precio_actualizado_en = models.DateTimeField(null=True, blank=True)
    # >0: la tienda vende por unidad (plancha/tira) y precio_base_unitario se expresa por m² = precio unidad / m2_por_unidad.
    m2_por_unidad = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    # Registro de la última lectura de la ficha: precio de lista de la tienda (por unidad de venta) y costo neto =
    # precio_lista * (1 - descuento_pct / 100). El descuento es de cada material (convenio u oferta que la empresa
    # consigue en ese producto) y lo escribe la empresa; la lectura de la tienda nunca lo pisa. 0 = sin descuento.
    precio_lista = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    descuento_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    costo_neto = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    sku = models.CharField(max_length=80, blank=True, default='')            # código del producto en la tienda
    nombre_tienda = models.CharField(max_length=250, blank=True, default='')  # nombre que muestra la ficha
    verificado = models.BooleanField(default=False)  # alguien confirmó que la ficha es el producto que se necesita
    ultimo_error = models.CharField(max_length=300, blank=True, default='')  # por qué falló la última lectura
    etapa_obra = models.CharField(max_length=50, blank=True, default='')
    rendimiento_m2 = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    # Mano de obra por m² instalado que se paga a cada trabajador por este material (ej.: OSB Smartside Lap = 2.000).
    # 0 = el material no paga mano de obra aparte. La cantidad de estos materiales se ingresa en m².
    mano_obra_m2 = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = 'catalogo_tipo'
        constraints = [
            models.CheckConstraint(condition=models.Q(precio_base_unitario__gte=0), name='ck_catalogo_precio_no_negativo'),
            models.CheckConstraint(condition=models.Q(descuento_pct__gte=0, descuento_pct__lte=100), name='ck_catalogo_descuento_0_100'),
        ]
        indexes = [models.Index(fields=['categoria', 'activo'], name='ix_catalogo_categoria_activo')]
        verbose_name = 'Catálogo Tipo'
        verbose_name_plural = 'Catálogos Tipos'

    def __str__(self):
        return f"[{self.categoria}] {self.nombre}"


# 4. cotizacion
class Cotizacion(models.Model):
    codigo_cotizacion = models.CharField(max_length=50, unique=True)
    # Llave aleatoria de la ficha pública del cliente (el folio es visible y adivinable, esta no).
    token_publico = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    cliente_nombre = models.CharField(max_length=150)
    cliente_telefono = models.CharField(max_length=20, null=True, blank=True)
    cliente_rut = models.CharField(max_length=12, null=True, blank=True)
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
    # Relleno de estabilizado: se define tras la visita al terreno ('' = aún sin visita).
    # Parámetros con los que se calculó el precio (permiten reajustarlo después de emitida la cotización).
    ganancia_m2 = models.DecimalField(max_digits=12, decimal_places=2, default=30000)
    m2_vigas_vista = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    radier_m2 = models.DecimalField(max_digits=12, decimal_places=2, default=37500)
    ajuste_monto = models.DecimalField(max_digits=18, decimal_places=2, default=0)  # ajuste manual al total (+/-)
    nivelacion_modalidad = models.CharField(max_length=10, blank=True, default='')  # 'CLIENTE' | 'EMPRESA'
    nivelacion_m3 = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    costo_nivelacion = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    # True = el valor sale de la lista (materiales + maestros) y no de tarifas por m²; las cotizaciones antiguas son False.
    modo_lista = models.BooleanField(default=False)
    # Cotizaciones nuevas: mano de obra por tarifa por m² x trabajadores y traslado por combustible
    # (ver calculo._por_tarifas). Las anteriores (False) siguen calculándose como antes.
    modo_tarifas = models.BooleanField(default=False)
    n_trabajadores = models.PositiveSmallIntegerField(default=0)
    dias_obra = models.PositiveSmallIntegerField(default=0)  # días de construcción, sin los 4 de fabricación del radier
    lleva_radier = models.BooleanField(default=False)  # la casa lleva radier o base: suma 4 días y su mano de obra
    tarifa_radier_m2 = models.DecimalField(max_digits=12, decimal_places=2, default=35000)  # 35.000 o 38.000 por trabajador
    precio_litro = models.DecimalField(max_digits=10, decimal_places=2, default=1650)  # precio de la bencina
    # Tarifas del cálculo que se cambiaron solo en esta cotización ({clave: valor}, ver calculo.TARIFAS_POR_COTIZACION).
    # Las que no están aquí siguen las tarifas vigentes. Se guardan para que reajustar o ver el desglose use los mismos valores.
    tarifas_personalizadas = models.JSONField(default=dict, blank=True)
    fecha_creacion = models.DateTimeField(default=timezone.now)
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        related_name='cotizaciones'
    )

    def contrato_notarial_existe(self):
        return ContratoNotarial.objects.filter(cotizacion_id=self.pk).exists()

    class Meta:
        db_table = 'cotizacion'
        constraints = [
            models.CheckConstraint(condition=models.Q(superficie_m2__gt=0), name='ck_cotizacion_superficie_positiva'),
            models.CheckConstraint(condition=models.Q(distancia_flete_km__gte=0), name='ck_cotizacion_distancia_no_negativa'),
            models.CheckConstraint(condition=models.Q(costo_total__gte=0, costo_materiales__gte=0, costo_mano_obra__gte=0, costo_flete__gte=0, costo_nivelacion__gte=0),
                                   name='ck_cotizacion_costos_no_negativos'),
            models.CheckConstraint(condition=models.Q(estado__in=['BORRADOR', 'ACEPTADA', 'FINALIZADA']), name='ck_cotizacion_estado'),
            models.CheckConstraint(condition=models.Q(tipo_proyecto__in=['CASA', 'SOLO_RADIER']), name='ck_cotizacion_tipo'),
        ]
        # Los listados y el dashboard filtran por estado y por fecha de creación.
        indexes = [models.Index(fields=['estado', 'fecha_creacion'], name='ix_cotizacion_estado_fecha')]
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
    # True = material que se agregó a mano a la cotización (suma al valor); False = desglose automático para compras.
    es_adicional = models.BooleanField(default=False)
    # Mano de obra por m² instalado que se cobró en ESTA cotización por este material (0 = sin instalación). Se guarda aquí
    # para que cambiar la tarifa del catálogo después no altere cotizaciones ya emitidas.
    mano_obra_m2 = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'detalle_cotizacion_insumo'
        constraints = [models.CheckConstraint(condition=models.Q(cantidad_calculada__gte=0), name='ck_detalle_cantidad_no_negativa')]
        verbose_name = 'Detalle Cotización Insumo'
        verbose_name_plural = 'Detalles Cotización Insumo'

    def __str__(self):
        return f"{self.cotizacion.codigo_cotizacion} - {self.catalogo_tipo.nombre} ({self.etapa_obra})"


# 5b. mano_obra_linea: trabajadores de la obra. Una línea por cada monto distinto (pagos diferenciados)
class ManoObraLinea(models.Model):
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='mano_obra')
    cantidad = models.PositiveSmallIntegerField(default=1)  # trabajadores que cobran este mismo monto
    cobro = models.DecimalField(max_digits=18, decimal_places=2)  # lo que cobra cada uno por toda la obra

    class Meta:
        db_table = 'mano_obra_linea'
        ordering = ['id']


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
    estado = models.CharField(max_length=50, default='PENDIENTE')  # 'PENDIENTE', 'ABONADO' (pago parcial), 'PAGADO'
    monto_abonado = models.DecimalField(max_digits=18, decimal_places=2, default=0)  # lo recibido hasta ahora
    fecha_pago = models.DateField(null=True, blank=True)
    comprobante_ref = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'hito_pago'
        constraints = [
            models.CheckConstraint(condition=models.Q(porcentaje__gte=0, porcentaje__lte=100), name='ck_hito_porcentaje_0_100'),
            models.CheckConstraint(condition=models.Q(monto_pago__gte=0, monto_abonado__gte=0), name='ck_hito_montos_no_negativos'),
            models.CheckConstraint(condition=models.Q(estado__in=['PENDIENTE', 'ABONADO', 'PAGADO']), name='ck_hito_estado'),
        ]
        ordering = ['id']  # orden fijo del cronograma: anticipo, avance, entrega (sin esto, la base los devuelve en cualquier orden)
        verbose_name = 'Hito de Pago'
        verbose_name_plural = 'Hitos de Pago'

    @property
    def monto_pendiente(self):
        return max(self.monto_pago - self.monto_abonado, 0)

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
        constraints = [models.CheckConstraint(condition=models.Q(porcentaje_avance_real__gte=0, porcentaje_avance_real__lte=100), name='ck_obra_avance_0_100')]
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
    # Viñeta que se muestra sobre las fotos en la página pública ('' = sin viñeta).
    etiqueta = models.CharField(max_length=20, blank=True, default='')  # NUEVO | DESTACADO | ENTREGADO | EN_CONSTRUCCION
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


# 8b. imágenes del portafolio (varias por proyecto, guardadas en la base: el disco de Render no es permanente)
class PortafolioImagen(models.Model):
    proyecto = models.ForeignKey(PortafolioProyecto, on_delete=models.CASCADE, related_name='imagenes')
    contenido = models.BinaryField()
    tipo_mime = models.CharField(max_length=30, default='image/jpeg')
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'portafolio_imagen'
        ordering = ['orden', 'id']


# 8b2. catálogo de casas prediseñadas que se muestra en la página pública (se edita desde el panel, en Portafolio)
class CasaCatalogo(models.Model):
    nombre = models.CharField(max_length=100)
    etiqueta = models.CharField(max_length=30, blank=True, default='')  # viñeta libre sobre la imagen: «Más consultado»…
    m2 = models.PositiveIntegerField(default=0)
    dormitorios = models.PositiveSmallIntegerField(default=0)
    banos = models.PositiveSmallIntegerField(default=0)
    resumen = models.TextField(max_length=600, blank=True, default='')
    ideal = models.CharField(max_length=200, blank=True, default='')
    incluye = models.TextField(blank=True, default='')  # una característica por línea
    personalizado = models.BooleanField(default=False)  # tarjeta «a medida» (sin m² ni dormitorios)
    publicado = models.BooleanField(default=True)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'casa_catalogo'
        ordering = ['orden', 'id']

    def __str__(self):
        return self.nombre


class CasaCatalogoImagen(models.Model):
    casa = models.ForeignKey(CasaCatalogo, on_delete=models.CASCADE, related_name='imagenes')
    contenido = models.BinaryField()
    tipo_mime = models.CharField(max_length=30, default='image/jpeg')
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'casa_catalogo_imagen'
        ordering = ['orden', 'id']


# 8c. bitácora de avance: cada registro deja el % de obra alcanzado, un comentario y fotos opcionales
class BitacoraAvance(models.Model):
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='bitacoras')
    porcentaje = models.DecimalField(max_digits=5, decimal_places=2)
    comentario = models.TextField(max_length=1000)
    fecha = models.DateTimeField(default=timezone.now)
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True, related_name='bitacoras')

    class Meta:
        db_table = 'bitacora_avance'
        constraints = [models.CheckConstraint(condition=models.Q(porcentaje__gte=0, porcentaje__lte=100), name='ck_bitacora_porcentaje_0_100')]
        ordering = ['-fecha', '-id']


class BitacoraFoto(models.Model):
    bitacora = models.ForeignKey(BitacoraAvance, on_delete=models.CASCADE, related_name='fotos')
    contenido = models.BinaryField()
    tipo_mime = models.CharField(max_length=30, default='image/jpeg')

    class Meta:
        db_table = 'bitacora_foto'
        ordering = ['id']


# detalle_registros: libro de pagos. Cada abono de un hito es una fila (monto, método, fecha, comprobante);
# el monto abonado del hito es siempre la suma de sus filas.
METODOS_PAGO = [
    ("EFECTIVO", "Efectivo"), ("TRANSFERENCIA", "Transferencia"), ("CHEQUE", "Cheque"),
    ("DEBITO", "Tarjeta de débito"), ("CREDITO", "Tarjeta de crédito"), ("OTRO", "Otro"),
]


class DetalleRegistro(models.Model):
    hito = models.ForeignKey(HitoPago, on_delete=models.CASCADE, related_name='registros')
    monto = models.DecimalField(max_digits=18, decimal_places=2)
    metodo = models.CharField(max_length=20, choices=METODOS_PAGO, default='OTRO')
    fecha = models.DateField(default=date.today)
    nota = models.CharField(max_length=200, blank=True, default='')
    comprobante = models.BinaryField(null=True, blank=True)  # imagen o PDF del comprobante (opcional)
    comprobante_mime = models.CharField(max_length=30, blank=True, default='')
    comprobante_nombre = models.CharField(max_length=150, blank=True, default='')
    usuario = models.ForeignKey(Usuario, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    fecha_registro = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'detalle_registros'
        constraints = [models.CheckConstraint(condition=models.Q(monto__gt=0), name='ck_registro_monto_positivo')]
        indexes = [models.Index(fields=['fecha'], name='ix_registro_fecha')]
        ordering = ['fecha', 'id']


# Último precio del combustible leído de la CNE (tipos: 93, 95, 97, DIESEL)
class PrecioCombustible(models.Model):
    tipo = models.CharField(max_length=10, unique=True)
    precio = models.DecimalField(max_digits=10, decimal_places=2)  # $ por litro
    zona = models.CharField(max_length=50, blank=True, default='')
    fuente = models.CharField(max_length=100, blank=True, default='')
    manual = models.BooleanField(default=False)  # fijado por la empresa: la consulta a la CNE no lo reemplaza
    actualizado_en = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'precio_combustible'


# Traslados de una cotización: maestros, materiales y flete, cada uno con su combustible, sus días y el precio del litro
# que regía al cotizar (queda fijo aunque el combustible cambie después).
class TrasladoCotizacion(models.Model):
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='traslados')
    tipo = models.CharField(max_length=10)  # MAESTROS | MATERIALES | FLETE | CAMION
    combustible = models.CharField(max_length=10)  # 93 | 95 | 97 | DIESEL ('' en CAMION)
    dias = models.PositiveIntegerField(default=0)
    precio_litro = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'traslado_cotizacion'
        constraints = [models.UniqueConstraint(fields=['cotizacion', 'tipo'], name='un_traslado_por_tipo')]
        ordering = ['id']


# Tarifas fijas del cálculo que la empresa cambió desde la web (las que no están aquí usan el valor de fábrica)
class Tarifa(models.Model):
    clave = models.CharField(max_length=50, unique=True)
    valor = models.DecimalField(max_digits=14, decimal_places=2)
    actualizado_en = models.DateTimeField(default=timezone.now)
    usuario = models.ForeignKey(Usuario, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        db_table = 'tarifa'
        constraints = [models.CheckConstraint(condition=models.Q(valor__gte=0), name='ck_tarifa_valor_no_negativo')]


# Contrato notarial oficial (PDF opcional) del proyecto
class ContratoNotarial(models.Model):
    cotizacion = models.OneToOneField(Cotizacion, on_delete=models.CASCADE, related_name='contrato_notarial')
    nombre_archivo = models.CharField(max_length=150, default='contrato.pdf')
    contenido = models.BinaryField()
    fecha_subida = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'contrato_notarial'


# 9. cambio_cotizacion: historial de reajustes del monto total
class CambioCotizacion(models.Model):
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='cambios')
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name='cambios_cotizacion')
    fecha = models.DateTimeField(default=timezone.now)
    total_anterior = models.DecimalField(max_digits=18, decimal_places=2)
    total_nuevo = models.DecimalField(max_digits=18, decimal_places=2)
    motivo = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        db_table = 'cambio_cotizacion'
        ordering = ['-fecha']


# 10. registro_auditoria: quién creó, modificó o eliminó qué y cuándo (se llena solo, ver core/auditoria.py)
class RegistroAuditoria(models.Model):
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, related_name='auditoria')
    usuario_nombre = models.CharField(max_length=150)  # copia: el registro se entiende aunque el usuario se elimine
    accion = models.CharField(max_length=10, choices=[('CREAR', 'Crear'), ('MODIFICAR', 'Modificar'), ('ELIMINAR', 'Eliminar'), ('EXPORTAR', 'Exportar')])
    entidad = models.CharField(max_length=60)
    entidad_id = models.PositiveIntegerField()
    detalle = models.CharField(max_length=255, blank=True, default='')
    fecha = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'registro_auditoria'
        ordering = ['-fecha', '-id']
        indexes = [models.Index(fields=['entidad', 'entidad_id'])]
