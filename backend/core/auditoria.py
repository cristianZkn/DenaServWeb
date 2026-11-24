"""Auditoría automática: cada alta, cambio o baja de las entidades principales queda con el usuario que la hizo.

El usuario de la petición se guarda en una variable de contexto (la fija AuthBearer y la limpia el middleware); los
cambios que no vienen de una persona (planificador de precios, comandos) no se registran."""
from contextvars import ContextVar

from django.db.models.signals import post_delete, post_save

_usuario = ContextVar("usuario_auditoria", default=None)

# Entidades que se auditan (nombre del modelo en core.models).
AUDITADAS = ("Usuario", "Proveedor", "CatalogoTipo", "Cotizacion", "HitoPago", "DetalleRegistro", "ObraEjecucion", "BitacoraAvance",
             "PortafolioProyecto", "CasaCatalogo", "Tarifa", "ContratoNotarial")


def fijar_usuario(usuario):
    _usuario.set(usuario)


class AuditoriaMiddleware:
    """Cada petición empieza y termina sin usuario, para que un hilo reutilizado no arrastre el de la anterior."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _usuario.set(None)
        try:
            return self.get_response(request)
        finally:
            _usuario.set(None)


def _registrar(accion, instancia, update_fields=None):
    from .models import RegistroAuditoria
    usuario = _usuario.get()
    if usuario is None:
        return
    detalle = str(instancia)[:200]
    if update_fields:
        detalle = f"{detalle} (campos: {', '.join(sorted(update_fields))})"[:255]
    RegistroAuditoria.objects.create(usuario=usuario, usuario_nombre=usuario.nombre_completo, accion=accion,
                                     entidad=type(instancia).__name__, entidad_id=instancia.pk, detalle=detalle)


def _al_guardar(sender, instance, created, update_fields=None, **kw):
    _registrar("CREAR" if created else "MODIFICAR", instance, update_fields)


def _al_eliminar(sender, instance, **kw):
    _registrar("ELIMINAR", instance)


def conectar():
    from django.apps import apps
    for nombre in AUDITADAS:
        modelo = apps.get_model("core", nombre)
        post_save.connect(_al_guardar, sender=modelo, dispatch_uid=f"auditar_guardar_{nombre}")
        post_delete.connect(_al_eliminar, sender=modelo, dispatch_uid=f"auditar_eliminar_{nombre}")
