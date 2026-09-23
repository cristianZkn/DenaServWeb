from ninja import Schema
from datetime import datetime, date
from typing import List, Optional
from uuid import UUID

# --- Schemas para Auth ---
class LoginSchema(Schema):
    nombre_usuario: str
    password: str

class TokenSchema(Schema):
    token: str

class MessageSchema(Schema):
    message: str

# --- Schemas de Negocio (Retorno) ---
class HitoPagoSchema(Schema):
    id: int
    numero_hito: int
    nombre_fase: str
    porcentaje_exigido: float
    monto_esperado: float
    estado_pago: str
    fecha_limite_pactada: Optional[date] = None

class ClienteSchema(Schema):
    nombre_completo: str
    telefono_whatsapp: str
    correo_electronico: Optional[str] = None
    comuna_residencia: Optional[str] = None

class ContratoSchema(Schema):
    monto_total_pactado: float
    hitos: List[HitoPagoSchema]

class CotizacionSchema(Schema):
    id: int
    folio: str
    uuid_publico: UUID
    cliente: ClienteSchema
    superficie_m2: float
    tipo_base: str
    tipo_revestimiento_exterior: str
    tipo_cubierta: str
    requiere_nivelacion: bool
    distancia_traslado_km: float
    monto_total_bruto: float
    estado: str
    fecha_emision: datetime

class CotizacionPublicaSchema(CotizacionSchema):
    contrato: Optional[ContratoSchema] = None

# --- Schemas de Creación ---
class CrearCotizacionSchema(Schema):
    cliente_nombre: str
    cliente_telefono: str
    cliente_email: Optional[str] = None
    cliente_comuna: Optional[str] = None
    
    superficie_m2: float
    tipo_base: str
    tipo_revestimiento_exterior: str
    tipo_cubierta: str
    costo_base_casa_global: float
    
    requiere_nivelacion: bool
    costo_nivelacion_global: float
    distancia_traslado_km: float
    costo_logistica_global: float
