"""Indicadores y series del dashboard, calculados desde las vistas SQL con filtros de fecha y estado."""
from .reportes import ESTADOS, METODOS, _consultar, _rango


def _pct(a, b):
    return round(float(a) * 100 / float(b), 1) if b else 0


def analisis(desde=None, hasta=None, estado=None):
    desde, hasta = _rango(desde, hasta)
    donde, p = ["fecha_local BETWEEN %s AND %s"], [desde, hasta]
    if estado:
        donde.append("estado = %s"), p.append(estado)
    where = " AND ".join(donde)
    n, concretadas, venta, neto, ganancia, cobrado, venta_conc = _consultar(
        "SELECT COUNT(*), COUNT(*) FILTER (WHERE estado <> 'BORRADOR'), COALESCE(SUM(costo_total), 0), "
        "COALESCE(SUM(neto) FILTER (WHERE estado <> 'BORRADOR'), 0), COALESCE(SUM(ganancia_neta) FILTER (WHERE estado <> 'BORRADOR'), 0), "
        "COALESCE(SUM(monto_cobrado) FILTER (WHERE estado <> 'BORRADOR'), 0), COALESCE(SUM(costo_total) FILTER (WHERE estado <> 'BORRADOR'), 0) "
        f"FROM vista_cotizacion_resumen WHERE {where}", p)[0]
    indicadores = [
        {"clave": "cotizaciones", "nombre": "Cotizaciones emitidas", "valor": n, "unidad": "n",
         "formula": "Cantidad de cotizaciones creadas en el período.", "pregunta": "¿Cuánta demanda recibimos?"},
        {"clave": "conversion", "nombre": "Tasa de conversión", "valor": _pct(concretadas, n), "unidad": "%",
         "formula": "(Cotizaciones en ejecución + terminadas) ÷ cotizaciones emitidas × 100.", "pregunta": "¿Qué parte de las cotizaciones se concreta en obra?"},
        {"clave": "ticket", "nombre": "Valor promedio por proyecto", "valor": round(float(venta) / n) if n else 0, "unidad": "$",
         "formula": "Suma del total (IVA incl.) de las cotizaciones ÷ cotizaciones emitidas.", "pregunta": "¿De qué tamaño es un proyecto típico?"},
        {"clave": "margen", "nombre": "Margen neto", "valor": _pct(ganancia, neto), "unidad": "%",
         "formula": "Ganancia neta ÷ venta neta de los proyectos concretados × 100 (sin IVA).", "pregunta": "¿Cuánto del precio de venta queda como ganancia?"},
        {"clave": "ganancia", "nombre": "Ganancia neta de proyectos concretados", "valor": int(ganancia), "unidad": "$",
         "formula": "Σ (total − materiales − mano de obra − flete − nivelación) ÷ 1,19, solo proyectos en ejecución y terminados.",
         "pregunta": "¿Cuánto gana la empresa en el período?"},
        {"clave": "cobranza", "nombre": "Cobranza", "valor": _pct(cobrado, venta_conc), "unidad": "%",
         "formula": "Monto cobrado ÷ total de los proyectos concretados × 100.", "pregunta": "¿Cuánto de lo vendido ya se cobró?"},
        {"clave": "por_cobrar", "nombre": "Saldo por cobrar", "valor": int(venta_conc - cobrado), "unidad": "$",
         "formula": "Total de los proyectos concretados − monto cobrado.", "pregunta": "¿Cuánto dinero falta recibir?"},
    ]
    mensual = [{"mes": f"{m:%Y-%m}", "cotizaciones": c, "neto": int(nt), "cobrado": int(cb)} for m, c, nt, cb in _consultar(
        "SELECT date_trunc('month', fecha_local)::date, COUNT(*), SUM(neto), SUM(monto_cobrado) "
        f"FROM vista_cotizacion_resumen WHERE {where} GROUP BY 1 ORDER BY 1", p)]
    por_estado = [{"estado": e, "etiqueta": ESTADOS.get(e, e), "cotizaciones": c, "neto": int(nt)} for e, c, nt in _consultar(
        f"SELECT estado, COUNT(*), SUM(neto) FROM vista_cotizacion_resumen WHERE {where} GROUP BY 1 ORDER BY 1", p)]
    por_metodo = [{"metodo": m, "etiqueta": METODOS.get(m, m), "pagos": int(c), "monto": int(mt)} for m, c, mt in _consultar(
        "SELECT metodo, SUM(pagos), SUM(monto) FROM vista_pagos_mensuales WHERE mes BETWEEN date_trunc('month', %s::date) AND %s::date GROUP BY 1 ORDER BY 3 DESC",
        (desde, hasta))]
    return {"desde": desde, "hasta": hasta, "indicadores": indicadores, "mensual": mensual, "por_estado": por_estado, "por_metodo": por_metodo}
