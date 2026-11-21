"""Precio real del combustible: promedio de la zona según Bencina en Línea (Comisión Nacional de Energía, API pública).

Se guarda el último precio leído para seguir cotizando si la CNE no responde; se vuelve a consultar si tiene más de 6 horas.
"""
from datetime import timedelta
from decimal import Decimal

import requests
from django.conf import settings
from django.utils import timezone

from .models import PrecioCombustible

URL_CNE = "https://api.bencinaenlinea.cl/api/estaciones/precios_combustibles/reporte_zonal"
VIGENCIA = timedelta(hours=6)

# tipo -> (nombre en la CNE, nombre para mostrar)
TIPOS = {
    "93": ("gasolina 93", "Bencina 93"),
    "95": ("gasolina 95", "Bencina 95"),
    "97": ("gasolina 97", "Bencina 97"),
    "DIESEL": ("petroleo diesel", "Diésel"),
}


def nombre_zona() -> str:
    """Zonas de la CNE que se promedian, para mostrarlas (p. ej. «Zona Centro + Zona Sur»)."""
    return " + ".join(settings.COMBUSTIBLE_ZONAS)


def leer_cne(zonas: list | None = None) -> dict:
    """{tipo: precio por litro}: promedio de las zonas indicadas (por defecto el centro-sur del país). Lanza ValueError si la
    CNE no responde o no trae los 4 combustibles."""
    zonas = [z.lower() for z in (zonas or settings.COMBUSTIBLE_ZONAS)]
    try:
        r = requests.get(URL_CNE, timeout=10, headers={"User-Agent": "Mozilla/5.0 DenaServ"})
        r.raise_for_status()
        filas = r.json()["data"]
    except (requests.RequestException, ValueError, KeyError) as e:
        raise ValueError(f"No se pudo consultar el precio del combustible a la CNE ({type(e).__name__}).")
    precios = {}
    for tipo, (nombre_cne, _) in TIPOS.items():
        valores = [Decimal(str(f["precio_promedio"])) for f in filas
                   if f["zona_geografica_nombre"].lower() in zonas and f["combustible_nombre_largo"].lower() == nombre_cne]
        if valores:
            precios[tipo] = (sum(valores) / len(valores)).quantize(Decimal("1"))
    if len(precios) != len(TIPOS):
        raise ValueError(f"La CNE no entregó todos los precios para «{nombre_zona()}».")
    return precios


def _fila(tipo, p):
    return {"tipo": tipo, "nombre": TIPOS[tipo][1], "precio": float(p.precio) if p else None, "manual": bool(p and p.manual),
            "zona": p.zona if p else "", "fuente": p.fuente if p else "", "actualizado_en": p.actualizado_en if p else None}


def actualizar() -> list:
    """Consulta a la CNE y guarda los precios, salvo los que la empresa fijó a mano. Lanza ValueError si no se pudo."""
    ahora = timezone.now()
    manuales = set(PrecioCombustible.objects.filter(manual=True).values_list("tipo", flat=True))
    for tipo, precio in leer_cne().items():
        if tipo not in manuales:
            PrecioCombustible.objects.update_or_create(
                tipo=tipo, defaults={"precio": precio, "zona": nombre_zona(), "fuente": "Bencina en Línea (CNE)", "actualizado_en": ahora})
    return listar(refrescar=False)


def listar(refrescar: bool = True) -> list:
    """Precios vigentes. Si los de la CNE guardados tienen más de 6 horas (o falta alguno) se consultan de nuevo; si la CNE
    no responde se usan los guardados (o los fijados a mano), y si falta alguno se lanza ValueError."""
    filas = {p.tipo: p for p in PrecioCombustible.objects.all()}
    vencidos = len(filas) < len(TIPOS) or any(timezone.now() - p.actualizado_en > VIGENCIA for p in filas.values() if not p.manual)
    if refrescar and vencidos:
        try:
            return actualizar()
        except ValueError:
            if len(filas) < len(TIPOS):
                raise
    return [_fila(t, filas[t]) for t in TIPOS if t in filas]


def estado() -> dict:
    """Para la sección Tarifas: los 4 combustibles (con precio vacío si no hay) y el motivo si la CNE no respondió."""
    error = None
    try:
        listar()
    except ValueError as e:
        error = str(e)
    filas = {p.tipo: p for p in PrecioCombustible.objects.all()}
    return {"filas": [_fila(t, filas.get(t)) for t in TIPOS], "error": error}


def fijar_manual(tipo: str, valor: Decimal) -> None:
    """Precio escrito por la empresa (por ejemplo si la CNE no responde). Rige hasta que se vuelva al de la CNE."""
    PrecioCombustible.objects.update_or_create(
        tipo=tipo, defaults={"precio": valor, "manual": True, "zona": "", "fuente": "Ingresado manualmente", "actualizado_en": timezone.now()})


def volver_a_cne(tipo: str) -> None:
    """Deja de usar el precio manual y toma el de la CNE. Lanza ValueError si la CNE no responde (se conserva el manual)."""
    precio = leer_cne()[tipo]
    PrecioCombustible.objects.update_or_create(
        tipo=tipo, defaults={"precio": precio, "manual": False, "zona": nombre_zona(), "fuente": "Bencina en Línea (CNE)",
                             "actualizado_en": timezone.now()})


def precio(tipo: str) -> Decimal:
    for f in listar():
        if f["tipo"] == tipo:
            return Decimal(str(f["precio"]))
    raise ValueError("No hay precio disponible para ese combustible.")
