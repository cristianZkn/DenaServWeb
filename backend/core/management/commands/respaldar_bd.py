"""Respaldo de todos los datos de la aplicación en un archivo comprimido (.json.gz), sin necesitar pg_dump.

Uso:  python manage.py respaldar_bd [--salida respaldo.json.gz]
Guarda las tablas de `core` (incluye fotos y comprobantes). El archivo contiene datos de clientes: no se sube al repositorio."""
from datetime import datetime

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Guarda un respaldo comprimido de los datos (restaurar con restaurar_bd)."

    def add_arguments(self, parser):
        parser.add_argument("--salida", default=f"respaldo-{datetime.now():%Y%m%d-%H%M}.json.gz")

    def handle(self, *args, **opts):
        call_command("dumpdata", "core", output=opts["salida"], indent=None)
        self.stdout.write(self.style.SUCCESS(f"Respaldo guardado en {opts['salida']}"))
