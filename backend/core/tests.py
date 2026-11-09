from django.test import TestCase, Client
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

    def test_catalogo_tipo_filter(self):
        res = self.client.get("/api/catalogo-tipos/?categoria=REVESTIMIENTO")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["nombre"], "Smart Panel 11.1mm")

    def test_cotizacion_and_hitos_creation(self):
        # Primero login para obtener token
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
        res = Client().post("/api/cotizaciones/calcular", {"superficie_m2": 60, "distancia_km": 10, "espesor_cm": 10},
            content_type="application/json")
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
        r = Client().post("/api/cotizaciones/calcular", {"superficie_m2": 10}, content_type="application/json").json()
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
