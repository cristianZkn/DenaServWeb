"""Actualización de precios del catálogo desde Sodimac vía el actor de Apify scraperschile/sodimac."""
import re
import threading
import time
import json
from urllib.parse import quote, urlsplit

import requests
from bs4 import BeautifulSoup
from django.conf import settings
from django.db import connection
from django.utils import timezone

import unicodedata

from .materiales_requeridos import REQUERIDOS
from .models import CatalogoTipo, Proveedor

ACTOR = "scraperschile~sodimac"
MAX_ITEMS = 50


def _clave(url: str):
    """Identificador estable 'tienda:id' de un producto a partir de su URL (None si no se reconoce)."""
    host = urlsplit(url or "").netloc.replace("www.", "")
    path = urlsplit(url or "").path
    if "easy.cl" in host:
        m = re.search(r"-(\d+)/p/?$", path)
    else:
        m = re.search(r"(?:^|/)(?:articulo|product|ficha)/([0-9A-Za-z]+)", path)
    return f"{host.split('.')[0]}:{m.group(1)}" if m else None


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


MCT_BASE = "https://mct.cl/"


def parsear_mct(html: str) -> list:
    """Extrae productos de una página de categoría de mct.cl (HTML renderizado en servidor)."""
    out = []
    for g in BeautifulSoup(html, "html.parser").select("div.grilla"):
        nombre, valor = g.select_one("a.nombreGrilla"), g.select_one("a.valorGrilla")
        if not nombre or not valor:
            continue
        precios = [int(re.sub(r"\D", "", t)) for t in re.findall(r"\$\s*[\d.]+", valor.get_text())]
        href = nombre.get("href", "")
        out.append({"name": nombre.get_text(strip=True), "price": min(precios) if precios else None,
                    "url": MCT_BASE + href.lstrip("/"), "is_marketplace": False})
    return out


def _ca_bundle_mct() -> str:
    """mct.cl no envía su certificado intermedio (Thawte TLS RSA CA G1): se agrega a las CA de certifi
    para poder verificar el TLS sin desactivar la verificación."""
    import certifi
    import tempfile
    from pathlib import Path
    extra = (Path(__file__).parent / "certs" / "thawte_tls_rsa_ca_g1.pem").read_text()
    f = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
    f.write(Path(certifi.where()).read_text() + "\n" + extra)
    f.close()
    return f.name


def scrape_mct(url: str) -> list:
    # robots.txt de mct.cl permite las páginas de categoría sin parámetros de consulta.
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; DenaServBot/1.0)"}, timeout=20,
                     verify=_ca_bundle_mct())
    r.raise_for_status()
    return parsear_mct(r.text)


UA = {"User-Agent": "Mozilla/5.0 (compatible; DenaServBot/1.0)"}


def _next_data(url: str) -> dict:
    r = requests.get(url, headers=UA, timeout=25)
    r.raise_for_status()
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
    if not m:
        raise RuntimeError(f"Sin datos estructurados en {url}")
    return json.loads(m.group(1))


def _buscar_lista(o, clave_nombre):
    """Primera lista de dicts (>1) cuyos elementos tienen `clave_nombre` dentro del JSON de Next."""
    if isinstance(o, dict):
        for v in o.values():
            if isinstance(v, list) and len(v) > 1 and isinstance(v[0], dict) and clave_nombre in v[0]:
                return v
        for v in o.values():
            if (r := _buscar_lista(v, clave_nombre)):
                return r
    elif isinstance(o, list):
        for v in o:
            if (r := _buscar_lista(v, clave_nombre)):
                return r
    return None


def scrape_sodimac(term: str) -> list:
    # robots.txt de sodimac.cl no bloquea /sodimac-cl/search?Ntt= (sí bloquea /buscar/ y /browse/).
    data = _next_data(f"https://www.sodimac.cl/sodimac-cl/search?Ntt={quote(term)}")
    out = []
    for p in _buscar_lista(data, "displayName") or []:
        precios = p.get("prices") or []
        normal = next((x for x in precios if x.get("type") == "NORMAL"), precios[0] if precios else {})
        out.append({"name": p["displayName"], "price": normal.get("priceWithoutFormatting"),
                    "url": f"https://www.sodimac.cl/sodimac-cl/product/{p['productId']}/",
                    "is_marketplace": bool(p.get("isInternational"))})
    return out


def scrape_easy(term: str) -> list:
    # robots.txt de easy.cl solo bloquea bots con nombre propio; /search/<término> está permitido.
    data = _next_data(f"https://www.easy.cl/search/{quote(term)}")
    out = []
    for p in _buscar_lista(data, "productName") or []:
        pr = p.get("prices") or {}
        out.append({"name": p["productName"], "price": pr.get("offerPrice") or pr.get("normalPrice"),
                    "url": f"https://www.easy.cl/{p['linkText']}", "is_marketplace": bool(p.get("isMarketplace"))})
    return out


def ejecutar_fuente(term: str) -> list:
    """URL de mct.cl -> MCT; 'apify:<término>' -> actor de Apify; otro término -> Sodimac + Easy (scraping directo, gratis)."""
    if term.startswith(MCT_BASE):
        return scrape_mct(term)
    if term.startswith("apify:"):
        return ejecutar_actor(term[6:])
    items = []
    for scraper in (scrape_sodimac, scrape_easy):
        try:
            items += scraper(term)
        except Exception:  # si una tienda cae, se sigue con la otra
            pass
        time.sleep(1)
    if not items:
        raise RuntimeError("Ninguna tienda respondió")
    return items


def actualizar_precios(runner=ejecutar_fuente) -> dict:
    """Actualiza precio_base_unitario de los ítems con fuente_url. Nunca pisa un precio válido con uno vacío."""
    items = CatalogoTipo.objects.filter(activo=True).exclude(fuente_url="").exclude(fuente_termino="")
    por_termino = {}
    for it in items:
        por_termino.setdefault(it.fuente_termino, []).append(it)

    res = {"actualizados": 0, "sin_cambio": 0, "no_encontrados": [], "errores": []}
    for term, lista in por_termino.items():
        try:
            precios = {(p.get("clave") or _clave(p.get("url"))): p.get("price") for p in runner(term)}
        except Exception as e:  # un término caído no debe detener a los demás
            res["errores"].append(f"{term}: {e}")
            continue
        for it in lista:
            precio = precios.get(_clave(it.fuente_url))
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
    def ok(w):
        w = _norm(w)
        # medidas tipo "2x3" no deben coincidir dentro de "2x2x3": no pueden ir precedidas de dígito ni "x"
        return bool(re.search(rf"(?<![0-9x]){re.escape(w)}", compacto)) if "x" in w and w[0].isdigit() else w in n
    return (all(ok(w) for w in incluye) and not any(ok(w) for w in excluye)
            and not p.get("is_marketplace") and isinstance(p.get("price"), (int, float)) and p["price"] > 0)


def _proveedor_de(url: str) -> Proveedor:
    """Proveedor (tienda) dueño de la URL del producto; se crea la primera vez."""
    tiendas = {"easy.cl": ("EASY-WEB", "Easy"), "mct.cl": ("MCT-WEB", "MCT Maderas")}
    rut, nombre = next((v for k, v in tiendas.items() if k in url), ("SODIMAC-WEB", "Sodimac"))
    return Proveedor.objects.get_or_create(rut_empresa=rut, defaults={"razon_social": nombre})[0]


def sincronizar_catalogo(runner=ejecutar_fuente) -> dict:
    """Crea en el catálogo (categoría INSUMO) los materiales de REQUERIDOS que aún no existen.
    Etapa y rendimiento_m2 de los ya existentes no se tocan; los nuevos nacen con rendimiento 0 (no entran al BOM hasta definirlo)."""
    res = {"creados": [], "sin_coincidencia": []}
    for req in REQUERIDOS:
        # ya existe si hay un insumo con la misma fuente cuyo nombre cumple el filtro de esta entrada
        if any(_coincide({"name": n, "price": 1}, req["incluye"], req.get("excluye", []))
               for n in CatalogoTipo.objects.filter(categoria="INSUMO", fuente_termino=req["termino"]).values_list("nombre", flat=True)):
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
            proveedor=_proveedor_de(mejor["url"]), etapa_obra=req["etapa"], rendimiento_m2=0, fuente_url=mejor["url"][:500],
            fuente_termino=req["termino"], precio_actualizado_en=timezone.now())
        res["creados"].append(mejor["name"])
    return res


def sincronizar_y_actualizar() -> dict:
    """Flujo semanal: crea materiales faltantes y refresca precios, ejecutando el actor una sola vez por término."""
    cache = {}

    def runner(term):
        if term not in cache:
            cache[term] = ejecutar_fuente(term)
        return cache[term]

    nuevos = sincronizar_catalogo(runner)
    return {**actualizar_precios(runner), **nuevos}


# --- Ejecución en segundo plano (la sincronización tarda ~1-2 min; una petición HTTP larga la cortarían gunicorn/proxy) ---
_estado = {"estado": "idle", "resultado": None}
_lock = threading.Lock()


def iniciar_sincronizacion(tarea=sincronizar_y_actualizar) -> bool:
    """Lanza la sincronización en un hilo. False si ya hay una en curso."""
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


def estado_sincronizacion() -> dict:
    return dict(_estado)
