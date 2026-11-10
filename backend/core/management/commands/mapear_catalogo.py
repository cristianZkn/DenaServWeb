from django.core.management.base import BaseCommand

from core.catalogo_mapeo import mapear


class Command(BaseCommand):
    help = ("Deja el catálogo con el mapeo 1 a 1 de fichas de tienda: desactiva precios de relleno y cubre las "
            "categorías obligatorias. Luego ejecute actualizar_precios_mercado para leer los precios. Es idempotente.")

    def handle(self, *args, **opts):
        self.stdout.write(str(mapear()))
