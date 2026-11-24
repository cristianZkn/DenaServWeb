"""Pruebas unitarias de la capa de negocio (core/dominio.py y core/servicios.py): sin base de datos, con repositorios en memoria."""
from contextlib import nullcontext
from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace as NS

from django.test import SimpleTestCase

from . import dominio
from .servicios import ConfirmacionRequerida, ErrorDeNegocio, ServicioObra, ServicioPagos


def hito(fase, estado="PENDIENTE", porcentaje=40, monto_pago=400, abonado=0, id=1):
    return NS(id=id, fase=fase, estado=estado, porcentaje=D(porcentaje), monto_pago=D(monto_pago), monto_abonado=D(abonado),
              fecha_pago=None, comprobante_ref=None, cotizacion=None)


class DominioPagosTests(SimpleTestCase):
    def test_estado_segun_pagos(self):
        pend = [hito("ANTICIPO_40"), hito("AVANCE_30"), hito("ENTREGA_30")]
        self.assertEqual(dominio.estado_segun_pagos(pend), "BORRADOR")
        pend[0].estado = "ABONADO"                                              # abono parcial: sigue cotizado
        self.assertEqual(dominio.estado_segun_pagos(pend), "BORRADOR")
        pend[0].estado = "PAGADO"
        self.assertEqual(dominio.estado_segun_pagos(pend), "ACEPTADA")
        for h in pend:
            h.estado = "PAGADO"
        self.assertEqual(dominio.estado_segun_pagos(pend), "FINALIZADA")

    def test_limites_de_avance_segun_lo_pagado(self):
        h = [hito("ANTICIPO_40"), hito("AVANCE_30"), hito("ENTREGA_30")]
        self.assertEqual(dominio.limites_avance(h), (0, 0))
        h[0].estado = "PAGADO"
        self.assertEqual(dominio.limites_avance(h), (0, 49))
        h[1].estado = "PAGADO"
        self.assertEqual(dominio.limites_avance(h), (50, 99))
        h[2].estado = "PAGADO"
        self.assertEqual(dominio.limites_avance(h), (100, 100))

    def test_error_de_avance(self):
        h = [hito("ANTICIPO_40", "PAGADO"), hito("AVANCE_30"), hito("ENTREGA_30")]
        self.assertIsNone(dominio.error_de_avance(h, D(30), D(10)))
        self.assertIn("50 %", dominio.error_de_avance(h, D(50)))
        self.assertIn("ya registrado", dominio.error_de_avance(h, D(5), D(10)))

    def test_abono_y_estado_del_hito(self):
        self.assertEqual(dominio.abonado_y_estado([], D(100)), (D(0), "PENDIENTE"))
        self.assertEqual(dominio.abonado_y_estado([D(30)], D(100)), (D(30), "ABONADO"))
        self.assertEqual(dominio.abonado_y_estado([D(80), D(80)], D(100)), (D(100), "PAGADO"))  # nunca supera el monto del hito

    def test_validacion_del_abono(self):
        self.assertIsNone(dominio.error_de_abono(D(100), D(100)))
        self.assertIn("$1.000", dominio.error_de_abono(D(2000), D(1000)))
        self.assertIsNotNone(dominio.error_de_abono(D(0), D(1000)))

    def test_reparto_de_la_diferencia_entre_hitos_pendientes(self):
        hs = [hito("AVANCE_30", porcentaje=30, monto_pago=300), hito("ENTREGA_30", porcentaje=30, monto_pago=300)]
        nuevos, error = dominio.repartir_diferencia(hs, D(101))
        self.assertIsNone(error)
        self.assertEqual(sum(nuevos), D(701))                                   # el último absorbe el redondeo
        hs[0].monto_abonado = D(250)
        _, error = dominio.repartir_diferencia(hs, D(-200))                     # rebaja bajo lo ya cobrado
        self.assertIn("Anule antes el abono", error)
        self.assertIn("Todos los hitos están pagados", dominio.repartir_diferencia([], D(10))[1])


# --- Repositorios en memoria ---
class RepoHitos:
    def __init__(self, hitos):
        self.hitos = hitos

    def obtener(self, hito_id, bloquear=False):
        return next((h for h in self.hitos if h.id == hito_id), None)

    def de_cotizacion(self, cot):
        return self.hitos

    def pendientes(self, cot):
        return [h for h in self.hitos if h.estado != "PAGADO"]

    def guardar(self, hito, campos):
        pass

    def refrescar(self, hito_id):
        return self.obtener(hito_id)


class RepoRegistros:
    def __init__(self, hitos):
        self.hitos, self.filas = hitos, []

    def crear(self, hito, monto, **kw):
        fila = NS(id=len(self.filas) + 1, hito=hito, hito_id=hito.id, monto=monto, **kw)
        self.filas.append(fila)
        return fila

    def obtener(self, registro_id):
        return next((f for f in self.filas if f.id == registro_id), None)

    def de_hito(self, hito):
        return [f for f in self.filas if f.hito_id == hito.id]

    def eliminar(self, registro):
        self.filas.remove(registro)

    def eliminar_de_hito(self, hito):
        self.filas = [f for f in self.filas if f.hito_id != hito.id]

    def guardar(self, registro, campos):
        pass


class RepoObras:
    def __init__(self, avance=0):
        self.obra = NS(porcentaje_avance_real=D(avance), fecha_ultima_actualizacion=None, cotizacion=None)

    def de_cotizacion(self, cot):
        return self.obra

    def obtener(self, obra_id):
        return self.obra

    def guardar(self, obra, campos=None):
        pass


class RepoCotizaciones:
    def guardar(self, cot, campos):
        pass


def servicio_de_pagos(avance=0):
    cot = NS(estado="BORRADOR")
    hs = [hito("ANTICIPO_40", id=1), hito("AVANCE_30", porcentaje=30, monto_pago=300, id=2), hito("ENTREGA_30", porcentaje=30, monto_pago=300, id=3)]
    for h in hs:
        h.cotizacion = cot
    registros, obras = RepoRegistros(hs), RepoObras(avance)
    return ServicioPagos(RepoHitos(hs), registros, obras, RepoCotizaciones(), unidad_de_trabajo=nullcontext), hs, cot, obras


class ServicioPagosTests(SimpleTestCase):
    def test_pagar_el_anticipo_completo_inicia_la_obra(self):
        srv, hs, cot, _ = servicio_de_pagos()
        srv.registrar_abono(1, D(400), "EFECTIVO", date(2026, 1, 5), " nota ", None, usuario=None)
        self.assertEqual((hs[0].estado, hs[0].monto_abonado, cot.estado), ("PAGADO", D(400), "ACEPTADA"))

    def test_abono_parcial_deja_el_hito_abonado_y_la_cotizacion_en_borrador(self):
        srv, hs, cot, _ = servicio_de_pagos()
        srv.registrar_abono(1, D(100), "EFECTIVO", None, "", None, None)
        self.assertEqual((hs[0].estado, cot.estado), ("ABONADO", "BORRADOR"))

    def test_abono_mayor_al_saldo_se_rechaza(self):
        srv, *_ = servicio_de_pagos()
        with self.assertRaises(ErrorDeNegocio) as ctx:
            srv.registrar_abono(1, D(401), "EFECTIVO", None, "", None, None)
        self.assertEqual(ctx.exception.estado, 400)

    def test_hito_inexistente_es_404(self):
        srv, *_ = servicio_de_pagos()
        with self.assertRaises(ErrorDeNegocio) as ctx:
            srv.registrar_abono(99, D(10), "EFECTIVO", None, "", None, None)
        self.assertEqual(ctx.exception.estado, 404)

    def test_anular_un_pago_que_respalda_el_avance_pide_confirmacion_y_con_forzar_baja_el_avance(self):
        def con_avance():                                                       # sin base de datos no hay rollback: cada caso arma su estado
            srv, hs, cot, obras = servicio_de_pagos()
            srv.registrar_abono(1, D(400), "EFECTIVO", None, "", None, None)
            obras.obra.porcentaje_avance_real = D(30)
            return srv, hs, cot, obras
        srv, *_ = con_avance()
        with self.assertRaises(ConfirmacionRequerida) as ctx:
            srv.anular_abono(1)
        self.assertEqual(ctx.exception.estado, 409)
        self.assertIn("30 %", str(ctx.exception))
        srv, hs, cot, obras = con_avance()
        srv.anular_abono(1, forzar=True)
        self.assertEqual((obras.obra.porcentaje_avance_real, hs[0].estado, cot.estado), (D(0), "PENDIENTE", "BORRADOR"))

    def test_fijar_total_no_admite_bajar_a_una_cifra_intermedia(self):
        srv, hs, *_ = servicio_de_pagos()
        srv.fijar_total_pagado(1, D(300), "EFECTIVO", None, None)
        with self.assertRaises(ErrorDeNegocio):
            srv.fijar_total_pagado(1, D(100), "EFECTIVO", None, None)
        srv.fijar_total_pagado(1, D(0), "EFECTIVO", None, None)                 # 0 borra todos los abonos
        self.assertEqual(hs[0].estado, "PENDIENTE")


class ServicioObraTests(SimpleTestCase):
    def test_el_avance_no_puede_superar_lo_que_permiten_los_pagos(self):
        hs = [hito("ANTICIPO_40", "PAGADO"), hito("AVANCE_30"), hito("ENTREGA_30")]
        obras = RepoObras(10)
        srv = ServicioObra(RepoHitos(hs), obras, None, unidad_de_trabajo=nullcontext)
        srv.verificar_avance(NS(), D(40), D(10))                                # permitido
        with self.assertRaises(ErrorDeNegocio) as ctx:
            srv.verificar_avance(NS(), D(60), D(10))
        self.assertEqual(ctx.exception.estado, 409)
