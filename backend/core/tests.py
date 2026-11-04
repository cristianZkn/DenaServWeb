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
