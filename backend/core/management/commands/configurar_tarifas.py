"""Deja listos los datos que usan las cotizaciones por tarifas. Es idempotente: se puede ejecutar varias veces.

  python manage.py configurar_tarifas

1. Materiales «Smartside Lap» (OSB): se paga $2.000 por m² instalado a cada trabajador.
2. Proveedor Ferrelan (ferrelan.cl): queda registrado para elegirlo al agregar materiales.
"""
from django.core.management.base import BaseCommand

from core.models import CatalogoTipo, Proveedor

MANO_OBRA_OSB_LAP_M2 = 2000


class Command(BaseCommand):
    help = "Configura la mano de obra por m² del OSB Smartside Lap y registra al proveedor Ferrelan."

    def handle(self, *args, **opts):
        osb = CatalogoTipo.objects.filter(nombre__icontains="smartside lap", mano_obra_m2=0)
        n = osb.update(mano_obra_m2=MANO_OBRA_OSB_LAP_M2)
        prov, creado = Proveedor.objects.get_or_create(
            rut_empresa="FERRELAN-WEB",
            defaults={"razon_social": "Ferrelan", "contacto_nombre": "Ventas Ferrelan", "telefono": "+56977977083",
                      "email": "ventas@ferrelan.cl"})
        self.stdout.write(self.style.SUCCESS(
            f"OSB Smartside Lap con mano de obra por m²: {n} material(es) actualizado(s). "
            f"Proveedor Ferrelan: {'creado' if creado else 'ya existía'}."))
