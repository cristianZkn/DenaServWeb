"""Muestra qué entrega la CNE y qué precios de Copec en Los Ángeles se logran leer. Sirve para revisar el filtro por estación.

  python manage.py diagnosticar_combustibles
"""
import requests
from django.core.management.base import BaseCommand

from core import combustibles as c


class Command(BaseCommand):
    help = "Prueba la consulta de precios por estación (marca, comuna y región) a la CNE y muestra un resumen corto."
    requires_system_checks = []  # sin los avisos de Django: la salida debe ser corta

    def handle(self, *args, **opts):
        try:
            r = requests.get(c.URL_ESTACIONES, timeout=30, headers={"User-Agent": "Mozilla/5.0 DenaServ"})
            estaciones = c._lista_de_estaciones(r.json())
        except Exception as e:  # diagnóstico: se muestra cualquier fallo tal cual
            self.stdout.write(self.style.ERROR(f"No se pudo leer la lista de estaciones: {type(e).__name__}: {e}"))
            return
        dicts = [e for e in estaciones if isinstance(e, dict)]
        de_comuna = [e for e in dicts if c._es_de(e, ("comuna", "commune"), (c._norm(c.COMUNA),), exacto=True)]
        self.stdout.write(f"Estaciones: {len(dicts)} | en {c.COMUNA}: {len(de_comuna)}")
        # La CNE entrega la marca como número: se muestra cuántas estaciones tiene cada una y un ejemplo en la comuna.
        self.stdout.write(f"Marcas (número: estaciones en el país / en {c.COMUNA} / ejemplo de dirección en {c.COMUNA}):")
        for m, n in c.marcas_por_cantidad(dicts)[:8]:
            aqui = [e for e in de_comuna if str(e.get("marca")) == m]
            self.stdout.write(f"  marca {m}: {n} / {len(aqui)} / {aqui[0].get('direccion') if aqui else '-'}")
        usada = c.marca_id_de(dicts, c.MARCA)
        origen = "configurada con COMBUSTIBLE_MARCA_ID" if c.MARCA_ID else "la cadena con más estaciones del país (confírmela con una dirección)"
        self.stdout.write(f"Se usa como {c.MARCA}: marca {usada or '(por nombre)'} — {origen}")
        try:
            for tipo, (precio, lugar) in c.leer_estaciones().items():
                self.stdout.write(self.style.SUCCESS(f"  {c.TIPOS[tipo][1]}: ${precio} por litro ({lugar})"))
        except ValueError as e:
            self.stdout.write(self.style.WARNING(str(e)))
