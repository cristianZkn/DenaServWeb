"""Capa de servicios de negocio: pagos y avance de obra. No conocen HTTP ni el ORM.

- Reciben sus repositorios por constructor (inyección de dependencias), de modo que se prueban con repositorios en memoria.
- Cada operación es una unidad de trabajo: `unidad_de_trabajo` (por defecto transaction.atomic) la envuelve y, si lanza
  una excepción, se deshace todo lo hecho.
- Los errores de negocio se lanzan como ErrorDeNegocio / ConfirmacionRequerida; la capa de la API los traduce a 400/409."""
from datetime import date
from decimal import Decimal

from django.db import transaction

from . import dominio
from .repositorios import BitacoraRepositorio, CotizacionRepositorio, HitoRepositorio, ObraRepositorio, RegistroPagoRepositorio


class ErrorDeNegocio(Exception):
    """Una regla del negocio impide la operación. `estado` es el código HTTP con que la API responde (400 por defecto)."""

    def __init__(self, mensaje, estado=400):
        super().__init__(mensaje)
        self.estado = estado


class ConfirmacionRequerida(ErrorDeNegocio):
    """La operación contradice algo ya registrado (p. ej. un avance): se deshace y el cliente debe confirmar para repetirla."""

    def __init__(self, mensaje):
        super().__init__(mensaje, 409)


class ServicioPagos:
    def __init__(self, hitos, registros, obras, cotizaciones, unidad_de_trabajo=transaction.atomic):
        self.hitos, self.registros, self.obras, self.cotizaciones = hitos, registros, obras, cotizaciones
        self.unidad = unidad_de_trabajo

    @classmethod
    def por_defecto(cls):
        return cls(HitoRepositorio(), RegistroPagoRepositorio(), ObraRepositorio(), CotizacionRepositorio())

    # --- coherencia entre pagos, estado y avance ---
    def reconciliar(self, cotizacion, forzar=False):
        """Deja el estado y el avance coherentes con los pagos. Si el cambio de pagos contradice el avance ya registrado devuelve
        un mensaje (quien llama debe revertirlo y pedir confirmación); con `forzar` el avance de la obra baja al máximo que
        permiten los pagos y los registros de la bitácora se conservan como historial."""
        hitos = self.hitos.de_cotizacion(cotizacion)
        obra = self.obras.de_cotizacion(cotizacion)
        minimo, maximo = dominio.limites_avance(hitos)
        avance = obra.porcentaje_avance_real
        if avance > maximo and not forzar:
            return (f"Este pago respalda el {int(avance)} % de avance que registra la obra. "
                    f"Si lo anula, el avance de la obra bajará a {int(maximo)} %.")
        for limite, fuera in ((maximo, avance > maximo), (minimo, avance < minimo)):
            if fuera:
                obra.porcentaje_avance_real, obra.fecha_ultima_actualizacion = limite, date.today()
                self.obras.guardar(obra, ["porcentaje_avance_real", "fecha_ultima_actualizacion"])
        estado = dominio.estado_segun_pagos(hitos)
        if cotizacion.estado != estado:
            cotizacion.estado = estado
            self.cotizaciones.guardar(cotizacion, ["estado"])
        return None

    def _sincronizar_hito(self, hito):
        """El monto abonado, el estado y la fecha del hito salen siempre del libro de pagos."""
        registros = self.registros.de_hito(hito)
        hito.monto_abonado, hito.estado = dominio.abonado_y_estado([r.monto for r in registros], hito.monto_pago)
        hito.fecha_pago = registros[-1].fecha if registros else None
        self.hitos.guardar(hito, ["monto_abonado", "estado", "fecha_pago"])

    def _confirmar_cambio(self, hito, forzar=False):
        self._sincronizar_hito(hito)
        error = self.reconciliar(hito.cotizacion, forzar)
        if error:
            raise ConfirmacionRequerida(error)  # sale de la unidad de trabajo: se deshace el cambio de pagos
        return self.hitos.refrescar(hito.id)

    # --- operaciones ---
    def registrar_abono(self, hito_id, monto, metodo, fecha, nota, comprobante, usuario):
        """Anota un abono en el libro de pagos. `comprobante` es (mime, bytes, nombre) o None. No puede superar lo que falta del hito."""
        with self.unidad():
            # Se bloquea el hito y se lee su saldo dentro de la transacción: dos abonos simultáneos no pueden pasarse del total.
            hito = self.hitos.obtener(hito_id, bloquear=True)
            if hito is None:
                raise ErrorDeNegocio("Hito de pago no encontrado", 404)
            error = dominio.error_de_abono(monto, hito.monto_pago - hito.monto_abonado)
            if error:
                raise ErrorDeNegocio(error)
            mime, contenido, nombre = comprobante or ("", None, "")
            self.registros.crear(hito=hito, monto=monto, metodo=metodo, fecha=fecha or date.today(), nota=nota.strip(),
                                 comprobante=contenido, comprobante_mime=mime, comprobante_nombre=nombre, usuario=usuario)
            return self._confirmar_cambio(hito)

    def anular_abono(self, registro_id, forzar=False):
        """Elimina un abono mal ingresado y recalcula el hito. Si respalda un avance ya registrado pide confirmación (`forzar`)."""
        registro = self.registros.obtener(registro_id)
        if registro is None:
            raise ErrorDeNegocio("Registro de pago no encontrado", 404)
        with self.unidad():
            self.registros.eliminar(registro)
            return self._confirmar_cambio(registro.hito, forzar)

    def reemplazar_comprobante(self, registro_id, comprobante):
        registro = self.registros.obtener(registro_id)
        if registro is None:
            raise ErrorDeNegocio("Registro de pago no encontrado", 404)
        registro.comprobante_mime, registro.comprobante, registro.comprobante_nombre = comprobante
        self.registros.guardar(registro, ["comprobante", "comprobante_mime", "comprobante_nombre"])
        return self.hitos.refrescar(registro.hito_id)

    def fijar_total_pagado(self, hito_id, objetivo, metodo, fecha, usuario, comprobante_ref=None):
        """Lleva lo pagado de un hito a `objetivo`: 0 borra todos los abonos y un total mayor anota la diferencia como un abono.
        No admite bajar un total a una cifra intermedia (para eso se anula el abono equivocado)."""
        hito = self.hitos.obtener(hito_id)
        if hito is None:
            raise ErrorDeNegocio("Hito de pago no encontrado", 404)
        if 0 < objetivo < hito.monto_abonado:
            raise ErrorDeNegocio("El total no puede bajar: anule el abono equivocado desde el historial de pagos.")
        with self.unidad():
            if objetivo == 0:
                self.registros.eliminar_de_hito(hito)
            elif objetivo > hito.monto_abonado:
                self.registros.crear(hito=hito, monto=objetivo - hito.monto_abonado, metodo=metodo or "OTRO", fecha=fecha or date.today(), usuario=usuario)
            if comprobante_ref is not None:
                hito.comprobante_ref = comprobante_ref
                self.hitos.guardar(hito, ["comprobante_ref"])
            return self._confirmar_cambio(hito)

    def repartir_en_hitos(self, cotizacion, delta):
        """Reparte un cambio del monto total entre los hitos pendientes. Devuelve None si se pudo, o el motivo si no (no guarda nada)."""
        if not delta:
            return None
        pendientes = self.hitos.pendientes(cotizacion)
        nuevos, error = dominio.repartir_diferencia(pendientes, delta)
        if error:
            return error
        for h, monto in zip(pendientes, nuevos):
            h.monto_pago = monto
            h.estado = "PAGADO" if h.monto_abonado >= monto else h.estado
            self.hitos.guardar(h, ["monto_pago", "estado"])
        return None


class ServicioObra:
    def __init__(self, hitos, obras, bitacoras, unidad_de_trabajo=transaction.atomic):
        self.hitos, self.obras, self.bitacoras = hitos, obras, bitacoras
        self.unidad = unidad_de_trabajo

    @classmethod
    def por_defecto(cls):
        return cls(HitoRepositorio(), ObraRepositorio(), BitacoraRepositorio())

    def verificar_avance(self, cotizacion, avance, actual=None):
        """Lanza ErrorDeNegocio (409) si el avance no es coherente con los pagos."""
        error = dominio.error_de_avance(self.hitos.de_cotizacion(cotizacion), avance, actual)
        if error:
            raise ErrorDeNegocio(error, 409)

    def corregir_avance(self, obra_id, campos):
        """Cambia datos de la obra; si incluye el avance, debe ser coherente con los pagos."""
        obra = self.obras.obtener(obra_id)
        if obra is None:
            raise ErrorDeNegocio("Obra no encontrada", 404)
        if campos.get("porcentaje_avance_real") is not None:
            self.verificar_avance(obra.cotizacion, Decimal(str(campos["porcentaje_avance_real"])))
        for atributo, valor in campos.items():
            if valor is not None:
                setattr(obra, atributo, valor)
        self.obras.guardar(obra)
        return obra

    def registrar_avance(self, cotizacion, porcentaje, comentario, usuario, guardar_fotos):
        """Registra un avance en la bitácora y lo lleva a la obra. `guardar_fotos(bitacora)` adjunta las fotos dentro de la misma transacción."""
        obra = self.obras.de_cotizacion(cotizacion)
        self.verificar_avance(cotizacion, porcentaje, obra.porcentaje_avance_real)
        with self.unidad():
            registro = self.bitacoras.crear(cotizacion=cotizacion, porcentaje=porcentaje, comentario=comentario.strip(), usuario=usuario)
            guardar_fotos(registro)
            obra.porcentaje_avance_real, obra.fecha_ultima_actualizacion = porcentaje, date.today()
            self.obras.guardar(obra, ["porcentaje_avance_real", "fecha_ultima_actualizacion"])
        return registro

    def quitar_registro(self, bitacora):
        """Elimina un registro de la bitácora; el avance vuelve al del último que queda (dentro de lo que permiten los pagos)."""
        cotizacion = bitacora.cotizacion
        with self.unidad():
            self.bitacoras.eliminar(bitacora)
            restante = max(self.bitacoras.porcentajes(cotizacion), default=Decimal(0))
            obra = self.obras.de_cotizacion(cotizacion)
            obra.porcentaje_avance_real = dominio.avance_tras_quitar_registro(restante, self.hitos.de_cotizacion(cotizacion))
            obra.fecha_ultima_actualizacion = date.today()
            self.obras.guardar(obra, ["porcentaje_avance_real", "fecha_ultima_actualizacion"])
