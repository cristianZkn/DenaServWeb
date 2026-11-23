"""Motor de cálculo DenaServ (fórmulas del informe, sección 2.8 + tarifas reales de la empresa). Todo en Decimal."""
import math
from decimal import Decimal as D, ROUND_HALF_UP

K_COMPACTACION = D("1.20")
IVA = D("0.19")
# Valores de fábrica. Los vigentes son estos más lo que la empresa cambie desde la web (tabla `tarifa`, ver `vigentes()`).
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
    # Cotizaciones por tarifa (modo_tarifas): cada trabajador cobra por m² y el traslado se calcula con combustible.
    "mo_viga_vista_m2": D("8000"),      # por trabajador, por m² con vigas a la vista
    "mo_radier_m2": D("35000"),         # por trabajador, por m² de radier o base (la empresa paga 35.000 o 38.000)
    "precio_litro": D("1650"),          # bencina, CLP por litro
    "km_por_litro": D("10"),            # rendimiento: 1 litro = 10 km
    "dias_fabricacion_radier": D("4"),  # días que toma fabricar el radier o la base
    "flete_camion_dia": D("120000"),    # traslado en camión: CLP por cada día de traslado
}


# Cómo se muestra cada tarifa editable en la web: (clave, grupo, nombre, unidad, descripción)
TARIFAS_META = [
    ("mano_obra_m2", "Casa", "Mano de obra de maestros", "$/m²", "Valor fijo total para el equipo de maestros, por m² de casa."),
    ("ganancia_m2", "Casa", "Ganancia de la empresa", "$/m²", "Margen de la empresa por m² construido."),
    ("viga_vista_m2", "Casa", "Vigas a la vista", "$/m²", "Adicional por cada m² con vigas a la vista."),
    ("materiales_ref_m2", "Casa", "Referencia de materiales", "$/m²", "Solo para cotizaciones antiguas sin lista de materiales."),
    ("tabique_factor_muros", "Casa", "Factor de muros", "veces", "Metros de muro = perímetro × este factor (estima la tabiquería)."),
    ("radier_m2", "Radier", "Radier solo (todo incluido)", "$/m²", "Material y mano de obra; entre $35.000 y $40.000 por m²."),
    ("estabilizado_m3", "Radier", "Estabilizado puesto en obra", "$/m³", "Relleno de estabilizado (polvo de roca) con IVA incluido."),
    ("mo_radier_m2", "Cotizaciones por trabajador", "Mano de obra del radier", "$/m²", "Por trabajador; la empresa paga $35.000 o $38.000."),
    ("mo_viga_vista_m2", "Cotizaciones por trabajador", "Vigas a la vista", "$/m²", "Por trabajador y por m² con vigas a la vista."),
    ("km_por_litro", "Cotizaciones por trabajador", "Rendimiento del vehículo", "km/L", "Kilómetros que rinde un litro de bencina."),
    ("dias_fabricacion_radier", "Cotizaciones por trabajador", "Días de fabricación del radier", "días", "Se suman a los días de traslado."),
    ("flete_camion_dia", "Flete", "Flete camión", "$/día", "Costo del camión por cada día de traslado (se multiplica por la cantidad de días)."),
]


# Tarifas que una cotización puede cambiar solo para sí misma (el resto del cálculo no se toca): clave -> (mínimo, máximo, entero).
# La ganancia por m² ya tiene su propio campo en la cotización; el valor del radier se elige en el formulario.
TARIFAS_POR_COTIZACION = {
    "mano_obra_m2": (0, 10_000_000, False),         # por trabajador y por m² de casa
    "mo_viga_vista_m2": (0, 10_000_000, False),     # por trabajador y por m² con vigas a la vista
    "km_por_litro": (0.1, 100, False),              # rendimiento del vehículo (no puede ser 0: se divide por él)
    "dias_fabricacion_radier": (0, 365, True),      # días que se suman a los maestros si hay que fabricar el radier o la base
}


def validar_tarifas_personalizadas(tarifas) -> dict:
    """Solo claves conocidas y valores dentro de su rango; devuelve {clave: float}. Lanza ValueError con un mensaje claro."""
    limpio = {}
    for clave, valor in (tarifas or {}).items():
        if clave not in TARIFAS_POR_COTIZACION:
            raise ValueError(f"La tarifa «{clave}» no se puede cambiar en una cotización.")
        minimo, maximo, entero = TARIFAS_POR_COTIZACION[clave]
        nombre = next((n for k, _, n, _, _ in TARIFAS_META if k == clave), clave)
        if not minimo <= valor <= maximo or (entero and valor != int(valor)):
            raise ValueError(f"«{nombre}» debe ser {'un número entero' if entero else 'un valor'} entre {minimo:g} y {maximo:,.0f}.".replace(",", "."))
        limpio[clave] = float(valor)
    return limpio


def vigentes() -> dict:
    """Tarifas en uso: valores de fábrica con los cambios hechos desde la web (tabla `tarifa`)."""
    from .models import Tarifa  # import tardío: este módulo no depende de Django
    return {**DEFAULTS, **{k: v for k, v in Tarifa.objects.values_list("clave", "valor")}}


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


def tabiqueria(m2: D, separacion_cm: int = 40, p=None) -> dict:
    """Piezas estimadas. Supuesto: casa cuadrada (valores en DEFAULTS)."""
    p = p or vigentes()
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
    """Materiales de la lista de la cotización: {id, nombre, unidad, cantidad, precio_neto} -> se agrega el subtotal."""
    return [{**a, "cantidad": D(str(a["cantidad"])), "subtotal": _clp(D(str(a["cantidad"])) * D(str(a["precio_neto"])))}
            for a in adicionales]


def lineas_mano_obra(maestros) -> list:
    """Mano de obra de la lista: {cantidad, cobro} -> se agrega el subtotal (cantidad x cobro).
    `cobro` es lo que recibe cada trabajador por toda la obra; si no todos cobran lo mismo se ingresan varias líneas."""
    return [{**m, "cantidad": D(str(m["cantidad"])), "cobro": D(str(m["cobro"])),
             "subtotal": _clp(D(str(m["cantidad"])) * D(str(m["cobro"])))} for m in maestros]


def traslado_combustible(km, dias, precio_litro, km_por_litro) -> dict:
    """Traslado por combustible. `km` es el recorrido total de cada día (ida y vuelta): litros = km / 10 x días.
    Ej.: 50 km, 25 días, $1.650 el litro -> 5 L por día x 25 = 125 L -> $206.250."""
    km, dias = D(str(km)), D(str(dias))
    litros_dia = km / km_por_litro
    litros = litros_dia * dias
    return {"km": km, "dias": int(dias), "litros_por_dia": litros_dia.quantize(D("0.01")),
            "litros": litros.quantize(D("0.01")), "precio_litro": precio_litro, "costo": _clp(litros * precio_litro)}


TIPOS_TRASLADO = {"MAESTROS": "Traslado de maestros", "MATERIALES": "Traslado de materiales", "FLETE": "Flete",
                  "CAMION": "Traslado flete"}
TRASLADO_CAMION = "CAMION"  # no usa combustible: cuesta una tarifa fija por día (`flete_camion_dia`)


def traslados_combustible(km, traslados, km_por_litro, dias_extra_maestros=0) -> dict:
    """Traslados (maestros, materiales, flete y camión) con la misma distancia, pero cada uno con su combustible y sus días.
    El traslado en camión no usa combustible: cuesta `precio_litro` (la tarifa diaria del camión que regía al cotizar) por día.
    `km` es el recorrido total de un día (ida y vuelta): litros por día = km / 10 y costo = litros x precio x días.
    Ej.: 30 km a $1.000 el litro -> 3 L = $3.000 por día; flete 2 días = $6.000.
    Si hay que fabricar el radier o la base (el terreno no la tiene), los maestros suman `dias_extra_maestros` (4) días."""
    km = D(str(km))
    lineas = []
    for t in traslados:
        extra = int(dias_extra_maestros) if t["tipo"] == "MAESTROS" else 0
        dias, precio = D(int(t["dias"]) + extra), D(str(t["precio_litro"]))
        if t["tipo"] == TRASLADO_CAMION:  # tarifa fija por día, sin litros
            lineas.append({"tipo": t["tipo"], "nombre": TIPOS_TRASLADO[t["tipo"]], "combustible": "", "dias": int(t["dias"]),
                           "dias_extra": 0, "dias_total": int(dias), "precio_litro": precio, "litros_por_dia": D(0),
                           "costo_por_dia": _clp(precio), "litros": D(0), "costo": _clp(precio * dias)})
            continue
        litros_dia = km / km_por_litro
        lineas.append({"tipo": t["tipo"], "nombre": TIPOS_TRASLADO[t["tipo"]], "combustible": t["combustible"], "dias": int(t["dias"]),
                       "dias_extra": extra, "dias_total": int(dias), "precio_litro": precio, "litros_por_dia": litros_dia.quantize(D("0.01")),
                       "costo_por_dia": _clp(litros_dia * precio), "litros": (litros_dia * dias).quantize(D("0.01")),
                       "costo": _clp(litros_dia * dias * precio)})
    return {"km": km, "lineas": lineas, "costo": sum((l["costo"] for l in lineas), D(0))}


def lineas_mano_obra_tarifas(m2, n_trabajadores, vigas_m2, tipo_proyecto, adicionales, lleva_radier, tarifa_radier, p) -> list:
    """Mano de obra por tarifa. Cada trabajador cobra: casa $25.000/m², vigas a la vista $8.000/m², radier o base
    $35.000-$38.000/m² y, por cada material que lo indique (p. ej. OSB Smartside Lap), $2.000 por m² instalado.
    subtotal = m² x tarifa x cantidad de trabajadores."""
    n = D(int(n_trabajadores))
    lineas = []

    def agregar(concepto, m2_, tarifa):
        m2_, tarifa = D(str(m2_)), D(str(tarifa))
        lineas.append({"concepto": concepto, "m2": m2_, "tarifa": tarifa, "trabajadores": int(n), "subtotal": _clp(m2_ * tarifa * n)})

    if tipo_proyecto == "CASA":
        agregar("Casa", m2, p["mano_obra_m2"])
        if D(str(vigas_m2)) > 0:
            agregar("Vigas a la vista", vigas_m2, p["mo_viga_vista_m2"])
    for a in adicionales:  # la cantidad de estos materiales se ingresa en m²
        tarifa = D(str(a.get("mano_obra_m2") or 0))
        if tarifa > 0:
            agregar(f"Instalación de {a['nombre']}", a["cantidad"], tarifa)
    if lleva_radier:
        agregar("Radier / base", m2, tarifa_radier)
    return lineas


def _por_tarifas(m2: D, km: D, p, adicionales, vigas_m2, tipo_proyecto, separacion_cm, n_trabajadores, dias_obra,
                 lleva_radier, tarifa_radier, traslados=()) -> dict:
    """Cotización por tarifas (modo vigente).

    Valor = materiales de la lista + mano de obra por tarifa + traslado por combustible + ganancia por m².
    Los montos se tratan como IVA incluido y el IVA se desglosa. Un radier suma 4 días de fabricación."""
    lleva_radier = lleva_radier or tipo_proyecto == "SOLO_RADIER"
    mat = lineas_adicionales(adicionales)
    materiales = sum((l["subtotal"] for l in mat), D(0))
    mo = lineas_mano_obra_tarifas(m2, n_trabajadores, vigas_m2, tipo_proyecto, mat, lleva_radier, tarifa_radier, p)
    mano_obra = sum((l["subtotal"] for l in mo), D(0))
    if traslados:  # modo vigente: tres traslados, cada uno con su combustible y sus días
        traslado = traslados_combustible(km, traslados, p["km_por_litro"], int(p["dias_fabricacion_radier"]) if lleva_radier else 0)
        dias_total = max((l["dias_total"] for l in traslado["lineas"]), default=0)
    else:  # cotizaciones antiguas: un solo traslado con la bencina y los días de la obra (+ días de fabricación del radier)
        dias_total = int(dias_obra) + (int(p["dias_fabricacion_radier"]) if lleva_radier else 0)
        traslado = traslado_combustible(km, dias_total, p["precio_litro"], p["km_por_litro"])
    ganancia = m2 * p["ganancia_m2"]
    directos = materiales + mano_obra + traslado["costo"]
    pv = precio_venta(directos + ganancia)
    return {
        "modo": "TARIFAS", "tipo_proyecto": tipo_proyecto,
        "costo_materiales": _clp(materiales), "sobre_economico": D(0), "costo_materiales_total": _clp(materiales),
        "costo_flete": traslado["costo"], "costo_mano_obra": _clp(mano_obra), "costo_insumos": D(0),
        "costo_vigas_vista": D(0), "ganancia": _clp(ganancia), "insumos": [],
        "adicionales": mat, "costo_adicionales": _clp(materiales), "mano_obra_lineas": [], "mano_obra_detalle": mo,
        "traslado": traslado, "dias_total": dias_total, "lleva_radier": lleva_radier,
        "costos_directos": _clp(directos), **pv,
        "tabiqueria": tabiqueria(m2, separacion_cm, p) if tipo_proyecto == "CASA" else {},
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }


def _por_lista(m2: D, km: D, p, adicionales, maestros, vigas_m2, tipo_proyecto, separacion_cm) -> dict:
    """Cotización por lista (modo vigente).

    Valor = materiales de la lista + mano de obra + traslado por distancia + vigas a la vista + ganancia por m².
    No se estima nada con tarifas de referencia. Los montos se tratan como IVA incluido y el IVA se desglosa."""
    mat = lineas_adicionales(adicionales)
    mo = lineas_mano_obra(maestros)
    materiales = sum((l["subtotal"] for l in mat), D(0))
    mano_obra = sum((l["subtotal"] for l in mo), D(0))
    flete = costo_flete(m2, km, p)
    vigas = D(str(vigas_m2)) * p["viga_vista_m2"] if tipo_proyecto == "CASA" else D(0)
    ganancia = m2 * p["ganancia_m2"]
    directos = materiales + mano_obra + flete + vigas
    pv = precio_venta(directos + ganancia)
    return {
        "modo": "LISTA", "tipo_proyecto": tipo_proyecto,
        "costo_materiales": _clp(materiales), "sobre_economico": D(0), "costo_materiales_total": _clp(materiales),
        "costo_flete": _clp(flete), "costo_mano_obra": _clp(mano_obra), "costo_insumos": D(0),
        "costo_vigas_vista": _clp(vigas), "ganancia": _clp(ganancia), "insumos": [],
        "adicionales": mat, "costo_adicionales": _clp(materiales), "mano_obra_lineas": mo,
        "costos_directos": _clp(directos), **pv,
        "tabiqueria": tabiqueria(m2, separacion_cm, p) if tipo_proyecto == "CASA" else {},
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }


def _solo_radier(m2: D, km: D, p) -> dict:
    """Radier (modo antiguo): tarifa por m² que ya incluye material y mano de obra, más el traslado por tramo."""
    radier = m2 * p["radier_m2"]
    flete = costo_flete(m2, km, p)
    pv = precio_venta(radier + flete)
    return {
        "tipo_proyecto": "SOLO_RADIER", "costo_materiales": _clp(radier), "sobre_economico": D(0),
        "costo_materiales_total": _clp(radier), "costo_flete": _clp(flete),
        "costo_mano_obra": D(0), "costo_insumos": D(0), "costo_vigas_vista": D(0), "ganancia": D(0), "insumos": [],
        "costos_directos": pv["total"], **pv, "tabiqueria": {},
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }


def nivelacion(m2, espesor_cm, arido_empresa=True, p=None) -> dict:
    """Relleno de estabilizado. NO va en la cotización inicial: se cubica en la visita al terreno y el cliente
    lo compra directamente o la empresa lo suma al valor ya informado."""
    p = p or vigentes()
    m3 = volumen_estabilizado(D(str(m2)), D(str(espesor_cm)))
    costo = m3 * p["estabilizado_m3"] if arido_empresa else D(0)
    return {"m3": m3.quantize(D("0.01")), "costo": _clp(costo), "modalidad": "EMPRESA" if arido_empresa else "CLIENTE"}


def calcular(m2, km, precio_base_m2=0, precio_revest_m2=0, base_min_m2=None, revest_min_m2=None,
             separacion_cm=40, insumos=(), m2_vigas_vista=0, tipo_proyecto="CASA", adicionales=(), maestros=(),
             modo_lista=False, modo_tarifas=False, n_trabajadores=0, dias_obra=0, lleva_radier=False,
             tarifa_radier_m2=None, precio_litro=None, traslados=(), **over) -> dict:
    """Punto de entrada del motor de cálculo.

    modo_lista=True: cotización por lista (materiales + maestros), ver `_por_lista`.
    modo_lista=False: modo antiguo por m², solo para reajustar cotizaciones emitidas antes de la lista. Allí los
    materiales = referencia ($135.000/m²) + diferencia de la base y el revestimiento elegidos respecto de los más
    económicos del catálogo, y la lista de insumos (BOM) solo desglosa esos materiales para las compras."""
    p = {**vigentes(), **{k: D(str(v)) for k, v in over.items() if v is not None}}
    m2, km = D(str(m2)), D(str(km))
    if tipo_proyecto not in ("CASA", "SOLO_RADIER"):
        raise ValueError("tipo_proyecto debe ser CASA o SOLO_RADIER")
    if modo_tarifas:
        if precio_litro is not None:
            p["precio_litro"] = D(str(precio_litro))
        tarifa = D(str(tarifa_radier_m2)) if tarifa_radier_m2 is not None else p["mo_radier_m2"]
        return _por_tarifas(m2, km, p, adicionales, m2_vigas_vista, tipo_proyecto, separacion_cm,
                            n_trabajadores, dias_obra, lleva_radier, tarifa, traslados)
    if modo_lista:
        return _por_lista(m2, km, p, adicionales, maestros, m2_vigas_vista, tipo_proyecto, separacion_cm)
    if tipo_proyecto == "SOLO_RADIER":
        return _solo_radier(m2, km, p)
    extra = lambda precio, minimo: max(D(0), D(str(precio)) - D(str(minimo))) if minimo is not None else D(0)
    sobre_economico = m2 * (extra(precio_base_m2, base_min_m2) + extra(precio_revest_m2, revest_min_m2))
    materiales_total = m2 * p["materiales_ref_m2"] + sobre_economico
    flete = costo_flete(m2, km, p)
    mano_obra = m2 * p["mano_obra_m2"]
    bom = bom_insumos(m2, insumos)
    costo_insumos = sum((i["subtotal"] for i in bom), D(0))
    vigas = D(str(m2_vigas_vista)) * p["viga_vista_m2"]
    directos = materiales_total + flete + mano_obra + vigas
    ganancia = m2 * p["ganancia_m2"]
    pv = precio_venta(directos + ganancia)
    return {
        "costo_materiales_total": _clp(materiales_total), "sobre_economico": _clp(sobre_economico),
        "costo_flete": _clp(flete), "costo_mano_obra": _clp(mano_obra),
        "costo_insumos": _clp(costo_insumos), "costo_vigas_vista": _clp(vigas), "ganancia": _clp(ganancia), "insumos": bom,
        "costos_directos": _clp(directos), **pv,
        "tabiqueria": tabiqueria(m2, separacion_cm, p),
        "hitos": [{"fase": f, "porcentaje": pc, "monto": m} for f, pc, m in hitos(pv["total"])],
    }
