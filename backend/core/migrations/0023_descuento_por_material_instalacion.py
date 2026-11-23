from decimal import Decimal

from django.db import migrations, models


def descuento_del_proveedor_al_material(apps, schema_editor):
    """El descuento deja de ser del proveedor y pasa a cada material: se copia a los materiales que no tenían uno propio."""
    Proveedor, Catalogo = apps.get_model("core", "Proveedor"), apps.get_model("core", "CatalogoTipo")
    for p in Proveedor.objects.filter(descuento_pct__gt=0):
        for it in Catalogo.objects.filter(proveedor=p, descuento_pct=0):
            it.descuento_pct = p.descuento_pct
            if it.precio_lista is not None:
                it.costo_neto = (it.precio_lista * (1 - p.descuento_pct / 100)).quantize(Decimal("0.01"))
            it.save(update_fields=["descuento_pct", "costo_neto"])


def tarifa_de_instalacion_vigente(apps, schema_editor):
    """Las cotizaciones ya emitidas conservan la tarifa de instalación que mostraban (la del catálogo hasta hoy)."""
    Detalle = apps.get_model("core", "DetalleCotizacionInsumo")
    filas = list(Detalle.objects.filter(es_adicional=True).select_related("catalogo_tipo"))
    for d in filas:
        d.mano_obra_m2 = d.catalogo_tipo.mano_obra_m2
    Detalle.objects.bulk_update(filas, ["mano_obra_m2"])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_catalogo_casas_orden_hitos'),
    ]

    operations = [
        migrations.RunPython(descuento_del_proveedor_al_material, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='proveedor',
            name='descuento_pct',
        ),
        migrations.AddField(
            model_name='detallecotizacioninsumo',
            name='mano_obra_m2',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.RunPython(tarifa_de_instalacion_vigente, migrations.RunPython.noop),
    ]
