from django.db import migrations

# Vistas SQL que alimentan los reportes y el dashboard (la lógica de agregación vive en la base, no se repite en cada consulta).
# Solo PostgreSQL (la base de producción); en otro motor no se crean y los reportes no están disponibles.
CREAR = [
    """
    CREATE OR REPLACE VIEW vista_cotizacion_resumen AS
    SELECT c.id AS cotizacion_id, c.codigo_cotizacion, c.cliente_nombre, c.estado, c.tipo_proyecto, c.superficie_m2,
           c.fecha_creacion, (c.fecha_creacion AT TIME ZONE 'America/Santiago')::date AS fecha_local,
           u.nombre_completo AS creado_por,
           c.costo_total,
           ROUND(c.costo_total / 1.19) AS neto,
           GREATEST(0, ROUND((c.costo_total - c.costo_materiales - c.costo_mano_obra - c.costo_flete - c.costo_nivelacion) / 1.19)) AS ganancia_neta,
           COALESCE(h.cobrado, 0) AS monto_cobrado,
           COALESCE(o.avance, 0) AS avance
    FROM cotizacion c
    JOIN usuario u ON u.id = c.usuario_id
    LEFT JOIN (SELECT cotizacion_id, SUM(monto_abonado) AS cobrado FROM hito_pago GROUP BY cotizacion_id) h ON h.cotizacion_id = c.id
    LEFT JOIN (SELECT cotizacion_id, MAX(porcentaje_avance_real) AS avance FROM obra_ejecucion GROUP BY cotizacion_id) o ON o.cotizacion_id = c.id
    """,
    """
    CREATE OR REPLACE VIEW vista_ganancia_trimestral AS
    SELECT EXTRACT(YEAR FROM fecha_local)::int AS anio, EXTRACT(QUARTER FROM fecha_local)::int AS trimestre, estado,
           COUNT(*) AS cotizaciones, SUM(neto) AS neto, SUM(ganancia_neta) AS ganancia_neta, SUM(monto_cobrado) AS monto_cobrado
    FROM vista_cotizacion_resumen
    GROUP BY 1, 2, 3
    """,
    """
    CREATE OR REPLACE VIEW vista_pagos_mensuales AS
    SELECT DATE_TRUNC('month', fecha)::date AS mes, metodo, COUNT(*) AS pagos, SUM(monto) AS monto
    FROM detalle_registros
    GROUP BY 1, 2
    """,
]
BORRAR = ["DROP VIEW IF EXISTS vista_pagos_mensuales", "DROP VIEW IF EXISTS vista_ganancia_trimestral", "DROP VIEW IF EXISTS vista_cotizacion_resumen"]


def _ejecutar(sentencias):
    def run(apps, schema_editor):
        if schema_editor.connection.vendor == "postgresql":
            for s in sentencias:
                schema_editor.execute(s)
    return run


class Migration(migrations.Migration):
    dependencies = [("core", "0026_restricciones_e_indices")]
    operations = [migrations.RunPython(_ejecutar(CREAR), _ejecutar(BORRAR))]
