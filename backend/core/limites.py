"""Límite de peticiones por visitante (protege el inicio de sesión y las rutas públicas de abusos y ráfagas)."""
import hmac

from django.conf import settings
from ninja.throttling import SimpleRateThrottle


def ip_del_visitante(request) -> str:
    """La IP real del visitante. Detrás de Vercel y Render la IP de la conexión es la de los servidores intermedios, así que
    el proxy de Next.js informa la del visitante en `X-Client-IP` junto con una clave compartida (`X-Proxy-Secret`).
    Sin la clave correcta ese encabezado se ignora, para que nadie pueda hacerse pasar por otra IP."""
    clave = request.META.get("HTTP_X_PROXY_SECRET", "")
    if settings.PROXY_SECRET and clave and hmac.compare_digest(clave.encode(), settings.PROXY_SECRET.encode()):
        ip = request.META.get("HTTP_X_CLIENT_IP", "").strip()
        if ip:
            return ip
    return request.META.get("REMOTE_ADDR", "")


class IpRateThrottle(SimpleRateThrottle):
    """Máximo de peticiones por minuto desde una misma IP (p. ej. IpRateThrottle("10/m"))."""
    scope = "ip"

    def get_cache_key(self, request):
        return f"throttle_ip_{self.rate}_{ip_del_visitante(request)}"
