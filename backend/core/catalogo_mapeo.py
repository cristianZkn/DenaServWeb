"""Mapeo 1 a 1 producto <-> ficha de la tienda, con las cuatro categorías obligatorias cubiertas.

Se ejecuta a mano (`python manage.py mapear_catalogo`) y es idempotente: no es una migración para que no
siembre datos en bases de prueba nuevas.

- Desactiva los precios de relleno (bases y revestimientos cargados a mano, sin fuente).
- Desactiva el duplicado del OSB SmartSide (estaba como insumo y como revestimiento con la misma ficha).
- Reclasifica los productos ya mapeados en Techumbre / Tabiquería / Base-Radier y marca como verificados los que la
  ficha confirma; deja SIN verificar (e inactivos) los que no coinciden con lo que se necesita.
- Agrega los productos críticos que faltaban (saco de cemento y malla Acma).
"""
S, E, M = "https://www.sodimac.cl/sodimac-cl/product/", "https://www.easy.cl/", "https://mct.cl/ficha/"

# (categoria, url, nombre si hay que crearlo, etapa, verificado)
MAPEO = [
    ("TECHUMBRE", S + "155799/", "Plancha zinc 5V 0.35 mm 89.5x200 cm", "ETAPA_1", True),
    ("REVESTIMIENTO", M + "25972/osb-smartside-panel-r8-111mm-122-x-244", "Smart Panel OSB SmartSide R8 11.1 mm", "", True),
    ("REVESTIMIENTO", M + "40073/osb-smartside-lap-siding-95-mm-200x4880", "OSB SmartSide Lap Siding 9.5 mm", "", True),
    ("REVESTIMIENTO", S + "2491052/", "Siding fibrocemento Volcanboard 6 mm", "", True),
    ("REVESTIMIENTO", E + "plancha-siding-metal-16x38x380-cm-alerce-1432669/p", "Plancha siding metal alerce", "", True),
    ("TABIQUERIA", E + "pino-impregnado-micronizado-2x3-32-m-1155430/p", "Pino impregnado 2x3 3,2 m", "ETAPA_1", True),
    ("TABIQUERIA", E + "pino-impregnado-micronizado-2x4-32-m-1155431/p", "Pino impregnado 2x4 3,2 m", "ETAPA_1", True),
    ("TABIQUERIA", E + "pino-seco-cepillado-premium-1x4-32-m-192589/p", "Pino seco cepillado 1x4 3,2 m", "ETAPA_1", True),
    ("BASE_RADIER", S + "3267326/", "Cemento especial 25 kg Melón (saco)", "ETAPA_1", True),
    ("BASE_RADIER", E + "malla-c-92-electrosoldada-26x50m-acma-118804/p", "Malla Acma C-92 electrosoldada 2,6x5,0 m", "ETAPA_1", True),
    ("BASE_RADIER", E + "rollo-polietileno-10x1-m-20-m2-naranjo-estandard-640712/p", "Rollo polietileno 10x1 m naranjo", "ETAPA_1", False),
    ("INSUMO", S + "296449/", "Clavo corriente 4\" bolsa 500 g", "ETAPA_1", True),
    ("INSUMO", M + "25072/terciado-estructural-cd-09mm-122x244mt", "Terciado estructural CD 9 mm", "ETAPA_1", True),
    ("INSUMO", E + "membrana-hidrofuga-3125-m2-pt-memhidro31-becton-1200486/p", "Membrana hidrófuga 31,25 m2", "ETAPA_1", True),
    ("INSUMO", S + "744972/", "Lana de vidrio R131 50 mm", "ETAPA_2", True),
    ("INSUMO", E + "poliestireno-expandido-50-x-1000-x-2000-mm-blanco-aislapol-118461/p", "Poliestireno expandido 50 mm", "ETAPA_2", True),
    ("INSUMO", S + "727083/", "Guardapolvo pino 12 mm", "ETAPA_2", True),
    ("INSUMO", E + "moldura-cornisa-da22-17x25-mm-2-m-1206933/p", "Moldura cornisa DA22", "ETAPA_2", True),
    ("INSUMO", E + "plancha-yeso-carton-125x1200x2400-mm-rf-br-rojo-volcan-1199559/p", "Plancha yeso cartón RF 12,5 mm", "ETAPA_2", False),
]


def mapear() -> dict:
    from .models import CatalogoTipo as C
    from .precios import proveedor_de
    r = {"desactivados": 0, "reclasificados": 0, "creados": 0}
    # 1) precios de relleno: sin fuente en la tienda no son reales
    r["desactivados"] += C.objects.filter(fuente_url="", categoria__in=["BASE_TERRENO", "REVESTIMIENTO"], activo=True).update(activo=False, verificado=False)
    # 2) ficha repetida como insumo y como revestimiento: queda solo el revestimiento
    for rev in C.objects.filter(categoria="REVESTIMIENTO").exclude(fuente_url=""):
        r["desactivados"] += C.objects.filter(categoria="INSUMO", fuente_url=rev.fuente_url, activo=True).update(activo=False, verificado=False)
    # 3) mapeo 1 a 1
    for cat, url, nombre, etapa, ok in MAPEO:
        fila = (C.objects.filter(fuente_url=url, categoria=cat).first()
                or C.objects.filter(fuente_url=url, categoria="INSUMO", activo=True).first())
        if fila:
            if (fila.categoria, fila.verificado, fila.activo) != (cat, ok, ok):
                fila.categoria, fila.verificado, fila.activo = cat, ok, ok
                fila.save(update_fields=["categoria", "verificado", "activo"])
                r["reclasificados"] += 1
        else:
            C.objects.create(categoria=cat, nombre=nombre, unidad_medida="UN", fuente_url=url, etapa_obra=etapa,
                             proveedor=proveedor_de(url), verificado=ok, activo=ok)
            r["creados"] += 1
    return r
