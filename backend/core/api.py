import jwt
from datetime import datetime, timedelta, timezone as tz
from django.conf import settings
from ninja.security import HttpBearer
from django.contrib.auth import authenticate
from ninja import Router
from django.shortcuts import get_object_or_404
from django.db import transaction
import uuid

from .models import (Usuario, Cliente, Cotizacion, Contrato, HitoPago)
from .schemas import (LoginSchema, TokenSchema, MessageSchema, 
                      CotizacionSchema, CotizacionPublicaSchema, CrearCotizacionSchema)

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
        'username': user.nombre_usuario,
        'exp': datetime.now(tz.utc) + timedelta(days=1),
        'iat': datetime.now(tz.utc)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

@router.post("/auth/login", response={200: TokenSchema, 401: MessageSchema})
def login(request, data: LoginSchema):
    user = authenticate(username=data.nombre_usuario, password=data.password)
    if user is not None:
        token = create_jwt_token(user)
        return 200, {"token": token}
    return 401, {"message": "Credenciales inválidas"}

@router.get("/cotizaciones/", response=list[CotizacionSchema], auth=AuthBearer())
def listar_cotizaciones(request):
    return Cotizacion.objects.select_related('cliente').all().order_by('-fecha_emision')

@router.post("/cotizaciones/", response={200: CotizacionSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_cotizacion(request, data: CrearCotizacionSchema):
    try:
        with transaction.atomic():
            # 1. Obtener o crear Cliente
            cliente, created = Cliente.objects.get_or_create(
                telefono_whatsapp=data.cliente_telefono,
                defaults={
                    'nombre_completo': data.cliente_nombre,
                    'correo_electronico': data.cliente_email,
                    'comuna_residencia': data.cliente_comuna
                }
            )

            # 2. Calcular monto total (Global)
            monto_total_bruto = data.costo_base_casa_global + data.costo_logistica_global
            if data.requiere_nivelacion:
                monto_total_bruto += data.costo_nivelacion_global

            # 3. Obtener el usuario activo
            usuario = Usuario.objects.get(nombre_usuario=request.auth)

            # 4. Crear Cotización
            folio_id = f"COT-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:4].upper()}"
            cotizacion = Cotizacion.objects.create(
                folio=folio_id,
                cliente=cliente,
                usuario_generador=usuario,
                superficie_m2=data.superficie_m2,
                tipo_base=data.tipo_base,
                tipo_revestimiento_exterior=data.tipo_revestimiento_exterior,
                tipo_cubierta=data.tipo_cubierta,
                requiere_nivelacion=data.requiere_nivelacion,
                distancia_traslado_km=data.distancia_traslado_km,
                monto_total_bruto=monto_total_bruto,
                estado='Enviada'
            )

            # 5. Crear Contrato
            contrato = Contrato.objects.create(
                cotizacion=cotizacion,
                monto_total_pactado=monto_total_bruto
            )

            # 6. Crear los 3 Hitos de Pago (40, 30, 30)
            HitoPago.objects.create(
                contrato=contrato,
                numero_hito=1,
                nombre_fase='ANTICIPO_INICIO_FAENA_40',
                porcentaje_exigido=40.00,
                monto_esperado=float(monto_total_bruto) * 0.40,
                estado_pago='PENDIENTE'
            )
            HitoPago.objects.create(
                contrato=contrato,
                numero_hito=2,
                nombre_fase='AVANCE_50_ESTRUCTURA_30',
                porcentaje_exigido=30.00,
                monto_esperado=float(monto_total_bruto) * 0.30,
                estado_pago='PENDIENTE'
            )
            HitoPago.objects.create(
                contrato=contrato,
                numero_hito=3,
                nombre_fase='RECEPCION_ENTREGA_LLAVES_30',
                porcentaje_exigido=30.00,
                monto_esperado=float(monto_total_bruto) * 0.30,
                estado_pago='PENDIENTE'
            )
            
            return 200, cotizacion
    except Exception as e:
        return 400, {"message": str(e)}

@router.get("/cotizaciones/public/{uuid_publico}", response={200: CotizacionPublicaSchema, 404: MessageSchema})
def obtener_cotizacion_publica(request, uuid_publico: str):
    try:
        cotizacion = Cotizacion.objects.select_related('cliente', 'contrato').prefetch_related('contrato__hitos').get(uuid_publico=uuid_publico)
        return 200, cotizacion
    except Cotizacion.DoesNotExist:
        return 404, {"message": "Cotización no encontrada"}

from .models import ProyectoRealizado
from .schemas import ProyectoRealizadoSchema
from typing import List

@router.get("/portafolio/", response=List[ProyectoRealizadoSchema])
def listar_portafolio(request):
    return ProyectoRealizado.objects.filter(esta_publicado=True).prefetch_related('fotos').order_by('-fecha_publicacion')

from .models import Proveedor, Insumo
from .schemas import ProveedorSchema, ProveedorInSchema, InsumoSchema, InsumoInSchema
from django.db.models import F

# --- CRUD Proveedores ---
@router.get("/proveedores/", response=List[ProveedorSchema], auth=AuthBearer())
def listar_proveedores(request):
    return Proveedor.objects.all().order_by('razon_social')

@router.post("/proveedores/", response={200: ProveedorSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_proveedor(request, data: ProveedorInSchema):
    try:
        proveedor = Proveedor.objects.create(**data.dict())
        return 200, proveedor
    except Exception as e:
        return 400, {"message": str(e)}

@router.put("/proveedores/{proveedor_id}", response={200: ProveedorSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def actualizar_proveedor(request, proveedor_id: int, data: ProveedorInSchema):
    try:
        proveedor = Proveedor.objects.get(id=proveedor_id)
        for attr, value in data.dict().items():
            setattr(proveedor, attr, value)
        proveedor.save()
        return 200, proveedor
    except Proveedor.DoesNotExist:
        return 404, {"message": "Proveedor no encontrado"}
    except Exception as e:
        return 400, {"message": str(e)}

@router.delete("/proveedores/{proveedor_id}", response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def eliminar_proveedor(request, proveedor_id: int):
    try:
        proveedor = Proveedor.objects.get(id=proveedor_id)
        proveedor.delete()
        return 200, {"message": "Proveedor eliminado"}
    except Proveedor.DoesNotExist:
        return 404, {"message": "Proveedor no encontrado"}
    except Exception as e:
        return 400, {"message": f"No se puede eliminar: {str(e)}"}

# --- CRUD Insumos (Catálogo de Inventario) ---
@router.get("/insumos/", response=List[InsumoSchema], auth=AuthBearer())
def listar_insumos(request):
    return Insumo.objects.select_related('proveedor').all().order_by('nombre_material')

@router.post("/insumos/", response={200: InsumoSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_insumo(request, data: InsumoInSchema):
    try:
        insumo = Insumo.objects.create(**data.dict())
        return 200, insumo
    except Exception as e:
        return 400, {"message": str(e)}

@router.put("/insumos/{insumo_id}", response={200: InsumoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def actualizar_insumo(request, insumo_id: int, data: InsumoInSchema):
    try:
        insumo = Insumo.objects.get(id=insumo_id)
        for attr, value in data.dict().items():
            setattr(insumo, attr, value)
        insumo.save()
        return 200, insumo
    except Insumo.DoesNotExist:
        return 404, {"message": "Insumo no encontrado"}
    except Exception as e:
        return 400, {"message": str(e)}

@router.delete("/insumos/{insumo_id}", response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def eliminar_insumo(request, insumo_id: int):
    try:
        insumo = Insumo.objects.get(id=insumo_id)
        insumo.delete()
        return 200, {"message": "Insumo eliminado"}
    except Insumo.DoesNotExist:
        return 404, {"message": "Insumo no encontrado"}
    except Exception as e:
        return 400, {"message": f"No se puede eliminar: {str(e)}"}

@router.get("/insumos/alertas/", response=List[InsumoSchema], auth=AuthBearer())
def alertas_insumos(request):
    # Fila donde el stock_actual es <= stock_minimo_seguridad
    return Insumo.objects.select_related('proveedor').filter(stock_actual__lte=F('stock_minimo_seguridad')).order_by('stock_actual')
