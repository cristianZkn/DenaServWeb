"""Reportes de gestión: datos (desde las vistas SQL de la migración 0027) y exportación a CSV, Excel y PDF.

Tres reportes:
- operativo: detalle de cotizaciones (una fila por proyecto, con lo cobrado, el saldo y el avance). Filtros: fechas, estado y texto.
- gerencial: ganancia por trimestre y estado, con totales y gráfico. Solo Admin (muestra ganancias).
- periodo: pagos recibidos por mes y método dentro de un rango de fechas.

CSV: UTF-8 con BOM (para que Excel respete las tildes), separador «;» y números sin separador de miles."""
import csv
import io
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.db import connection
from django.utils import timezone

TIPOS = ("operativo", "gerencial", "periodo")
SOLO_ADMIN = {"gerencial"}
ESTADOS = {"BORRADOR": "Cotizado", "ACEPTADA": "En ejecución", "FINALIZADA": "Terminada"}
METODOS = {"EFECTIVO": "Efectivo", "TRANSFERENCIA": "Transferencia", "CHEQUE": "Cheque", "DEBITO": "Débito", "CREDITO": "Crédito", "OTRO": "Otro"}
FORMATOS = ("json", "csv", "xlsx", "pdf")


@dataclass
class Reporte:
    titulo: str
    columnas: list                      # [(clave, encabezado, tipo)] con tipo texto | fecha | pesos | numero | porcentaje
    filas: list                         # lista de tuplas, en el orden de las columnas
    totales: dict = field(default_factory=dict)   # clave de columna -> total
    filtros: list = field(default_factory=list)   # textos legibles de los filtros aplicados
    total_filas: int = 0                # filas que cumplen el filtro (puede ser mayor que len(filas) si hay paginación)
    grafico: tuple | None = None        # (título, [(etiqueta, valor)]) para el PDF


def _consultar(sql, params=()):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall()


def _rango(desde, hasta, defecto=True):
    hoy = timezone.localdate()
    if defecto:
        desde, hasta = desde or hoy - timedelta(days=365), hasta or hoy
    return desde, hasta


def _texto_rango(desde, hasta):
    f = lambda d: d.strftime("%d-%m-%Y")
    return f"Fechas: {f(desde) if desde else 'desde el inicio'} a {f(hasta) if hasta else 'hoy'}"


def operativo(desde=None, hasta=None, estado=None, buscar=None, pagina=None, por_pagina=25):
    donde, p = ["1=1"], []
    if desde:
        donde.append("fecha_local >= %s"), p.append(desde)
    if hasta:
        donde.append("fecha_local <= %s"), p.append(hasta)
    if estado:
        donde.append("estado = %s"), p.append(estado)
    if buscar:
        donde.append("(cliente_nombre ILIKE %s OR codigo_cotizacion ILIKE %s)"), p.extend([f"%{buscar}%"] * 2)
    where = " AND ".join(donde)
    total, suma_total, suma_cobrado = _consultar(
        f"SELECT COUNT(*), COALESCE(SUM(costo_total), 0), COALESCE(SUM(monto_cobrado), 0) FROM vista_cotizacion_resumen WHERE {where}", p)[0]
    limite = "" if pagina is None else f" LIMIT {int(por_pagina)} OFFSET {(max(1, int(pagina)) - 1) * int(por_pagina)}"
    filas = _consultar(
        "SELECT codigo_cotizacion, cliente_nombre, estado, fecha_local, superficie_m2, costo_total, monto_cobrado, costo_total - monto_cobrado, avance "
        f"FROM vista_cotizacion_resumen WHERE {where} ORDER BY fecha_local DESC, cotizacion_id DESC{limite}", p)
    filas = [(c, n, ESTADOS.get(e, e), f, m2, t, cob, saldo, av) for c, n, e, f, m2, t, cob, saldo, av in filas]
    filtros = [_texto_rango(desde, hasta)]
    if estado:
        filtros.append(f"Estado: {ESTADOS.get(estado, estado)}")
    if buscar:
        filtros.append(f"Texto: {buscar}")
    return Reporte(
        "Reporte operativo: cotizaciones y cobros",
        [("codigo", "Código", "texto"), ("cliente", "Cliente", "texto"), ("estado", "Estado", "texto"), ("fecha", "Fecha", "fecha"),
         ("m2", "m²", "numero"), ("total", "Total (IVA incl.)", "pesos"), ("cobrado", "Cobrado", "pesos"), ("saldo", "Saldo", "pesos"),
         ("avance", "Avance obra %", "porcentaje")],
        filas, {"total": suma_total, "cobrado": suma_cobrado, "saldo": suma_total - suma_cobrado}, filtros, total)


def gerencial(desde=None, hasta=None, **_):
    desde, hasta = _rango(desde, hasta)
    filas = _consultar(
        "SELECT anio, trimestre, estado, cotizaciones, neto, ganancia_neta, monto_cobrado FROM vista_ganancia_trimestral "
        "WHERE make_date(anio, (trimestre - 1) * 3 + 1, 1) BETWEEN date_trunc('quarter', %s::date) AND %s::date ORDER BY anio, trimestre, estado", (desde, hasta))
    filas = [(f"T{t} {a}", ESTADOS.get(e, e), n, neto, gan, cob) for a, t, e, n, neto, gan, cob in filas]
    por_trim = {}
    for etiqueta, _e, _n, _neto, gan, _c in filas:
        por_trim[etiqueta] = por_trim.get(etiqueta, 0) + gan
    return Reporte(
        "Reporte gerencial: ganancia por trimestre",
        [("trimestre", "Trimestre", "texto"), ("estado", "Estado", "texto"), ("cotizaciones", "Cotizaciones", "numero"),
         ("neto", "Venta neta", "pesos"), ("ganancia", "Ganancia neta", "pesos"), ("cobrado", "Cobrado", "pesos")],
        filas, {"cotizaciones": sum(f[2] for f in filas), "neto": sum(f[3] for f in filas), "ganancia": sum(f[4] for f in filas), "cobrado": sum(f[5] for f in filas)},
        [_texto_rango(desde, hasta), "Ganancia neta = lo cobrado al cliente menos el costo presupuestado, sin IVA."], len(filas),
        ("Ganancia neta por trimestre", list(por_trim.items())))


def periodo(desde=None, hasta=None, **_):
    desde, hasta = _rango(desde, hasta)
    filas = _consultar("SELECT mes, metodo, pagos, monto FROM vista_pagos_mensuales WHERE mes BETWEEN date_trunc('month', %s::date) AND %s::date ORDER BY mes, metodo",
                       (desde, hasta))
    por_mes = {}
    for mes, _m, _p, monto in filas:
        por_mes[mes.strftime("%m-%Y")] = por_mes.get(mes.strftime("%m-%Y"), 0) + monto
    filas = [(mes, METODOS.get(m, m), p, monto) for mes, m, p, monto in filas]
    return Reporte(
        "Reporte por período: pagos recibidos",
        [("mes", "Mes", "mes"), ("metodo", "Método de pago", "texto"), ("pagos", "N.º de pagos", "numero"), ("monto", "Monto recibido", "pesos")],
        filas, {"pagos": sum(f[2] for f in filas), "monto": sum(f[3] for f in filas)}, [_texto_rango(desde, hasta)], len(filas),
        ("Pagos recibidos por mes", list(por_mes.items())))


CONSTRUCTORES = {"operativo": operativo, "gerencial": gerencial, "periodo": periodo}


# --- Presentación de valores ---
def _celda(valor, tipo):
    """Valor para CSV/PDF como texto legible."""
    if valor is None:
        return ""
    if tipo == "fecha":
        return valor.strftime("%d-%m-%Y")
    if tipo == "mes":
        return valor.strftime("%m-%Y")
    if tipo == "pesos":
        return f"${int(valor):,}".replace(",", ".")
    if tipo == "porcentaje":
        return f"{int(valor)} %"
    if tipo == "numero":
        v = float(valor)
        return f"{int(v):,}".replace(",", ".") if v == int(v) else f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return str(valor)


def _fila_de_totales(r):
    return [("TOTAL" if i == 0 else r.totales.get(clave)) for i, (clave, _t, _tipo) in enumerate(r.columnas)] if r.totales else None


def a_csv(r) -> bytes:
    salida = io.StringIO()
    w = csv.writer(salida, delimiter=";", lineterminator="\r\n")
    w.writerow([r.titulo])
    w.writerow(["; ".join(r.filtros)])
    w.writerow([])
    w.writerow([t for _c, t, _tipo in r.columnas])
    num = lambda v, tipo: "" if v is None else (int(v) if tipo in ("pesos", "porcentaje") else (v.strftime("%d-%m-%Y") if tipo == "fecha" else (v.strftime("%m-%Y") if tipo == "mes" else str(v))))
    for fila in r.filas:
        w.writerow([num(v, c[2]) for v, c in zip(fila, r.columnas)])
    tot = _fila_de_totales(r)
    if tot:
        w.writerow([v if v is None or isinstance(v, str) else int(v) for v in tot])
    return ("﻿" + salida.getvalue()).encode("utf-8")


def a_xlsx(r) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    libro = Workbook()
    hoja = libro.active
    hoja.title = r.titulo.split(":")[0][:31]
    hoja.append([r.titulo])
    hoja["A1"].font = Font(bold=True, size=14)
    hoja.append([f"Emitido el {timezone.localtime():%d-%m-%Y %H:%M}. " + "; ".join(r.filtros)])
    hoja.append([])
    hoja.append([t for _c, t, _tipo in r.columnas])
    for celda in hoja[4]:
        celda.font, celda.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1E3A8A")
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    formatos = {"pesos": '"$"#,##0', "fecha": "DD-MM-YYYY", "mes": "MM-YYYY", "porcentaje": '0" %"', "numero": "#,##0.##"}
    for fila in r.filas:
        hoja.append([float(v) if hasattr(v, "as_tuple") else v for v in fila])
    for fila in hoja.iter_rows(min_row=5, max_row=4 + len(r.filas)):
        for celda, (_c, _t, tipo) in zip(fila, r.columnas):
            if tipo in formatos:
                celda.number_format = formatos[tipo]
    tot = _fila_de_totales(r)
    if tot and r.filas:
        hoja.append([])
        ultima = 4 + len(r.filas)
        fila_total = ultima + 2
        for i, (clave, _t, tipo) in enumerate(r.columnas):
            celda = hoja.cell(row=fila_total, column=i + 1)
            if i == 0:
                celda.value = "TOTAL"
            elif clave in r.totales:
                letra = get_column_letter(i + 1)
                celda.value = f"=SUM({letra}5:{letra}{ultima})"      # fórmula: el total sigue al dato si se edita la planilla
                celda.number_format = formatos.get(tipo, "General")
            celda.font = Font(bold=True)
    for i, (_c, titulo, tipo) in enumerate(r.columnas, start=1):
        ancho = max([len(titulo)] + [len(_celda(f[i - 1], tipo)) for f in r.filas[:200]]) + 3
        hoja.column_dimensions[get_column_letter(i)].width = min(ancho, 45)
    hoja.freeze_panes = "A5"
    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()


def a_pdf(r) -> bytes:
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    estilos = getSampleStyleSheet()
    salida = io.BytesIO()
    emitido = timezone.localtime()

    def pie(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawString(1.5 * cm, 1 * cm, f"DenaServ · {r.titulo} · emitido el {emitido:%d-%m-%Y %H:%M}")
        canvas.drawRightString(landscape(A4)[0] - 1.5 * cm, 1 * cm, f"Página {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(salida, pagesize=landscape(A4), leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.8 * cm,
                            title=r.titulo, author="DenaServ")
    partes = [Paragraph(r.titulo, estilos["Title"]),
              Paragraph(f"Emitido el {emitido:%d-%m-%Y %H:%M}. " + " · ".join(r.filtros), estilos["Normal"]), Spacer(1, 0.4 * cm)]
    datos = [[t for _c, t, _tipo in r.columnas]] + [[_celda(v, c[2]) for v, c in zip(f, r.columnas)] for f in r.filas]
    tot = _fila_de_totales(r)
    if tot:
        datos.append([("TOTAL" if i == 0 else (_celda(v, r.columnas[i][2]) if v is not None else "")) for i, v in enumerate(tot)])
    tabla = Table(datos, repeatRows=1)
    estilo = [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
              ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
              ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")])]
    for i, (_c, _t, tipo) in enumerate(r.columnas):
        if tipo in ("pesos", "numero", "porcentaje"):
            estilo.append(("ALIGN", (i, 0), (i, -1), "RIGHT"))
    if tot:
        estilo += [("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#DBEAFE"))]
    tabla.setStyle(TableStyle(estilo))
    partes.append(tabla)
    if r.grafico and r.grafico[1]:
        titulo, puntos = r.grafico
        partes += [Spacer(1, 0.6 * cm), Paragraph(titulo + " (CLP)", estilos["Heading3"])]
        d = Drawing(600, 200)
        g = VerticalBarChart()
        g.x, g.y, g.width, g.height = 50, 30, 520, 150
        g.data = [[float(v) for _e, v in puntos]]
        g.categoryAxis.categoryNames = [e for e, _v in puntos]
        g.categoryAxis.labels.fontSize = 7
        g.valueAxis.labels.fontSize = 7
        g.bars[0].fillColor = colors.HexColor("#1E40AF")
        d.add(g)
        partes.append(d)
    doc.build(partes, onFirstPage=pie, onLaterPages=pie)
    return salida.getvalue()


EXPORTADORES = {"csv": (a_csv, "text/csv; charset=utf-8", "csv"),
                "xlsx": (a_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
                "pdf": (a_pdf, "application/pdf", "pdf")}
