"""Motor de cálculo DenaServ (fórmulas del informe, sección 2.8). Todo en Decimal."""
import math
from decimal import Decimal as D, ROUND_HALF_UP

K_COMPACTACION = D("1.20")
IVA = D("0.19")
# shortcut: parámetros de negocio fijos por defecto, mover a tabla de configuración cuando el jefe los quiera editar.
DEFAULTS = {
    "flete_base": D("45000"),
    "tarifa_combustible_km": D("900"),
    "f_peso": D("350"),            # CLP por m² de casa
    "viatico_dia": D("25000"),
    "dias_estimados": None,        # None -> se estima desde los m²
    "margen": D("1.30"),
    "mano_obra_m2": D("28000"),    # CLP por m² (valor que usaba el cotizador previo)
    "m2_por_dia": D("4"),          # avance de la cuadrilla, para estimar días
    "tabique_factor_muros": D("1.5"),  # muros totales = perímetro x factor
}


def _clp(x: D) -> D:
    return x.quantize(D("1"), rounding=ROUND_HALF_UP)


def costo_neto(precio_lista: D, descuento_pct: D) -> D:
    return D(str(precio_lista)) * (1 - D(str(descuento_pct)) / 100)


def volumen_estabilizado(m2: D, espesor_cm: D) -> D:
    return m2 * (espesor_cm / 100) * K_COMPACTACION


def costo_flete(m2, km, p) -> D:
    dias = p["dias_estimados"] or D(max(1, math.ceil(m2 / p["m2_por_dia"])))
    return (p["flete_base"] + 2 * km * p["tarifa_combustible_km"]
            + m2 * p["f_peso"] + p["viatico_dia"] * dias)


def tabiqueria(m2: D, separacion_cm: int = 40, p=DEFAULTS) -> dict:
    """Piezas estimadas. Supuesto: casa cuadrada (valores en DEFAULTS)."""
    if separacion_cm not in (40, 60):
        raise ValueError("separacion_cm debe ser 40 o 60")
    largo_ml = D(4 * math.sqrt(float(m2))) * p["tabique_factor_muros"]
    pies = math.ceil(float(largo_ml) / (separacion_cm / 100)) + 1
    return {"pies_derechos_2x3": pies, "soleras_2x3_ml": _clp(largo_ml * 2), "cerchas_1x4_ml": _clp(m2 * D("2.5"))}


def precio_venta(costos_directos: D, margen: D) -> dict:
    neto = costos_directos * margen
    iva = neto * IVA
    return {"neto": _clp(neto), "iva": _clp(iva), "total": _clp(neto + iva)}


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


def calcular(m2, km, espesor_cm, precio_base_m2, precio_revest_m2, precio_estabilizado_m3,
             arido_empresa=True, descuento_pct=0, separacion_cm=40, insumos=(), **over) -> dict:
    p = {**DEFAULTS, **{k: D(str(v)) for k, v in over.items() if v is not None}}
    m2, km, espesor_cm = D(str(m2)), D(str(km)), D(str(espesor_cm))
    desc = D(str(descuento_pct))
    materiales = m2 * (costo_neto(D(str(precio_base_m2)), desc) + costo_neto(D(str(precio_revest_m2)), desc))
    vol = volumen_estabilizado(m2, espesor_cm)
    nivelacion = vol * costo_neto(D(str(precio_estabilizado_m3)), desc) if arido_empresa else D(0)
    flete = costo_flete(m2, km, p)
    mano_obra = m2 * p["mano_obra_m2"]
    bom = bom_insumos(m2, insumos)
    costo_insumos = sum((i["subtotal"] for i in bom), D(0))
    directos = materiales + nivelacion + flete + mano_obra + costo_insumos
    pv = precio_venta(directos, p["margen"])
    return {
        "volumen_estabilizado_m3": vol.quantize(D("0.01")),
        "costo_materiales": _clp(materiales), "costo_nivelacion": _clp(nivelacion), "costo_flete": _clp(flete), "costo_mano_obra": _clp(mano_obra),
        "costo_insumos": _clp(costo_insumos), "insumos": bom,
        "costos_directos": _clp(directos), **pv,
        "tabiqueria": tabiqueria(m2, separacion_cm, p),
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }
