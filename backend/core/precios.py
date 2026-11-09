"""Actualización de precios del catálogo desde Sodimac vía el actor de Apify scraperschile/sodimac."""
import re

import requests
from django.conf import settings
from django.utils import timezone

from .models import CatalogoTipo

ACTOR = "scraperschile~sodimac"
MAX_ITEMS = 100


def _articulo_id(url: str):
    m = re.search(r"/(?:articulo|product)/([0-9A-Za-z]+)", url or "")
    return m.group(1) if m else None


def ejecutar_actor(term: str) -> list:
    if not settings.APIFY_TOKEN:
        raise RuntimeError("Falta APIFY_TOKEN en el entorno.")
    r = requests.post(
        f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items",
        headers={"Authorization": f"Bearer {settings.APIFY_TOKEN}"},
        json={"term": term, "maxItems": MAX_ITEMS},
        timeout=300,
    )
    r.raise_for_status()
    return r.json()


def actualizar_precios(runner=ejecutar_actor) -> dict:
    """Actualiza precio_base_unitario de los ítems con fuente_url. Nunca pisa un precio válido con uno vacío."""
    items = CatalogoTipo.objects.filter(activo=True).exclude(fuente_url="").exclude(fuente_termino="")
    por_termino = {}
    for it in items:
        por_termino.setdefault(it.fuente_termino, []).append(it)

    res = {"actualizados": 0, "sin_cambio": 0, "no_encontrados": [], "errores": []}
    for term, lista in por_termino.items():
        try:
            precios = {str(p.get("product_id") or _articulo_id(p.get("url"))): p.get("price") for p in runner(term)}
        except Exception as e:  # un término caído no debe detener a los demás
            res["errores"].append(f"{term}: {e}")
            continue
        for it in lista:
            precio = precios.get(_articulo_id(it.fuente_url))
            if not isinstance(precio, (int, float)) or precio <= 0:
                res["no_encontrados"].append(it.nombre)
                continue
            if float(it.precio_base_unitario) == float(precio):
                res["sin_cambio"] += 1
            else:
                it.precio_base_unitario = precio
                res["actualizados"] += 1
            it.precio_actualizado_en = timezone.now()
            it.save(update_fields=["precio_base_unitario", "precio_actualizado_en"])
    return res
