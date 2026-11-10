import uuid

from django.db import migrations, models


def asignar_tokens(apps, schema_editor):
    Cotizacion = apps.get_model("core", "Cotizacion")
    for c in Cotizacion.objects.all():
        c.token_publico = uuid.uuid4()
        c.save(update_fields=["token_publico"])


class Migration(migrations.Migration):
    dependencies = [("core", "0007_cotizacion_ajuste_monto_cotizacion_ganancia_m2_and_more")]

    operations = [
        # 1) columna nullable, 2) un token distinto por cotización existente, 3) obligatoria y única
        migrations.AddField(model_name="cotizacion", name="token_publico", field=models.UUIDField(null=True, editable=False)),
        migrations.RunPython(asignar_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="cotizacion",
            name="token_publico",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
