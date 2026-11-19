import base64
import hmac
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
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.security import APIKeyHeader, HttpBearer

from .models import (
    Usuario, Proveedor, CatalogoTipo, Cotizacion,
    DetalleCotizacionInsumo, HitoPago, ObraEjecucion, PortafolioProyecto, PortafolioImagen, CambioCotizacion, ManoObraLinea,
    BitacoraAvance, BitacoraFoto
)
from .schemas import (
    GoogleAuthInSchema, TokenSchema, MessageSchema, UsuarioSchema, UsuarioInSchema,
    ProveedorSchema, ProveedorInSchema,
    CatalogoTipoSchema, CatalogoTipoInSchema, InsumoSchema,
    CotizacionSchema, CotizacionInSchema, CotizacionDetalladaSchema, CotizacionEstadoUpdateSchema,
    DetalleCotizacionInsumoSchema, DetalleCotizacionInsumoInSchema,
    HitoPagoSchema, HitoPagoUpdateSchema,
    ObraEjecucionSchema, ObraEjecucionInSchema,
    MaterialAdicionalInSchema, ManoObraInSchema, PortafolioProyectoSchema, PortafolioProyectoInSchema, PortafolioProyectoUpdateSchema, ProgresoObraSchema, CalculoInSchema, GananciasSchema, NivelacionInSchema,
    CotizacionPublicaSchema, CotizacionEditSchema, CambioCotizacionSchema,
    BitacoraInSchema, BitacoraFotosInSchema, BitacoraSchema
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
        categoria__in=precios.CATEGORIAS_INSUMO, activo=True, rendimiento_m2__gt=0))
    adicionales = []
    for mat in data.materiales:
        it = CatalogoTipo.objects.select_related('proveedor').filter(id=mat.catalogo_id, activo=True).first()
        if not it:
            raise ValueError("Uno de los materiales de la lista ya no está disponible en el catálogo.")
        adicionales.append({'id': it.id, 'nombre': it.nombre, 'unidad': it.unidad_medida,
                            'cantidad': mat.cantidad, 'precio_neto': _neto(it), 'etapa': it.etapa_obra or 'ETAPA_1',
                            'mano_obra_m2': it.mano_obra_m2})
    insumos = [{'id': i.id, 'nombre': i.nombre, 'unidad': i.unidad_medida, 'etapa': i.etapa_obra,
                'rendimiento': i.rendimiento_m2, 'precio_neto': _neto(i)} for i in insumos_db]
    return calculo.calcular(
        m2=data.superficie_m2, km=data.distancia_km,
        precio_base_m2=_neto(get(data.base_terreno_id)), precio_revest_m2=_neto(get(data.revestimiento_id)),
        base_min_m2=_precio_minimo('BASE_TERRENO'), revest_min_m2=_precio_minimo('REVESTIMIENTO'),
        separacion_cm=data.separacion_cm, ganancia_m2=data.ganancia_m2, m2_vigas_vista=data.m2_vigas_vista, insumos=insumos,
        tipo_proyecto=data.tipo_proyecto, radier_m2=data.radier_m2, adicionales=adicionales,
        maestros=[m.dict() for m in data.maestros], modo_lista=data.modo_lista,
        modo_tarifas=data.modo_tarifas, n_trabajadores=data.n_trabajadores, dias_obra=data.dias_obra,
        lleva_radier=data.lleva_radier, tarifa_radier_m2=data.tarifa_radier_m2, precio_litro=data.precio_litro)


def _repartir_en_hitos(cot, delta) -> bool:
    """Reparte `delta` entre los hitos aún PENDIENTES en proporción a su porcentaje (el último absorbe el redondeo).
    False si hay diferencia pero no queda ningún hito pendiente."""
    if not delta:
        return True
    pendientes = list(cot.hitos_pago.exclude(estado="PAGADO").order_by("id"))
    if not pendientes:
        return False
    pesos = sum(h.porcentaje for h in pendientes) or Decimal(1)
    asignado = Decimal(0)
    for i, h in enumerate(pendientes):
        parte = delta - asignado if i == len(pendientes) - 1 else (delta * h.porcentaje / pesos).quantize(Decimal("1"))
        h.monto_pago += parte
        asignado += parte
        if h.monto_abonado >= h.monto_pago:  # el ajuste bajó el monto por debajo de lo ya abonado
            h.monto_abonado, h.estado = h.monto_pago, "PAGADO"
        h.save(update_fields=["monto_pago", "monto_abonado", "estado"])
    return True


# --- Estado y avance de la obra: se derivan de los pagos para que nunca se contradigan ---
ETIQUETA_ESTADO = {"BORRADOR": "Cotizado", "ACEPTADA": "En ejecución", "FINALIZADA": "Obra terminada"}


def _estado_segun_pagos(hitos) -> str:
    """Cotizado hasta registrar el primer pago (aunque sea parcial); En ejecución desde entonces; Obra terminada al
    completarse TODOS los pagos."""
    if hitos and all(h.estado == "PAGADO" for h in hitos):
        return "FINALIZADA"
    return "ACEPTADA" if any(h.estado != "PENDIENTE" for h in hitos) else "BORRADOR"


def _limites_avance(hitos) -> tuple:
    """(mínimo, máximo) de avance permitido según lo pagado. El 2.º pago corresponde al 50 % de avance y el último al
    100 %: sin el primer pago no hay avance; con solo el anticipo el avance llega hasta 49 %; hasta cobrar el último pago, 99 %."""
    pagado = {h.fase for h in hitos if h.estado == "PAGADO"}
    todos = bool(hitos) and all(h.estado == "PAGADO" for h in hitos)
    maximo = 100 if todos else 99 if "AVANCE_30" in pagado else 49 if any(h.estado != "PENDIENTE" for h in hitos) else 0
    minimo = 100 if todos else 50 if "AVANCE_30" in pagado else 0
    return min(minimo, maximo), maximo


def _obra_de(cot):
    return cot.obras_ejecucion.first() or ObraEjecucion.objects.create(
        cotizacion=cot, porcentaje_avance_real=0, fecha_ultima_actualizacion=date.today())


def _reconciliar(cot):
    """Deja el estado y el avance coherentes con los pagos. Devuelve un mensaje de error si el cambio de pagos
    contradice el avance ya registrado (quien llama debe revertirlo)."""
    hitos = list(HitoPago.objects.filter(cotizacion=cot))
    obra = _obra_de(cot)
    minimo, maximo = _limites_avance(hitos)
    avance = obra.porcentaje_avance_real
    if avance > maximo:
        return f"No se puede cambiar este pago: la obra registra {int(avance)} % de avance y ese avance requiere el pago."
    if avance < minimo:
        obra.porcentaje_avance_real, obra.fecha_ultima_actualizacion = minimo, date.today()
        obra.save(update_fields=["porcentaje_avance_real", "fecha_ultima_actualizacion"])
    estado = _estado_segun_pagos(hitos)
    if cot.estado != estado:
        cot.estado = estado
        cot.save(update_fields=["estado"])
    return None


def _mensaje_tope_avance(maximo) -> str:
    if maximo == 0:
        return "Aún no hay pagos registrados: la obra no ha iniciado. Registre el primer pago para comenzar."
    if maximo == 49:
        return "El avance no puede llegar al 50 % mientras el 2.º pago no esté cobrado completo."
    return "El 100 % de avance se registra al cobrar por completo el último pago."


router = Router()
logger = logging.getLogger(__name__)


# --- Seguridad & JWT ---
class AuthBearer(HttpBearer):
    def authenticate(self, request, token):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user = Usuario.objects.filter(id=payload.get("user_id"), activo=True).first()
            return user
        except Exception as e:  # token vencido/inválido o fallo de BD: se rechaza, pero queda el motivo en el log
            logger.warning("Auth rechazada (%s): %s", type(e).__name__, e)
            return None


class CronToken(APIKeyHeader):
    """Llave del planificador semanal (GitHub Actions): cabecera X-Cron-Token = variable de entorno CRON_TOKEN."""
    param_name = "X-Cron-Token"

    def authenticate(self, request, key):
        esperado = settings.CRON_TOKEN
        return key if esperado and hmac.compare_digest(key.encode(), esperado.encode()) else None


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
# 1b. USUARIOS AUTORIZADOS (correos que pueden ingresar al panel)
# ==============================================================================
@router.get("/usuarios/", response=List[UsuarioSchema], auth=AuthBearer())
def listar_usuarios(request):
    return Usuario.objects.all().order_by("nombre_completo")


def _usuario_duplicado(data, excluir_id=None):
    qs = Usuario.objects.exclude(id=excluir_id) if excluir_id else Usuario.objects.all()
    if qs.filter(email__iexact=data.email).exists():
        return "Ya existe un usuario con ese correo."
    if qs.filter(rut=data.rut).exists():
        return "Ya existe un usuario con ese RUN."
    return None


@router.post("/usuarios/", response={200: UsuarioSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_usuario(request, data: UsuarioInSchema):
    error = _usuario_duplicado(data)
    if error:
        return 400, {"message": error}
    return 200, Usuario.objects.create(**data.dict())


@router.put("/usuarios/{usuario_id}", response={200: UsuarioSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def actualizar_usuario(request, usuario_id: int, data: UsuarioInSchema):
    usuario = Usuario.objects.filter(id=usuario_id).first()
    if not usuario:
        return 404, {"message": "Usuario no encontrado"}
    error = _usuario_duplicado(data, usuario_id)
    if error:
        return 400, {"message": error}
    if usuario.id == request.auth.id and not data.activo:
        return 400, {"message": "No puedes desactivar tu propio acceso."}
    for attr, value in data.dict().items():
        setattr(usuario, attr, value)
    usuario.save()
    return 200, usuario


@router.delete("/usuarios/{usuario_id}", response={200: MessageSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def eliminar_usuario(request, usuario_id: int):
    usuario = Usuario.objects.filter(id=usuario_id).first()
    if not usuario:
        return 404, {"message": "Usuario no encontrado"}
    if usuario.id == request.auth.id:
        return 400, {"message": "No puedes eliminar tu propio acceso."}
    try:
        usuario.delete()
    except Exception:  # tiene cotizaciones u otros registros asociados (FK protegida)
        return 400, {"message": "Tiene registros asociados: desactívalo en lugar de eliminarlo."}
    return 200, {"message": "Usuario eliminado"}


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
        precios.recalcular_netos(proveedor)
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
# --- Precios de mercado (lectura 1 a 1 de las fichas de producto) ---
@router.get("/insumos/", response=List[InsumoSchema], auth=AuthBearer())
def listar_insumos(request, categoria: Optional[str] = None, activo: Optional[bool] = None):
    """Materiales con precio de lista, descuento vigente y costo neto final, filtrables por categoría."""
    qs = CatalogoTipo.objects.select_related("proveedor").all()
    if categoria:
        qs = qs.filter(categoria__iexact=categoria)
    if activo is not None:
        qs = qs.filter(activo=activo)
    out = []
    for it in qs.order_by("categoria", "nombre"):
        desc = it.descuento_pct
        lista = it.precio_lista if it.precio_lista is not None else (it.precio_base_unitario or None)
        neto = it.costo_neto if it.costo_neto is not None else (precios.costo_neto(lista, desc) if lista else None)
        m2 = float(it.m2_por_unidad or 0)
        out.append({
            "id": it.id, "categoria": it.categoria, "nombre": it.nombre, "proveedor_id": it.proveedor_id,
            "proveedor": it.proveedor.razon_social if it.proveedor else None, "unidad_medida": it.unidad_medida,
            "url": it.fuente_url, "sku": it.sku, "precio_base_unitario": it.precio_base_unitario, "precio_lista": lista, "descuento_pct": desc, "costo_neto": neto,
            "m2_por_unidad": m2, "neto_por_m2": float(_neto(it)) if m2 > 0 else None,
            "mano_obra_m2": float(it.mano_obra_m2 or 0),
            "actualizado_en": it.precio_actualizado_en, "verificado": it.verificado, "activo": it.activo,
            "ultimo_error": it.ultimo_error,
        })
    return out


@router.post("/insumos/actualizar-precios", response={202: MessageSchema, 409: MessageSchema},
             auth=[AuthBearer(), CronToken()])
def actualizar_precios_insumos(request):
    """Fuerza la actualización de precios (también la llama el planificador semanal con X-Cron-Token)."""
    if not precios.iniciar_actualizacion():
        return 409, {"message": "Ya hay una actualización en curso."}
    return 202, {"message": "Actualización iniciada."}


@router.get("/insumos/actualizar-precios/estado", response=dict, auth=[AuthBearer(), CronToken()])
def estado_actualizacion_precios(request):
    return {**precios.estado_actualizacion(),
            "ultima_actualizacion": precios.ultima_actualizacion(),
            "grupos_sin_cobertura": precios.grupos_sin_cobertura()}


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


@router.post("/catalogo-tipos/", response={200: CatalogoTipoSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_catalogo_tipo(request, data: CatalogoTipoInSchema):
    try:
        item = CatalogoTipo(**data.dict())
        if item.fuente_url:  # el precio, el proveedor y las medidas salen de la ficha de la tienda
            precios.completar_desde_ficha(item)
        elif not item.nombre:
            return 400, {"message": "Indique el nombre del material."}
        item.save()
        return 200, item
    except Exception as e:
        return 400, {"message": str(e)}


@router.put("/catalogo-tipos/{catalogo_id}", response={200: CatalogoTipoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def actualizar_catalogo_tipo(request, catalogo_id: int, data: CatalogoTipoInSchema):
    try:
        item = CatalogoTipo.objects.get(id=catalogo_id)
        url_antes, verificado_antes = item.fuente_url, item.verificado
        for attr, value in data.dict(exclude_unset=True).items():
            setattr(item, attr, value)
        # Si cambia la ficha o el usuario confirma el producto, se vuelve a leer y se acepta lo que muestre hoy.
        if item.fuente_url and (item.fuente_url != url_antes or (item.verificado and not verificado_antes)):
            item.sku = ""
            precios.completar_desde_ficha(item)
        item.save()
        return 200, item
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
    # El estado nunca se elige: toda cotización nueva queda «Cotizado» y cambia sola con los pagos.
    try:
        with transaction.atomic():
            usuario = request.auth
            codigo = f"COT-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:10].upper()}"

            # El backend recalcula todo: no se confía en los montos enviados por el cliente.
            r = _calcular_desde_catalogo(CalculoInSchema(
                superficie_m2=data.superficie_m2, distancia_km=data.distancia_flete_km,
                base_terreno_id=data.base_terreno_id, revestimiento_id=data.revestimiento_id,
                ganancia_m2=data.ganancia_m2, m2_vigas_vista=data.m2_vigas_vista,
                tipo_proyecto=data.tipo_proyecto, radier_m2=data.radier_m2, materiales=data.materiales,
                maestros=data.maestros, modo_lista=data.modo_lista, modo_tarifas=data.modo_tarifas,
                n_trabajadores=data.n_trabajadores, dias_obra=data.dias_obra, lleva_radier=data.lleva_radier,
                tarifa_radier_m2=data.tarifa_radier_m2, precio_litro=data.precio_litro))

            cotizacion = Cotizacion.objects.create(
                codigo_cotizacion=codigo,
                cliente_nombre=data.cliente_nombre,
                cliente_telefono=data.cliente_telefono,
                cliente_rut=data.cliente_rut,
                direccion_terreno=data.direccion_terreno,
                superficie_m2=data.superficie_m2,
                distancia_flete_km=data.distancia_flete_km,
                base_terreno_id=data.base_terreno_id,
                revestimiento_id=data.revestimiento_id,
                costo_materiales=r["costo_materiales_total"],
                costo_mano_obra=r["costo_mano_obra"],
                costo_flete=r["costo_flete"],
                costo_total=r["total"],
                estado="BORRADOR",
                tipo_proyecto=data.tipo_proyecto,
                ganancia_m2=data.ganancia_m2 if data.ganancia_m2 is not None else calculo.DEFAULTS["ganancia_m2"],
                m2_vigas_vista=data.m2_vigas_vista,
                radier_m2=data.radier_m2 if data.radier_m2 is not None else calculo.DEFAULTS["radier_m2"],
                modo_lista=data.modo_lista,
                modo_tarifas=data.modo_tarifas,
                n_trabajadores=data.n_trabajadores,
                dias_obra=data.dias_obra,
                lleva_radier=data.lleva_radier or data.tipo_proyecto == "SOLO_RADIER",
                tarifa_radier_m2=data.tarifa_radier_m2 if data.tarifa_radier_m2 is not None else calculo.DEFAULTS["mo_radier_m2"],
                precio_litro=data.precio_litro if data.precio_litro is not None else calculo.DEFAULTS["precio_litro"],
                usuario=request.auth
            )

            DetalleCotizacionInsumo.objects.bulk_create([
                DetalleCotizacionInsumo(cotizacion=cotizacion, catalogo_tipo_id=i["id"], etapa_obra=i["etapa"],
                                        cantidad_calculada=i["cantidad"], subtotal_costo=i["subtotal"])
                for i in r["insumos"]])
            ManoObraLinea.objects.bulk_create([
                ManoObraLinea(cotizacion=cotizacion, cantidad=l["cantidad"], cobro=l["cobro"])
                for l in r.get("mano_obra_lineas", [])])
            DetalleCotizacionInsumo.objects.bulk_create([
                DetalleCotizacionInsumo(cotizacion=cotizacion, catalogo_tipo_id=i["id"], etapa_obra=i["etapa"],
                                        cantidad_calculada=i["cantidad"], subtotal_costo=i["subtotal"], es_adicional=True)
                for i in r.get("adicionales", [])])

            # Hitos 40/30/30 en Decimal; el último absorbe el redondeo.
            for fase, pct, monto in calculo.hitos(r["total"]):
                HitoPago.objects.create(
                    cotizacion=cotizacion, fase=fase, porcentaje=pct, monto_pago=monto, estado="PENDIENTE"
                )

            # Inicializar ficha de seguimiento de obra
            ObraEjecucion.objects.create(
                cotizacion=cotizacion,
                porcentaje_avance_real=0.00,
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


@router.get("/cotizaciones/progreso/", response=List[ProgresoObraSchema], auth=AuthBearer())
def progreso_obras(request):
    """Avance físico de cada obra en ejecución (cotizaciones aceptadas), para el gráfico del panel."""
    obras = ObraEjecucion.objects.select_related("cotizacion").filter(cotizacion__estado="ACEPTADA").order_by("id")
    return [{"id": o.cotizacion_id, "codigo_cotizacion": o.cotizacion.codigo_cotizacion,
             "cliente_nombre": o.cotizacion.cliente_nombre, "avance": o.porcentaje_avance_real} for o in obras]


@router.get("/cotizaciones/{cotizacion_id}/", response={200: CotizacionDetalladaSchema, 404: MessageSchema}, auth=AuthBearer())
def obtener_cotizacion_detalle(request, cotizacion_id: int):
    try:
        cotizacion = Cotizacion.objects.select_related(
            "base_terreno", "revestimiento", "usuario"
        ).prefetch_related(
            "hitos_pago", "detalles_insumo__catalogo_tipo__proveedor", "obras_ejecucion"
        ).get(id=cotizacion_id)
        return 200, cotizacion
    except Cotizacion.DoesNotExist:
        return 404, {"message": "Cotización no encontrada"}


@router.delete("/cotizaciones/{cotizacion_id}/", response={200: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def eliminar_cotizacion(request, cotizacion_id: int):
    """Cancela la cotización u obra con todo lo asociado (pagos, avance, lista, historial). Los proyectos del portafolio se conservan."""
    n, _ = Cotizacion.objects.filter(id=cotizacion_id).delete()
    return (200, {"message": "Cotización eliminada"}) if n else (404, {"message": "Cotización no encontrada"})


@router.patch("/cotizaciones/{cotizacion_id}/estado", response={200: CotizacionSchema, 404: MessageSchema, 400: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def actualizar_estado_cotizacion(request, cotizacion_id: int, data: CotizacionEstadoUpdateSchema):
    """El estado depende de los pagos: solo se acepta el que ya corresponde. Se mantiene para no romper clientes antiguos."""
    if data.estado not in ESTADOS_COTIZACION:
        return 400, {"message": "Estado no válido. Use BORRADOR, ACEPTADA o FINALIZADA."}
    cotizacion = Cotizacion.objects.filter(id=cotizacion_id).first()
    if not cotizacion:
        return 404, {"message": "Cotización no encontrada"}
    esperado = _estado_segun_pagos(list(cotizacion.hitos_pago.all()))
    if data.estado != esperado:
        return 409, {"message": f"El estado no se cambia a mano: se actualiza solo con los pagos. Este proyecto está «{ETIQUETA_ESTADO[esperado]}»."}
    return 200, cotizacion


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
        _reconciliar(cot)
    return 200, resultado


ESTADOS_COTIZACION = {"BORRADOR", "ACEPTADA", "FINALIZADA"}
_CAMPOS_PRECIO = {"superficie_m2", "distancia_flete_km", "base_terreno_id", "revestimiento_id",
                  "m2_vigas_vista", "ganancia_m2", "radier_m2", "ajuste_monto",
                  "n_trabajadores", "dias_obra", "lleva_radier", "tarifa_radier_m2", "precio_litro"}
_CAMPOS_DECIMAL = {"superficie_m2", "distancia_flete_km", "m2_vigas_vista", "ganancia_m2", "radier_m2", "ajuste_monto",
                   "tarifa_radier_m2", "precio_litro"}


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
                tipo_proyecto=cot.tipo_proyecto, radier_m2=float(cot.radier_m2),
                materiales=[MaterialAdicionalInSchema(catalogo_id=d.catalogo_tipo_id, cantidad=float(d.cantidad_calculada))
                            for d in cot.detalles_insumo.filter(es_adicional=True)],
                maestros=[ManoObraInSchema(cantidad=l.cantidad, cobro=float(l.cobro)) for l in cot.mano_obra.all()],
                modo_lista=cot.modo_lista, modo_tarifas=cot.modo_tarifas, n_trabajadores=cot.n_trabajadores,
                dias_obra=cot.dias_obra, lleva_radier=cot.lleva_radier,
                tarifa_radier_m2=float(cot.tarifa_radier_m2), precio_litro=float(cot.precio_litro)))
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
        _reconciliar(cot)
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
            "hitos_pago", "detalles_insumo__catalogo_tipo__proveedor", "obras_ejecucion"
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


@router.patch("/hitos-pago/{hito_id}/", response={200: HitoPagoSchema, 404: MessageSchema, 400: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def actualizar_hito_pago(request, hito_id: int, data: HitoPagoUpdateSchema):
    """Registra un pago. `pago_completo=True` (o estado PAGADO) salda el hito; `pago_completo=False` exige
    `monto_abonado` (total recibido) y deja el hito en ABONADO con la deuda restante; estado PENDIENTE lo deja en cero."""
    hito = HitoPago.objects.filter(id=hito_id).first()
    if not hito:
        return 404, {"message": "Hito de pago no encontrado"}
    if data.pago_completo is True or data.estado == "PAGADO":
        abonado = hito.monto_pago
    elif data.estado == "PENDIENTE" and data.monto_abonado is None:
        abonado = Decimal(0)
    elif data.pago_completo is False or data.monto_abonado is not None:
        if data.monto_abonado is None:
            return 400, {"message": "Indique cuánto se pagó."}
        abonado = Decimal(str(data.monto_abonado)).quantize(Decimal("1"))
        if abonado < 0 or abonado > hito.monto_pago:
            tope = f"{int(hito.monto_pago):,}".replace(",", ".")
            return 400, {"message": f"El monto pagado debe estar entre $0 y ${tope}."}
    elif data.estado is not None:
        return 400, {"message": "Estado de pago no válido."}
    else:
        abonado = hito.monto_abonado
    hito.monto_abonado = abonado
    hito.estado = "PAGADO" if abonado >= hito.monto_pago else ("ABONADO" if abonado > 0 else "PENDIENTE")
    if data.fecha_pago is not None:
        hito.fecha_pago = data.fecha_pago
    elif abonado > 0:
        hito.fecha_pago = date.today()
    else:
        hito.fecha_pago = None
    if data.comprobante_ref is not None:
        hito.comprobante_ref = data.comprobante_ref
    with transaction.atomic():
        hito.save()
        error = _reconciliar(hito.cotizacion)  # estado y avance siguen a los pagos
        if error:
            transaction.set_rollback(True)
            return 409, {"message": error}
    return 200, hito


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
    """vista_resumen_ganancias: neto cobrado vs costo presupuestado."""
    c = Cotizacion.objects.filter(id=cotizacion_id).first()
    obra = ObraEjecucion.objects.filter(cotizacion_id=cotizacion_id).first()
    if not c or not obra:
        return 404, {"message": "Cotización u obra no encontrada"}
    neto = (c.costo_total / Decimal("1.19")).quantize(Decimal("1"))
    presupuestado = ((c.costo_materiales + c.costo_mano_obra + c.costo_flete + c.costo_nivelacion) / Decimal("1.19")).quantize(Decimal("1"))
    minimo, maximo = _limites_avance(list(c.hitos_pago.all()))
    return 200, {
        "neto_cobrado": neto, "costo_presupuestado": presupuestado,
        "ganancia_estimada": neto - presupuestado,
        "avance_real": obra.porcentaje_avance_real, "avance_minimo": minimo, "avance_maximo": maximo,
    }


def _validar_avance(cot, avance, actual=None):
    """None si el avance es coherente con los pagos; si no, el mensaje que se muestra al usuario."""
    minimo, maximo = _limites_avance(list(cot.hitos_pago.all()))
    if avance > maximo:
        return _mensaje_tope_avance(maximo)
    if avance < minimo:
        return f"Con los pagos registrados el avance no puede ser menor a {minimo} %."
    if actual is not None and avance < actual:
        return f"El avance no puede ser menor al ya registrado ({int(actual)} %)."
    return None


@router.patch("/obras/{obra_id}/", response={200: ObraEjecucionSchema, 404: MessageSchema, 400: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def actualizar_obra(request, obra_id: int, data: ObraEjecucionInSchema):
    try:
        obra = ObraEjecucion.objects.select_related("cotizacion").get(id=obra_id)
        if data.porcentaje_avance_real is not None:
            error = _validar_avance(obra.cotizacion, Decimal(str(data.porcentaje_avance_real)))
            if error:
                return 409, {"message": error}
        for attr, value in data.dict(exclude_unset=True).items():
            if value is not None:
                setattr(obra, attr, value)
        obra.save()
        return 200, obra
    except ObraEjecucion.DoesNotExist:
        return 404, {"message": "Obra no encontrada"}
    except Exception as e:
        return 400, {"message": str(e)}


# ---- Bitácora de avance
MAX_FOTOS_BITACORA = 6


def _guardar_fotos_bitacora(bitacora, data_urls):
    if bitacora.fotos.count() + len(data_urls) > MAX_FOTOS_BITACORA:
        raise ValueError(f"Cada registro admite hasta {MAX_FOTOS_BITACORA} fotos.")
    for du in data_urls:
        mime, contenido = _decodificar_imagen(du)
        BitacoraFoto.objects.create(bitacora=bitacora, contenido=contenido, tipo_mime=mime)


@router.get("/cotizaciones/{cotizacion_id}/bitacora/", response=List[BitacoraSchema], auth=AuthBearer())
def listar_bitacora(request, cotizacion_id: int):
    return BitacoraAvance.objects.select_related("usuario").prefetch_related("fotos").filter(cotizacion_id=cotizacion_id)


@router.post("/cotizaciones/{cotizacion_id}/bitacora/", response={200: BitacoraSchema, 400: MessageSchema, 404: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def registrar_avance(request, cotizacion_id: int, data: BitacoraInSchema):
    """Registra un avance (porcentaje + comentario + fotos) y actualiza el avance de la obra, que debe ser coherente con los pagos."""
    cot = Cotizacion.objects.filter(id=cotizacion_id).first()
    if not cot:
        return 404, {"message": "Cotización no encontrada"}
    obra = _obra_de(cot)
    porcentaje = Decimal(str(data.porcentaje))
    error = _validar_avance(cot, porcentaje, obra.porcentaje_avance_real)
    if error:
        return 409, {"message": error}
    try:
        with transaction.atomic():
            b = BitacoraAvance.objects.create(cotizacion=cot, porcentaje=porcentaje, comentario=data.comentario.strip(), usuario=request.auth)
            _guardar_fotos_bitacora(b, data.imagenes)
            obra.porcentaje_avance_real, obra.fecha_ultima_actualizacion = porcentaje, date.today()
            obra.save(update_fields=["porcentaje_avance_real", "fecha_ultima_actualizacion"])
    except ValueError as e:
        return 400, {"message": str(e)}
    return 200, b


@router.patch("/bitacora/{bitacora_id}/", response={200: BitacoraSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def agregar_fotos_bitacora(request, bitacora_id: int, data: BitacoraFotosInSchema):
    b = BitacoraAvance.objects.filter(id=bitacora_id).first()
    if not b:
        return 404, {"message": "Registro no encontrado"}
    try:
        with transaction.atomic():
            _guardar_fotos_bitacora(b, data.agregar_imagenes)
    except ValueError as e:
        return 400, {"message": str(e)}
    return 200, b


@router.delete("/bitacora/{bitacora_id}/", response={200: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def eliminar_bitacora(request, bitacora_id: int):
    """Elimina un registro mal ingresado; el avance de la obra vuelve al del último registro que queda."""
    b = BitacoraAvance.objects.select_related("cotizacion").filter(id=bitacora_id).first()
    if not b:
        return 404, {"message": "Registro no encontrado"}
    cot = b.cotizacion
    with transaction.atomic():
        b.delete()
        restantes = max((x.porcentaje for x in cot.bitacoras.all()), default=Decimal(0))
        minimo, _ = _limites_avance(list(cot.hitos_pago.all()))
        obra = _obra_de(cot)
        obra.porcentaje_avance_real, obra.fecha_ultima_actualizacion = max(restantes, Decimal(minimo)), date.today()
        obra.save(update_fields=["porcentaje_avance_real", "fecha_ultima_actualizacion"])
    return 200, {"message": "Registro eliminado"}


@router.get("/bitacora/fotos/{foto_id}/", auth=AuthBearer())
def servir_foto_bitacora(request, foto_id: int):
    f = BitacoraFoto.objects.filter(id=foto_id).first()
    if not f:
        return HttpResponse(status=404)
    r = HttpResponse(bytes(f.contenido), content_type=f.tipo_mime)
    r["Cache-Control"] = "private, max-age=86400"
    return r


@router.get("/cotizaciones/{cotizacion_id}/desglose/", response={200: dict, 404: MessageSchema}, auth=AuthBearer())
def desglose_cotizacion(request, cotizacion_id: int):
    """Detalle completo para la ficha de la empresa: todos los materiales con su cantidad, la mano de obra, el traslado y la ganancia."""
    cot = Cotizacion.objects.filter(id=cotizacion_id).first()
    if not cot:
        return 404, {"message": "Cotización no encontrada"}
    detalles = list(cot.detalles_insumo.select_related("catalogo_tipo__proveedor").order_by("etapa_obra", "id"))
    materiales = [{
        "nombre": d.catalogo_tipo.nombre, "categoria": d.catalogo_tipo.categoria, "unidad": d.catalogo_tipo.unidad_medida,
        "proveedor": d.catalogo_tipo.proveedor.razon_social if d.catalogo_tipo.proveedor else None,
        "cantidad": float(d.cantidad_calculada), "subtotal": float(d.subtotal_costo), "de_la_lista": d.es_adicional,
    } for d in detalles]
    mano_obra, traslado = [], None
    if cot.modo_tarifas:
        adicionales = [{"nombre": d.catalogo_tipo.nombre, "cantidad": d.cantidad_calculada, "mano_obra_m2": d.catalogo_tipo.mano_obra_m2}
                       for d in detalles if d.es_adicional]
        lineas = calculo.lineas_mano_obra_tarifas(cot.superficie_m2, cot.n_trabajadores, cot.m2_vigas_vista, cot.tipo_proyecto,
                                                  adicionales, cot.lleva_radier, cot.tarifa_radier_m2, calculo.DEFAULTS)
        mano_obra = [{"concepto": l["concepto"], "m2": float(l["m2"]), "tarifa": float(l["tarifa"]),
                      "trabajadores": l["trabajadores"], "subtotal": float(l["subtotal"])} for l in lineas]
        dias = cot.dias_obra + (int(calculo.DEFAULTS["dias_fabricacion_radier"]) if cot.lleva_radier else 0)
        tr = calculo.traslado_combustible(cot.distancia_flete_km, dias, cot.precio_litro, calculo.DEFAULTS["km_por_litro"])
        traslado = {"km": float(tr["km"]), "dias": tr["dias"], "litros": float(tr["litros"]),
                    "precio_litro": float(tr["precio_litro"]), "costo": float(tr["costo"])}
    else:
        mano_obra = [{"concepto": "Mano de obra", "trabajadores": l.cantidad, "tarifa": float(l.cobro), "subtotal": float(l.cantidad * l.cobro)}
                     for l in cot.mano_obra.all()]
    total = float(cot.costo_total)
    base = float(cot.costo_materiales + cot.costo_mano_obra + cot.costo_flete + cot.costo_nivelacion)
    neto = round(total / 1.19)
    return 200, {
        "materiales": materiales, "mano_obra": mano_obra, "traslado": traslado,
        "costo_materiales": float(cot.costo_materiales), "costo_mano_obra": float(cot.costo_mano_obra),
        "costo_flete": float(cot.costo_flete), "costo_nivelacion": float(cot.costo_nivelacion),
        "ganancia": max(0, round(total - base)), "neto": neto, "iva": round(total) - neto, "total": total,
        "n_trabajadores": cot.n_trabajadores, "dias_obra": cot.dias_obra, "tipo_proyecto": cot.tipo_proyecto,
        "m2_vigas_vista": float(cot.m2_vigas_vista), "estado": cot.estado,
    }


# ==============================================================================
# 8. PORTAFOLIO PROYECTO
# ==============================================================================
MAX_IMAGENES, MAX_BYTES_IMAGEN = 10, 2_500_000
_MIME_OK = {"image/jpeg", "image/png", "image/webp"}


def _decodificar_imagen(data_url: str):
    """'data:image/jpeg;base64,...' -> (mime, bytes). ValueError con mensaje para el usuario si no sirve."""
    try:
        cabecera, b64 = data_url.split(",", 1)
        mime = cabecera.split(";")[0].removeprefix("data:")
        contenido = base64.b64decode(b64, validate=True)
    except Exception:
        raise ValueError("Una de las imágenes no se pudo leer.")
    if mime not in _MIME_OK:
        raise ValueError("Solo se aceptan imágenes JPG, PNG o WebP.")
    if len(contenido) > MAX_BYTES_IMAGEN:
        raise ValueError("Cada imagen puede pesar hasta 2,5 MB.")
    return mime, contenido


def _guardar_imagenes(proyecto, data_urls):
    existentes = proyecto.imagenes.count()
    if existentes + (1 if proyecto.imagen_url else 0) + len(data_urls) > MAX_IMAGENES:
        raise ValueError(f"Un proyecto admite hasta {MAX_IMAGENES} imágenes.")
    for n, du in enumerate(data_urls, start=existentes):
        mime, contenido = _decodificar_imagen(du)
        PortafolioImagen.objects.create(proyecto=proyecto, contenido=contenido, tipo_mime=mime, orden=n)


@router.get("/portafolio/", response=List[PortafolioProyectoSchema])
def listar_portafolio(request):
    return PortafolioProyecto.objects.select_related("cotizacion__revestimiento").prefetch_related("imagenes").filter(publicado=True).order_by("-id")


@router.get("/portafolio/admin/", response=List[PortafolioProyectoSchema], auth=AuthBearer())
def listar_portafolio_admin(request):
    return PortafolioProyecto.objects.select_related("cotizacion__revestimiento").prefetch_related("imagenes").order_by("-id")


@router.get("/portafolio/imagenes/{imagen_id}/")
def servir_imagen_portafolio(request, imagen_id: int):
    img = PortafolioImagen.objects.filter(id=imagen_id).first()
    if not img:
        return HttpResponse(status=404)
    r = HttpResponse(bytes(img.contenido), content_type=img.tipo_mime)
    r["Cache-Control"] = "public, max-age=86400"
    return r


@router.post("/portafolio/", response={200: PortafolioProyectoSchema, 400: MessageSchema}, auth=AuthBearer())
def crear_proyecto_portafolio(request, data: PortafolioProyectoInSchema):
    try:
        with transaction.atomic():
            proyecto = PortafolioProyecto.objects.create(**data.dict(exclude={"imagenes"}))
            _guardar_imagenes(proyecto, data.imagenes)
        return 200, proyecto
    except ValueError as e:
        return 400, {"message": str(e)}
    except Exception as e:
        return 400, {"message": str(e)}


@router.patch("/portafolio/{proyecto_id}/", response={200: PortafolioProyectoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def editar_proyecto_portafolio(request, proyecto_id: int, data: PortafolioProyectoUpdateSchema):
    proyecto = PortafolioProyecto.objects.filter(id=proyecto_id).first()
    if not proyecto:
        return 404, {"message": "Proyecto no encontrado"}
    try:
        with transaction.atomic():
            for k, v in data.dict(exclude_unset=True, exclude={"agregar_imagenes", "quitar_imagenes", "quitar_portada"}).items():
                setattr(proyecto, k, v)
            if data.quitar_portada:
                proyecto.imagen_url = None
            proyecto.save()
            proyecto.imagenes.filter(id__in=data.quitar_imagenes).delete()
            _guardar_imagenes(proyecto, data.agregar_imagenes)
        return 200, proyecto
    except ValueError as e:
        return 400, {"message": str(e)}


@router.delete("/portafolio/{proyecto_id}/", response={200: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def eliminar_proyecto_portafolio(request, proyecto_id: int):
    n, _ = PortafolioProyecto.objects.filter(id=proyecto_id).delete()
    return (200, {"message": "Proyecto eliminado"}) if n else (404, {"message": "Proyecto no encontrado"})
