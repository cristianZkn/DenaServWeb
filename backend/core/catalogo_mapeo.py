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
A = "https://www.sodimac.cl/sodimac-cl/articulo/"  # fichas nuevas de Sodimac: /articulo/<id>/<nombre>/<sku>

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


# Materiales del listado de presupuesto de referencia (casa de 60 m²), uno por ficha de tienda: el precio se lee de la ficha
# y la cantidad se indica al cotizar. Los de «radier adicional» son los mismos de «radier de la casa», y los servicios y
# traslados no tienen ficha (se calculan en el paso de traslado del cotizador). Sin ficha encontrada: cubre zinc, ventana a
# piso 1500x2000, ventana estándar 1200x800 y tornillo de 3".
MAPEO_PRESUPUESTO = [
    # Radier de la casa
    ("RADIER_CASA", A + "110277134/hormigon-preparado-para-radieres-sobrelosas-pilares-25-kg/110277137", "Hormigón preparado H20 25 kg (radieres)", "ETAPA_1", True),
    ("RADIER_CASA", A + "111330867/fierro-a-63-8x8-mm-6-m/111330872", "Fierro A-63 8 mm 6 m (cadenas)", "ETAPA_1", True),
    ("RADIER_CASA", E + "malla-c-92-electrosoldada-26x50m-acma-118804/p", "Malla Acma C-92 electrosoldada 2,6x5,0 m", "ETAPA_1", True),
    ("RADIER_CASA", E + "rollo-polietileno-10x1-m-20-m2-naranjo-estandard-640712/p", "Rollo polietileno 10x1 m naranjo", "ETAPA_1", False),  # igual que en MAPEO: sin verificar
    ("RADIER_CASA", A + "133385866/tubo-alc-gris-pvc-agua-110-mmx300-cm/133385868", "Tubo sanitario PVC 110 mm x 3 m", "ETAPA_1", True),
    ("RADIER_CASA", A + "133385873/tubo-alc-gris-pvc-agua-50-mmx300-cm/133385874", "Tubo sanitario PVC 50 mm x 3 m", "ETAPA_1", True),
    ("RADIER_CASA", E + "codo-pvc-sanitario-110mm-90-grados-gris-petroflex-mkq8dmu1ne/p", "Codo PVC sanitario 110 mm", "ETAPA_1", True),
    ("RADIER_CASA", A + "147087000/CODO-PVC-SANITARIO-GRIS-C-C-50MM-87.5-GRADOS/147087001", "Codo PVC sanitario 50 mm", "ETAPA_1", True),
    ("RADIER_CASA", A + "110298445/adhesivo-tradicional-para-pvc-240cc/110298451", "Adhesivo para PVC 240 cc", "ETAPA_1", True),
    ("RADIER_CASA", E + "pino-seco-cepillado-premium-1x4-32-m-192589/p", "Pino seco cepillado 1x4 3,2 m (tableros)", "ETAPA_1", True),
    ("RADIER_CASA", M + "11212/tornillo-volchgrueso-pfina-crs-8x2-12-zn-100u", "Tornillo volcanita 8x2 1/2 caja 100 u", "ETAPA_1", True),
    # Fabricación de tabiques
    ("TABIQUES", E + "pino-impregnado-micronizado-2x4-32-m-1155431/p", "Pino impregnado 2x4 3,2 m", "ETAPA_1", True),
    ("TABIQUES", E + "pino-impregnado-micronizado-2x3-32-m-1155430/p", "Pino impregnado 2x3 3,2 m", "ETAPA_1", True),
    ("TABIQUES", S + "296449/", "Clavo corriente 4\" bolsa 500 g", "ETAPA_1", True),
    # Cerchas y estructura de techo
    ("ESTRUCTURA_TECHO", E + "pino-seco-cepillado-premium-1x4-32-m-192589/p", "Pino seco cepillado 1x4 3,2 m (cerchas)", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", A + "110300737/Clavo-corriente-2-1-2-bolsa-1-kg/110300742", "Clavo corriente 2 1/2\" bolsa 1 kg", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", A + "110272625/plancha-zinc-acanalada-0-35-mm-85-1x366-cm-gris-azm150/110272627", "Plancha zinc acanalada 0.35 mm 85,1x366 cm", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", A + "110313004/teja-continua-curva-acero-zinc-1-075x3-66-m-0-4-mm-negro/110313007", "Teja continua curva acero/zinc 1,075x3,66 m 0,4 mm", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", E + "tornillo-autoperforante-hexagonal-con-golilla-goma-12-x-2-12-blister-100-imporper-1105851/p", "Tornillo de techo autoperforante 12x2 1/2 blister 100 u", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", E + "caballete-galvanizado-035x300x3000-mm-1158562/p", "Caballete galvanizado 0,35x300x3000 mm", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", A + "110281116/canal-limaholla-hojalata-0-30x3-metros-para-techos/110281118", "Canal limahoya hojalata 0,30x3 m", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", E + "membrana-hidrofuga-3125-m2-pt-memhidro31-becton-1200486/p", "Membrana hidrófuga 31,25 m2", "ETAPA_1", True),
    ("ESTRUCTURA_TECHO", A + "113252849/Silicona-Rex-neutra-gris-techo-canale-Cartucho-300-ml/113252851", "Silicona neutra gris techo y canales 300 ml", "ETAPA_1", True),
    # Forro exterior
    ("FORRO_EXTERIOR", M + "25972/osb-smartside-panel-r8-111mm-122-x-244", "Smart Panel OSB SmartSide R8 11.1 mm", "", True),
    ("FORRO_EXTERIOR", S + "2491052/", "Siding fibrocemento Volcanboard 6 mm", "", True),
    ("FORRO_EXTERIOR", M + "40073/osb-smartside-lap-siding-95-mm-200x4880", "OSB SmartSide Lap Siding 9.5 mm", "", True),
    ("FORRO_EXTERIOR", E + "plancha-siding-metal-16x38x380-cm-alerce-1432669/p", "Plancha siding metal alerce", "", True),
    ("FORRO_EXTERIOR", A + "113796193/tablero-osb-9-mm-122x244-cm/113796194", "Tablero OSB 9 mm 122x244 cm", "ETAPA_1", True),
    ("FORRO_EXTERIOR", A + "129742043/Tornillo-CRS-Volcanita-6X1-5-8-zincado-100-unidades/129742044", "Tornillo volcanita 6x1 5/8 zincado caja 100 u", "ETAPA_1", True),
    ("FORRO_EXTERIOR", E + "membrana-hidrofuga-3125-m2-pt-memhidro31-becton-1200486/p", "Membrana hidrófuga 31,25 m2 (forro)", "ETAPA_1", True),
    ("FORRO_EXTERIOR", A + "117796600/Grapas-Corchetes-10x1.2mm-Caja-1000-Unidades-Total-Tht39102/117796601", "Grapas corchetes 10x1,2 mm caja 1000 u", "ETAPA_1", True),
    ("FORRO_EXTERIOR", A + "110267472/esmalte-al-agua-1-galones-semibrillante-blanco/110267505", "Esmalte al agua 1 galón semibrillante blanco", "ETAPA_2", True),
    ("FORRO_EXTERIOR", A + "116902929/kit-pintura-interior-bandeja-rodillo-18-cm-brocha-cobertor/116902930", "Kit pintura bandeja, rodillo y brocha", "ETAPA_2", True),
    ("FORRO_EXTERIOR", E + "esquinero-exterior-siding-pvc-50mm-beige-3mts-dvp-mk3dtsu74v/p", "Esquinero exterior siding PVC 3 m", "ETAPA_2", True),
    ("FORRO_EXTERIOR", A + "110276779/Perno-anclaje-3-8-x-3-25-unidades/110276783", "Perno anclaje 3/8 x 3 caja 25 u", "ETAPA_1", True),
    ("FORRO_EXTERIOR", A + "151446641/tornillo-cabeza-de-lenteja-8x1-1-2-punta-fina-1000-unidades/151446642", "Tornillo cabeza lenteja 8x1 1/2 punta fina 1000 u", "ETAPA_1", True),
    ("FORRO_EXTERIOR", E + "pino-dimensionado-premium-2x6-32-m-108802/p", "Pino dimensionado 2x6 3,2 m (vigas)", "ETAPA_1", True),
    # Tapacán, tapa regla y aleros
    ("ALEROS", E + "pino-dimensionado-premium-2x8-32-m-192573/p", "Pino dimensionado 2x8 3,2 m", "ETAPA_2", True),
    ("ALEROS", A + "110303412/placa-fibrocemento-lisa-5-mm-120x240-cm-blanco/110303442", "Placa fibrocemento lisa 5 mm 120x240 cm (Internit)", "ETAPA_2", True),
    ("ALEROS", E + "celosia-de-ventilacion-aluminio-30x30-cm-blanca-rejilla-mkgd2vdzzr/p", "Celosía de ventilación aluminio 30x30 cm", "ETAPA_2", True),
    ("ALEROS", A + "110249649/esmalte-sintetico-1-galones-brillante-blanco/110249650", "Esmalte sintético 1 galón brillante blanco", "ETAPA_2", True),
    ("ALEROS", A + "147204349/sellador-acrilico-pintable-blanco-300-ml/147204350", "Sellador acrílico pintable blanco 300 ml", "ETAPA_2", True),
    # Forro interior y marcos
    ("FORRO_INTERIOR", E + "plancha-yeso-carton-st-15x1200x2400-mm-br-volcan-118468/p", "Volcanita estándar 15 mm 1,20x2,40 m", "ETAPA_2", True),
    ("FORRO_INTERIOR", A + "110287405/terciado-ranurado-9-mm-122x244-cm/110287408", "Terciado ranurado 9 mm 122x244 cm", "ETAPA_2", True),
    ("FORRO_INTERIOR", A + "110316282/terciado-ranurado-12-mm-122x244-cm/110316289", "Terciado ranurado 12 mm 122x244 cm", "ETAPA_2", True),
    ("FORRO_INTERIOR", S + "727083/", "Guardapolvo pino 12 mm", "ETAPA_2", True),
    ("FORRO_INTERIOR", A + "122179771/silicona-acetica-blanca-con-fungicida-rex-cartucho-300-ml/122179772", "Silicona acética blanca con fungicida 300 ml", "ETAPA_2", True),
    ("FORRO_INTERIOR", A + "110324398/placa-fibrocemento-lisa-6-mm-120x240-cm-blanco/110324411", "Placa fibrocemento lisa 6 mm 120x240 cm", "ETAPA_2", True),
    # Ventanas y puertas
    ("VENTANAS_PUERTAS", E + "ventana-aluminio-100x100-cm-corredera-blanca-1164390/p", "Ventana aluminio corredera 100x100 cm blanca", "ETAPA_2", True),
    ("VENTANAS_PUERTAS", E + "ventana-aluminio-60x60-cm-corredera-curva-mate-524115/p", "Ventana aluminio 60x60 cm (baño)", "ETAPA_2", True),
    ("VENTANAS_PUERTAS", A + "132092716/ventana-aluminio-corredera-100x100-cm-vidrio-termopanel-blanco/132092717", "Ventana aluminio corredera 100x100 cm termopanel", "ETAPA_2", True),
    ("VENTANAS_PUERTAS", E + "ventana-aluminio-80x120-cm-termopanel-proyectante-titanio-mundo-glass-1266543/p", "Ventana aluminio 80x120 cm termopanel", "ETAPA_2", True),
    ("VENTANAS_PUERTAS", E + "puerta-metalica-sinfonia-blanco-70x200-cm-1075612/p", "Puerta metálica 70x200 cm", "ETAPA_2", True),
    ("VENTANAS_PUERTAS", A + "144647429/Pomo-de-puerta-cerradura-y-llave-exterior-e-interior-color-negro-mate/144647430", "Pomo de puerta con cerradura y llave exterior", "ETAPA_2", True),
    ("VENTANAS_PUERTAS", E + "bisagra-3x3-bronce-3-unidades-lioi-382763/p", "Bisagra 3x3\" bronce set 3 u", "ETAPA_2", True),
    ("VENTANAS_PUERTAS", A + "110323984/Juego-marco-oregon-40x90x5,4/110324010", "Juego marco oregón 40x90x5,4 m", "ETAPA_2", True),
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
    # 3) mapeo 1 a 1. Los productos del presupuesto de referencia se buscan solo en su propia categoría: así no le quitan a
    #    «Otros insumos» los que ya estaban allí, y la ficha puede repetirse en varias categorías (p. ej. el pino 1x4).
    for cat, url, nombre, etapa, ok, reclasifica in [(*m, True) for m in MAPEO] + [(*m, False) for m in MAPEO_PRESUPUESTO]:
        fila = C.objects.filter(fuente_url=url, categoria=cat).first()
        if not fila and reclasifica:
            fila = C.objects.filter(fuente_url=url, categoria="INSUMO", activo=True).first()
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
