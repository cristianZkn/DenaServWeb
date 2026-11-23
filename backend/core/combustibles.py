"""Precio real del combustible según Bencina en Línea (Comisión Nacional de Energía, API pública).

Primero se buscan las estaciones de la marca (Copec) de la comuna (Los Ángeles, Región del Biobío) y se promedian sus precios;
si una de ellas no informa un combustible se usa la marca en toda la región. Si eso no es posible (la CNE no responde o no trae
los 4 combustibles) se usa el promedio de las zonas de la CNE (Zona Centro + Zona Sur). Cada precio guarda de dónde salió.

Se guarda el último precio leído para seguir cotizando si la CNE no responde; se vuelve a consultar si tiene más de 6 horas.
"""
import logging
import os
import re
import unicodedata
from datetime import timedelta
from decimal import Decimal

import requests
from django.conf import settings
from django.utils import timezone

from .models import PrecioCombustible

logger = logging.getLogger(__name__)

URL_CNE = "https://api.bencinaenlinea.cl/api/estaciones/precios_combustibles/reporte_zonal"
URL_ESTACIONES = "https://api.bencinaenlinea.cl/api/busqueda_estacion_filtro"
VIGENCIA = timedelta(hours=6)
# Estaciones que se consultan (se pueden cambiar con variables de entorno).
MARCA = os.getenv("COMBUSTIBLE_MARCA", "Copec")
COMUNA = os.getenv("COMBUSTIBLE_COMUNA", "Los Ángeles")
REGION = os.getenv("COMBUSTIBLE_REGION", "Biobío")
# La CNE identifica la marca con un número (campo `marca`), sin su nombre. El 5 es la cadena con más estaciones del país (710), que en
# Chile es Copec; se puede cambiar con COMBUSTIBLE_MARCA_ID (si queda vacío se usa la cadena más grande) y se revisa con
# `python manage.py diagnosticar_combustibles`.
MARCA_ID = os.getenv("COMBUSTIBLE_MARCA_ID", "5").strip()
PRECIO_MIN, PRECIO_MAX = Decimal(400), Decimal(2500)  # fuera de este rango (CLP por litro) el dato se considera erróneo

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


# ---------------------------------------------------------------------------------------------------------------------
# Estaciones de una marca en una comuna (Copec · Los Ángeles). Los nombres de los campos de la CNE se buscan sin distinguir
# mayúsculas ni tildes y en cualquier nivel del registro, porque la API de Bencina en Línea no los documenta.
# ---------------------------------------------------------------------------------------------------------------------
def _norm(valor) -> str:
    t = unicodedata.normalize("NFD", str(valor)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t).strip()


def _hojas(obj, ruta=""):
    """(ruta normalizada, valor) de cada dato simple de un registro, bajando por diccionarios y listas."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _hojas(v, f"{ruta}.{_norm(k)}" if ruta else _norm(k))
    elif isinstance(obj, list):
        for v in obj:
            yield from _hojas(v, ruta)
    elif obj is not None:
        yield ruta, obj


def _tipo_combustible(nombre):
    n = _norm(nombre)
    m = re.search(r"\b(93|95|97)\b", n)
    if m:
        return m.group(1)
    if "diesel" in n or "petroleo" in n or n in ("di", "d", "gasoil"):
        return "DIESEL"
    return None


def _numero(v):
    """Precio como número. La CNE lo entrega como "1666.000" (decimales) y otros formatos usan "1.666" o "1.666,00" (miles):
    se prueban las lecturas posibles y se toma la que cae en el rango de un precio por litro."""
    if isinstance(v, (int, float, Decimal)):
        candidatos = [str(v)]
    else:
        t = str(v).replace("$", "").replace(" ", "").strip()
        candidatos = [t.replace(",", "."), t.replace(".", "").replace(",", "."), t.replace(",", "")]
    for c in candidatos:
        try:
            n = Decimal(c)
        except Exception:
            continue
        if PRECIO_MIN <= n <= PRECIO_MAX:
            return n
    return None


def _precios_de(est) -> dict:
    """{tipo: [precios]} de una estación. Acepta `precios` como diccionario ({"93": {"precio": 1604}}) o como lista de
    {combustible, precio}, y también registros con una fila por combustible."""
    out = {}

    def agregar(nombre, valor):
        tipo, precio = _tipo_combustible(nombre), _numero(valor)
        if tipo and precio is not None and PRECIO_MIN <= precio <= PRECIO_MAX:
            out.setdefault(tipo, []).append(precio)

    def precio_de(x):
        if isinstance(x, dict):
            return next((v for k, v in x.items() if _norm(k) in ("precio", "price", "valor", "precio_por_litro")), None)
        return x

    def nombre_de(x):
        return next((v for k, v in x.items() if _norm(k) in ("combustible", "nombre", "tipo", "fuel", "fuel_name", "producto",
                    "nombre_combustible", "combustible_nombre_largo", "nombre_largo")), None)

    if isinstance(est, dict):
        for k, v in est.items():
            if "precio" in _norm(k) and isinstance(v, dict):
                for fk, fv in v.items():
                    agregar(fk, precio_de(fv))
            elif isinstance(v, list):  # lista de {nombre del combustible, precio}, se llame como se llame
                for it in v:
                    if isinstance(it, dict) and nombre_de(it) is not None and precio_de(it) is not None:
                        agregar(nombre_de(it), precio_de(it))
        if not out and nombre_de(est) is not None and precio_de(est) is not None:  # una fila por estación y combustible
            agregar(nombre_de(est), precio_de(est))
    return out


def _es_de(est, claves, valores, exacto=False) -> bool:
    """¿Algún campo cuyo nombre contenga una de `claves` tiene uno de `valores`?"""
    for ruta, v in _hojas(est):
        if any(c in ruta.split(".")[-1] for c in claves):
            n = _norm(v)
            if any((n == x) if exacto else (x in n) for x in valores):
                return True
    return False


def _es_de_marca(est, marca, marca_id=None) -> bool:
    """¿La estación es de la marca? Por su número de marca si se conoce y, si no, por el nombre en cualquier dato de texto."""
    if marca_id and str(est.get("marca")) == str(marca_id):
        return True
    m = _norm(marca)
    if _es_de(est, ("marca", "distribuidor", "brand", "operador", "razon", "fantasia", "empresa"), (m,)):
        return True
    return any(isinstance(v, str) and m in _norm(v) for _, v in _hojas(est))


def marcas_por_cantidad(estaciones) -> list:
    """[(número de marca, cantidad de estaciones)] de mayor a menor, para las estaciones que traen la marca como número."""
    cuenta = {}
    for e in estaciones:
        m = e.get("marca") if isinstance(e, dict) else None
        if isinstance(m, (int, str)) and str(m).strip():
            cuenta[str(m)] = cuenta.get(str(m), 0) + 1
    return sorted(cuenta.items(), key=lambda x: -x[1])


def marca_id_de(estaciones, marca) -> str:
    """Número de marca a usar: el configurado, o ninguno si hay estaciones que dicen su nombre, o el de la cadena más grande."""
    if MARCA_ID:
        return MARCA_ID
    if any(isinstance(e, dict) and _es_de_marca(e, marca) for e in estaciones):
        return ""
    ranking = marcas_por_cantidad(estaciones)
    return ranking[0][0] if ranking else ""


def _tiene_campo(est, claves) -> bool:
    return any(any(c in ruta.split(".")[-1] for c in claves) for ruta, _ in _hojas(est))


def _lista_de_estaciones(datos):
    if isinstance(datos, list):
        return datos
    if isinstance(datos, dict):
        for k in ("data", "estaciones", "results", "items", "resultados"):
            if k in datos:
                return _lista_de_estaciones(datos[k])
    raise ValueError("La CNE no entregó la lista de estaciones.")


def leer_estaciones(marca=None, comuna=None, region=None) -> dict:
    """{tipo: (precio por litro, texto del lugar)}: promedio de las estaciones de la marca en la comuna; si una no informa un
    combustible se usa la marca en toda la región. Lanza ValueError si la CNE no responde o no trae los 4 combustibles."""
    marca, comuna, region = marca or MARCA, comuna or COMUNA, region or REGION
    try:
        r = requests.get(URL_ESTACIONES, timeout=20, headers={"User-Agent": "Mozilla/5.0 DenaServ"})
        r.raise_for_status()
        estaciones = _lista_de_estaciones(r.json())
    except (requests.RequestException, ValueError, KeyError) as e:
        raise ValueError(f"No se pudo consultar las estaciones a la CNE ({type(e).__name__}).")
    mid = marca_id_de(estaciones, marca)
    de_la_region = [e for e in estaciones if isinstance(e, dict) and _es_de_marca(e, marca, mid)
                    and (not _tiene_campo(e, ("region",)) or _es_de(e, ("region",), (_norm(region), "viii", "08"))
                         or _es_de(e, ("region",), ("8",), exacto=True))]
    de_la_comuna = [e for e in de_la_region if _es_de(e, ("comuna", "commune"), (_norm(comuna),), exacto=True)]
    precios = {}
    for tipo in TIPOS:
        for grupo, lugar in ((de_la_comuna, f"{marca} · {comuna}"), (de_la_region, f"{marca} · Región del {region}")):
            valores = [p for e in grupo for p in _precios_de(e).get(tipo, [])]
            if valores:
                precios[tipo] = ((sum(valores) / len(valores)).quantize(Decimal("1")), lugar)
                break
    if len(precios) != len(TIPOS):
        raise ValueError(f"La CNE no entregó los 4 precios de {marca} en {comuna} ({len(de_la_comuna)} estaciones encontradas).")
    return precios


def leer_precios() -> dict:
    """{tipo: (precio, lugar, fuente)}: Copec de Los Ángeles y, si no se puede, el promedio de las zonas de la CNE."""
    try:
        return {t: (p, lugar, f"Bencina en Línea (CNE) · {MARCA}") for t, (p, lugar) in leer_estaciones().items()}
    except ValueError as e:
        logger.warning("Precio por estación no disponible, se usa el promedio zonal: %s", e)
    return {t: (p, nombre_zona(), "Bencina en Línea (CNE)") for t, p in leer_cne().items()}


def _fila(tipo, p):
    return {"tipo": tipo, "nombre": TIPOS[tipo][1], "precio": float(p.precio) if p else None, "manual": bool(p and p.manual),
            "zona": p.zona if p else "", "fuente": p.fuente if p else "", "actualizado_en": p.actualizado_en if p else None}


def actualizar() -> list:
    """Consulta a la CNE y guarda los precios, salvo los que la empresa fijó a mano. Lanza ValueError si no se pudo."""
    ahora = timezone.now()
    manuales = set(PrecioCombustible.objects.filter(manual=True).values_list("tipo", flat=True))
    for tipo, (precio, lugar, fuente) in leer_precios().items():
        if tipo not in manuales:
            PrecioCombustible.objects.update_or_create(
                tipo=tipo, defaults={"precio": precio, "zona": lugar, "fuente": fuente, "actualizado_en": ahora})
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
    precio, lugar, fuente = leer_precios()[tipo]
    PrecioCombustible.objects.update_or_create(
        tipo=tipo, defaults={"precio": precio, "manual": False, "zona": lugar, "fuente": fuente, "actualizado_en": timezone.now()})


def precio(tipo: str) -> Decimal:
    for f in listar():
        if f["tipo"] == tipo:
            return Decimal(str(f["precio"]))
    raise ValueError("No hay precio disponible para ese combustible.")
