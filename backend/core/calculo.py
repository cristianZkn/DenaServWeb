"""Motor de cálculo DenaServ (fórmulas del informe, sección 2.8 + tarifas reales de la empresa). Todo en Decimal."""
import math
from decimal import Decimal as D, ROUND_HALF_UP

K_COMPACTACION = D("1.20")
IVA = D("0.19")
# shortcut: parámetros de negocio fijos por defecto, mover a tabla de configuración cuando el jefe los quiera editar.
DEFAULTS = {
    # Tarifas indicadas por la empresa (casa semi terminada económica ≈ $195.000/m²).
    "mano_obra_m2": D("25000"),    # maestros, CLP por m²
    "ganancia_m2": D("30000"),     # ganancia de la empresa, CLP por m²
    "traslado_m2_hasta_35km": D("5000"),   # traslado de maestros y materiales, CLP por m²
    "traslado_m2_hasta_100km": D("10000"),
    "viga_vista_m2": D("65000"),   # adicional por m² con vigas a la vista
    "estabilizado_m3": D("32000"),  # árido puesto en obra, IVA incl. (mercado: $25.000-$38.000/m³ con despacho)
    "radier_m2": D("37500"),       # radier solo (material + mano de obra): $35.000-$40.000/m², punto medio
    "materiales_ref_m2": D("135000"),  # referencia de materiales (~$135.000/m²) mientras el BOM esté incompleto
    "tabique_factor_muros": D("1.5"),  # muros totales = perímetro x factor
}


def _clp(x: D) -> D:
    return x.quantize(D("1"), rounding=ROUND_HALF_UP)


def costo_neto(precio_lista: D, descuento_pct: D) -> D:
    return D(str(precio_lista)) * (1 - D(str(descuento_pct)) / 100)


def volumen_estabilizado(m2: D, espesor_cm: D) -> D:
    return m2 * (espesor_cm / 100) * K_COMPACTACION


def costo_flete(m2, km, p) -> D:
    """Traslado por tramo de distancia; la empresa no realiza proyectos a más de 100 km."""
    if km <= 35:
        return m2 * p["traslado_m2_hasta_35km"]
    if km <= 100:
        return m2 * p["traslado_m2_hasta_100km"]
    raise ValueError("Fuera del radio de servicio: máximo 100 km")


def tabiqueria(m2: D, separacion_cm: int = 40, p=DEFAULTS) -> dict:
    """Piezas estimadas. Supuesto: casa cuadrada (valores en DEFAULTS)."""
    if separacion_cm not in (40, 60):
        raise ValueError("separacion_cm debe ser 40 o 60")
    largo_ml = D(4 * math.sqrt(float(m2))) * p["tabique_factor_muros"]
    pies = math.ceil(float(largo_ml) / (separacion_cm / 100)) + 1
    return {"pies_derechos_2x3": pies, "soleras_2x3_ml": _clp(largo_ml * 2), "cerchas_1x4_ml": _clp(m2 * D("2.5"))}


def precio_venta(total_bruto: D) -> dict:
    """Los precios de la empresa ($195.000/m²) y los del retail ya incluyen IVA: se desglosa, no se suma."""
    total = _clp(total_bruto)
    neto = _clp(total / (1 + IVA))
    return {"neto": neto, "iva": total - neto, "total": total}


def hitos(total: D) -> list:
    a, b = _clp(total * D("0.40")), _clp(total * D("0.30"))
    return [("ANTICIPO_40", D(40), a), ("AVANCE_30", D(30), b), ("ENTREGA_30", D(30), total - a - b)]


def bom_insumos(m2: D, insumos) -> list:
    """Lista de materiales por etapa. insumos: dicts {id, nombre, unidad, etapa, rendimiento, precio_neto}."""
    out = []
    for i in insumos:
        cant = (m2 * D(str(i["rendimiento"]))).quantize(D("0.01"), rounding=ROUND_HALF_UP)
        out.append({**i, "cantidad": cant, "subtotal": _clp(cant * D(str(i["precio_neto"])))})
    return out


def lineas_adicionales(adicionales) -> list:
    """Materiales que el usuario agrega a mano a la cotización: {id, nombre, unidad, cantidad, precio_neto} -> con subtotal."""
    return [{**a, "cantidad": D(str(a["cantidad"])), "subtotal": _clp(D(str(a["cantidad"])) * D(str(a["precio_neto"])))}
            for a in adicionales]


def _solo_radier(m2: D, km: D, p, adicionales=()) -> dict:
    """Radier estándar: tarifa por m² que ya incluye material y mano de obra, más el traslado por tramo. IVA incluido."""
    radier = m2 * p["radier_m2"]
    flete = costo_flete(m2, km, p)
    lineas = lineas_adicionales(adicionales)
    extra = sum((l["subtotal"] for l in lineas), D(0))
    pv = precio_venta(radier + flete + extra)
    return {
        "tipo_proyecto": "SOLO_RADIER", "costo_materiales": _clp(radier), "sobre_economico": D(0),
        "costo_materiales_total": _clp(radier), "costo_flete": _clp(flete),
        "costo_mano_obra": D(0), "costo_insumos": D(0), "costo_vigas_vista": D(0), "ganancia": D(0), "insumos": [],
        "adicionales": lineas, "costo_adicionales": _clp(extra),
        "costos_directos": pv["total"], **pv, "tabiqueria": {},
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }


def nivelacion(m2, espesor_cm, arido_empresa=True, p=DEFAULTS) -> dict:
    """Relleno de estabilizado. NO va en la cotización inicial: se cubica en la visita al terreno y el cliente
    lo compra directamente o la empresa lo suma al valor ya informado."""
    m3 = volumen_estabilizado(D(str(m2)), D(str(espesor_cm)))
    costo = m3 * p["estabilizado_m3"] if arido_empresa else D(0)
    return {"m3": m3.quantize(D("0.01")), "costo": _clp(costo), "modalidad": "EMPRESA" if arido_empresa else "CLIENTE"}


def calcular(m2, km, precio_base_m2=0, precio_revest_m2=0, base_min_m2=None, revest_min_m2=None,
             separacion_cm=40, insumos=(), m2_vigas_vista=0, tipo_proyecto="CASA", adicionales=(), **over) -> dict:
    """Cotización inicial por m² (modo de trabajo de la empresa).

    Materiales = referencia ($135.000/m², casa económica) + diferencia de la base y el revestimiento elegidos respecto de los
    más económicos del catálogo. La lista de insumos (BOM) no se suma: desglosa esos materiales para las compras."""
    p = {**DEFAULTS, **{k: D(str(v)) for k, v in over.items() if v is not None}}
    m2, km = D(str(m2)), D(str(km))
    if tipo_proyecto == "SOLO_RADIER":
        return _solo_radier(m2, km, p, adicionales)
    if tipo_proyecto != "CASA":
        raise ValueError("tipo_proyecto debe ser CASA o SOLO_RADIER")
    extra = lambda precio, minimo: max(D(0), D(str(precio)) - D(str(minimo))) if minimo is not None else D(0)
    sobre_economico = m2 * (extra(precio_base_m2, base_min_m2) + extra(precio_revest_m2, revest_min_m2))
    materiales_total = m2 * p["materiales_ref_m2"] + sobre_economico
    flete = costo_flete(m2, km, p)
    mano_obra = m2 * p["mano_obra_m2"]
    bom = bom_insumos(m2, insumos)
    costo_insumos = sum((i["subtotal"] for i in bom), D(0))
    vigas = D(str(m2_vigas_vista)) * p["viga_vista_m2"]
    lineas = lineas_adicionales(adicionales)
    costo_adicionales = sum((l["subtotal"] for l in lineas), D(0))
    directos = materiales_total + flete + mano_obra + vigas + costo_adicionales
    ganancia = m2 * p["ganancia_m2"]
    pv = precio_venta(directos + ganancia)
    return {
        "costo_materiales_total": _clp(materiales_total), "sobre_economico": _clp(sobre_economico),
        "costo_flete": _clp(flete), "costo_mano_obra": _clp(mano_obra),
        "costo_insumos": _clp(costo_insumos), "costo_vigas_vista": _clp(vigas), "ganancia": _clp(ganancia), "insumos": bom,
        "adicionales": lineas, "costo_adicionales": _clp(costo_adicionales),
        "costos_directos": _clp(directos), **pv,
        "tabiqueria": tabiqueria(m2, separacion_cm, p),
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }
