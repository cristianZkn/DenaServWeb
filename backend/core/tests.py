from django.test import TestCase, Client, override_settings
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
        self.assertEqual(calculo.precio_venta(D(1000), D("1.3"))["total"], D("1547"))
        self.assertEqual(sum(h[2] for h in calculo.hitos(D("1547"))), D("1547"))

    def test_arido_cliente_cuesta_cero(self):
        r = calculo.calcular(60, 10, 10, 1000, 1000, 5000, arido_empresa=False)
        self.assertEqual(r["costo_nivelacion"], 0)

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
            "cliente_nombre": "X", "direccion_terreno": "Calle 1", "superficie_m2": 54, "distancia_flete_km": 25,
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
        res = Client().post("/api/cotizaciones/", {"cliente_nombre": "X", "direccion_terreno": "d", "superficie_m2": 10},
                            content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {create_jwt_token(u)}")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Cotizacion.objects.get().detalles_insumo.count(), 2)


class GananciasWhatsappTests(TestCase):
    def test_ganancias_y_whatsapp(self):
        from .api import create_jwt_token
        u = Usuario.objects.create(rut="3-5", nombre_completo="C", email="c@d.cl")
        h = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(u)}"}
        c = Client()
        cot = c.post("/api/cotizaciones/", {"cliente_nombre": "X", "direccion_terreno": "d", "superficie_m2": 50},
                     content_type="application/json", **h).json()
        obra = ObraEjecucion.objects.get(cotizacion_id=cot["id"])
        c.patch(f"/api/obras/{obra.id}/", {"porcentaje_avance_real": 55, "gasto_real_acumulado": 1000},
                content_type="application/json", **h)
        g = c.get(f"/api/cotizaciones/{cot['id']}/ganancias/", **h).json()
        self.assertTrue(g["hito_avance_exigible"])
        self.assertEqual(g["ganancia_real"], g["neto_cobrado"] - 1000)
        from .models import PortafolioProyecto
        PortafolioProyecto.objects.create(titulo="Casa Maipú", cotizacion_id=cot["id"])
        url = c.get("/api/portafolio/").json()[0]["whatsapp_url"]
        self.assertTrue(url.startswith("https://wa.me/") and "Casa%20Maip" in url and "50" in url)


class PreciosTests(TestCase):
    def test_actualiza_por_id_de_articulo_y_no_pisa_con_vacio(self):
        from . import precios
        a = CatalogoTipo.objects.create(categoria="INSUMO", nombre="A", unidad_medida="UN", precio_base_unitario=100,
                                        fuente_url="https://www.sodimac.cl/sodimac-cl/articulo/111/a?exp=x", fuente_termino="pino")
        b = CatalogoTipo.objects.create(categoria="INSUMO", nombre="B", unidad_medida="UN", precio_base_unitario=200,
                                        fuente_url="https://www.sodimac.cl/sodimac-cl/product/222X/b/222X/", fuente_termino="pino")
        fake = lambda term: [{"url": "https://www.sodimac.cl/sodimac-cl/articulo/111/otro-slug", "price": 150},
                             {"product_id": "222X", "url": "https://www.sodimac.cl/sodimac-cl/product/222X/b/222X/", "price": None}]
        r = precios.actualizar_precios(runner=fake)
        a.refresh_from_db(); b.refresh_from_db()
        self.assertEqual(float(a.precio_base_unitario), 150.0)
        self.assertEqual(float(b.precio_base_unitario), 200.0)
        self.assertEqual((r["actualizados"], r["no_encontrados"]), (1, ["B"]))


    def test_sincronizar_crea_solo_lo_requerido_y_el_mas_barato(self):
        from . import precios
        fake = lambda term: [
            {"name": "Pino Impregnado 2 x 3 x 3,2 m", "price": 5000, "url": "https://s/product/A1/x", "product_id": "A1"},
            {"name": "Pino impregnado 2x3 económico", "price": 4000, "url": "https://s/product/A2/x", "product_id": "A2"},
            {"name": "Pino impregnado 2x3 mkt", "price": 100, "url": "https://s/product/A3/x", "is_marketplace": True},
            {"name": "Toldo 2x3", "price": 50, "url": "https://s/product/A4/x"},
        ]
        r = precios.sincronizar_catalogo(runner=fake)
        it = CatalogoTipo.objects.get(fuente_termino="pino impregnado 2x3")
        self.assertEqual(float(it.precio_base_unitario), 4000.0)
        self.assertEqual(it.etapa_obra, "ETAPA_1")
        self.assertNotIn("pino impregnado 2x3", r["sin_coincidencia"])
        self.assertEqual(precios.sincronizar_catalogo(runner=fake)["creados"], [])  # idempotente


    def test_parsear_mct(self):
        from . import precios
        html = ('<div class="grilla"><a class="nombreGrilla" href="ficha/16936/terciado-15mm">TERCIADO 15MM</a>'
                '<a class="valorGrilla" href="x"><span class="conDescuento">$25.526</span></a></div>'
                '<div class="grilla"><a class="nombreGrilla" href="ficha/1/osb">OSB 11MM</a></div>')
        r = precios.parsear_mct(html)
        self.assertEqual(len(r), 1)  # el ítem sin precio se ignora
        self.assertEqual((r[0]["price"], r[0]["product_id"]), (25526, "16936"))
        self.assertEqual(r[0]["url"], "https://mct.cl/ficha/16936/terciado-15mm")
