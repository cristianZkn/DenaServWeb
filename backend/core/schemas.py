from ninja import Schema
from datetime import datetime, date
import uuid
from typing import Dict, List, Optional
from urllib.parse import quote
from django.conf import settings
from decimal import Decimal
from pydantic import Field, field_validator, model_validator
from . import calculo
from .models import METODOS_PAGO
from . import validadores as v



# --- Validaciones compartidas ---
def _opcional(fn):
    """Aplica `fn` solo si el campo trae algo (vacío = no informado)."""
    return lambda valor: fn(valor) if valor and str(valor).strip() else None


class _ContactoMixin:
    """Valida teléfono/RUN/nombre/dirección de cliente; se mezcla en los schemas de cotización."""
    @field_validator("cliente_nombre", check_fields=False)
    @classmethod
    def _nombre(cls, x):
        return None if x is None else v.texto(x, "El nombre del cliente", 3, 150)

    @field_validator("cliente_telefono", check_fields=False)
    @classmethod
    def _telefono(cls, x):
        return _opcional(v.normalizar_telefono)(x)

    @field_validator("cliente_rut", check_fields=False)
    @classmethod
    def _rut(cls, x):
        return _opcional(lambda r: v.normalizar_rut(r, "RUN"))(x)

    @field_validator("direccion_terreno", check_fields=False)
    @classmethod
    def _direccion(cls, x):
        return None if x is None else v.texto(x, "La dirección del terreno", 5, 255)


# --- Schemas de Autenticación (Google SSO) ---
class GoogleAuthInSchema(Schema):
    credential: Optional[str] = None  # Google ID Token
    email: Optional[str] = None       # Fallback para pruebas/mock
    nombre_completo: Optional[str] = None
    google_id: Optional[str] = None

class TokenSchema(Schema):
    token: str
    usuario: "UsuarioSchema"

class MessageSchema(Schema):
    message: str


# --- 1. Usuario ---
class UsuarioSchema(Schema):
    id: int
    rut: str
    nombre_completo: str
    email: str
    google_id: Optional[str] = None
    activo: bool

# --- 1b. Usuarios autorizados (administración) ---
class UsuarioInSchema(Schema):
    rut: str
    nombre_completo: str
    email: str
    activo: bool = True

    @field_validator("rut")
    @classmethod
    def _rut(cls, x):
        return v.normalizar_rut(x, "RUN")

    @field_validator("nombre_completo")
    @classmethod
    def _nombre(cls, x):
        return v.texto(x, "El nombre", 3, 150)

    @field_validator("email")
    @classmethod
    def _email(cls, x):
        return v.validar_email(x).lower()



# --- 2. Proveedor ---
class ProveedorSchema(Schema):
    id: int
    rut_empresa: str
    razon_social: str
    contacto_nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    activo: bool

class ProveedorInSchema(Schema):
    rut_empresa: str
    razon_social: str
    contacto_nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    activo: bool = True

    @field_validator("rut_empresa")
    @classmethod
    def _rut(cls, x):
        return v.normalizar_rut(x)

    @field_validator("razon_social")
    @classmethod
    def _razon(cls, x):
        return v.texto(x, "La razón social", 2, 150)

    @field_validator("contacto_nombre")
    @classmethod
    def _contacto(cls, x):
        return v.texto(x, "El nombre de contacto", 2, 100) if x and x.strip() else None

    @field_validator("telefono")
    @classmethod
    def _tel(cls, x):
        return _opcional(v.normalizar_telefono)(x)

    @field_validator("email")
    @classmethod
    def _mail(cls, x):
        return _opcional(v.validar_email)(x)


# --- 3. Catalogo Tipo (Consolidado) ---
class CatalogoTipoSchema(Schema):
    id: int
    categoria: str
    nombre: str
    descripcion: Optional[str] = None
    unidad_medida: str
    precio_base_unitario: float
    proveedor_id: Optional[int] = None
    proveedor: Optional[ProveedorSchema] = None
    etapa_obra: str = ''
    rendimiento_m2: float = 0
    fuente_url: str = ''
    fuente_termino: str = ''
    precio_actualizado_en: Optional[datetime] = None
    m2_por_unidad: float = 0
    mano_obra_m2: float = 0
    precio_lista: Optional[float] = None
    descuento_pct: float = 0
    costo_neto: Optional[float] = None
    verificado: bool = False
    ultimo_error: str = ''
    activo: bool
    precio_neto: float = 0  # lo que cuesta al cotizar: precio unitario menos el descuento del propio material

    @staticmethod
    def resolve_precio_neto(obj):
        return float(calculo.costo_neto(obj.precio_base_unitario, obj.descuento_pct))

class CatalogoTipoInSchema(Schema):
    categoria: str = Field(min_length=2, max_length=50)
    nombre: str = Field('', max_length=150)
    descripcion: Optional[str] = Field(None, max_length=2000)
    unidad_medida: str = Field('UN', max_length=20)
    precio_base_unitario: float = Field(0.00, ge=0, le=1_000_000_000)
    descuento_pct: float = Field(0, ge=0, le=100)  # descuento propio de este material (convenio u oferta); 0 = sin descuento
    proveedor_id: Optional[int] = None
    etapa_obra: str = Field('', max_length=50)
    rendimiento_m2: float = Field(0, ge=0, le=100_000)
    fuente_url: str = Field('', max_length=500)
    m2_por_unidad: float = Field(0, ge=0, le=100_000)
    mano_obra_m2: float = Field(0, ge=0, le=1_000_000)  # mano de obra por m² instalado (0 = no aplica)
    verificado: bool = False
    activo: bool = True

    @field_validator("fuente_url")
    @classmethod
    def _url(cls, x):
        x = (x or "").strip()
        if x and not x.startswith(("http://", "https://")):
            raise ValueError("La dirección de la ficha debe comenzar con http:// o https://")
        return x

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, x):
        return v.texto(x, "El nombre", 2, 150) if x and x.strip() else ""

    @field_validator("unidad_medida")
    @classmethod
    def _unidad(cls, x):
        u = (x or "").strip().upper()
        if u not in UNIDADES:
            raise ValueError("Elija la unidad de medida del material (unidad, m², metro lineal, kg, saco, caja, rollo, plancha…).")
        return u


UNIDADES = ("UN", "M2", "ML", "M3", "KG", "SACO", "CAJA", "ROLLO", "PLANCHA", "BOLSA", "LT", "GL", "PAR")


class InsumoSchema(Schema):
    """Fila de la tabla 'Materiales y precios': precio de lista, descuento vigente y costo neto final (CLP)."""
    id: int
    categoria: str
    nombre: str
    proveedor_id: Optional[int] = None
    proveedor: Optional[str] = None
    unidad_medida: str
    url: str = ''
    sku: str = ''
    precio_base_unitario: float = 0  # precio cargado a mano (bases sin ficha de tienda)
    precio_lista: Optional[float] = None
    descuento_pct: float = 0
    costo_neto: Optional[float] = None
    m2_por_unidad: float = 0
    neto_por_m2: Optional[float] = None  # solo revestimientos: costo neto por m² (lo que usa la cotización)
    mano_obra_m2: float = 0
    actualizado_en: Optional[datetime] = None
    verificado: bool = False
    activo: bool
    ultimo_error: str = ''


# --- 5. Detalle Cotización Insumo ---
class DetalleCotizacionInsumoSchema(Schema):
    id: int
    cotizacion_id: int
    catalogo_tipo_id: int
    catalogo_tipo: Optional[CatalogoTipoSchema] = None
    etapa_obra: str
    cantidad_calculada: float
    subtotal_costo: float
    es_adicional: bool = False
    mano_obra_m2: float = 0

class DetalleCotizacionInsumoInSchema(Schema):
    catalogo_tipo_id: int
    etapa_obra: str
    cantidad_calculada: float
    subtotal_costo: float


# --- 6. Hito de Pago ---
class RegistroPagoSchema(Schema):
    """Una fila del libro de pagos (detalle_registros): lo pagado en ese abono y cómo va el hito después de él."""
    id: int
    monto: float
    metodo: str
    metodo_etiqueta: str
    fecha: date
    nota: str = ""
    tiene_comprobante: bool = False
    comprobante_nombre: str = ""
    usuario: Optional[str] = None
    acumulado: float  # total pagado del hito hasta este abono
    saldo: float      # lo que falta del hito después de este abono


class HitoPagoSchema(Schema):
    id: int
    cotizacion_id: int
    fase: str
    porcentaje: float
    monto_pago: float
    monto_abonado: float = 0
    monto_pendiente: float = 0
    estado: str
    fecha_pago: Optional[date] = None
    comprobante_ref: Optional[str] = None
    registros: List[RegistroPagoSchema] = []

    @staticmethod
    def resolve_registros(obj):
        etiquetas, acumulado, filas = dict(METODOS_PAGO), Decimal(0), []
        for r in obj.registros.select_related("usuario").defer("comprobante"):
            acumulado += r.monto
            filas.append({"id": r.id, "monto": r.monto, "metodo": r.metodo, "metodo_etiqueta": etiquetas.get(r.metodo, r.metodo),
                          "fecha": r.fecha, "nota": r.nota, "tiene_comprobante": bool(r.comprobante_mime),
                          "comprobante_nombre": r.comprobante_nombre, "usuario": r.usuario.nombre_completo if r.usuario else None,
                          "acumulado": acumulado, "saldo": max(obj.monto_pago - acumulado, 0)})
        return filas


class HitoPagoPublicoSchema(Schema):
    """Un hito de pago tal como lo ve el cliente en su ficha pública: solo montos, estado y fecha. No incluye el libro de pagos
    (notas internas, quién registró cada abono, nombres de comprobantes) ni referencias internas."""
    id: int
    fase: str
    porcentaje: float
    monto_pago: float
    monto_abonado: float = 0
    monto_pendiente: float = 0
    estado: str
    fecha_pago: Optional[date] = None


class HitoPagoUpdateSchema(Schema):
    """Compatibilidad: el panel usa `RegistroPagoInSchema`. Aquí `monto_abonado` es el total recibido (nunca baja)."""
    estado: Optional[str] = None
    pago_completo: Optional[bool] = None
    monto_abonado: Optional[float] = None
    fecha_pago: Optional[date] = None
    comprobante_ref: Optional[str] = None
    metodo: Optional[str] = None


class ConfirmarSchema(Schema):
    """409 que pide confirmación: el cliente muestra `message`, pregunta y repite la petición con `forzar`."""
    message: str
    confirmar: bool = True


class ComprobanteInSchema(Schema):
    comprobante: str  # data URL (imagen o PDF)
    comprobante_nombre: str = Field("", max_length=150)


class RegistroPagoInSchema(Schema):
    monto: float = Field(gt=0, le=10_000_000_000)  # lo pagado en este abono (no el total ni lo que falta)
    metodo: str
    fecha: Optional[date] = None
    nota: str = Field("", max_length=200)
    comprobante: Optional[str] = None  # data URL (imagen o PDF), opcional
    comprobante_nombre: str = Field("", max_length=150)

    @field_validator("metodo")
    @classmethod
    def _metodo(cls, x):
        if x not in dict(METODOS_PAGO):
            raise ValueError("Elija cómo se pagó: efectivo, transferencia, cheque, tarjeta u otro.")
        return x


# --- 7. Obra Ejecución ---
class ObraEjecucionSchema(Schema):
    id: int
    cotizacion_id: int
    porcentaje_avance_real: float
    fecha_ultima_actualizacion: Optional[date] = None
    observaciones: Optional[str] = None

class ObraEjecucionInSchema(Schema):
    porcentaje_avance_real: float = Field(0.00, ge=0, le=100)
    fecha_ultima_actualizacion: Optional[date] = None
    observaciones: Optional[str] = None


# --- 4. Cotización ---
class MaterialAdicionalInSchema(Schema):
    catalogo_id: int
    cantidad: float = Field(gt=0, le=100000)
    # Mano de obra por m² instalado SOLO para esta cotización: sin dato se usa la tarifa del catálogo; 0 = no se instala.
    mano_obra_m2: Optional[float] = Field(None, ge=0, le=1_000_000)


class ManoObraInSchema(Schema):
    """Trabajadores que cobran el mismo monto. Para pagos diferenciados se envían varias líneas."""
    cantidad: int = Field(gt=0, le=100)
    cobro: float = Field(ge=0, le=100_000_000)  # lo que cobra cada uno por toda la obra


class TrasladoInSchema(Schema):
    """Un traslado de la cotización. Si no se informa `precio_litro` se usa el precio vigente del combustible (CNE).
    El traslado en camión no lleva combustible y, en ese caso, `precio_litro` es el costo del camión por día."""
    tipo: str
    combustible: str = ""
    dias: int = Field(ge=0, le=365)
    precio_litro: Optional[float] = Field(None, gt=0, le=100_000_000)  # el camión cuesta por día (p. ej. $120.000); el tope del litro se valida abajo

    @field_validator("tipo")
    @classmethod
    def _tipo(cls, x):
        if x not in calculo.TIPOS_TRASLADO:
            raise ValueError("El tipo de traslado debe ser maestros, materiales, flete o traslado de flete.")
        return x

    @model_validator(mode="after")
    def _combustible(self):
        if self.tipo == calculo.TRASLADO_CAMION:
            self.combustible = ""
        elif self.combustible not in ("93", "95", "97", "DIESEL"):
            raise ValueError("El combustible debe ser 93, 95, 97 o diésel.")
        elif self.precio_litro is not None and self.precio_litro > 100_000:
            raise ValueError("El precio del litro no puede superar $100.000.")
        return self


def _sin_traslados_repetidos(lista):
    if len({t.tipo for t in lista}) != len(lista):
        raise ValueError("Cada tipo de traslado se puede indicar una sola vez.")
    return lista


class CotizacionInSchema(_ContactoMixin, Schema):
    cliente_nombre: str
    cliente_telefono: Optional[str] = None
    cliente_rut: Optional[str] = None
    direccion_terreno: str  # Campo crítico exigido
    superficie_m2: float = Field(gt=0, le=10000)
    distancia_flete_km: float = Field(0.00, ge=0, le=3000)
    base_terreno_id: Optional[int] = None
    revestimiento_id: Optional[int] = None
    # Los costos los calcula el backend; estos campos se ignoran y se mantienen por compatibilidad.
    costo_materiales: float = 0.00
    costo_mano_obra: float = 0.00
    costo_flete: float = 0.00
    costo_total: float = 0.00
    estado: str = "BORRADOR"  # 'BORRADOR', 'ACEPTADA', 'FINALIZADA'
    ganancia_m2: Optional[float] = None
    m2_vigas_vista: float = Field(0, ge=0, le=10000)
    tipo_proyecto: str = "CASA"
    radier_m2: Optional[float] = None
    materiales: List[MaterialAdicionalInSchema] = Field([], max_length=60)  # lista de materiales agregados a mano
    maestros: List[ManoObraInSchema] = Field([], max_length=30)
    modo_lista: bool = False  # True: el valor sale de la lista (materiales + maestros)
    # Cotización por tarifas (la que usa el formulario actual): mano de obra por m² y traslado por combustible.
    modo_tarifas: bool = False
    n_trabajadores: int = Field(0, ge=0, le=100)
    dias_obra: int = Field(0, ge=0, le=365)
    lleva_radier: bool = False
    tarifa_radier_m2: Optional[float] = Field(None, ge=0, le=1_000_000)
    precio_litro: Optional[float] = Field(None, gt=0, le=100_000)
    traslados: List[TrasladoInSchema] = Field([], max_length=4)  # modo vigente: maestros, materiales, flete y camión
    tarifas_personalizadas: Dict[str, float] = {}  # tarifas cambiadas solo para esta cotización

    @field_validator("traslados")
    @classmethod
    def _traslados_unicos(cls, x):
        return _sin_traslados_repetidos(x)

    @field_validator("tarifas_personalizadas")
    @classmethod
    def _tarifas(cls, x):
        return calculo.validar_tarifas_personalizadas(x)

class CotizacionEstadoUpdateSchema(Schema):
    estado: str  # 'BORRADOR', 'ACEPTADA', 'FINALIZADA'

class CotizacionSchema(Schema):
    id: int
    codigo_cotizacion: str
    token_publico: uuid.UUID
    cliente_nombre: str
    cliente_telefono: Optional[str] = None
    cliente_rut: Optional[str] = None
    direccion_terreno: str
    superficie_m2: float
    distancia_flete_km: float
    base_terreno_id: Optional[int] = None
    base_terreno: Optional[CatalogoTipoSchema] = None
    revestimiento_id: Optional[int] = None
    revestimiento: Optional[CatalogoTipoSchema] = None
    costo_materiales: float
    costo_mano_obra: float
    costo_flete: float
    costo_total: float
    estado: str
    tipo_proyecto: str = "CASA"
    nivelacion_modalidad: str = ""
    nivelacion_m3: float = 0
    costo_nivelacion: float = 0
    ganancia_m2: float = 0
    m2_vigas_vista: float = 0
    tarifas_personalizadas: Dict[str, float] = {}
    radier_m2: float = 0
    ajuste_monto: float = 0
    modo_lista: bool = False
    modo_tarifas: bool = False
    n_trabajadores: int = 0
    dias_obra: int = 0
    lleva_radier: bool = False
    tarifa_radier_m2: float = 35000
    precio_litro: float = 1650
    fecha_creacion: datetime
    usuario_id: int
    usuario: Optional[UsuarioSchema] = None

class CotizacionDetalladaSchema(CotizacionSchema):
    tiene_contrato: bool = False

    @staticmethod
    def resolve_tiene_contrato(obj):
        return obj.contrato_notarial_existe()

    hitos_pago: List[HitoPagoSchema] = []
    detalles_insumo: List[DetalleCotizacionInsumoSchema] = []
    obras_ejecucion: List[ObraEjecucionSchema] = []


# --- 8. Portafolio Proyecto ---
class PortafolioProyectoSchema(Schema):
    id: int
    titulo: str
    descripcion: Optional[str] = None
    ubicacion_comuna: Optional[str] = None
    imagen_url: Optional[str] = None
    publicado: bool
    etiqueta: str = ""
    cotizacion_id: Optional[int] = None
    whatsapp_url: Optional[str] = None
    imagenes: List[str] = []
    superficie_m2: Optional[float] = None
    revestimiento: Optional[str] = None

    @staticmethod
    def resolve_superficie_m2(obj):
        return float(obj.cotizacion.superficie_m2) if obj.cotizacion else None

    @staticmethod
    def resolve_revestimiento(obj):
        return obj.cotizacion.revestimiento.nombre if obj.cotizacion and obj.cotizacion.revestimiento else None

    @staticmethod
    def resolve_imagenes(obj):
        # La foto externa (imagen_url, de obras cargadas antes de subir fotos) va primero y se conserva al agregar fotos nuevas.
        urls = [f"/api/portafolio/imagenes/{i.id}/" for i in obj.imagenes.all()]
        return ([obj.imagen_url] if obj.imagen_url else []) + urls

    @staticmethod
    def resolve_whatsapp_url(obj):
        # RFS-17: enlace wa.me con mensaje prellenado (modelo, m² y revestimiento si hay cotización asociada).
        c = obj.cotizacion
        detalle = f"{obj.titulo}"
        if c:
            detalle += f", {c.superficie_m2} m²"
            if c.revestimiento:
                detalle += f", revestimiento {c.revestimiento.nombre}"
        texto = f"Hola, me interesa una casa como esta: {detalle}"
        return f"https://wa.me/{settings.WHATSAPP_NUMERO}?text={quote(texto)}"

class CasaCatalogoSchema(Schema):
    id: int
    nombre: str
    etiqueta: str = ""
    m2: int = 0
    dormitorios: int = 0
    banos: int = 0
    resumen: str = ""
    ideal: str = ""
    incluye: List[str] = []
    personalizado: bool = False
    publicado: bool = True
    orden: int = 0
    imagenes: List[str] = []

    @staticmethod
    def resolve_incluye(obj):
        return [x for x in obj.incluye.splitlines() if x.strip()]

    @staticmethod
    def resolve_imagenes(obj):
        return [f"/api/catalogo-casas/imagenes/{i.id}/" for i in obj.imagenes.all()]


def _lineas_incluye(lista):
    if len(lista) > 8:
        raise ValueError("Se admiten hasta 8 características por casa.")
    return "\n".join(v.texto(x, "Cada característica", 2, 120) for x in lista if x and x.strip())


class CasaCatalogoInSchema(Schema):
    nombre: str
    etiqueta: str = ""
    m2: int = Field(0, ge=0, le=1000)
    dormitorios: int = Field(0, ge=0, le=20)
    banos: int = Field(0, ge=0, le=20)
    resumen: str = ""
    ideal: str = ""
    incluye: List[str] = []
    personalizado: bool = False
    publicado: bool = True
    orden: int = Field(0, ge=0, le=999)
    imagenes: List[str] = []  # data URL (data:image/jpeg;base64,...)

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, x):
        return v.texto(x, "El nombre", 3, 100)

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta(cls, x):
        return v.texto(x, "La viñeta", 0, 30)

    @field_validator("resumen")
    @classmethod
    def _resumen(cls, x):
        return v.texto(x, "La descripción", 0, 600)

    @field_validator("ideal")
    @classmethod
    def _ideal(cls, x):
        return v.texto(x, "«Ideal para»", 0, 200)

    @field_validator("incluye")
    @classmethod
    def _incluye(cls, x):
        _lineas_incluye(x)
        return [v.texto(i, "Cada característica", 2, 120) for i in x if i and i.strip()]


class CasaCatalogoUpdateSchema(Schema):
    nombre: Optional[str] = None
    etiqueta: Optional[str] = None
    m2: Optional[int] = Field(None, ge=0, le=1000)
    dormitorios: Optional[int] = Field(None, ge=0, le=20)
    banos: Optional[int] = Field(None, ge=0, le=20)
    resumen: Optional[str] = None
    ideal: Optional[str] = None
    incluye: Optional[List[str]] = None
    personalizado: Optional[bool] = None
    publicado: Optional[bool] = None
    orden: Optional[int] = Field(None, ge=0, le=999)
    agregar_imagenes: List[str] = []
    quitar_imagenes: List[int] = []

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, x):
        return None if x is None else v.texto(x, "El nombre", 3, 100)

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta(cls, x):
        return None if x is None else v.texto(x, "La viñeta", 0, 30)

    @field_validator("resumen")
    @classmethod
    def _resumen(cls, x):
        return None if x is None else v.texto(x, "La descripción", 0, 600)

    @field_validator("ideal")
    @classmethod
    def _ideal(cls, x):
        return None if x is None else v.texto(x, "«Ideal para»", 0, 200)

    @field_validator("incluye")
    @classmethod
    def _incluye(cls, x):
        if x is None:
            return None
        _lineas_incluye(x)
        return [v.texto(i, "Cada característica", 2, 120) for i in x if i and i.strip()]


class PortafolioProyectoInSchema(Schema):
    titulo: str = Field(min_length=3, max_length=150)
    descripcion: Optional[str] = Field(None, max_length=2000)
    ubicacion_comuna: Optional[str] = Field(None, max_length=100)
    imagen_url: Optional[str] = None
    publicado: bool = True
    etiqueta: str = ""
    cotizacion_id: Optional[int] = None
    imagenes: List[str] = []  # imágenes como data URL (data:image/jpeg;base64,...)

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta(cls, x):
        return _etiqueta_valida(x)

    @field_validator("imagen_url")
    @classmethod
    def _imagen_url(cls, x):
        x = (x or "").strip()
        if x and not x.startswith(("http://", "https://")):
            raise ValueError("La dirección de la imagen debe comenzar con http:// o https://")
        return x or None


ETIQUETAS_PORTAFOLIO = ("", "NUEVO", "DESTACADO", "ENTREGADO", "EN_CONSTRUCCION")


def _etiqueta_valida(x):
    if x not in ETIQUETAS_PORTAFOLIO:
        raise ValueError("La viñeta debe ser nuevo, destacado, entregado o en construcción.")
    return x


class PortafolioProyectoUpdateSchema(Schema):
    titulo: Optional[str] = Field(None, min_length=3, max_length=150)
    descripcion: Optional[str] = Field(None, max_length=2000)
    ubicacion_comuna: Optional[str] = Field(None, max_length=100)
    publicado: Optional[bool] = None
    etiqueta: Optional[str] = None
    agregar_imagenes: List[str] = []
    quitar_imagenes: List[int] = []
    quitar_portada: bool = False  # quita la foto externa (imagen_url)

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta(cls, x):
        return _etiqueta_valida(x or "")


class ProgresoObraSchema(Schema):
    id: int
    codigo_cotizacion: str
    cliente_nombre: str
    avance: float


class TrimestreSchema(Schema):
    clave: str
    etiqueta: str
    creados: int
    terminados: int
    # Ganancia neta (sin IVA) de las cotizaciones creadas en el trimestre, separada por el estado en que están hoy.
    ganancia_cotizadas: int = 0
    ganancia_ejecucion: int = 0
    ganancia_terminadas: int = 0


class EstadisticasSchema(Schema):
    cotizados: int
    en_ejecucion: int
    terminados: int
    trimestres: List[TrimestreSchema]


# --- Motor de cálculo ---
class CalculoInSchema(Schema):
    superficie_m2: float
    distancia_km: float = 0
    base_terreno_id: Optional[int] = None
    revestimiento_id: Optional[int] = None
    separacion_cm: int = 40
    ganancia_m2: Optional[float] = None
    m2_vigas_vista: float = 0
    tipo_proyecto: str = "CASA"
    radier_m2: Optional[float] = None
    materiales: List[MaterialAdicionalInSchema] = Field([], max_length=60)
    maestros: List[ManoObraInSchema] = Field([], max_length=30)
    modo_lista: bool = False
    modo_tarifas: bool = False
    n_trabajadores: int = Field(0, ge=0, le=100)
    dias_obra: int = Field(0, ge=0, le=365)
    lleva_radier: bool = False
    tarifa_radier_m2: Optional[float] = Field(None, ge=0, le=1_000_000)
    precio_litro: Optional[float] = Field(None, gt=0, le=100_000)
    traslados: List[TrasladoInSchema] = Field([], max_length=4)
    tarifas_personalizadas: Dict[str, float] = {}

    @field_validator("traslados")
    @classmethod
    def _traslados_unicos(cls, x):
        return _sin_traslados_repetidos(x)

    @field_validator("tarifas_personalizadas")
    @classmethod
    def _tarifas(cls, x):
        return calculo.validar_tarifas_personalizadas(x)


class NivelacionInSchema(Schema):
    espesor_cm: float
    superficie_m2: Optional[float] = None  # por defecto, la superficie de la cotización
    arido_empresa: bool = True
    aplicar: bool = False  # False = solo calcular (vista previa)


# --- Resumen de ganancias por contrato ---
class GananciasSchema(Schema):
    neto_cobrado: float
    costo_presupuestado: float
    ganancia_estimada: float
    avance_real: float
    avance_minimo: int  # límites de avance que permiten los pagos registrados
    avance_maximo: int


# --- Vista pública (sin datos internos: usuario, ganancia, ajustes, observaciones de obra) ---
class CotizacionPublicaSchema(Schema):
    """Lo que ve el cliente: resumen general del proyecto. No incluye materiales ni el desglose de costos de la empresa."""
    id: int
    codigo_cotizacion: str
    cliente_nombre: str
    cliente_telefono: Optional[str] = None
    direccion_terreno: str
    superficie_m2: float
    costo_total: float
    estado: str
    tipo_proyecto: str = "CASA"
    nivelacion_modalidad: str = ""
    nivelacion_m3: float = 0
    fecha_creacion: datetime
    hitos_pago: List[HitoPagoPublicoSchema] = []
    avance: float = 0  # % de avance de la obra

    tiene_contrato: bool = False

    @staticmethod
    def resolve_tiene_contrato(obj):
        return obj.contrato_notarial_existe()

    @staticmethod
    def resolve_avance(obj):
        obra = obj.obras_ejecucion.all()[0] if obj.obras_ejecucion.all() else None
        return float(obra.porcentaje_avance_real) if obra else 0


class TarifaSchema(Schema):
    clave: str
    grupo: str
    nombre: str
    unidad: str
    descripcion: str
    valor: float
    valor_de_fabrica: float
    modificada: bool


class TarifaInSchema(Schema):
    valor: float = Field(ge=0, le=1_000_000_000)


class ContratoInSchema(Schema):
    nombre_archivo: str = "contrato.pdf"
    pdf: str  # data URL base64 (application/pdf)


# --- Bitácora de avance de obra ---
class BitacoraInSchema(Schema):
    porcentaje: float = Field(ge=0, le=100)
    comentario: str = Field(min_length=3, max_length=1000)
    imagenes: List[str] = Field([], max_length=2)  # data URL; si hay más fotos se agregan después con PATCH


class BitacoraFotosInSchema(Schema):
    agregar_imagenes: List[str] = Field(max_length=2)


class BitacoraSchema(Schema):
    id: int
    porcentaje: float
    comentario: str
    fecha: datetime
    usuario: Optional[str] = None
    fotos: List[str] = []

    @staticmethod
    def resolve_usuario(obj):
        return obj.usuario.nombre_completo if obj.usuario else None

    @staticmethod
    def resolve_fotos(obj):
        return [f"/api/bitacora/fotos/{f.id}/" for f in obj.fotos.all()]


# --- Edición / reajuste de una cotización emitida ---
class CotizacionEditSchema(_ContactoMixin, Schema):
    cliente_nombre: Optional[str] = None
    cliente_telefono: Optional[str] = None
    cliente_rut: Optional[str] = None
    direccion_terreno: Optional[str] = None
    superficie_m2: Optional[float] = Field(None, gt=0, le=10000)
    distancia_flete_km: Optional[float] = Field(None, ge=0, le=3000)
    base_terreno_id: Optional[int] = None
    revestimiento_id: Optional[int] = None
    m2_vigas_vista: Optional[float] = None
    ganancia_m2: Optional[float] = None
    radier_m2: Optional[float] = None
    ajuste_monto: Optional[float] = None  # ajuste manual al total (+/-), se suma al cálculo
    n_trabajadores: Optional[int] = Field(None, ge=0, le=100)
    dias_obra: Optional[int] = Field(None, ge=0, le=365)
    lleva_radier: Optional[bool] = None
    tarifa_radier_m2: Optional[float] = Field(None, ge=0, le=1_000_000)
    precio_litro: Optional[float] = Field(None, gt=0, le=100_000)
    tarifas_personalizadas: Optional[Dict[str, float]] = None  # reemplaza las tarifas propias de la cotización ({} = todas las vigentes)
    motivo: Optional[str] = None
    aplicar: bool = False  # False = solo vista previa

    @field_validator("tarifas_personalizadas")
    @classmethod
    def _tarifas(cls, x):
        return None if x is None else calculo.validar_tarifas_personalizadas(x)


class CambioCotizacionSchema(Schema):
    id: int
    fecha: datetime
    usuario: str
    total_anterior: float
    total_nuevo: float
    motivo: str
