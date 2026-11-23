from django.core.management.base import BaseCommand

from core.models import CatalogoTipo
from core.precios import unidad_sugerida


class Command(BaseCommand):
    help = ("Asigna a cada material su unidad de medida (saco, bolsa, caja, rollo, plancha, galón o unidad) según su nombre. "
            "No toca los revestimientos que se cotizan por m². Es repetible. Con --simular solo muestra lo que cambiaría.")

    def add_arguments(self, parser):
        parser.add_argument("--simular", action="store_true")

    def handle(self, *args, simular, **opts):
        cambios = 0
        for it in CatalogoTipo.objects.order_by("categoria", "nombre"):
            if it.unidad_medida.upper() == "M2" or it.m2_por_unidad:
                continue  # cotizados por m²
            nueva = unidad_sugerida(it.nombre)
            if nueva != it.unidad_medida:
                self.stdout.write(f"{it.nombre[:60]:60} {it.unidad_medida} -> {nueva}")
                cambios += 1
                if not simular:
                    CatalogoTipo.objects.filter(id=it.id).update(unidad_medida=nueva)
        self.stdout.write(f"Unidades {'por cambiar' if simular else 'actualizadas'}: {cambios}")
