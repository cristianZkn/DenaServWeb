"""Actualización de precios de mercado del catálogo.

Cada producto guarda la URL exacta de su ficha en la tienda (mapeo 1 a 1, sin buscadores). Al actualizar se lee
el precio de lista, se aplica el descuento propio del material (el que la empresa le puso; 0 si no tiene) y se guarda:
    costo_neto = precio_lista * (1 - descuento_pct / 100)
"""
import re
import threading
import time
from decimal import Decimal

from django.db import connection
from django.db.models import Max
from django.utils import timezone

from . import calculo, scraper
from .models import CatalogoTipo, Proveedor

# Categorías que deben tener, como mínimo, un producto activo y verificado con precio leído de su ficha.
GRUPOS_OBLIGATORIOS = {
    "TECHUMBRE": "Techumbre",
    "REVESTIMIENTO": "Revestimiento",
    "TABIQUERIA": "Tabiquería",
    "BASE_RADIER": "Base / Radier",
}
# Categorías de insumos informativos (cubicación/BOM); las bases y revestimientos sí entran al valor de la cotización.
CATEGORIAS_INSUMO = ["INSUMO", *[c for c in GRUPOS_OBLIGATORIOS if c != "REVESTIMIENTO"]]

CAMPOS_LECTURA = ["precio_lista", "costo_neto", "precio_base_unitario", "sku", "nombre_tienda",
                  "precio_actualizado_en", "ultimo_error"]


def costo_neto(precio_lista, descuento_pct) -> Decimal:
    return calculo.costo_neto(precio_lista, descuento_pct).quantize(Decimal("0.01"))


def _m2_unidad(nombre: str):
    """m² que cubre una unidad según las medidas del nombre (ancho x largo; si hay 3 cifras la 1ª es el espesor)."""
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)(?:\s*[xX]\s*(\d+(?:[.,]\d+)?))?", nombre or "")
    if not m:
        return None
    nums = [float(g.replace(",", ".")) for g in m.groups() if g]
    a, b = nums[-2], nums[-1]
    mayor = max(a, b)
    f = 1 if mayor <= 20 else (0.01 if mayor <= 1000 else 0.001)  # metros / centímetros / milímetros
    return round(a * b * f * f, 4) or None


def proveedor_de(url: str) -> Proveedor:
    """Proveedor (tienda) dueño de la URL del producto; se crea la primera vez."""
    tiendas = {"easy": ("EASY-WEB", "Easy"), "mct": ("MCT-WEB", "MCT Maderas"), "sodimac": ("SODIMAC-WEB", "Sodimac"),
               "ferrelan": ("FERRELAN-WEB", "Ferrelan")}
    rut, nombre = tiendas[scraper.tienda_de(url)]
    return Proveedor.objects.get_or_create(rut_empresa=rut, defaults={"razon_social": nombre})[0]


def aplicar_lectura(item: CatalogoTipo, lectura: dict, ahora) -> None:
    """Vuelca en el ítem lo leído de la ficha (no guarda). `precio_base_unitario` queda por unidad de cotización
    (m² en revestimientos) y SIN descuento: el motor de cálculo aplica el descuento del propio material."""
    lista = lectura["precio"]
    m2 = Decimal(str(item.m2_por_unidad or 0))
    item.precio_lista = lista
    item.costo_neto = costo_neto(lista, item.descuento_pct or 0)
    item.precio_base_unitario = (lista / m2).quantize(Decimal("1")) if m2 > 0 else lista
    item.sku = lectura.get("sku") or item.sku
    item.nombre_tienda = (lectura.get("nombre") or item.nombre_tienda)[:250]
    item.precio_actualizado_en = ahora
    item.ultimo_error = ""


def completar_desde_ficha(item: CatalogoTipo, extractor=None) -> None:
    """Lee la ficha de un ítem nuevo o editado y completa proveedor, nombre, medidas y precios (no guarda).
    Lanza ValueError con un mensaje para el usuario si la ficha no se puede leer."""
    extractor = extractor or scraper.extraer
    try:
        lectura = extractor(item.fuente_url)
    except scraper.ErrorExtraccion as e:
        raise ValueError(str(e))
    if not item.proveedor_id:
        item.proveedor = proveedor_de(item.fuente_url)
    if not item.nombre:
        item.nombre = lectura["nombre"][:150]
    if item.categoria == "REVESTIMIENTO" and not item.m2_por_unidad:
        m2 = _m2_unidad(lectura["nombre"])
        if not m2:
            raise ValueError("No se pudieron leer las medidas del producto: indique cuántos m² cubre cada unidad.")
        item.m2_por_unidad = m2
    aplicar_lectura(item, lectura, timezone.now())


def actualizar_item(item: CatalogoTipo, extractor=None, ahora=None) -> str:
    """Actualiza un ítem desde su ficha. Devuelve 'actualizado', 'sin_cambio', 'revision' o 'error'. Nunca lanza:
    un fallo deja el precio anterior y anota el motivo en `ultimo_error`."""
    extractor = extractor or scraper.extraer
    try:
        lectura = extractor(item.fuente_url)
    except Exception as e:  # tienda caída, ficha eliminada, bloqueo anti-bot...
        item.ultimo_error = str(e)[:300]
        item.save(update_fields=["ultimo_error"])
        return "error"
    if item.sku and lectura.get("sku") and item.sku != lectura["sku"]:
        item.ultimo_error = "La ficha ahora muestra otro producto (cambió su código en la tienda): revíselo antes de usar el precio."
        item.verificado = False
        item.save(update_fields=["ultimo_error", "verificado"])
        return "revision"
    cambio = item.precio_lista != lectura["precio"]
    aplicar_lectura(item, lectura, ahora or timezone.now())
    item.save(update_fields=CAMPOS_LECTURA)
    return "actualizado" if cambio else "sin_cambio"


def grupos_sin_cobertura() -> list:
    ok = set(CatalogoTipo.objects.filter(activo=True, verificado=True, precio_lista__gt=0).values_list("categoria", flat=True))
    return [{"codigo": c, "nombre": n} for c, n in GRUPOS_OBLIGATORIOS.items() if c not in ok]


def ultima_actualizacion():
    return CatalogoTipo.objects.aggregate(m=Max("precio_actualizado_en"))["m"]


def actualizar_precios_mercado(extractor=None, pausa=1.0) -> dict:
    """Recorre todos los productos con URL y refresca sus precios. Un producto caído no detiene a los demás."""
    extractor = extractor or scraper.extraer
    items = list(CatalogoTipo.objects.select_related("proveedor").exclude(fuente_url="").order_by("id"))
    res = {"revisados": len(items), "actualizados": 0, "sin_cambio": 0, "errores": [], "a_revisar": []}
    leidas = {}  # una misma ficha usada por varios productos se lee una sola vez

    def leer(url):
        if url not in leidas:
            if leidas and pausa:
                time.sleep(pausa)  # pausa entre tiendas/fichas para no saturarlas
            try:
                leidas[url] = (extractor(url), None)
            except Exception as e:
                leidas[url] = (None, e)
        lectura, error = leidas[url]
        if error:
            raise error
        return lectura

    for it in items:
        estado = actualizar_item(it, extractor=leer)
        if estado == "error":
            res["errores"].append({"id": it.id, "nombre": it.nombre, "error": it.ultimo_error})
        elif estado == "revision":
            res["a_revisar"].append({"id": it.id, "nombre": it.nombre, "error": it.ultimo_error})
        elif estado == "actualizado":
            res["actualizados"] += 1
        else:
            res["sin_cambio"] += 1
    res["grupos_sin_cobertura"] = grupos_sin_cobertura()
    return res


# --- Ejecución en segundo plano (tarda ~1 min; una petición HTTP larga la cortarían gunicorn/proxy) ---
_estado = {"estado": "idle", "resultado": None}
_lock = threading.Lock()


def iniciar_actualizacion(tarea=actualizar_precios_mercado) -> bool:
    """Lanza la actualización en un hilo. False si ya hay una en curso."""
    with _lock:
        if _estado["estado"] == "running":
            return False
        _estado.update(estado="running", resultado=None)

    def correr():
        try:
            _estado.update(estado="done", resultado=tarea())
        except Exception as e:
            _estado.update(estado="error", resultado={"message": str(e)})
        finally:
            connection.close()  # cierra la conexión a BD propia del hilo

    threading.Thread(target=correr, daemon=True).start()
    return True


def estado_actualizacion() -> dict:
    return dict(_estado)
