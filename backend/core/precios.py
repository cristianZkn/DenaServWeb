"""Actualización de precios del catálogo desde Sodimac vía el actor de Apify scraperschile/sodimac."""
import re

import requests
from django.conf import settings
from django.utils import timezone

import unicodedata

from .materiales_requeridos import REQUERIDOS
from .models import CatalogoTipo, Proveedor

ACTOR = "scraperschile~sodimac"
MAX_ITEMS = 50


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


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFD", (t or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def _coincide(p: dict, incluye, excluye) -> bool:
    n = _norm(p.get("name"))
    compacto = n.replace(" ", "")
    ok = lambda w: _norm(w) in n or _norm(w) in compacto
    return (all(ok(w) for w in incluye) and not any(ok(w) for w in excluye)
            and not p.get("is_marketplace") and isinstance(p.get("price"), (int, float)) and p["price"] > 0)


def sincronizar_catalogo(runner=ejecutar_actor) -> dict:
    """Crea en el catálogo (categoría INSUMO) los materiales de REQUERIDOS que aún no existen.
    Etapa y rendimiento_m2 de los ya existentes no se tocan; los nuevos nacen con rendimiento 0 (no entran al BOM hasta definirlo)."""
    prov, _ = Proveedor.objects.get_or_create(rut_empresa="SODIMAC-WEB", defaults={"razon_social": "Sodimac"})
    res = {"creados": [], "sin_coincidencia": []}
    for req in REQUERIDOS:
        if CatalogoTipo.objects.filter(categoria="INSUMO", fuente_termino=req["termino"]).exists():
            continue
        try:
            cand = [p for p in runner(req["termino"]) if _coincide(p, req["incluye"], req.get("excluye", []))]
        except Exception as e:
            res["sin_coincidencia"].append(f'{req["termino"]} (error: {e})')
            continue
        if not cand:
            res["sin_coincidencia"].append(req["termino"])
            continue
        mejor = min(cand, key=lambda p: p["price"])
        CatalogoTipo.objects.create(
            categoria="INSUMO", nombre=mejor["name"][:150], unidad_medida="UN", precio_base_unitario=mejor["price"],
            proveedor=prov, etapa_obra=req["etapa"], rendimiento_m2=0, fuente_url=mejor["url"][:500],
            fuente_termino=req["termino"], precio_actualizado_en=timezone.now())
        res["creados"].append(mejor["name"])
    return res


def sincronizar_y_actualizar() -> dict:
    """Flujo semanal: crea materiales faltantes y refresca precios, ejecutando el actor una sola vez por término."""
    cache = {}

    def runner(term):
        if term not in cache:
            cache[term] = ejecutar_actor(term)
        return cache[term]

    nuevos = sincronizar_catalogo(runner)
    return {**actualizar_precios(runner), **nuevos}
