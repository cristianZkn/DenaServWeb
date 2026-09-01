from ninja import Schema, ModelSchema
from .models import Cotizacion, ModeloCasa, HitoPago
from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import Field

class MessageSchema(Schema):
    message: str

class LoginSchema(Schema):
    username: str
    password: str

class TokenSchema(Schema):
    token: str

class ModeloCasaSchema(ModelSchema):
    class Meta:
        model = ModeloCasa
        fields = ['id', 'nombre', 'descripcion', 'metros_cuadrados', 'precio_base_estimado']

class HitoPagoSchema(ModelSchema):
    class Meta:
        model = HitoPago
        fields = ['id', 'nombre', 'porcentaje', 'monto', 'detalle_cobertura', 'estado', 'fecha_pago']

class CotizacionSchema(ModelSchema):
    hitos: List[HitoPagoSchema] = []
    modelo_base_detalle: Optional[ModeloCasaSchema] = None

    class Meta:
        model = Cotizacion
        fields = [
            'id', 'uuid_publico', 'cliente_nombre', 'cliente_telefono', 'cliente_email', 
            'presupuesto_estimado', 'tipo_proyecto', 'modelo_base', 'superficie_m2', 
            'costo_base_casa', 'requiere_nivelacion', 'costo_nivelacion', 
            'distancia_terreno_km', 'costo_logistica', 'costo_total', 'estado', 
            'fecha_creacion', 'fecha_actualizacion'
        ]
        
    @staticmethod
    def resolve_modelo_base_detalle(obj):
        if obj.modelo_base:
            return obj.modelo_base
        return None

class CrearCotizacionSchema(Schema):
    cliente_nombre: str
    cliente_telefono: Optional[str] = ""
    cliente_email: Optional[str] = ""
    presupuesto_estimado: Optional[float] = None
    
    tipo_proyecto: str = "Personalizado"
    modelo_base_id: Optional[int] = None
    superficie_m2: float
    
    costo_base_casa: float = 0
    requiere_nivelacion: bool = False
    costo_nivelacion: float = 0
    distancia_terreno_km: float = 0
    costo_logistica: float = 0

class UpdateHitoSchema(Schema):
    estado: str # 'Pendiente' o 'Pagado'
