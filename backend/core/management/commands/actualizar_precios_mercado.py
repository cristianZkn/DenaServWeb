from django.core.management.base import BaseCommand, CommandError

from core.precios import actualizar_precios_mercado


class Command(BaseCommand):
    help = ("Lee el precio de la ficha de cada producto del catálogo (Easy, Sodimac, MCT) y actualiza lista, descuento "
            "y costo neto. Se programa 1 vez por semana (ver .github/workflows/precios-semanales.yml).")

    def handle(self, *args, **opts):
        r = actualizar_precios_mercado()
        self.stdout.write(
            f"Revisados {r['revisados']}: {r['actualizados']} con precio nuevo, {r['sin_cambio']} sin cambio, "
            f"{len(r['errores'])} con error, {len(r['a_revisar'])} por revisar.")
        for e in r["errores"] + r["a_revisar"]:
            self.stderr.write(f"  - {e['nombre']}: {e['error']}")
        for g in r["grupos_sin_cobertura"]:
            self.stderr.write(f"  ! Sin producto verificado en la categoría obligatoria: {g['nombre']}")
        if r["errores"] or r["a_revisar"] or r["grupos_sin_cobertura"]:
            raise CommandError("La actualización terminó con pendientes.")  # código de salida != 0 para que el cron avise
