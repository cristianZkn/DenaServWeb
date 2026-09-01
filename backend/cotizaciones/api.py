import jwt
from datetime import datetime, timedelta, timezone as tz
from django.conf import settings
from ninja.security import HttpBearer
from django.contrib.auth import authenticate
from .models import Cotizacion, HitoPago, ModeloCasa
from .schemas import (CotizacionSchema, CrearCotizacionSchema, 
                      LoginSchema, TokenSchema, MessageSchema, UpdateHitoSchema)
from ninja import Router
from django.shortcuts import get_object_or_404
from django.utils import timezone

router = Router()

class AuthBearer(HttpBearer):
    def authenticate(self, request, token):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            return payload['username']
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

def create_jwt_token(user):
    payload = {
        'username': user.username,
        'exp': datetime.now(tz.utc) + timedelta(days=1),
        'iat': datetime.now(tz.utc)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

@router.post("/auth/login", response={200: TokenSchema, 401: MessageSchema})
def login(request, data: LoginSchema):
    user = authenticate(username=data.username, password=data.password)
    if user is not None:
        token = create_jwt_token(user)
        return 200, {"token": token}
    return 401, {"message": "Credenciales inválidas"}

@router.post("/cotizaciones/", response=CotizacionSchema, auth=AuthBearer())
def create_cotizacion(request, payload: CrearCotizacionSchema):
    # Calcular totales
    costo_total = payload.costo_base_casa + payload.costo_nivelacion + payload.costo_logistica
    
    # Crear la cotizacion
    modelo = ModeloCasa.objects.get(id=payload.modelo_base_id) if payload.modelo_base_id else None
    
    cotizacion = Cotizacion.objects.create(
        cliente_nombre=payload.cliente_nombre,
        cliente_telefono=payload.cliente_telefono,
        cliente_email=payload.cliente_email,
        presupuesto_estimado=payload.presupuesto_estimado,
        tipo_proyecto=payload.tipo_proyecto,
        modelo_base=modelo,
        superficie_m2=payload.superficie_m2,
        costo_base_casa=payload.costo_base_casa,
        requiere_nivelacion=payload.requiere_nivelacion,
        costo_nivelacion=payload.costo_nivelacion,
        distancia_terreno_km=payload.distancia_terreno_km,
        costo_logistica=payload.costo_logistica,
        costo_total=costo_total,
    )

    # Crear Hitos Automáticos (40%, 30%, 30%)
    HitoPago.objects.create(
        cotizacion=cotizacion,
        nombre="40% Inicio",
        porcentaje=40,
        monto=costo_total * 0.40,
        detalle_cobertura="Materiales de obra gruesa, radier y preparativos iniciales."
    )
    HitoPago.objects.create(
        cotizacion=cotizacion,
        nombre="30% Medio Camino",
        porcentaje=30,
        monto=costo_total * 0.30,
        detalle_cobertura="Terminaciones, techumbre e instalación de servicios."
    )
    HitoPago.objects.create(
        cotizacion=cotizacion,
        nombre="30% Entrega Final",
        porcentaje=30,
        monto=costo_total * 0.30,
        detalle_cobertura="Detalles finales y entrega de llaves en mano."
    )

    return cotizacion

@router.get("/cotizaciones/", response=list[CotizacionSchema], auth=AuthBearer())
def list_cotizaciones(request):
    return Cotizacion.objects.all().order_by('-fecha_creacion')

@router.get("/cotizaciones/public/{uuid}", response=CotizacionSchema)
def get_cotizacion_public(request, uuid: str):
    return get_object_or_404(Cotizacion, uuid_publico=uuid)

@router.put("/cotizaciones/{cotizacion_id}/hitos/{hito_id}", response=MessageSchema, auth=AuthBearer())
def update_hito(request, cotizacion_id: int, hito_id: int, data: UpdateHitoSchema):
    hito = get_object_or_404(HitoPago, id=hito_id, cotizacion_id=cotizacion_id)
    hito.estado = data.estado
    if hito.estado == 'Pagado':
        hito.fecha_pago = timezone.now()
    else:
        hito.fecha_pago = None
    hito.save()
    return {"message": "Estado del hito actualizado exitosamente"}
