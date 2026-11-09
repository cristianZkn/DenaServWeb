from ninja import Schema
from datetime import datetime, date
from typing import List, Optional
from urllib.parse import quote
from django.conf import settings
from decimal import Decimal


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


# --- 2. Proveedor ---
class ProveedorSchema(Schema):
    id: int
    rut_empresa: str
    razon_social: str
    contacto_nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    descuento_pct: float = 0
    activo: bool

class ProveedorInSchema(Schema):
    rut_empresa: str
    razon_social: str
    contacto_nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    descuento_pct: float = 0
    activo: bool = True


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
    activo: bool

class CatalogoTipoInSchema(Schema):
    categoria: str
    nombre: str
    descripcion: Optional[str] = None
    unidad_medida: str
    precio_base_unitario: float = 0.00
    proveedor_id: Optional[int] = None
    etapa_obra: str = ''
    rendimiento_m2: float = 0
    activo: bool = True


# --- 5. Detalle Cotización Insumo ---
class DetalleCotizacionInsumoSchema(Schema):
    id: int
    cotizacion_id: int
    catalogo_tipo_id: int
    catalogo_tipo: Optional[CatalogoTipoSchema] = None
    etapa_obra: str
    cantidad_calculada: float
    subtotal_costo: float

class DetalleCotizacionInsumoInSchema(Schema):
    catalogo_tipo_id: int
    etapa_obra: str
    cantidad_calculada: float
    subtotal_costo: float


# --- 6. Hito de Pago ---
class HitoPagoSchema(Schema):
    id: int
    cotizacion_id: int
    fase: str
    porcentaje: float
    monto_pago: float
    estado: str
    fecha_pago: Optional[date] = None
    comprobante_ref: Optional[str] = None

class HitoPagoUpdateSchema(Schema):
    estado: Optional[str] = None
    fecha_pago: Optional[date] = None
    comprobante_ref: Optional[str] = None


# --- 7. Obra Ejecución ---
class ObraEjecucionSchema(Schema):
    id: int
    cotizacion_id: int
    porcentaje_avance_real: float
    gasto_real_acumulado: float
    fecha_ultima_actualizacion: Optional[date] = None
    observaciones: Optional[str] = None

class ObraEjecucionInSchema(Schema):
    porcentaje_avance_real: float = 0.00
    gasto_real_acumulado: float = 0.00
    fecha_ultima_actualizacion: Optional[date] = None
    observaciones: Optional[str] = None


# --- 4. Cotización ---
class CotizacionInSchema(Schema):
    cliente_nombre: str
    cliente_telefono: Optional[str] = None
    direccion_terreno: str  # Campo crítico exigido
    superficie_m2: float
    distancia_flete_km: float = 0.00
    base_terreno_id: Optional[int] = None
    revestimiento_id: Optional[int] = None
    # Los costos los calcula el backend; estos campos se ignoran y se mantienen por compatibilidad.
    costo_materiales: float = 0.00
    costo_mano_obra: float = 0.00
    costo_flete: float = 0.00
    costo_total: float = 0.00
    estado: str = "BORRADOR"  # 'BORRADOR', 'ACEPTADA', 'FINALIZADA'
    espesor_cm: float = 10
    arido_empresa: bool = True
    estabilizado_id: Optional[int] = None
    margen: Optional[float] = None

class CotizacionEstadoUpdateSchema(Schema):
    estado: str  # 'BORRADOR', 'ACEPTADA', 'FINALIZADA'

class CotizacionSchema(Schema):
    id: int
    codigo_cotizacion: str
    cliente_nombre: str
    cliente_telefono: Optional[str] = None
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
    fecha_creacion: datetime
    usuario_id: int
    usuario: Optional[UsuarioSchema] = None

class CotizacionDetalladaSchema(CotizacionSchema):
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
    cotizacion_id: Optional[int] = None
    whatsapp_url: Optional[str] = None

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

class PortafolioProyectoInSchema(Schema):
    titulo: str
    descripcion: Optional[str] = None
    ubicacion_comuna: Optional[str] = None
    imagen_url: Optional[str] = None
    publicado: bool = True
    cotizacion_id: Optional[int] = None


# --- Motor de cálculo ---
class CalculoInSchema(Schema):
    superficie_m2: float
    distancia_km: float = 0
    espesor_cm: float = 10
    base_terreno_id: Optional[int] = None
    revestimiento_id: Optional[int] = None
    estabilizado_id: Optional[int] = None
    arido_empresa: bool = True
    separacion_cm: int = 40
    margen: Optional[float] = None


# --- Resumen de ganancias por contrato ---
class GananciasSchema(Schema):
    neto_cobrado: float
    costo_presupuestado: float
    gasto_real: float
    ganancia_estimada: float
    ganancia_real: float
    avance_real: float
    hito_avance_exigible: bool
