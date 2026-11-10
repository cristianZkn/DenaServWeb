import logging
import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
import uuid
from datetime import datetime, timedelta, timezone as tz, date
from typing import List, Optional
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.security import HttpBearer

from .models import (
    Usuario, Proveedor, CatalogoTipo, Cotizacion,
    DetalleCotizacionInsumo, HitoPago, ObraEjecucion, PortafolioProyecto, CambioCotizacion
)
from .schemas import (
    GoogleAuthInSchema, TokenSchema, MessageSchema, UsuarioSchema,
    ProveedorSchema, ProveedorInSchema,
    CatalogoTipoSchema, CatalogoTipoInSchema,
    CotizacionSchema, CotizacionInSchema, CotizacionDetalladaSchema, CotizacionEstadoUpdateSchema,
    DetalleCotizacionInsumoSchema, DetalleCotizacionInsumoInSchema,
    HitoPagoSchema, HitoPagoUpdateSchema,
    ObraEjecucionSchema, ObraEjecucionInSchema,
    PortafolioProyectoSchema, PortafolioProyectoInSchema, CalculoInSchema, GananciasSchema, NivelacionInSchema,
    CotizacionPublicaSchema, CotizacionEditSchema, CambioCotizacionSchema
)
from . import calculo, precios


def _neto(item):
    """Costo neto unitario aplicando el descuento del proveedor (convenio)."""
    if not item:
        return Decimal(0)
    d = item.proveedor.descuento_pct if item.proveedor else 0
    return calculo.costo_neto(item.precio_base_unitario, d)


def _precio_minimo(categoria):
    """Precio neto por m² del ítem activo más económico de la categoría (referencia 'casa económica')."""
    precios_ = [_neto(i) for i in CatalogoTipo.objects.select_related('proveedor').filter(categoria=categoria, activo=True)]
    precios_ = [x for x in precios_ if x > 0]
    return min(precios_) if precios_ else None


def _calcular_desde_catalogo(data):
    """Resuelve precios e insumos desde la BD y ejecuta el motor."""
    get = lambda i: CatalogoTipo.objects.select_related('proveedor').filter(id=i).first() if i else None
    insumos_db = list(CatalogoTipo.objects.select_related('proveedor').filter(
        categoria='INSUMO', activo=True, rendimiento_m2__gt=0))
    insumos = [{'id': i.id, 'nombre': i.nombre, 'unidad': i.unidad_medida, 'etapa': i.etapa_obra,
                'rendimiento': i.rendimiento_m2, 'precio_neto': _neto(i)} for i in insumos_db]
    return calculo.calcular(
        m2=data.superficie_m2, km=data.distancia_km,
        precio_base_m2=_neto(get(data.base_terreno_id)), precio_revest_m2=_neto(get(data.revestimiento_id)),
        base_min_m2=_precio_minimo('BASE_TERRENO'), revest_min_m2=_precio_minimo('REVESTIMIENTO'),
        separacion_cm=data.separacion_cm, ganancia_m2=data.ganancia_m2, m2_vigas_vista=data.m2_vigas_vista, insumos=insumos,
        tipo_proyecto=data.tipo_proyecto, radier_m2=data.radier_m2)


def _repartir_en_hitos(cot, delta) -> bool:
    """Reparte `delta` entre los hitos aún PENDIENTES en proporción a su porcentaje (el último absorbe el redondeo).
    False si hay diferencia pero no queda ningún hito pendiente."""
    if not delta:
        return True
    pendientes = list(cot.hitos_pago.filter(estado="PENDIENTE").order_by("id"))
    if not pendientes:
        return False
    pesos = sum(h.porcentaje for h in pendientes) or Decimal(1)
    asignado = Decimal(0)
    for i, h in enumerate(pendientes):
        parte = delta - asignado if i == len(pendientes) - 1 else (delta * h.porcentaje / pesos).quantize(Decimal("1"))
        h.monto_pago += parte
        asignado += parte
        h.save(update_fields=["monto_pago"])
    return True


router = Router()
logger = logging.getLogger(__name__)


# --- Seguridad & JWT ---
class AuthBearer(HttpBearer):
    def authenticate(self, request, token):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user = Usuario.objects.filter(id=payload.get("user_id"), activo=True).first()
            return user
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, Exception):
            return None


def create_jwt_token(usuario: Usuario) -> str:
    payload = {
        "user_id": usuario.id,
        "email": usuario.email,
        "nombre": usuario.nombre_completo,
        "exp": datetime.now(tz.utc) + timedelta(days=7),
        "iat": datetime.now(tz.utc)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


# ==============================================================================
# 1. AUTENTICACIÓN (Google SSO)
# ==============================================================================
@router.post("/auth/google", response={200: TokenSchema, 401: MessageSchema, 403: MessageSchema})
def google_sso_login(request, data: GoogleAuthInSchema):
    email, nombre_completo, google_id = None, data.nombre_completo, data.google_id

    if data.credential:
        # Se verifica firma, audiencia (client id), expiración y emisor del ID token de Google.
        if not settings.GOOGLE_CLIENT_ID:
            return 401, {"message": "Login con Google no configurado en el servidor."}
        try:
            info = google_id_token.verify_oauth2_token(
                data.credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10)  # tolera pequeño desfase del reloj local vs Google
        except ValueError as e:
            logger.warning("Token de Google rechazado: %s", e)
            return 401, {"message": "Token de Google inválido."}
        if not info.get("email_verified"):
            return 401, {"message": "El correo de Google no está verificado."}
        email, nombre_completo, google_id = info["email"], info.get("name"), info["sub"]
    elif settings.DEBUG and not settings.GOOGLE_CLIENT_ID:
        # Solo desarrollo local: login simulado con el email enviado.
        email = data.email
    if not email:
        return 401, {"message": "Autenticación requerida."}

    # Solo ingresan correos previamente registrados y autorizados (RBAC del informe).
    usuario = Usuario.objects.filter(email__iexact=email).first()
    if not usuario or not usuario.activo:
        return 403, {"message": "Correo no autorizado."}
    if google_id and usuario.google_id != google_id and data.credential:
        usuario.google_id = google_id
        usuario.save(update_fields=["google_id"])

    token = create_jwt_token(usuario)
    return 200, {"token": token, "usuario": usuario}


@router.get("/auth/me", response={200: UsuarioSchema, 401: MessageSchema}, auth=AuthBearer())
def current_user(request):
    if not request.auth:
        return 401, {"message": "No autenticado"}
    return 200, request.auth


# ==============================================================================
# 2. PROVEEDORES
# ==============================================================================
@router.get("/proveedores/", response=List[ProveedorSchema], auth=AuthBearer())
def listar_proveedores(request):
    return Proveedor.objects.all().order_by("razon_social")


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
        return 200, {"message": "Proveedor eliminado correctamente"}
    except Proveedor.DoesNotExist:
        return 404, {"message": "Proveedor no encontrado"}
    except Exception as e:
        return 400, {"message": f"No se puede eliminar: {str(e)}"}


# ==============================================================================
# 3. CATALOGO_TIPO (Unificación de todos los "Tipos")
# ==============================================================================
@router.get("/catalogo-tipos/", response=List[CatalogoTipoSchema], auth=AuthBearer())
def listar_catalogo_tipos(request, categoria: Optional[str] = None, activo: Optional[bool] = None):
    qs = CatalogoTipo.objects.select_related("proveedor").all()
    if categoria:
        qs = qs.filter(categoria__iexact=categoria)
    if activo is not None:
        qs = qs.filter(activo=activo)
    return qs.order_by("categoria", "nombre")


@router.get("/catalogo-tipos/categorias/", response=List[str], auth=AuthBearer())
def listar_categorias_disponibles(request):
    categorias = CatalogoTipo.objects.values_list("categoria", flat=True).distinct()
    return list(categorias)


@router.post("/catalogo-tipos/actualizar-precios/", response={202: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def actualizar_precios_catalogo(request):
    if not precios.iniciar_sincronizacion():
        return 409, {"message": "Ya hay una sincronización en curso."}
    return 202, {"message": "Sincronización iniciada."}


@router.get("/catalogo-tipos/actualizar-precios/estado/", response=dict, auth=AuthBearer())
def estado_actualizacion_precios(request):
    return precios.estado_sincronizacion()


@router.post("/catalogo-tipos/", response={200: CatalogoTipoSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_catalogo_tipo(request, data: CatalogoTipoInSchema):
    try:
        catalogo = CatalogoTipo.objects.create(**data.dict())
        return 200, catalogo
    except Exception as e:
        return 400, {"message": str(e)}


@router.put("/catalogo-tipos/{catalogo_id}", response={200: CatalogoTipoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def actualizar_catalogo_tipo(request, catalogo_id: int, data: CatalogoTipoInSchema):
    try:
        catalogo = CatalogoTipo.objects.get(id=catalogo_id)
        for attr, value in data.dict().items():
            setattr(catalogo, attr, value)
        catalogo.save()
        return 200, catalogo
    except CatalogoTipo.DoesNotExist:
        return 404, {"message": "Elemento de catálogo no encontrado"}
    except Exception as e:
        return 400, {"message": str(e)}


@router.delete("/catalogo-tipos/{catalogo_id}", response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def eliminar_catalogo_tipo(request, catalogo_id: int):
    try:
        catalogo = CatalogoTipo.objects.get(id=catalogo_id)
        catalogo.delete()
        return 200, {"message": "Elemento de catálogo eliminado correctamente"}
    except CatalogoTipo.DoesNotExist:
        return 404, {"message": "Elemento de catálogo no encontrado"}
    except Exception as e:
        return 400, {"message": f"No se puede eliminar: {str(e)}"}


# ==============================================================================
# 4. COTIZACIONES
# ==============================================================================
@router.get("/cotizaciones/", response=List[CotizacionSchema], auth=AuthBearer())
def listar_cotizaciones(request):
    return Cotizacion.objects.select_related("base_terreno", "revestimiento", "usuario").all().order_by("-fecha_creacion")


@router.post("/cotizaciones/", response={200: CotizacionSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_cotizacion(request, data: CotizacionInSchema):
    try:
        with transaction.atomic():
            usuario = request.auth
            codigo = f"COT-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:10].upper()}"

            # El backend recalcula todo: no se confía en los montos enviados por el cliente.
            r = _calcular_desde_catalogo(CalculoInSchema(
                superficie_m2=data.superficie_m2, distancia_km=data.distancia_flete_km,
                base_terreno_id=data.base_terreno_id, revestimiento_id=data.revestimiento_id,
                ganancia_m2=data.ganancia_m2, m2_vigas_vista=data.m2_vigas_vista,
                tipo_proyecto=data.tipo_proyecto, radier_m2=data.radier_m2))

            cotizacion = Cotizacion.objects.create(
                codigo_cotizacion=codigo,
                cliente_nombre=data.cliente_nombre,
                cliente_telefono=data.cliente_telefono,
                direccion_terreno=data.direccion_terreno,
                superficie_m2=data.superficie_m2,
                distancia_flete_km=data.distancia_flete_km,
                base_terreno_id=data.base_terreno_id,
                revestimiento_id=data.revestimiento_id,
                costo_materiales=r["costo_materiales_total"],
                costo_mano_obra=r["costo_mano_obra"],
                costo_flete=r["costo_flete"],
                costo_total=r["total"],
                estado=data.estado or "BORRADOR",
                tipo_proyecto=data.tipo_proyecto,
                ganancia_m2=data.ganancia_m2 if data.ganancia_m2 is not None else calculo.DEFAULTS["ganancia_m2"],
                m2_vigas_vista=data.m2_vigas_vista,
                radier_m2=data.radier_m2 if data.radier_m2 is not None else calculo.DEFAULTS["radier_m2"],
                usuario=request.auth
            )

            DetalleCotizacionInsumo.objects.bulk_create([
                DetalleCotizacionInsumo(cotizacion=cotizacion, catalogo_tipo_id=i["id"], etapa_obra=i["etapa"],
                                        cantidad_calculada=i["cantidad"], subtotal_costo=i["subtotal"])
                for i in r["insumos"]])

            # Hitos 40/30/30 en Decimal; el último absorbe el redondeo.
            for fase, pct, monto in calculo.hitos(r["total"]):
                HitoPago.objects.create(
                    cotizacion=cotizacion, fase=fase, porcentaje=pct, monto_pago=monto, estado="PENDIENTE"
                )

            # Inicializar ficha de seguimiento de obra
            ObraEjecucion.objects.create(
                cotizacion=cotizacion,
                porcentaje_avance_real=0.00,
                gasto_real_acumulado=0.00,
                fecha_ultima_actualizacion=date.today(),
                observaciones="Obra creada a partir de cotización inicial."
            )

            return 200, cotizacion
    except Exception as e:
        return 400, {"message": str(e)}


@router.post("/cotizaciones/calcular", response={200: dict, 400: MessageSchema}, auth=AuthBearer())
def calcular_cotizacion(request, data: CalculoInSchema):
    try:
        return 200, _calcular_desde_catalogo(data)
    except ValueError as e:
        return 400, {"message": str(e)}


@router.get("/cotizaciones/{cotizacion_id}/", response={200: CotizacionDetalladaSchema, 404: MessageSchema}, auth=AuthBearer())
def obtener_cotizacion_detalle(request, cotizacion_id: int):
    try:
        cotizacion = Cotizacion.objects.select_related(
            "base_terreno", "revestimiento", "usuario"
        ).prefetch_related(
            "hitos_pago", "detalles_insumo__catalogo_tipo", "obras_ejecucion"
        ).get(id=cotizacion_id)
        return 200, cotizacion
    except Cotizacion.DoesNotExist:
        return 404, {"message": "Cotización no encontrada"}


@router.patch("/cotizaciones/{cotizacion_id}/estado", response={200: CotizacionSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def actualizar_estado_cotizacion(request, cotizacion_id: int, data: CotizacionEstadoUpdateSchema):
    try:
        cotizacion = Cotizacion.objects.get(id=cotizacion_id)
        cotizacion.estado = data.estado
        cotizacion.save(update_fields=["estado"])
        return 200, cotizacion
    except Cotizacion.DoesNotExist:
        return 404, {"message": "Cotización no encontrada"}
    except Exception as e:
        return 400, {"message": str(e)}


@router.post("/cotizaciones/{cotizacion_id}/nivelacion", response={200: dict, 404: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def definir_nivelacion(request, cotizacion_id: int, data: NivelacionInSchema):
    """Tras la visita al terreno: cubica el estabilizado y, si lo pone la empresa, lo suma al valor ya informado."""
    cot = Cotizacion.objects.filter(id=cotizacion_id).first()
    if not cot:
        return 404, {"message": "Cotización no encontrada"}
    n = calculo.nivelacion(data.superficie_m2 or cot.superficie_m2, data.espesor_cm, data.arido_empresa)
    delta = n["costo"] - cot.costo_nivelacion
    resultado = {"m3": n["m3"], "costo": n["costo"], "modalidad": n["modalidad"], "total_nuevo": cot.costo_total + delta}
    if not data.aplicar:
        return 200, resultado
    with transaction.atomic():
        if not _repartir_en_hitos(cot, delta):
            return 409, {"message": "Todos los hitos están pagados: no se puede ajustar el valor."}
        cot.nivelacion_modalidad, cot.nivelacion_m3, cot.costo_nivelacion = n["modalidad"], n["m3"], n["costo"]
        cot.costo_total += delta
        cot.save(update_fields=["nivelacion_modalidad", "nivelacion_m3", "costo_nivelacion", "costo_total"])
    return 200, resultado


_CAMPOS_PRECIO = {"superficie_m2", "distancia_flete_km", "base_terreno_id", "revestimiento_id",
                  "m2_vigas_vista", "ganancia_m2", "radier_m2", "ajuste_monto"}
_CAMPOS_DECIMAL = {"superficie_m2", "distancia_flete_km", "m2_vigas_vista", "ganancia_m2", "radier_m2", "ajuste_monto"}


@router.patch("/cotizaciones/{cotizacion_id}/", response={200: dict, 400: MessageSchema, 404: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def editar_cotizacion(request, cotizacion_id: int, data: CotizacionEditSchema):
    """Edita una cotización ya emitida y reajusta el monto total. La diferencia se reparte entre los hitos pendientes
    y queda registrada (con motivo) en el historial de cambios."""
    cot = Cotizacion.objects.filter(id=cotizacion_id).first()
    if not cot:
        return 404, {"message": "Cotización no encontrada"}
    cambios = data.dict(exclude_unset=True)
    aplicar, motivo = cambios.pop("aplicar", False), (cambios.pop("motivo", None) or "").strip()
    for k, v in cambios.items():
        setattr(cot, k, Decimal(str(v)) if k in _CAMPOS_DECIMAL and v is not None else v)

    total_anterior = Cotizacion.objects.get(id=cotizacion_id).costo_total
    nuevo_total = cot.costo_total
    if _CAMPOS_PRECIO & cambios.keys():
        try:
            r = _calcular_desde_catalogo(CalculoInSchema(
                superficie_m2=float(cot.superficie_m2), distancia_km=float(cot.distancia_flete_km),
                base_terreno_id=cot.base_terreno_id, revestimiento_id=cot.revestimiento_id,
                ganancia_m2=float(cot.ganancia_m2), m2_vigas_vista=float(cot.m2_vigas_vista),
                tipo_proyecto=cot.tipo_proyecto, radier_m2=float(cot.radier_m2)))
        except ValueError as e:
            return 400, {"message": str(e)}
        cot.costo_materiales, cot.costo_mano_obra, cot.costo_flete = (
            r["costo_materiales_total"], r["costo_mano_obra"], r["costo_flete"])
        nuevo_total = r["total"] + cot.costo_nivelacion + cot.ajuste_monto
    delta = nuevo_total - total_anterior
    resultado = {"total_anterior": total_anterior, "total_nuevo": nuevo_total, "diferencia": delta}
    if not aplicar:
        return 200, resultado
    if delta and not motivo:
        return 400, {"message": "Indique el motivo del reajuste del monto."}
    with transaction.atomic():
        if not _repartir_en_hitos(cot, delta):
            return 409, {"message": "Todos los hitos están pagados: no se puede reajustar el monto."}
        cot.costo_total = nuevo_total
        cot.save()
        if delta:
            CambioCotizacion.objects.create(cotizacion=cot, usuario=request.auth, total_anterior=total_anterior,
                                            total_nuevo=nuevo_total, motivo=motivo[:255])
    return 200, resultado


@router.get("/cotizaciones/{cotizacion_id}/cambios/", response=List[CambioCotizacionSchema], auth=AuthBearer())
def historial_cambios(request, cotizacion_id: int):
    return [{"id": c.id, "fecha": c.fecha, "usuario": c.usuario.nombre_completo, "total_anterior": c.total_anterior,
             "total_nuevo": c.total_nuevo, "motivo": c.motivo}
            for c in CambioCotizacion.objects.select_related("usuario").filter(cotizacion_id=cotizacion_id)]


@router.get("/cotizaciones/public/{token}", response={200: CotizacionPublicaSchema, 404: MessageSchema})
def obtener_cotizacion_publica(request, token: uuid.UUID):
    try:
        cotizacion = Cotizacion.objects.select_related(
            "base_terreno", "revestimiento", "usuario"
        ).prefetch_related(
            "hitos_pago", "detalles_insumo__catalogo_tipo", "obras_ejecucion"
        ).get(token_publico=token)
        return 200, cotizacion
    except Cotizacion.DoesNotExist:
        return 404, {"message": "Cotización no encontrada"}


# ==============================================================================
# 5. DETALLE COTIZACIÓN INSUMO
# ==============================================================================
@router.post("/cotizaciones/{cotizacion_id}/insumos/", response={200: DetalleCotizacionInsumoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def agregar_insumo_cotizacion(request, cotizacion_id: int, data: DetalleCotizacionInsumoInSchema):
    try:
        cotizacion = Cotizacion.objects.get(id=cotizacion_id)
        detalle = DetalleCotizacionInsumo.objects.create(
            cotizacion=cotizacion,
            catalogo_tipo_id=data.catalogo_tipo_id,
            etapa_obra=data.etapa_obra,
            cantidad_calculada=data.cantidad_calculada,
            subtotal_costo=data.subtotal_costo
        )
        return 200, detalle
    except Cotizacion.DoesNotExist:
        return 404, {"message": "Cotización no encontrada"}
    except Exception as e:
        return 400, {"message": str(e)}


# ==============================================================================
# 6. HITOS DE PAGO
# ==============================================================================
@router.get("/cotizaciones/{cotizacion_id}/hitos/", response=List[HitoPagoSchema], auth=AuthBearer())
def listar_hitos_cotizacion(request, cotizacion_id: int):
    return HitoPago.objects.filter(cotizacion_id=cotizacion_id).order_by("id")


@router.patch("/hitos-pago/{hito_id}/", response={200: HitoPagoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def actualizar_hito_pago(request, hito_id: int, data: HitoPagoUpdateSchema):
    try:
        hito = HitoPago.objects.get(id=hito_id)
        if data.estado is not None:
            hito.estado = data.estado
        if data.fecha_pago is not None:
            hito.fecha_pago = data.fecha_pago
        elif data.estado == "PAGADO" and not hito.fecha_pago:
            hito.fecha_pago = date.today()
        if data.comprobante_ref is not None:
            hito.comprobante_ref = data.comprobante_ref
        hito.save()
        return 200, hito
    except HitoPago.DoesNotExist:
        return 404, {"message": "Hito de pago no encontrado"}
    except Exception as e:
        return 400, {"message": str(e)}


# ==============================================================================
# 7. OBRA EJECUCIÓN
# ==============================================================================
@router.get("/cotizaciones/{cotizacion_id}/obra/", response={200: ObraEjecucionSchema, 404: MessageSchema}, auth=AuthBearer())
def obtener_obra_cotizacion(request, cotizacion_id: int):
    obra = ObraEjecucion.objects.filter(cotizacion_id=cotizacion_id).first()
    if not obra:
        return 404, {"message": "No hay registro de ejecución para esta cotización"}
    return 200, obra


@router.get("/cotizaciones/{cotizacion_id}/ganancias/", response={200: GananciasSchema, 404: MessageSchema}, auth=AuthBearer())
def resumen_ganancias(request, cotizacion_id: int):
    """vista_resumen_ganancias: neto cobrado vs costo presupuestado vs gasto real."""
    c = Cotizacion.objects.filter(id=cotizacion_id).first()
    obra = ObraEjecucion.objects.filter(cotizacion_id=cotizacion_id).first()
    if not c or not obra:
        return 404, {"message": "Cotización u obra no encontrada"}
    neto = (c.costo_total / Decimal("1.19")).quantize(Decimal("1"))
    presupuestado = ((c.costo_materiales + c.costo_mano_obra + c.costo_flete + c.costo_nivelacion) / Decimal("1.19")).quantize(Decimal("1"))
    return 200, {
        "neto_cobrado": neto, "costo_presupuestado": presupuestado, "gasto_real": obra.gasto_real_acumulado,
        "ganancia_estimada": neto - presupuestado, "ganancia_real": neto - obra.gasto_real_acumulado,
        "avance_real": obra.porcentaje_avance_real,
        "hito_avance_exigible": obra.porcentaje_avance_real >= 50,  # Hito 2 (30%) se cobra al 50% de avance
    }


@router.patch("/obras/{obra_id}/", response={200: ObraEjecucionSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def actualizar_obra(request, obra_id: int, data: ObraEjecucionInSchema):
    try:
        obra = ObraEjecucion.objects.get(id=obra_id)
        for attr, value in data.dict(exclude_unset=True).items():
            if value is not None:
                setattr(obra, attr, value)
        obra.save()
        return 200, obra
    except ObraEjecucion.DoesNotExist:
        return 404, {"message": "Obra no encontrada"}
    except Exception as e:
        return 400, {"message": str(e)}


# ==============================================================================
# 8. PORTAFOLIO PROYECTO
# ==============================================================================
@router.get("/portafolio/", response=List[PortafolioProyectoSchema])
def listar_portafolio(request):
    return PortafolioProyecto.objects.select_related("cotizacion__revestimiento").filter(publicado=True).order_by("-id")


@router.post("/portafolio/", response={200: PortafolioProyectoSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_proyecto_portafolio(request, data: PortafolioProyectoInSchema):
    try:
        proyecto = PortafolioProyecto.objects.create(**data.dict())
        return 200, proyecto
    except Exception as e:
        return 400, {"message": str(e)}
