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


def _solo_radier(m2: D, p) -> dict:
    """Radier estándar vendido por separado: tarifa única por m² (material y mano de obra, IVA incluido)."""
    total = m2 * p["radier_m2"]
    pv = precio_venta(total)
    return {
        "tipo_proyecto": "SOLO_RADIER", "volumen_estabilizado_m3": D(0), "costo_materiales": pv["total"],
        "costo_materiales_total": pv["total"], "materiales_referencia": False, "costo_nivelacion": D(0), "costo_flete": D(0),
        "costo_mano_obra": D(0), "costo_insumos": D(0), "costo_vigas_vista": D(0), "ganancia": D(0), "insumos": [],
        "costos_directos": pv["total"], **pv, "tabiqueria": {},
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }


def calcular(m2, km, espesor_cm, precio_base_m2, precio_revest_m2, precio_estabilizado_m3,
             arido_empresa=True, descuento_pct=0, separacion_cm=40, insumos=(), m2_vigas_vista=0, tipo_proyecto="CASA", **over) -> dict:
    p = {**DEFAULTS, **{k: D(str(v)) for k, v in over.items() if v is not None}}
    m2, km, espesor_cm = D(str(m2)), D(str(km)), D(str(espesor_cm))
    if tipo_proyecto == "SOLO_RADIER":
        return _solo_radier(m2, p)
    if tipo_proyecto != "CASA":
        raise ValueError("tipo_proyecto debe ser CASA o SOLO_RADIER")
    desc = D(str(descuento_pct))
    materiales = m2 * (costo_neto(D(str(precio_base_m2)), desc) + costo_neto(D(str(precio_revest_m2)), desc))
    vol = volumen_estabilizado(m2, espesor_cm)
    nivelacion = vol * costo_neto(D(str(precio_estabilizado_m3)), desc) if arido_empresa else D(0)
    flete = costo_flete(m2, km, p)
    mano_obra = m2 * p["mano_obra_m2"]
    bom = bom_insumos(m2, insumos)
    costo_insumos = sum((i["subtotal"] for i in bom), D(0))
    vigas = D(str(m2_vigas_vista)) * p["viga_vista_m2"]
    calculado = materiales + nivelacion + costo_insumos
    materiales_total = max(calculado, m2 * p["materiales_ref_m2"])
    directos = materiales_total + flete + mano_obra + vigas
    ganancia = m2 * p["ganancia_m2"]
    pv = precio_venta(directos + ganancia)
    return {
        "volumen_estabilizado_m3": vol.quantize(D("0.01")),
        "costo_materiales": _clp(materiales), "costo_nivelacion": _clp(nivelacion), "costo_flete": _clp(flete), "costo_mano_obra": _clp(mano_obra),
        "costo_materiales_total": _clp(materiales_total), "materiales_referencia": materiales_total > calculado,
        "costo_insumos": _clp(costo_insumos), "costo_vigas_vista": _clp(vigas), "ganancia": _clp(ganancia), "insumos": bom,
        "costos_directos": _clp(directos), **pv,
        "tabiqueria": tabiqueria(m2, separacion_cm, p),
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }
