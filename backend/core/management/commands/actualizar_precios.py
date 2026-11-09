from django.core.management.base import BaseCommand

from core.precios import actualizar_precios


class Command(BaseCommand):
    help = "Actualiza los precios del catálogo desde Sodimac (Apify). Programar 1 vez por semana."

    def handle(self, *args, **opts):
        self.stdout.write(str(actualizar_precios()))
