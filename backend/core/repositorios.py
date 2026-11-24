"""Patrón Repository: único lugar donde los servicios de pagos y de obra tocan la base de datos (ORM de Django).

Cada repositorio encapsula las consultas de una entidad; los servicios (core/servicios.py) los reciben por constructor,
así que en las pruebas unitarias se reemplazan por versiones en memoria."""
from datetime import date

from .models import BitacoraAvance, Cotizacion, DetalleRegistro, HitoPago, ObraEjecucion


class HitoRepositorio:
    def obtener(self, hito_id, bloquear=False):
        """El hito con su cotización. `bloquear` toma el candado de la fila hasta terminar la transacción (evita abonos simultáneos)."""
        qs = HitoPago.objects.select_related("cotizacion")
        return (qs.select_for_update() if bloquear else qs).filter(id=hito_id).first()

    def existe(self, hito_id):
        return HitoPago.objects.filter(id=hito_id).exists()

    def de_cotizacion(self, cotizacion):
        return list(HitoPago.objects.filter(cotizacion=cotizacion))

    def pendientes(self, cotizacion):
        return list(cotizacion.hitos_pago.exclude(estado="PAGADO").order_by("id"))

    def guardar(self, hito, campos):
        hito.save(update_fields=campos)

    def refrescar(self, hito_id):
        return HitoPago.objects.get(id=hito_id)


class RegistroPagoRepositorio:
    """Libro de pagos (tabla detalle_registros): cada abono de un hito es una fila."""

    def obtener(self, registro_id):
        return DetalleRegistro.objects.select_related("hito__cotizacion").defer("comprobante").filter(id=registro_id).first()

    def de_hito(self, hito):
        return list(hito.registros.defer("comprobante"))

    def crear(self, **campos):
        return DetalleRegistro.objects.create(**campos)

    def eliminar(self, registro):
        registro.delete()

    def eliminar_de_hito(self, hito):
        hito.registros.all().delete()

    def guardar(self, registro, campos):
        registro.save(update_fields=campos)


class ObraRepositorio:
    def obtener(self, obra_id):
        return ObraEjecucion.objects.select_related("cotizacion").filter(id=obra_id).first()

    def de_cotizacion(self, cotizacion):
        """La obra de la cotización; si aún no existe se crea con avance 0."""
        return cotizacion.obras_ejecucion.first() or ObraEjecucion.objects.create(
            cotizacion=cotizacion, porcentaje_avance_real=0, fecha_ultima_actualizacion=date.today())

    def guardar(self, obra, campos=None):
        obra.save(update_fields=campos)


class CotizacionRepositorio:
    def obtener(self, cotizacion_id):
        return Cotizacion.objects.filter(id=cotizacion_id).first()

    def guardar(self, cotizacion, campos):
        cotizacion.save(update_fields=campos)


class BitacoraRepositorio:
    def crear(self, **campos):
        return BitacoraAvance.objects.create(**campos)

    def porcentajes(self, cotizacion):
        return [x.porcentaje for x in cotizacion.bitacoras.all()]

    def eliminar(self, bitacora):
        bitacora.delete()
