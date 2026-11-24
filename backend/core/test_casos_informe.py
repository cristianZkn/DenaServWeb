"""Casos de prueba del informe técnico (capítulo 7.3), ejecutados de verdad contra la API: cada TC<ejercicio>-<n> corresponde a una fila
de las tablas del informe y su resultado esperado es el que el sistema entrega.

Ejercicio 1 Usuarios · 2 Proveedores · 3 Materiales y precios · 4 Pagos y avance · 5 Roles y auditoría · 6 Reportes · 7 Resumen con IA."""
import base64
from datetime import timedelta
from decimal import Decimal as D
from unittest import mock

from django.test import Client, TestCase, override_settings
from django.utils import timezone

from .api import create_jwt_token
from .models import (BitacoraAvance, CatalogoTipo, Cotizacion, DetalleRegistro, HitoPago, ObraEjecucion, PortafolioProyecto, Proveedor, RegistroAuditoria,
                     Usuario)

JSON = "application/json"


class Base(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create(rut="11.111.111-1", nombre_completo="Cristian Soto", email="cristian.soto5@virginiogomez.cl", rol="ADMIN")
        self.oper = Usuario.objects.create(rut="22.222.222-2", nombre_completo="Ignacio Espinoza", email="ignacio.espinoza@virginiogomez.cl", rol="OPERADOR")
        self.c = Client()
        self.ha = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.admin)}"}
        self.ho = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.oper)}"}

    def post(self, ruta, cuerpo, h=None):
        return self.c.post(ruta, cuerpo, content_type=JSON, **(h or self.ha))

    def put(self, ruta, cuerpo, h=None):
        return self.c.put(ruta, cuerpo, content_type=JSON, **(h or self.ha))

    def patch(self, ruta, cuerpo, h=None):
        return self.c.patch(ruta, cuerpo, content_type=JSON, **(h or self.ha))

    def get(self, ruta, h=None):
        return self.c.get(ruta, **(h or self.ha))


class Ejercicio1Usuarios(Base):
    def alta(self, nombre, run, email, **extra):
        return self.post("/api/usuarios/", {"nombre_completo": nombre, "rut": run, "email": email, **extra})

    def test_TC1_01_usuario_valido(self):
        r = self.alta("UsuarioDePrueba1", "44.444.444-4", "maikol17aj@gmail.com")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()["rut"], r.json()["activo"], r.json()["rol"]), ("44.444.444-4", True, "OPERADOR"))

    def test_TC1_02_run_repetido(self):
        self.alta("UsuarioDePrueba1", "44.444.444-4", "maikol17aj@gmail.com")
        r = self.alta("UsuarioDePrueba2", "44.444.444-4", "prueba@gmail.com")
        self.assertEqual((r.status_code, r.json()["message"]), (400, "Ya existe un usuario con ese RUN."))

    def test_TC1_03_correo_repetido_sin_distinguir_mayusculas(self):
        self.alta("UsuarioDePrueba1", "44.444.444-4", "maikol17aj@gmail.com")
        r = self.alta("UsuarioDePrueba3", "55.555.555-5", "Maikol17aj@gmail.com")
        self.assertEqual((r.status_code, r.json()["message"]), (400, "Ya existe un usuario con ese correo."))

    def test_TC1_04_run_incompleto(self):
        r = self.alta("UsuarioDePrueba4", "1.212", "prueba1@gmail.com")
        self.assertEqual(r.status_code, 422)
        self.assertIn("El RUN debe tener 7 u 8 números y un dígito verificador", r.json()["message"])

    def test_TC1_05_correo_sin_arroba(self):
        r = self.alta("UsuarioDePrueba5", "21.212.121-5", "Prueba2gmail.com")
        self.assertEqual(r.status_code, 422)
        self.assertIn("Al correo le falta el «@»", r.json()["message"])

    def test_TC1_06_digito_verificador_incorrecto_modulo_11(self):
        r = self.alta("UsuarioDePrueba6", "12.121.212-1", "prueba3@gmail.com")
        self.assertEqual(r.status_code, 422)
        self.assertIn("El dígito verificador del RUN no corresponde: para 12.121.212 debería ser", r.json()["message"])

    def test_TC1_07_rol_invalido(self):
        r = self.alta("UsuarioDePrueba7", "21.212.121-5", "prueba4@gmail.com", rol="JEFE")
        self.assertEqual((r.status_code, r.json()["message"]), (422, "El rol debe ser Admin u Operador."))

    def test_TC1_08_un_operador_no_puede_autorizar_usuarios(self):
        r = self.post("/api/usuarios/", {"nombre_completo": "UsuarioDePrueba8", "rut": "21.212.121-5", "email": "p8@gmail.com"}, self.ho)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Usuario.objects.count(), 2)                              # no se creó nada


class Ejercicio2Proveedores(Base):
    def alta(self, rut, razon, **extra):
        return self.post("/api/proveedores/", {"rut_empresa": rut, "razon_social": razon, **extra})

    def test_TC2_01_proveedor_completo(self):
        r = self.alta("76.123.456-0", "Maderas del Sur SpA", contacto_nombre="Pedro Valdivia", telefono="+56 9 12345678", email="Contacto@proveedor.cl")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()["telefono"], r.json()["email"], r.json()["activo"]), ("+56 9 1234 5678", "contacto@proveedor.cl", True))

    def test_TC2_02_campos_opcionales_nulos(self):
        r = self.alta("77.111.222-6", "Ferretería del Sur Ltda.")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()["contacto_nombre"], r.json()["telefono"], r.json()["email"]), (None, None, None))

    def test_TC2_03_rut_repetido(self):
        self.alta("76.123.456-0", "Maderas del Sur SpA")
        r = self.alta("76.123.456-0", "Constructora del Bío-Bío")
        self.assertEqual((r.status_code, r.json()["message"]), (400, "Ya existe un proveedor con ese RUT."))

    def test_TC2_04_razon_social_vacia(self):
        r = self.alta("78.222.333-K", "")
        self.assertEqual((r.status_code, r.json()["message"]), (422, "La razón social debe tener entre 2 y 150 caracteres."))

    def test_TC2_05_telefono_correo_y_rut_invalidos_a_la_vez(self):
        r = self.alta("78.444.555-0", "Barraca Central", telefono="+56 9 123", email="sinarroba.cl")
        self.assertEqual(r.status_code, 422)
        m = r.json()["message"]
        self.assertIn("El teléfono debe tener 9 dígitos", m)
        self.assertIn("Al correo le falta el «@»", m)

    def test_TC2_06_proveedor_inactivo(self):
        r = self.alta("79.555.666-4", "Insumos Coronel SpA", activo=False)
        self.assertEqual((r.status_code, r.json()["activo"]), (200, False))

    def test_TC2_07_digito_verificador_de_la_empresa_incorrecto(self):
        r = self.alta("78.222.333-4", "Campo Vacío Ltda.")
        self.assertEqual(r.status_code, 422)
        self.assertIn("El dígito verificador del RUT no corresponde: para 78.222.333 debería ser K", r.json()["message"])

    def test_TC2_08_un_operador_ve_proveedores_pero_no_los_crea_ni_elimina(self):
        p = Proveedor.objects.create(rut_empresa="76.123.456-0", razon_social="Maderas del Sur SpA")
        self.assertEqual(self.get("/api/proveedores/", self.ho).status_code, 200)
        self.assertEqual(self.post("/api/proveedores/", {"rut_empresa": "77.111.222-6", "razon_social": "Otra"}, self.ho).status_code, 403)
        self.assertEqual(self.c.delete(f"/api/proveedores/{p.id}", **self.ho).status_code, 403)
        self.assertTrue(Proveedor.objects.filter(id=p.id).exists())


class Ejercicio3Materiales(Base):
    URL = "https://www.sodimac.cl/sodimac-cl/product/7/cemento-25-kg"

    def alta(self, **campos):
        return self.post("/api/catalogo-tipos/", {"categoria": "TECHUMBRE", **campos})

    def test_TC3_01_alta_con_ficha_en_linea(self):
        ficha = {"nombre": "Cemento 25 kg", "sku": "7", "precio": D(4836), "precio_normal": D(5090)}
        with mock.patch("core.precios.scraper.extraer", return_value=ficha):
            r = self.alta(categoria="BASE_RADIER", fuente_url=self.URL, unidad_medida="SACO")
        j = r.json()
        self.assertEqual(r.status_code, 200)
        # precio de lista = precio normal de la tienda; el descuento es el que muestra la tienda; costo neto = precio vigente
        self.assertEqual((j["precio_lista"], j["descuento_pct"], j["costo_neto"], j["proveedor"]["razon_social"]), (5090, 4.99, 4836, "Sodimac"))

    def test_TC3_02_alta_manual_con_descuento_propio(self):
        r = self.alta(categoria="TABIQUERIA", nombre="Clavo 3 pulgadas", unidad_medida="KG", precio_base_unitario=2500, descuento_pct=10)
        fila = self.get("/api/insumos/?categoria=TABIQUERIA").json()[0]           # el listado calcula lista, descuento y costo neto
        self.assertEqual((r.status_code, fila["precio_lista"], fila["descuento_pct"], fila["costo_neto"]), (200, 2500, 10, 2250))

    def test_TC3_03_manual_sin_nombre(self):
        r = self.alta(unidad_medida="UN", precio_base_unitario=1000)
        self.assertEqual((r.status_code, r.json()["message"]), (400, "Indique el nombre del material."))

    def test_TC3_04_unidad_de_medida_obligatoria_y_valida(self):
        r = self.alta(nombre="Clavo", unidad_medida="XX", precio_base_unitario=1000)
        self.assertEqual(r.status_code, 422)
        self.assertIn("Elija la unidad de medida del material", r.json()["message"])

    def test_TC3_05_direccion_de_ficha_sin_http(self):
        r = self.alta(fuente_url="www.sodimac.cl/producto", unidad_medida="UN")
        self.assertEqual(r.status_code, 422)
        self.assertIn("debe comenzar con http:// o https://", r.json()["message"])

    def test_TC3_06_descuento_fuera_de_rango(self):
        r = self.alta(nombre="Clavo", unidad_medida="KG", precio_base_unitario=2500, descuento_pct=150)
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["message"], "Descuento: no puede ser mayor que 100")
        self.assertFalse(CatalogoTipo.objects.exists())

    def test_TC3_07_precio_negativo(self):
        r = self.alta(nombre="Clavo", unidad_medida="KG", precio_base_unitario=-5)
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["message"], "Precio: no puede ser menor que 0")

    def test_TC3_08_con_ficha_el_descuento_lo_manda_la_tienda(self):
        ficha = {"nombre": "Cemento 25 kg", "sku": "7", "precio": D(4836), "precio_normal": D(5090)}
        with mock.patch("core.precios.scraper.extraer", return_value=ficha):
            item = self.alta(categoria="BASE_RADIER", fuente_url=self.URL, unidad_medida="SACO").json()
            r = self.put(f"/api/catalogo-tipos/{item['id']}", {"categoria": "BASE_RADIER", "fuente_url": self.URL, "unidad_medida": "SACO", "descuento_pct": 40})
        self.assertEqual((r.status_code, r.json()["descuento_pct"]), (200, 4.99))   # el 40 escrito a mano se ignora

    def test_TC3_09_sincronizacion_masiva_tolera_una_ficha_caida(self):
        from . import precios, scraper
        buena = CatalogoTipo.objects.create(categoria="TECHUMBRE", nombre="Zinc", unidad_medida="UN", fuente_url="https://www.sodimac.cl/a", precio_base_unitario=6790,
                                            precio_lista=6790, costo_neto=6790, sku="1")
        mala = CatalogoTipo.objects.create(categoria="TECHUMBRE", nombre="Cemento", unidad_medida="SACO", fuente_url="https://www.sodimac.cl/b", precio_base_unitario=4000,
                                           precio_lista=4000, costo_neto=4000, sku="2")

        def extractor(url):
            if url.endswith("/b"):
                raise scraper.ErrorExtraccion("La ficha ya no existe en la tienda (404).")
            return {"nombre": "Zinc", "sku": "1", "precio": D(7000), "precio_normal": D(7000)}
        res = precios.actualizar_precios_mercado(extractor=extractor, pausa=0)
        buena.refresh_from_db(); mala.refresh_from_db()
        self.assertEqual((res["revisados"], res["actualizados"], len(res["errores"])), (2, 1, 1))
        self.assertEqual((buena.precio_lista, mala.precio_base_unitario), (7000, 4000))   # el caído conserva su último precio
        self.assertIn("404", mala.ultimo_error)

    def test_TC3_10_filtros_por_categoria_y_estado(self):
        CatalogoTipo.objects.create(categoria="TECHUMBRE", nombre="Zinc", unidad_medida="UN", activo=True)
        CatalogoTipo.objects.create(categoria="TECHUMBRE", nombre="Zinc viejo", unidad_medida="UN", activo=False)
        CatalogoTipo.objects.create(categoria="TABIQUERIA", nombre="Pino", unidad_medida="UN")
        nombres = lambda q: sorted(i["nombre"] for i in self.get(f"/api/insumos/{q}").json())
        self.assertEqual(nombres("?categoria=TECHUMBRE"), ["Zinc", "Zinc viejo"])
        self.assertEqual(nombres("?categoria=TECHUMBRE&activo=false"), ["Zinc viejo"])
        self.assertEqual(CatalogoTipo.objects.count(), 3)                          # filtrar no altera los registros

    def test_TC3_11_el_operador_sincroniza_precios_pero_no_edita_materiales(self):
        item = CatalogoTipo.objects.create(categoria="TECHUMBRE", nombre="Zinc", unidad_medida="UN")
        with mock.patch("core.api.precios.iniciar_actualizacion", return_value=True):
            self.assertEqual(self.post("/api/insumos/actualizar-precios", {}, self.ho).status_code, 202)
        self.assertEqual(self.put(f"/api/catalogo-tipos/{item.id}", {"categoria": "TECHUMBRE", "nombre": "Otro", "unidad_medida": "UN"}, self.ho).status_code, 403)
        self.assertEqual(self.alta(nombre="Nuevo", unidad_medida="UN", precio_base_unitario=1).status_code, 200)   # el Admin sí


class Ejercicio4Pagos(Base):
    def setUp(self):
        super().setUp()
        self.cot = Cotizacion.objects.create(codigo_cotizacion="COT-T4", cliente_nombre="Cliente Prueba", direccion_terreno="Calle 1", superficie_m2=60,
                                             costo_total=1_000_000, usuario=self.admin)
        self.h = [HitoPago.objects.create(cotizacion=self.cot, fase=f, porcentaje=p, monto_pago=m)
                  for f, p, m in [("ANTICIPO_40", 40, 400_000), ("AVANCE_30", 30, 300_000), ("ENTREGA_30", 30, 300_000)]]

    def abonar(self, hito, monto, **extra):
        return self.post(f"/api/hitos-pago/{hito.id}/registros/", {"monto": monto, "metodo": "TRANSFERENCIA", **extra}, self.ho)

    def estado(self):
        return Cotizacion.objects.get(id=self.cot.id).estado

    def test_TC4_01_abono_parcial(self):
        r = self.abonar(self.h[0], 100_000)
        self.assertEqual((r.status_code, r.json()["estado"], float(r.json()["monto_abonado"]), self.estado()), (200, "ABONADO", 100_000, "BORRADOR"))

    def test_TC4_02_el_anticipo_completo_inicia_la_obra(self):
        self.abonar(self.h[0], 100_000)
        r = self.abonar(self.h[0], 300_000)
        self.assertEqual((r.json()["estado"], self.estado()), ("PAGADO", "ACEPTADA"))
        self.assertTrue(ObraEjecucion.objects.filter(cotizacion=self.cot).exists())

    def test_TC4_03_abono_mayor_al_saldo(self):
        r = self.abonar(self.h[0], 400_001)
        self.assertEqual((r.status_code, r.json()["message"]), (400, "El monto debe estar entre $1 y lo que falta por pagar ($400.000)."))
        self.assertFalse(DetalleRegistro.objects.exists())

    def test_TC4_04_abono_en_cero(self):
        r = self.abonar(self.h[0], 0)
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["message"], "Monto: debe ser mayor que 0")

    def test_TC4_05_comprobante_de_tipo_no_permitido(self):
        texto = "data:text/plain;base64," + base64.b64encode(b"hola").decode()
        r = self.abonar(self.h[0], 1000, comprobante=texto, comprobante_nombre="nota.txt")
        self.assertEqual((r.status_code, r.json()["message"]), (400, "El comprobante debe ser una imagen (JPG, PNG, WebP) o un PDF."))

    def test_TC4_06_avance_sin_el_pago_correspondiente(self):
        self.abonar(self.h[0], 400_000)
        r = self.post(f"/api/cotizaciones/{self.cot.id}/bitacora/", {"porcentaje": 60, "comentario": "Estructura lista", "imagenes": []}, self.ho)
        self.assertEqual((r.status_code, r.json()["message"]), (409, "El avance no puede llegar al 50 % mientras el 2.º pago no esté cobrado completo."))

    def test_TC4_07_avance_coherente_con_los_pagos(self):
        self.abonar(self.h[0], 400_000)
        r = self.post(f"/api/cotizaciones/{self.cot.id}/bitacora/", {"porcentaje": 40, "comentario": "Radier y estructura", "imagenes": []}, self.ho)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(float(ObraEjecucion.objects.get(cotizacion=self.cot).porcentaje_avance_real), 40)

    def test_TC4_08_el_avance_no_puede_retroceder(self):
        self.abonar(self.h[0], 400_000)
        self.post(f"/api/cotizaciones/{self.cot.id}/bitacora/", {"porcentaje": 40, "comentario": "Uno", "imagenes": []}, self.ho)
        r = self.post(f"/api/cotizaciones/{self.cot.id}/bitacora/", {"porcentaje": 30, "comentario": "Dos", "imagenes": []}, self.ho)
        self.assertEqual((r.status_code, r.json()["message"]), (409, "El avance no puede ser menor al ya registrado (40 %)."))

    def test_TC4_09_anular_un_pago_que_respalda_el_avance_pide_confirmar(self):
        self.abonar(self.h[0], 400_000)
        self.post(f"/api/cotizaciones/{self.cot.id}/bitacora/", {"porcentaje": 40, "comentario": "Uno", "imagenes": []}, self.ho)
        reg = DetalleRegistro.objects.get()
        r = self.c.delete(f"/api/registros-pago/{reg.id}/", **self.ho)
        self.assertEqual((r.status_code, r.json()["confirmar"]), (409, True))
        self.assertIn("bajará a 0 %", r.json()["message"])
        self.assertEqual((DetalleRegistro.objects.count(), self.estado()), (1, "ACEPTADA"))    # no cambió nada

    def test_TC4_10_anular_confirmado_baja_el_avance_y_conserva_la_bitacora(self):
        self.abonar(self.h[0], 400_000)
        self.post(f"/api/cotizaciones/{self.cot.id}/bitacora/", {"porcentaje": 40, "comentario": "Uno", "imagenes": []}, self.ho)
        reg = DetalleRegistro.objects.get()
        r = self.c.delete(f"/api/registros-pago/{reg.id}/?forzar=true", **self.ho)
        self.assertEqual((r.status_code, r.json()["estado"], self.estado()), (200, "PENDIENTE", "BORRADOR"))
        self.assertEqual(float(ObraEjecucion.objects.get(cotizacion=self.cot).porcentaje_avance_real), 0)
        self.assertEqual(BitacoraAvance.objects.count(), 1)

    def test_TC4_11_reemplazar_el_comprobante(self):
        self.abonar(self.h[0], 1000)
        png = "data:image/png;base64," + base64.b64encode(b"\x89PNG-prueba").decode()
        reg = DetalleRegistro.objects.get()
        r = self.put(f"/api/registros-pago/{reg.id}/comprobante/", {"comprobante": png, "comprobante_nombre": "nuevo.png"}, self.ho)
        reg.refresh_from_db()
        self.assertEqual((r.status_code, reg.comprobante_nombre, bytes(reg.comprobante)), (200, "nuevo.png", b"\x89PNG-prueba"))

    def test_TC4_12_todos_los_pagos_terminan_la_obra(self):
        for h in self.h:
            self.patch(f"/api/hitos-pago/{h.id}/", {"pago_completo": True}, self.ho)
        self.assertEqual(self.estado(), "FINALIZADA")


class Ejercicio5Roles(Base):
    def test_TC5_01_operador_no_crea_proveedores(self):
        r = self.post("/api/proveedores/", {"rut_empresa": "76.123.456-0", "razon_social": "X SpA"}, self.ho)
        self.assertEqual((r.status_code, r.json()["message"]), (403, "Su rol (Operador) no permite esta acción."))

    def test_TC5_02_operador_no_ve_usuarios_ni_auditoria(self):
        self.assertEqual(self.get("/api/usuarios/", self.ho).status_code, 403)
        self.assertEqual(self.get("/api/auditoria/", self.ho).status_code, 403)

    def test_TC5_03_operador_oculta_un_proyecto_del_portafolio(self):
        p = PortafolioProyecto.objects.create(titulo="Casa Uno", publicado=True)
        r = self.patch(f"/api/portafolio/{p.id}/", {"publicado": False}, self.ho)
        self.assertEqual((r.status_code, PortafolioProyecto.objects.get().publicado), (200, False))

    def test_TC5_04_operador_no_edita_ni_elimina_proyectos(self):
        p = PortafolioProyecto.objects.create(titulo="Casa Uno", publicado=True)
        r = self.patch(f"/api/portafolio/{p.id}/", {"titulo": "Otro título"}, self.ho)
        self.assertEqual((r.status_code, r.json()["message"]), (403, "Su rol (Operador) solo puede ocultar o publicar proyectos del portafolio."))
        self.assertEqual(self.c.delete(f"/api/portafolio/{p.id}/", **self.ho).status_code, 403)
        self.assertEqual(PortafolioProyecto.objects.get().titulo, "Casa Uno")

    def test_TC5_05_admin_no_puede_quitarse_su_propio_rol(self):
        r = self.put(f"/api/usuarios/{self.admin.id}", {"nombre_completo": "Cristian Soto", "rut": "11.111.111-1", "email": self.admin.email, "rol": "OPERADOR"})
        self.assertEqual((r.status_code, r.json()["message"]), (400, "No puedes quitarte tu propio rol de Admin."))

    def test_TC5_06_admin_no_puede_desactivarse_ni_eliminarse(self):
        r = self.put(f"/api/usuarios/{self.admin.id}", {"nombre_completo": "Cristian Soto", "rut": "11.111.111-1", "email": self.admin.email, "activo": False, "rol": "ADMIN"})
        self.assertEqual((r.status_code, r.json()["message"]), (400, "No puedes desactivar tu propio acceso."))
        self.assertEqual(self.c.delete(f"/api/usuarios/{self.admin.id}", **self.ha).status_code, 400)

    def test_TC5_07_los_cambios_quedan_auditados_con_su_autor(self):
        self.post("/api/proveedores/", {"rut_empresa": "76.123.456-0", "razon_social": "Maderas del Sur SpA"})
        reg = RegistroAuditoria.objects.get(entidad="Proveedor")
        self.assertEqual((reg.accion, reg.usuario_nombre, reg.usuario_id), ("CREAR", "Cristian Soto", self.admin.id))
        self.assertEqual(self.get("/api/auditoria/?entidad=Proveedor").json()[0]["usuario_nombre"], "Cristian Soto")

    def test_TC5_08_la_documentacion_de_la_api_es_solo_para_admin(self):
        self.assertEqual(self.c.get("/api/openapi.json").status_code, 401)
        self.assertEqual(self.c.get("/api/openapi.json", **self.ho).status_code, 403)
        self.assertEqual(self.c.get("/api/openapi.json", **self.ha).status_code, 200)

    def test_TC5_09_sin_sesion_o_con_token_invalido(self):
        self.assertEqual(self.c.get("/api/proveedores/").status_code, 401)
        self.assertEqual(self.c.get("/api/proveedores/", HTTP_AUTHORIZATION="Bearer token-falso").status_code, 401)
        Usuario.objects.filter(id=self.oper.id).update(activo=False)              # un usuario desactivado pierde el acceso al instante
        self.assertEqual(self.get("/api/proveedores/", self.ho).status_code, 401)


class Ejercicio6Reportes(Base):
    def setUp(self):
        super().setUp()
        for codigo, cliente, total, estado, dias in [("R-1", "Cliente Uno", 1_190_000, "FINALIZADA", 40), ("R-2", "Cliente Dos", 595_000, "BORRADOR", 5)]:
            cot = Cotizacion.objects.create(codigo_cotizacion=codigo, cliente_nombre=cliente, direccion_terreno="Calle 1", superficie_m2=50, usuario=self.admin,
                                            costo_materiales=int(total * 0.4), costo_mano_obra=int(total * 0.2), costo_total=total, estado=estado)
            Cotizacion.objects.filter(id=cot.id).update(fecha_creacion=timezone.now() - timedelta(days=dias))
            if estado == "FINALIZADA":
                h = HitoPago.objects.create(cotizacion=cot, fase="ANTICIPO_40", porcentaje=100, monto_pago=total, monto_abonado=total, estado="PAGADO")
                DetalleRegistro.objects.create(hito=h, monto=total, metodo="TRANSFERENCIA")

    def rep(self, tipo, h=None, **q):
        return self.c.get(f"/api/reportes/{tipo}/", q, **(h or self.ho))

    def test_TC6_01_reporte_operativo_con_totales(self):
        d = self.rep("operativo").json()
        self.assertEqual((d["total_filas"], d["totales"]["total"], d["totales"]["cobrado"], d["totales"]["saldo"]), (2, 1_785_000, 1_190_000, 595_000))

    def test_TC6_02_filtro_por_estado_y_texto(self):
        self.assertEqual([f[0] for f in self.rep("operativo", estado="FINALIZADA").json()["filas"]], ["R-1"])
        self.assertEqual([f[0] for f in self.rep("operativo", buscar="dos").json()["filas"]], ["R-2"])

    def test_TC6_03_exportacion_csv(self):
        r = self.rep("operativo", formato="csv", estado="FINALIZADA")
        texto = r.content.decode("utf-8-sig")
        self.assertEqual((r.status_code, "text/csv" in r["Content-Type"]), (200, True))
        self.assertIn("R-1;Cliente Uno;Terminada", texto)
        self.assertNotIn("R-2", texto)

    def test_TC6_04_exportacion_excel_y_pdf(self):
        import io
        from openpyxl import load_workbook
        x = self.rep("operativo", formato="xlsx")
        self.assertEqual(load_workbook(io.BytesIO(x.content)).active["A4"].value, "Código")
        self.assertTrue(self.rep("operativo", formato="pdf").content.startswith(b"%PDF"))

    def test_TC6_05_cada_exportacion_queda_registrada(self):
        self.rep("periodo", formato="csv")
        reg = RegistroAuditoria.objects.get(accion="EXPORTAR")
        self.assertEqual((reg.usuario_id, reg.entidad), (self.oper.id, "Reporte periodo"))

    def test_TC6_06_reporte_gerencial_solo_admin(self):
        self.assertEqual(self.rep("gerencial").status_code, 403)
        self.assertEqual(self.rep("gerencial", h=self.ha).json()["totales"]["ganancia"], 600_000)

    def test_TC6_07_rango_de_fechas_invertido(self):
        r = self.rep("operativo", desde="2026-05-01", hasta="2026-01-01")
        self.assertEqual((r.status_code, r.json()["message"]), (400, "La fecha «desde» no puede ser posterior a «hasta»."))

    def test_TC6_08_formato_y_reporte_desconocidos(self):
        self.assertEqual(self.rep("operativo", formato="doc").status_code, 400)
        self.assertEqual(self.rep("inventado").status_code, 404)

    def test_TC6_09_indicadores_del_dashboard(self):
        ind = {i["clave"]: i["valor"] for i in self.get("/api/dashboard/analisis/", self.ho).json()["indicadores"]}
        self.assertEqual((ind["cotizaciones"], ind["conversion"], ind["cobranza"], ind["por_cobrar"]), (2, 50.0, 100.0, 0))


class Ejercicio7ResumenIA(Base):
    def setUp(self):
        super().setUp()
        self.cot = Cotizacion.objects.create(codigo_cotizacion="COT-IA", cliente_nombre="Juan Pérez", cliente_rut="12.345.678-5", direccion_terreno="Calle Secreta 123",
                                             superficie_m2=60, costo_total=1_000_000, usuario=self.admin)
        HitoPago.objects.create(cotizacion=self.cot, fase="ANTICIPO_40", porcentaje=40, monto_pago=400_000)

    def pedir(self, para="interno"):
        return self.c.post(f"/api/cotizaciones/{self.cot.id}/resumen/?para={para}", **self.ho)

    def test_TC7_01_sin_clave_se_entrega_el_resumen_base_sin_datos_personales(self):
        d = self.pedir().json()
        self.assertEqual(d["origen"], "base")
        self.assertNotIn("Juan", d["texto"])

    def test_TC7_02_con_ia_no_se_envian_datos_personales(self):
        resp = mock.Mock(); resp.raise_for_status.return_value = None
        resp.json.return_value = {"choices": [{"message": {"content": "Todo va bien."}}]}
        with override_settings(GROQ_API_KEY="clave-de-prueba"), mock.patch("core.resumen.requests.post", return_value=resp) as p:
            d = self.pedir("cliente").json()
        enviado = str(p.call_args.kwargs["json"])
        self.assertEqual((d["origen"], d["texto"]), ("ia", "Todo va bien."))
        for secreto in ("Juan", "Secreta", "12.345.678"):
            self.assertNotIn(secreto, enviado)

    def test_TC7_03_tiempo_agotado_o_error_del_servicio_cae_al_resumen_base(self):
        import requests
        with override_settings(GROQ_API_KEY="clave-de-prueba"):
            with mock.patch("core.resumen.requests.post", side_effect=requests.Timeout()) as p:
                self.assertEqual(self.pedir().json()["origen"], "base")
            self.assertEqual(p.call_args.kwargs["timeout"], 20)

    def test_TC7_04_destino_invalido_y_cotizacion_inexistente(self):
        self.assertEqual(self.pedir("otro").status_code, 400)
        self.assertEqual(self.c.post("/api/cotizaciones/99999/resumen/", **self.ho).status_code, 404)
