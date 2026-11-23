"""Pruebas del precio de combustible por estación (Copec · Los Ángeles) con respaldo zonal."""
from django.test import TestCase


class CombustiblesPorEstacionTests(TestCase):
    """Precio de Copec en Los Ángeles (Biobío) tomado de las estaciones de la CNE, con respaldo zonal."""
    @staticmethod
    def estacion(marca, comuna, region, precios):
        return {"distribuidor": {"marca": marca}, "ubicacion": {"nombre_comuna": comuna, "nombre_region": region},
                "precios": {k: {"precio": str(v)} for k, v in precios.items()}}

    def respuesta(self, estaciones):
        from unittest import mock
        r = mock.Mock(); r.json.return_value = {"data": estaciones}; r.raise_for_status.return_value = None
        return mock.patch("core.combustibles.requests.get", return_value=r)

    def test_solo_cuenta_copec_de_los_angeles(self):
        from . import combustibles
        est = [self.estacion("COPEC", "Los Ángeles", "Región del Biobío", {"93": 1600, "95": 1640, "97": 1700, "DI": 1500}),
               self.estacion("COPEC", "Los Angeles", "Biobío", {"93": 1608, "95": 1644, "97": 1710, "DI": 1520}),
               self.estacion("SHELL", "Los Ángeles", "Biobío", {"93": 1000, "95": 1000, "97": 1000, "DI": 1000}),
               self.estacion("COPEC", "Providencia", "Metropolitana", {"93": 1900, "95": 1900, "97": 1900, "DI": 1900})]
        with self.respuesta(est):
            precios = combustibles.leer_estaciones()
        self.assertEqual({t: int(p) for t, (p, _) in precios.items()}, {"93": 1604, "95": 1642, "97": 1705, "DIESEL": 1510})
        self.assertEqual(precios["93"][1], "Copec · Los Ángeles")

    def test_si_la_comuna_no_informa_un_combustible_usa_la_region(self):
        from . import combustibles
        est = [self.estacion("COPEC", "Los Ángeles", "Biobío", {"93": 1600, "95": 1640, "97": 1700}),
               self.estacion("COPEC", "Concepción", "Biobío", {"93": 1700, "95": 1700, "97": 1800, "DI": 1600})]
        with self.respuesta(est):
            precios = combustibles.leer_estaciones()
        self.assertEqual((int(precios["DIESEL"][0]), precios["DIESEL"][1]), (1600, "Copec · Región del Biobío"))

    def test_se_guarda_con_el_lugar_y_si_no_hay_estaciones_usa_el_promedio_zonal(self):
        from . import combustibles
        est = [self.estacion("COPEC", "Los Ángeles", "Biobío", {"93": 1600, "95": 1640, "97": 1700, "DI": 1500})]
        with self.respuesta(est):
            combustibles.actualizar()
        self.assertEqual({f["tipo"]: (f["precio"], f["zona"]) for f in combustibles.listar(refrescar=False)}["93"], (1600, "Copec · Los Ángeles"))
        from .models import PrecioCombustible
        PrecioCombustible.objects.all().delete()
        zonal = [{"zona_geografica_nombre": "Zona Sur", "combustible_nombre_largo": n, "precio_promedio": "1650"}
                 for n in ("Gasolina 93", "Gasolina 95", "Gasolina 97", "Petroleo Diesel")]
        with self.respuesta(zonal):
            combustibles.actualizar()
        self.assertEqual(combustibles.listar(refrescar=False)[0]["zona"], "Zona Centro + Zona Sur")

    def test_lee_el_formato_real_de_la_cne_precio_con_tres_decimales_y_lista_de_combustibles(self):
        from . import combustibles
        self.assertEqual(int(combustibles._numero("1666.000")), 1666)
        self.assertEqual(int(combustibles._numero("1.666")), 1666)
        self.assertEqual(int(combustibles._numero("1.666,00")), 1666)
        self.assertIsNone(combustibles._numero("17"))
        est = {"marca": "COPEC", "comuna": "Los Ángeles", "region": "Biobío",
               "combustibles": [{"nombre_largo": n, "precio": p, "unidad_cobro": "$/L"} for n, p in
                                (("Gasolina 93", "1604.000"), ("Gasolina 95", "1666.000"), ("Gasolina 97", "1700.000"), ("Petroleo Diesel", "1500.000"))]}
        with self.respuesta([est]):
            precios = combustibles.leer_estaciones()
        self.assertEqual({t: int(p) for t, (p, _) in precios.items()}, {"93": 1604, "95": 1666, "97": 1700, "DIESEL": 1500})

    def test_la_cne_entrega_la_marca_como_numero_y_se_usa_la_cadena_mas_grande(self):
        from unittest import mock
        from . import combustibles

        def est(marca, comuna, p93):
            return {"marca": marca, "comuna": comuna, "region": "Biobío", "combustibles": [
                {"nombre_largo": n, "precio": f"{p}.000"} for n, p in (("Gasolina 93", p93), ("Gasolina 95", p93 + 40), ("Gasolina 97", p93 + 100), ("Petroleo Diesel", 1500))]}
        lista = [est(5, "Los Ángeles", 1600), est(5, "Los Ángeles", 1610), est(5, "Concepción", 1700), est(5, "Iquique", 1900), est(5, "Temuco", 1800),
                 est(7, "Los Ángeles", 1000), est(7, "Iquique", 1000), est(9, "Los Ángeles", 1200)]
        with self.respuesta(lista):
            self.assertEqual(int(combustibles.leer_estaciones()["93"][0]), 1605)       # solo la marca 5 (la más grande) y solo Los Ángeles
        with self.respuesta(lista), mock.patch("core.combustibles.MARCA_ID", "7"):
            self.assertEqual(int(combustibles.leer_estaciones()["93"][0]), 1000)       # marca fijada a mano
