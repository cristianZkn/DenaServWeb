"""Materiales que la web necesita (informe, sección 4.7 'Cubicación técnica por etapas').

Cada entrada define qué buscar en Sodimac y cómo filtrar los resultados: se elige el producto más barato
del propio Sodimac (no marketplace) cuyo nombre contenga todas las palabras de `incluye` y ninguna de `excluye`.
Editar esta lista es la forma de agregar o quitar materiales del catálogo automático.

`categoria` (por defecto INSUMO). Los de categoría REVESTIMIENTO se cotizan por m²: el precio de la unidad (plancha/tira)
se divide por los m² que cubre, leídos de las medidas del nombre del producto, y se elige el más barato por m².
"""
# Mínimo de ítems con precio automático que debe tener cada categoría; si falta, la sincronización lo informa.
MINIMOS = {"REVESTIMIENTO": 1}

REQUERIDOS = [
    # Etapa 1: obra gruesa
    {"termino": "pino impregnado 2x3", "incluye": ["pino", "impregnado", "2x3"], "etapa": "ETAPA_1"},
    {"termino": "pino impregnado 2x4", "incluye": ["pino", "impregnado", "2x4"], "etapa": "ETAPA_1"},
    {"termino": "pino seco cepillado 1x4", "incluye": ["pino", "1x4"], "excluye": ["impregnado"], "etapa": "ETAPA_1"},
    {"termino": "clavo corriente 4 pulgadas", "incluye": ["clavo", "corriente", "4"], "etapa": "ETAPA_1"},
    {"termino": "pino impregnado 2x8", "incluye": ["pino", "impregnado", "2x8"], "etapa": "ETAPA_1"},
    {"termino": "https://mct.cl/categorias/22/terciado-y-osb", "incluye": ["terciado", "estructural"], "etapa": "ETAPA_1"},
    {"termino": "malla acma c92", "incluye": ["malla", "c92"], "excluye": ["mini"], "etapa": "ETAPA_1"},
    {"termino": "polietileno transparente rollo construccion", "incluye": ["polietileno"], "excluye": ["torcido", "moldura", "aislante", "expandido"], "etapa": "ETAPA_1"},
    {"termino": "membrana hidrofuga muros", "incluye": ["membrana", "hidrofuga"], "excluye": ["esquinero", "liquida"], "etapa": "ETAPA_1"},
    {"termino": "plancha zinc 5v", "incluye": ["plancha", "zinc", "5v"], "excluye": ["clavo"], "etapa": "ETAPA_1"},
    # MCT: el termino es la URL de la categoria (scraping directo)
    {"termino": "https://mct.cl/categorias/22/terciado-y-osb", "incluye": ["osb", "panel"], "excluye": ["siding", "lap"], "etapa": "ETAPA_1"},
    # Etapa 2: terminaciones
    {"termino": "lana de vidrio", "incluye": ["lana", "vidrio"], "etapa": "ETAPA_2"},
    {"termino": "poliestireno expandido plancha", "incluye": ["poliestireno", "expandido"], "excluye": ["moldura", "pack", "unidades"], "etapa": "ETAPA_2"},
    {"termino": "plancha yeso carton 10 mm", "incluye": ["plancha", "yeso"], "excluye": ["40x40"], "etapa": "ETAPA_2"},
    {"termino": "guardapolvo madera", "incluye": ["guardapolvo"], "excluye": ["ceramica", "porcelanato", "vinilico"], "etapa": "ETAPA_2"},
    {"termino": "cornisa", "incluye": ["cornisa"], "etapa": "ETAPA_2"},
]

REQUERIDOS += [
    # Revestimientos exteriores (cotizados por m²)
    {"categoria": "REVESTIMIENTO", "termino": "https://mct.cl/categorias/22/terciado-y-osb", "incluye": ["smartside", "panel"], "excluye": ["lap"]},
    {"categoria": "REVESTIMIENTO", "termino": "https://mct.cl/categorias/22/terciado-y-osb", "incluye": ["smartside", "lap"]},
    {"categoria": "REVESTIMIENTO", "termino": "siding fibrocemento", "incluye": ["fibrocemento"], "excluye": ["pallet", "perfil", "pack"]},
    {"categoria": "REVESTIMIENTO", "termino": "metal siding", "incluye": ["siding", "metal"], "excluye": ["perfil", "caja", "tablas", "union", "pallet"]},
]
