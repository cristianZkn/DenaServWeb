import base64
import re
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
from django.utils import timezone
from django.db.models import Prefetch
from django.http import HttpResponse
from ninja import Query, Router
from ninja.security import APIKeyHeader, HttpBearer

from .models import (
    Usuario, Proveedor, CatalogoTipo, Cotizacion,
    DetalleCotizacionInsumo, HitoPago, ObraEjecucion, PortafolioProyecto, PortafolioImagen, CasaCatalogo, CasaCatalogoImagen, CambioCotizacion, ManoObraLinea,
    BitacoraAvance, BitacoraFoto, ContratoNotarial, Tarifa, DetalleRegistro, METODOS_PAGO, TrasladoCotizacion, RegistroAuditoria
)
from .schemas import (
    GoogleAuthInSchema, TokenSchema, MessageSchema, UsuarioSchema, UsuarioInSchema, ContratoInSchema, TarifaSchema, TarifaInSchema,
    ProveedorSchema, ProveedorInSchema,
    CatalogoTipoSchema, CatalogoTipoInSchema, InsumoSchema,
    CotizacionSchema, CotizacionInSchema, CotizacionDetalladaSchema, CotizacionEstadoUpdateSchema,
    DetalleCotizacionInsumoSchema, DetalleCotizacionInsumoInSchema,
    HitoPagoSchema, HitoPagoUpdateSchema, RegistroPagoInSchema, ConfirmarSchema, ComprobanteInSchema,
    ObraEjecucionSchema, ObraEjecucionInSchema,
    MaterialAdicionalInSchema, ManoObraInSchema, PortafolioProyectoSchema, PortafolioProyectoInSchema, PortafolioProyectoUpdateSchema, ProgresoObraSchema, AuditoriaSchema, CasaCatalogoSchema, CasaCatalogoInSchema, CasaCatalogoUpdateSchema, CalculoInSchema, GananciasSchema, NivelacionInSchema,
    CotizacionPublicaSchema, CotizacionEditSchema, TrasladoInSchema, CambioCotizacionSchema,
    BitacoraInSchema, BitacoraFotosInSchema, BitacoraSchema, EstadisticasSchema
)
from . import analisis, auditoria, calculo, combustibles, dominio, precios, reportes, resumen, scraper
from .servicios import ConfirmacionRequerida, ErrorDeNegocio, ServicioObra, ServicioPagos
from .limites import AuthRutaThrottle, IpRateThrottle


def _neto(item):
    """Costo neto unitario aplicando el descuento del proveedor (convenio)."""
    if not item:
        return Decimal(0)
    return calculo.costo_neto(item.precio_base_unitario, item.descuento_pct)


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
    elegidos = CatalogoTipo.objects.select_related('proveedor').filter(activo=True).in_bulk({m.catalogo_id for m in data.materiales})
    for mat in data.materiales:
        it = elegidos.get(mat.catalogo_id)
        if not it:
            raise ValueError("Uno de los materiales de la lista ya no está disponible en el catálogo.")
        adicionales.append({'id': it.id, 'nombre': it.nombre, 'unidad': it.unidad_medida,
                            'cantidad': mat.cantidad, 'precio_neto': _neto(it), 'etapa': it.etapa_obra or 'ETAPA_1',
                            'mano_obra_m2': it.mano_obra_m2 if mat.mano_obra_m2 is None else mat.mano_obra_m2})
    insumos = [{'id': i.id, 'nombre': i.nombre, 'unidad': i.unidad_medida, 'etapa': i.etapa_obra,
                'rendimiento': i.rendimiento_m2, 'precio_neto': _neto(i)} for i in insumos_db]
    traslados = [{"tipo": x.tipo, "combustible": x.combustible, "dias": x.dias,
                  "precio_litro": x.precio_litro if x.precio_litro is not None else (
                      calculo.vigentes()["flete_camion_dia"] if x.tipo == calculo.TRASLADO_CAMION else combustibles.precio(x.combustible))}
                 for x in data.traslados]
    return calculo.calcular(
        m2=data.superficie_m2, km=data.distancia_km, traslados=traslados,
        precio_base_m2=_neto(get(data.base_terreno_id)), precio_revest_m2=_neto(get(data.revestimiento_id)),
        base_min_m2=_precio_minimo('BASE_TERRENO'), revest_min_m2=_precio_minimo('REVESTIMIENTO'),
        separacion_cm=data.separacion_cm, ganancia_m2=data.ganancia_m2, m2_vigas_vista=data.m2_vigas_vista, insumos=insumos,
        tipo_proyecto=data.tipo_proyecto, radier_m2=data.radier_m2, adicionales=adicionales,
        maestros=[m.dict() for m in data.maestros], modo_lista=data.modo_lista,
        modo_tarifas=data.modo_tarifas, n_trabajadores=data.n_trabajadores, dias_obra=data.dias_obra,
        lleva_radier=data.lleva_radier, tarifa_radier_m2=data.tarifa_radier_m2, precio_litro=data.precio_litro,
        **data.tarifas_personalizadas)


# La lógica de pagos y de avance de obra vive en core/dominio.py (reglas), core/servicios.py (casos de uso) y
# core/repositorios.py (acceso a datos). Aquí solo se traduce HTTP <-> servicios.
pagos = ServicioPagos.por_defecto()
obras = ServicioObra.por_defecto()


def _responder_error(e: ErrorDeNegocio):
    """Traduce un error de negocio a la respuesta HTTP (409 con `confirmar` cuando hay que preguntar al usuario)."""
    if isinstance(e, ConfirmacionRequerida):
        return 409, {"message": str(e), "confirmar": True}
    return e.estado, {"message": str(e)}


router = Router()
logger = logging.getLogger(__name__)


def _msj(e: Exception) -> str:
    """Mensaje que se le muestra al usuario. Solo se muestran los que escribió la aplicación (ValueError y errores de lectura
    de tiendas); cualquier otro error (base de datos, librerías) queda en el log y no se filtra al navegador."""
    if isinstance(e, (ValueError, scraper.ErrorExtraccion)):
        return str(e)
    logger.exception("Error no controlado en la API")
    return "No se pudo completar la operación. Revise los datos e intente de nuevo."


# --- Seguridad & JWT ---
class AuthBearer(HttpBearer):
    def authenticate(self, request, token):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"], options={"require": ["exp", "user_id"]})
            user = Usuario.objects.filter(id=payload.get("user_id"), activo=True).first()
        except Exception as e:  # token vencido/inválido o fallo de BD: se rechaza, pero queda el motivo en el log
            logger.warning("Auth rechazada (%s): %s", type(e).__name__, e)
            return None
        auditoria.fijar_usuario(user)  # los cambios de esta petición quedan a nombre de este usuario
        return user


class PermisoDenegado(Exception):
    """El usuario está autenticado pero su rol no permite la acción (se responde 403)."""


class AuthAdmin(AuthBearer):
    """Igual que AuthBearer, pero solo deja pasar al rol Admin."""
    def authenticate(self, request, token):
        user = super().authenticate(request, token)
        if user and user.rol != "ADMIN":
            raise PermisoDenegado("Su rol (Operador) no permite esta acción.")
        return user


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
        "exp": datetime.now(tz.utc) + timedelta(hours=12),
        "iat": datetime.now(tz.utc)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


# ==============================================================================
# 1. AUTENTICACIÓN (Google SSO)
# ==============================================================================
@router.post("/auth/google", response={200: TokenSchema, 401: MessageSchema, 403: MessageSchema}, throttle=[IpRateThrottle("10/m")])
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
@router.get("/usuarios/", response=List[UsuarioSchema], auth=AuthAdmin())
def listar_usuarios(request):
    return Usuario.objects.all().order_by("nombre_completo")


def _usuario_duplicado(data, excluir_id=None):
    qs = Usuario.objects.exclude(id=excluir_id) if excluir_id else Usuario.objects.all()
    if qs.filter(email__iexact=data.email).exists():
        return "Ya existe un usuario con ese correo."
    if qs.filter(rut=data.rut).exists():
        return "Ya existe un usuario con ese RUN."
    return None


@router.post("/usuarios/", response={200: UsuarioSchema, 400: MessageSchema}, auth=AuthAdmin())
def crear_usuario(request, data: UsuarioInSchema):
    error = _usuario_duplicado(data)
    if error:
        return 400, {"message": error}
    return 200, Usuario.objects.create(**data.dict())


@router.put("/usuarios/{usuario_id}", response={200: UsuarioSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthAdmin())
def actualizar_usuario(request, usuario_id: int, data: UsuarioInSchema):
    usuario = Usuario.objects.filter(id=usuario_id).first()
    if not usuario:
        return 404, {"message": "Usuario no encontrado"}
    error = _usuario_duplicado(data, usuario_id)
    if error:
        return 400, {"message": error}
    if usuario.id == request.auth.id and not data.activo:
        return 400, {"message": "No puedes desactivar tu propio acceso."}
    if usuario.id == request.auth.id and data.rol != "ADMIN":
        return 400, {"message": "No puedes quitarte tu propio rol de Admin."}
    for attr, value in data.dict().items():
        setattr(usuario, attr, value)
    usuario.save()
    return 200, usuario


@router.delete("/usuarios/{usuario_id}", response={200: MessageSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthAdmin())
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


@router.get("/auditoria/", response=List[AuditoriaSchema], auth=AuthAdmin())
def listar_auditoria(request, entidad: Optional[str] = None, usuario_id: Optional[int] = None, accion: Optional[str] = None,
                     limite: int = 100, desde: int = 0):
    """Historial de cambios (quién, qué y cuándo), del más reciente al más antiguo, con filtros y paginación simple."""
    qs = RegistroAuditoria.objects.all()
    if entidad:
        qs = qs.filter(entidad=entidad)
    if usuario_id:
        qs = qs.filter(usuario_id=usuario_id)
    if accion:
        qs = qs.filter(accion=accion)
    return qs[max(0, desde):max(0, desde) + min(max(1, limite), 500)]


# ==============================================================================
# 1c. TARIFAS DEL CÁLCULO (valores fijos que la empresa puede cambiar sin tocar el código)
# ==============================================================================
def _tarifas_listadas():
    actuales = calculo.vigentes()
    return [{"clave": k, "grupo": g, "nombre": n, "unidad": u, "descripcion": d, "valor": float(actuales[k]),
             "valor_de_fabrica": float(calculo.DEFAULTS[k]), "modificada": actuales[k] != calculo.DEFAULTS[k]}
            for k, g, n, u, d in calculo.TARIFAS_META]


@router.get("/tarifas/", response=List[TarifaSchema], auth=AuthBearer())
def listar_tarifas(request):
    return _tarifas_listadas()


@router.put("/tarifas/{clave}", response={200: TarifaSchema, 404: MessageSchema}, auth=AuthBearer())
def cambiar_tarifa(request, clave: str, data: TarifaInSchema):
    """Nuevo valor de una tarifa: rige para las cotizaciones que se calculen desde ahora (las ya guardadas no cambian)."""
    if clave not in calculo.DEFAULTS:
        return 404, {"message": "Tarifa no encontrada"}
    Tarifa.objects.update_or_create(clave=clave, defaults={"valor": data.valor, "usuario": request.auth, "actualizado_en": datetime.now(tz.utc)})
    return 200, next(x for x in _tarifas_listadas() if x["clave"] == clave)


@router.delete("/tarifas/{clave}", response={200: TarifaSchema, 404: MessageSchema}, auth=AuthBearer())
def restablecer_tarifa(request, clave: str):
    """Vuelve al valor de fábrica."""
    if clave not in calculo.DEFAULTS:
        return 404, {"message": "Tarifa no encontrada"}
    Tarifa.objects.filter(clave=clave).delete()
    return 200, next(x for x in _tarifas_listadas() if x["clave"] == clave)


# ==============================================================================
# 1d. PRECIO DEL COMBUSTIBLE (CNE, Bencina en Línea)
# ==============================================================================
@router.get("/combustibles/", response={200: List[dict], 503: MessageSchema}, auth=AuthBearer())
def precios_combustibles(request):
    """Precio por litro de 93, 95, 97 y diésel. Se consulta a la CNE si los guardados tienen más de 6 horas."""
    try:
        return 200, combustibles.listar()
    except ValueError as e:
        return 503, {"message": _msj(e)}


@router.get("/combustibles/estado/", response=dict, auth=AuthBearer())
def estado_combustibles(request):
    """Los 4 combustibles para editarlos (aunque la CNE no responda) y, si falló, el motivo."""
    return combustibles.estado()


@router.put("/combustibles/{tipo}", response={200: dict, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def fijar_precio_combustible(request, tipo: str, data: TarifaInSchema):
    """Fija a mano el precio por litro (por ejemplo, si la CNE no responde)."""
    if tipo not in combustibles.TIPOS:
        return 404, {"message": "Combustible no encontrado"}
    if data.valor <= 0:
        return 400, {"message": "El precio por litro debe ser mayor que 0."}
    combustibles.fijar_manual(tipo, Decimal(str(data.valor)).quantize(Decimal("1")))
    return 200, combustibles.estado()


@router.delete("/combustibles/{tipo}", response={200: dict, 404: MessageSchema, 503: MessageSchema}, auth=AuthBearer(), throttle=[AuthRutaThrottle("12/m")])
def volver_precio_cne(request, tipo: str):
    """Deja de usar el precio manual y vuelve al de la CNE."""
    if tipo not in combustibles.TIPOS:
        return 404, {"message": "Combustible no encontrado"}
    try:
        combustibles.volver_a_cne(tipo)
    except ValueError as e:
        return 503, {"message": f"{_msj(e)} Se mantiene el precio ingresado a mano."}
    return 200, combustibles.estado()


@router.post("/combustibles/actualizar/", response={200: List[dict], 503: MessageSchema}, auth=AuthBearer(), throttle=[AuthRutaThrottle("6/m")])
def actualizar_combustibles(request):
    try:
        return 200, combustibles.actualizar()
    except ValueError as e:
        return 503, {"message": _msj(e)}


# ==============================================================================
# 2. PROVEEDORES
# ==============================================================================
@router.get("/proveedores/", response=List[ProveedorSchema], auth=AuthBearer())
def listar_proveedores(request):
    return Proveedor.objects.all().order_by("razon_social")


@router.post("/proveedores/", response={200: ProveedorSchema, 400: MessageSchema}, auth=AuthAdmin())
def crear_proveedor(request, data: ProveedorInSchema):
    if Proveedor.objects.filter(rut_empresa=data.rut_empresa).exists():
        return 400, {"message": "Ya existe un proveedor con ese RUT."}
    try:
        proveedor = Proveedor.objects.create(**data.dict())
        return 200, proveedor
    except Exception as e:
        return 400, {"message": _msj(e)}


@router.put("/proveedores/{proveedor_id}", response={200: ProveedorSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthAdmin())
def actualizar_proveedor(request, proveedor_id: int, data: ProveedorInSchema):
    if Proveedor.objects.filter(rut_empresa=data.rut_empresa).exclude(id=proveedor_id).exists():
        return 400, {"message": "Ya existe otro proveedor con ese RUT."}
    try:
        proveedor = Proveedor.objects.get(id=proveedor_id)
        for attr, value in data.dict().items():
            setattr(proveedor, attr, value)
        proveedor.save()
        return 200, proveedor
    except Proveedor.DoesNotExist:
        return 404, {"message": "Proveedor no encontrado"}
    except Exception as e:
        return 400, {"message": _msj(e)}


@router.delete("/proveedores/{proveedor_id}", response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthAdmin())
def eliminar_proveedor(request, proveedor_id: int):
    try:
        proveedor = Proveedor.objects.get(id=proveedor_id)
        proveedor.delete()
        return 200, {"message": "Proveedor eliminado correctamente"}
    except Proveedor.DoesNotExist:
        return 404, {"message": "Proveedor no encontrado"}
    except Exception as e:
        return 400, {"message": f"No se puede eliminar: {_msj(e)}"}


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


@router.post("/catalogo-tipos/", response={200: CatalogoTipoSchema, 400: MessageSchema}, auth=AuthAdmin())
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
        return 400, {"message": _msj(e)}


@router.put("/catalogo-tipos/{catalogo_id}", response={200: CatalogoTipoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthAdmin())
def actualizar_catalogo_tipo(request, catalogo_id: int, data: CatalogoTipoInSchema):
    try:
        item = CatalogoTipo.objects.get(id=catalogo_id)
        url_antes, verificado_antes = item.fuente_url, item.verificado
        for attr, value in data.dict(exclude_unset=True).items():
            if attr == "descuento_pct" and item.fuente_url:
                continue  # con ficha, el descuento es el que muestra la tienda (se lee solo); a mano solo en materiales sin ficha
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
        return 400, {"message": _msj(e)}


@router.delete("/catalogo-tipos/{catalogo_id}", response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthAdmin())
def eliminar_catalogo_tipo(request, catalogo_id: int):
    try:
        catalogo = CatalogoTipo.objects.get(id=catalogo_id)
        catalogo.delete()
        return 200, {"message": "Elemento de catálogo eliminado correctamente"}
    except CatalogoTipo.DoesNotExist:
        return 404, {"message": "Elemento de catálogo no encontrado"}
    except Exception as e:
        return 400, {"message": f"No se puede eliminar: {_msj(e)}"}


# ==============================================================================
# 4. COTIZACIONES
# ==============================================================================
@router.get("/cotizaciones/", response=List[CotizacionSchema], auth=AuthBearer())
def listar_cotizaciones(request):
    return Cotizacion.objects.select_related("base_terreno__proveedor", "revestimiento__proveedor", "usuario").order_by("-fecha_creacion")


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
                tarifa_radier_m2=data.tarifa_radier_m2, precio_litro=data.precio_litro, traslados=data.traslados))

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
                ganancia_m2=data.ganancia_m2 if data.ganancia_m2 is not None else calculo.vigentes()["ganancia_m2"],
                m2_vigas_vista=data.m2_vigas_vista,
                radier_m2=data.radier_m2 if data.radier_m2 is not None else calculo.vigentes()["radier_m2"],
                modo_lista=data.modo_lista,
                modo_tarifas=data.modo_tarifas,
                n_trabajadores=data.n_trabajadores,
                dias_obra=data.dias_obra,
                lleva_radier=data.lleva_radier or data.tipo_proyecto == "SOLO_RADIER",
                tarifa_radier_m2=data.tarifa_radier_m2 if data.tarifa_radier_m2 is not None else calculo.vigentes()["mo_radier_m2"],
                precio_litro=data.precio_litro if data.precio_litro is not None else calculo.vigentes()["precio_litro"],
                tarifas_personalizadas=data.tarifas_personalizadas,
                usuario=request.auth
            )

            TrasladoCotizacion.objects.bulk_create([
                TrasladoCotizacion(cotizacion=cotizacion, tipo=l["tipo"], combustible=l["combustible"], dias=l["dias"], precio_litro=l["precio_litro"])
                for l in r["traslado"].get("lineas", [])] if isinstance(r.get("traslado"), dict) else [])
            DetalleCotizacionInsumo.objects.bulk_create([
                DetalleCotizacionInsumo(cotizacion=cotizacion, catalogo_tipo_id=i["id"], etapa_obra=i["etapa"],
                                        cantidad_calculada=i["cantidad"], subtotal_costo=i["subtotal"])
                for i in r["insumos"]])
            ManoObraLinea.objects.bulk_create([
                ManoObraLinea(cotizacion=cotizacion, cantidad=l["cantidad"], cobro=l["cobro"])
                for l in r.get("mano_obra_lineas", [])])
            DetalleCotizacionInsumo.objects.bulk_create([
                DetalleCotizacionInsumo(cotizacion=cotizacion, catalogo_tipo_id=i["id"], etapa_obra=i["etapa"],
                                        cantidad_calculada=i["cantidad"], subtotal_costo=i["subtotal"], es_adicional=True,
                                        mano_obra_m2=i.get("mano_obra_m2") or 0)
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
        return 400, {"message": _msj(e)}


@router.post("/cotizaciones/calcular", response={200: dict, 400: MessageSchema}, auth=AuthBearer())
def calcular_cotizacion(request, data: CalculoInSchema):
    try:
        return 200, _calcular_desde_catalogo(data)
    except ValueError as e:
        return 400, {"message": _msj(e)}


@router.get("/cotizaciones/progreso/", response=List[ProgresoObraSchema], auth=AuthBearer())
def progreso_obras(request):
    """Avance físico de cada obra en ejecución (cotizaciones aceptadas), para el gráfico del panel."""
    obras = ObraEjecucion.objects.select_related("cotizacion").filter(cotizacion__estado="ACEPTADA").order_by("id")
    return [{"id": o.cotizacion_id, "codigo_cotizacion": o.cotizacion.codigo_cotizacion,
             "cliente_nombre": o.cotizacion.cliente_nombre, "avance": o.porcentaje_avance_real} for o in obras]


def _trimestre(fecha) -> tuple:
    return fecha.year, (fecha.month - 1) // 3 + 1


@router.get("/cotizaciones/estadisticas/", response=EstadisticasSchema, auth=AuthBearer())
def estadisticas_panel(request):
    """Cifras del panel principal: proyectos por estado y, en los últimos 4 trimestres, cuántos se cotizaron, cuántos se
    terminaron y cuánta ganancia suman las cotizaciones creadas en cada uno. Un proyecto se da por terminado en la fecha de su último pago."""
    hoy = timezone.localdate()
    año, trim = _trimestre(hoy)
    ventana = []  # los 4 trimestres que terminan en el actual, del más antiguo al más reciente
    for _ in range(4):
        ventana.append((año, trim))
        año, trim = (año, trim - 1) if trim > 1 else (año - 1, 4)
    ventana.reverse()
    filas = {t: {"clave": f"{t[0]}-T{t[1]}", "etiqueta": f"T{t[1]} {t[0]}", "creados": 0, "terminados": 0,
                 "ganancia_cotizadas": 0, "ganancia_ejecucion": 0, "ganancia_terminadas": 0} for t in ventana}
    clave_ganancia = {"BORRADOR": "ganancia_cotizadas", "ACEPTADA": "ganancia_ejecucion", "FINALIZADA": "ganancia_terminadas"}
    conteo = {"BORRADOR": 0, "ACEPTADA": 0, "FINALIZADA": 0}
    pagos_ = Prefetch("hitos_pago", queryset=HitoPago.objects.only("cotizacion_id", "fecha_pago"))
    campos = ("estado", "fecha_creacion", "costo_total", "costo_materiales", "costo_mano_obra", "costo_flete", "costo_nivelacion")
    for c in Cotizacion.objects.only(*campos).prefetch_related(pagos_):
        conteo[c.estado] = conteo.get(c.estado, 0) + 1
        creada = _trimestre(timezone.localtime(c.fecha_creacion).date())
        if creada in filas:
            filas[creada]["creados"] += 1
            # Misma cuenta que la ficha: lo cobrado menos el costo presupuestado, sin IVA. Un descuento mayor que el margen no resta.
            costos = c.costo_materiales + c.costo_mano_obra + c.costo_flete + c.costo_nivelacion
            filas[creada][clave_ganancia[c.estado]] += max(0, round((c.costo_total - costos) / Decimal("1.19")))
        if c.estado == "FINALIZADA":
            pagos = [h.fecha_pago for h in c.hitos_pago.all() if h.fecha_pago]
            cierre = _trimestre(max(pagos) if pagos else timezone.localtime(c.fecha_creacion).date())
            if cierre in filas:
                filas[cierre]["terminados"] += 1
    return {"cotizados": conteo["BORRADOR"], "en_ejecucion": conteo["ACEPTADA"], "terminados": conteo["FINALIZADA"],
            "trimestres": [filas[t] for t in ventana]}


def _json_reporte(r, pagina, por_pagina):
    def valor(v):
        return v.isoformat() if isinstance(v, date) else (float(v) if isinstance(v, Decimal) else v)
    return {"titulo": r.titulo, "columnas": [{"clave": c, "titulo": t, "tipo": tipo} for c, t, tipo in r.columnas],
            "filas": [[valor(v) for v in f] for f in r.filas], "totales": {k: valor(v) for k, v in r.totales.items()},
            "filtros": r.filtros, "total_filas": r.total_filas, "pagina": pagina, "por_pagina": por_pagina}


@router.get("/reportes/{tipo}/", response={200: dict, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer(), throttle=[AuthRutaThrottle("30/m")])
def reporte(request, tipo: str, formato: str = "json", desde: Optional[date] = None, hasta: Optional[date] = None, estado: Optional[str] = None,
            buscar: Optional[str] = Query(None, max_length=60), pagina: int = 1, por_pagina: int = Query(25, ge=1, le=100)):
    """Reporte operativo, gerencial o por período, en pantalla (json, paginado) o para descargar (csv, xlsx, pdf) con los mismos
    filtros. El gerencial muestra ganancias y es solo Admin. Cada descarga queda registrada en la auditoría con quién la pidió."""
    if tipo not in reportes.TIPOS:
        return 404, {"message": "Reporte no encontrado."}
    if tipo in reportes.SOLO_ADMIN and request.auth.rol != "ADMIN":
        raise PermisoDenegado("Su rol (Operador) no puede ver este reporte.")
    if formato not in reportes.FORMATOS:
        return 400, {"message": "Formato no válido. Use json, csv, xlsx o pdf."}
    if estado and estado not in reportes.ESTADOS:
        return 400, {"message": "Estado no válido."}
    if desde and hasta and desde > hasta:
        return 400, {"message": "La fecha «desde» no puede ser posterior a «hasta»."}
    exportar = formato != "json"
    r = reportes.CONSTRUCTORES[tipo](desde=desde, hasta=hasta, estado=estado, buscar=(buscar or "").strip() or None,
                                     pagina=None if exportar else max(1, pagina), por_pagina=por_pagina)
    if not exportar:
        return 200, _json_reporte(r, max(1, pagina), por_pagina)
    generar, mime, extension = reportes.EXPORTADORES[formato]
    RegistroAuditoria.objects.create(usuario=request.auth, usuario_nombre=request.auth.nombre_completo, accion="EXPORTAR", entidad=f"Reporte {tipo}",
                                     entidad_id=0, detalle=f"{formato.upper()}; {'; '.join(r.filtros)}"[:255])
    respuesta = HttpResponse(generar(r), content_type=mime)
    respuesta["Content-Disposition"] = f'attachment; filename="reporte-{tipo}-{timezone.localdate():%Y%m%d}.{extension}"'
    respuesta["Cache-Control"] = "no-store"
    return respuesta


@router.get("/dashboard/analisis/", response={200: dict, 400: MessageSchema}, auth=AuthBearer())
def dashboard_analisis(request, desde: Optional[date] = None, hasta: Optional[date] = None, estado: Optional[str] = None):
    """Indicadores (con su fórmula y la pregunta de negocio que responden) y series para los gráficos, con filtros de fecha y estado."""
    if estado and estado not in reportes.ESTADOS:
        return 400, {"message": "Estado no válido."}
    if desde and hasta and desde > hasta:
        return 400, {"message": "La fecha «desde» no puede ser posterior a «hasta»."}
    return 200, analisis.analisis(desde, hasta, estado or None)


@router.get("/cotizaciones/{cotizacion_id}/", response={200: CotizacionDetalladaSchema, 404: MessageSchema}, auth=AuthBearer())
def obtener_cotizacion_detalle(request, cotizacion_id: int):
    try:
        cotizacion = Cotizacion.objects.select_related(
            "base_terreno__proveedor", "revestimiento__proveedor", "usuario"
        ).prefetch_related(
            "hitos_pago", "detalles_insumo__catalogo_tipo__proveedor", "obras_ejecucion"
        ).get(id=cotizacion_id)
        return 200, cotizacion
    except Cotizacion.DoesNotExist:
        return 404, {"message": "Cotización no encontrada"}


@router.post("/cotizaciones/{cotizacion_id}/resumen/", response={200: dict, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer(), throttle=[AuthRutaThrottle("10/m")])
def resumir_cotizacion(request, cotizacion_id: int, para: str = "interno"):
    """Resumen del proyecto para la empresa (para=interno) o para enviar al cliente (para=cliente)."""
    if para not in ("interno", "cliente"):
        return 400, {"message": "Use para=interno o para=cliente."}
    cot = Cotizacion.objects.filter(id=cotizacion_id).first()
    return (200, resumen.resumir(cot, para)) if cot else (404, {"message": "Cotización no encontrada"})


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
    esperado = dominio.estado_segun_pagos(list(cotizacion.hitos_pago.all()))
    if data.estado != esperado:
        return 409, {"message": f"El estado no se cambia a mano: se actualiza solo con los pagos. Este proyecto está «{dominio.ETIQUETA_ESTADO[esperado]}»."}
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
        error = pagos.repartir_en_hitos(cot, delta)
        if error:
            return 409, {"message": error}
        cot.nivelacion_modalidad, cot.nivelacion_m3, cot.costo_nivelacion = n["modalidad"], n["m3"], n["costo"]
        cot.costo_total += delta
        cot.save(update_fields=["nivelacion_modalidad", "nivelacion_m3", "costo_nivelacion", "costo_total"])
        pagos.reconciliar(cot)
    return 200, resultado


ESTADOS_COTIZACION = {"BORRADOR", "ACEPTADA", "FINALIZADA"}
_CAMPOS_PRECIO = {"superficie_m2", "distancia_flete_km", "base_terreno_id", "revestimiento_id",
                  "m2_vigas_vista", "ganancia_m2", "radier_m2", "ajuste_monto",
                  "n_trabajadores", "dias_obra", "lleva_radier", "tarifa_radier_m2", "precio_litro", "tarifas_personalizadas"}
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
                materiales=[MaterialAdicionalInSchema(catalogo_id=d.catalogo_tipo_id, cantidad=float(d.cantidad_calculada),
                                                      mano_obra_m2=float(d.mano_obra_m2))   # se mantiene la tarifa con la que se cotizó
                            for d in cot.detalles_insumo.filter(es_adicional=True)],
                maestros=[ManoObraInSchema(cantidad=l.cantidad, cobro=float(l.cobro)) for l in cot.mano_obra.all()],
                modo_lista=cot.modo_lista, modo_tarifas=cot.modo_tarifas, n_trabajadores=cot.n_trabajadores,
                dias_obra=cot.dias_obra, lleva_radier=cot.lleva_radier,
                tarifa_radier_m2=float(cot.tarifa_radier_m2), precio_litro=float(cot.precio_litro),
                tarifas_personalizadas=cot.tarifas_personalizadas,
                traslados=[TrasladoInSchema(tipo=x.tipo, combustible=x.combustible, dias=x.dias, precio_litro=float(x.precio_litro))
                           for x in cot.traslados.all()]))
        except ValueError as e:
            return 400, {"message": _msj(e)}
        cot.costo_materiales, cot.costo_mano_obra, cot.costo_flete = (
            r["costo_materiales_total"], r["costo_mano_obra"], r["costo_flete"])
        nuevo_total = r["total"] + cot.costo_nivelacion + cot.ajuste_monto
    if nuevo_total < 0:
        return 400, {"message": "El descuento es mayor que el valor del proyecto: el total no puede quedar bajo $0."}
    delta = nuevo_total - total_anterior
    resultado = {"total_anterior": total_anterior, "total_nuevo": nuevo_total, "diferencia": delta}
    if not aplicar:
        return 200, resultado
    if delta and not motivo:
        return 400, {"message": "Indique el motivo del reajuste del monto."}
    with transaction.atomic():
        error = pagos.repartir_en_hitos(cot, delta)
        if error:
            return 409, {"message": error}
        cot.costo_total = nuevo_total
        cot.save()
        pagos.reconciliar(cot)
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
            "base_terreno__proveedor", "revestimiento__proveedor", "usuario"
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
        return 400, {"message": _msj(e)}


# ==============================================================================
# 6. HITOS DE PAGO
# ==============================================================================
@router.get("/cotizaciones/{cotizacion_id}/hitos/", response=List[HitoPagoSchema], auth=AuthBearer())
def listar_hitos_cotizacion(request, cotizacion_id: int):
    return HitoPago.objects.filter(cotizacion_id=cotizacion_id).order_by("id")


MIME_COMPROBANTE = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


def _leer_comprobante(data_url: str):
    """'data:...;base64,...' -> (mime, bytes). ValueError con mensaje para el usuario si no sirve."""
    try:
        cabecera, b64 = data_url.split(",", 1)
        mime, contenido = cabecera.split(";")[0].removeprefix("data:"), base64.b64decode(b64, validate=True)
    except Exception:
        raise ValueError("El comprobante no se pudo leer.")
    if mime not in MIME_COMPROBANTE:
        raise ValueError("El comprobante debe ser una imagen (JPG, PNG, WebP) o un PDF.")
    if len(contenido) > MAX_BYTES_IMAGEN:
        raise ValueError("El comprobante puede pesar hasta 2,5 MB.")
    return mime, contenido


@router.post("/hitos-pago/{hito_id}/registros/", response={200: HitoPagoSchema, 400: MessageSchema, 404: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def registrar_pago(request, hito_id: int, data: RegistroPagoInSchema):
    """Anota un abono en el libro de pagos. El monto es lo pagado ahora; no puede superar lo que falta del hito."""
    comprobante = None
    if data.comprobante:
        try:
            mime, contenido = _leer_comprobante(data.comprobante)
        except ValueError as e:
            return 400, {"message": _msj(e)}
        comprobante = (mime, contenido, data.comprobante_nombre)
    try:
        return 200, pagos.registrar_abono(hito_id, Decimal(str(data.monto)).quantize(Decimal("1")), data.metodo, data.fecha,
                                          data.nota, comprobante, request.auth)
    except ErrorDeNegocio as e:
        return _responder_error(e)


@router.delete("/registros-pago/{registro_id}/", response={200: HitoPagoSchema, 404: MessageSchema, 409: ConfirmarSchema}, auth=AuthBearer())
def anular_registro_pago(request, registro_id: int, forzar: bool = False):
    """Corrige un abono mal ingresado: lo elimina del libro y el hito vuelve a calcularse. Si el pago respalda un avance ya
    registrado responde 409 con `confirmar`; repetido con `forzar=true` lo anula y baja el avance al que permiten los pagos."""
    try:
        return 200, pagos.anular_abono(registro_id, forzar)
    except ErrorDeNegocio as e:
        return _responder_error(e)


@router.put("/registros-pago/{registro_id}/comprobante/", response={200: HitoPagoSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def reemplazar_comprobante(request, registro_id: int, data: ComprobanteInSchema):
    """Cambia el comprobante de un abono ya registrado (por ejemplo, si se adjuntó el equivocado)."""
    try:
        mime, contenido = _leer_comprobante(data.comprobante)
    except ValueError as e:
        return 400, {"message": _msj(e)}
    try:
        return 200, pagos.reemplazar_comprobante(registro_id, (mime, contenido, data.comprobante_nombre))
    except ErrorDeNegocio as e:
        return _responder_error(e)


@router.get("/registros-pago/{registro_id}/comprobante/", auth=AuthBearer())
def ver_comprobante(request, registro_id: int):
    reg = DetalleRegistro.objects.filter(id=registro_id).first()
    if not reg or not reg.comprobante_mime:
        return HttpResponse(status=404)
    r = HttpResponse(bytes(reg.comprobante), content_type=reg.comprobante_mime)
    nombre = re.sub(r"[^\w. -]", "_", reg.comprobante_nombre) or "comprobante"
    r["Content-Disposition"] = f'inline; filename="{nombre}"'
    r["Cache-Control"] = "private, max-age=86400"
    return r


@router.patch("/hitos-pago/{hito_id}/", response={200: HitoPagoSchema, 404: MessageSchema, 400: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def actualizar_hito_pago(request, hito_id: int, data: HitoPagoUpdateSchema):
    """Compatibilidad con el registro por total: `pago_completo=True` (o PAGADO) abona lo que falta; `monto_abonado` es el
    total recibido (anota la diferencia como un abono); PENDIENTE borra todos los abonos. No admite bajar un total: para
    corregir se anula el abono desde el libro de pagos."""
    hito = HitoPago.objects.filter(id=hito_id).first()
    if not hito:
        return 404, {"message": "Hito de pago no encontrado"}
    if data.pago_completo is True or data.estado == "PAGADO":
        objetivo = hito.monto_pago
    elif data.estado == "PENDIENTE" and data.monto_abonado is None:
        objetivo = Decimal(0)
    elif data.pago_completo is False or data.monto_abonado is not None:
        if data.monto_abonado is None:
            return 400, {"message": "Indique cuánto se pagó."}
        objetivo = Decimal(str(data.monto_abonado)).quantize(Decimal("1"))
        if objetivo < 0 or objetivo > hito.monto_pago:
            return 400, {"message": f"El monto pagado debe estar entre $0 y {dominio.pesos(hito.monto_pago)}."}
    elif data.estado is not None:
        return 400, {"message": "Estado de pago no válido."}
    else:
        objetivo = hito.monto_abonado
    if data.metodo is not None and data.metodo not in dict(METODOS_PAGO):
        return 400, {"message": "Método de pago no válido."}
    try:
        return 200, pagos.fijar_total_pagado(hito_id, objetivo, data.metodo, data.fecha_pago, request.auth, data.comprobante_ref)
    except ErrorDeNegocio as e:
        return _responder_error(e)


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
    minimo, maximo = dominio.limites_avance(list(c.hitos_pago.all()))
    return 200, {
        "neto_cobrado": neto, "costo_presupuestado": presupuestado,
        "ganancia_estimada": neto - presupuestado,
        "avance_real": obra.porcentaje_avance_real, "avance_minimo": minimo, "avance_maximo": maximo,
    }


@router.patch("/obras/{obra_id}/", response={200: ObraEjecucionSchema, 404: MessageSchema, 400: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def actualizar_obra(request, obra_id: int, data: ObraEjecucionInSchema):
    try:
        return 200, obras.corregir_avance(obra_id, data.dict(exclude_unset=True))
    except ErrorDeNegocio as e:
        return _responder_error(e)
    except Exception as e:
        return 400, {"message": _msj(e)}


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
    fotos = Prefetch("fotos", queryset=BitacoraFoto.objects.defer("contenido"))
    return BitacoraAvance.objects.select_related("usuario").prefetch_related(fotos).filter(cotizacion_id=cotizacion_id)


@router.post("/cotizaciones/{cotizacion_id}/bitacora/", response={200: BitacoraSchema, 400: MessageSchema, 404: MessageSchema, 409: MessageSchema}, auth=AuthBearer())
def registrar_avance(request, cotizacion_id: int, data: BitacoraInSchema):
    """Registra un avance (porcentaje + comentario + fotos) y actualiza el avance de la obra, que debe ser coherente con los pagos."""
    cot = Cotizacion.objects.filter(id=cotizacion_id).first()
    if not cot:
        return 404, {"message": "Cotización no encontrada"}
    try:
        return 200, obras.registrar_avance(cot, Decimal(str(data.porcentaje)), data.comentario, request.auth,
                                           lambda b: _guardar_fotos_bitacora(b, data.imagenes))
    except ErrorDeNegocio as e:
        return _responder_error(e)
    except ValueError as e:
        return 400, {"message": _msj(e)}


@router.patch("/bitacora/{bitacora_id}/", response={200: BitacoraSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def agregar_fotos_bitacora(request, bitacora_id: int, data: BitacoraFotosInSchema):
    b = BitacoraAvance.objects.filter(id=bitacora_id).first()
    if not b:
        return 404, {"message": "Registro no encontrado"}
    try:
        with transaction.atomic():
            _guardar_fotos_bitacora(b, data.agregar_imagenes)
    except ValueError as e:
        return 400, {"message": _msj(e)}
    return 200, b


@router.delete("/bitacora/{bitacora_id}/", response={200: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def eliminar_bitacora(request, bitacora_id: int):
    """Elimina un registro mal ingresado; el avance de la obra vuelve al del último registro que queda."""
    b = BitacoraAvance.objects.select_related("cotizacion").filter(id=bitacora_id).first()
    if not b:
        return 404, {"message": "Registro no encontrado"}
    obras.quitar_registro(b)
    return 200, {"message": "Registro eliminado"}


@router.get("/bitacora/fotos/{foto_id}/", auth=AuthBearer())
def servir_foto_bitacora(request, foto_id: int):
    f = BitacoraFoto.objects.filter(id=foto_id).first()
    if not f:
        return HttpResponse(status=404)
    r = HttpResponse(bytes(f.contenido), content_type=f.tipo_mime)
    r["Cache-Control"] = "private, max-age=86400"
    return r


MAX_BYTES_CONTRATO = 3_000_000  # el cuerpo en base64 debe caber en el límite de 4,5 MB de Vercel


def _pdf_respuesta(c):
    r = HttpResponse(bytes(c.contenido), content_type="application/pdf")
    r["Content-Disposition"] = f'inline; filename="{c.nombre_archivo}"'
    r["Cache-Control"] = "private, max-age=0"
    return r


@router.post("/cotizaciones/{cotizacion_id}/contrato/", response={200: MessageSchema, 400: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def subir_contrato(request, cotizacion_id: int, data: ContratoInSchema):
    """Adjunta (o reemplaza) el PDF del contrato notarial del proyecto."""
    if not Cotizacion.objects.filter(id=cotizacion_id).exists():
        return 404, {"message": "Cotización no encontrada"}
    try:
        contenido = base64.b64decode(data.pdf.split(",", 1)[-1], validate=True)
    except Exception:
        return 400, {"message": "El archivo no se pudo leer."}
    if not contenido.startswith(b"%PDF-"):
        return 400, {"message": "El contrato debe ser un archivo PDF."}
    if len(contenido) > MAX_BYTES_CONTRATO:
        return 400, {"message": "El PDF puede pesar hasta 3 MB."}
    nombre = re.sub(r'[^\w.\- ]', "_", data.nombre_archivo)[:150] or "contrato.pdf"
    ContratoNotarial.objects.update_or_create(cotizacion_id=cotizacion_id, defaults={"nombre_archivo": nombre, "contenido": contenido, "fecha_subida": datetime.now(tz.utc)})
    return 200, {"message": "Contrato adjuntado"}


@router.get("/cotizaciones/{cotizacion_id}/contrato/", auth=AuthBearer())
def ver_contrato(request, cotizacion_id: int):
    c = ContratoNotarial.objects.filter(cotizacion_id=cotizacion_id).first()
    return _pdf_respuesta(c) if c else HttpResponse(status=404)


@router.delete("/cotizaciones/{cotizacion_id}/contrato/", response={200: MessageSchema, 404: MessageSchema}, auth=AuthBearer())
def quitar_contrato(request, cotizacion_id: int):
    borrados, _ = ContratoNotarial.objects.filter(cotizacion_id=cotizacion_id).delete()
    return (200, {"message": "Contrato eliminado"}) if borrados else (404, {"message": "El proyecto no tiene contrato"})


@router.get("/cotizaciones/public/{token}/contrato")
def ver_contrato_publico(request, token: uuid.UUID):
    """El cliente lo descarga con el enlace privado de su ficha."""
    c = ContratoNotarial.objects.filter(cotizacion__token_publico=token).first()
    return _pdf_respuesta(c) if c else HttpResponse(status=404)


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
    tarifas = {**calculo.vigentes(), **{k: Decimal(str(v)) for k, v in cot.tarifas_personalizadas.items()}}  # las de esta cotización mandan
    if cot.modo_tarifas:
        adicionales = [{"nombre": d.catalogo_tipo.nombre, "cantidad": d.cantidad_calculada, "mano_obra_m2": d.mano_obra_m2}
                       for d in detalles if d.es_adicional]
        lineas = calculo.lineas_mano_obra_tarifas(cot.superficie_m2, cot.n_trabajadores, cot.m2_vigas_vista, cot.tipo_proyecto,
                                                  adicionales, cot.lleva_radier, cot.tarifa_radier_m2, tarifas)
        mano_obra = [{"concepto": l["concepto"], "m2": float(l["m2"]), "tarifa": float(l["tarifa"]),
                      "trabajadores": l["trabajadores"], "subtotal": float(l["subtotal"])} for l in lineas]
        dias = cot.dias_obra + (int(tarifas["dias_fabricacion_radier"]) if cot.lleva_radier else 0)
        tr = calculo.traslado_combustible(cot.distancia_flete_km, dias, cot.precio_litro, tarifas["km_por_litro"])
        traslado = {"km": float(tr["km"]), "dias": tr["dias"], "litros": float(tr["litros"]),
                    "precio_litro": float(tr["precio_litro"]), "costo": float(tr["costo"])}
    else:
        mano_obra = [{"concepto": "Mano de obra", "trabajadores": l.cantidad, "tarifa": float(l.cobro), "subtotal": float(l.cantidad * l.cobro)}
                     for l in cot.mano_obra.all()]
    if cot.traslados.exists():  # tres traslados, cada uno con su combustible y sus días
        res = calculo.traslados_combustible(cot.distancia_flete_km, [{"tipo": x.tipo, "combustible": x.combustible, "dias": x.dias,
                                            "precio_litro": x.precio_litro} for x in cot.traslados.all()], tarifas["km_por_litro"],
                                            int(tarifas["dias_fabricacion_radier"]) if cot.lleva_radier else 0)
        traslado = {"km": float(res["km"]), "costo": float(res["costo"]),
                    "lineas": [{k: (float(v) if isinstance(v, Decimal) else v) for k, v in l.items()} for l in res["lineas"]]}
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


def _portafolio():
    """Obras con sus fotos, sin leer los bytes de cada foto (solo se necesita el id para su dirección)."""
    fotos = Prefetch("imagenes", queryset=PortafolioImagen.objects.defer("contenido"))
    return PortafolioProyecto.objects.select_related("cotizacion__revestimiento").prefetch_related(fotos).order_by("-id")


@router.get("/portafolio/", response=List[PortafolioProyectoSchema])
def listar_portafolio(request):
    return _portafolio().filter(publicado=True)


@router.get("/portafolio/admin/", response=List[PortafolioProyectoSchema], auth=AuthBearer())
def listar_portafolio_admin(request):
    return _portafolio()


@router.get("/portafolio/imagenes/{imagen_id}/")
def servir_imagen_portafolio(request, imagen_id: int):
    img = PortafolioImagen.objects.filter(id=imagen_id).first()
    if not img:
        return HttpResponse(status=404)
    r = HttpResponse(bytes(img.contenido), content_type=img.tipo_mime)
    r["Cache-Control"] = "public, max-age=86400"
    return r


@router.post("/portafolio/", response={200: PortafolioProyectoSchema, 400: MessageSchema}, auth=AuthAdmin())
def crear_proyecto_portafolio(request, data: PortafolioProyectoInSchema):
    try:
        with transaction.atomic():
            proyecto = PortafolioProyecto.objects.create(**data.dict(exclude={"imagenes"}))
            _guardar_imagenes(proyecto, data.imagenes)
        return 200, proyecto
    except ValueError as e:
        return 400, {"message": _msj(e)}
    except Exception as e:
        return 400, {"message": _msj(e)}


@router.patch("/portafolio/{proyecto_id}/", response={200: PortafolioProyectoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def editar_proyecto_portafolio(request, proyecto_id: int, data: PortafolioProyectoUpdateSchema):
    proyecto = PortafolioProyecto.objects.filter(id=proyecto_id).first()
    if not proyecto:
        return 404, {"message": "Proyecto no encontrado"}
    if request.auth.rol != "ADMIN" and (set(data.dict(exclude_unset=True)) != {"publicado"}):
        raise PermisoDenegado("Su rol (Operador) solo puede ocultar o publicar proyectos del portafolio.")
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
        return 400, {"message": _msj(e)}


# ==============================================================================
# CATÁLOGO DE CASAS PREDISEÑADAS (se muestra en la página pública; se edita desde el panel)
# ==============================================================================
def _guardar_imagenes_casa(casa, data_urls):
    existentes = casa.imagenes.count()
    if existentes + len(data_urls) > MAX_IMAGENES:
        raise ValueError(f"Una casa admite hasta {MAX_IMAGENES} imágenes.")
    for n, du in enumerate(data_urls, start=existentes):
        mime, contenido = _decodificar_imagen(du)
        CasaCatalogoImagen.objects.create(casa=casa, contenido=contenido, tipo_mime=mime, orden=n)


def _catalogo_casas():
    return CasaCatalogo.objects.prefetch_related(Prefetch("imagenes", queryset=CasaCatalogoImagen.objects.defer("contenido")))


@router.get("/catalogo-casas/", response=List[CasaCatalogoSchema])
def listar_catalogo_casas(request):
    return _catalogo_casas().filter(publicado=True)


@router.get("/catalogo-casas/admin/", response=List[CasaCatalogoSchema], auth=AuthBearer())
def listar_catalogo_casas_admin(request):
    return _catalogo_casas()


@router.get("/catalogo-casas/imagenes/{imagen_id}/")
def servir_imagen_casa(request, imagen_id: int):
    img = CasaCatalogoImagen.objects.filter(id=imagen_id).first()
    if not img:
        return HttpResponse(status=404)
    r = HttpResponse(bytes(img.contenido), content_type=img.tipo_mime)
    r["Cache-Control"] = "public, max-age=86400"
    return r


@router.post("/catalogo-casas/", response={200: CasaCatalogoSchema, 400: MessageSchema}, auth=AuthAdmin())
def crear_casa_catalogo(request, data: CasaCatalogoInSchema):
    try:
        with transaction.atomic():
            campos = data.dict(exclude={"imagenes", "incluye"})
            casa = CasaCatalogo.objects.create(**campos, incluye="\n".join(data.incluye))
            _guardar_imagenes_casa(casa, data.imagenes)
        return 200, casa
    except Exception as e:
        return 400, {"message": _msj(e)}


@router.patch("/catalogo-casas/{casa_id}/", response={200: CasaCatalogoSchema, 404: MessageSchema, 400: MessageSchema}, auth=AuthBearer())
def editar_casa_catalogo(request, casa_id: int, data: CasaCatalogoUpdateSchema):
    casa = CasaCatalogo.objects.filter(id=casa_id).first()
    if not casa:
        return 404, {"message": "Casa no encontrada"}
    if request.auth.rol != "ADMIN" and set(data.dict(exclude_unset=True)) != {"publicado"}:
        raise PermisoDenegado("Su rol (Operador) solo puede ocultar o publicar casas del catálogo.")
    try:
        with transaction.atomic():
            for k, val in data.dict(exclude_unset=True, exclude={"agregar_imagenes", "quitar_imagenes", "incluye"}).items():
                if val is not None:
                    setattr(casa, k, val)
            if data.incluye is not None:
                casa.incluye = "\n".join(data.incluye)
            casa.save()
            casa.imagenes.filter(id__in=data.quitar_imagenes).delete()
            _guardar_imagenes_casa(casa, data.agregar_imagenes)
        return 200, casa
    except Exception as e:
        return 400, {"message": _msj(e)}


@router.delete("/catalogo-casas/{casa_id}/", response={200: MessageSchema, 404: MessageSchema}, auth=AuthAdmin())
def eliminar_casa_catalogo(request, casa_id: int):
    n, _ = CasaCatalogo.objects.filter(id=casa_id).delete()
    return (200, {"message": "Casa eliminada"}) if n else (404, {"message": "Casa no encontrada"})


@router.delete("/portafolio/{proyecto_id}/", response={200: MessageSchema, 404: MessageSchema}, auth=AuthAdmin())
def eliminar_proyecto_portafolio(request, proyecto_id: int):
    n, _ = PortafolioProyecto.objects.filter(id=proyecto_id).delete()
    return (200, {"message": "Proyecto eliminado"}) if n else (404, {"message": "Proyecto no encontrado"})
