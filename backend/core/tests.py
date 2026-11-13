from django.test import TestCase, Client, override_settings
from decimal import Decimal
from .api import create_jwt_token
from .models import Usuario, Proveedor, CatalogoTipo, Cotizacion, HitoPago, ObraEjecucion


class DenaServMigrationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.usuario = Usuario.objects.create(
            rut="12345678-9",
            nombre_completo="Admin Test",
            email="admin@denaserv.cl",
            google_id="google_12345",
            activo=True
        )
        self.proveedor = Proveedor.objects.create(
            rut_empresa="76123456-7",
            razon_social="Maderas Sur",
            email="ventas@maderas.cl",
            activo=True
        )
        self.base = CatalogoTipo.objects.create(
            categoria="BASE_TERRENO",
            nombre="Radier Hormigón H20",
            unidad_medida="M2",
            precio_base_unitario=25000.00,
            proveedor=self.proveedor,
            activo=True
        )
        self.revest = CatalogoTipo.objects.create(
            categoria="REVESTIMIENTO",
            nombre="Smart Panel 11.1mm",
            unidad_medida="M2",
            precio_base_unitario=28000.00,
            proveedor=self.proveedor,
            activo=True
        )

    @override_settings(DEBUG=True, GOOGLE_CLIENT_ID="")
    def test_google_auth_endpoint(self):
        res = self.client.post(
            "/api/auth/google",
            {"email": "admin@denaserv.cl", "nombre_completo": "Admin Test"},
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("token", data)
        self.assertEqual(data["usuario"]["email"], "admin@denaserv.cl")

    def _auth(self):
        from .api import create_jwt_token
        return {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.usuario)}"}

    def test_catalogo_requiere_auth(self):
        self.assertEqual(self.client.get("/api/catalogo-tipos/").status_code, 401)

    @override_settings(DEBUG=True, GOOGLE_CLIENT_ID="")
    def test_login_solo_correos_registrados(self):
        res = self.client.post("/api/auth/google", {"email": "intruso@x.cl"}, content_type="application/json")
        self.assertEqual(res.status_code, 403)

    @override_settings(DEBUG=False, GOOGLE_CLIENT_ID="")
    def test_login_simulado_deshabilitado_en_produccion(self):
        res = self.client.post("/api/auth/google", {"email": "admin@denaserv.cl"}, content_type="application/json")
        self.assertEqual(res.status_code, 401)

    @override_settings(GOOGLE_CLIENT_ID="cid")
    def test_token_google_falso_rechazado(self):
        res = self.client.post("/api/auth/google", {"credential": "basura"}, content_type="application/json")
        self.assertEqual(res.status_code, 401)

    def test_catalogo_tipo_filter(self):
        res = self.client.get("/api/catalogo-tipos/?categoria=REVESTIMIENTO", **self._auth())
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["nombre"], "Smart Panel 11.1mm")

    def test_cotizacion_and_hitos_creation(self):
        # Primero login para obtener token
        with override_settings(DEBUG=True, GOOGLE_CLIENT_ID=""):
          login_res = self.client.post(
            "/api/auth/google",
            {"email": "admin@denaserv.cl"},
            content_type="application/json"
        )
        token = login_res.json()["token"]
        auth_header = f"Bearer {token}"

        payload = {
            "cliente_nombre": "Juan Pérez",
            "cliente_telefono": "+56911223344",
            "direccion_terreno": "Camino El Olivar 45, Casablanca",
            "superficie_m2": 60.0,
            "distancia_flete_km": 30.0,
            "base_terreno_id": self.base.id,
            "revestimiento_id": self.revest.id,
            "costo_materiales": 5000000.0,
            "costo_mano_obra": 3000000.0,
            "costo_flete": 500000.0,
            "costo_total": 8500000.0,
            "estado": "BORRADOR"
        }

        res = self.client.post(
            "/api/cotizaciones/",
            payload,
            content_type="application/json",
            HTTP_AUTHORIZATION=auth_header
        )
        self.assertEqual(res.status_code, 200)
        cot_data = res.json()
        self.assertEqual(cot_data["cliente_nombre"], "Juan Pérez")
        self.assertEqual(cot_data["direccion_terreno"], "Camino El Olivar 45, Casablanca")

        # Verificar que se crearon los 3 hitos de pago
        hitos = HitoPago.objects.filter(cotizacion_id=cot_data["id"]).order_by("id")
        self.assertEqual(hitos.count(), 3)
        self.assertEqual(hitos[0].fase, "ANTICIPO_40")
        self.assertEqual(hitos[0].estado, "PENDIENTE")
        self.assertEqual(float(hitos[0].porcentaje), 40.0)

        # Verificar que se creó el registro de obra
        obra = ObraEjecucion.objects.filter(cotizacion_id=cot_data["id"]).first()
        self.assertIsNotNone(obra)
        self.assertEqual(float(obra.porcentaje_avance_real), 0.0)

        # Actualizar hito a PAGADO
        hito_id = hitos[0].id
        res_hito = self.client.patch(
            f"/api/hitos-pago/{hito_id}/",
            {"estado": "PAGADO"},
            content_type="application/json",
            HTTP_AUTHORIZATION=auth_header
        )
        self.assertEqual(res_hito.status_code, 200)
        hitos[0].refresh_from_db()
        self.assertEqual(hitos[0].estado, "PAGADO")
        self.assertIsNotNone(hitos[0].fecha_pago)


from decimal import Decimal as D
from . import calculo


class CalculoTests(TestCase):
    def test_formulas(self):
        self.assertEqual(calculo.volumen_estabilizado(D(60), D(10)), D("7.2"))
        self.assertEqual(calculo.costo_neto(D(1000), D(15)), D("850"))
        p = calculo.precio_venta(D(1547))
        self.assertEqual((p["neto"], p["iva"], p["total"]), (D(1300), D(247), D(1547)))
        self.assertEqual(sum(h[2] for h in calculo.hitos(D("1547"))), D("1547"))

    def test_endpoint(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="8-8", nombre_completo="T", email="t@d.cl")
        res = Client().post("/api/cotizaciones/calcular", {"superficie_m2": 60, "distancia_km": 10, "espesor_cm": 10},
            content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {create_jwt_token(u)}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("total", res.json())


class CrearCotizacionTests(TestCase):
    def test_backend_recalcula_y_hitos_suman_total(self):
        u = Usuario.objects.create(rut="1-9", nombre_completo="A", email="a@d.cl")
        from .api import create_jwt_token
        base = CatalogoTipo.objects.create(categoria="BASE_TERRENO", nombre="R", unidad_medida="M2", precio_base_unitario=25000)
        rev = CatalogoTipo.objects.create(categoria="REVESTIMIENTO", nombre="S", unidad_medida="M2", precio_base_unitario=28000)
        res = Client().post("/api/cotizaciones/", {
            "cliente_nombre": "Cliente X", "direccion_terreno": "Calle Uno 1", "superficie_m2": 54, "distancia_flete_km": 25,
            "base_terreno_id": base.id, "revestimiento_id": rev.id, "costo_total": 1,
        }, content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {create_jwt_token(u)}")
        self.assertEqual(res.status_code, 200, res.content)
        c = Cotizacion.objects.get()
        self.assertGreater(c.costo_total, 1)
        self.assertEqual(sum(h.monto_pago for h in c.hitos_pago.all()), c.costo_total)


class BomTests(TestCase):
    def test_insumos_por_etapa_con_descuento_y_detalle_guardado(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="2-7", nombre_completo="B", email="b@d.cl")
        prov = Proveedor.objects.create(rut_empresa="9-9", razon_social="Sodimac", descuento_pct=10)
        CatalogoTipo.objects.create(categoria="INSUMO", nombre="Pino 2x3", unidad_medida="UN", precio_base_unitario=1000,
                                    proveedor=prov, etapa_obra="ETAPA_1", rendimiento_m2=2)
        CatalogoTipo.objects.create(categoria="INSUMO", nombre="Yeso", unidad_medida="UN", precio_base_unitario=500,
                                    etapa_obra="ETAPA_2", rendimiento_m2=1)
        r = Client().post("/api/cotizaciones/calcular", {"superficie_m2": 10}, content_type="application/json",
                          HTTP_AUTHORIZATION=f"Bearer {create_jwt_token(u)}").json()
        pino = next(i for i in r["insumos"] if i["nombre"] == "Pino 2x3")
        self.assertEqual(float(pino["cantidad"]), 20.0)
        self.assertEqual(float(pino["subtotal"]), 18000.0)  # 20 x 1000 x 0.9
        res = Client().post("/api/cotizaciones/", {"cliente_nombre": "Cliente X", "direccion_terreno": "Calle Uno 1", "superficie_m2": 10},
                            content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {create_jwt_token(u)}")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Cotizacion.objects.get().detalles_insumo.count(), 2)


class GananciasWhatsappTests(TestCase):
    def test_ganancias_y_whatsapp(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="3-5", nombre_completo="C", email="c@d.cl")
        h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        c = Client()
        cot = c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente X", "direccion_terreno": "Calle Uno 1", "superficie_m2": 50},
                     content_type="application/json", **h).json()
        obra = ObraEjecucion.objects.get(cotizacion_id=cot["id"])
        c.patch(f"/api/obras/{obra.id}/", {"porcentaje_avance_real": 55},
                content_type="application/json", **h)
        g = c.get(f"/api/cotizaciones/{cot['id']}/ganancias/", **h).json()
        self.assertTrue(g["hito_avance_exigible"])
        self.assertNotIn("gasto_real", g)
        self.assertEqual(g["ganancia_estimada"], g["neto_cobrado"] - g["costo_presupuestado"])
        from .models import PortafolioProyecto
        PortafolioProyecto.objects.create(titulo="Casa Maipú", cotizacion_id=cot["id"])
        url = c.get("/api/portafolio/").json()[0]["whatsapp_url"]
        self.assertTrue(url.startswith("https://wa.me/") and "Casa%20Maip" in url and "50" in url)


class ExtraccionTests(TestCase):
    """Lectura del precio desde la ficha exacta de cada tienda (sin red)."""

    def test_json_ld_easy_con_oferta_simple(self):
        from . import scraper
        html = ('<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product",'
                '"name":"Pino impregnado 2x3","sku":"19375","offers":{"@type":"Offer","price":4790,"priceCurrency":"CLP"}}]}</script>')
        r = scraper.parsear_json_ld(html)
        self.assertEqual((r["nombre"], r["sku"], r["precio"]), ("Pino impregnado 2x3", "19375", 4790))

    def test_json_ld_sodimac_con_lista_de_ofertas_y_bloque_roto(self):
        from . import scraper
        html = ('<script type="application/ld+json">{roto</script>'
                '<script type="application/ld+json">{"@type":"Product","description":"Plancha zinc","sku":"110269489",'
                '"offers":[{"@type":"Offer","price":"6790"},{"@type":"Offer","price":"6790"}]}</script>')
        r = scraper.parsear_json_ld(html)
        self.assertEqual((r["nombre"], r["precio"]), ("Plancha zinc", 6790))

    def test_ficha_sin_precio_es_error_claro(self):
        from . import scraper
        with self.assertRaises(scraper.ErrorExtraccion):
            scraper.parsear_json_ld('<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":0}}</script>')
        with self.assertRaises(scraper.ErrorExtraccion):
            scraper.parsear_mct("<html><h1>X</h1></html>")

    def test_ficha_mct(self):
        from . import scraper
        html = '<h1>OSB SMARTSIDE PANEL R8 11.1MM 1.22 X 2.44</h1><span class="precioOfertaFicha">$28.907</span>'
        r = scraper.parsear_mct(html, "https://mct.cl/ficha/25972/osb-smartside")
        self.assertEqual((r["nombre"], r["sku"], r["precio"]), ("OSB SMARTSIDE PANEL R8 11.1MM 1.22 X 2.44", "25972", 28907))

    def test_solo_tiendas_conocidas(self):
        from . import scraper
        self.assertEqual(scraper.tienda_de("https://www.easy.cl/x/p"), "easy")
        self.assertEqual(scraper.tienda_de("https://mct.cl/ficha/1/x"), "mct")
        with self.assertRaises(scraper.ErrorExtraccion):
            scraper.tienda_de("https://tienda-falsa.com/x")

    def test_reintenta_ante_caida_de_conexion(self):
        import requests
        from unittest import mock
        from . import scraper
        ok = mock.Mock(status_code=200, text="<html/>")
        with mock.patch("core.scraper.requests.get", side_effect=[requests.ConnectionError("x"), ok]) as g:
            self.assertEqual(scraper.descargar("https://www.easy.cl/x/p", pausa=lambda s: None), "<html/>")
        self.assertEqual(g.call_count, 2)
        with mock.patch("core.scraper.requests.get", side_effect=requests.ConnectionError("x")):
            with self.assertRaises(scraper.ErrorExtraccion):
                scraper.descargar("https://www.easy.cl/x/p", pausa=lambda s: None)


class PreciosTests(TestCase):
    def setUp(self):
        self.prov = Proveedor.objects.create(rut_empresa="EASY-WEB", razon_social="Easy", descuento_pct=10)

    def _item(self, **kw):
        base = dict(categoria="TABIQUERIA", nombre="Pino 2x3", unidad_medida="UN", proveedor=self.prov,
                    fuente_url="https://www.easy.cl/pino-1/p", verificado=True)
        return CatalogoTipo.objects.create(**{**base, **kw})

    def test_costo_neto_es_lista_por_uno_menos_descuento(self):
        from . import precios
        self.assertEqual(precios.costo_neto(10000, 10), Decimal("9000.00"))
        self.assertEqual(precios.costo_neto(4790, 0), Decimal("4790.00"))

    def test_actualiza_lista_descuento_neto_y_fecha(self):
        from . import precios
        it = self._item()
        r = precios.actualizar_precios_mercado(extractor=lambda u: {"nombre": "Pino 2x3", "sku": "1", "precio": Decimal(10000)}, pausa=0)
        it.refresh_from_db()
        self.assertEqual((it.precio_lista, it.descuento_pct, it.costo_neto), (Decimal("10000.00"), Decimal("10.00"), Decimal("9000.00")))
        self.assertEqual(it.precio_base_unitario, Decimal("10000.00"))
        self.assertIsNotNone(it.precio_actualizado_en)
        self.assertEqual((r["actualizados"], r["errores"]), (1, []))

    def test_revestimiento_se_cotiza_por_m2(self):
        from . import precios
        it = self._item(categoria="REVESTIMIENTO", m2_por_unidad=2.5)
        precios.actualizar_precios_mercado(extractor=lambda u: {"nombre": "OSB", "sku": "", "precio": Decimal(25000)}, pausa=0)
        it.refresh_from_db()
        self.assertEqual((it.precio_lista, it.precio_base_unitario), (Decimal("25000.00"), Decimal("10000.00")))

    def test_una_tienda_caida_no_detiene_las_demas_ni_pisa_el_precio(self):
        from . import precios, scraper
        malo = self._item(nombre="Malo", fuente_url="https://www.easy.cl/malo/p", precio_base_unitario=500, precio_lista=500)
        bueno = self._item(nombre="Bueno", fuente_url="https://www.easy.cl/bueno/p")

        def ext(url):
            if "malo" in url:
                raise scraper.ErrorExtraccion("sin conexión con la tienda")
            return {"nombre": "Bueno", "sku": "", "precio": Decimal(1000)}

        r = precios.actualizar_precios_mercado(extractor=ext, pausa=0)
        malo.refresh_from_db(); bueno.refresh_from_db()
        self.assertEqual((r["actualizados"], len(r["errores"])), (1, 1))
        self.assertEqual((malo.precio_lista, malo.precio_base_unitario), (Decimal("500.00"), Decimal("500.00")))
        self.assertIn("sin conexión", malo.ultimo_error)
        self.assertEqual(bueno.precio_lista, Decimal("1000.00"))

    def test_si_la_ficha_cambia_de_producto_no_se_usa_el_precio(self):
        from . import precios
        it = self._item(sku="19375", precio_lista=4790, precio_base_unitario=4790)
        r = precios.actualizar_precios_mercado(extractor=lambda u: {"nombre": "Otra cosa", "sku": "999", "precio": Decimal(99999)}, pausa=0)
        it.refresh_from_db()
        self.assertEqual((len(r["a_revisar"]), it.precio_lista, it.verificado), (1, Decimal("4790.00"), False))

    def test_misma_ficha_se_lee_una_sola_vez(self):
        from . import precios
        self._item(nombre="A"); self._item(nombre="B")
        llamadas = []
        precios.actualizar_precios_mercado(extractor=lambda u: llamadas.append(u) or {"nombre": "X", "sku": "", "precio": Decimal(1)}, pausa=0)
        self.assertEqual(len(llamadas), 1)

    def test_categorias_obligatorias_exigen_producto_verificado_con_precio(self):
        from . import precios
        self.assertEqual([g["codigo"] for g in precios.grupos_sin_cobertura()], list(precios.GRUPOS_OBLIGATORIOS))
        for cat in precios.GRUPOS_OBLIGATORIOS:
            self._item(categoria=cat, nombre=cat, precio_lista=1000)
        self.assertEqual(precios.grupos_sin_cobertura(), [])
        CatalogoTipo.objects.filter(categoria="TECHUMBRE").update(verificado=False)
        self.assertEqual([g["codigo"] for g in precios.grupos_sin_cobertura()], ["TECHUMBRE"])

    def test_cambiar_descuento_del_proveedor_refresca_el_neto(self):
        from . import precios
        it = self._item(precio_lista=10000, costo_neto=9000)
        self.prov.descuento_pct = 20; self.prov.save()
        precios.recalcular_netos(self.prov)
        it.refresh_from_db()
        self.assertEqual((it.descuento_pct, it.costo_neto), (Decimal("20.00"), Decimal("8000.00")))

    def test_actualizacion_en_segundo_plano(self):
        import time
        from . import precios
        self.assertTrue(precios.iniciar_actualizacion(tarea=lambda: {"revisados": 0}))
        for _ in range(50):
            if precios.estado_actualizacion()["estado"] != "running":
                break
            time.sleep(0.1)
        self.assertEqual(precios.estado_actualizacion(), {"estado": "done", "resultado": {"revisados": 0}})

    def test_medida_desde_el_nombre(self):
        from . import precios
        self.assertAlmostEqual(precios._m2_unidad("OSB SMARTSIDE PANEL R4 11.1MM 1.22 X 2.44"), 2.9768, places=3)
        self.assertAlmostEqual(precios._m2_unidad("OSB LAP SIDING 9.5 MM 200X4880"), 0.976, places=3)
        self.assertIsNone(precios._m2_unidad("Revestimiento sin medidas"))


class InsumosApiTests(TestCase):
    def setUp(self):
        from django.test import override_settings
        self.u = Usuario.objects.create(rut="1-9", nombre_completo="T", email="t@t.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.u)}"}
        self.prov = Proveedor.objects.create(rut_empresa="SODIMAC-WEB", razon_social="Sodimac", descuento_pct=5)
        CatalogoTipo.objects.create(categoria="TECHUMBRE", nombre="Zinc", unidad_medida="UN", proveedor=self.prov,
                                    fuente_url="https://www.sodimac.cl/sodimac-cl/product/1/", precio_lista=10000,
                                    descuento_pct=5, costo_neto=9500, precio_base_unitario=10000)
        CatalogoTipo.objects.create(categoria="INSUMO", nombre="Clavo", unidad_medida="UN", precio_base_unitario=1000)

    def test_listado_filtrado_por_categoria(self):
        todo = self.client.get("/api/insumos/", **self.h).json()
        self.assertEqual(len(todo), 2)
        z = self.client.get("/api/insumos/?categoria=TECHUMBRE", **self.h).json()
        self.assertEqual(len(z), 1)
        self.assertEqual((z[0]["proveedor"], z[0]["precio_lista"], z[0]["descuento_pct"], z[0]["costo_neto"]), ("Sodimac", 10000, 5, 9500))

    def test_requiere_sesion(self):
        self.assertEqual(self.client.get("/api/insumos/").status_code, 401)
        self.assertEqual(self.client.post("/api/insumos/actualizar-precios").status_code, 401)

    def test_actualizar_manual_y_con_llave_del_planificador(self):
        from unittest import mock
        from django.test import override_settings
        with mock.patch("core.api.precios.iniciar_actualizacion", return_value=True) as ini:
            self.assertEqual(self.client.post("/api/insumos/actualizar-precios", **self.h).status_code, 202)
            with override_settings(CRON_TOKEN="secreto"):
                self.assertEqual(self.client.post("/api/insumos/actualizar-precios", HTTP_X_CRON_TOKEN="secreto").status_code, 202)
                self.assertEqual(self.client.post("/api/insumos/actualizar-precios", HTTP_X_CRON_TOKEN="otro").status_code, 401)
            self.assertEqual(ini.call_count, 2)
        with override_settings(CRON_TOKEN=""):  # sin llave configurada el planificador no entra
            self.assertEqual(self.client.post("/api/insumos/actualizar-precios", HTTP_X_CRON_TOKEN="").status_code, 401)

    def test_ya_en_curso_responde_409(self):
        from unittest import mock
        with mock.patch("core.api.precios.iniciar_actualizacion", return_value=False):
            self.assertEqual(self.client.post("/api/insumos/actualizar-precios", **self.h).status_code, 409)

    def test_estado_informa_categorias_sin_cobertura(self):
        e = self.client.get("/api/insumos/actualizar-precios/estado", **self.h).json()
        self.assertIn("estado", e)
        self.assertEqual(len(e["grupos_sin_cobertura"]), 4)  # ninguno está verificado todavía

    def test_alta_por_url_lee_la_ficha_y_la_url_mala_se_rechaza(self):
        from decimal import Decimal as D
        from unittest import mock
        from . import scraper
        ficha = {"nombre": "Cemento 25 kg", "sku": "7", "precio": D(5090)}
        with mock.patch("core.precios.scraper.extraer", return_value=ficha):
            r = self.client.post("/api/catalogo-tipos/", {"categoria": "BASE_RADIER", "fuente_url": "https://www.sodimac.cl/sodimac-cl/product/7/"},
                                 content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertEqual((j["nombre"], j["precio_lista"], j["costo_neto"]), ("Cemento 25 kg", 5090, 4835.5))  # 5 % de descuento de Sodimac
        with mock.patch("core.precios.scraper.extraer", side_effect=scraper.ErrorExtraccion("La ficha ya no existe en la tienda (404).")):
            r = self.client.post("/api/catalogo-tipos/", {"categoria": "BASE_RADIER", "fuente_url": "https://www.sodimac.cl/sodimac-cl/product/9/"},
                                 content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 400)
        self.assertIn("404", r.json()["message"])

    def test_editar_sin_enviar_precio_no_lo_pone_en_cero(self):
        it = CatalogoTipo.objects.get(nombre="Clavo")
        r = self.client.put(f"/api/catalogo-tipos/{it.id}", {"categoria": "INSUMO", "nombre": "Clavo 4\"", "unidad_medida": "UN"},
                            content_type="application/json", **self.h)
        it.refresh_from_db()
        self.assertEqual((r.status_code, it.nombre, float(it.precio_base_unitario)), (200, 'Clavo 4"', 1000.0))


class TarifasEmpresaTests(TestCase):
    def test_tramos_de_traslado_y_ganancia_fija(self):
        r = calculo.calcular(10, 20, 0, 0)
        self.assertEqual((r["costo_flete"], r["costo_mano_obra"], r["ganancia"]), (50000, 250000, 300000))
        self.assertEqual(calculo.calcular(10, 80, 0, 0)["costo_flete"], 100000)
        with self.assertRaises(ValueError):
            calculo.calcular(10, 101, 0, 0)

    def test_vigas_a_la_vista(self):
        self.assertEqual(calculo.calcular(10, 0, 0, 0, m2_vigas_vista=2)["costo_vigas_vista"], 130000)


    def test_precio_195k_incluye_iva_y_referencia_de_materiales(self):
        r = calculo.calcular(10, 20, 0, 0)  # sin catálogo: materiales = referencia $135.000/m²
        self.assertEqual(r["total"], 1950000)  # 135k + 25k + 30k + 5k por m² x 10 m², IVA incluido


    def test_solo_radier(self):
        r = calculo.calcular(20, 10, 0, 0, tipo_proyecto="SOLO_RADIER")
        self.assertEqual((r["costo_materiales"], r["costo_flete"], r["total"]), (750000, 100000, 850000))  # radier + traslado (10 km: $5.000/m²)
        self.assertEqual(r["neto"] + r["iva"], r["total"])
        self.assertEqual(sum(h["monto"] for h in r["hitos"]), r["total"])
        self.assertEqual(calculo.calcular(20, 10, 0, 0, tipo_proyecto="SOLO_RADIER", radier_m2=40000)["total"], 900000)


    def test_m2_desde_nombre(self):
        from .precios import _m2_unidad
        self.assertAlmostEqual(_m2_unidad("OSB SMARTSIDE PANEL R4 11.1MM 1.22 X 2.44"), 2.9768, places=3)
        self.assertAlmostEqual(_m2_unidad("OSB LAP SIDING 9.5 MM 200X4880"), 0.976, places=3)
        self.assertAlmostEqual(_m2_unidad("Siding metal 1.6x38x380 cm cedro"), 1.444, places=3)
        self.assertAlmostEqual(_m2_unidad("Siding 0.19x3.66 m"), 0.6954, places=3)
        self.assertIsNone(_m2_unidad("Revestimiento sin medidas"))

class FlujoEmpresaTests(TestCase):
    def test_estabilizado_cubicado_aparte_de_la_cotizacion_inicial(self):
        n = calculo.nivelacion(10, 10)  # 10 m² x 10 cm x 1,20 = 1,2 m³ a $32.000
        self.assertEqual((n["m3"], n["costo"], n["modalidad"]), (D("1.20"), 38400, "EMPRESA"))
        self.assertEqual(calculo.nivelacion(10, 10, arido_empresa=False)["costo"], 0)
        self.assertNotIn("costo_nivelacion", calculo.calcular(10, 0))

    def test_revestimiento_mas_caro_suma_solo_la_diferencia(self):
        base = calculo.calcular(10, 0, precio_revest_m2=10000, revest_min_m2=10000)["costo_materiales_total"]
        caro = calculo.calcular(10, 0, precio_revest_m2=12000, revest_min_m2=10000)
        self.assertEqual(base, 1350000)  # referencia $135.000/m²
        self.assertEqual(caro["costo_materiales_total"] - base, 20000)  # 2.000/m² x 10 m²

    def test_visita_tecnica_suma_al_valor_y_reparte_en_hitos_pendientes(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="5-5", nombre_completo="N", email="n@d.cl")
        h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        c = Client()
        cot = c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente X", "direccion_terreno": "Calle Uno 1", "superficie_m2": 10},
                     content_type="application/json", **h).json()
        antes = Cotizacion.objects.get(id=cot["id"]).costo_total
        url = f"/api/cotizaciones/{cot['id']}/nivelacion"
        prev = c.post(url, {"espesor_cm": 10}, content_type="application/json", **h).json()
        self.assertEqual(Cotizacion.objects.get(id=cot["id"]).costo_total, antes)  # vista previa: no guarda
        c.post(url, {"espesor_cm": 10, "aplicar": True}, content_type="application/json", **h)
        cobj = Cotizacion.objects.get(id=cot["id"])
        self.assertEqual(cobj.costo_total, antes + D(str(prev["costo"])))
        self.assertEqual(sum(x.monto_pago for x in cobj.hitos_pago.all()), cobj.costo_total)
        # el cliente compra el árido: se resta lo sumado
        c.post(url, {"espesor_cm": 10, "arido_empresa": False, "aplicar": True}, content_type="application/json", **h)
        cobj.refresh_from_db()
        self.assertEqual((cobj.costo_total, cobj.nivelacion_modalidad), (antes, "CLIENTE"))


class EdicionCotizacionTests(TestCase):
    def setUp(self):
        from .api import create_jwt_token
        self.u = Usuario.objects.create(rut="6-6", nombre_completo="E", email="e@d.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.u)}"}
        self.c = Client()
        self.cot = self.c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente X", "direccion_terreno": "Calle Uno 1", "superficie_m2": 10,
                               "distancia_flete_km": 10}, content_type="application/json", **self.h).json()
        self.url = f"/api/cotizaciones/{self.cot['id']}/"

    def patch(self, body):
        return self.c.patch(self.url, body, content_type="application/json", **self.h)

    def test_reajuste_manual_reparte_en_hitos_y_queda_en_historial(self):
        antes = Cotizacion.objects.get(id=self.cot["id"]).costo_total
        prev = self.patch({"ajuste_monto": 100000}).json()
        self.assertEqual(Cotizacion.objects.get(id=self.cot["id"]).costo_total, antes)  # solo vista previa
        self.assertEqual(float(prev["diferencia"]), 100000.0)
        self.assertEqual(self.patch({"ajuste_monto": 100000, "aplicar": True}).status_code, 400)  # sin motivo
        self.assertEqual(self.patch({"ajuste_monto": 100000, "aplicar": True, "motivo": "alza del zinc"}).status_code, 200)
        cot = Cotizacion.objects.get(id=self.cot["id"])
        self.assertEqual(cot.costo_total, antes + 100000)
        self.assertEqual(sum(h.monto_pago for h in cot.hitos_pago.all()), cot.costo_total)
        hist = self.c.get(self.url + "cambios/", **self.h).json()
        self.assertEqual((len(hist), hist[0]["motivo"]), (1, "alza del zinc"))

    def test_cambiar_superficie_recalcula_y_solo_datos_no_reprecia(self):
        antes = Cotizacion.objects.get(id=self.cot["id"]).costo_total
        self.patch({"cliente_nombre": "Otro", "aplicar": True})  # solo datos: no cambia el monto
        self.assertEqual(Cotizacion.objects.get(id=self.cot["id"]).costo_total, antes)
        self.patch({"superficie_m2": 20, "aplicar": True, "motivo": "ampliación"})
        self.assertGreater(Cotizacion.objects.get(id=self.cot["id"]).costo_total, antes)

    def test_hitos_pagados_no_se_tocan(self):
        h = HitoPago.objects.filter(cotizacion_id=self.cot["id"])
        h.update(estado="PAGADO")
        r = self.patch({"ajuste_monto": 5000, "aplicar": True, "motivo": "x"})
        self.assertEqual(r.status_code, 409)

    def test_detalle_interno_accesible(self):
        r = self.c.get(self.url, **self.h)
        self.assertEqual((r.status_code, r.json()["codigo_cotizacion"]), (200, self.cot["codigo_cotizacion"]))

    def test_vista_publica_no_expone_datos_internos(self):
        self.assertEqual(self.c.get(f"/api/cotizaciones/public/{self.cot['codigo_cotizacion']}").status_code, 422)  # el folio ya no abre la ficha
        pub = self.c.get(f"/api/cotizaciones/public/{self.cot['token_publico']}").json()
        for k in ("usuario", "obras_ejecucion", "ganancia_m2", "ajuste_monto"):
            self.assertNotIn(k, pub)


class MapeoCatalogoTests(TestCase):
    def test_desactiva_relleno_cubre_categorias_y_es_idempotente(self):
        from .catalogo_mapeo import mapear
        from . import precios
        CatalogoTipo.objects.create(categoria="BASE_TERRENO", nombre="Relleno", unidad_medida="M2", precio_base_unitario=28500)
        r = mapear()
        self.assertEqual(r["desactivados"], 1)
        self.assertFalse(CatalogoTipo.objects.get(nombre="Relleno").activo)
        self.assertEqual(mapear(), {"desactivados": 0, "reclasificados": 0, "creados": 0})
        # cada categoría obligatoria queda con al menos un producto con ficha, verificado y activo
        for cat in precios.GRUPOS_OBLIGATORIOS:
            self.assertTrue(CatalogoTipo.objects.filter(categoria=cat, activo=True, verificado=True).exclude(fuente_url="").exists(), cat)
        self.assertFalse(CatalogoTipo.objects.filter(nombre__icontains="naranjo", activo=True).exists())  # sin verificar -> inactivo


class ValidacionDatosTests(TestCase):
    def setUp(self):
        from django.test import Client
        u = Usuario.objects.create(rut="9-9", nombre_completo="V", email="v@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}

    def post(self, **extra):
        d = {"cliente_nombre": "Juan Pérez", "direccion_terreno": "Calle Uno 1", "superficie_m2": 30}
        return self.c.post("/api/cotizaciones/", {**d, **extra}, content_type="application/json", **self.h)

    def test_rut_y_telefono_se_normalizan(self):
        r = self.post(cliente_rut="12345678-5", cliente_telefono="912345678")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["cliente_rut"], r.json()["cliente_telefono"]), ("12.345.678-5", "+56 9 1234 5678"))

    def test_rechaza_datos_invalidos(self):
        for extra in ({"cliente_rut": "12345678-9"}, {"cliente_rut": "abc"}, {"cliente_telefono": "123"},
                      {"cliente_telefono": "+56 9 1234 56789"}, {"cliente_nombre": "A"}, {"cliente_nombre": "x" * 151},
                      {"direccion_terreno": "abc"}, {"superficie_m2": 0}, {"superficie_m2": -5}, {"distancia_flete_km": -1}):
            r = self.post(**extra)
            self.assertEqual(r.status_code, 422, extra)
            self.assertIn("message", r.json())

    def test_rut_y_telefono_vacios_son_opcionales(self):
        self.assertEqual(self.post(cliente_rut="", cliente_telefono="").status_code, 200)


class PagosEstadosPortafolioTests(TestCase):
    def setUp(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="7-7", nombre_completo="P", email="p@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        self.cot = self.c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Pagos", "direccion_terreno": "Calle Uno 1",
                               "superficie_m2": 40}, content_type="application/json", **self.h).json()
        self.hitos = list(HitoPago.objects.filter(cotizacion_id=self.cot["id"]).order_by("id"))

    def pagar(self, hito, **body):
        return self.c.patch(f"/api/hitos-pago/{hito.id}/", body, content_type="application/json", **self.h)

    def estado(self, nuevo):
        return self.c.patch(f"/api/cotizaciones/{self.cot['id']}/estado", {"estado": nuevo},
                            content_type="application/json", **self.h)

    def test_pago_parcial_calcula_deuda_y_se_completa(self):
        h = self.hitos[0]
        r = self.pagar(h, pago_completo=False, monto_abonado=1000).json()
        self.assertEqual((r["estado"], r["monto_abonado"]), ("ABONADO", 1000))
        self.assertEqual(r["monto_pendiente"], float(h.monto_pago) - 1000)
        r = self.pagar(h, pago_completo=True).json()
        self.assertEqual((r["estado"], r["monto_pendiente"]), ("PAGADO", 0))

    def test_monto_parcial_fuera_de_rango(self):
        h = self.hitos[0]
        self.assertEqual(self.pagar(h, pago_completo=False, monto_abonado=float(h.monto_pago) + 1).status_code, 400)
        self.assertEqual(self.pagar(h, pago_completo=False).status_code, 400)

    def test_no_finaliza_con_pagos_pendientes_ni_sin_ejecucion(self):
        self.assertEqual(self.estado("FINALIZADA").status_code, 409)       # aún borrador
        self.assertEqual(self.estado("ACEPTADA").status_code, 200)
        r = self.estado("FINALIZADA")
        self.assertEqual(r.status_code, 409)                                 # pagos pendientes
        self.assertEqual(Cotizacion.objects.get(id=self.cot["id"]).estado, "ACEPTADA")
        for h in self.hitos[:-1]:
            self.pagar(h, pago_completo=True)
        self.pagar(self.hitos[-1], pago_completo=False, monto_abonado=1)    # un abono no basta
        self.assertEqual(self.estado("FINALIZADA").status_code, 409)
        self.pagar(self.hitos[-1], pago_completo=True)
        self.assertEqual(self.estado("FINALIZADA").status_code, 200)

    def test_progreso_solo_obras_en_ejecucion(self):
        self.assertEqual(self.c.get("/api/cotizaciones/progreso/", **self.h).json(), [])
        self.estado("ACEPTADA")
        obra = ObraEjecucion.objects.get(cotizacion_id=self.cot["id"])
        self.c.patch(f"/api/obras/{obra.id}/", {"porcentaje_avance_real": 35}, content_type="application/json", **self.h)
        p = self.c.get("/api/cotizaciones/progreso/", **self.h).json()
        self.assertEqual([(x["id"], x["avance"]) for x in p], [(self.cot["id"], 35)])

    def test_portafolio_con_varias_imagenes(self):
        import base64
        png = "data:image/png;base64," + base64.b64encode(b"PNG-fake" + b"0" * 20).decode()
        r = self.c.post("/api/portafolio/", {"titulo": "Casa Limache", "descripcion": "Casa de 54 m2",
                        "imagenes": [png, png]}, content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 200, r.content)
        p = r.json()
        self.assertEqual(len(p["imagenes"]), 2)
        img = Client().get(p["imagenes"][0])
        self.assertEqual((img.status_code, img["Content-Type"]), (200, "image/png"))
        self.assertEqual(len(Client().get("/api/portafolio/").json()), 1)
        quitada = self.c.patch(f"/api/portafolio/{p['id']}/", {"quitar_imagenes": [int(p["imagenes"][0].split("/")[-2])],
                               "publicado": False}, content_type="application/json", **self.h).json()
        self.assertEqual(len(quitada["imagenes"]), 1)
        self.assertEqual(Client().get("/api/portafolio/").json(), [])      # despublicado: no se ve en la web
        self.assertEqual(len(self.c.get("/api/portafolio/admin/", **self.h).json()), 1)

    def test_portafolio_rechaza_archivos_no_imagen(self):
        r = self.c.post("/api/portafolio/", {"titulo": "Casa mala", "imagenes": ["data:text/html;base64,PGI+"]},
                        content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 400)


class CargarMaterialesTests(TestCase):
    def test_carga_es_repetible_y_crea_proveedor(self):
        from django.core.management import call_command
        from pathlib import Path
        archivo = Path(__file__).parent / "fixtures" / "materiales_ejemplo.json"
        call_command("cargar_materiales", str(archivo))
        call_command("cargar_materiales", str(archivo))
        self.assertEqual(CatalogoTipo.objects.filter(categoria="INSUMO").count(), 2)
        self.assertEqual(Proveedor.objects.filter(razon_social="Homecenter").count(), 1)


class MaterialesAdicionalesTests(TestCase):
    def setUp(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="8-1", nombre_completo="M", email="m@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        prov = Proveedor.objects.create(rut_empresa="PROV-M", razon_social="Prov M", descuento_pct=10)
        self.osb = CatalogoTipo.objects.create(categoria="INSUMO", nombre="Plancha OSB", unidad_medida="UN",
                                               precio_base_unitario=10000, proveedor=prov)  # neto 9.000

    def calc(self, **extra):
        return self.c.post("/api/cotizaciones/calcular", {"superficie_m2": 40, "distancia_km": 10, **extra},
                           content_type="application/json", **self.h)

    def test_lista_suma_al_valor_con_costo_neto(self):
        base = self.calc().json()
        con = self.calc(materiales=[{"catalogo_id": self.osb.id, "cantidad": 25}]).json()
        self.assertEqual(int(float(con["costo_adicionales"])), 225000)         # 25 x 9.000 (con descuento)
        self.assertEqual(int(float(con["adicionales"][0]["subtotal"])), 225000)
        self.assertEqual(float(con["costos_directos"]) - float(base["costos_directos"]), 225000)
        self.assertGreater(float(con["total"]), float(base["total"]))

    def test_material_inexistente_o_cantidad_invalida(self):
        self.assertEqual(self.calc(materiales=[{"catalogo_id": 99999, "cantidad": 1}]).status_code, 400)
        self.assertEqual(self.calc(materiales=[{"catalogo_id": self.osb.id, "cantidad": 0}]).status_code, 422)

    def test_se_guarda_y_sobrevive_al_reajuste(self):
        cot = self.c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Lista", "direccion_terreno": "Calle Uno 1",
                          "superficie_m2": 40, "materiales": [{"catalogo_id": self.osb.id, "cantidad": 3}]},
                          content_type="application/json", **self.h).json()
        from .models import DetalleCotizacionInsumo
        d = DetalleCotizacionInsumo.objects.get(cotizacion_id=cot["id"], es_adicional=True)
        self.assertEqual((d.catalogo_tipo_id, int(d.subtotal_costo)), (self.osb.id, 27000))
        # Reajuste sin cambiar nada de precio: la lista agregada se conserva y el valor no cambia.
        r = self.c.patch(f"/api/cotizaciones/{cot['id']}/", {"superficie_m2": 40, "aplicar": False},
                         content_type="application/json", **self.h).json()
        self.assertEqual(float(r["diferencia"]), 0)
