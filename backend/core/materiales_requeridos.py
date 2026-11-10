"""Materiales que la web necesita (informe, sección 4.7 'Cubicación técnica por etapas').

Cada entrada define qué buscar en Sodimac y cómo filtrar los resultados: se elige el producto más barato
del propio Sodimac (no marketplace) cuyo nombre contenga todas las palabras de `incluye` y ninguna de `excluye`.
Editar esta lista es la forma de agregar o quitar materiales del catálogo automático.
"""
REQUERIDOS = [
    # Etapa 1: obra gruesa
    {"termino": "pino impregnado 2x3", "incluye": ["pino", "impregnado", "2x3"], "etapa": "ETAPA_1"},
    {"termino": "pino impregnado 2x4", "incluye": ["pino", "impregnado", "2x4"], "etapa": "ETAPA_1"},
    {"termino": "pino cepillado 1x4", "incluye": ["pino", "1x4"], "excluye": ["impregnado"], "etapa": "ETAPA_1"},
    {"termino": "clavo corriente 4 pulgadas", "incluye": ["clavo", "4"], "etapa": "ETAPA_1"},
    {"termino": "clavo para cerchas 3 pulgadas", "incluye": ["clavo", "3"], "etapa": "ETAPA_1"},
    {"termino": "viga pino impregnado", "incluye": ["pino", "impregnado"], "excluye": ["2x2", "2x3", "2x4", "1x4"], "etapa": "ETAPA_1"},
    {"termino": "https://mct.cl/categorias/22/terciado-y-osb", "incluye": ["terciado", "estructural"], "etapa": "ETAPA_1"},
    {"termino": "malla electrosoldada", "incluye": ["malla", "electrosoldada"], "etapa": "ETAPA_1"},
    {"termino": "polietileno 0.2 mm", "incluye": ["polietileno"], "etapa": "ETAPA_1"},
    {"termino": "membrana hidrofuga muros", "incluye": ["membrana"], "etapa": "ETAPA_1"},
    {"termino": "plancha zinc acanalada 5v", "incluye": ["zinc"], "etapa": "ETAPA_1"},
    # MCT: el termino es la URL de la categoria (scraping directo, sin creditos de Apify)
    {"termino": "https://mct.cl/categorias/22/terciado-y-osb", "incluye": ["osb", "panel"], "excluye": ["siding", "lap"], "etapa": "ETAPA_1"},
    # Etapa 2: terminaciones
    {"termino": "lana de vidrio", "incluye": ["lana", "vidrio"], "etapa": "ETAPA_2"},
    {"termino": "plancha poliestireno expandido aislante", "incluye": ["poliestireno", "plancha"], "excluye": ["moldura"], "etapa": "ETAPA_2"},
    {"termino": "plancha yeso carton 10 mm", "incluye": ["plancha", "yeso"], "excluye": ["40x40"], "etapa": "ETAPA_2"},
    {"termino": "guardapolvo madera", "incluye": ["guardapolvo"], "excluye": ["ceramica", "porcelanato", "vinilico"], "etapa": "ETAPA_2"},
    {"termino": "cornisa", "incluye": ["cornisa"], "etapa": "ETAPA_2"},
]
