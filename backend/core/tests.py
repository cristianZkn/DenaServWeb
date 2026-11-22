from django.test import TestCase, Client, override_settings
from decimal import Decimal
from .api import create_jwt_token
from .models import Usuario, Proveedor, CatalogoTipo, Cotizacion, HitoPago, ObraEjecucion


class DenaServMigrationTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # los límites de peticiones se cuentan en la caché
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
        self.assertEqual(c.patch(f"/api/obras/{obra.id}/", {"porcentaje_avance_real": 55},
                                 content_type="application/json", **h).status_code, 409)  # sin pagos no hay avance
        for hito in HitoPago.objects.filter(cotizacion_id=cot["id"]).order_by("id")[:2]:
            c.patch(f"/api/hitos-pago/{hito.id}/", {"pago_completo": True}, content_type="application/json", **h)
        c.patch(f"/api/obras/{obra.id}/", {"porcentaje_avance_real": 55}, content_type="application/json", **h)
        g = c.get(f"/api/cotizaciones/{cot['id']}/ganancias/", **h).json()
        self.assertEqual((g["avance_real"], g["avance_minimo"], g["avance_maximo"]), (55, 50, 99))
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
        ok = mock.Mock(status_code=200, text="<html/>", url="https://www.easy.cl/x/p")
        with mock.patch("core.scraper.requests.get", side_effect=[requests.ConnectionError("x"), ok]) as g:
            self.assertEqual(scraper.descargar("https://www.easy.cl/x/p", pausa=lambda s: None), "<html/>")
        self.assertEqual(g.call_count, 2)
        with mock.patch("core.scraper.requests.get", side_effect=requests.ConnectionError("x")):
            with self.assertRaises(scraper.ErrorExtraccion):
                scraper.descargar("https://www.easy.cl/x/p", pausa=lambda s: None)

    def test_no_sigue_una_redireccion_a_un_sitio_que_no_es_tienda(self):
        from unittest import mock
        from . import scraper
        desviada = mock.Mock(status_code=200, text="<html/>", url="http://169.254.169.254/latest/meta-data/")
        with mock.patch("core.scraper.requests.get", return_value=desviada):
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
        for k in ("usuario", "obras_ejecucion", "ganancia_m2", "ajuste_monto", "detalles_insumo", "base_terreno",
                  "revestimiento", "costo_materiales", "costo_mano_obra", "costo_flete", "distancia_flete_km"):
            self.assertNotIn(k, pub)
        self.assertEqual(pub["avance"], 0)


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

    def estado_actual(self):
        return Cotizacion.objects.get(id=self.cot["id"]).estado

    def avance(self):
        return float(ObraEjecucion.objects.get(cotizacion_id=self.cot["id"]).porcentaje_avance_real)

    def test_estado_automatico_segun_pagos(self):
        self.assertEqual(self.cot["estado"], "BORRADOR")                       # al crearse: Cotizado
        self.pagar(self.hitos[0], pago_completo=False, monto_abonado=1)        # anticipo con saldo pendiente
        self.assertEqual(self.estado_actual(), "BORRADOR")                     # sigue Cotizado hasta pagar todo el 40 %
        self.pagar(self.hitos[0], pago_completo=True)
        self.assertEqual(self.estado_actual(), "ACEPTADA")                     # anticipo completo: En ejecución
        self.pagar(self.hitos[1], pago_completo=True)
        self.assertEqual(self.estado_actual(), "ACEPTADA")                     # faltan pagos: sigue en ejecución
        self.pagar(self.hitos[2], pago_completo=True)
        self.assertEqual(self.estado_actual(), "FINALIZADA")                   # todos pagados: Obra terminada
        self.assertEqual(self.avance(), 100)

    def test_el_estado_no_se_cambia_a_mano(self):
        self.assertEqual(self.estado("FINALIZADA").status_code, 409)
        self.assertEqual(self.estado("ACEPTADA").status_code, 409)
        self.assertEqual(self.estado("BORRADOR").status_code, 200)             # el que ya corresponde se acepta
        self.pagar(self.hitos[0], pago_completo=True)
        self.assertEqual(self.estado("ACEPTADA").status_code, 200)
        self.assertEqual(self.estado("FINALIZADA").status_code, 409)
        self.assertEqual(self.estado_actual(), "ACEPTADA")

    def test_anular_pagos_devuelve_el_estado(self):
        self.pagar(self.hitos[0], pago_completo=True)
        self.pagar(self.hitos[0], estado="PENDIENTE")
        self.assertEqual(self.estado_actual(), "BORRADOR")

    def test_progreso_solo_obras_en_ejecucion(self):
        self.assertEqual(self.c.get("/api/cotizaciones/progreso/", **self.h).json(), [])
        self.pagar(self.hitos[0], pago_completo=True)
        obra = ObraEjecucion.objects.get(cotizacion_id=self.cot["id"])
        self.c.patch(f"/api/obras/{obra.id}/", {"porcentaje_avance_real": 35}, content_type="application/json", **self.h)
        p = self.c.get("/api/cotizaciones/progreso/", **self.h).json()
        self.assertEqual([(x["id"], x["avance"]) for x in p], [(self.cot["id"], 35)])

    # ---- bitácora y coherencia entre pagos y avance
    def bitacora(self, pct, comentario="Avance de radier", **extra):
        return self.c.post(f"/api/cotizaciones/{self.cot['id']}/bitacora/", {"porcentaje": pct, "comentario": comentario, **extra},
                           content_type="application/json", **self.h)

    def test_sin_pagos_no_hay_avance(self):
        r = self.bitacora(10)
        self.assertEqual(r.status_code, 409)
        self.assertIn("anticipo", r.json()["message"])

    def test_avance_limitado_por_los_pagos(self):
        self.pagar(self.hitos[0], pago_completo=True)                           # solo el anticipo (40 %)
        self.assertEqual(self.bitacora(50).status_code, 409)                   # 50 % exige el 2.º pago
        self.assertEqual(self.bitacora(30).status_code, 200)
        self.assertEqual(self.avance(), 30)
        self.assertEqual(self.bitacora(20).status_code, 409)                   # no retrocede
        self.pagar(self.hitos[1], pago_completo=True)
        self.assertEqual(self.avance(), 50)                                    # el 2.º pago sube el avance al 50 %
        self.assertEqual(self.bitacora(99).status_code, 200)
        self.assertEqual(self.bitacora(100).status_code, 409)                  # 100 % exige el último pago
        self.pagar(self.hitos[2], pago_completo=True)
        self.assertEqual(self.avance(), 100)

    def test_no_se_anula_un_pago_que_respalda_el_avance(self):
        self.pagar(self.hitos[0], pago_completo=True)
        self.pagar(self.hitos[1], pago_completo=True)
        self.bitacora(70)
        r = self.pagar(self.hitos[1], estado="PENDIENTE")
        self.assertEqual(r.status_code, 409)
        self.hitos[1].refresh_from_db()
        self.assertEqual((self.hitos[1].estado, self.avance()), ("PAGADO", 70))   # nada cambió

    def test_bitacora_con_fotos_historial_y_eliminacion(self):
        import base64
        png = "data:image/png;base64," + base64.b64encode(b"PNG-fake" + b"0" * 20).decode()
        self.pagar(self.hitos[0], pago_completo=True)
        b1 = self.bitacora(20, "Avance de radier", imagenes=[png]).json()
        b2 = self.bitacora(35, "Levantamiento de vigas").json()
        self.assertEqual((len(b1["fotos"]), b2["porcentaje"]), (1, 35))
        self.assertEqual(self.c.patch(f"/api/bitacora/{b2['id']}/", {"agregar_imagenes": [png, png]},
                                      content_type="application/json", **self.h).json()["fotos"].__len__(), 2)
        hist = self.c.get(f"/api/cotizaciones/{self.cot['id']}/bitacora/", **self.h).json()
        self.assertEqual([x["porcentaje"] for x in hist], [35, 20])          # la más reciente primero
        self.assertEqual(self.c.get(hist[1]["fotos"][0], **self.h).status_code, 200)
        self.assertEqual(Client().get(hist[1]["fotos"][0]).status_code, 401)  # las fotos no son públicas
        self.c.delete(f"/api/bitacora/{b2['id']}/", **self.h)
        self.assertEqual(self.avance(), 20)                                     # vuelve al registro anterior

    def test_bitacora_exige_comentario(self):
        self.pagar(self.hitos[0], pago_completo=True)
        self.assertEqual(self.bitacora(10, "").status_code, 422)

    def test_desglose_para_la_ficha_de_la_empresa(self):
        r = self.c.get(f"/api/cotizaciones/{self.cot['id']}/desglose/", **self.h).json()
        self.assertEqual(r["total"], self.cot["costo_total"])
        self.assertEqual(r["neto"] + r["iva"], round(r["total"]))
        self.assertEqual(self.c.get(f"/api/cotizaciones/{self.cot['id']}/desglose/").status_code, 401)

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

    def test_eliminar_cotizacion(self):
        from core.models import Cotizacion, HitoPago
        cid = self.cot["id"]
        self.assertTrue(HitoPago.objects.filter(cotizacion_id=cid).exists())
        self.assertEqual(self.c.delete(f"/api/cotizaciones/{cid}/", **self.h).status_code, 200)
        self.assertFalse(Cotizacion.objects.filter(id=cid).exists())
        self.assertFalse(HitoPago.objects.filter(cotizacion_id=cid).exists())
        self.assertEqual(self.c.delete(f"/api/cotizaciones/{cid}/", **self.h).status_code, 404)

    def test_agregar_foto_conserva_la_foto_externa(self):
        """Obras antiguas con imagen_url: al subir una foto nueva la anterior no desaparece, y puede quitarse."""
        import base64
        from core.models import PortafolioProyecto
        png = "data:image/png;base64," + base64.b64encode(b"PNG-fake" + b"0" * 20).decode()
        p = PortafolioProyecto.objects.create(titulo="Casa antigua", imagen_url="https://ejemplo.cl/casa.jpg")
        r = self.c.patch(f"/api/portafolio/{p.id}/", {"agregar_imagenes": [png]}, content_type="application/json", **self.h).json()
        self.assertEqual(len(r["imagenes"]), 2)
        self.assertEqual(r["imagenes"][0], "https://ejemplo.cl/casa.jpg")
        r = self.c.patch(f"/api/portafolio/{p.id}/", {"agregar_imagenes": [png], "quitar_portada": True},
                         content_type="application/json", **self.h).json()
        self.assertEqual(len(r["imagenes"]), 2)
        self.assertTrue(all(u.startswith("/api/portafolio/imagenes/") for u in r["imagenes"]))

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

    def test_presupuesto_de_referencia_carga_las_categorias_nuevas(self):
        from django.core.management import call_command
        from pathlib import Path
        archivo = Path(__file__).parent / "fixtures" / "materiales_presupuesto.json"
        call_command("cargar_materiales", str(archivo))
        call_command("cargar_materiales", str(archivo))  # repetible
        cats = set(CatalogoTipo.objects.values_list("categoria", flat=True))
        self.assertTrue({"RADIER_CASA", "TABIQUES", "ESTRUCTURA_TECHO", "FORRO_EXTERIOR", "ALEROS", "FORRO_INTERIOR",
                         "VENTANAS_PUERTAS", "SERVICIOS"} <= cats)
        self.assertEqual(CatalogoTipo.objects.filter(categoria="RADIER_CASA", nombre="Hormigón").get().precio_base_unitario, 1012000)


class MaterialesAdicionalesTests(TestCase):
    def setUp(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="8-1", nombre_completo="M", email="m@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        prov = Proveedor.objects.create(rut_empresa="PROV-M", razon_social="Prov M", descuento_pct=10)
        self.osb = CatalogoTipo.objects.create(categoria="INSUMO", nombre="Plancha OSB", unidad_medida="UN",
                                               precio_base_unitario=10000, proveedor=prov)  # neto 9.000

    def calc(self, **extra):
        return self.c.post("/api/cotizaciones/calcular", {"superficie_m2": 40, "distancia_km": 10, "modo_lista": True, **extra},
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
                          "superficie_m2": 40, "modo_lista": True, "materiales": [{"catalogo_id": self.osb.id, "cantidad": 3}]},
                          content_type="application/json", **self.h).json()
        from .models import DetalleCotizacionInsumo
        d = DetalleCotizacionInsumo.objects.get(cotizacion_id=cot["id"], es_adicional=True)
        self.assertEqual((d.catalogo_tipo_id, int(d.subtotal_costo)), (self.osb.id, 27000))
        # Reajuste sin cambiar nada de precio: la lista agregada se conserva y el valor no cambia.
        r = self.c.patch(f"/api/cotizaciones/{cot['id']}/", {"superficie_m2": 40, "aplicar": False},
                         content_type="application/json", **self.h).json()
        self.assertEqual(float(r["diferencia"]), 0)


class ModoListaTests(TestCase):
    """El valor sale de la lista: materiales + maestros + traslado + vigas + ganancia (sin tarifas por m²)."""
    def setUp(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="9-1", nombre_completo="L", email="l@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        prov = Proveedor.objects.create(rut_empresa="PROV-L", razon_social="Prov L", descuento_pct=0)
        self.cem = CatalogoTipo.objects.create(categoria="BASE_RADIER", nombre="Saco cemento", unidad_medida="SACO",
                                               precio_base_unitario=5000, proveedor=prov)
        self.base = {"superficie_m2": 50, "distancia_km": 10, "modo_lista": True, "m2_vigas_vista": 10,
                     "ganancia_m2": 30000,
                     "materiales": [{"catalogo_id": self.cem.id, "cantidad": 10}],
                     "maestros": [{"cantidad": 2, "cobro": 400000}]}

    def calcular(self, **over):
        return self.c.post("/api/cotizaciones/calcular", {**self.base, **over}, content_type="application/json", **self.h)

    def test_formula_exacta(self):
        r = self.calcular().json()
        materiales, mano, flete, vigas, ganancia = 50000, 800000, 50 * 5000, 10 * 65000, 50 * 30000
        self.assertEqual(float(r["costo_materiales_total"]), materiales)
        self.assertEqual(float(r["costo_mano_obra"]), mano)
        self.assertEqual(float(r["costo_flete"]), flete)
        self.assertEqual(float(r["total"]), materiales + mano + flete + vigas + ganancia)
        self.assertEqual(float(r["mano_obra_lineas"][0]["subtotal"]), mano)

    def test_sin_lista_no_inventa_materiales_ni_mano_de_obra(self):
        r = self.calcular(materiales=[], maestros=[]).json()
        self.assertEqual((float(r["costo_materiales_total"]), float(r["costo_mano_obra"])), (0, 0))

    def test_radier_no_cobra_vigas(self):
        r = self.calcular(tipo_proyecto="SOLO_RADIER").json()
        self.assertEqual(float(r["costo_vigas_vista"]), 0)

    def test_modo_antiguo_no_cambia(self):
        r = self.calcular(modo_lista=False, materiales=[], maestros=[]).json()
        self.assertGreater(float(r["costo_mano_obra"]), 0)  # tarifa por m² de las cotizaciones antiguas

    def test_guarda_maestros_y_conserva_valor_al_reajustar(self):
        cot = self.c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Lista", "direccion_terreno": "Calle Uno 1",
                          "superficie_m2": 50, "distancia_flete_km": 10, "m2_vigas_vista": 10, "modo_lista": True,
                          "materiales": self.base["materiales"], "maestros": self.base["maestros"]},
                          content_type="application/json", **self.h).json()
        from .models import ManoObraLinea
        self.assertEqual(ManoObraLinea.objects.get(cotizacion_id=cot["id"]).cobro, 400000)
        self.assertTrue(cot["modo_lista"])
        r = self.c.patch(f"/api/cotizaciones/{cot['id']}/", {"superficie_m2": 50, "aplicar": False},
                         content_type="application/json", **self.h).json()
        self.assertEqual(float(r["diferencia"]), 0)

    def test_pagos_diferenciados_se_suman(self):
        r = self.calcular(maestros=[{"cantidad": 2, "cobro": 400000}, {"cantidad": 1, "cobro": 250000}]).json()
        self.assertEqual(float(r["costo_mano_obra"]), 2 * 400000 + 250000)
        self.assertEqual(len(r["mano_obra_lineas"]), 2)

    def test_maestros_invalidos(self):
        self.assertEqual(self.calcular(maestros=[{"cantidad": 0, "cobro": 1000}]).status_code, 422)
        self.assertEqual(self.calcular(maestros=[{"cantidad": 1, "cobro": -5}]).status_code, 422)


class TarifasCalculoTests(TestCase):
    """Cotización por tarifas: traslado por combustible y mano de obra por m² x trabajadores."""

    OSB = [{"id": 1, "nombre": "OSB Smartside Lap", "unidad": "M2", "cantidad": 40, "precio_neto": 9881,
            "etapa": "ETAPA_1", "mano_obra_m2": 2000}]

    def test_traslado_ejemplo_de_la_empresa(self):
        # 50 km (ida y vuelta) = 5 litros por día; 25 días = 125 litros a $1.650
        t = calculo.traslado_combustible(50, 25, D(1650), D(10))
        self.assertEqual((t["litros"], t["costo"]), (D("125.00"), 206250))

    def test_casa_sin_radier(self):
        r = calculo.calcular(50, 50, modo_tarifas=True, n_trabajadores=2, dias_obra=25, m2_vigas_vista=10, adicionales=self.OSB)
        mo = {l["concepto"]: l["subtotal"] for l in r["mano_obra_detalle"]}
        self.assertEqual(mo, {"Casa": 2500000, "Vigas a la vista": 160000, "Instalación de OSB Smartside Lap": 160000})
        self.assertEqual((r["costo_mano_obra"], r["costo_flete"], r["dias_total"]), (2820000, 206250, 25))
        self.assertEqual(r["total"], 40 * 9881 + 2820000 + 206250 + 50 * 30000)
        self.assertEqual(r["neto"] + r["iva"], r["total"])
        self.assertEqual(sum(h["monto"] for h in r["hitos"]), r["total"])

    def test_radier_suma_cuatro_dias_y_su_mano_de_obra(self):
        r = calculo.calcular(50, 50, modo_tarifas=True, n_trabajadores=2, dias_obra=25, lleva_radier=True, tarifa_radier_m2=38000)
        self.assertEqual((r["dias_total"], r["costo_flete"]), (29, 239250))
        self.assertEqual(r["costo_mano_obra"], 50 * 25000 * 2 + 50 * 38000 * 2)

    def test_solo_radier_paga_solo_la_tarifa_del_radier(self):
        r = calculo.calcular(20, 30, modo_tarifas=True, n_trabajadores=2, tipo_proyecto="SOLO_RADIER", m2_vigas_vista=9)
        self.assertEqual([l["concepto"] for l in r["mano_obra_detalle"]], ["Radier / base"])
        self.assertEqual((r["costo_mano_obra"], r["dias_total"], r["costo_flete"]), (1400000, 4, 19800))

    def test_precio_del_litro_es_editable_y_los_modos_antiguos_no_cambian(self):
        self.assertEqual(calculo.calcular(50, 50, modo_tarifas=True, n_trabajadores=1, dias_obra=10, precio_litro=1800)["costo_flete"], 90000)
        self.assertEqual(calculo.calcular(10, 20, 0, 0)["costo_flete"], 50000)
        self.assertEqual(calculo.calcular(10, 20, modo_lista=True)["costo_flete"], 50000)


class CotizacionTarifasApiTests(TestCase):
    def setUp(self):
        u = Usuario.objects.create(rut="4-4", nombre_completo="Tarifas", email="tarifas@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        prov = Proveedor.objects.create(rut_empresa="PROV-T", razon_social="Prov T", descuento_pct=0)
        self.osb = CatalogoTipo.objects.create(categoria="REVESTIMIENTO", nombre="LP Smartside Lap Siding", unidad_medida="M2",
                                               precio_base_unitario=10000, proveedor=prov, mano_obra_m2=2000)
        self.cot = self.c.post("/api/cotizaciones/", {
            "cliente_nombre": "Cliente Tarifas", "direccion_terreno": "Calle Tres 3", "superficie_m2": 50,
            "distancia_flete_km": 50, "modo_lista": True, "modo_tarifas": True, "n_trabajadores": 2, "dias_obra": 25,
            "m2_vigas_vista": 10, "materiales": [{"catalogo_id": self.osb.id, "cantidad": 40}],
        }, content_type="application/json", **self.h).json()
        self.url = f"/api/cotizaciones/{self.cot['id']}/"

    def patch(self, body):
        return self.c.patch(self.url, body, content_type="application/json", **self.h).json()

    def test_se_guarda_con_traslado_por_combustible_y_mano_de_obra_por_tarifa(self):
        self.assertEqual((self.cot["costo_mano_obra"], self.cot["costo_flete"]), (2820000, 206250))
        self.assertEqual(self.cot["costo_total"], 400000 + 2820000 + 206250 + 50 * 30000)
        self.assertEqual((self.cot["modo_tarifas"], self.cot["n_trabajadores"], self.cot["dias_obra"], self.cot["precio_litro"]),
                         (True, 2, 25, 1650))

    def test_calcular_devuelve_el_detalle_para_la_pantalla(self):
        r = self.c.post("/api/cotizaciones/calcular", {
            "superficie_m2": 50, "distancia_km": 50, "modo_tarifas": True, "n_trabajadores": 2, "dias_obra": 25,
            "lleva_radier": True, "tarifa_radier_m2": 38000,
        }, content_type="application/json", **self.h).json()
        self.assertEqual((r["dias_total"], float(r["traslado"]["litros"])), (29, 145.0))
        self.assertIn("Radier / base", [l["concepto"] for l in r["mano_obra_detalle"]])

    def test_reajustar_dias_y_radier_recalcula(self):
        self.assertEqual(float(self.patch({"dias_obra": 30})["diferencia"]), 41250)          # 5 L x 5 días más x $1.650
        r = self.patch({"lleva_radier": True, "tarifa_radier_m2": 38000})
        self.assertEqual(float(r["diferencia"]), 33000 + 3800000)                             # +4 días de traslado + mano de obra del radier
        self.assertEqual(float(self.patch({"aplicar": False})["diferencia"]), 0)              # sin cambios, el valor se conserva

    def test_cotizacion_antigua_sigue_con_sus_tarifas(self):
        antigua = self.c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Antiguo", "direccion_terreno": "Calle Cuatro 4",
                              "superficie_m2": 10, "distancia_flete_km": 20, "modo_lista": True},
                              content_type="application/json", **self.h).json()
        self.assertEqual((antigua["modo_tarifas"], antigua["costo_flete"]), (False, 50000))  # tramo por m², no combustible


class FerrelanTests(TestCase):
    def test_lee_la_ficha_jumpseller(self):
        from . import scraper
        html = ('<meta property="og:title" content="OSB APA Protec Nacional 9.5mm 1.22x2.44 mts"><meta property="og:id" content="8070032">'
                '<meta property="product:price:amount" content="13190.0"><meta property="product:original_price:amount" content="13990.0">')
        r = scraper.parsear_meta(html)
        self.assertEqual((r["sku"], r["precio"]), ("8070032", 13190))
        with self.assertRaises(scraper.ErrorExtraccion):
            scraper.parsear_meta("<head></head>")

    def test_tienda_y_proveedor(self):
        from . import scraper, precios
        self.assertEqual(scraper.tienda_de("https://www.ferrelan.cl/osb-apa-protec-nacional-95mm-122x244-mts"), "ferrelan")
        with self.assertRaises(scraper.ErrorExtraccion):
            scraper.tienda_de("https://www.ferrelan.cl.malo.com/x")
        self.assertEqual(precios.proveedor_de("https://www.ferrelan.cl/x").razon_social, "Ferrelan")

    def test_alta_de_material_por_url_asigna_a_ferrelan(self):
        from unittest import mock
        u = Usuario.objects.create(rut="3-3", nombre_completo="F", email="f@d.cl")
        h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        ficha = {"nombre": "Terciado Ranurado Clásico 9mm", "sku": "123", "precio": D(15790)}
        with mock.patch("core.precios.scraper.extraer", return_value=ficha):
            r = Client().post("/api/catalogo-tipos/", {"categoria": "TABIQUERIA", "fuente_url": "https://www.ferrelan.cl/terciado-ranurado-clasico-9mm-1"},
                              content_type="application/json", **h)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["proveedor"]["razon_social"], r.json()["precio_lista"]), ("Ferrelan", 15790))

    def test_comando_configura_osb_y_proveedor_una_sola_vez(self):
        from django.core.management import call_command
        osb = CatalogoTipo.objects.create(categoria="REVESTIMIENTO", nombre="LP Smartside Lap Tradicional 9.5MMX4.88MTS", unidad_medida="M2")
        otro = CatalogoTipo.objects.create(categoria="REVESTIMIENTO", nombre="OSB Panel R8", unidad_medida="M2")
        call_command("configurar_tarifas"); call_command("configurar_tarifas")
        osb.refresh_from_db(); otro.refresh_from_db()
        self.assertEqual((osb.mano_obra_m2, otro.mano_obra_m2), (2000, 0))
        self.assertEqual(Proveedor.objects.filter(rut_empresa="FERRELAN-WEB").count(), 1)


class SelectorMaterialesApiTests(TestCase):
    """Datos que necesita el selector de materiales y la pestaña de materiales del proyecto."""

    def setUp(self):
        u = Usuario.objects.create(rut="5-6", nombre_completo="Selector", email="selector@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        self.prov = Proveedor.objects.create(rut_empresa="PROV-S", razon_social="Maderas SpA", descuento_pct=10)

    def test_catalogo_trae_proveedor_y_precio_neto_con_descuento(self):
        CatalogoTipo.objects.create(categoria="TABIQUERIA", nombre="Pino 2x4", unidad_medida="UN", precio_base_unitario=10000, proveedor=self.prov)
        CatalogoTipo.objects.create(categoria="TABIQUERIA", nombre="Pino 2x4 sin convenio", unidad_medida="UN", precio_base_unitario=5000)
        filas = {f["nombre"]: f for f in self.c.get("/api/catalogo-tipos/?activo=true", **self.h).json()}
        self.assertEqual((filas["Pino 2x4"]["proveedor"]["razon_social"], filas["Pino 2x4"]["precio_neto"]), ("Maderas SpA", 9000))
        self.assertEqual((filas["Pino 2x4 sin convenio"]["proveedor"], filas["Pino 2x4 sin convenio"]["precio_neto"]), (None, 5000))

    def test_detalle_del_proyecto_muestra_los_materiales_con_su_proveedor(self):
        item = CatalogoTipo.objects.create(categoria="TABIQUERIA", nombre="Pino 2x4", unidad_medida="UN",
                                           precio_base_unitario=1000, proveedor=self.prov)
        cot = self.c.post("/api/cotizaciones/", {
            "cliente_nombre": "Cliente Materiales", "direccion_terreno": "Calle Dos 2", "superficie_m2": 40, "modo_lista": True,
            "materiales": [{"catalogo_id": item.id, "cantidad": 3}],
        }, content_type="application/json", **self.h).json()
        det = self.c.get(f"/api/cotizaciones/{cot['id']}/", **self.h).json()
        mats = [d for d in det["detalles_insumo"] if d["es_adicional"]]
        self.assertEqual(len(mats), 1)
        self.assertEqual((mats[0]["catalogo_tipo"]["nombre"], mats[0]["catalogo_tipo"]["proveedor"]["razon_social"], float(mats[0]["cantidad_calculada"])),
                         ("Pino 2x4", "Maderas SpA", 3.0))


class UsuariosAutorizadosTests(TestCase):
    def setUp(self):
        self.u = Usuario.objects.create(rut="11.111.111-1", nombre_completo="Admin", email="admin@x.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.u)}"}
        self.nuevo = {"rut": "12.345.678-5", "nombre_completo": "Nuevo Usuario", "email": "Nuevo@X.cl"}

    def _post(self, d):
        return self.client.post("/api/usuarios/", d, content_type="application/json", **self.h)

    def test_crear_normaliza_y_permite_login(self):
        r = self._post(self.nuevo)
        self.assertEqual((r.status_code, r.json()["email"]), (200, "nuevo@x.cl"))
        self.assertEqual(Usuario.objects.get(email="nuevo@x.cl").rut, "12.345.678-5")

    def test_rechaza_run_invalido_y_duplicados(self):
        self.assertEqual(self._post({**self.nuevo, "rut": "12.345.678-9"}).status_code, 422)
        self._post(self.nuevo)
        self.assertEqual(self._post(self.nuevo).status_code, 400)

    def test_no_puede_desactivar_ni_eliminar_su_propio_acceso(self):
        r = self.client.put(f"/api/usuarios/{self.u.id}", {"rut": self.u.rut, "nombre_completo": "Admin", "email": self.u.email, "activo": False},
                            content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.delete(f"/api/usuarios/{self.u.id}", **self.h).status_code, 400)


class ContratoNotarialTests(TestCase):
    def setUp(self):
        self.u = Usuario.objects.create(rut="11.111.111-1", nombre_completo="Admin", email="admin@x.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.u)}"}
        self.cot = self.client.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Uno", "direccion_terreno": "Calle Uno 1",
                                    "superficie_m2": 40, "modo_lista": True}, content_type="application/json", **self.h).json()

    def _subir(self, pdf):
        import base64
        return self.client.post(f"/api/cotizaciones/{self.cot['id']}/contrato/", {"nombre_archivo": "c.pdf",
                                "pdf": "data:application/pdf;base64," + base64.b64encode(pdf).decode()}, content_type="application/json", **self.h)

    def test_adjuntar_ver_y_quitar(self):
        self.assertFalse(self.client.get(f"/api/cotizaciones/{self.cot['id']}/", **self.h).json()["tiene_contrato"])
        self.assertEqual(self._subir(b"%PDF-1.4 x").status_code, 200)
        self.assertTrue(self.client.get(f"/api/cotizaciones/{self.cot['id']}/", **self.h).json()["tiene_contrato"])
        self.assertEqual(self.client.get(f"/api/cotizaciones/public/{self.cot['token_publico']}/contrato").content, b"%PDF-1.4 x")
        self.assertEqual(self.client.delete(f"/api/cotizaciones/{self.cot['id']}/contrato/", **self.h).status_code, 200)

    def test_rechaza_lo_que_no_es_pdf(self):
        self.assertEqual(self._subir(b"hola").status_code, 400)


class ValidacionCrudsTests(TestCase):
    def setUp(self):
        u = Usuario.objects.create(rut="11.111.111-1", nombre_completo="Admin", email="admin@x.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}

    def _prov(self, rut):
        return self.client.post("/api/proveedores/", {"rut_empresa": rut, "razon_social": "Maderas SpA"}, content_type="application/json", **self.h)

    def test_proveedor_exige_rut_real_y_no_duplicado(self):
        self.assertEqual(self._prov("76.123.456-7").status_code, 422)
        self.assertEqual(self._prov("abc").status_code, 422)
        self.assertEqual(self._prov("76123456-0").json()["rut_empresa"], "76.123.456-0")
        self.assertEqual(self._prov("76.123.456-0").status_code, 400)

    def test_catalogo_rechaza_valores_invalidos(self):
        def post(**d):
            return self.client.post("/api/catalogo-tipos/", {"categoria": "TABIQUERIA", "nombre": "Pino", "unidad_medida": "UN", **d}, content_type="application/json", **self.h)
        self.assertEqual(post(precio_base_unitario=-1).status_code, 422)
        self.assertEqual(post(fuente_url="ftp://x").status_code, 422)
        self.assertEqual(post(precio_base_unitario=1000).status_code, 200)


class TarifasEditablesTests(TestCase):
    def setUp(self):
        u = Usuario.objects.create(rut="11.111.111-1", nombre_completo="Admin", email="admin@x.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}

    def test_cambiar_tarifa_modifica_el_calculo_y_se_restablece(self):
        from . import calculo
        base = calculo.calcular(50, 10, modo_lista=True)["total"]
        r = self.client.put("/api/tarifas/ganancia_m2", {"valor": 40000}, content_type="application/json", **self.h)
        self.assertEqual((r.status_code, r.json()["modificada"]), (200, True))
        self.assertEqual(calculo.calcular(50, 10, modo_lista=True)["total"] - base, 500000)  # 10.000 más por m² × 50 m²
        self.assertEqual(self.client.delete("/api/tarifas/ganancia_m2", **self.h).json()["modificada"], False)
        self.assertEqual(calculo.calcular(50, 10, modo_lista=True)["total"], base)

    def test_lista_todas_y_rechaza_negativos(self):
        self.assertEqual(len(self.client.get("/api/tarifas/", **self.h).json()), len(__import__("core.calculo").calculo.TARIFAS_META))
        self.assertEqual(self.client.put("/api/tarifas/ganancia_m2", {"valor": -1}, content_type="application/json", **self.h).status_code, 422)
        self.assertEqual(self.client.put("/api/tarifas/inventada", {"valor": 1}, content_type="application/json", **self.h).status_code, 404)


class LibroDePagosTests(TestCase):
    def setUp(self):
        u = Usuario.objects.create(rut="7-7", nombre_completo="Cajero", email="c@d.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        cot = self.client.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Pagos", "direccion_terreno": "Calle Uno 1",
                               "superficie_m2": 40}, content_type="application/json", **self.h).json()
        self.hito = HitoPago.objects.filter(cotizacion_id=cot["id"]).order_by("id").first()

    def abonar(self, monto, metodo="TRANSFERENCIA", **extra):
        return self.client.post(f"/api/hitos-pago/{self.hito.id}/registros/", {"monto": monto, "metodo": metodo, **extra},
                                content_type="application/json", **self.h)

    def test_abonos_suman_y_calculan_saldo(self):
        total = int(self.hito.monto_pago)
        r = self.abonar(1000).json()
        self.assertEqual((r["estado"], r["monto_abonado"], r["monto_pendiente"]), ("ABONADO", 1000, total - 1000))
        r = self.abonar(2000, "EFECTIVO").json()
        self.assertEqual([(x["monto"], x["acumulado"], x["saldo"], x["metodo_etiqueta"]) for x in r["registros"]],
                         [(1000, 1000, total - 1000, "Transferencia"), (2000, 3000, total - 3000, "Efectivo")])
        r = self.abonar(total - 3000).json()
        self.assertEqual((r["estado"], r["monto_pendiente"]), ("PAGADO", 0))

    def test_rechaza_monto_mayor_al_saldo_y_metodo_invalido(self):
        self.assertEqual(self.abonar(int(self.hito.monto_pago) + 1).status_code, 400)
        self.assertEqual(self.abonar(0).status_code, 422)
        self.assertEqual(self.abonar(1000, "TRUEQUE").status_code, 422)

    def test_comprobante_se_guarda_y_se_sirve(self):
        import base64
        r = self.abonar(1000, comprobante="data:application/pdf;base64," + base64.b64encode(b"%PDF-1 x").decode(), comprobante_nombre="c.pdf").json()
        reg = r["registros"][0]
        self.assertTrue(reg["tiene_comprobante"])
        self.assertEqual(self.client.get(f"/api/registros-pago/{reg['id']}/comprobante/", **self.h).content, b"%PDF-1 x")
        self.assertEqual(self.abonar(1000, comprobante="data:text/html;base64,AAAA").status_code, 400)

    def test_anular_un_abono_recalcula_el_hito(self):
        self.abonar(1000)
        reg = self.abonar(2000).json()["registros"][1]
        r = self.client.delete(f"/api/registros-pago/{reg['id']}/", **self.h).json()
        self.assertEqual((r["monto_abonado"], r["estado"], len(r["registros"])), (1000, "ABONADO", 1))


class ConteoDePagosTests(TestCase):
    """Recorrido completo: abonos parciales en los tres hitos, ajuste de valor y anulaciones; los números siempre cuadran."""
    def setUp(self):
        u = Usuario.objects.create(rut="7-7", nombre_completo="Cajero", email="c@d.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        self.cot = self.client.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Pagos", "direccion_terreno": "Calle Uno 1",
                                    "superficie_m2": 40}, content_type="application/json", **self.h).json()

    def hitos(self):
        return self.client.get(f"/api/cotizaciones/{self.cot['id']}/hitos/", **self.h).json()

    def abonar(self, hito, monto, metodo="EFECTIVO"):
        return self.client.post(f"/api/hitos-pago/{hito['id']}/registros/", {"monto": monto, "metodo": metodo}, content_type="application/json", **self.h)

    def test_cada_hito_cuadra_con_su_libro(self):
        for h in self.hitos():
            tercio = int(h["monto_pago"]) // 3
            for _ in range(2):
                self.assertEqual(self.abonar(h, tercio).status_code, 200)
        for h in self.hitos():
            filas = h["registros"]
            self.assertEqual(h["monto_abonado"], sum(r["monto"] for r in filas))
            self.assertEqual(h["monto_pendiente"], h["monto_pago"] - h["monto_abonado"])
            self.assertEqual((h["estado"], filas[-1]["saldo"]), ("ABONADO", h["monto_pendiente"]))
        ult = self.hitos()[0]
        self.abonar(ult, int(ult["monto_pendiente"]))
        self.assertEqual(self.hitos()[0]["estado"], "PAGADO")
        self.assertEqual(self.hitos()[0]["monto_pendiente"], 0)

    def test_el_ajuste_de_valor_solo_toca_lo_pendiente(self):
        h0 = self.hitos()[0]
        self.abonar(h0, 1000)
        self.client.patch(f"/api/cotizaciones/{self.cot['id']}/", {"ajuste_monto": 100000, "aplicar": True, "motivo": "alza"},
                          content_type="application/json", **self.h)
        nuevos = self.hitos()
        self.assertEqual(nuevos[0]["monto_abonado"], 1000)                       # lo cobrado no cambia
        self.assertGreater(nuevos[0]["monto_pago"], h0["monto_pago"])            # el aumento se reparte entre los hitos pendientes
        self.assertEqual(nuevos[0]["monto_pendiente"], nuevos[0]["monto_pago"] - 1000)
        self.assertEqual(sum(x["monto_pago"] for x in nuevos), float(Cotizacion.objects.get(id=self.cot["id"]).costo_total))

    def test_anular_todos_los_abonos_deja_el_hito_pendiente(self):
        h0 = self.hitos()[0]
        self.abonar(h0, 1000)
        self.abonar(h0, 2000)
        for r in self.hitos()[0]["registros"]:
            self.client.delete(f"/api/registros-pago/{r['id']}/", **self.h)
        h0 = self.hitos()[0]
        self.assertEqual((h0["estado"], h0["monto_abonado"], h0["fecha_pago"], h0["registros"]), ("PENDIENTE", 0, None, []))
        self.assertEqual(Cotizacion.objects.get(id=self.cot["id"]).estado, "BORRADOR")

    def test_una_rebaja_no_puede_dejar_un_hito_bajo_lo_ya_cobrado(self):
        h0 = self.hitos()[0]
        self.abonar(h0, int(h0["monto_pago"]) - 1000)                            # casi todo el anticipo cobrado
        r = self.client.patch(f"/api/cotizaciones/{self.cot['id']}/", {"ajuste_monto": -3_000_000, "aplicar": True, "motivo": "rebaja"},
                              content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 409)
        self.assertIn("ya se cobraron", r.json()["message"])
        self.assertEqual([h["monto_pago"] for h in self.hitos()][0], h0["monto_pago"])   # nada cambió


class TrasladosConCombustibleTests(TestCase):
    def setUp(self):
        from . import combustibles
        from .models import PrecioCombustible
        u = Usuario.objects.create(rut="7-7", nombre_completo="T", email="t@d.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        for tipo, precio in (("93", 1000), ("95", 1100), ("97", 1200), ("DIESEL", 900)):
            PrecioCombustible.objects.create(tipo=tipo, precio=precio)   # vigentes: no se consulta a la CNE
        self.base = {"cliente_nombre": "Cliente Uno", "direccion_terreno": "Calle Uno 1", "superficie_m2": 40, "distancia_flete_km": 30,
                     "modo_tarifas": True, "n_trabajadores": 3}

    def calcular(self, traslados):
        return self.client.post("/api/cotizaciones/calcular", {"superficie_m2": 40, "distancia_km": 30, "modo_tarifas": True, "n_trabajadores": 3,
                                "traslados": traslados}, content_type="application/json", **self.h).json()

    def test_cada_traslado_usa_su_combustible_y_sus_dias(self):
        r = self.calcular([{"tipo": "MAESTROS", "combustible": "93", "dias": 30}, {"tipo": "MATERIALES", "combustible": "DIESEL", "dias": 15},
                           {"tipo": "FLETE", "combustible": "97", "dias": 2}])
        costos = {l["tipo"]: float(l["costo"]) for l in r["traslado"]["lineas"]}
        # 30 km / 10 = 3 L por día: 3 x 1.000 x 30 = 90.000; 3 x 900 x 15 = 40.500; 3 x 1.200 x 2 = 7.200
        self.assertEqual(costos, {"MAESTROS": 90000, "MATERIALES": 40500, "FLETE": 7200})
        self.assertEqual(float(r["costo_flete"]), 137700)
        self.assertEqual(float(r["traslado"]["lineas"][0]["costo_por_dia"]), 3000)

    def test_se_guarda_con_el_precio_del_litro_de_ese_dia_y_el_desglose_lo_muestra(self):
        tr = [{"tipo": "MAESTROS", "combustible": "93", "dias": 10}, {"tipo": "MATERIALES", "combustible": "95", "dias": 5},
              {"tipo": "FLETE", "combustible": "DIESEL", "dias": 1}]
        cot = self.client.post("/api/cotizaciones/", {**self.base, "traslados": tr}, content_type="application/json", **self.h).json()
        from .models import PrecioCombustible
        PrecioCombustible.objects.filter(tipo="93").update(precio=2000)        # el combustible sube después
        d = self.client.get(f"/api/cotizaciones/{cot['id']}/desglose/", **self.h).json()
        self.assertEqual([(l["tipo"], l["precio_litro"], l["costo"]) for l in d["traslado"]["lineas"]],
                         [("MAESTROS", 1000, 30000), ("MATERIALES", 1100, 16500), ("FLETE", 900, 2700)])
        self.assertEqual(d["costo_flete"], 49200)

    def test_rechaza_tipo_combustible_y_repetidos(self):
        mal = lambda tr: self.client.post("/api/cotizaciones/calcular", {"superficie_m2": 40, "traslados": tr}, content_type="application/json", **self.h).status_code
        self.assertEqual(mal([{"tipo": "AVION", "combustible": "93", "dias": 1}]), 422)
        self.assertEqual(mal([{"tipo": "FLETE", "combustible": "91", "dias": 1}]), 422)
        self.assertEqual(mal([{"tipo": "FLETE", "combustible": "93", "dias": 1}, {"tipo": "FLETE", "combustible": "95", "dias": 1}]), 422)

    def test_sin_radier_en_el_terreno_los_maestros_suman_4_dias(self):
        tr = [{"tipo": "MAESTROS", "combustible": "93", "dias": 10}, {"tipo": "MATERIALES", "combustible": "93", "dias": 10},
              {"tipo": "FLETE", "combustible": "93", "dias": 1}]
        r = self.client.post("/api/cotizaciones/calcular", {"superficie_m2": 40, "distancia_km": 30, "modo_tarifas": True, "n_trabajadores": 3,
                             "lleva_radier": True, "tarifa_radier_m2": 35000, "traslados": tr}, content_type="application/json", **self.h).json()
        lin = {l["tipo"]: l for l in r["traslado"]["lineas"]}
        self.assertEqual((lin["MAESTROS"]["dias_total"], float(lin["MAESTROS"]["costo"])), (14, 3 * 1000 * 14))   # 10 + 4 días de fabricación
        self.assertEqual((lin["MATERIALES"]["dias_total"], lin["FLETE"]["dias_total"]), (10, 1))                   # solo los maestros


class CombustiblesCneTests(TestCase):
    FILAS = [{"zona_geografica_nombre": z, "combustible_nombre_largo": n, "precio_promedio": p}
             for z in ("Zona Centro", "Zona Sur") for n, p in (("Gasolina 93", "1614.4"), ("Gasolina 95", "1649"), ("Gasolina 97", "1688"),
                                                                ("Petroleo Diesel", "1619"), ("GLP Vehicular", "710"))]

    def _cne(self, filas):
        from unittest import mock
        r = mock.Mock(); r.json.return_value = {"data": filas}; r.raise_for_status.return_value = None
        return mock.patch("core.combustibles.requests.get", return_value=r)

    def test_lee_la_zona_configurada_y_guarda_los_precios(self):
        from . import combustibles
        with self._cne(self.FILAS):
            precios = combustibles.listar()
        self.assertEqual({p["tipo"]: p["precio"] for p in precios}, {"93": 1614, "95": 1649, "97": 1688, "DIESEL": 1619})
        with self._cne([]) as sin_red:   # vigentes: no vuelve a consultar
            combustibles.listar()
        sin_red.assert_not_called()

    def test_si_la_cne_falla_se_usa_el_ultimo_precio_guardado(self):
        import requests
        from unittest import mock
        from . import combustibles
        from .models import PrecioCombustible
        from django.utils import timezone
        from datetime import timedelta
        for t, p in (("93", 1), ("95", 2), ("97", 3), ("DIESEL", 4)):
            PrecioCombustible.objects.create(tipo=t, precio=p, actualizado_en=timezone.now() - timedelta(days=2))
        with mock.patch("core.combustibles.requests.get", side_effect=requests.ConnectionError()):
            self.assertEqual([p["precio"] for p in combustibles.listar()], [1, 2, 3, 4])

    def test_sin_precios_guardados_ni_cne_da_error_claro(self):
        import requests
        from unittest import mock
        from . import combustibles
        with mock.patch("core.combustibles.requests.get", side_effect=requests.ConnectionError()):
            with self.assertRaises(ValueError):
                combustibles.listar()


class CombustibleManualTests(TestCase):
    def setUp(self):
        u = Usuario.objects.create(rut="7-7", nombre_completo="T", email="t@d.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}

    def caida(self):
        import requests
        from unittest import mock
        return mock.patch("core.combustibles.requests.get", side_effect=requests.ConnectionError())

    def fijar(self, tipo, valor):
        return self.client.put(f"/api/combustibles/{tipo}", {"valor": valor}, content_type="application/json", **self.h)

    def test_con_la_cne_caida_se_cotiza_con_los_precios_manuales(self):
        with self.caida():
            estado = self.client.get("/api/combustibles/estado/", **self.h).json()
            self.assertIn("CNE", estado["error"])
            self.assertEqual([f["precio"] for f in estado["filas"]], [None] * 4)      # se pueden editar aunque no haya ninguno
            for tipo, v in (("93", 1500), ("95", 1600), ("97", 1700), ("DIESEL", 1400)):
                self.assertEqual(self.fijar(tipo, v).status_code, 200)
            r = self.client.post("/api/cotizaciones/calcular", {"superficie_m2": 40, "distancia_km": 30, "modo_tarifas": True, "n_trabajadores": 2,
                                 "traslados": [{"tipo": "FLETE", "combustible": "DIESEL", "dias": 2}]}, content_type="application/json", **self.h)
        self.assertEqual((r.status_code, float(r.json()["costo_flete"])), (200, 3 * 1400 * 2))

    def test_la_consulta_a_la_cne_no_pisa_un_precio_manual_y_se_puede_volver(self):
        from unittest import mock
        from . import combustibles
        filas = [{"zona_geografica_nombre": "Zona Centro", "combustible_nombre_largo": n, "precio_promedio": "1000"}
                 for n in ("Gasolina 93", "Gasolina 95", "Gasolina 97", "Petroleo Diesel")]
        resp = mock.Mock(); resp.json.return_value = {"data": filas}; resp.raise_for_status.return_value = None
        with mock.patch("core.combustibles.requests.get", return_value=resp):
            combustibles.actualizar()
            self.fijar("93", 2000)
            combustibles.actualizar()
            precios = {f["tipo"]: (f["precio"], f["manual"]) for f in combustibles.listar()}
            self.assertEqual((precios["93"], precios["95"]), ((2000, True), (1000, False)))
            r = self.client.delete("/api/combustibles/93", **self.h)
            self.assertEqual(r.status_code, 200)
            self.assertEqual({f["tipo"]: f["precio"] for f in r.json()["filas"]}["93"], 1000)
        with self.caida():
            self.fijar("93", 2000)
            self.assertEqual(self.client.delete("/api/combustibles/93", **self.h).status_code, 503)   # sigue el manual

    def test_rechaza_precio_cero_y_combustible_desconocido(self):
        self.assertEqual(self.fijar("93", 0).status_code, 400)
        self.assertEqual(self.fijar("91", 1000).status_code, 404)


class SeguridadTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.u = Usuario.objects.create(rut="7-7", nombre_completo="Seg", email="seg@d.cl")
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.u)}"}

    def login(self, **extra):
        return self.client.post("/api/auth/google", {"email": "intruso@x.cl"}, content_type="application/json", **extra)

    def test_el_inicio_de_sesion_se_limita_por_ip(self):
        for _ in range(10):
            self.login()
        self.assertEqual(self.login().status_code, 429)                       # a la 11.ª en un minuto
        self.assertNotEqual(self.login(REMOTE_ADDR="10.9.9.9").status_code, 429)  # otra IP no se ve afectada

    def test_la_ip_informada_por_el_proxy_solo_vale_con_la_clave(self):
        from django.test import override_settings
        with override_settings(PROXY_SECRET="clave-compartida"):
            for _ in range(10):
                self.login(HTTP_X_CLIENT_IP="1.1.1.1", HTTP_X_PROXY_SECRET="clave-compartida")
            self.assertEqual(self.login(HTTP_X_CLIENT_IP="1.1.1.1", HTTP_X_PROXY_SECRET="clave-compartida").status_code, 429)
            self.assertNotEqual(self.login(HTTP_X_CLIENT_IP="2.2.2.2", HTTP_X_PROXY_SECRET="clave-compartida").status_code, 429)   # otra IP real
            # sin la clave el encabezado se ignora: no se puede fingir otra IP ni cargar el límite a una ajena
            self.assertNotEqual(self.login(HTTP_X_CLIENT_IP="1.1.1.1", HTTP_X_PROXY_SECRET="mala").status_code, 429)

    def test_los_errores_internos_no_se_filtran(self):
        from unittest import mock
        with mock.patch("core.api.Proveedor.objects.create", side_effect=Exception('relation "proveedor" does not exist: SELECT * FROM x')):
            r = self.client.post("/api/proveedores/", {"rut_empresa": "76123456-0", "razon_social": "Maderas SpA"},
                                 content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 400)
        self.assertNotIn("SELECT", r.json()["message"])
        self.assertNotIn("relation", r.json()["message"])

    def test_token_vencido_o_sin_expiracion_se_rechaza(self):
        import jwt
        from django.conf import settings
        from datetime import datetime, timedelta, timezone as tz
        vencido = jwt.encode({"user_id": self.u.id, "exp": datetime.now(tz.utc) - timedelta(minutes=1)}, settings.SECRET_KEY, algorithm="HS256")
        sin_exp = jwt.encode({"user_id": self.u.id}, settings.SECRET_KEY, algorithm="HS256")
        for token in (vencido, sin_exp):
            self.assertEqual(self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {token}").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", **self.h).status_code, 200)

    def test_la_documentacion_de_la_api_no_se_publica_en_produccion(self):
        from django.conf import settings
        if not settings.DEBUG:
            self.assertEqual(self.client.get("/api/openapi.json").status_code, 404)

    def test_los_datos_se_pasan_como_parametros_no_como_sql(self):
        r = self.client.get("/api/catalogo-tipos/?categoria=' OR '1'='1&activo=true", **self.h)
        self.assertEqual((r.status_code, r.json()), (200, []))
        r = self.client.post("/api/proveedores/", {"rut_empresa": "76123456-0", "razon_social": "x'); DROP TABLE proveedor;--"},
                             content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(Proveedor.objects.filter(razon_social__startswith="x'); DROP").exists())

    def test_imagen_de_portafolio_solo_acepta_http(self):
        r = self.client.post("/api/portafolio/", {"titulo": "Casa uno", "imagen_url": "javascript:alert(1)"},
                             content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 422)


class MapeoPresupuestoTests(TestCase):
    def test_las_fichas_del_presupuesto_son_de_tiendas_conocidas_y_no_se_repiten(self):
        from . import scraper
        from .catalogo_mapeo import MAPEO_PRESUPUESTO
        categorias = {"RADIER_CASA", "TABIQUES", "ESTRUCTURA_TECHO", "FORRO_EXTERIOR", "ALEROS", "FORRO_INTERIOR", "VENTANAS_PUERTAS"}
        for cat, url, nombre, etapa, ok in MAPEO_PRESUPUESTO:
            self.assertIn(cat, categorias)
            scraper.tienda_de(url)  # lanza si no es Easy, Sodimac, MCT o Ferrelan
        pares = [(c, u) for c, u, *_ in MAPEO_PRESUPUESTO]
        self.assertEqual(len(pares), len(set(pares)))

    def test_mapear_agrega_los_materiales_y_es_repetible_sin_mover_los_insumos(self):
        from .catalogo_mapeo import MAPEO, MAPEO_PRESUPUESTO, mapear
        mapear()
        total = CatalogoTipo.objects.count()
        self.assertEqual(total, len(MAPEO) + len(MAPEO_PRESUPUESTO))
        self.assertEqual(mapear()["creados"], 0)                       # repetirlo no crea ni mueve nada
        self.assertEqual(CatalogoTipo.objects.count(), total)
        self.assertTrue(CatalogoTipo.objects.filter(categoria="INSUMO", fuente_url__contains="296449").exists())  # sigue como insumo
        self.assertTrue(CatalogoTipo.objects.filter(categoria="TABIQUES", fuente_url__contains="296449").exists())
        self.assertFalse(CatalogoTipo.objects.filter(categoria="VENTANAS_PUERTAS", fuente_url="").exists())


class AnticipoIniciaObraTests(TestCase):
    """La obra pasa a «En ejecución» solo cuando el anticipo del 40 % se paga por completo."""

    def setUp(self):
        u = Usuario.objects.create(rut="3-9", nombre_completo="Anticipo", email="anticipo@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        self.cot = self.c.post("/api/cotizaciones/", {"cliente_nombre": "Cliente Anticipo", "direccion_terreno": "Calle Uno 1",
                               "superficie_m2": 40}, content_type="application/json", **self.h).json()
        self.hitos = list(HitoPago.objects.filter(cotizacion_id=self.cot["id"]).order_by("id"))

    def pagar(self, hito, **body):
        return self.c.patch(f"/api/hitos-pago/{hito.id}/", body, content_type="application/json", **self.h)

    def test_un_abono_del_anticipo_no_inicia_la_obra_ni_el_avance(self):
        monto = float(self.hitos[0].monto_pago)
        self.pagar(self.hitos[0], pago_completo=False, monto_abonado=monto - 1)          # falta $1 del 40 %
        self.assertEqual(Cotizacion.objects.get(id=self.cot["id"]).estado, "BORRADOR")
        self.assertEqual(self.c.get("/api/cotizaciones/progreso/", **self.h).json(), [])
        r = self.c.post(f"/api/cotizaciones/{self.cot['id']}/bitacora/", {"porcentaje": 10, "comentario": "Inicio de obra"},
                        content_type="application/json", **self.h)
        self.assertEqual(r.status_code, 409)
        self.assertIn("anticipo", r.json()["message"])

    def test_el_anticipo_completo_inicia_la_obra(self):
        self.pagar(self.hitos[0], pago_completo=True)
        self.assertEqual(Cotizacion.objects.get(id=self.cot["id"]).estado, "ACEPTADA")
        self.assertEqual(len(self.c.get("/api/cotizaciones/progreso/", **self.h).json()), 1)


class EstadisticasPanelTests(TestCase):
    def setUp(self):
        u = Usuario.objects.create(rut="3-9", nombre_completo="Panel", email="panel@d.cl")
        self.c, self.h = Client(), {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}

    def crear(self, nombre):
        return self.c.post("/api/cotizaciones/", {"cliente_nombre": nombre, "direccion_terreno": "Calle Uno 1", "superficie_m2": 40},
                           content_type="application/json", **self.h).json()

    def test_cuenta_por_estado_y_por_trimestre(self):
        self.crear("Cliente Uno")                                              # Cotizado
        en_obra = self.crear("Cliente Dos")
        listo = self.crear("Cliente Tres")
        for hito in HitoPago.objects.filter(cotizacion_id=en_obra["id"]).order_by("id")[:1]:
            self.c.patch(f"/api/hitos-pago/{hito.id}/", {"pago_completo": True}, content_type="application/json", **self.h)
        for hito in HitoPago.objects.filter(cotizacion_id=listo["id"]).order_by("id"):
            self.c.patch(f"/api/hitos-pago/{hito.id}/", {"pago_completo": True}, content_type="application/json", **self.h)
        e = self.c.get("/api/cotizaciones/estadisticas/", **self.h).json()
        self.assertEqual((e["cotizados"], e["en_ejecucion"], e["terminados"]), (1, 1, 1))
        self.assertEqual(len(e["trimestres"]), 4)
        actual = e["trimestres"][-1]                                           # el trimestre en curso es el último
        self.assertEqual((actual["creados"], actual["terminados"]), (3, 1))

    def test_requiere_sesion(self):
        self.assertEqual(self.client.get("/api/cotizaciones/estadisticas/").status_code, 401)


class CombustibleCentroSurTests(TestCase):
    def test_promedia_la_zona_centro_y_la_zona_sur_e_ignora_las_demas(self):
        from unittest import mock
        from . import combustibles
        filas = [{"zona_geografica_nombre": z, "combustible_nombre_largo": n, "precio_promedio": str(p)}
                 for z, p in (("Zona Centro", 1600), ("Zona Sur", 1700), ("Zona Norte", 9999))
                 for n in ("Gasolina 93", "Gasolina 95", "Gasolina 97", "Petroleo Diesel")]
        r = mock.Mock(); r.json.return_value = {"data": filas}; r.raise_for_status.return_value = None
        with mock.patch("core.combustibles.requests.get", return_value=r):
            precios = combustibles.leer_cne()
        self.assertEqual(precios, {"93": 1650, "95": 1650, "97": 1650, "DIESEL": 1650})
        self.assertEqual(combustibles.nombre_zona(), "Zona Centro + Zona Sur")

    def test_el_catalogo_de_tarifas_ya_no_muestra_traslado_por_tramo_ni_bencina(self):
        from .calculo import TARIFAS_META
        claves = {t[0] for t in TARIFAS_META}
        self.assertFalse({"traslado_m2_hasta_35km", "traslado_m2_hasta_100km", "precio_litro"} & claves)


class ResumenProyectoTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        u = Usuario.objects.create(rut="12345678-9", nombre_completo="A", email="a@d.cl", google_id="g1", activo=True)
        self.h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        self.cot = Cotizacion.objects.create(codigo_cotizacion="COT-R", cliente_nombre="Juan Pérez", cliente_rut="12345678-5",
                                             direccion_terreno="Calle Secreta 123", superficie_m2=60, costo_total=1000000, usuario=u)
        HitoPago.objects.create(cotizacion=self.cot, fase="ANTICIPO_40", porcentaje=40, monto_pago=400000)

    def pedir(self, para="interno"):
        return self.client.post(f"/api/cotizaciones/{self.cot.id}/resumen/?para={para}", **self.h)

    def test_sin_clave_entrega_el_resumen_base_sin_datos_personales(self):
        r = self.pedir()
        d = r.json()
        self.assertEqual((r.status_code, d["origen"]), (200, "base"))
        self.assertIn("60 m²", d["texto"])
        self.assertIn("Pendiente: anticipo", d["texto"])
        self.assertNotIn("Juan", d["texto"])

    def test_con_ia_usa_su_texto_y_no_envia_datos_personales_y_si_falla_cae_al_base(self):
        import requests
        from unittest import mock
        from django.test import override_settings
        resp = mock.Mock(); resp.raise_for_status.return_value = None
        resp.json.return_value = {"choices": [{"message": {"content": "Todo va bien."}}]}
        with override_settings(GROQ_API_KEY="k"):
            with mock.patch("core.resumen.requests.post", return_value=resp) as p:
                d = self.pedir("cliente").json()
            enviado = str(p.call_args.kwargs["json"])
            self.assertEqual((d["origen"], d["texto"]), ("ia", "Todo va bien."))
            self.assertNotIn("Secreta", enviado); self.assertNotIn("Juan", enviado); self.assertNotIn("12345678", enviado)
            with mock.patch("core.resumen.requests.post", side_effect=requests.ConnectionError()):
                self.assertEqual(self.pedir().json()["origen"], "base")

    def test_valida_el_destino_y_la_cotizacion(self):
        self.assertEqual(self.pedir("otro").status_code, 400)
        self.assertEqual(self.client.post("/api/cotizaciones/99999/resumen/", **self.h).status_code, 404)
