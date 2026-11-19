"""Lectura del precio de lista desde la ficha exacta de un producto (Easy, Sodimac, MCT).

No usa buscadores: cada producto del catálogo guarda la URL de su ficha. En Easy y Sodimac el precio sale del
JSON-LD (schema.org/Product) incrustado en la página; MCT no lo publica y se lee del HTML de la ficha.
Ante bloqueos anti-bot (403/429/503) se reintenta con `cloudscraper`, si está instalado.
"""
import html as html_lib
import json
import re
import tempfile
import time
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import requests
from bs4 import BeautifulSoup

TIMEOUT = 25
INTENTOS = 3
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es-CL,es;q=0.9",
}
BLOQUEO = {403, 429, 503}


class ErrorExtraccion(Exception):
    """No se pudo leer el precio (tienda caída, ficha eliminada, bloqueo o página sin precio). El mensaje es para el usuario."""


def tienda_de(url: str) -> str:
    host = (urlsplit(url or "").hostname or "").lower()
    for tienda, dominio in (("easy", "easy.cl"), ("sodimac", "sodimac.cl"), ("mct", "mct.cl"), ("ferrelan", "ferrelan.cl")):
        if host == dominio or host.endswith("." + dominio):
            return tienda
    raise ErrorExtraccion("La dirección no es de una tienda conocida (Easy, Sodimac, MCT o Ferrelan).")


@lru_cache(maxsize=1)
def _ca_mct() -> str:
    """mct.cl no envía su certificado intermedio (Thawte TLS RSA CA G1): se agrega a las CA de certifi
    para verificar el TLS sin desactivar la verificación."""
    import certifi
    extra = (Path(__file__).parent / "certs" / "thawte_tls_rsa_ca_g1.pem").read_text()
    f = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
    f.write(Path(certifi.where()).read_text() + "\n" + extra)
    f.close()
    return f.name


def _con_cloudscraper(url: str, verify):
    try:
        import cloudscraper
    except ImportError:
        return None
    return cloudscraper.create_scraper().get(url, headers=HEADERS, timeout=TIMEOUT, verify=verify)


def descargar(url: str, pausa=time.sleep) -> str:
    """HTML de la ficha. Reintenta ante caídas de red; si la tienda bloquea, prueba con cloudscraper."""
    verify = _ca_mct() if tienda_de(url) == "mct" else True
    ultimo = "sin respuesta"
    for intento in range(INTENTOS):
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, verify=verify)
            tienda_de(r.url)  # si la tienda redirige a otro sitio no se lee (evita usar el servidor para consultar direcciones ajenas)
            if r.status_code in BLOQUEO:
                r = _con_cloudscraper(url, verify) or r
        except requests.RequestException as e:  # caída de conexión, timeout, TLS
            ultimo = f"sin conexión con la tienda ({type(e).__name__})"
        else:
            if r.status_code == 404:
                raise ErrorExtraccion("La ficha ya no existe en la tienda (404).")
            if r.status_code < 400:
                return r.text
            ultimo = f"la tienda respondió {r.status_code}"
        if intento < INTENTOS - 1:
            pausa(2 * (intento + 1))
    raise ErrorExtraccion(f"No se pudo abrir la ficha: {ultimo}.")


def _precio(valor) -> Decimal | None:
    try:
        p = Decimal(str(valor).strip())
    except (InvalidOperation, ValueError):
        digitos = re.sub(r"\D", "", str(valor))  # "$28.907" -> 28907
        p = Decimal(digitos) if digitos else None
    return p if p and p > 0 else None


def _productos_ld(html: str) -> list:
    out = []

    def visitar(o):
        if isinstance(o, list):
            for x in o:
                visitar(x)
        elif isinstance(o, dict):
            t = o.get("@type")
            if t == "Product" or (isinstance(t, list) and "Product" in t):
                out.append(o)
            for v in o.values():
                if isinstance(v, (dict, list)):
                    visitar(v)

    for s in BeautifulSoup(html, "html.parser").find_all("script", type="application/ld+json"):
        try:
            visitar(json.loads(s.string or s.get_text()))
        except ValueError:
            continue  # un bloque JSON-LD roto no invalida los demás
    return out


def parsear_json_ld(html: str) -> dict:
    """Producto y precio de lista del JSON-LD de la ficha (Easy, Sodimac)."""
    for p in _productos_ld(html):
        ofertas = p.get("offers") or []
        for o in ofertas if isinstance(ofertas, list) else [ofertas]:
            precio = _precio(o.get("price", o.get("lowPrice"))) if isinstance(o, dict) else None
            if precio:
                return {"nombre": html_lib.unescape((p.get("name") or p.get("description") or "").strip()),
                        "sku": str(p.get("sku") or p.get("productID") or ""), "precio": precio}
    raise ErrorExtraccion("La ficha no publica un precio (puede estar agotada o haber cambiado de formato).")


def parsear_mct(html: str, url: str = "") -> dict:
    """Ficha de mct.cl: nombre en el <h1> y precio vigente en span.precioOfertaFicha."""
    soup = BeautifulSoup(html, "html.parser")
    precio = soup.select_one("span.precioOfertaFicha")
    nombre = soup.select_one("h1")
    if not precio or not _precio(precio.get_text()):
        raise ErrorExtraccion("La ficha de MCT no muestra un precio (puede estar agotada o haber cambiado de formato).")
    m = re.search(r"/ficha/(\d+)", url)
    return {"nombre": nombre.get_text(strip=True) if nombre else "", "sku": m.group(1) if m else "",
            "precio": _precio(precio.get_text())}


def _precio_meta(valor) -> Decimal | None:
    """Precio de un metadato HTML. Entiende '13190.0', '28.907' (miles chilenos) y '28,907.00' (miles con coma)."""
    s = str(valor or "").strip().replace("$", "").strip()
    if re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", s):
        s = s.replace(".", "").split(",")[0]
    elif re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", s):
        s = s.replace(",", "")
    return _precio(s)


def parsear_meta(html: str) -> dict:
    """Ficha de tiendas Jumpseller (Ferrelan): el precio vigente va en los metadatos `product:price:amount` y el
    nombre en `og:title`; `og:id` es el código interno del producto (sirve como SKU)."""
    soup = BeautifulSoup(html, "html.parser")

    def meta(*claves):
        for c in claves:
            tag = soup.find("meta", attrs={"property": c}) or soup.find("meta", attrs={"name": c}) \
                or soup.find("meta", attrs={"itemprop": c})
            if tag and tag.get("content"):
                return tag["content"].strip()
        return ""

    precio = _precio_meta(meta("product:price:amount", "og:price:amount"))
    if not precio:
        raise ErrorExtraccion("La ficha no muestra un precio legible (¿producto sin precio o agotado?).")
    h1 = soup.select_one("h1")
    nombre = meta("og:title") or (h1.get_text(strip=True) if h1 else "")
    return {"nombre": html_lib.unescape(nombre), "sku": meta("product:retailer_item_id", "og:id"), "precio": precio}


def extraer(url: str) -> dict:
    """{'nombre', 'sku', 'precio'(Decimal CLP)} de la ficha. Lanza ErrorExtraccion con un mensaje claro."""
    tienda = tienda_de(url)
    html = descargar(url)
    if tienda == "mct":
        return parsear_mct(html, url)
    if tienda == "ferrelan":
        return parsear_meta(html)
    return parsear_json_ld(html)
