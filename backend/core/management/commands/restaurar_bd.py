"""Restaura un respaldo hecho con respaldar_bd.

Uso:  python manage.py restaurar_bd respaldo.json.gz [--reemplazar]
Si la base ya tiene datos se niega, salvo con --reemplazar (que primero la vacía por completo)."""
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from core.models import Usuario


class Command(BaseCommand):
    help = "Restaura los datos desde un respaldo (.json.gz)."

    def add_arguments(self, parser):
        parser.add_argument("archivo")
        parser.add_argument("--reemplazar", action="store_true", help="Vacía la base antes de restaurar.")

    def handle(self, *args, **opts):
        if Usuario.objects.exists() and not opts["reemplazar"]:
            raise CommandError("La base ya tiene datos. Use --reemplazar para vaciarla y restaurar el respaldo.")
        if opts["reemplazar"]:
            call_command("flush", interactive=False)
        call_command("loaddata", opts["archivo"])
        self.stdout.write(self.style.SUCCESS("Respaldo restaurado."))
