"""Reportes (operativo, gerencial, por período), exportación a CSV/Excel/PDF y análisis del dashboard. Requieren PostgreSQL (vistas SQL)."""
import io
from datetime import timedelta

from django.test import Client, TestCase
from django.utils import timezone

from .api import create_jwt_token
from .models import Cotizacion, DetalleRegistro, HitoPago, RegistroAuditoria, Usuario


class ReportesTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create(rut="11111111-1", nombre_completo="Ana Admin", email="a@d.cl", rol="ADMIN")
        self.oper = Usuario.objects.create(rut="22222222-2", nombre_completo="Omar Oper", email="o@d.cl", rol="OPERADOR")
        self.ha = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.admin)}"}
        self.ho = {"HTTP_AUTHORIZATION": f"Bearer {create_jwt_token(self.oper)}"}
        self.c = Client()
        # Una cotización terminada de $1.190.000 (neto 1.000.000) con costos de 750.000 y otra solo cotizada
        self.cot = self.nueva("R-1", "Cliente Uno", 1_190_000, "FINALIZADA", dias=40)
        self.nueva("R-2", "Cliente Dos", 595_000, "BORRADOR", dias=5)

    def nueva(self, codigo, cliente, total, estado, dias):
        cot = Cotizacion.objects.create(codigo_cotizacion=codigo, cliente_nombre=cliente, direccion_terreno="Calle 1", superficie_m2=50, usuario=self.admin,
                                        costo_materiales=int(total * 0.4), costo_mano_obra=int(total * 0.2), costo_flete=0, costo_total=total, estado=estado)
        Cotizacion.objects.filter(id=cot.id).update(fecha_creacion=timezone.now() - timedelta(days=dias))
        if estado == "FINALIZADA":
            h = HitoPago.objects.create(cotizacion=cot, fase="ANTICIPO_40", porcentaje=100, monto_pago=total, monto_abonado=total, estado="PAGADO")
            DetalleRegistro.objects.create(hito=h, monto=total, metodo="TRANSFERENCIA")
        return cot

    def get(self, tipo, h=None, **params):
        return self.c.get(f"/api/reportes/{tipo}/", params, **(h or self.ha))

    def test_operativo_en_pantalla_con_totales_y_filtros(self):
        d = self.get("operativo").json()
        self.assertEqual((d["total_filas"], len(d["filas"])), (2, 2))
        self.assertEqual(d["totales"]["total"], 1_785_000)
        self.assertEqual(d["totales"]["cobrado"], 1_190_000)
        self.assertEqual(d["totales"]["saldo"], 595_000)
        solo = self.get("operativo", estado="FINALIZADA").json()
        self.assertEqual([f[0] for f in solo["filas"]], ["R-1"])
        self.assertEqual(self.get("operativo", buscar="dos").json()["filas"][0][0], "R-2")
        hoy = timezone.localdate()
        self.assertEqual(self.get("operativo", desde=(hoy - timedelta(days=10)).isoformat()).json()["total_filas"], 1)

    def test_paginacion_del_reporte_operativo(self):
        d = self.get("operativo", por_pagina=1, pagina=2).json()
        self.assertEqual((d["total_filas"], len(d["filas"]), d["pagina"]), (2, 1, 2))

    def test_exportacion_csv_con_filtros_y_separador(self):
        r = self.get("operativo", formato="csv", estado="FINALIZADA")
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/csv", r["Content-Type"])
        self.assertIn("attachment", r["Content-Disposition"])
        texto = r.content.decode("utf-8-sig")
        self.assertIn("Código;Cliente;Estado", texto)
        self.assertIn("R-1;Cliente Uno;Terminada", texto)
        self.assertNotIn("R-2", texto)
        self.assertIn("TOTAL", texto)

    def test_exportacion_excel_abre_y_trae_formulas_de_total(self):
        from openpyxl import load_workbook
        r = self.get("operativo", formato="xlsx")
        hoja = load_workbook(io.BytesIO(r.content)).active
        self.assertEqual(hoja["A4"].value, "Código")
        self.assertEqual(hoja["A5"].value, "R-2")                              # la más reciente primero
        totales = [c.value for c in hoja[hoja.max_row]]
        self.assertEqual(totales[0], "TOTAL")
        self.assertTrue(any(isinstance(v, str) and v.startswith("=SUM(") for v in totales))

    def test_exportacion_pdf_es_un_pdf_con_texto(self):
        r = self.get("operativo", formato="pdf")
        self.assertTrue(r.content.startswith(b"%PDF"))
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertEqual(self.get("gerencial", formato="pdf").content[:4], b"%PDF")

    def test_cada_exportacion_queda_registrada_con_quien_la_pidio(self):
        self.get("periodo", formato="csv", h=self.ho)
        reg = RegistroAuditoria.objects.get(accion="EXPORTAR")
        self.assertEqual((reg.usuario_id, reg.entidad), (self.oper.id, "Reporte periodo"))
        self.assertIn("CSV", reg.detalle)
        self.get("periodo", h=self.ho)                                          # verlo en pantalla no es exportar
        self.assertEqual(RegistroAuditoria.objects.filter(accion="EXPORTAR").count(), 1)

    def test_gerencial_solo_para_admin(self):
        self.assertEqual(self.get("gerencial", h=self.ho).status_code, 403)
        d = self.get("gerencial").json()
        self.assertEqual(d["totales"]["ganancia"], 400_000 + 200_000)         # (total - costos) / 1,19 de cada cotización
        self.assertEqual(self.get("gerencial", h=self.ho, formato="pdf").status_code, 403)

    def test_periodo_suma_los_pagos_recibidos(self):
        d = self.get("periodo", h=self.ho).json()
        self.assertEqual(d["totales"]["monto"], 1_190_000)
        self.assertEqual(d["filas"][0][1], "Transferencia")

    def test_filtros_invalidos_son_400_y_tipo_desconocido_404(self):
        self.assertEqual(self.get("operativo", formato="doc").status_code, 400)
        self.assertEqual(self.get("operativo", estado="X").status_code, 400)
        self.assertEqual(self.get("operativo", desde="2026-05-01", hasta="2026-01-01").status_code, 400)
        self.assertEqual(self.get("operativo", desde="no-es-fecha").status_code, 422)
        self.assertEqual(self.get("inventado").status_code, 404)
        self.assertEqual(self.c.get("/api/reportes/operativo/").status_code, 401)

    def test_analisis_del_dashboard_con_indicadores_formula_y_series(self):
        d = self.c.get("/api/dashboard/analisis/", **self.ho).json()
        ind = {i["clave"]: i for i in d["indicadores"]}
        self.assertGreaterEqual(len(ind), 6)
        self.assertTrue(all(i["formula"] and i["pregunta"] for i in ind.values()))
        self.assertEqual(ind["cotizaciones"]["valor"], 2)
        self.assertEqual(ind["conversion"]["valor"], 50.0)
        self.assertEqual(ind["cobranza"]["valor"], 100.0)
        self.assertEqual(ind["por_cobrar"]["valor"], 0)
        self.assertEqual(sum(m["cotizaciones"] for m in d["mensual"]), 2)
        self.assertEqual({e["estado"] for e in d["por_estado"]}, {"BORRADOR", "FINALIZADA"})
        self.assertEqual(d["por_metodo"][0]["monto"], 1_190_000)
        filtrado = self.c.get("/api/dashboard/analisis/?estado=BORRADOR", **self.ho).json()
        self.assertEqual({i["clave"]: i["valor"] for i in filtrado["indicadores"]}["cotizaciones"], 1)
        self.assertEqual(self.c.get("/api/dashboard/analisis/?estado=X", **self.ho).status_code, 400)
