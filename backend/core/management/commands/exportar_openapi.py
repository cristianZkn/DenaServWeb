"""Exporta el contrato OpenAPI de la API a un archivo JSON (por defecto docs/openapi.json). No usa la base de datos."""
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Guarda el contrato OpenAPI en docs/openapi.json."

    def add_arguments(self, parser):
        parser.add_argument("--salida", default=str(Path(settings.BASE_DIR).parent / "docs" / "openapi.json"))

    def handle(self, *args, salida, **opts):
        from config.urls import api
        esquema = api.get_openapi_schema()
        Path(salida).parent.mkdir(parents=True, exist_ok=True)
        Path(salida).write_text(json.dumps(esquema, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"{len(esquema['paths'])} rutas exportadas a {salida}"))
